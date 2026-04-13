import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import PagerView from 'react-native-pager-view';
import React, { useRef, useState } from 'react';
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

import ExploreScreen from '@/app/explore';
import HomeScreen from '@/app/index';
import SettingsScreen from '@/app/settings';
import TimetableScreen from '@/app/timetable';

type TabRoute = 'index' | 'explore' | 'timetable' | 'settings';

const C = {
  bg: '#09090B',
  surface: '#111316',
  surfaceHigh: '#18191E',
  border: '#1E2128',
  text: '#EDEAE4',
  textDim: '#565C6B',
  amber: '#F5A20A',
  teal: '#10B8A3',
} as const;

const NAV_GAP = 10;
const NAV_PADDING = 10;

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
  tab: (typeof TABS)[number];
  index: number;
  activeIndex: number;
  pagerProgress: SharedValue<number>;
  onPress: () => void;
}) {
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

const TABS: Array<{
  route: TabRoute;
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  accent: string;
  render: (isActive: boolean) => React.ReactNode;
}> = [
  { route: 'index', title: 'Home', icon: 'home-variant', accent: C.amber, render: () => <HomeScreen /> },
  { route: 'explore', title: 'Map', icon: 'map-marker-radius', accent: '#7DD3FC', render: isActive => <ExploreScreen isActive={isActive} /> },
  { route: 'timetable', title: 'Timetable', icon: 'table-clock', accent: C.teal, render: () => <TimetableScreen /> },
  { route: 'settings', title: 'Settings', icon: 'cog', accent: C.text, render: () => <SettingsScreen /> },
];

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [navWidth, setNavWidth] = useState(0);
  const pagerProgress = useSharedValue(0);

  const pageScrollHandler = usePagerScrollHandler(event => {
    'worklet';
    pagerProgress.value = event.position + event.offset;
  });

  const tabWidth = navWidth > 0
    ? (navWidth - NAV_PADDING * 2 - NAV_GAP * (TABS.length - 1)) / TABS.length
    : 0;

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: NAV_PADDING + pagerProgress.value * (tabWidth + NAV_GAP),
      },
    ],
  }));

  return (
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
        {TABS.map((tab, index) => {
          return (
            <View key={tab.route} style={styles.page} collapsable={false}>
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
                  width: tabWidth,
                },
                highlightStyle,
              ]}
            />
          ) : null}
          {TABS.map((tab, index) => {
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
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: C.bg },
  pager: { flex: 1 },
  page: { width: '100%', height: '100%' },
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
