// 觅食:菜系关键词 + 城市 → 餐馆列表。默认走本地缓存(零成本);
// 仅当 MONID_LIVE=1 时真实调用 monid(每次约 $0.09);再不行回退夹具,永不空手。

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataSource, Restaurant } from '../types.js';

const execFileP = promisify(execFile);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = path.join(root, 'cache');
const FIXTURE = path.join(root, 'fixtures', 'chengdu_hotpot.json');
const MAX_RESULTS = 6;

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

const cacheKey = (city: string, cuisine: string): string =>
  crypto.createHash('md5').update(`${city}|${cuisine}`).digest('hex');

function extractItems(raw: unknown): RawPlace[] {
  if (Array.isArray(raw)) return raw as RawPlace[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['data', 'results', 'items']) {
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

async function readCache(key: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${key}.json`), 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function liveScrape(city: string, cuisine: string): Promise<unknown> {
  const body = JSON.stringify({ query: cuisine, location: city, language: 'zh-cn', max_results: MAX_RESULTS });
  const { stdout } = await execFileP(
    'monid',
    ['run', '-p', 'apify', '-e', '/damilo/google-maps-scraper', '-i', body, '-w', '90', '-j'],
    { env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 10 * 1024 * 1024 },
  );
  const start = stdout.indexOf('{');
  const data = JSON.parse(stdout.slice(start)) as unknown;
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${cacheKey(city, cuisine)}.json`), JSON.stringify(data));
  return data;
}

export async function forage(
  city: string,
  cuisine: string,
  userLat?: number | null,
  userLng?: number | null,
): Promise<{ restaurants: Restaurant[]; source: DataSource }> {
  let raw = await readCache(cacheKey(city, cuisine));
  let source: DataSource = 'cache';

  if (!raw && process.env.MONID_LIVE === '1') {
    raw = await liveScrape(city, cuisine);
    source = 'live';
  }
  if (!raw) {
    raw = JSON.parse(await fs.readFile(FIXTURE, 'utf8')) as unknown;
    source = 'fixture';
  }

  const restaurants = normalize(extractItems(raw), userLat, userLng)
    .filter((r) => r.name)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, MAX_RESULTS);
  return { restaurants, source };
}
