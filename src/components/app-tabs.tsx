import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import PagerView from 'react-native-pager-view';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useEvent,
  useHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, type AppColors } from '@/constants/theme';
import ExploreScreen from '@/app/explore';
import HomeScreen from '@/app/index';
import SettingsScreen from '@/app/settings';
import TimetableScreen from '@/app/timetable';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { MapFocusProvider } from '@/hooks/use-map-focus';
import { TabNavProvider, type TabRoute } from '@/hooks/use-tab-nav';
import { scheduleIdleTask } from '@/utils/idle-task';


type TabItem = {
  route: TabRoute;
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  render: (isActive: boolean) => React.ReactNode;
};

const NAV_GAP = 10;
const NAV_PADDING = 10;
const NAV_HIGHLIGHT_EXTRA = 8;
const TAB_ROUTES: TabRoute[] = ['index', 'explore', 'timetable', 'settings'];
const ALL_TAB_INDEXES = new Set(TAB_ROUTES.map((_, index) => index));

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
    const color = interpolateColor(distance, [0, 1], [C.primary, C.textDim]);

    return {
      color,
      opacity: 1 - distance * 0.15,
      transform: [{ scale: 1 - distance * 0.04 }],
    };
  }, [C.primary, C.textDim, index]);

  const labelStyle = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(pagerProgress.value - index), 1);
    const color = interpolateColor(distance, [0, 1], [C.text, C.textDim]);

    return {
      color,
      opacity: 1 - distance * 0.2,
    };
  }, [C.text, C.textDim, index]);

  return (
    <Pressable
      style={styles.navButton}
      android_ripple={{ color: 'transparent' }}
      accessibilityRole="tab"
      accessibilityLabel={tab.title}
      accessibilityState={{ selected: index === activeIndex }}
      onPress={() => {
        if (index === activeIndex) return;
        onPress();
      }}>
      <AnimatedIcon
        name={tab.icon}
        size={20}
        style={iconStyle}
      />
      <Animated.Text
        style={[styles.navLabel, labelStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}>
        {tab.title}
      </Animated.Text>
    </Pressable>
  );
}

export default function AppTabs({
  backEnabled = true,
  deferInactiveTabs = false,
  onRequestDirectionPicker,
}: {
  backEnabled?: boolean;
  deferInactiveTabs?: boolean;
  onRequestDirectionPicker?: () => void;
}) {
  const C = useAppColors();
  const styles = React.useMemo(() => createStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const tabHistoryRef = useRef<number[]>([0]);
  const [mountedIndexes, setMountedIndexes] = useState<ReadonlySet<number>>(() => new Set([0]));
  const [navWidth, setNavWidth] = useState(0);
  const pagerProgress = useSharedValue(0);
  const { t } = useI18n();
  const tabs: TabItem[] = [
    { route: 'index', title: t('tabsDepartures'), icon: 'bus-clock', render: isActive => <HomeScreen isActive={isActive} /> },
    { route: 'explore', title: t('tabsMap'), icon: 'map-marker-radius', render: isActive => <ExploreScreen isActive={isActive} /> },
    { route: 'timetable', title: t('tabsTimetable'), icon: 'table-clock', render: () => <TimetableScreen /> },
    { route: 'settings', title: t('tabsSettings'), icon: 'cog', render: () => <SettingsScreen /> },
  ];

  useEffect(() => {
    if (deferInactiveTabs) return;

    const handle = scheduleIdleTask(() => {
      setMountedIndexes(ALL_TAB_INDEXES);
    });

    return () => handle.cancel();
  }, [deferInactiveTabs]);

  const mountTab = useCallback((index: number) => {
    setMountedIndexes(prev => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const navigateToTab = useCallback((route: TabRoute) => {
    const idx = TAB_ROUTES.indexOf(route);
    if (idx >= 0) {
      mountTab(idx);
      pagerRef.current?.setPage(idx);
    }
  }, [mountTab]);

  useEffect(() => {
    if (!backEnabled) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const history = tabHistoryRef.current;

      if (history.length > 1) {
        history.pop();
        const previousIndex = history[history.length - 1] ?? 0;
        mountTab(previousIndex);
        pagerRef.current?.setPage(previousIndex);
        return true;
      }

      if (activeIndex !== 0) {
        mountTab(0);
        pagerRef.current?.setPage(0);
        tabHistoryRef.current = [0];
        return true;
      }

      if (onRequestDirectionPicker) {
        onRequestDirectionPicker();
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [activeIndex, backEnabled, mountTab, onRequestDirectionPicker]);

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
    <MapFocusProvider>
      <TabNavProvider value={navigateToTab}>
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
              mountTab(nextIndex);
              if (nextIndex === activeIndex) return;
              tabHistoryRef.current = [
                ...tabHistoryRef.current.filter(index => index !== nextIndex),
                nextIndex,
              ];
              setActiveIndex(nextIndex);
            }}>
            {tabs.map((tab, index) => {
              return (
                <View key={tab.route} style={styles.page}>
                  {mountedIndexes.has(index) ? tab.render(activeIndex === index) : null}
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
                      backgroundColor: alpha(C.primary, C.mode === 'dark' ? '22' : '18'),
                      borderColor: alpha(C.primary, C.mode === 'dark' ? '66' : '55'),
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
                      mountTab(index);
                      pagerRef.current?.setPage(index);
                    }}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </TabNavProvider>
    </MapFocusProvider>
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
      letterSpacing: 0,
      textAlign: 'center',
      maxWidth: '100%',
    },
  });
}
