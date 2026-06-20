// 真 SVG 图标(Lucide 风格,1.75 描边)。返回 SVG 字符串。

const wrap = (inner: string, label: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="icon">${inner}</svg>` +
  (label ? `<span class="sr-only">${label}</span>` : '');

export const icons = {
  location: (): string =>
    wrap('<path d="M20 10c0 4.4-8 12-8 12s-8-7.6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', '定位'),
  star: (): string => wrap('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z"/>', '评分'),
  refresh: (): string =>
    wrap('<path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 21v-5h5"/>', '再卜一卦'),
  compass: (): string =>
    wrap('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2Z"/>', '罗盘'),
  utensils: (): string =>
    wrap('<path d="M5 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3"/><path d="M7 12v9"/><path d="M17 3c-1.7 0-3 2-3 5s1 4 3 4v9"/>', '餐'),
  spark: (): string =>
    wrap('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>', '灵光'),
  chevron: (): string => wrap('<path d="m9 6 6 6-6 6"/>', ''),
};
