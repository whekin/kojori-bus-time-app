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
const VIEW = { width: 360, height: 150 };

describe('buildPickerRegion', () => {
  it('returns null without stops', () => {
    expect(buildPickerRegion([], null, VIEW)).toBeNull();
  });

  it('centres a single stop and keeps a readable minimum span', () => {
    const region = buildPickerRegion([AKHVLEDIANI], null, VIEW)!;

    expect(region.latitude).toBeCloseTo(AKHVLEDIANI.lat, 6);
    expect(region.longitude).toBeCloseTo(AKHVLEDIANI.lon, 6);
    expect(region.latitudeDelta).toBeGreaterThanOrEqual(MIN_SPAN_DELTA);
  });

  it('matches the card aspect ratio so neither axis gets widened', () => {
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, VIEW)!;

    expect(region.longitudeDelta / region.latitudeDelta).toBeCloseTo(VIEW.width / VIEW.height, 5);
  });

  it('frames the rider in when they are near the stops', () => {
    // ~1.6km east of the stops: close enough to matter, inside the cutoff.
    const nearby = { latitude: 41.6955, longitude: 44.829 };
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], nearby, VIEW)!;
    const withoutUser = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, VIEW)!;

    expect(region.longitudeDelta).toBeGreaterThan(withoutUser.longitudeDelta);
  });

  it('ignores a rider who is kilometres away rather than zooming the stops out', () => {
    const farAway = { latitude: 41.78, longitude: 44.95 };
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], farAway, VIEW)!;
    const withoutUser = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, VIEW)!;

    expect(region.latitude).toBeCloseTo(withoutUser.latitude, 6);
    expect(region.latitudeDelta).toBeCloseTo(withoutUser.latitudeDelta, 6);
  });

  it('never exceeds the maximum span', () => {
    const spread = [
      { lat: 41.6, lon: 44.7 },
      { lat: 41.9, lon: 45.0 },
    ];
    const region = buildPickerRegion(spread, null, VIEW)!;

    expect(region.latitudeDelta).toBeLessThanOrEqual(MAX_SPAN_DELTA);
    expect(region.longitudeDelta).toBeLessThanOrEqual(MAX_SPAN_DELTA * (VIEW.width / VIEW.height));
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

describe('buildPickerRegion with reserved chrome', () => {
  const stops = [AKHVLEDIANI, BARATASHVILI];
  const inset = { width: 360, height: 150, insetRight: 140, insetBottom: 22 };

  it('keeps the stops clear of the reserved edges', () => {
    const region = buildPickerRegion(stops, null, inset)!;
    const points = stops.map(stop =>
      projectToView({ latitude: stop.lat, longitude: stop.lon }, region, inset),
    );

    const usableRight = inset.width - inset.insetRight;
    const usableBottom = inset.height - inset.insetBottom;
    for (const point of points) {
      expect(point.x).toBeLessThanOrEqual(usableRight);
      expect(point.y).toBeLessThanOrEqual(usableBottom);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('covers the whole view, not just the usable part', () => {
    const region = buildPickerRegion(stops, null, inset)!;
    const plain = buildPickerRegion(stops, null, { width: 360, height: 150 })!;

    expect(region.longitudeDelta).toBeGreaterThan(plain.longitudeDelta * 0.9);
    expect(region.longitude).toBeGreaterThan(plain.longitude);
  });
});

describe('buildPickerRegion with a degenerate viewport', () => {
  it('stays within valid coordinate spans when chrome would swallow the card', () => {
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, {
      width: 100,
      height: 40,
      insetRight: 400,
      insetBottom: 400,
    })!;

    expect(region.longitudeDelta).toBeLessThanOrEqual(180);
    expect(region.latitudeDelta).toBeLessThanOrEqual(90);
    expect(Number.isFinite(region.latitude)).toBe(true);
    expect(Number.isFinite(region.longitude)).toBe(true);
  });
});

describe('buildPickerRegion margin', () => {
  const view = { width: 360, height: 150, insetRight: 140, insetBottom: 22, margin: 26 };

  it('keeps every stop a marker-width away from the edges', () => {
    const region = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, view)!;

    for (const stop of [AKHVLEDIANI, BARATASHVILI]) {
      const point = projectToView({ latitude: stop.lat, longitude: stop.lon }, region, view);
      expect(point.x).toBeGreaterThanOrEqual(view.margin - 0.001);
      expect(point.y).toBeGreaterThanOrEqual(view.margin - 0.001);
      expect(point.x).toBeLessThanOrEqual(view.width - view.insetRight - view.margin + 0.001);
      expect(point.y).toBeLessThanOrEqual(view.height - view.insetBottom - view.margin + 0.001);
    }
  });

  it('zooms out when the margin grows', () => {
    const tight = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, { ...view, margin: 4 })!;
    const roomy = buildPickerRegion([AKHVLEDIANI, BARATASHVILI], null, { ...view, margin: 40 })!;

    expect(roomy.latitudeDelta).toBeGreaterThan(tight.latitudeDelta);
  });
});

describe('buildPickerRegion inset placement', () => {
  const stops = [AKHVLEDIANI, BARATASHVILI];

  it('keeps stops below a reserved top band', () => {
    const view = { width: 412, height: 320, insetTop: 100, insetBottom: 16, margin: 18 };
    const region = buildPickerRegion(stops, null, view)!;

    for (const stop of stops) {
      const point = projectToView({ latitude: stop.lat, longitude: stop.lon }, region, view);
      expect(point.y).toBeGreaterThanOrEqual(view.insetTop + view.margin - 0.001);
    }
  });

  it('costs height for a band and width for a column, so neither always wins', () => {
    const tall = { width: 412, height: 320, insetBottom: 16, margin: 18 };
    // These two stops are strung out north to south, so the band eats the very
    // axis they need and the column is the better trade.
    const northSouth = [AKHVLEDIANI, BARATASHVILI];
    const column = buildPickerRegion(northSouth, null, { ...tall, insetRight: 174 })!;
    const band = buildPickerRegion(northSouth, null, { ...tall, insetTop: 100 })!;
    expect(column.latitudeDelta).toBeLessThan(band.latitudeDelta);

    // Spread east to west instead and the trade flips.
    const eastWest = [
      { lat: 41.6955, lon: 44.79 },
      { lat: 41.6965, lon: 44.83 },
    ];
    const columnWide = buildPickerRegion(eastWest, null, { ...tall, insetRight: 174 })!;
    const bandWide = buildPickerRegion(eastWest, null, { ...tall, insetTop: 100 })!;
    expect(bandWide.latitudeDelta).toBeLessThan(columnWide.latitudeDelta);
  });
});
