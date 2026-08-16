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
const SPAN_PADDING = 1.35;
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
export function buildPickerRegion(
  stops: RegionStop[],
  userLocation: Coordinate | null,
  aspect: number,
): MapRegion | null {
  if (stops.length === 0) return null;

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

  let latitudeDelta = (maxLat - minLat) * SPAN_PADDING;
  let longitudeDelta = (maxLon - minLon) * SPAN_PADDING;

  // Match the card's aspect ratio so Google renders the span we asked for
  // instead of silently widening one axis to fit.
  longitudeDelta = Math.max(longitudeDelta, latitudeDelta * aspect);
  latitudeDelta = Math.max(latitudeDelta, longitudeDelta / aspect);

  latitudeDelta = Math.min(MAX_SPAN_DELTA, Math.max(MIN_SPAN_DELTA, latitudeDelta));
  longitudeDelta = Math.min(
    MAX_SPAN_DELTA * aspect,
    Math.max(MIN_SPAN_DELTA * aspect, longitudeDelta),
  );

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}
