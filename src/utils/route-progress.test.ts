// @ts-nocheck
import { describe, expect, it } from 'bun:test';

import type { PolylinePoint } from '@/services/ttc';
import {
  buildPolylineMetrics,
  distanceMeters,
  headingAlongPolyline,
  interpolatePolylineAtDistance,
  projectPointToPolyline,
  projectStopToRoute,
} from './route-progress';

// Around Tbilisi's latitude one degree of latitude is ~111.2km and one degree
// of longitude is ~83.1km. Points are spaced 0.001° so segments stay ~100m.
const BASE = { latitude: 41.7, longitude: 44.8 };
const LAT_STEP_METERS = 111_195; // haversine meters per degree of latitude
const LON_STEP_METERS = LAT_STEP_METERS * Math.cos((41.7 * Math.PI) / 180);

function northLine(steps: number): PolylinePoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    latitude: BASE.latitude + index * 0.001,
    longitude: BASE.longitude,
  }));
}

function eastLine(steps: number): PolylinePoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    latitude: BASE.latitude,
    longitude: BASE.longitude + index * 0.001,
  }));
}

describe('distanceMeters', () => {
  it('returns zero for identical points', () => {
    expect(distanceMeters(BASE, { ...BASE })).toBe(0);
  });

  it('matches the meters-per-degree approximation along latitude', () => {
    const meters = distanceMeters(BASE, { latitude: 41.71, longitude: 44.8 });
    expect(Math.abs(meters - 0.01 * LAT_STEP_METERS)).toBeLessThan(20);
  });

  it('accounts for latitude when measuring along longitude', () => {
    const meters = distanceMeters(BASE, { latitude: 41.7, longitude: 44.81 });
    expect(Math.abs(meters - 0.01 * LON_STEP_METERS)).toBeLessThan(20);
  });
});

describe('buildPolylineMetrics', () => {
  it('accumulates segment lengths monotonically', () => {
    const metrics = buildPolylineMetrics(northLine(4));
    expect(metrics.cumulativeMeters).toHaveLength(5);
    expect(metrics.cumulativeMeters[0]).toBe(0);
    for (let index = 1; index < metrics.cumulativeMeters.length; index++) {
      expect(metrics.cumulativeMeters[index]).toBeGreaterThan(metrics.cumulativeMeters[index - 1]);
    }
    expect(metrics.totalMeters).toBe(metrics.cumulativeMeters[4]);
    expect(Math.abs(metrics.totalMeters - 4 * 0.001 * LAT_STEP_METERS)).toBeLessThan(10);
  });

  it('handles a single point', () => {
    const metrics = buildPolylineMetrics([BASE]);
    expect(metrics.totalMeters).toBe(0);
    expect(metrics.cumulativeMeters).toEqual([0]);
  });
});

describe('projectPointToPolyline', () => {
  const metrics = buildPolylineMetrics(northLine(4));

  it('returns null for an empty polyline', () => {
    expect(projectPointToPolyline(BASE, buildPolylineMetrics([]))).toBeNull();
  });

  it('projects an on-route point with near-zero off-route distance', () => {
    const midway = { latitude: BASE.latitude + 0.002, longitude: BASE.longitude };
    const projected = projectPointToPolyline(midway, metrics);
    expect(projected).not.toBeNull();
    expect(projected!.offRouteMeters).toBeLessThan(1);
    expect(Math.abs(projected!.distanceMeters - metrics.totalMeters / 2)).toBeLessThan(5);
  });

  it('reports the perpendicular offset as off-route meters', () => {
    const offset = 50 / LON_STEP_METERS;
    const beside = { latitude: BASE.latitude + 0.002, longitude: BASE.longitude + offset };
    const projected = projectPointToPolyline(beside, metrics);
    expect(projected).not.toBeNull();
    expect(Math.abs(projected!.offRouteMeters - 50)).toBeLessThan(2);
    expect(Math.abs(projected!.distanceMeters - metrics.totalMeters / 2)).toBeLessThan(5);
  });

  it('clamps points before the start and past the end', () => {
    const before = projectPointToPolyline(
      { latitude: BASE.latitude - 0.002, longitude: BASE.longitude },
      metrics,
    );
    expect(before!.distanceMeters).toBe(0);

    const after = projectPointToPolyline(
      { latitude: BASE.latitude + 0.006, longitude: BASE.longitude },
      metrics,
    );
    expect(Math.abs(after!.distanceMeters - metrics.totalMeters)).toBeLessThan(1);
  });
});

