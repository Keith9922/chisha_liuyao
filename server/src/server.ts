import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { castHexagram, isYaoValue } from './lib/liuyao.js';
import { resolveCity } from './lib/geo.js';
import { forage } from './lib/forage.js';
import { fetchNotes } from './lib/social.js';
import { chooseCuisine, interpret } from './lib/interpret.js';
import type { DivineRequest, DivineResponse, YaoValue } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');

const app = express();
app.use(express.json());

interface ValidInput {
  lines?: YaoValue[];
  preference?: string;
  lat: number | null;
  lng: number | null;
  city?: string;
}
type ValidationError = { error: string; message: string };

// 边界校验:无定位且无城市 → 拦截;卦数据格式非法 → 拦截。
function validate(body: DivineRequest): ValidInput | ValidationError {
  const lat = typeof body.lat === 'number' && Number.isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && Number.isFinite(body.lng) ? body.lng : null;
  const city = typeof body.city === 'string' && body.city.trim() ? body.city.trim() : undefined;

  if ((lat == null || lng == null) && !city) {
    return { error: 'NEED_LOCATION', message: '需要定位或城市才能为你寻味,请授权定位或填写城市。' };
  }
  if (body.lines !== undefined) {
    if (!Array.isArray(body.lines) || body.lines.length !== 6 || !body.lines.every(isYaoValue)) {
      return { error: 'INVALID_LINES', message: '卦象数据非法:需 6 个爻,取值为 6/7/8/9。' };
    }
  }
  const preference = typeof body.preference === 'string' ? body.preference.trim() : undefined;
  return { lines: body.lines, preference, lat, lng, city };
}

app.post('/api/divine', async (req, res) => {
  try {
    const v = validate((req.body ?? {}) as DivineRequest);
    if ('error' in v) {
      res.status(400).json(v);
      return;
    }

    const hex = castHexagram(v.lines);

    const [cuisinePick, city] = await Promise.all([
      chooseCuisine(hex, v.preference),
      resolveCity(v.lat, v.lng, v.city),
    ]);

    const { restaurants, source } = await forage(city, cuisinePick.cuisine, v.lat, v.lng);
    const [reading, social] = await Promise.all([
      interpret({
        hex,
        preference: v.preference,
        restaurants,
        eatHint: cuisinePick.eat,
        avoidHint: cuisinePick.avoid,
      }),
      fetchNotes(city, cuisinePick.cuisine),
    ]);

    const chosen = restaurants.find((r) => r.name === reading.chosenName) ?? restaurants[0] ?? null;

    const payload: DivineResponse = {
      hexagram: hex,
      city,
      cuisine: cuisinePick.cuisine,
      cuisineReason: cuisinePick.reason || null,
      fortune: reading.fortune,
      eat: reading.eat,
      avoid: reading.avoid,
      blessing: reading.blessing,
      dish: reading.dish,
      chosen,
      restaurants,
      notes: social.notes,
      noteKeyword: social.keyword,
      meta: {
        source,
        socialSource: social.source,
        llmCuisineFallback: cuisinePick.fallback,
        llmReadFallback: reading.fallback,
        llmError: reading.error,
      },
    };
    res.json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL', message: e instanceof Error ? e.message : String(e) });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// 生产环境:托管已构建的前端
app.use(express.static(WEB_DIST));
app.get('*', (_req, res) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`吃啥六爻 → http://localhost:${PORT}`);
});
