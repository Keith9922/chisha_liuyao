// 六爻起卦 + 组装完整卦象信息。
// 起卦：三枚铜钱摇六次(下→上)，老阴老阳为动爻。
// 卦象数据(卦辞/爻辞/彖象/八卦象意)移植自 Qliuyao。

import { HEXAGRAMS, TRIGRAMS, WINGS, nameOf } from './data.js';
import { fullAnalysis } from './guaAnalysis.js';

function tossLine(rng) {
  return [0, 0, 0].reduce((s) => s + (rng() < 0.5 ? 2 : 3), 0); // 6/7/8/9
}
const isYang = (v) => v === 7 || v === 9;
const isMoving = (v) => v === 6 || v === 9;

// 八卦象意(下→上 3 位)
function trigramInfo(bits3) {
  const t = TRIGRAMS[bits3] || {};
  return { name: t.name, symbol: t.symbol, element: t.element, attribute: t.attribute, associations: t.associations };
}

function hexInfo(bin) {
  const h = HEXAGRAMS[bin] || {};
  const w = WINGS[bin] || {};
  return {
    binary: bin,
    num: h.num, name: h.name, pinyin: h.pinyin, symbol: h.symbol,
    judgment: h.judgment,        // 卦辞
    lines: h.lines || [],        // 六爻爻辞
    tuan: w.tuan,                // 彖传
    daXiang: w.da_xiang,         // 大象传
    lower: trigramInfo(bin.slice(0, 3)),
    upper: trigramInfo(bin.slice(3, 6)),
  };
}

// lines: 长度6的 6/7/8/9 数组(下→上)。前端有真实摇卦结果时传入，否则内部随机。
export function castHexagram(lines, rng = Math.random) {
  if (!Array.isArray(lines) || lines.length !== 6) {
    lines = Array.from({ length: 6 }, () => tossLine(rng));
  }
  const benBits = lines.map((v) => (isYang(v) ? '1' : '0')).join('');
  const movingIdx = lines.map((v, i) => (isMoving(v) ? i : -1)).filter((i) => i >= 0);
  const bianBits = lines.map((v) => (isMoving(v) ? (isYang(v) ? '0' : '1') : isYang(v) ? '1' : '0')).join('');

  const ben = hexInfo(benBits);
  const bian = movingIdx.length ? hexInfo(bianBits) : null;
  const analysis = fullAnalysis(benBits);

  return {
    lines,
    yinyang: benBits.split('').map(Number), // 1阳0阴，下→上，前端画爻线
    movingLines: movingIdx.map((i) => i + 1), // 动爻爻位(1-6)
    movingTexts: movingIdx.map((i) => ben.lines[i]).filter(Boolean), // 动爻爻辞
    ben,
    bian,
    summary: bian ? `${ben.name}之${bian.name}` : ben.name,
    derived: { // 互错综(名+二进制)
      hu: { binary: analysis.huGua, name: nameOf(analysis.huGua) },
      cuo: { binary: analysis.cuoGua, name: nameOf(analysis.cuoGua) },
      zong: { binary: analysis.zongGua, name: nameOf(analysis.zongGua) },
    },
    structure: { // 当位/应位/承乘
      positions: analysis.positions,
      correspondences: analysis.correspondences,
      neighbors: analysis.neighbors,
    },
  };
}
