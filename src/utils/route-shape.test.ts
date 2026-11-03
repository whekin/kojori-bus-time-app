// @ts-expect-error Bun provides the test module at runtime.
import { describe, expect, it } from 'bun:test';

import { routeShape } from './route-shape';

const line = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ latitude: 41.7, longitude: 44.7 + i * 0.001 }));

describe('routeShape', () => {
  it('fits the route inside the padded box, west to east left to right', () => {
    const shape = routeShape(line(50), undefined, 200, 100, 10)!;
    expect(shape.full.startsWith('M10 50')).toBe(true);
    expect(shape.end).toEqual({ x: 190, y: 50 });
  });

  it('starts the ride at the point nearest the boarding stop', () => {
    const shape = routeShape(line(11), { lat: 41.7, lon: 44.705 }, 200, 100, 10)!;
    expect(shape.stop).toEqual({ x: 100, y: 50 });
    expect(shape.ahead.startsWith('M100 50')).toBe(true);
  });

  it('keeps proportions: a north–south route stays tall and narrow', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ latitude: 41.7 + i * 0.001, longitude: 44.7 }));
    const shape = routeShape(points, undefined, 200, 100, 10)!;
    expect(shape.end.x).toBe(100);
    expect(shape.end.y).toBe(10);
  });

  it('thins long geometry and gives up on unusable input', () => {
    const shape = routeShape(line(5000), undefined, 200, 100)!;
    expect(shape.full.split('L').length).toBeLessThanOrEqual(161);
    expect(routeShape(line(1), undefined, 200, 100)).toBeNull();
    expect(routeShape(line(5), undefined, 10, 10, 8)).toBeNull();
  });
});
