// 社交口碑:小红书笔记(经 MONID → TikHub)。让"天选餐馆"旁边能看到"网友怎么说"。
// 缓存优先(同关键词命中即免费)。配置了 key 且 MONID_SOCIAL_LIVE=1 时才真实抓取(每次约 $0.015)。
// 否则回退内置夹具(成都火锅真实笔记),便于离线调 UI、零花费。

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SocialNote, SocialSource } from '../types.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = path.join(root, 'cache', 'social');
const FIXTURE = path.join(root, 'fixtures', 'xhs_chengdu_hotpot.json');
const MAX_NOTES = 8;

const API_BASE = process.env.MONID_API_BASE || 'https://api.monid.ai';
const PROVIDER = 'tikhub';
const ENDPOINT = '/api/v1/xiaohongshu/app_v2/search_notes';

// 夹具/抓取后归一化的中间结构(与 fixtures/xhs_*.json 一致)
interface RawNote {
  id?: string;
  xsec_token?: string;
  title?: string;
  desc?: string;
  cover?: string;
  likedCount?: number | null;
  collectedCount?: number | null;
  commentsCount?: number | null;
  author?: string;
  authorAvatar?: string;
}

interface RunCreateResponse {
  runId: string;
  status: string;
}
interface RunStatusResponse {
  status: string;
  output?: unknown;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const cacheKey = (keyword: string): string => crypto.createHash('md5').update(keyword).digest('hex');

// 小红书笔记详情页(带 xsec_token 才能直达 app/web)
function noteUrl(id: string, token: string): string {
  if (!id) return '';
  const q = token ? `?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_search` : '';
  return `https://www.xiaohongshu.com/explore/${id}${q}`;
}

// 从 tikhub 原始响应里挖出 note 列表并归一化为 RawNote[]
function extractRawNotes(output: unknown): RawNote[] {
  const obj = output as { data?: { items?: unknown[] } } | undefined;
  const items = Array.isArray(obj?.data?.items) ? obj!.data!.items! : [];
  const out: RawNote[] = [];
  for (const it of items) {
    const n = (it as { note?: Record<string, unknown> }).note;
    if (!n || typeof n !== 'object') continue;
    const title = typeof n.title === 'string' ? n.title.trim() : '';
    const desc = typeof n.desc === 'string' ? n.desc.trim() : '';
    if (!title && !desc) continue;
    const imgs = Array.isArray(n.images_list) ? (n.images_list as Record<string, unknown>[]) : [];
    const first = imgs[0] ?? {};
    const cover =
      (typeof first.url === 'string' && first.url) ||
      (typeof first.url_size_large === 'string' && first.url_size_large) ||
      '';
    const user = (n.user as Record<string, unknown>) ?? {};
    out.push({
      id: typeof n.id === 'string' ? n.id : '',
      xsec_token: typeof n.xsec_token === 'string' ? n.xsec_token : '',
      title,
      desc,
      cover: cover || '',
      likedCount: typeof n.liked_count === 'number' ? n.liked_count : null,
      collectedCount: typeof n.collected_count === 'number' ? n.collected_count : null,
      commentsCount: typeof n.comments_count === 'number' ? n.comments_count : null,
      author: typeof user.nickname === 'string' ? user.nickname : '',
      authorAvatar: typeof user.images === 'string' ? user.images : '',
    });
  }
  return out;
}

function normalize(raw: RawNote[]): SocialNote[] {
  return raw
    .filter((n) => (n.title || n.desc))
    .slice(0, MAX_NOTES)
    .map((n) => ({
      id: n.id ?? '',
      url: noteUrl(n.id ?? '', n.xsec_token ?? ''),
      title: n.title ?? '',
      desc: n.desc ?? '',
      cover: n.cover || null,
      likedCount: n.likedCount ?? null,
      collectedCount: n.collectedCount ?? null,
      commentsCount: n.commentsCount ?? null,
      author: n.author ?? '',
      authorAvatar: n.authorAvatar || null,
    }));
}

async function readCache(key: string): Promise<RawNote[] | null> {
  try {
    const arr = JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8')) as RawNote[];
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}
async function writeCache(key: string, items: RawNote[]): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(items));
  } catch {
    /* 缓存写失败不致命 */
  }
}

// 真实抓取:POST /v1/run(input.queryParams) → 轮询 /v1/runs/:id → output。失败返回 null。
async function fetchLive(keyword: string, apiKey: string): Promise<RawNote[] | null> {
  const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
  try {
    const createRes = await fetch(`${API_BASE}/v1/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: PROVIDER,
        endpoint: ENDPOINT,
        input: { queryParams: { keyword, page: 1, sort_type: 'popularity_descending' } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!createRes.ok) throw new Error(`monid social run ${createRes.status}`);
    const { runId } = (await createRes.json()) as RunCreateResponse;
    if (!runId) throw new Error('no runId');

    for (let i = 0; i < 12; i++) {
      await sleep(4000);
      const statusRes = await fetch(`${API_BASE}/v1/runs/${runId}`, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!statusRes.ok) continue;
      const run = (await statusRes.json()) as RunStatusResponse;
      if (run.status === 'COMPLETED') return extractRawNotes(run.output);
      if (run.status === 'FAILED') return null;
    }
    return null;
  } catch (e) {
    console.error('[social] monid live error:', e instanceof Error ? e.message : e);
    return null;
  }
}

// 关键词:城市 + 菜系 + 推荐,贴合用户此刻的卦食方向
export function buildKeyword(city: string, cuisine: string): string {
  const c = city.replace(/(省|市|区|县|自治州|自治区)$/u, '') || city;
  return `${c} ${cuisine} 推荐`.trim();
}

export async function fetchNotes(
  city: string,
  cuisine: string,
): Promise<{ notes: SocialNote[]; keyword: string; source: SocialSource }> {
  const keyword = buildKeyword(city, cuisine);
  const key = cacheKey(keyword);
  const apiKey = process.env.MONID_API_KEY;
  const live = process.env.MONID_SOCIAL_LIVE === '1';

  let items = await readCache(key);
  let source: SocialSource = 'cache';

  if (!items) {
    if (apiKey && live) {
      const fetched = await fetchLive(keyword, apiKey);
      source = 'live';
      if (fetched?.length) await writeCache(key, fetched);
      items = fetched ?? [];
    } else {
      // 离线/未开实时:回退内置夹具,保证 UI 永不空手。
      try {
        items = JSON.parse(await fs.readFile(FIXTURE, 'utf8')) as RawNote[];
        source = 'fixture';
      } catch {
        items = [];
        source = 'none';
      }
    }
  }

  return { notes: normalize(items ?? []), keyword, source };
}
