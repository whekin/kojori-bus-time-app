import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import {
  DEFAULT_APP_PALETTE,
  DEFAULT_APP_THEME_MODE,
  isAppPaletteId,
  type AppPaletteId,
  type AppThemeMode,
} from '@/constants/theme';
import {
  DEFAULT_KOJORI_FAVORITES,
  DEFAULT_TBILISI_FAVORITES,
} from '@/services/ttc';
import type { AppLanguage } from '@/i18n/languages';

const STORAGE_KEY = '@kojori_settings_v2';
export const DEFAULT_TBILISI_STOP_ID = '1:2994';
export const DEFAULT_KOJORI_STOP_ID = '1:3078';
/** Boarding stop used when the rider is nowhere near the route. */
export const DEFAULT_BOARDING_STOP_ID = {
  toKojori: DEFAULT_TBILISI_STOP_ID,
  toTbilisi: DEFAULT_KOJORI_STOP_ID,
} as const;
export type SharedDirection = 'toKojori' | 'toTbilisi';
/**
 * Governs what happens when the user opens the app:
 * - 'ask': open the favorites list.
 * - 'smart': suggest an unambiguous nearby favorite, otherwise show the list.
 * - 'remember': open the last selected favorite.
 */
export type LaunchBehavior = 'ask' | 'smart' | 'remember';
export type TtcHealthDemo = 'off' | 'degraded' | 'offline' | 'rate-limited' | 'device-offline' | 'schedule-stale';

export interface Settings {
  /** Stop IDs shown as chips on home screen (→ Tbilisi direction) */
  kojoriFavorites: string[];
  /** Stop IDs shown as chips on home screen (→ Kojori direction) */
  tbilisiFavorites: string[];
  /** Currently active Kojori stop (must be in kojoriFavorites) */
  activeKojoriStopId: string;
  /** Currently active Tbilisi stop (must be in tbilisiFavorites) */
  activeTbilisiStopId: string;
  /** Default widget stop when showing → Tbilisi */
  widgetKojoriStopId: string;
  /** Default widget stop when showing → Kojori */
  widgetTbilisiStopId: string;
  /** Legacy direction retained to migrate version-2 stop settings. */
  sharedDirection: SharedDirection;
  /** Selected visual palette for chrome + route accents */
  paletteId: AppPaletteId;
  /** Light, dark, or follow system */
  themeMode: AppThemeMode;
  /** Reveal hidden debug controls in Settings */
  debugOptionsUnlocked: boolean;
  /** Show deterministic demo states on Departures and Map for UI testing */
  cancelledBusDemo: boolean;
  /** Force TTC health UI states for testing */
  ttcHealthDemo: TtcHealthDemo;
  /** What to do on launch: ask, use location, or restore last direction */
  launchBehavior: LaunchBehavior;
  /** App language override, or follow device language */
  language: AppLanguage;
  /** Send the anonymous daily/weekly/monthly usage count (no ids) */
  shareUsageCount: boolean;
}

const DEFAULTS: Settings = {
  kojoriFavorites: DEFAULT_KOJORI_FAVORITES,
  tbilisiFavorites: DEFAULT_TBILISI_FAVORITES,
  activeKojoriStopId: DEFAULT_KOJORI_STOP_ID,
  activeTbilisiStopId: DEFAULT_TBILISI_STOP_ID,
  widgetKojoriStopId: DEFAULT_KOJORI_STOP_ID,
  widgetTbilisiStopId: DEFAULT_TBILISI_STOP_ID,
  sharedDirection: 'toKojori',
  paletteId: DEFAULT_APP_PALETTE,
  themeMode: DEFAULT_APP_THEME_MODE,
  debugOptionsUnlocked: false,
  cancelledBusDemo: false,
  ttcHealthDemo: 'off',
  launchBehavior: 'ask',
  language: 'system',
  shareUsageCount: true,
};

