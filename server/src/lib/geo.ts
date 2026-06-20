// 经纬度 → 城市字符串(monid 的 location 参数要文字城市)。
// 免费 OSM Nominatim 反查;失败回退手填城市。

interface NominatimAddress {
  city?: string;
  town?: string;
  county?: string;
  municipality?: string;
  state?: string;
  district?: string;
}
interface NominatimResponse {
  address?: NominatimAddress;
}

const DEFAULT_CITY = '成都市';

export async function resolveCity(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fallbackCity?: string,
): Promise<string> {
  if (lat == null || lng == null) return fallbackCity || DEFAULT_CITY;
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=zh` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'chisha-liuyao/1.0 (divination food app)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const j = (await res.json()) as NominatimResponse;
    const a = j.address ?? {};
    return a.city || a.town || a.county || a.municipality || a.state || a.district || fallbackCity || DEFAULT_CITY;
  } catch {
    return fallbackCity || DEFAULT_CITY;
  }
}
