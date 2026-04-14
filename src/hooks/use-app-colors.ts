import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_APP_PALETTE,
  getAppColors,
  type AppColors,
} from '@/constants/theme';
import { useSettings } from '@/hooks/use-settings';

const TRANSITION_MS = 260;
const COLOR_KEYS = [
  'bg',
  'surface',
  'surfaceHigh',
  'surfaceRaised',
  'panel',
  'panelHigh',
  'border',
  'borderStrong',
  'text',
  'textDim',
  'textFaint',
  'primary',
  'route380',
  'route316',
  'live',
  'warning',
  'error',
  'sand',
  'rose',
  'map',
] as const satisfies ReadonlyArray<keyof AppColors>;

const AppColorsContext = createContext<AppColors>(getAppColors(DEFAULT_APP_PALETTE));

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized;

  const int = Number.parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColor(from: string, to: string, progress: number) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);

  return rgbToHex({
    r: start.r + (end.r - start.r) * progress,
    g: start.g + (end.g - start.g) * progress,
    b: start.b + (end.b - start.b) * progress,
  });
}

function mixPalette(from: AppColors, to: AppColors, progress: number): AppColors {
  const mixed = { ...to } as AppColors;

  for (const key of COLOR_KEYS) {
    (mixed as Record<string, string>)[key] = mixColor(from[key], to[key], progress);
  }

  return mixed;
}

export function AppColorsProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoaded } = useSettings();
  const targetColors = useMemo(() => getAppColors(settings.paletteId), [settings.paletteId]);
  const [animatedColors, setAnimatedColors] = useState<AppColors | null>(null);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef<AppColors | null>(null);
  const currentRef = useRef<AppColors | null>(null);

  // Once settings load, jump straight to the correct palette — no animation
  useEffect(() => {
    if (isLoaded && animatedColors === null) {
      setAnimatedColors(targetColors);
      currentRef.current = targetColors;
      fromRef.current = targetColors;
    }
  }, [isLoaded, targetColors]);

  useEffect(() => {
    // Don't animate until initial palette is set
    if (animatedColors === null) return;

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const from = currentRef.current!;
    const to = targetColors;

    if (from.id === to.id) {
      setAnimatedColors(to);
      currentRef.current = to;
      fromRef.current = to;
      return;
    }

    fromRef.current = from;
    const start = Date.now();

    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(1, elapsed / TRANSITION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = mixPalette(fromRef.current, to, eased);

      setAnimatedColors(next);
      currentRef.current = next;

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      currentRef.current = to;
      setAnimatedColors(to);
      frameRef.current = null;
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [targetColors, animatedColors]);

  if (animatedColors === null) return null;

  return React.createElement(
    AppColorsContext.Provider,
    { value: animatedColors },
    children,
  );
}

export function useAppColors() {
  return useContext(AppColorsContext);
}
