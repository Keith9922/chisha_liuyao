// 高德地图(可选增强):在结果页直观展示你的方位与餐馆位置。
// 设计原则(遵循全局 CLAUDE.md「装饰别拖垮核心」):
//  · 需 web 端 JS API Key,放 web/.env.local 的 VITE_AMAP_KEY(及可选 VITE_AMAP_SECURITY)。
//  · 无 key / 脚本加载失败 / 任意异常 → 返回 false,由调用方降级为「文字方位」,绝不白屏。
//  · 浏览器定位与餐馆经纬度均为 WGS-84,高德用 GCJ-02 → 用官方 convertFrom 纠偏,避免标记偏移。

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY ?? '';
const AMAP_SECURITY = import.meta.env.VITE_AMAP_SECURITY ?? '';

export interface MapPoint {
  lat: number;
  lng: number;
  name: string;
  chosen?: boolean;
}

let loadPromise: Promise<AMapNamespace> | null = null;

function loadAMap(): Promise<AMapNamespace> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<AMapNamespace>((resolve, reject) => {
    if (!AMAP_KEY) {
      reject(new Error('no amap key'));
      return;
    }
    if (AMAP_SECURITY) window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY };
    const s = document.createElement('script');
    s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}`;
    s.async = true;
    s.onload = (): void => {
      if (window.AMap) resolve(window.AMap);
      else reject(new Error('amap loaded but global missing'));
    };
    s.onerror = (): void => reject(new Error('amap script error'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('amap load timeout')), 8000);
  });
  return loadPromise;
}

// WGS-84 → GCJ-02(高德坐标系)批量纠偏。失败则原样返回。
function convertToGcj(
  AMap: AMapNamespace,
  pts: Array<[number, number]>,
): Promise<Array<[number, number]>> {
  return new Promise((resolve) => {
    try {
      AMap.convertFrom(pts, 'gps', (status, result) => {
        if (status === 'complete' && result.info === 'ok' && result.locations.length === pts.length) {
          resolve(result.locations.map((l) => [l.getLng(), l.getLat()]));
        } else {
          resolve(pts);
        }
      });
    } catch {
      resolve(pts);
    }
  });
}

function userMarkerContent(): string {
  return `<div class="amap-me"><span class="amap-me__pulse"></span><span class="amap-me__dot"></span></div>`;
}
function shopMarkerContent(label: string, chosen: boolean): string {
  return `<div class="amap-pin${chosen ? ' amap-pin--chosen' : ''}"><span class="amap-pin__body">${label}</span></div>`;
}

export interface MapResult {
  ok: boolean;
  destroy: () => void;
}

// 渲染地图。成功返回 {ok:true,destroy}。任何失败返回 {ok:false}——调用方据此降级。
export async function renderMap(
  container: HTMLElement,
  user: { lat: number; lng: number } | null,
  shops: MapPoint[],
): Promise<MapResult> {
  const noop = { ok: false, destroy: (): void => {} };
  if (!AMAP_KEY) return noop;
  const valid = shops.filter((s) => s.lat != null && s.lng != null);
  if (!user && valid.length === 0) return noop;

  try {
    const AMap = await loadAMap();

    // 组装待纠偏点:user 在前(若有),其后是各餐馆
    const raw: Array<[number, number]> = [];
    if (user) raw.push([user.lng, user.lat]);
    for (const s of valid) raw.push([s.lng, s.lat]);
    const gcj = await convertToGcj(AMap, raw);

    const map = new AMap.Map(container, {
      zoom: 14,
      mapStyle: 'amap://styles/dark',
      viewMode: '2D',
      resizeEnable: true,
    });

    const markers: AMapMarkerInstance[] = [];
    let cursor = 0;
    if (user) {
      const [lng, lat] = gcj[cursor++]!;
      const m = new AMap.Marker({
        position: [lng, lat],
        content: userMarkerContent(),
        offset: new AMap.Pixel(-11, -11),
        zIndex: 120,
        title: '你在这里',
      });
      markers.push(m);
    }
    for (const s of valid) {
      const [lng, lat] = gcj[cursor++]!;
      const m = new AMap.Marker({
        position: [lng, lat],
        content: shopMarkerContent(s.chosen ? '天选' : s.name.slice(0, 4), Boolean(s.chosen)),
        offset: new AMap.Pixel(0, -34),
        zIndex: s.chosen ? 110 : 90,
        title: s.name,
      });
      markers.push(m);
    }
    map.add(markers);
    map.setFitView(markers, false, [40, 40, 40, 40]);
    return { ok: true, destroy: (): void => map.destroy() };
  } catch (e) {
    console.warn('[amap] degrade to text:', e instanceof Error ? e.message : e);
    return noop;
  }
}

// ── 文字方位(无地图时的降级,也可与地图并存) ──
// 由用户与餐馆经纬度算「八向中文方位 + 直线距离」。
const COMPASS = ['正北', '东北', '正东', '东南', '正南', '西南', '正西', '西北'];

export function bearingText(
  user: { lat: number; lng: number } | null,
  shop: { lat: number | null; lng: number | null },
): string | null {
  if (!user || shop.lat == null || shop.lng == null) return null;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLng = toRad(shop.lng - user.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(shop.lat));
  const x =
    Math.cos(toRad(user.lat)) * Math.sin(toRad(shop.lat)) -
    Math.sin(toRad(user.lat)) * Math.cos(toRad(shop.lat)) * Math.cos(dLng);
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  deg = (deg + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  return COMPASS[idx] ?? null;
}

export const hasAmapKey = (): boolean => Boolean(AMAP_KEY);
