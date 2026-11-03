import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from "expo-router/ui";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { alpha, MaxContentWidth } from "@/constants/theme";
import { useAppColors } from "@/hooks/use-app-colors";
import { useI18n } from "@/hooks/use-i18n";
import { MapFocusProvider } from "@/hooks/use-map-focus";
import { TabNavProvider, type TabRoute } from "@/hooks/use-tab-nav";

export default function AppTabs(_props: {
  backEnabled?: boolean;
  deferInactiveTabs?: boolean;
  onRequestDirectionPicker?: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const colors = useAppColors();
  const tabs = [
    { route: "index", title: t("tabsDepartures"), icon: "bus-clock" },
    { route: "explore", title: t("tabsMap"), icon: "map-outline" },
    { route: "timetable", title: t("tabsTimetable"), icon: "calendar-clock" },
    { route: "settings", title: t("tabsSettings"), icon: "cog-outline" },
  ] as const;
  function navigate(route: TabRoute) {
    router.push(route === "index" ? "/" : `/${route}`);
  }
  return (
    <MapFocusProvider>
      <TabNavProvider value={navigate}>
        <Tabs>
          <TabSlot style={styles.slot} />
          <TabList asChild>
            <View
              style={StyleSheet.flatten([
                styles.wrap,
                styles.bar,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ])}
            >
              {tabs.map((tab) => (
                <TabTrigger
                  key={tab.route}
                  name={tab.route}
                  href={tab.route === "index" ? "/" : `/${tab.route}`}
                  asChild
                >
                  <TabButton icon={tab.icon}>{tab.title}</TabButton>
                </TabTrigger>
              ))}
            </View>
          </TabList>
        </Tabs>
      </TabNavProvider>
    </MapFocusProvider>
  );
}

function TabButton({
  children,
  icon,
  isFocused,
  ...props
}: Omit<TabTriggerSlotProps, "ref"> & {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  ref?: React.Ref<React.ComponentRef<typeof Pressable>>;
}) {
  const colors = useAppColors();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={StyleSheet.flatten([
        styles.button,
        {
          backgroundColor: isFocused
            ? alpha(colors.primary, "18")
            : "transparent",
        },
      ])}
    >
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={isFocused ? colors.primary : colors.textDim}
      />
      <Text
        style={{
          color: isFocused ? colors.text : colors.textDim,
          fontSize: 11,
          fontWeight: "700",
        }}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  slot: { flex: 1 },
  wrap: {
    position: "absolute",
    bottom: 12,
    width: "96%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  bar: {
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
});
