// 卦象结构分析 —— 移植自 Qliuyao/gua_analysis.py。纯函数，输入 6 位 0/1 串(下→上)。

export const huGua = (b) => b[1] + b[2] + b[3] + b[2] + b[3] + b[4]; // 互卦
export const cuoGua = (b) => b.split('').map((c) => (c === '1' ? '0' : '1')).join(''); // 错卦
export const zongGua = (b) => b.split('').reverse().join(''); // 综卦

const POS_IS_YANG = [true, false, true, false, true, false]; // 初三五为阳位
const POS_NAME = ['初', '二', '三', '四', '五', '上'];

function label(idx, isYang) {
  if (idx === 0) return isYang ? '初九' : '初六';
  if (idx === 5) return isYang ? '上九' : '上六';
  return (isYang ? '九' : '六') + POS_NAME[idx];
}

export function positionAnalysis(b) {
  return b.split('').map((c, i) => {
    const isYang = c === '1';
    const posYang = POS_IS_YANG[i];
    const dangWei = isYang === posYang;
    const zhongWei = i === 1 || i === 4;
    return { index: i, label: label(i, isYang), isYang, dangWei, zhongWei, zhongZheng: zhongWei && dangWei };
  });
}

export function correspondence(b) {
  return [[0, 3], [1, 4], [2, 5]].map(([lo, hi]) => ({
    labels: [label(lo, b[lo] === '1'), label(hi, b[hi] === '1')],
    relation: b[lo] !== b[hi] ? '有应（阴阳相对，相通）' : '敌应（同性相斥）',
  }));
}

export function chengCheng(b) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const below = b[i], above = b[i + 1];
    const rel = below === '0' && above === '1' ? '承（柔承刚，顺）'
      : below === '1' && above === '0' ? '乘（柔乘刚，逆）' : '比（同性相邻）';
    out.push({ labels: [label(i, below === '1'), label(i + 1, above === '1')], relation: rel });
  }
  return out;
}

export function fullAnalysis(b) {
  return {
    huGua: huGua(b),
    cuoGua: cuoGua(b),
    zongGua: zongGua(b),
    positions: positionAnalysis(b),
    correspondences: correspondence(b),
    neighbors: chengCheng(b),
  };
}
