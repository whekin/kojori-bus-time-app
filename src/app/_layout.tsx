import { DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGlobalSearchParams } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay, AppReveal } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { StartScreen } from '@/components/start-screen';
import { TripEditor } from '@/components/trip-editor';
import { WidgetSync } from '@/components/widget-sync';
import { AppColorsProvider, useAppColors, useResolvedAppThemeMode } from '@/hooks/use-app-colors';
import { useLocation } from '@/hooks/use-location';
import { SettingsProvider, useSettings } from '@/hooks/use-settings';
import { FavoritesProvider, useFavorites } from '@/transit/favorites';
import { nearbyFavorite } from '@/transit/model';
import { TripUiContext, type TripEditorOptions } from '@/transit/trip-ui';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,
      gcTime: 24 * 60 * 60_000,
    },
  },
});

const SMART_TRIP_GRACE_MS = 1800;

function AppReady() {
  const { isLoaded: settingsLoaded, settings } = useSettings();
  const { isLoaded: tripsLoaded, state, select } = useFavorites();
  const isLoaded = settingsLoaded && tripsLoaded;
  const [dismissedStart, setDismissedStart] = useState(false);
  const [forcedStartOpen, setForcedStartOpen] = useState(false);
  const [editor, setEditor] = useState<{ key: number; options: TripEditorOptions } | null>(null);
  const [waitingForSmart, setWaitingForSmart] = useState(false);
  const graceInitialized = useRef(false);
  const { widgetMode, widgetFavoriteId } = useGlobalSearchParams<{
    widgetMode?: string;
    widgetFavoriteId?: string;
  }>();
  const { resolvedLocation } = useLocation(settings.launchBehavior === 'smart');

  const launchedFromWidget =
    Boolean(widgetFavoriteId) || widgetMode === 'kojori' || widgetMode === 'tbilisi';

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', next =>
      focusManager.setFocused(next === 'active'),
    );
    return () => listener.remove();
  }, []);

  // Start a one-shot grace window the moment data hydrates, so a nearby trip
  // gets a short chance to resolve before we fall back to the trip chooser.
  useEffect(() => {
    if (!isLoaded || graceInitialized.current) return;
    graceInitialized.current = true;
    const eligible =
      settings.launchBehavior === 'smart' && !launchedFromWidget && state.favorites.length > 0;
    if (!eligible) return;

    setWaitingForSmart(true);
    const timeout = setTimeout(() => setWaitingForSmart(false), SMART_TRIP_GRACE_MS);
    return () => clearTimeout(timeout);
  }, [isLoaded, launchedFromWidget, settings.launchBehavior, state.favorites.length]);

  // A single unambiguous nearby trip skips the chooser.
  useEffect(() => {
    if (!waitingForSmart || !resolvedLocation) return;
    const nearby = nearbyFavorite(
      state.favorites,
      resolvedLocation.latitude,
      resolvedLocation.longitude,
    );
    if (nearby.status !== 'available') return;
    select(nearby.favorite.id);
    setDismissedStart(true);
    setWaitingForSmart(false);
  }, [resolvedLocation, select, state.favorites, waitingForSmart]);

  useEffect(() => {
    if (isLoaded && !waitingForSmart) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded, waitingForSmart]);

  // With no trips the chooser is the welcome screen; with one there is
  // nothing to choose.
  const showStart =
    forcedStartOpen ||
    (!dismissedStart &&
      state.favorites.length !== 1 &&
      (settings.launchBehavior !== 'remember' || state.favorites.length === 0) &&
      !launchedFromWidget);

  useEffect(() => {
    if (!isLoaded || !showStart || !forcedStartOpen || waitingForSmart || editor) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setForcedStartOpen(false);
      setDismissedStart(true);
      return true;
    });

    return () => subscription.remove();
  }, [editor, forcedStartOpen, isLoaded, showStart, waitingForSmart]);

  if (!isLoaded) return null;

  function handleStartDone() {
    setDismissedStart(true);
    setForcedStartOpen(false);
  }

  const tripUi = {
    openPicker: () => {
      setForcedStartOpen(true);
      setDismissedStart(false);
    },
    openEditor: (options: TripEditorOptions = {}) =>
      setEditor(prev => ({ key: (prev?.key ?? 0) + 1, options })),
  };

  function closeEditor() {
    setEditor(null);
    // A trip added from the chooser opens straight away.
    if (showStart && state.selectedId) handleStartDone();
  }

  return (
    <TripUiContext.Provider value={tripUi}>
      <WidgetSync />
      {!waitingForSmart ? (
        <AppReveal>
          <AppTabs
            backEnabled={!showStart && !editor}
            deferInactiveTabs={showStart}
            onRequestDirectionPicker={tripUi.openPicker}
          />
        </AppReveal>
      ) : null}
      {!waitingForSmart && showStart ? (
        <View style={styles.startOverlay}>
          <StartScreen onDone={handleStartDone} />
        </View>
      ) : null}
      {editor ? (
        <View style={styles.editorOverlay}>
          <TripEditor
            key={editor.key}
            options={editor.options}
            onClose={closeEditor}
            onRestart={tripUi.openEditor}
          />
        </View>
      ) : null}
      <AnimatedSplashOverlay />
    </TripUiContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F0B10',
  },
  appSurface: {
    flex: 1,
  },
  startOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
  },
  editorOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
  },
});

function AppThemeShell() {
  const colors = useAppColors();
  const resolvedMode = useResolvedAppThemeMode();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
  }, [colors.bg]);

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
      <StatusBar
        style={resolvedMode === 'light' ? 'dark' : 'light'}
      />
      <View style={[styles.appSurface, { backgroundColor: colors.bg }]}>
        <AppReady />
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <FavoritesProvider>
            <AppColorsProvider>
              <AppThemeShell />
            </AppColorsProvider>
          </FavoritesProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
