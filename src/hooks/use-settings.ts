import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  DEFAULT_KOJORI_FAVORITES,
  DEFAULT_TBILISI_FAVORITES,
} from '@/services/ttc';
import { syncAndroidWidgetState } from '@/services/android-widget';

const STORAGE_KEY = '@kojori_settings_v2';
export type SharedDirection = 'toKojori' | 'toTbilisi';

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
  /** Shared route direction used by Home and Timetable */
  sharedDirection: SharedDirection;
}

const DEFAULTS: Settings = {
  kojoriFavorites: DEFAULT_KOJORI_FAVORITES,
  tbilisiFavorites: DEFAULT_TBILISI_FAVORITES,
  activeKojoriStopId: DEFAULT_KOJORI_FAVORITES[0],
  activeTbilisiStopId: DEFAULT_TBILISI_FAVORITES[0],
  widgetKojoriStopId: DEFAULT_KOJORI_FAVORITES[0],
  widgetTbilisiStopId: DEFAULT_TBILISI_FAVORITES[0],
  sharedDirection: 'toKojori',
};

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
  update: () => {},
  setSharedDirection: () => {},
  hasManualDirectionOverride: false,
  toggleKojoriFavorite: () => {},
  toggleTbilisiFavorite: () => {},
  isLoaded: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasManualDirectionOverride, setHasManualDirectionOverride] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    if (!isLoaded || Platform.OS !== 'android') return;

    function syncWidget() {
      return syncAndroidWidgetState({
        widgetKojoriStopId: settings.widgetKojoriStopId,
        widgetTbilisiStopId: settings.widgetTbilisiStopId,
      }).catch(() => {});
    }

    void syncWidget();

    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void syncWidget();
      }
    });

    const intervalId = setInterval(() => {
      void syncWidget();
    }, 5 * 60_000);

    return () => {
      appState.remove();
      clearInterval(intervalId);
    };
  }, [
    isLoaded,
    settings.widgetKojoriStopId,
    settings.widgetTbilisiStopId,
  ]);

  const persist = (next: Settings) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  };

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => persist({ ...prev, ...patch }));
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
