/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_KEY?: string;
  readonly VITE_AMAP_SECURITY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 高德 JS API 2.0 全局(仅声明本项目用到的部分)
interface AMapLngLat {
  getLng(): number;
  getLat(): number;
}
interface AMapConvertResult {
  info: string;
  locations: AMapLngLat[];
}
interface AMapMarkerOptions {
  position: [number, number] | AMapLngLat;
  content?: string | HTMLElement;
  offset?: AMapPixelInstance;
  anchor?: string;
  zIndex?: number;
  title?: string;
}
interface AMapMarkerInstance {
  on(event: string, handler: () => void): void;
}
interface AMapPixelInstance {
  _brand?: 'pixel';
}
interface AMapMapInstance {
  add(overlay: AMapMarkerInstance | AMapMarkerInstance[]): void;
  setFitView(overlays?: AMapMarkerInstance[] | null, immediately?: boolean, avoid?: [number, number, number, number]): void;
  destroy(): void;
}
interface AMapNamespace {
  Map: new (container: HTMLElement | string, opts: Record<string, unknown>) => AMapMapInstance;
  Marker: new (opts: AMapMarkerOptions) => AMapMarkerInstance;
  Pixel: new (x: number, y: number) => AMapPixelInstance;
  convertFrom: (
    lnglat: Array<[number, number]>,
    type: string,
    cb: (status: string, result: AMapConvertResult) => void,
  ) => void;
}
interface Window {
  AMap?: AMapNamespace;
  _AMapSecurityConfig?: { securityJsCode: string };
}
