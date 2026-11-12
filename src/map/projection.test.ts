// @ts-nocheck
import { describe, expect, test } from 'bun:test';

import {
  boundsOf,
  cameraForBounds,
  camerasClose,
  fromMercator,
  projectToScreen,
  toMercator,
  zoomForLatitudeSpan,
  type LngLat,
} from './projection';

const KOJORI_STOPS: LngLat[] = [
  [44.7006, 41.6607],
  [44.7041, 41.6631],
  [44.7083, 41.6655],
  [44.7129, 41.6668],
];

describe('mercator', () => {
  test('round-trips a Tbilisi coordinate', () => {
    const point: LngLat = [44.8271, 41.7151];
    const { x, y } = toMercator(point);
    const [lng, lat] = fromMercator(x, y);
    expect(lng).toBeCloseTo(point[0], 9);
    expect(lat).toBeCloseTo(point[1], 9);
  });

  test('the camera centre projects to the view centre', () => {
    const camera = { center: [44.8, 41.7] as LngLat, zoom: 13.37 };
    expect(projectToScreen(camera.center, camera, { width: 390, height: 160 })).toEqual({ x: 195, y: 80 });
  });

  test('one zoom level doubles screen distance', () => {
    const size = { width: 400, height: 400 };
    const a = projectToScreen(KOJORI_STOPS[0], { center: KOJORI_STOPS[3], zoom: 14 }, size);
    const b = projectToScreen(KOJORI_STOPS[0], { center: KOJORI_STOPS[3], zoom: 15 }, size);
    expect(b.x - 200).toBeCloseTo((a.x - 200) * 2, 6);
    expect(b.y - 200).toBeCloseTo((a.y - 200) * 2, 6);
  });
});

describe('cameraForBounds', () => {
  const size = { width: 360, height: 150 };

  test('every point lands inside the padded rect, touching at least one edge', () => {
    const padding = { top: 12, right: 160, bottom: 16, left: 18 };
    const camera = cameraForBounds(boundsOf(KOJORI_STOPS)!, size, padding);
    const points = KOJORI_STOPS.map(stop => projectToScreen(stop, camera, size));

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(padding.left - 0.01);
      expect(point.x).toBeLessThanOrEqual(size.width - padding.right + 0.01);
      expect(point.y).toBeGreaterThanOrEqual(padding.top - 0.01);
      expect(point.y).toBeLessThanOrEqual(size.height - padding.bottom + 0.01);
    }
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const touchesX = Math.abs(Math.min(...xs) - padding.left) < 0.5 && Math.abs(Math.max(...xs) - (size.width - padding.right)) < 0.5;
    const touchesY = Math.abs(Math.min(...ys) - padding.top) < 0.5 && Math.abs(Math.max(...ys) - (size.height - padding.bottom)) < 0.5;
    expect(touchesX || touchesY).toBe(true);
  });

  test('a single point gets maxZoom and sits in the middle of the padded rect', () => {
    const camera = cameraForBounds(boundsOf([KOJORI_STOPS[0]])!, size, { top: 0, right: 100, bottom: 0, left: 0 }, { maxZoom: 15 });
    expect(camera.zoom).toBe(15);
    const point = projectToScreen(KOJORI_STOPS[0], camera, size);
    expect(point.x).toBeCloseTo(130, 6);
    expect(point.y).toBeCloseTo(75, 6);
  });

  test('zoom is clamped to the given range', () => {
    const wide = cameraForBounds([44, 41, 46, 43], size, undefined, { minZoom: 9 });
    expect(wide.zoom).toBe(9);
  });

  test('huge padding never produces a non-finite camera', () => {
    const camera = cameraForBounds(boundsOf(KOJORI_STOPS)!, { width: 10, height: 10 }, { top: 500, right: 500, bottom: 500, left: 500 });
    expect(Number.isFinite(camera.zoom)).toBe(true);
    expect(Number.isFinite(camera.center[0])).toBe(true);
    expect(Number.isFinite(camera.center[1])).toBe(true);
  });
});

describe('helpers', () => {
  test('zoomForLatitudeSpan inverts the projection', () => {
    const zoom = zoomForLatitudeSpan(0.02, 300, 41.7);
    const camera = { center: [44.8, 41.7] as LngLat, zoom };
    const top = projectToScreen([44.8, 41.71], camera, { width: 300, height: 300 });
    const bottom = projectToScreen([44.8, 41.69], camera, { width: 300, height: 300 });
    expect(bottom.y - top.y).toBeCloseTo(300, 0);
  });

  test('camerasClose ignores sub-metre jitter', () => {
    const a = { center: [44.8, 41.7] as LngLat, zoom: 14 };
    expect(camerasClose(a, { center: [44.800001, 41.700001], zoom: 14.001 })).toBe(true);
    expect(camerasClose(a, { center: [44.81, 41.7], zoom: 14 })).toBe(false);
  });
});
