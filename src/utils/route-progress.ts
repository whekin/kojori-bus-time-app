import type { PolylinePoint, StopInfo } from '@/services/ttc';

export type PolylineMetrics = {
  points: PolylinePoint[];
  cumulativeMeters: number[];
  totalMeters: number;
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

  return { points, cumulativeMeters, totalMeters };
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

  let best: ProjectedRoutePoint | null = null;

  for (let index = 0; index < metrics.points.length - 1; index++) {
    const start = metrics.points[index];
    const end = metrics.points[index + 1];
    const segmentMeters = distanceMeters(start, end);
    if (segmentMeters === 0) continue;

    const latRadians = (start.latitude * Math.PI) / 180;
    const metersPerLatitudeDegree = 111_320;
    const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(latRadians);
    const pointX = (point.longitude - start.longitude) * metersPerLongitudeDegree;
    const pointY = (point.latitude - start.latitude) * metersPerLatitudeDegree;
    const endX = (end.longitude - start.longitude) * metersPerLongitudeDegree;
    const endY = (end.latitude - start.latitude) * metersPerLatitudeDegree;
    const projection = Math.max(0, Math.min(1, (pointX * endX + pointY * endY) / (endX * endX + endY * endY)));
    const projectedPoint = {
      latitude: start.latitude + (end.latitude - start.latitude) * projection,
      longitude: start.longitude + (end.longitude - start.longitude) * projection,
    };
    const offRouteMeters = Math.hypot(pointX - endX * projection, pointY - endY * projection);
    const distanceAlongRoute = metrics.cumulativeMeters[index] + segmentMeters * projection;
    const heading = bearingDegrees(start, end);

    if (!best || offRouteMeters < best.offRouteMeters) {
      best = {
        point: projectedPoint,
        distanceMeters: distanceAlongRoute,
        offRouteMeters,
        heading,
        segmentIndex: index,
      };
    }
  }

  return best;
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

  for (let index = 0; index < metrics.points.length - 1; index++) {
    const startMeters = metrics.cumulativeMeters[index];
    const endMeters = metrics.cumulativeMeters[index + 1];
    if (targetMeters > endMeters && index < metrics.points.length - 2) continue;

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

  const finalIndex = metrics.points.length - 1;
  return {
    point: metrics.points[finalIndex],
    distanceMeters: metrics.totalMeters,
    heading: bearingDegrees(metrics.points[finalIndex - 1], metrics.points[finalIndex]),
    segmentIndex: finalIndex - 1,
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
