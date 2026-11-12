import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ExploreScreen from "@/app/explore";
import HomeScreen from "@/app/index";
import SettingsScreen from "@/app/settings";
import TimetableScreen from "@/app/timetable";
import { alpha, MaxContentWidth, type AppColors } from "@/constants/theme";
import { useAppColors } from "@/hooks/use-app-colors";
import { useI18n } from "@/hooks/use-i18n";
import { MapFocusProvider } from "@/hooks/use-map-focus";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { TabNavProvider, type TabRoute } from "@/hooks/use-tab-nav";
import { scheduleIdleTask } from "@/utils/idle-task";

const ROUTES: TabRoute[] = ["index", "explore", "timetable", "settings"];
// The map stays unmounted until first opened, so a visit that never looks at
// it never downloads tiles; the light screens are warmed while idle.
const PREWARM: TabRoute[] = ["timetable", "settings"];

function routeForPath(pathname: string): TabRoute {
  const segment = pathname.replace(/^\/+/, "").split("/")[0];
  return (ROUTES as string[]).includes(segment) ? (segment as TabRoute) : "index";
}

// Same geometry as the Android bar in app-tabs.tsx.
const NAV_GAP = 6;
const NAV_PADDING = 5;
const NAV_HIGHLIGHT_EXTRA = 2;

const HREFS = {
  index: "/",
  explore: "/explore",
  timetable: "/timetable",
  settings: "/settings",
} as const satisfies Record<TabRoute, string>;

/**
 * Same shape as the native hosts: every screen is imported here and kept
 * mounted once visited, so switching tabs is a visibility flip rather than a
 * route load. The URL follows the active tab, and browser back walks tabs.
 */
export default function AppTabs({
  deferInactiveTabs = false,
}: {
  backEnabled?: boolean;
  deferInactiveTabs?: boolean;
  onRequestDirectionPicker?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const colors = useAppColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const activeRoute = routeForPath(pathname);
  const activeIndex = ROUTES.indexOf(activeRoute);
  const progress = useSharedValue(activeIndex);
  const [navWidth, setNavWidth] = useState(0);
  const [mounted, setMounted] = useState<ReadonlySet<TabRoute>>(() => new Set([activeRoute]));

  if (!mounted.has(activeRoute)) setMounted(new Set([...mounted, activeRoute]));

  useEffect(() => {
    if (deferInactiveTabs) return;
    const tasks = PREWARM.map((route, index) => {
      let task: ReturnType<typeof scheduleIdleTask> | undefined;
      const timer = setTimeout(() => {
        task = scheduleIdleTask(() => setMounted(previous =>
          previous.has(route) ? previous : new Set([...previous, route])));
      }, 600 + index * 600);
      return () => {
        clearTimeout(timer);
        task?.cancel();
      };
    });
    return () => tasks.forEach(cancel => cancel());
  }, [deferInactiveTabs]);

  useEffect(() => {
    progress.value = reduceMotion ? activeIndex : withTiming(activeIndex, { duration: 220 });
  }, [activeIndex, progress, reduceMotion]);

  const tabWidth = navWidth > 0
    ? (navWidth - NAV_PADDING * 2 - NAV_GAP * (ROUTES.length - 1)) / ROUTES.length
    : 0;
  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: NAV_PADDING - NAV_HIGHLIGHT_EXTRA / 2 + progress.value * (tabWidth + NAV_GAP),
    }],
  }));

  function navigate(route: TabRoute) {
    if (route === activeRoute) return;
    router.push(HREFS[route]);
  }

  const tabs = [
    { route: "index", title: t("tabsDepartures"), icon: "bus-clock" },
    { route: "explore", title: t("tabsMap"), icon: "map-marker-radius" },
    { route: "timetable", title: t("tabsTimetable"), icon: "table-clock" },
    { route: "settings", title: t("tabsSettings"), icon: "cog" },
  ] as const;

  function screenFor(route: TabRoute) {
    const isActive = route === activeRoute;
    switch (route) {
      case "index":
        return <HomeScreen isActive={isActive} />;
      case "explore":
        return <ExploreScreen isActive={isActive} />;
      case "timetable":
        return <TimetableScreen isActive={isActive} />;
      case "settings":
        return <SettingsScreen isActive={isActive} />;
    }
  }

  return (
    <MapFocusProvider>
      <TabNavProvider value={navigate}>
        <View style={styles.root}>
          {ROUTES.filter(route => mounted.has(route)).map(route => (
            <View
              key={route}
              style={[styles.page, route !== activeRoute && styles.hidden]}
              aria-hidden={route !== activeRoute}>
              {screenFor(route)}
            </View>
          ))}
          <View
            pointerEvents="box-none"
            style={[styles.navWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Svg pointerEvents="none" width="100%" height="100%" style={styles.navFade}>
              <Defs>
                <LinearGradient id="navFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.bg} stopOpacity="0" />
                  <Stop offset="0.48" stopColor={colors.bg} stopOpacity="0.78" />
                  <Stop offset="1" stopColor={colors.bg} stopOpacity="0.96" />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#navFade)" />
            </Svg>
            <View
              accessibilityRole="tablist"
              style={styles.navBar}
              onLayout={event => setNavWidth(event.nativeEvent.layout.width)}>
              {tabWidth > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.navHighlight, { width: tabWidth + NAV_HIGHLIGHT_EXTRA }, highlightStyle]}
                />
              ) : null}
              {tabs.map((tab, index) => (
                <TabButton
                  key={tab.route}
                  icon={tab.icon}
                  title={tab.title}
                  index={index}
                  activeIndex={activeIndex}
                  progress={progress}
                  reduceMotion={reduceMotion}
                  onPress={() => navigate(tab.route)}
                />
              ))}
            </View>
          </View>
        </View>
      </TabNavProvider>
    </MapFocusProvider>
  );
}

