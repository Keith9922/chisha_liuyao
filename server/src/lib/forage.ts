// 觅食:菜系关键词 + 城市 → 真实附近餐馆。
// 生产走 monid HTTP API(api.monid.ai/v1/run + 轮询 /v1/runs/:id,Bearer MONID_API_KEY),无需 CLI。
// 缓存优先(同 城市|菜系 命中即免费)。配置了 key 时真实为空也返回空——绝不用异地夹具冒充,保证准确。
// 未配置 key(本地开发)时回退内置夹具,便于离线调 UI。

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataSource, Restaurant } from '../types.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = path.join(root, 'cache');
const FIXTURE = path.join(root, 'fixtures', 'chengdu_hotpot.json');
const MAX_RESULTS = 6;

const API_BASE = process.env.MONID_API_BASE || 'https://api.monid.ai';
const PROVIDER = 'apify';
const ENDPOINT = '/damilo/google-maps-scraper';

interface RawPlace {
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingCount?: number;
  type?: string;
  types?: string[];
  phoneNumber?: string;
  thumbnailUrl?: string;
}
interface RunCreateResponse {
  runId: string;
  status: string;
}
interface RunStatusResponse {
  status: string;
  output?: RawPlace[];
}

const cacheKey = (city: string, cuisine: string): string =>
  crypto.createHash('md5').update(`${city}|${cuisine}`).digest('hex');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function extractItems(raw: unknown): RawPlace[] {
  if (Array.isArray(raw)) return raw as RawPlace[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['output', 'data', 'results', 'items']) {
      if (Array.isArray(obj[key])) return obj[key] as RawPlace[];
    }
    const firstArr = Object.values(obj).find((v) => Array.isArray(v));
    if (firstArr) return firstArr as RawPlace[];
  }
  return [];
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalize(items: RawPlace[], userLat?: number | null, userLng?: number | null): Restaurant[] {
  return items.map((r) => {
    const lat = r.latitude ?? null;
    const lng = r.longitude ?? null;
    const distance =
      userLat != null && userLng != null && lat != null && lng != null
        ? haversine(userLat, userLng, lat, lng)
        : null;
    return {
      name: r.title ?? '',
      rating: r.rating ?? null,
      ratingCount: r.ratingCount ?? 0,
      type: r.type || r.types?.[0] || '',
      address: r.address ?? '',
      phone: r.phoneNumber ?? null,
      thumbnail: r.thumbnailUrl ?? null,
      lat,
      lng,
      distance,
    };
  });
}

async function readCache(key: string): Promise<RawPlace[] | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8')) as RawPlace[];
  } catch {
    return null;
  }
}

async function writeCache(key: string, items: RawPlace[]): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(items));
  } catch {
    /* 缓存写失败不致命 */
  }
}

// 真实 HTTP 拉取:POST /v1/run → 轮询 /v1/runs/:id → output。失败/超时返回 null。
async function fetchLive(city: string, cuisine: string, apiKey: string): Promise<RawPlace[] | null> {
  const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
  try {
    const createRes = await fetch(`${API_BASE}/v1/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: PROVIDER,
        endpoint: ENDPOINT,
        input: { query: cuisine, location: city, language: 'zh-cn', max_results: MAX_RESULTS },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!createRes.ok) throw new Error(`monid run ${createRes.status}`);
    const { runId } = (await createRes.json()) as RunCreateResponse;
    if (!runId) throw new Error('no runId');

    for (let i = 0; i < 18; i++) {
      await sleep(5000);
      const statusRes = await fetch(`${API_BASE}/v1/runs/${runId}`, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (!statusRes.ok) continue;
      const run = (await statusRes.json()) as RunStatusResponse;
      if (run.status === 'COMPLETED') return extractItems(run.output ?? []);
      if (run.status === 'FAILED') return null;
    }
    return null; // 超时
  } catch (e) {
    console.error('[forage] monid live error:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function forage(
  city: string,
  cuisine: string,
  userLat?: number | null,
  userLng?: number | null,
): Promise<{ restaurants: Restaurant[]; source: DataSource }> {
  const key = cacheKey(city, cuisine);
  const apiKey = process.env.MONID_API_KEY;

  let items = await readCache(key);
  let source: DataSource = 'cache';

  if (!items) {
    if (apiKey) {
      // 生产:真实拉取。为空/失败也不用异地夹具冒充。
      items = await fetchLive(city, cuisine, apiKey);
      source = 'live';
      if (items) await writeCache(key, items);
      else items = [];
    } else {
      // 本地无 key:回退内置夹具,便于离线开发。
      items = JSON.parse(await fs.readFile(FIXTURE, 'utf8')) as RawPlace[];
      source = 'fixture';
    }
  }

  const restaurants = normalize(items, userLat, userLng)
    .filter((r) => r.name)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, MAX_RESULTS);
  return { restaurants, source };
}
