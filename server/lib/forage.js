// 觅食：菜系关键词 + 城市 → 餐馆列表。
// 默认走本地缓存(零成本)。仅当 MONID_LIVE=1 时才真实调用 monid(每次约 $0.09)。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'chengdu_hotpot.json');

const cacheKey = (city, cuisine) =>
  crypto.createHash('md5').update(`${city}|${cuisine}`).digest('hex');

function extractItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.items)) return raw.items;
  const firstArr = Object.values(raw || {}).find((v) => Array.isArray(v));
  return firstArr || [];
}

// 统一成前端要的字段，并算与用户的距离
function normalize(items, userLat, userLng) {
  return items.map((r) => {
    const lat = r.latitude, lng = r.longitude;
    let distance = null;
    if (userLat != null && lat != null) {
      const toRad = (d) => (d * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad(lat - userLat), dLng = toRad(lng - userLng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(userLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
      distance = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }
    return {
      name: r.title,
      rating: r.rating ?? null,
      ratingCount: r.ratingCount ?? 0,
      type: r.type || (r.types && r.types[0]) || '',
      address: r.address || '',
      phone: r.phoneNumber || null,
      thumbnail: r.thumbnailUrl || null,
      lat, lng,
      distance, // 米，可能为 null
    };
  });
}

async function readCache(key) {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function liveScrape(city, cuisine) {
  const body = JSON.stringify({
    query: cuisine, location: city, language: 'zh-cn', max_results: 6,
  });
  const { stdout } = await execFileP(
    'monid',
    ['run', '-p', 'apify', '-e', '/damilo/google-maps-scraper', '-i', body, '-w', '90', '-j'],
    { env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 10 * 1024 * 1024 },
  );
  // monid -j 输出里取最后一个 JSON 块
  const start = stdout.indexOf('{');
  const data = JSON.parse(stdout.slice(start));
  await fs.writeFile(path.join(CACHE_DIR, `${cacheKey(city, cuisine)}.json`), JSON.stringify(data));
  return data;
}

// 返回 { restaurants, source }，最多 6 家，按评分降序
export async function forage(city, cuisine, userLat, userLng) {
  const key = cacheKey(city, cuisine);
  let raw = await readCache(key);
  let source = 'cache';

  if (!raw && process.env.MONID_LIVE === '1') {
    raw = await liveScrape(city, cuisine);
    source = 'live';
  }
  if (!raw) {
    raw = JSON.parse(await fs.readFile(FIXTURE, 'utf8')); // 兜底：永不空手
    source = 'fixture';
  }

  const list = normalize(extractItems(raw), userLat, userLng)
    .filter((r) => r.name)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6);
  return { restaurants: list, source };
}
