import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import PagerView from "react-native-pager-view";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, InteractionManager, Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useEvent,
  useHandler,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha, type AppColors } from "@/constants/theme";
import ExploreScreen from "@/app/explore";
import HomeScreen from "@/app/index";
import SettingsScreen from "@/app/settings";
import TimetableScreen from "@/app/timetable";
import { useAppColors } from "@/hooks/use-app-colors";
import { useI18n } from "@/hooks/use-i18n";
import { MapFocusProvider } from "@/hooks/use-map-focus";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { TabNavProvider, type TabRoute } from "@/hooks/use-tab-nav";

type TabItem = {
  route: TabRoute;
  title: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  render: (isActive: boolean) => React.ReactNode;
};

const NAV_GAP = 6;
const NAV_PADDING = 5;
const NAV_HIGHLIGHT_EXTRA = 2;
const NAV_PROGRESS_TIMING = { duration: 220 };
const NAV_PROGRESS_REDUCED_TIMING = { duration: 1 };
const PRELOAD_INACTIVE_TABS_DELAY_MS = 900;
const TAB_ROUTES: TabRoute[] = ["index", "explore", "timetable", "settings"];
const ALL_TAB_INDEXES = new Set(TAB_ROUTES.map((_, index) => index));
const INITIAL_TAB_INDEXES = new Set([0, 1]);

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);
const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

function usePagerScrollHandler(
  onPageScroll: (event: { position: number; offset: number }) => void,
) {
  const { doDependenciesDiffer } = useHandler({ onPageScroll }, []);

  return useEvent(
    (event) => {
      "worklet";
      const handler = onPageScroll;
      if (handler && event.eventName.endsWith("onPageScroll")) {
        handler(event as unknown as { position: number; offset: number });
      }
    },
    ["onPageScroll"],
    doDependenciesDiffer,
  );
}

