import React, { createContext, useContext, useMemo } from 'react';

import {
  DEFAULT_APP_PALETTE,
  getAppColors,
  resolveAppThemeMode,
  type AppResolvedThemeMode,
  type AppColors,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSettings } from '@/hooks/use-settings';

const AppColorsContext = createContext<AppColors>(getAppColors(DEFAULT_APP_PALETTE));
const AppThemeModeContext = createContext<AppResolvedThemeMode>('dark');

export function AppColorsProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoaded } = useSettings();
  const systemScheme = useColorScheme();
  const resolvedMode = useMemo(
    () => resolveAppThemeMode(settings.themeMode, systemScheme),
    [settings.themeMode, systemScheme],
  );
  const targetColors = useMemo(
    () => getAppColors(settings.paletteId, resolvedMode),
    [resolvedMode, settings.paletteId],
  );
  if (!isLoaded) return null;

  return React.createElement(
    AppThemeModeContext.Provider,
    { value: resolvedMode },
    React.createElement(
      AppColorsContext.Provider,
      { value: targetColors },
      children,
    ),
  );
}

export function useAppColors() {
  return useContext(AppColorsContext);
}

export function useResolvedAppThemeMode() {
  return useContext(AppThemeModeContext);
}
