import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { prefillRoutePolylineCache } from '@/hooks/use-route-polylines';
import { SettingsProvider } from '@/hooks/use-settings';
import { prefillScheduleCache } from '@/hooks/use-schedule';
import { prefillStopNames } from '@/hooks/use-stop-names';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,
    },
  },
});

// Runs once: loads persisted schedule caches into QueryClient so screens
// have data immediately without waiting for a network round-trip.
function CachePrefiller() {
  useEffect(() => {
    prefillScheduleCache(queryClient);
    prefillRoutePolylineCache(queryClient);
    prefillStopNames(queryClient);
  }, []);
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <CachePrefiller />
            <AnimatedSplashOverlay />
            <AppTabs />
          </ThemeProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
