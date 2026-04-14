import { PolylinePoint } from '@/services/ttc';

/**
 * Calculate the perpendicular offset for a line segment
 * @param p1 First point
 * @param p2 Second point
 * @param offsetMeters Offset distance in meters (positive = right, negative = left)
 * @returns Offset deltas for latitude and longitude
 */
function calculatePerpendicularOffset(
  p1: PolylinePoint,
  p2: PolylinePoint,
  offsetMeters: number,
): { latOffset: number; lonOffset: number } {
  // Calculate the direction vector
  const dx = p2.longitude - p1.longitude;
  const dy = p2.latitude - p1.latitude;

  // Calculate the length
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return { latOffset: 0, lonOffset: 0 };
  }

  // Normalize the direction vector
  const nx = dx / length;
  const ny = dy / length;

  // Calculate perpendicular vector (rotate 90 degrees)
  // For right offset: perpendicular = (-dy, dx)
  const perpX = -ny;
  const perpY = nx;

  // Convert meters to approximate degrees
  // At latitude ~41.6 (Tbilisi), 1 degree latitude ≈ 111km
  // 1 degree longitude ≈ 111km * cos(latitude) ≈ 83km
  const metersPerDegreeLat = 111000;
  const metersPerDegreeLon = 83000;

  const latOffset = (perpY * offsetMeters) / metersPerDegreeLat;
  const lonOffset = (perpX * offsetMeters) / metersPerDegreeLon;

  return { latOffset, lonOffset };
}

/**
 * Check if two points are close enough to be considered the same location
 */
function arePointsClose(p1: PolylinePoint, p2: PolylinePoint, thresholdDegrees = 0.0001): boolean {
  const latDiff = Math.abs(p1.latitude - p2.latitude);
  const lonDiff = Math.abs(p1.longitude - p2.longitude);
  return latDiff < thresholdDegrees && lonDiff < thresholdDegrees;
}

/**
 * Find overlapping segments between two polylines
 * Returns indices of segments in polyline1 that overlap with polyline2
 */
function findOverlappingSegments(
  polyline1: PolylinePoint[],
  polyline2: PolylinePoint[],
): Set<number> {
  const overlapping = new Set<number>();

  for (let i = 0; i < polyline1.length - 1; i++) {
    const p1Start = polyline1[i];
    const p1End = polyline1[i + 1];

    // Check if this segment overlaps with any segment in polyline2
    for (let j = 0; j < polyline2.length - 1; j++) {
      const p2Start = polyline2[j];
      const p2End = polyline2[j + 1];

      // Check if segments share points or are very close
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
 * Split polylines into overlapping and non-overlapping segments
 * Returns separate polylines for rendering with different styles
 */
export function splitPolylinesByOverlap(
  polyline1: PolylinePoint[],
  polyline2: PolylinePoint[],
  halfWidthMeters: number = 2,
): {
  polyline1Only: PolylinePoint[];
  polyline2Only: PolylinePoint[];
  polyline1Shared: PolylinePoint[];
  polyline2Shared: PolylinePoint[];
} {
  if (polyline1.length < 2 || polyline2.length < 2) {
    return {
      polyline1Only: polyline1,
      polyline2Only: polyline2,
      polyline1Shared: [],
      polyline2Shared: [],
    };
  }

  const overlapping1 = findOverlappingSegments(polyline1, polyline2);
  const overlapping2 = findOverlappingSegments(polyline2, polyline1);

  // Build separate polylines for overlapping and non-overlapping segments
  const polyline1Only: PolylinePoint[] = [];
  const polyline1Shared: PolylinePoint[] = [];

  for (let i = 0; i < polyline1.length; i++) {
    const point = polyline1[i];
    const isInOverlap = overlapping1.has(i) || overlapping1.has(i - 1);

    if (isInOverlap) {
      // Calculate offset for shared segment
      let offset = { latOffset: 0, lonOffset: 0 };

      if (i > 0 && overlapping1.has(i - 1)) {
        offset = calculatePerpendicularOffset(polyline1[i - 1], point, halfWidthMeters);
      } else if (i < polyline1.length - 1 && overlapping1.has(i)) {
        offset = calculatePerpendicularOffset(point, polyline1[i + 1], halfWidthMeters);
      }

      polyline1Shared.push({
        latitude: point.latitude + offset.latOffset,
        longitude: point.longitude + offset.lonOffset,
      });
    } else {
      polyline1Only.push(point);
    }
  }

  const polyline2Only: PolylinePoint[] = [];
  const polyline2Shared: PolylinePoint[] = [];

  for (let i = 0; i < polyline2.length; i++) {
    const point = polyline2[i];
    const isInOverlap = overlapping2.has(i) || overlapping2.has(i - 1);

    if (isInOverlap) {
      // Calculate offset for shared segment (opposite direction)
      let offset = { latOffset: 0, lonOffset: 0 };

      if (i > 0 && overlapping2.has(i - 1)) {
        offset = calculatePerpendicularOffset(polyline2[i - 1], point, -halfWidthMeters);
      } else if (i < polyline2.length - 1 && overlapping2.has(i)) {
        offset = calculatePerpendicularOffset(point, polyline2[i + 1], -halfWidthMeters);
      }

      polyline2Shared.push({
        latitude: point.latitude + offset.latOffset,
        longitude: point.longitude + offset.lonOffset,
      });
    } else {
      polyline2Only.push(point);
    }
  }

  return {
    polyline1Only,
    polyline2Only,
    polyline1Shared,
    polyline2Shared,
  };
}
