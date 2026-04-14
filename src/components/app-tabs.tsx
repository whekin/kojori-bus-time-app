import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import PagerView from 'react-native-pager-view';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useEvent,
  useHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppColors } from '@/constants/theme';
import ExploreScreen from '@/app/explore';
import HomeScreen from '@/app/index';
import SettingsScreen from '@/app/settings';
import TimetableScreen from '@/app/timetable';
import { useAppColors } from '@/hooks/use-app-colors';

type TabRoute = 'index' | 'explore' | 'timetable' | 'settings';

const TabNavContext = createContext<((route: TabRoute) => void) | null>(null);

export function useTabNav() {
  return useContext(TabNavContext);
}

type TabItem = {
  route: TabRoute;
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  accent: string;
  render: (isActive: boolean) => React.ReactNode;
};

const NAV_GAP = 10;
const NAV_PADDING = 10;
const NAV_HIGHLIGHT_EXTRA = 8;

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);
const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

function usePagerScrollHandler(onPageScroll: (event: { position: number; offset: number }) => void) {
  const { doDependenciesDiffer } = useHandler({ onPageScroll }, []);

  return useEvent(
    event => {
      'worklet';
      const handler = onPageScroll;
      if (handler && event.eventName.endsWith('onPageScroll')) {
        handler(event as unknown as { position: number; offset: number });
      }
    },
    ['onPageScroll'],
    doDependenciesDiffer,
  );
}

function TabButton({
  tab,
  index,
  activeIndex,
  pagerProgress,
  onPress,
}: {
  tab: TabItem;
  index: number;
  activeIndex: number;
  pagerProgress: SharedValue<number>;
  onPress: () => void;
}) {
  const C = useAppColors();
  const styles = React.useMemo(() => createStyles(C), [C]);
  const iconStyle = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(pagerProgress.value - index), 1);
    const color = interpolateColor(distance, [0, 1], [tab.accent, C.textDim]);

    return {
      color,
      opacity: 1 - distance * 0.15,
      transform: [{ scale: 1 - distance * 0.04 }],
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(pagerProgress.value - index), 1);
    const color = interpolateColor(distance, [0, 1], [C.text, C.textDim]);

    return {
      color,
      opacity: 1 - distance * 0.2,
    };
  });

  return (
    <Pressable
      style={styles.navButton}
      android_ripple={{ color: 'transparent' }}
      onPress={() => {
        if (index === activeIndex) return;
        onPress();
      }}>
      <AnimatedIcon
        name={tab.icon}
        size={20}
        style={iconStyle}
      />
      <Animated.Text style={[styles.navLabel, labelStyle]}>
        {tab.title}
      </Animated.Text>
    </Pressable>
  );
}

export default function AppTabs() {
  const C = useAppColors();
  const styles = React.useMemo(() => createStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [navWidth, setNavWidth] = useState(0);
  const pagerProgress = useSharedValue(0);
  const tabs: TabItem[] = [
    { route: 'index', title: 'Departures', icon: 'bus-clock', accent: C.route380, render: () => <HomeScreen /> },
    { route: 'explore', title: 'Map', icon: 'map-marker-radius', accent: C.map, render: isActive => <ExploreScreen isActive={isActive} /> },
    { route: 'timetable', title: 'Timetable', icon: 'table-clock', accent: C.route316, render: () => <TimetableScreen /> },
    { route: 'settings', title: 'Settings', icon: 'cog', accent: C.primary, render: () => <SettingsScreen /> },
  ];

  const navigateToTab = useCallback((route: TabRoute) => {
    const idx = tabs.findIndex(t => t.route === route);
    if (idx >= 0) pagerRef.current?.setPage(idx);
  }, []);

  const pageScrollHandler = usePagerScrollHandler(event => {
    'worklet';
    pagerProgress.value = event.position + event.offset;
  });

  const tabWidth = navWidth > 0
    ? (navWidth - NAV_PADDING * 2 - NAV_GAP * (tabs.length - 1)) / tabs.length
    : 0;

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: NAV_PADDING - NAV_HIGHLIGHT_EXTRA / 2 + pagerProgress.value * (tabWidth + NAV_GAP),
      },
    ],
  }));

  return (
    <TabNavContext.Provider value={navigateToTab}>
    <View style={styles.shell}>
      <AnimatedPagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        offscreenPageLimit={3}
        overScrollMode="never"
        onPageScroll={pageScrollHandler}
        onPageSelected={event => {
          const nextIndex = event.nativeEvent.position;
          pagerProgress.value = nextIndex;
          if (nextIndex === activeIndex) return;
          setActiveIndex(nextIndex);
        }}>
        {tabs.map((tab, index) => {
          return (
            <View key={tab.route} style={styles.page}>
              {tab.render(activeIndex === index)}
            </View>
          );
        })}
      </AnimatedPagerView>

      <View style={[styles.navWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View
          style={styles.navBar}
          onLayout={event => {
            setNavWidth(event.nativeEvent.layout.width);
          }}>
          {tabWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.navHighlight,
                {
                  width: tabWidth + NAV_HIGHLIGHT_EXTRA,
                },
                highlightStyle,
              ]}
            />
          ) : null}
          {tabs.map((tab, index) => {
            return (
              <TabButton
                key={tab.route}
                tab={tab}
                index={index}
                activeIndex={activeIndex}
                pagerProgress={pagerProgress}
                onPress={() => {
                  pagerRef.current?.setPage(index);
                }}
              />
            );
          })}
        </View>
      </View>
    </View>
    </TabNavContext.Provider>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    shell: { flex: 1, backgroundColor: C.bg },
    pager: { flex: 1 },
    page: { flex: 1 },
    navWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      backgroundColor: C.bg,
    },
    navBar: {
      position: 'relative',
      flexDirection: 'row',
      gap: 10,
      padding: 10,
      borderTopWidth: 1,
      borderTopColor: C.border,
      backgroundColor: C.bg,
    },
    navHighlight: {
      position: 'absolute',
      top: NAV_PADDING,
      bottom: NAV_PADDING,
      borderRadius: 18,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.surfaceHigh,
    },
    navButton: {
      flex: 1,
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      zIndex: 1,
    },
    navLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
}