// Collapse the legacy two-toggle model (enableSmartDirection + skipStartScreen) onto the new enum.
function migrateLaunchBehavior(raw: Record<string, unknown>): LaunchBehavior {
  if (raw.launchBehavior === 'ask' || raw.launchBehavior === 'smart' || raw.launchBehavior === 'remember') {
    return raw.launchBehavior;
  }
  if (raw.enableSmartDirection) return 'smart';
  if (raw.skipStartScreen) return 'remember';
  return 'ask';
}

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  setSharedDirection: (direction: SharedDirection, manual?: boolean) => void;
  hasManualDirectionOverride: boolean;
  /** Toggle a stop in/out of the kojori favourites list */
  toggleKojoriFavorite: (stopId: string) => void;
  /** Toggle a stop in/out of the tbilisi favourites list */
  toggleTbilisiFavorite: (stopId: string) => void;
  isLoaded: boolean;
}

const Context = createContext<SettingsCtx>({
  settings: DEFAULTS,
  update: () => { },
  setSharedDirection: () => { },
  hasManualDirectionOverride: false,
  toggleKojoriFavorite: () => { },
  toggleTbilisiFavorite: () => { },
  isLoaded: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasManualDirectionOverride, setHasManualDirectionOverride] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const {
          enableSmartDirection: _legacySmart,
          skipStartScreen: _legacySkip,
          hasSeenSmartDirectionPrompt: _legacyPrompt,
          ...rest
        } = parsed;
        const launchBehavior = migrateLaunchBehavior(parsed);
        const paletteId = isAppPaletteId(rest.paletteId) ? rest.paletteId : DEFAULT_APP_PALETTE;
        setSettings({ ...DEFAULTS, ...(rest as Partial<Settings>), launchBehavior, paletteId });
      })
      .catch(() => { })
      .finally(() => setIsLoaded(true));
  }, []);

  const persist = (next: Settings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => { });
    return next;
  };

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const hasChanges = (Object.entries(patch) as [keyof Settings, Settings[keyof Settings]][])
        .some(([key, value]) => prev[key] !== value);
      if (!hasChanges) return prev;

      return persist({ ...prev, ...patch });
    });
  }, []);

  const setSharedDirection = useCallback((direction: SharedDirection, manual = true) => {
    setHasManualDirectionOverride(manual);
    setSettings(prev => {
      if (prev.sharedDirection === direction) {
        return prev;
      }

      return persist({
        ...prev,
        sharedDirection: direction,
      });
    });
  }, []);

  const toggleKojoriFavorite = useCallback((stopId: string) => {
    setSettings(prev => {
      const already = prev.kojoriFavorites.includes(stopId);
      // Must keep at least one favourite
      if (already && prev.kojoriFavorites.length === 1) return prev;

      const next = already
        ? prev.kojoriFavorites.filter(id => id !== stopId)
        : [...prev.kojoriFavorites, stopId];

      // If we removed the active stop, switch to the first remaining
      const activeKojoriStopId =
        already && prev.activeKojoriStopId === stopId
          ? next[0]
          : prev.activeKojoriStopId;

      return persist({ ...prev, kojoriFavorites: next, activeKojoriStopId });
    });
  }, []);

  const toggleTbilisiFavorite = useCallback((stopId: string) => {
    setSettings(prev => {
      const already = prev.tbilisiFavorites.includes(stopId);
      if (already && prev.tbilisiFavorites.length === 1) return prev;

      const next = already
        ? prev.tbilisiFavorites.filter(id => id !== stopId)
        : [...prev.tbilisiFavorites, stopId];

      const activeTbilisiStopId =
        already && prev.activeTbilisiStopId === stopId
          ? next[0]
          : prev.activeTbilisiStopId;

      return persist({ ...prev, tbilisiFavorites: next, activeTbilisiStopId });
    });
  }, []);

  return React.createElement(
    Context.Provider,
    { value: { settings, update, setSharedDirection, hasManualDirectionOverride, toggleKojoriFavorite, toggleTbilisiFavorite, isLoaded } },
    children,
  );
}

export function useSettings() {
  return useContext(Context);
}
