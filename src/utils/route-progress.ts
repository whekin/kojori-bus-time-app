import type { PolylinePoint, StopInfo } from '@/services/ttc';

const METERS_PER_LATITUDE_DEGREE = 111_320;

export type PolylineMetrics = {
  points: PolylinePoint[];
  cumulativeMeters: number[];
  totalMeters: number;
  // Equirectangular projection of `points` into meters, anchored at the first
  // point. Every hot loop below (projection, interpolation) then runs on plain
  // arithmetic instead of recomputing trigonometry per segment on every call.
  planarX: Float64Array;
  planarY: Float64Array;
  originLatitude: number;
  originLongitude: number;
  metersPerLongitudeDegree: number;
};

export type ProjectedRoutePoint = {
  point: PolylinePoint;
  distanceMeters: number;
  offRouteMeters: number;
  heading: number;
  segmentIndex: number;
};

export type InterpolatedRoutePoint = {
  point: PolylinePoint;
  distanceMeters: number;
  heading: number;
  segmentIndex: number;
};

export function distanceMeters(a: PolylinePoint, b: PolylinePoint): number {
  const radiusMeters = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return radiusMeters * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function buildPolylineMetrics(points: PolylinePoint[]): PolylineMetrics {
  const cumulativeMeters = [0];
  let totalMeters = 0;

  for (let index = 1; index < points.length; index++) {
    totalMeters += distanceMeters(points[index - 1], points[index]);
    cumulativeMeters.push(totalMeters);
  }

  const originLatitude = points[0]?.latitude ?? 0;
  const originLongitude = points[0]?.longitude ?? 0;
  const metersPerLongitudeDegree =
    METERS_PER_LATITUDE_DEGREE * Math.cos((originLatitude * Math.PI) / 180);
  const planarX = new Float64Array(points.length);
  const planarY = new Float64Array(points.length);

  for (let index = 0; index < points.length; index++) {
    planarX[index] = (points[index].longitude - originLongitude) * metersPerLongitudeDegree;
    planarY[index] = (points[index].latitude - originLatitude) * METERS_PER_LATITUDE_DEGREE;
  }

  return {
    points,
    cumulativeMeters,
    totalMeters,
    planarX,
    planarY,
    originLatitude,
    originLongitude,
    metersPerLongitudeDegree,
  };
}

export function projectPointToPolyline(
  point: PolylinePoint,
  metrics: PolylineMetrics,
): ProjectedRoutePoint | null {
  if (metrics.points.length === 0) return null;

  if (metrics.points.length === 1) {
    const onlyPoint = metrics.points[0];
    return {
      point: onlyPoint,
      distanceMeters: 0,
      offRouteMeters: distanceMeters(point, onlyPoint),
      heading: 0,
      segmentIndex: 0,
    };
  }

  const { planarX, planarY, cumulativeMeters } = metrics;
  const pointX = (point.longitude - metrics.originLongitude) * metrics.metersPerLongitudeDegree;
  const pointY = (point.latitude - metrics.originLatitude) * METERS_PER_LATITUDE_DEGREE;

  let bestIndex = -1;
  let bestOffSquared = Infinity;
  let bestProjection = 0;

  // Trig-free inner loop: the winning segment is picked on squared distances,
  // and the real coordinate/heading is derived once afterwards.
  for (let index = 0; index < planarX.length - 1; index++) {
    const startX = planarX[index];
    const startY = planarY[index];
    const edgeX = planarX[index + 1] - startX;
    const edgeY = planarY[index + 1] - startY;
    const edgeLengthSquared = edgeX * edgeX + edgeY * edgeY;
    if (edgeLengthSquared === 0) continue;

    const relativeX = pointX - startX;
    const relativeY = pointY - startY;
    let projection = (relativeX * edgeX + relativeY * edgeY) / edgeLengthSquared;
    if (projection < 0) projection = 0;
    else if (projection > 1) projection = 1;

    const offX = relativeX - edgeX * projection;
    const offY = relativeY - edgeY * projection;
    const offSquared = offX * offX + offY * offY;

    if (offSquared < bestOffSquared) {
      bestOffSquared = offSquared;
      bestIndex = index;
      bestProjection = projection;
    }
  }

  if (bestIndex < 0) return null;

  const start = metrics.points[bestIndex];
  const end = metrics.points[bestIndex + 1];
  const segmentMeters = cumulativeMeters[bestIndex + 1] - cumulativeMeters[bestIndex];

  return {
    point: {
      latitude: start.latitude + (end.latitude - start.latitude) * bestProjection,
      longitude: start.longitude + (end.longitude - start.longitude) * bestProjection,
    },
    distanceMeters: cumulativeMeters[bestIndex] + segmentMeters * bestProjection,
    offRouteMeters: Math.sqrt(bestOffSquared),
    heading: bearingDegrees(start, end),
    segmentIndex: bestIndex,
  };
}

// Lowest segment index whose end is at or past `targetMeters`. Binary search:
// the vehicle tick and the ETA walk hit this many times per frame budget.
function segmentIndexAtDistance(metrics: PolylineMetrics, targetMeters: number): number {
  const { cumulativeMeters } = metrics;
  let low = 0;
  let high = metrics.points.length - 2;

  while (low < high) {
    const middle = (low + high) >> 1;
    if (cumulativeMeters[middle + 1] < targetMeters) low = middle + 1;
    else high = middle;
  }

  return low;
}

export function interpolatePolylineAtDistance(
  metrics: PolylineMetrics,
  distanceMeters: number,
): InterpolatedRoutePoint | null {
  if (metrics.points.length === 0) return null;
  if (metrics.points.length === 1) {
    return {
      point: metrics.points[0],
      distanceMeters: 0,
      heading: 0,
      segmentIndex: 0,
    };
  }

  const targetMeters = Math.max(0, Math.min(distanceMeters, metrics.totalMeters));
  const index = segmentIndexAtDistance(metrics, targetMeters);
  const startMeters = metrics.cumulativeMeters[index];
  const endMeters = metrics.cumulativeMeters[index + 1];
  const start = metrics.points[index];
  const end = metrics.points[index + 1];
  const segmentMeters = Math.max(1, endMeters - startMeters);
  const progress = Math.max(0, Math.min(1, (targetMeters - startMeters) / segmentMeters));

  return {
    point: {
      latitude: start.latitude + (end.latitude - start.latitude) * progress,
      longitude: start.longitude + (end.longitude - start.longitude) * progress,
    },
    distanceMeters: targetMeters,
    heading: bearingDegrees(start, end),
    segmentIndex: index,
  };
}

export function headingAlongPolyline(
  metrics: PolylineMetrics,
  distanceMeters: number,
  lookAheadMeters = 20,
): number | null {
  const current = interpolatePolylineAtDistance(metrics, distanceMeters);
  if (!current || lookAheadMeters <= 0) return current?.heading ?? null;
  const ahead = interpolatePolylineAtDistance(metrics, distanceMeters + lookAheadMeters);
  if (!ahead || distanceMeters >= metrics.totalMeters) return current.heading;

  return bearingDegrees(current.point, ahead.point);
}

export function projectStopToRoute(stop: StopInfo | null | undefined, metrics: PolylineMetrics) {
  if (typeof stop?.lat !== 'number' || typeof stop.lon !== 'number') return null;
  return projectPointToPolyline({ latitude: stop.lat, longitude: stop.lon }, metrics);
}

function bearingDegrees(a: PolylinePoint, b: PolylinePoint): number {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
