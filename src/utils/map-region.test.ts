// @ts-nocheck
import { describe, expect, it } from 'bun:test';

import {
  buildPickerRegion,
  MAX_SPAN_DELTA,
  MIN_SPAN_DELTA,
  projectToView,
  regionsEqual,
} from './map-region';

const AKHVLEDIANI = { lat: 41.697618, lon: 44.809107 };
const BARATASHVILI = { lat: 41.694, lon: 44.807 };
const ASPECT = 360 / 150;

describe('buildPickerRegion', () => {
  it('returns null without stops', () => {
    expect(buildPickerRegion([], null, ASPECT)).toBeNull();
  });

  it('centres a single stop and keeps a readable minimum span', () => {
    const region = buildPickerRegion([AKHVLEDIANI], null, ASPECT)!;

    expect(region.latitude).toBeCloseTo(AKHVLEDIANI.lat, 6);
    expect(region.longitude).toBeCloseTo(AKHVLEDIANI.lon, 6);
    expect(region.latitudeDelta).toBeGreaterThanOrEqual(MIN_SPAN_DELTA);
  });

  it('matches the card aspect ratio so neither axis gets widened', () => {
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, ASPECT)!;

    expect(region.longitudeDelta / region.latitudeDelta).toBeCloseTo(ASPECT, 5);
  });

  it('frames the rider in when they are near the stops', () => {
    // ~1.6km east of the stops: close enough to matter, inside the cutoff.
    const nearby = { latitude: 41.6955, longitude: 44.829 };
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], nearby, ASPECT)!;
    const withoutUser = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, ASPECT)!;

    expect(region.longitudeDelta).toBeGreaterThan(withoutUser.longitudeDelta);
  });

  it('ignores a rider who is kilometres away rather than zooming the stops out', () => {
    const farAway = { latitude: 41.78, longitude: 44.95 };
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], farAway, ASPECT)!;
    const withoutUser = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, ASPECT)!;

    expect(region.latitude).toBeCloseTo(withoutUser.latitude, 6);
    expect(region.latitudeDelta).toBeCloseTo(withoutUser.latitudeDelta, 6);
  });

  it('never exceeds the maximum span', () => {
    const spread = [
      { lat: 41.6, lon: 44.7 },
      { lat: 41.9, lon: 45.0 },
    ];
    const region = buildPickerRegion(spread, null, ASPECT)!;

    expect(region.latitudeDelta).toBeLessThanOrEqual(MAX_SPAN_DELTA);
    expect(region.longitudeDelta).toBeLessThanOrEqual(MAX_SPAN_DELTA * ASPECT);
  });
});

describe('regionsEqual', () => {
  const base = { latitude: 41.69, longitude: 44.8, latitudeDelta: 0.01, longitudeDelta: 0.024 };

  it('treats sub-metre drift as the same camera', () => {
    expect(regionsEqual(base, { ...base, latitude: base.latitude + 0.000001 })).toBe(true);
  });

  it('separates a real move', () => {
    expect(regionsEqual(base, { ...base, latitudeDelta: 0.02 })).toBe(false);
  });

  it('handles nulls', () => {
    expect(regionsEqual(null, null)).toBe(true);
    expect(regionsEqual(base, null)).toBe(false);
  });
});

describe('projectToView', () => {
  const region = { latitude: 41.7, longitude: 44.8, latitudeDelta: 0.01, longitudeDelta: 0.024 };
  const size = { width: 360, height: 150 };

  it('puts the region centre at the centre of the view', () => {
    const point = projectToView({ latitude: 41.7, longitude: 44.8 }, region, size);

    expect(point.x).toBeCloseTo(180, 6);
    expect(point.y).toBeCloseTo(75, 6);
  });

  it('maps the north-west corner to the origin', () => {
    const point = projectToView({ latitude: 41.705, longitude: 44.788 }, region, size);

    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it('grows y southwards, not northwards', () => {
    const north = projectToView({ latitude: 41.703, longitude: 44.8 }, region, size);
    const south = projectToView({ latitude: 41.697, longitude: 44.8 }, region, size);

    expect(south.y).toBeGreaterThan(north.y);
  });

  it('places a stop off-frame outside the view bounds', () => {
    const point = projectToView({ latitude: 41.7, longitude: 44.9 }, region, size);

    expect(point.x).toBeGreaterThan(size.width);
  });
});
