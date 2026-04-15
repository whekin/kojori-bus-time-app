import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay, AppReveal } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AppColorsProvider } from '@/hooks/use-app-colors';
import { SettingsProvider, useSettings } from '@/hooks/use-settings';
import {
  hydrateTtcOfflineData,
  isBakedScheduleCurrent,
  loadBakedData,
  warmTtcOfflineData,
} from '@/services/ttc-offline';

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
    let isActive = true;

    void (async () => {
      // 1. Instantly seed from baked asset — zero network, zero I/O.
      loadBakedData(queryClient);

      // 2. Overlay with anything the user has previously fetched from AsyncStorage.
      await hydrateTtcOfflineData(queryClient);

      // 3. Only hit the network if today's schedule isn't covered by the baked data
      //    or previously cached data. Polylines/stops never auto-refresh.
      if (isActive && !isBakedScheduleCurrent()) {
        await warmTtcOfflineData(queryClient);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  return null;
}

function AppReady() {
  const { isLoaded } = useSettings();

  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  if (!isLoaded) return null;

  return (
    <>
      <CachePrefiller />
      <AppReveal>
        <AppTabs />
      </AppReveal>
      <AnimatedSplashOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <AppColorsProvider>
            <ThemeProvider value={DarkTheme}>
              <AppReady />
            </ThemeProvider>
          </AppColorsProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
