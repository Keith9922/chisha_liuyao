// 卦象结构分析 —— 互/错/综卦 + 当位/中正/应位/承乘。纯函数,输入 6 位 0/1 串(下→上)。
import type { PositionInfo, RelationInfo } from '../types.js';

export const huGua = (b: string): string => b[1]! + b[2]! + b[3]! + b[2]! + b[3]! + b[4]!;
export const cuoGua = (b: string): string =>
  b.split('').map((c) => (c === '1' ? '0' : '1')).join('');
export const zongGua = (b: string): string => b.split('').reverse().join('');

const POS_IS_YANG = [true, false, true, false, true, false];
const POS_NAME = ['初', '二', '三', '四', '五', '上'];

function label(idx: number, isYang: boolean): string {
  if (idx === 0) return isYang ? '初九' : '初六';
  if (idx === 5) return isYang ? '上九' : '上六';
  return (isYang ? '九' : '六') + POS_NAME[idx];
}

export function positionAnalysis(b: string): PositionInfo[] {
  return b.split('').map((c, i) => {
    const isYang = c === '1';
    const dangWei = isYang === POS_IS_YANG[i];
    const zhongWei = i === 1 || i === 4;
    return { index: i, label: label(i, isYang), isYang, dangWei, zhongWei, zhongZheng: zhongWei && dangWei };
  });
}

export function correspondence(b: string): RelationInfo[] {
  return ([[0, 3], [1, 4], [2, 5]] as const).map(([lo, hi]) => ({
    labels: [label(lo, b[lo] === '1'), label(hi, b[hi] === '1')] as [string, string],
    relation: b[lo] !== b[hi] ? '有应（阴阳相对，相通）' : '敌应（同性相斥）',
  }));
}

export function chengCheng(b: string): RelationInfo[] {
  const out: RelationInfo[] = [];
  for (let i = 0; i < 5; i++) {
    const below = b[i]!;
    const above = b[i + 1]!;
    const relation =
      below === '0' && above === '1' ? '承（柔承刚，顺）'
      : below === '1' && above === '0' ? '乘（柔乘刚，逆）'
      : '比（同性相邻）';
    out.push({ labels: [label(i, below === '1'), label(i + 1, above === '1')], relation });
  }
  return out;
}
