// 六爻起卦 + 组装完整卦象。三枚铜钱摇六次(下→上),老阴(6)老阳(9)为动爻。
import { HEXAGRAMS, TRIGRAMS, WINGS, nameOf } from './data.js';
import { positionAnalysis, correspondence, chengCheng, huGua, cuoGua, zongGua } from './guaAnalysis.js';
import type { Hexagram, HexInfo, TrigramInfo, YaoValue } from '../types.js';

const tossLine = (rng: () => number): YaoValue =>
  ([0, 0, 0].reduce((s) => s + (rng() < 0.5 ? 2 : 3), 0)) as YaoValue;

const isYang = (v: YaoValue): boolean => v === 7 || v === 9;
const isMoving = (v: YaoValue): boolean => v === 6 || v === 9;
const isYaoValue = (v: unknown): v is YaoValue => v === 6 || v === 7 || v === 8 || v === 9;

function trigramInfo(bits3: string): TrigramInfo {
  const t = TRIGRAMS[bits3];
  return {
    name: t?.name ?? '?',
    symbol: t?.symbol ?? '',
    element: t?.element ?? '',
    attribute: t?.attribute ?? '',
    associations: t?.associations ?? '',
  };
}

function hexInfo(binary: string): HexInfo {
  const h = HEXAGRAMS[binary];
  const w = WINGS[binary];
  return {
    binary,
    num: h?.num ?? 0,
    name: h?.name ?? '?',
    pinyin: h?.pinyin ?? '',
    symbol: h?.symbol ?? '',
    judgment: h?.judgment ?? '',
    lines: h?.lines ?? [],
    tuan: w?.tuan ?? '',
    daXiang: w?.da_xiang ?? '',
    lower: trigramInfo(binary.slice(0, 3)),
    upper: trigramInfo(binary.slice(3, 6)),
  };
}

// lines: 长度6的 6/7/8/9 数组(下→上)。前端传真实摇卦结果,否则内部随机。
export function castHexagram(lines?: YaoValue[], rng: () => number = Math.random): Hexagram {
  const yaos: YaoValue[] =
    Array.isArray(lines) && lines.length === 6 && lines.every(isYaoValue)
      ? lines
      : Array.from({ length: 6 }, () => tossLine(rng));

  const benBits = yaos.map((v) => (isYang(v) ? '1' : '0')).join('');
  const movingIdx = yaos.map((v, i) => (isMoving(v) ? i : -1)).filter((i) => i >= 0);
  const bianBits = yaos
    .map((v) => (isMoving(v) ? (isYang(v) ? '0' : '1') : isYang(v) ? '1' : '0'))
    .join('');

  const ben = hexInfo(benBits);
  const bian = movingIdx.length ? hexInfo(bianBits) : null;

  return {
    lines: yaos,
    yinyang: benBits.split('').map(Number),
    movingLines: movingIdx.map((i) => i + 1),
    movingTexts: movingIdx.map((i) => ben.lines[i]).filter((t): t is string => Boolean(t)),
    ben,
    bian,
    summary: bian ? `${ben.name}之${bian.name}` : ben.name,
    derived: {
      hu: { binary: huGua(benBits), name: nameOf(huGua(benBits)) },
      cuo: { binary: cuoGua(benBits), name: nameOf(cuoGua(benBits)) },
      zong: { binary: zongGua(benBits), name: nameOf(zongGua(benBits)) },
    },
    structure: {
      positions: positionAnalysis(benBits),
      correspondences: correspondence(benBits),
      neighbors: chengCheng(benBits),
    },
  };
}
