import React, { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Tabs } from 'react-native-screens';

import ExploreScreen from '@/app/explore';
import HomeScreen from '@/app/index';
import SettingsScreen from '@/app/settings';
import TimetableScreen from '@/app/timetable';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { MapFocusProvider } from '@/hooks/use-map-focus';
import { TabNavProvider, type TabRoute } from '@/hooks/use-tab-nav';
import { scheduleIdleTask } from '@/utils/idle-task';

const ROUTES: TabRoute[] = ['index', 'explore', 'timetable', 'settings'];
const ICONS = ['bus', 'map', 'clock', 'gearshape'] as const;

// These are the same UIKit tab primitives used by Expo NativeTabs. Keeping the
// controlled host here preserves the existing screen state and map-focus bridge.
export default function AppTabs({
  deferInactiveTabs = false,
}: {
  backEnabled?: boolean;
  deferInactiveTabs?: boolean;
  onRequestDirectionPicker?: () => void;
}) {
  const colors = useAppColors();
  const { t } = useI18n();
  const [activeRoute, setActiveRoute] = useState<TabRoute>('index');
  const [mountedRoutes, setMountedRoutes] = useState<ReadonlySet<TabRoute>>(
    () => new Set(['index']),
  );
  const [mapSuspended, setMapSuspended] = useState(false);
  const provenance = useRef(0);
  const [navStateRequest, setNavStateRequest] = useState({ selectedScreenKey: 'index', baseProvenance: 0 });

  useEffect(() => {
    if (deferInactiveTabs) return;
    const tasks: ReturnType<typeof scheduleIdleTask>[] = [];
    const timers = ROUTES.slice(1).map((route, index) => setTimeout(() => {
      tasks.push(scheduleIdleTask(() => {
        setMountedRoutes(previous => new Set([...previous, route]));
      }));
    }, 500 + index * 700));
    return () => {
      timers.forEach(clearTimeout);
      tasks.forEach(task => task.cancel());
    };
  }, [deferInactiveTabs]);

  useEffect(() => {
    if (activeRoute === 'explore') return;
    const timer = setTimeout(() => setMapSuspended(activeRoute === 'settings'), 400);
    return () => clearTimeout(timer);
  }, [activeRoute]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const mode = Linking.parse(url).queryParams?.widgetMode;
      if (mode === 'kojori' || mode === 'tbilisi') {
        setActiveRoute('index');
        setNavStateRequest({ selectedScreenKey: 'index', baseProvenance: provenance.current });
      }
    });
    return () => subscription.remove();
  }, []);

  function showTab(route: TabRoute) {
    if (route === 'explore') setMapSuspended(false);
    setMountedRoutes(previous => previous.has(route) ? previous : new Set([...previous, route]));
    setActiveRoute(route);
  }

  function navigateToTab(route: TabRoute) {
    showTab(route);
    setNavStateRequest({ selectedScreenKey: route, baseProvenance: provenance.current });
  }

  const titles = [t('tabsDepartures'), t('tabsMap'), t('tabsTimetable'), t('tabsSettings')];

  return (
    <MapFocusProvider>
      <TabNavProvider value={navigateToTab}>
        <Tabs.Host
          navStateRequest={navStateRequest}
          rejectStaleNavStateUpdates
          colorScheme={colors.mode}
          nativeContainerStyle={{ backgroundColor: colors.bg }}
          ios={{ tabBarTintColor: colors.primary, tabBarMinimizeBehavior: 'never', tabBarControllerMode: 'tabBar' }}
          onTabSelected={({ nativeEvent }) => {
            provenance.current = nativeEvent.provenance;
            const route = ROUTES.find(candidate => candidate === nativeEvent.selectedScreenKey);
            if (route) showTab(route);
          }}
          onTabSelectionRejected={({ nativeEvent }) => {
            provenance.current = nativeEvent.provenance;
            const route = ROUTES.find(candidate => candidate === nativeEvent.selectedScreenKey);
            if (route) showTab(route);
          }}
        >
          {ROUTES.map((route, index) => (
            <Tabs.Screen
              key={route}
              screenKey={route}
              title={titles[index]}
              ios={{
                icon: { type: 'sfSymbol', name: ICONS[index] },
                selectedIcon: { type: 'sfSymbol', name: `${ICONS[index]}.fill` },
                overrideScrollViewContentInsetAdjustmentBehavior: false,
              }}
              tabBarItemTestID={`tab-${route}`}
              tabBarItemAccessibilityLabel={titles[index]}
              specialEffects={{ repeatedTabSelection: { popToRoot: false, scrollToTop: false } }}
            >
              <SafeAreaProvider>
                <SafeAreaView edges={['left', 'right']} testID={`native-screen-${route}`} collapsable={false} style={[styles.screen, { backgroundColor: colors.bg }]}>
                  {mountedRoutes.has(route) ? (
                    route === 'index' ? <HomeScreen isActive={activeRoute === route} /> :
                    route === 'explore' ? <ExploreScreen isActive={activeRoute === route} suspendNativeMap={mapSuspended} /> :
                    route === 'timetable' ? <TimetableScreen isActive={activeRoute === route} /> :
                    <SettingsScreen isActive={activeRoute === route} />
                  ) : null}
                </SafeAreaView>
              </SafeAreaProvider>
            </Tabs.Screen>
          ))}
        </Tabs.Host>
      </TabNavProvider>
    </MapFocusProvider>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, overflow: 'hidden' } });
