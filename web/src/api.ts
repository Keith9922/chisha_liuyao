// 前端侧 API 契约(镜像 server/src/types.ts 的响应结构)+ 调用封装。

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
}
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
  meta: {
    source: 'cache' | 'live' | 'fixture';
    llmCuisineFallback: boolean;
    llmReadFallback: boolean;
    llmError: string | null;
  };
}
export interface DivineRequest {
  lines: YaoValue[];
  preference?: string;
  lat: number | null;
  lng: number | null;
  city?: string;
}
export interface ApiError {
  error: string;
  message: string;
}

export class DivineError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function divine(req: DivineRequest): Promise<DivineResponse> {
  let res: Response;
  try {
    res = await fetch('/api/divine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    throw new DivineError('NETWORK', '与天机失联,请检查网络后再卜。');
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new DivineError(err?.error ?? 'INTERNAL', err?.message ?? '卦象推演受阻,请稍后再试。');
  }
  return (await res.json()) as DivineResponse;
}
