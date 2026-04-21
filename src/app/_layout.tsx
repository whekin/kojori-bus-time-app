import { DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGlobalSearchParams } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay, AppReveal } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { StartScreen } from '@/components/start-screen';
import { AppColorsProvider, useAppColors, useResolvedAppThemeMode } from '@/hooks/use-app-colors';
import { getClosestStopCandidate } from '@/hooks/use-closest-stop';
import { useLocation } from '@/hooks/use-location';
import { useRouteStops } from '@/hooks/use-route-stops';
import { SettingsProvider, useSettings, type SharedDirection } from '@/hooks/use-settings';
import { prefillStopNames } from '@/hooks/use-stop-names';
import {
  hydrateTtcOfflineData,
  loadBakedData,
} from '@/services/ttc-offline';
import { hydrateTtcQueryLog } from '@/services/ttc-query-log';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,
    },
  },
});

function CachePrefiller() {
  useEffect(() => {
    void (async () => {
      // 1. Instantly seed from baked asset — zero network, zero I/O.
      loadBakedData(queryClient);
      await prefillStopNames(queryClient);
      await hydrateTtcQueryLog();

      // 2. Overlay with anything the user has previously saved in AsyncStorage.
      await hydrateTtcOfflineData(queryClient);
    })();
  }, []);

  return null;
}

const SMART_DIRECTION_GRACE_MS = 1800;

function AppReady() {
  const { isLoaded, settings, setSharedDirection, update } = useSettings();
  const [dismissedStart, setDismissedStart] = useState(false);
  const [waitingForSmart, setWaitingForSmart] = useState(false);
  const graceInitialized = useRef(false);
  const { widgetMode } = useGlobalSearchParams<{ widgetMode?: string }>();
  const { suggestedMode, resolvedLocation } = useLocation(settings.launchBehavior === 'smart');
  const { stops: toKojoriStops } = useRouteStops('toKojori');
  const { stops: toTbilisiStops } = useRouteStops('toTbilisi');

  const launchedFromWidget = widgetMode === 'kojori' || widgetMode === 'tbilisi';

  // Start a one-shot grace window the moment settings hydrate, so smart direction
  // gets a short chance to resolve before we fall back to the start screen.
  useEffect(() => {
    if (!isLoaded || graceInitialized.current) return;
    graceInitialized.current = true;
    const eligible = settings.launchBehavior === 'smart' && !launchedFromWidget;
    if (!eligible) return;

    setWaitingForSmart(true);
    const timeout = setTimeout(() => setWaitingForSmart(false), SMART_DIRECTION_GRACE_MS);
    return () => clearTimeout(timeout);
  }, [isLoaded, launchedFromWidget, settings.launchBehavior]);

  // If smart direction resolves during the grace window, auto-skip to the app.
  useEffect(() => {
    if (!waitingForSmart || !suggestedMode || !resolvedLocation) return;
    const direction: SharedDirection = suggestedMode === 'kojori' ? 'toKojori' : 'toTbilisi';
    const routeStops = direction === 'toKojori' ? toKojoriStops : toTbilisiStops;
    const closestStopResult = getClosestStopCandidate(routeStops, resolvedLocation);
    if (closestStopResult.status !== 'available' || !closestStopResult.closestStop) return;

    if (direction === 'toKojori') {
      update({ activeTbilisiStopId: closestStopResult.closestStop.id });
    } else {
      update({ activeKojoriStopId: closestStopResult.closestStop.id });
    }

    setSharedDirection(direction, false);
    setDismissedStart(true);
    setWaitingForSmart(false);
  }, [resolvedLocation, setSharedDirection, suggestedMode, toKojoriStops, toTbilisiStops, update, waitingForSmart]);

  useEffect(() => {
    if (isLoaded && !waitingForSmart) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded, waitingForSmart]);

  if (!isLoaded) return null;

  const showStart =
    !dismissedStart && settings.launchBehavior !== 'remember' && !launchedFromWidget;

  return (
    <>
      <CachePrefiller />
      {waitingForSmart ? null : showStart ? (
        <StartScreen onDone={() => setDismissedStart(true)} />
      ) : (
        <AppReveal>
          <AppTabs />
        </AppReveal>
      )}
      <AnimatedSplashOverlay />
    </>
  );
}

function AppThemeShell() {
  const colors = useAppColors();
  const resolvedMode = useResolvedAppThemeMode();

  const navigationTheme: Theme = {
    dark: resolvedMode === 'dark',
    colors: {
      ...DefaultTheme.colors,
      primary: colors.primary,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.error,
    },
    fonts: DefaultTheme.fonts,
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <AppReady />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <AppColorsProvider>
            <AppThemeShell />
          </AppColorsProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
