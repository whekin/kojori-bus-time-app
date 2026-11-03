import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  alpha,
  BottomTabInset,
  Fonts,
  MaxContentWidth,
  Spacing,
  type AppColors,
} from "@/constants/theme";
import { useI18n } from "@/hooks/use-i18n";
import { useAppColors } from "@/hooks/use-app-colors";
import { createThemedStyles } from "@/utils/themed-styles";
import {
  tripRouteAccentIndex,
  type Favorite,
  type TransitRoute,
} from "./model";

function accents(colors: AppColors) {
  return [colors.route380, colors.route316, colors.map, colors.primary];
}

/** A route's accent, distinct from the other routes of `favorite` if given. */
export function routeColor(
  routeId: string,
  colors: AppColors,
  favorite?: Favorite,
) {
  return accents(colors)[tripRouteAccentIndex(routeId, favorite)];
}

/**
 * The colour a trip is drawn in. Kojori trips keep the original accents
 * (380's towards Kojori, 316's towards Tbilisi); others take their first route.
 */
export function tripAccent(favorite: Favorite | undefined, colors: AppColors) {
  const kojori = favorite?.boardings.find(
    (b) => b.route.id === "1:R97505" || b.route.id === "1:R98445",
  );
  if (kojori) {
    const toKojori =
      kojori.pattern.patternSuffix ===
      (kojori.route.id === "1:R97505" ? "0:01" : "1:01");
    return toKojori ? colors.route380 : colors.route316;
  }
  const first = favorite?.boardings[0]?.route.id;
  return first ? routeColor(first, colors, favorite) : colors.route380;
}

export function transitModeIcon(mode: string) {
  return mode === "SUBWAY" ? "train" : mode === "GONDOLA" ? "gondola" : "bus";
}

const getStyles = createThemedStyles((C: AppColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: {
      width: "100%",
      maxWidth: MaxContentWidth,
      alignSelf: "center",
      padding: Spacing.four,
      paddingBottom: BottomTabInset + Spacing.five,
      gap: Spacing.three,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.three,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      flexWrap: "wrap",
    },
    column: { flex: 1, gap: Spacing.one, minWidth: 0 },
    eyebrow: {
      color: C.textFaint,
      fontFamily: Fonts.mono,
      fontSize: 11,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    title: {
      color: C.text,
      fontFamily: Fonts.serif,
      fontSize: 34,
      lineHeight: 40,
    },
    heading: { color: C.text, fontSize: 19, fontWeight: "700" },
    body: { color: C.textDim, fontSize: 14, lineHeight: 21 },
    muted: { color: C.textFaint, fontSize: 12, lineHeight: 18 },
    card: {
      padding: Spacing.three,
      gap: Spacing.three,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 24,
      backgroundColor: C.surface,
    },
    listRow: {
      minHeight: 64,
      paddingVertical: Spacing.three,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.three,
    },
    time: {
      fontFamily: Fonts.mono,
      fontSize: 48,
      fontWeight: "600",
      color: C.text,
      letterSpacing: -2,
    },
    smallTime: {
      fontFamily: Fonts.mono,
      fontSize: 23,
      fontWeight: "600",
      color: C.text,
    },
    field: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: C.borderStrong,
      backgroundColor: C.panel,
      borderRadius: 16,
      color: C.text,
      paddingHorizontal: Spacing.three,
      fontSize: 16,
    },
    chips: { paddingVertical: Spacing.two, gap: Spacing.two },
    button: {
      minHeight: 46,
      paddingHorizontal: Spacing.three,
      paddingVertical: Spacing.two,
      borderRadius: 16,
      backgroundColor: C.surfaceHigh,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: Spacing.two,
      borderWidth: 1,
      borderColor: C.border,
    },
    primaryButton: {
      backgroundColor: alpha(C.primary, "20"),
      borderColor: alpha(C.primary, "70"),
    },
    buttonText: { color: C.text, fontSize: 14, fontWeight: "700" },
    notice: {
      padding: Spacing.three,
      borderRadius: 16,
      backgroundColor: alpha(C.warning, "12"),
      borderWidth: 1,
      borderColor: alpha(C.warning, "40"),
    },
    badge: {
      minHeight: 32,
      minWidth: 44,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: Spacing.two,
      paddingVertical: Spacing.one,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      color: C.text,
      fontFamily: Fonts.mono,
      fontWeight: "700",
      fontSize: 14,
    },
    empty: {
      paddingVertical: Spacing.six,
      gap: Spacing.three,
      alignItems: "flex-start",
    },
  }),
);

export function useTransitStyles() {
  const colors = useAppColors();
  return { colors, s: getStyles(colors) };
}

export function Button({
  label,
  onPress,
  icon,
  primary,
  disabled,
  selected,
  style,
  testID,
  iconOnly,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  primary?: boolean;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  iconOnly?: boolean;
}) {
  const { colors, s } = useTransitStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        (primary || selected) && s.primaryButton,
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons name={icon} size={19} color={colors.text} />
      ) : null}
      {!iconOnly ? <Text style={s.buttonText}>{label}</Text> : null}
    </Pressable>
  );
}

export function RouteBadge({ route }: { route: TransitRoute }) {
  const { colors, s } = useTransitStyles();
  const color = routeColor(route.id, colors);
  return (
    <View
      style={[
        s.badge,
        {
          borderColor: color,
          backgroundColor: alpha(color, "18"),
          flexDirection: "row",
          gap: Spacing.one,
        },
      ]}
    >
      {route.mode !== "BUS" ? (
        <MaterialCommunityIcons
          name={transitModeIcon(route.mode)}
          size={16}
          color={colors.text}
        />
      ) : null}
      <Text style={s.badgeText}>{route.shortName}</Text>
    </View>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  const { s } = useTransitStyles();
  return (
    <View style={s.notice} accessibilityRole="alert">
      <Text style={s.body}>{children}</Text>
    </View>
  );
}

export function useFavoriteTitle() {
  const { t } = useI18n();
  return (favorite: Favorite) =>
    favorite.title.trim() ||
    [
      ...new Set(
        favorite.boardings.map((b) =>
          b.pattern.headsign === "Kojori"
            ? t("cityKojori")
            : b.pattern.headsign === "Tbilisi"
              ? t("cityTbilisi")
              : b.pattern.headsign,
        ),
      ),
    ].join(" / ");
}