function TabButton({
  tab,
  index,
  activeIndex,
  pagerProgress,
  reduceMotion,
  onPress,
}: {
  tab: TabItem;
  index: number;
  activeIndex: number;
  pagerProgress: SharedValue<number>;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const C = useAppColors();
  const styles = React.useMemo(() => createStyles(C), [C]);
  const iconColor = index === activeIndex ? C.primary : C.textDim;
  const pressProgress = useSharedValue(0);
  const activationPulse = useSharedValue(0);

  useEffect(() => {
    if (index !== activeIndex || reduceMotion) return;

    activationPulse.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 180 }),
    );
  }, [activeIndex, activationPulse, index, reduceMotion]);

  const iconStyle = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(pagerProgress.value - index), 1);
    const pressScale = 1 - pressProgress.value * 0.12;
    const activeScale = 1 + activationPulse.value * 0.08;

    return {
      opacity: 1 - distance * 0.15,
      transform: [
        { translateY: pressProgress.value * 2 - activationPulse.value * 1.5 },
        { scale: (1 - distance * 0.04) * pressScale * activeScale },
      ],
    };
  }, [index]);

  const labelStyle = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(pagerProgress.value - index), 1);
    const color = interpolateColor(distance, [0, 1], [C.primary, C.textDim]);

    return {
      color,
      opacity: 1 - distance * 0.2,
    };
  }, [C.primary, C.textDim, index]);

  return (
    <Pressable
      style={styles.navButton}
      android_ripple={{ color: "transparent" }}
      accessibilityRole="tab"
      accessibilityLabel={tab.title}
      accessibilityState={{ selected: index === activeIndex }}
      onPressIn={() => {
        pressProgress.value = withTiming(1, { duration: reduceMotion ? 1 : 80 });
      }}
      onPressOut={() => {
        pressProgress.value = withTiming(0, { duration: reduceMotion ? 1 : 140 });
      }}
      onPress={() => {
        if (index === activeIndex) return;
        onPress();
      }}
    >
      <AnimatedIcon
        name={tab.icon}
        size={22}
        color={iconColor}
        style={iconStyle}
      />
      <Animated.Text
        style={[styles.navLabel, labelStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
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
  const [mountedIndexes, setMountedIndexes] = useState<ReadonlySet<number>>(
    () => (deferInactiveTabs ? new Set([0]) : INITIAL_TAB_INDEXES),
  );
  const [navWidth, setNavWidth] = useState(0);
  const pagerProgress = useSharedValue(0);
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const navProgressTiming = reduceMotion ? NAV_PROGRESS_REDUCED_TIMING : NAV_PROGRESS_TIMING;
  const tabs: TabItem[] = [
    {
      route: "index",
      title: t("tabsDepartures"),
      icon: "bus-clock",
      render: (isActive) => <HomeScreen isActive={isActive} />,
    },
    {
      route: "explore",
      title: t("tabsMap"),
      icon: "map-marker-radius",
      render: (isActive) => <ExploreScreen isActive={isActive} />,
    },
    {
      route: "timetable",
      title: t("tabsTimetable"),
      icon: "table-clock",
      render: (isActive) => <TimetableScreen isActive={isActive} />,
    },
    {
      route: "settings",
      title: t("tabsSettings"),
      icon: "cog",
      render: (isActive) => <SettingsScreen isActive={isActive} />,
    },
  ];

  useEffect(() => {
    if (deferInactiveTabs) return;

    let cancelled = false;
    let preloadTimeout: ReturnType<typeof setTimeout> | null = null;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      preloadTimeout = setTimeout(() => {
        if (!cancelled) setMountedIndexes(ALL_TAB_INDEXES);
      }, PRELOAD_INACTIVE_TABS_DELAY_MS);
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel?.();
      if (preloadTimeout) clearTimeout(preloadTimeout);
    };
  }, [deferInactiveTabs]);

  useEffect(() => {
    if (deferInactiveTabs) return;

    setMountedIndexes((prev) => {
      let next: Set<number> | null = null;
      for (const index of [activeIndex - 1, activeIndex, activeIndex + 1]) {
        if (index < 0 || index >= TAB_ROUTES.length || prev.has(index)) continue;
        next ??= new Set(prev);
        next.add(index);
      }

      return next ?? prev;
    });
  }, [activeIndex, deferInactiveTabs]);

  const mountTab = useCallback((index: number) => {
    setMountedIndexes((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const navigateToTab = useCallback(
    (route: TabRoute) => {
      const idx = TAB_ROUTES.indexOf(route);
      if (idx >= 0) {
        mountTab(idx);
        pagerProgress.value = withTiming(idx, navProgressTiming);
        pagerRef.current?.setPage(idx);
      }
    },
    [mountTab, navProgressTiming, pagerProgress],
  );

  useEffect(() => {
    if (!backEnabled) return;

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        const history = tabHistoryRef.current;

        if (history.length > 1) {
          history.pop();
          const previousIndex = history[history.length - 1] ?? 0;
          mountTab(previousIndex);
          pagerProgress.value = withTiming(previousIndex, navProgressTiming);
          pagerRef.current?.setPage(previousIndex);
          return true;
        }

        if (activeIndex !== 0) {
          mountTab(0);
          pagerProgress.value = withTiming(0, navProgressTiming);
          pagerRef.current?.setPage(0);
          tabHistoryRef.current = [0];
          return true;
        }

        if (onRequestDirectionPicker) {
          onRequestDirectionPicker();
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [activeIndex, backEnabled, mountTab, navProgressTiming, onRequestDirectionPicker, pagerProgress]);

  const pageScrollHandler = usePagerScrollHandler((event) => {
    "worklet";
    pagerProgress.value = event.position + event.offset;
  });

  const tabWidth =
    navWidth > 0
      ? (navWidth - NAV_PADDING * 2 - NAV_GAP * (tabs.length - 1)) / tabs.length
      : 0;

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          NAV_PADDING -
          NAV_HIGHLIGHT_EXTRA / 2 +
          pagerProgress.value * (tabWidth + NAV_GAP),
      },
    ],
  }));

  const pager = (
    <AnimatedPagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={0}
      offscreenPageLimit={3}
      overScrollMode="never"
      onPageScroll={pageScrollHandler}
      onPageSelected={(event) => {
        const nextIndex = event.nativeEvent.position;
        pagerProgress.value = withTiming(nextIndex, navProgressTiming);
        mountTab(nextIndex);
        if (nextIndex === activeIndex) return;
        tabHistoryRef.current = [
          ...tabHistoryRef.current.filter((index) => index !== nextIndex),
          nextIndex,
        ];
        setActiveIndex(nextIndex);
      }}
    >
      {tabs.map((tab, index) => {
        return (
          <View key={tab.route} style={styles.page}>
            {mountedIndexes.has(index)
              ? tab.render(activeIndex === index)
              : null}
          </View>
        );
      })}
    </AnimatedPagerView>
  );

  return (
    <MapFocusProvider>
      <TabNavProvider value={navigateToTab}>
        <View style={styles.shell}>
          <View style={styles.pagerTarget}>{pager}</View>

          <View
            style={[
              styles.navWrap,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <Svg pointerEvents="none" style={styles.navFade}>
              <Defs>
                <LinearGradient id="navFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={C.bg} stopOpacity="0" />
                  <Stop offset="0.48" stopColor={C.bg} stopOpacity="0.78" />
                  <Stop offset="1" stopColor={C.bg} stopOpacity="0.96" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#navFade)" />
            </Svg>
            <View
              style={styles.navBar}
              onLayout={(event) => {
                setNavWidth(event.nativeEvent.layout.width);
              }}
            >
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
                >
                  <View
                    pointerEvents="none"
                    style={[
                      styles.navHighlightTint,
                      {
                        backgroundColor: alpha(
                          C.primary,
                          C.mode === "dark" ? "1C" : "11",
                        ),
                      },
                    ]}
                  />
                </Animated.View>
              ) : null}
              {tabs.map((tab, index) => {
                return (
                  <TabButton
                    key={tab.route}
                    tab={tab}
                    index={index}
                    activeIndex={activeIndex}
                    pagerProgress={pagerProgress}
                    reduceMotion={reduceMotion}
                    onPress={() => {
                      mountTab(index);
                      pagerProgress.value = withTiming(
                        index,
                        navProgressTiming,
                      );
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
    pagerTarget: { flex: 1 },
    pager: { flex: 1 },
    page: { flex: 1 },
    navWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 18,
      paddingTop: 34,
      backgroundColor: "transparent",
    },
    navFade: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    navBar: {
      position: "relative",
      flexDirection: "row",
      gap: NAV_GAP,
      minHeight: 60,
      padding: NAV_PADDING,
      borderRadius: 30,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: alpha(C.border, C.mode === "dark" ? "80" : "72"),
      backgroundColor: alpha(C.surface, C.mode === "dark" ? "D9" : "D8"),
      shadowColor: "#000000",
      shadowOpacity: C.mode === "dark" ? 0.2 : 0.07,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
      overflow: "hidden",
    },
    navHighlight: {
      position: "absolute",
      top: NAV_PADDING,
      bottom: NAV_PADDING,
      borderRadius: 24,
      overflow: "hidden",
    },
    navHighlightTint: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 24,
    },
    navButton: {
      flex: 1,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      zIndex: 1,
    },
    navLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: "800",
      letterSpacing: 0,
      textAlign: "center",
      maxWidth: "100%",
    },
  });
}
