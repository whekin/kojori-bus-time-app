import type { PolylinePoint } from '@/services/ttc';

export type RouteShape = {
  /** The whole pattern, as an SVG path in the box's coordinates. */
  full: string;
  /** From the boarding stop to the end of the pattern: the ride itself. */
  ahead: string;
  stop: { x: number; y: number };
  end: { x: number; y: number };
};

const MAX_POINTS = 160;

/**
 * Fits a route's real geometry into a `width × height` box, north up, keeping
 * its proportions. Longitude is scaled by cos(latitude) so a serpentine looks
 * like itself rather than stretched sideways.
 */
export function routeShape(
  points: PolylinePoint[],
  boarding: { lat?: number; lon?: number } | undefined,
  width: number,
  height: number,
  padding = 8,
): RouteShape | null {
  if (points.length < 2 || width <= padding * 2 || height <= padding * 2) return null;
  const step = Math.ceil(points.length / MAX_POINTS);
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const meanLat = sampled.reduce((sum, p) => sum + p.latitude, 0) / sampled.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  const xs = sampled.map(p => p.longitude * kx);
  const ys = sampled.map(p => -p.latitude);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-9, spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  const project = (i: number) => ({
    x: Math.round((offsetX + (xs[i] - minX) * scale) * 10) / 10,
    y: Math.round((offsetY + (ys[i] - minY) * scale) * 10) / 10,
  });
  const projected = sampled.map((_, i) => project(i));

  let from = 0;
  if (typeof boarding?.lat === 'number' && typeof boarding.lon === 'number') {
    const bx = boarding.lon * kx, by = -boarding.lat;
    let best = Infinity;
    sampled.forEach((_, i) => {
      const d = (xs[i] - bx) ** 2 + (ys[i] - by) ** 2;
      if (d < best) {
        best = d;
        from = i;
      }
    });
  }
  if (from >= projected.length - 1) from = Math.max(0, projected.length - 2);

  const path = (list: { x: number; y: number }[]) =>
    list.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
  return {
    full: path(projected),
    ahead: path(projected.slice(from)),
    stop: projected[from],
    end: projected[projected.length - 1],
  };
}
