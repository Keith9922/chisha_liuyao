// 卦象 SVG:六爻自下而上,阳爻实线、阴爻断线,动爻以朱砂高亮。
// yinyang: 1阳0阴(下→上); movingLines: 动爻爻位(1-6); revealed: 已显现爻数(起卦动画用)。

const VIEW_W = 132;
const LINE_H = 13;
const GAP = 11;
const SEG_GAP = 16; // 阴爻中间断口
const PAD_Y = 8;
const INNER_W = VIEW_W - 12;

export function hexagramSvg(yinyang: number[], movingLines: number[] = [], revealed = 6): string {
  const moving = new Set(movingLines);
  const totalH = 6 * LINE_H + 5 * GAP + 2 * PAD_Y;
  const rows: string[] = [];

  for (let i = 5; i >= 0; i--) {
    const y = PAD_Y + (5 - i) * (LINE_H + GAP);

    if (i >= revealed) {
      // 未显现:淡金导引位
      rows.push(`<rect class="yao yao--ghost" x="6" y="${y}" width="${INNER_W}" height="${LINE_H}" rx="3"/>`);
      continue;
    }

    const isYang = yinyang[i] === 1;
    const isMoving = moving.has(i + 1);
    const cls = `yao yao--in${isMoving ? ' yao--moving' : ''}`;
    if (isYang) {
      rows.push(`<rect class="${cls}" x="6" y="${y}" width="${INNER_W}" height="${LINE_H}" rx="3"/>`);
    } else {
      const half = (INNER_W - SEG_GAP) / 2;
      rows.push(
        `<rect class="${cls}" x="6" y="${y}" width="${half}" height="${LINE_H}" rx="3"/>` +
        `<rect class="${cls}" x="${6 + half + SEG_GAP}" y="${y}" width="${half}" height="${LINE_H}" rx="3"/>`,
      );
    }
  }

  return `<svg class="hexagram-svg" viewBox="0 0 ${VIEW_W} ${totalH}" width="${VIEW_W}" height="${totalH}" role="img" aria-label="卦象图">${rows.join('')}</svg>`;
}
