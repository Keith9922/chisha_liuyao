// 领域类型 + API 契约(服务端权威来源)。

// ── 原始数据文件结构(server/data/*.json) ──
export interface HexagramRecord {
  num: number;
  name: string;
  pinyin: string;
  symbol: string;
  judgment: string;
  lines: string[];
  extra?: string;
}
export interface TrigramRecord {
  name: string;
  symbol: string;
  element: string;
  attribute: string;
  family: string;
  body: string;
  animal: string;
  season: string;
  direction: string;
  associations: string;
}
export interface WingRecord {
  tuan: string;
  da_xiang: string;
}
export type HexagramData = Record<string, HexagramRecord>;
export type TrigramData = Record<string, TrigramRecord>;
export type WingData = Record<string, WingRecord>;

// ── 卦象组装结果 ──
export type YaoValue = 6 | 7 | 8 | 9;

export interface TrigramInfo {
  name: string;
  symbol: string;
  element: string;
  attribute: string;
  associations: string;
}
export interface HexInfo {
  binary: string;
  num: number;
  name: string;
  pinyin: string;
  symbol: string;
  judgment: string;
  lines: string[];
  tuan: string;
  daXiang: string;
  lower: TrigramInfo;
  upper: TrigramInfo;
}
export interface PositionInfo {
  index: number;
  label: string;
  isYang: boolean;
  dangWei: boolean;
  zhongWei: boolean;
  zhongZheng: boolean;
}
export interface RelationInfo {
  labels: [string, string];
  relation: string;
}
export interface DerivedGua {
  binary: string;
  name: string;
}
export interface Hexagram {
  lines: YaoValue[];
  yinyang: number[];
  movingLines: number[];
  movingTexts: string[];
  ben: HexInfo;
  bian: HexInfo | null;
  summary: string;
  derived: { hu: DerivedGua; cuo: DerivedGua; zong: DerivedGua };
  structure: {
    positions: PositionInfo[];
    correspondences: RelationInfo[];
    neighbors: RelationInfo[];
  };
}

// ── 餐馆 ──
export interface Restaurant {
  name: string;
  rating: number | null;
  ratingCount: number;
  type: string;
  address: string;
  phone: string | null;
  thumbnail: string | null;
  lat: number | null;
  lng: number | null;
  distance: number | null;
}

// ── 社交笔记(小红书,经 MONID/TikHub) ──
export interface SocialNote {
  id: string;
  url: string;
  title: string;
  desc: string;
  cover: string | null;
  likedCount: number | null;
  collectedCount: number | null;
  commentsCount: number | null;
  author: string;
  authorAvatar: string | null;
}
export type SocialSource = 'cache' | 'live' | 'fixture' | 'none';

// ── 解卦 LLM 输出 ──
export interface CuisinePick {
  cuisine: string;
  eat: string;
  avoid: string;
  reason: string;
  fallback: boolean;
}
export interface Reading {
  fortune: string;
  eat: string;
  avoid: string;
  chosenName: string;
  dish: string;
  blessing: string;
  fallback: boolean;
  error: string | null;
}

// ── API 契约 ──
export interface DivineRequest {
  lines?: YaoValue[];
  preference?: string;
  lat?: number | null;
  lng?: number | null;
  city?: string;
}
export type DataSource = 'cache' | 'live' | 'fixture';
export interface DivineResponse {
  hexagram: Hexagram;
  city: string;
  cuisine: string;
  cuisineReason: string | null;
  fortune: string;
  eat: string;
  avoid: string;
  blessing: string;
  dish: string;
  chosen: Restaurant | null;
  restaurants: Restaurant[];
  notes: SocialNote[];
  noteKeyword: string;
  meta: {
    source: DataSource;
    socialSource: SocialSource;
    llmCuisineFallback: boolean;
    llmReadFallback: boolean;
    llmError: string | null;
  };
}
