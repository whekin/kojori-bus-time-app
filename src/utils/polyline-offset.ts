import { PolylinePoint } from '@/services/ttc';

/**
 * Haversine distance between two points in meters.
 */
function distanceMeters(a: PolylinePoint, b: PolylinePoint): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Linearly interpolate between two points at fraction t (0–1).
 */
function lerp(a: PolylinePoint, b: PolylinePoint, t: number): PolylinePoint {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/**
 * Check if two points are close enough to be considered the same location.
 */
function arePointsClose(p1: PolylinePoint, p2: PolylinePoint, thresholdDegrees = 0.0001): boolean {
  return (
    Math.abs(p1.latitude - p2.latitude) < thresholdDegrees &&
    Math.abs(p1.longitude - p2.longitude) < thresholdDegrees
  );
}

/**
 * Find indices of segments in polyline1 that overlap with polyline2.
 */
function findOverlappingSegments(
  polyline1: PolylinePoint[],
  polyline2: PolylinePoint[],
): Set<number> {
  const overlapping = new Set<number>();

  for (let i = 0; i < polyline1.length - 1; i++) {
    const p1Start = polyline1[i];
    const p1End = polyline1[i + 1];

    for (let j = 0; j < polyline2.length - 1; j++) {
      const p2Start = polyline2[j];
      const p2End = polyline2[j + 1];

      const startMatch = arePointsClose(p1Start, p2Start) || arePointsClose(p1Start, p2End);
      const endMatch = arePointsClose(p1End, p2Start) || arePointsClose(p1End, p2End);

      if (startMatch || endMatch) {
        overlapping.add(i);
        break;
      }
    }
  }

  return overlapping;
}

/**
 * Break a polyline into alternating-color segments of roughly `segmentMeters` length.
 * Returns array of small polylines, each tagged with a color index (0 or 1).
 */
function buildZebraSegments(
  points: PolylinePoint[],
  segmentMeters: number,
): { coords: PolylinePoint[]; colorIndex: number }[] {
  if (points.length < 2) return [];

  const segments: { coords: PolylinePoint[]; colorIndex: number }[] = [];
  let colorIndex = 0;
  let current: PolylinePoint[] = [points[0]];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const pt = points[i];
    const d = distanceMeters(prev, pt);

    if (accumulated + d < segmentMeters) {
      current.push(pt);
      accumulated += d;
    } else {
      // Split this edge at the boundary
      let remaining = d;
      let from = prev;
      let budget = segmentMeters - accumulated;

      while (remaining > 0) {
        if (remaining <= budget) {
          current.push(pt);
          accumulated += remaining;
          remaining = 0;
        } else {
          const t = budget / distanceMeters(from, pt);
          const split = lerp(from, pt, t);
          current.push(split);
          segments.push({ coords: current, colorIndex });
          colorIndex = 1 - colorIndex;
          current = [split];
          from = split;
          remaining -= budget;
          accumulated = 0;
          budget = segmentMeters;
        }
      }
    }
  }

  if (current.length >= 2) {
    segments.push({ coords: current, colorIndex });
  }

  return segments;
}

export interface SplitResult {
  /** Segments where only this route runs (no overlap) */
  exclusive: PolylinePoint[];
  /** Zebra segments for shared road, each with a color index */
  zebra: { coords: PolylinePoint[]; colorIndex: number }[];
}

/**
 * Split two polylines into exclusive + shared-zebra segments.
 * Shared sections become zebra stripes alternating between both route colors.
 */
export function splitPolylinesByOverlap(
  polyline1: PolylinePoint[],
  polyline2: PolylinePoint[],
  zebraSegmentMeters: number = 40,
): {
  route1: SplitResult;
  route2: SplitResult;
  sharedZebra: { coords: PolylinePoint[]; colorIndex: number }[];
} {
  if (polyline1.length < 2 || polyline2.length < 2) {
    return {
      route1: { exclusive: polyline1, zebra: [] },
      route2: { exclusive: polyline2, zebra: [] },
      sharedZebra: [],
    };
  }

  const overlapping1 = findOverlappingSegments(polyline1, polyline2);

  // Build exclusive points for route 1
  const exclusive1: PolylinePoint[] = [];
  const shared1: PolylinePoint[] = [];

  for (let i = 0; i < polyline1.length; i++) {
    const isInOverlap = overlapping1.has(i) || overlapping1.has(i - 1);
    if (isInOverlap) {
      shared1.push(polyline1[i]);
    } else {
      exclusive1.push(polyline1[i]);
    }
  }

  const overlapping2 = findOverlappingSegments(polyline2, polyline1);
  const exclusive2: PolylinePoint[] = [];

  for (let i = 0; i < polyline2.length; i++) {
    const isInOverlap = overlapping2.has(i) || overlapping2.has(i - 1);
    if (!isInOverlap) {
      exclusive2.push(polyline2[i]);
    }
  }

  // Build zebra from shared points of route 1 (both routes follow same path)
  const sharedZebra = buildZebraSegments(shared1, zebraSegmentMeters);

  return {
    route1: { exclusive: exclusive1, zebra: [] },
    route2: { exclusive: exclusive2, zebra: [] },
    sharedZebra,
  };
}
