/** An iOS back gesture starts at the left edge and yields to vertical scrolling. */
export function startsSettingsBackGesture({ x0, dx, dy }: { x0: number; dx: number; dy: number }) {
  return x0 <= 32 && dx > 12 && dx > Math.abs(dy) * 1.5;
}

export function completesSettingsBackGesture({ dx, dy, vx }: { dx: number; dy: number; vx: number }) {
  return dx > Math.abs(dy) * 1.5 && (dx >= 80 || (dx >= 35 && vx >= 0.4));
}