function TabButton({
  icon,
  title,
  index,
  activeIndex,
  progress,
  reduceMotion,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  index: number;
  activeIndex: number;
  progress: SharedValue<number>;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const C = useAppColors();
  const styles = React.useMemo(() => createStyles(C), [C]);
  const focused = index === activeIndex;
  const pressProgress = useSharedValue(0);
  const activationPulse = useSharedValue(0);

  useEffect(() => {
    if (!focused || reduceMotion) return;
    activationPulse.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 180 }),
    );
  }, [activationPulse, focused, reduceMotion]);

  const iconStyle = useAnimatedStyle(() => {
    const distance = Math.min(Math.abs(progress.value - index), 1);
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
    const distance = Math.min(Math.abs(progress.value - index), 1);
    return {
      color: interpolateColor(distance, [0, 1], [C.primary, C.textDim]),
      opacity: 1 - distance * 0.2,
    };
  }, [C.primary, C.textDim, index]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={title}
      accessibilityState={{ selected: focused }}
      onPressIn={() => {
        pressProgress.value = withTiming(1, { duration: reduceMotion ? 1 : 80 });
      }}
      onPressOut={() => {
        pressProgress.value = withTiming(0, { duration: reduceMotion ? 1 : 140 });
      }}
      onPress={onPress}
      style={({ hovered }) => [styles.navButton, hovered && !focused && styles.navButtonHover]}
    >
      {/* Icon fonts have no setNativeProps on the web, so the wrapper animates. */}
      <Animated.View style={iconStyle}>
        <MaterialCommunityIcons name={icon} size={22} color={focused ? C.primary : C.textDim} />
      </Animated.View>
      <Animated.Text style={[styles.navLabel, labelStyle]} numberOfLines={1}>
        {title}
      </Animated.Text>
    </Pressable>
  );
}

function createStyles(C: AppColors) {
  const dark = C.mode === "dark";
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    page: { ...StyleSheet.absoluteFill },
    hidden: { display: "none" },
    navWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 18,
      paddingTop: 34,
      alignItems: "center",
    },
    navFade: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
    navBar: {
      position: "relative",
      width: "100%",
      maxWidth: MaxContentWidth,
      flexDirection: "row",
      gap: NAV_GAP,
      minHeight: 60,
      padding: NAV_PADDING,
      borderRadius: 30,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: alpha(C.border, dark ? "80" : "72"),
      backgroundColor: alpha(C.surface, dark ? "D9" : "D8"),
      boxShadow: dark ? "0 4px 10px rgba(0, 0, 0, 0.2)" : "0 4px 10px rgba(0, 0, 0, 0.07)",
      overflow: "hidden",
      // Frosted like the iOS tab bar; react-native-web passes it to CSS.
      ...({ backdropFilter: "blur(18px) saturate(1.5)", WebkitBackdropFilter: "blur(18px) saturate(1.5)" } as object),
    },
    navHighlight: {
      position: "absolute",
      top: NAV_PADDING,
      bottom: NAV_PADDING,
      left: 0,
      borderRadius: 24,
      backgroundColor: alpha(C.primary, dark ? "1C" : "11"),
    },
    navButton: {
      flex: 1,
      minHeight: 50,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      borderRadius: 24,
      zIndex: 1,
      cursor: "pointer",
    },
    navButtonHover: { backgroundColor: alpha(C.text, "08") },
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
