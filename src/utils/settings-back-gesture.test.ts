// @ts-nocheck
import { expect, it } from 'bun:test';
import { startsSettingsBackGesture, completesSettingsBackGesture } from './settings-back-gesture';

it('recognizes a rightward edge swipe, while leaving scrolling and carousels alone', () => {
  expect(startsSettingsBackGesture({ x0: 8, dx: 20, dy: 2 })).toBe(true);
  expect(startsSettingsBackGesture({ x0: 120, dx: 100, dy: 2 })).toBe(false);
  expect(startsSettingsBackGesture({ x0: 8, dx: 12, dy: 50 })).toBe(false);
  expect(startsSettingsBackGesture({ x0: 8, dx: -100, dy: 2 })).toBe(false);
});

it('goes back only on a deliberate swipe or flick, not an aborted touch', () => {
  expect(completesSettingsBackGesture({ dx: 90, dy: 5, vx: 0.1 })).toBe(true);
  expect(completesSettingsBackGesture({ dx: 40, dy: 5, vx: 0.6 })).toBe(true);
  expect(completesSettingsBackGesture({ dx: 25, dy: 2, vx: 0.1 })).toBe(false);
  expect(completesSettingsBackGesture({ dx: -90, dy: 0, vx: -0.8 })).toBe(false);
  expect(completesSettingsBackGesture({ dx: 90, dy: 150, vx: 0.8 })).toBe(false);
});
