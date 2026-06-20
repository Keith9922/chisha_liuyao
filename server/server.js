import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { castHexagram } from './lib/liuyao.js';
import { resolveCity } from './lib/geo.js';
import { forage } from './lib/forage.js';
import { chooseCuisine, interpret } from './lib/interpret.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 核心：起卦 → 定位 → 觅食 → 解卦
app.post('/api/divine', async (req, res) => {
  try {
    const { lines, preference, lat, lng, city: fallbackCity } = req.body || {};

    const hex = castHexagram(lines);

    // 卦象 → 菜系(纯 LLM 决定吃什么) 与 定位 并行
    const [cuisinePick, city] = await Promise.all([
      chooseCuisine(hex, preference),
      resolveCity(lat, lng, fallbackCity),
    ]);
    const cuisine = cuisinePick.cuisine;

    const { restaurants, source } = await forage(city, cuisine, lat, lng);
    const reading = await interpret({
      hex, preference, restaurants,
      eatHint: cuisinePick.eat, avoidHint: cuisinePick.avoid,
    });

    const chosen = restaurants.find((r) => r.name === reading.chosenName) || restaurants[0];

    res.json({
      hexagram: hex,
      city,
      cuisine,
      cuisineReason: cuisinePick.reason || null,
      fortune: reading.fortune,
      eat: reading.eat,
      avoid: reading.avoid,
      blessing: reading.blessing,
      dish: reading.dish,
      chosen,
      restaurants,
      meta: {
        source,
        llmCuisineFallback: !!cuisinePick._fallback,
        llmReadFallback: !!reading._fallback,
        llmError: reading._error || null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`吃啥六爻 running → http://localhost:${PORT}`));
