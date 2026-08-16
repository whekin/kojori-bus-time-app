export type Coordinate = { latitude: number; longitude: number };
export type RegionStop = { lat: number; lon: number };
export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

// Roughly 450m tall, so a lone stop does not zoom to maximum.
export const MIN_SPAN_DELTA = 0.004;
export const MAX_SPAN_DELTA = 0.06;
// The active marker's radius plus a hair, so it sits fully on the map.
const DEFAULT_MARGIN = 18;
// Beyond this the rider is not "at" the stops, and framing them together
// would zoom the stops themselves out of usefulness.
const INCLUDE_USER_WITHIN_METERS = 3_000;

/**
 * Where a coordinate lands inside a map of `size` showing `region`, in points
 * from its top-left. A region maps linearly onto the view it is framed for, and
 * over the few hundred metres a boarding-stop map covers, the Mercator
 * distortion across that span is far below a pixel.
 */
export function projectToView(
  coordinate: Coordinate,
  region: MapRegion,
  size: { width: number; height: number },
) {
  const west = region.longitude - region.longitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;

  return {
    x: ((coordinate.longitude - west) / region.longitudeDelta) * size.width,
    y: ((north - coordinate.latitude) / region.latitudeDelta) * size.height,
  };
}

// Roughly a metre of latitude — below this the camera would not visibly move,
// so re-framing the map costs a redraw for nothing.
const REGION_EPSILON = 0.00001;

export function regionsEqual(a: MapRegion | null, b: MapRegion | null) {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    Math.abs(a.latitude - b.latitude) < REGION_EPSILON &&
    Math.abs(a.longitude - b.longitude) < REGION_EPSILON &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) < REGION_EPSILON &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) < REGION_EPSILON
  );
}

function roughDistanceMeters(a: Coordinate, b: Coordinate) {
  const metersPerDegree = 111_320;
  const deltaLat = (a.latitude - b.latitude) * metersPerDegree;
  const deltaLon =
    (a.longitude - b.longitude) * metersPerDegree * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(deltaLat, deltaLon);
}

/**
 * Frames the boarding stops (and the rider, when they are close enough to be
 * useful) inside a card of the given aspect ratio.
 */
export type Viewport = {
  width: number;
  height: number;
  /** Space on the right taken by controls drawn over the map. */
  insetRight?: number;
  /** Space at the top taken by controls drawn over the map. */
  insetTop?: number;
  /** Space at the bottom reserved for the map provider's attribution. */
  insetBottom?: number;
  /** Breathing room around the outermost stops, in points. */
  margin?: number;
};

export function buildPickerRegion(
  stops: RegionStop[],
  userLocation: Coordinate | null,
  viewport: Viewport,
): MapRegion | null {
  if (stops.length === 0) return null;

  // Reserving more than this would leave too little map to frame stops in, and
  // shrinking the target rect to near zero produces a region wider than the
  // planet, which the native map rejects outright.
  const insetRight = Math.min(viewport.insetRight ?? 0, viewport.width * 0.6);
  const insetTop = Math.min(viewport.insetTop ?? 0, viewport.height * 0.5);
  const insetBottom = Math.min(viewport.insetBottom ?? 0, viewport.height * 0.4);
  const margin = Math.min(
    viewport.margin ?? DEFAULT_MARGIN,
    (viewport.width - insetRight) / 3,
    (viewport.height - insetTop - insetBottom) / 3,
  );

  // The rect the stops have to land in, in view points. Margin is what a marker
  // needs to sit fully on the map, and a marker's size does not shrink with
  // zoom, so it belongs here rather than as a multiple of the stops' extent.
  const left = Math.max(0, margin);
  const top = Math.max(0, insetTop + margin);
  const right = Math.max(left + 1, viewport.width - insetRight - margin);
  const bottom = Math.max(top + 1, viewport.height - insetBottom - margin);
  const rectWidth = right - left;
  const rectHeight = bottom - top;

  const points: Coordinate[] = stops.map(stop => ({ latitude: stop.lat, longitude: stop.lon }));

  if (userLocation) {
    const nearestStopDistance = Math.min(
      ...points.map(point => roughDistanceMeters(point, userLocation)),
    );
    if (nearestStopDistance <= INCLUDE_USER_WITHIN_METERS) points.push(userLocation);
  }

  const latitudes = points.map(point => point.latitude);
  const longitudes = points.map(point => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);

  // Degrees of latitude per point, shared by both axes so the region's own
  // aspect matches the view's — otherwise the map widens one axis to fit and
  // shows a span we never asked for.
  const scale = Math.max(
    MIN_SPAN_DELTA / viewport.height,
    Math.min(
      MAX_SPAN_DELTA / viewport.height,
      Math.max((maxLat - minLat) / rectHeight, (maxLon - minLon) / rectWidth),
    ),
  );

  // The region always covers the whole view; the centre shifts so the stops
  // land in the target rect. The camera cannot be padded directly, because
  // lite mode ignores mapPadding.
  const offsetX = viewport.width / 2 - (left + right) / 2;
  const offsetY = viewport.height / 2 - (top + bottom) / 2;

  return {
    latitude: (minLat + maxLat) / 2 - offsetY * scale,
    longitude: (minLon + maxLon) / 2 + offsetX * scale,
    latitudeDelta: scale * viewport.height,
    longitudeDelta: scale * viewport.width,
  };
}

/**
 * Web Mercator zoom that shows `longitudeDelta` across a view `widthPx` wide.
 * A region prop only asks the map to *cover* a box, and it rounds the zoom
 * outwards to do so; a zoom says exactly what to show.
 */
export function zoomForRegion(region: MapRegion, widthPx: number) {
  const TILE_SIZE = 256;
  return Math.log2((360 * widthPx) / (TILE_SIZE * region.longitudeDelta));
}
