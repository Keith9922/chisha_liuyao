// 经纬度 → 城市字符串(monid 的 location 参数要文字城市)。
// 用免费 OSM Nominatim 反查；失败则回退到调用方传入的手填城市。

export async function resolveCity(lat, lng, fallbackCity) {
  if (lat == null || lng == null) return fallbackCity || '成都市';
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&zoom=12&accept-language=zh` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'chisha-liuyao/0.1 (hackathon demo)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const j = await res.json();
    const a = j.address || {};
    const city =
      a.city || a.town || a.county || a.municipality || a.state || a.district;
    return city || fallbackCity || '成都市';
  } catch {
    return fallbackCity || '成都市'; // 反查挂了也不挡主流程
  }
}
