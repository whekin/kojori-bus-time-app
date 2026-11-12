import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ExploreScreen from "@/app/explore";
import HomeScreen from "@/app/index";
import SettingsScreen from "@/app/settings";
import TimetableScreen from "@/app/timetable";
import { alpha, MaxContentWidth } from "@/constants/theme";
import { useAppColors } from "@/hooks/use-app-colors";
import { useI18n } from "@/hooks/use-i18n";
import { MapFocusProvider } from "@/hooks/use-map-focus";
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
  const activeRoute = routeForPath(pathname);
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
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
          {ROUTES.filter(route => mounted.has(route)).map(route => (
            <View
              key={route}
              style={[styles.page, route !== activeRoute && styles.hidden]}
              aria-hidden={route !== activeRoute}>
              {screenFor(route)}
            </View>
          ))}
          <View
            accessibilityRole="tablist"
            style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {tabs.map(tab => (
              <TabButton
                key={tab.route}
                icon={tab.icon}
                title={tab.title}
                focused={tab.route === activeRoute}
                onPress={() => navigate(tab.route)}
              />
            ))}
          </View>
        </View>
      </TabNavProvider>
    </MapFocusProvider>
  );
}

function TabButton({
  icon,
  title,
  focused,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  focused: boolean;
  onPress: () => void;
}) {
  const colors = useAppColors();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={({ hovered }) => [
        styles.button,
        {
          backgroundColor: focused
            ? alpha(colors.primary, "18")
            : hovered
              ? alpha(colors.text, "0A")
              : "transparent",
        },
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={focused ? colors.primary : colors.textDim}
      />
      <Text
        style={[styles.label, { color: focused ? colors.text : colors.textDim }]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { ...StyleSheet.absoluteFill },
  hidden: { display: "none" },
  bar: {
    position: "absolute",
    bottom: 12,
    width: "96%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    flexDirection: "row",
    padding: 6,
    gap: 4,
    borderWidth: 1,
    borderRadius: 24,
  },
  button: {
    flex: 1,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    gap: 4,
  },
  label: { fontSize: 11, fontWeight: "700" },
});
