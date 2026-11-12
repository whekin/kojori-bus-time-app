/**
 * Web Mercator as MapLibre draws it, on native and web alike: the world is
 * 512 logical pixels across at zoom 0 and zoom is continuous. Because the
 * renderer honours a fractional zoom exactly, anything framed or projected
 * here lands on the pixel the map shows — no calibration against the map.
 */
export type LngLat = [longitude: number, latitude: number];
export type LngLatBounds = [west: number, south: number, east: number, north: number];
export type Size = { width: number; height: number };
export type Padding = { top: number; right: number; bottom: number; left: number };
export type CameraPosition = { center: LngLat; zoom: number };

export const WORLD_TILE_SIZE = 512;
const MAX_LATITUDE = 85.051129;

export const NO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

export function worldSize(zoom: number) {
  return WORLD_TILE_SIZE * 2 ** zoom;
}

/** Unit Mercator, 0..1 on both axes, y growing south. */
export function toMercator([longitude, latitude]: LngLat) {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

export function fromMercator(x: number, y: number): LngLat {
  const longitude = x * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [longitude, latitude];
}

/** Where `point` lands in a view of `size` whose camera is `camera`, from the top-left. */
export function projectToScreen(point: LngLat, camera: CameraPosition, size: Size) {
  const scale = worldSize(camera.zoom);
  const p = toMercator(point);
  const c = toMercator(camera.center);
  return {
    x: (p.x - c.x) * scale + size.width / 2,
    y: (p.y - c.y) * scale + size.height / 2,
  };
}

export function boundsOf(points: LngLat[]): LngLatBounds | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of points) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  return [west, south, east, north];
}

/** Zoom at which `latitudeSpan` degrees fill `heightPx` around `latitude`. */
export function zoomForLatitudeSpan(latitudeSpan: number, heightPx: number, latitude: number) {
  const top = toMercator([0, latitude + latitudeSpan / 2]).y;
  const bottom = toMercator([0, latitude - latitudeSpan / 2]).y;
  return Math.log2(heightPx / (WORLD_TILE_SIZE * Math.abs(bottom - top)));
}

/**
 * The camera that fits `bounds` inside `size` minus `padding`. Padding is
 * clamped so a cramped view still leaves a usable rect instead of a negative
 * one, and a single point (no extent) gets `maxZoom`.
 */
export function cameraForBounds(
  bounds: LngLatBounds,
  size: Size,
  padding: Padding = NO_PADDING,
  { minZoom = 0, maxZoom = 18 }: { minZoom?: number; maxZoom?: number } = {},
): CameraPosition {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const left = Math.min(padding.left, width * 0.45);
  const right = Math.min(padding.right, width * 0.45);
  const top = Math.min(padding.top, height * 0.45);
  const bottom = Math.min(padding.bottom, height * 0.45);
  const innerWidth = Math.max(1, width - left - right);
  const innerHeight = Math.max(1, height - top - bottom);

  const sw = toMercator([bounds[0], bounds[1]]);
  const ne = toMercator([bounds[2], bounds[3]]);
  const spanX = Math.abs(ne.x - sw.x);
  const spanY = Math.abs(sw.y - ne.y);
  const fit = Math.min(
    spanX > 0 ? innerWidth / (WORLD_TILE_SIZE * spanX) : Infinity,
    spanY > 0 ? innerHeight / (WORLD_TILE_SIZE * spanY) : Infinity,
  );
  const zoom = Math.max(minZoom, Math.min(maxZoom, Number.isFinite(fit) ? Math.log2(fit) : maxZoom));
  const scale = worldSize(zoom);

  // Centre the content in the padded rect, then shift the camera so that rect
  // sits where the padding puts it.
  const midX = (sw.x + ne.x) / 2;
  const midY = (sw.y + ne.y) / 2;
  const shiftX = (left + innerWidth / 2 - width / 2) / scale;
  const shiftY = (top + innerHeight / 2 - height / 2) / scale;
  return { center: fromMercator(midX - shiftX, midY - shiftY), zoom };
}

/** Rough ground distance, good to a few metres over a city. */
export function roughDistanceMeters(a: LngLat, b: LngLat) {
  const metersPerDegree = 111_320;
  const deltaLat = (a[1] - b[1]) * metersPerDegree;
  const deltaLon = (a[0] - b[0]) * metersPerDegree * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot(deltaLat, deltaLon);
}

export function camerasClose(a: CameraPosition | null, b: CameraPosition | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.zoom - b.zoom) < 0.01 &&
    Math.abs(a.center[0] - b.center[0]) < 0.00001 &&
    Math.abs(a.center[1] - b.center[1]) < 0.00001
  );
}