describe('interpolatePolylineAtDistance', () => {
  const metrics = buildPolylineMetrics(northLine(4));

  it('clamps to the endpoints', () => {
    expect(interpolatePolylineAtDistance(metrics, -50)!.point).toEqual(metrics.points[0]);
    const end = interpolatePolylineAtDistance(metrics, metrics.totalMeters + 500)!;
    expect(end.point.latitude).toBeCloseTo(metrics.points[4].latitude, 6);
    expect(end.distanceMeters).toBe(metrics.totalMeters);
  });

  it('interpolates linearly inside a segment', () => {
    const quarter = interpolatePolylineAtDistance(metrics, metrics.totalMeters / 4)!;
    expect(Math.abs(quarter.point.latitude - (BASE.latitude + 0.001))).toBeLessThan(0.0001);
    expect(quarter.point.longitude).toBeCloseTo(BASE.longitude, 8);
  });

  it('round-trips with projectPointToPolyline', () => {
    const target = metrics.totalMeters * 0.6;
    const interpolated = interpolatePolylineAtDistance(metrics, target)!;
    const projected = projectPointToPolyline(interpolated.point, metrics)!;
    expect(Math.abs(projected.distanceMeters - target)).toBeLessThan(1);
    expect(projected.offRouteMeters).toBeLessThan(1);
  });
});

describe('headingAlongPolyline', () => {
  it('reports ~0° heading going north and ~90° going east', () => {
    const north = buildPolylineMetrics(northLine(2));
    const east = buildPolylineMetrics(eastLine(2));
    const northHeading = headingAlongPolyline(north, 10, 20)!;
    const eastHeading = headingAlongPolyline(east, 10, 20)!;
    expect(Math.min(northHeading, 360 - northHeading)).toBeLessThan(1);
    expect(Math.abs(eastHeading - 90)).toBeLessThan(1);
  });

  it('blends the corner when the lookahead crosses a turn', () => {
    // North for one segment, then east for one segment.
    const corner = buildPolylineMetrics([
      BASE,
      { latitude: BASE.latitude + 0.001, longitude: BASE.longitude },
      { latitude: BASE.latitude + 0.001, longitude: BASE.longitude + 0.001 },
    ]);
    const nearCorner = headingAlongPolyline(corner, 100, 40)!;
    expect(nearCorner).toBeGreaterThan(5);
    expect(nearCorner).toBeLessThan(85);
  });

  it('stays within [0, 360) heading northwest', () => {
    const northwest = buildPolylineMetrics([
      BASE,
      { latitude: BASE.latitude + 0.001, longitude: BASE.longitude - 0.001 },
    ]);
    const heading = headingAlongPolyline(northwest, 10, 20)!;
    expect(heading).toBeGreaterThanOrEqual(0);
    expect(heading).toBeLessThan(360);
    expect(Math.abs(heading - 323)).toBeLessThan(3);
  });

  it('falls back to the final segment heading at the route end', () => {
    const metrics = buildPolylineMetrics(northLine(2));
    const heading = headingAlongPolyline(metrics, metrics.totalMeters, 20)!;
    expect(Math.min(heading, 360 - heading)).toBeLessThan(1);
  });
});

describe('projectStopToRoute', () => {
  const metrics = buildPolylineMetrics(northLine(4));

  it('returns null for stops without coordinates', () => {
    expect(projectStopToRoute({ id: '1:1', label: 'x' }, metrics)).toBeNull();
    expect(projectStopToRoute(null, metrics)).toBeNull();
  });

  it('projects a stop with coordinates like a raw point', () => {
    const stop = { id: '1:1', label: 'x', lat: BASE.latitude + 0.002, lon: BASE.longitude };
    const viaStop = projectStopToRoute(stop, metrics)!;
    const viaPoint = projectPointToPolyline(
      { latitude: stop.lat, longitude: stop.lon },
      metrics,
    )!;
    expect(viaStop.distanceMeters).toBe(viaPoint.distanceMeters);
  });
});
