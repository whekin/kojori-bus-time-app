import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NativeBottomSheet } from "@/components/native-bottom-sheet";
import { alpha, type AppColors } from "@/constants/theme";
import { useActiveDirection } from "@/hooks/use-active-direction";
import { useAppColors } from "@/hooks/use-app-colors";
import { useI18n } from "@/hooks/use-i18n";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { type SharedDirection } from "@/hooks/use-settings";

type Mode = "kojori" | "tbilisi";
const PILL_ROUTE_TRACK_HEIGHT = 22;
const PILL_ROUTE_COMPACT_SLOT_WIDTH = 48;
const PILL_ROUTE_WIDE_SLOT_WIDTH = 72;
const PILL_ROUTE_EXTRA_WIDE_SLOT_WIDTH = 86;
const PILL_ROUTE_ARROW_WIDTH = 15;
const PILL_ROUTE_LABEL_GAP = 8;
const PILL_SWAP_DURATION_MS = 500;

function directionToMode(direction: SharedDirection): Mode {
  return direction === "toKojori" ? "kojori" : "tbilisi";
}

function modeToDirection(mode: Mode): SharedDirection {
  return mode === "kojori" ? "toKojori" : "toTbilisi";
}

function originLabel(
  direction: SharedDirection,
  t: ReturnType<typeof useI18n>["t"],
) {
  return direction === "toKojori" ? t("cityTbilisi") : t("cityKojori");
}

function destinationLabel(
  direction: SharedDirection,
  t: ReturnType<typeof useI18n>["t"],
) {
  return direction === "toKojori" ? t("cityKojori") : t("cityTbilisi");
}

export function DirectionPill({
  accentColor,
  style,
}: {
  accentColor: string;
  style?: ViewStyle;
}) {
  const colors = useAppColors();
  const styles = usePillStyles();
  const { activeDirection, selectDirection } = useActiveDirection();
  const { t, resolvedLanguage } = useI18n();
  const reduceMotion = useReducedMotion();
  const switchAnim = useRef(new Animated.Value(0)).current;
  const [isSwitching, setIsSwitching] = useState(false);
  const [originWidth, setOriginWidth] = useState(0);
  const [destinationWidth, setDestinationWidth] = useState(0);

  const origin = originLabel(activeDirection, t);
  const destination = destinationLabel(activeDirection, t);
  const routeLayout =
    resolvedLanguage === "ka"
      ? "extraWide"
      : resolvedLanguage === "ru"
        ? "wide"
        : "compact";
  const routeSlotWidth =
    routeLayout === "extraWide"
      ? PILL_ROUTE_EXTRA_WIDE_SLOT_WIDTH
      : routeLayout === "wide"
        ? PILL_ROUTE_WIDE_SLOT_WIDTH
        : PILL_ROUTE_COMPACT_SLOT_WIDTH;
  const measuredOriginWidth = originWidth || routeSlotWidth;
  const measuredDestinationWidth = destinationWidth || routeSlotWidth;
  const routeSideWidth = Math.max(
    routeSlotWidth,
    measuredOriginWidth,
    measuredDestinationWidth,
  );
  const routeRightAnchor =
    routeSideWidth + PILL_ROUTE_LABEL_GAP * 2 + PILL_ROUTE_ARROW_WIDTH;
  const routeTrackWidth = routeSideWidth * 2 + PILL_ROUTE_LABEL_GAP * 2 + PILL_ROUTE_ARROW_WIDTH;
  const routeArrowLeft = routeSideWidth + PILL_ROUTE_LABEL_GAP;
  const nextDirection =
    activeDirection === "toKojori" ? "toTbilisi" : "toKojori";
  const nextAccentColor =
    nextDirection === "toKojori" ? colors.route380 : colors.route316;
  const swapRotation = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const originTranslate = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      routeSideWidth - measuredOriginWidth,
      routeRightAnchor,
    ],
  });
  const destinationTranslate = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      routeRightAnchor,
      routeSideWidth - measuredDestinationWidth,
    ],
  });
  const arrowScale = switchAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.72, 1],
  });
  const arrowOpacity = switchAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.42, 1],
  });
  const animatedAccentColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [accentColor, nextAccentColor],
  });
  const animatedBorderColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [alpha(accentColor, "40"), alpha(nextAccentColor, "40")],
  });

  function handlePress() {
    if (isSwitching) return;

    setIsSwitching(true);
    switchAnim.stopAnimation();
    switchAnim.setValue(0);
    Animated.timing(switchAnim, {
      toValue: 1,
      duration: reduceMotion ? 1 : PILL_SWAP_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) {
        setIsSwitching(false);
        return;
      }

      selectDirection(nextDirection, { persist: "deferred" });
      requestAnimationFrame(() => {
        switchAnim.setValue(0);
        setIsSwitching(false);
      });
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("directionAccessibility", { origin, destination })}
      accessibilityState={{ busy: isSwitching }}
      onPress={handlePress}
      disabled={isSwitching}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: alpha(accentColor, "00"),
          backgroundColor:
            pressed && !isSwitching ? colors.surfaceHigh : colors.surface,
        },
        routeLayout === "wide" && styles.pillWide,
        routeLayout === "extraWide" && styles.pillExtraWide,
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pillBorder,
          {
            borderColor: animatedBorderColor,
          },
        ]}
      />
      <View style={styles.pillText}>
        <Text style={styles.pillEyebrow} numberOfLines={1}>
          {t("directionFromTo").toUpperCase()}
        </Text>
        <View style={styles.pillRouteRow}>
          <Animated.View
            style={[styles.pillDot, { backgroundColor: animatedAccentColor }]}
          />
          <View style={[styles.pillRouteTrack, { width: routeTrackWidth }]}>
            <View pointerEvents="none" style={styles.pillMeasureLayer}>
              <Text
                style={styles.pillPlace}
                numberOfLines={1}
                onLayout={(event) => setOriginWidth(event.nativeEvent.layout.width)}
              >
                {origin}
              </Text>
              <Text
                style={styles.pillPlace}
                numberOfLines={1}
                onLayout={(event) => setDestinationWidth(event.nativeEvent.layout.width)}
              >
                {destination}
              </Text>
            </View>
            <Animated.View
              style={[
                styles.pillRouteLabel,
                {
                  width: measuredOriginWidth,
                  transform: [{ translateX: originTranslate }],
                },
              ]}
            >
              <Text
                style={styles.pillPlace}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.88}
              >
                {origin}
              </Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.pillRouteArrow,
                { left: routeArrowLeft },
                {
                  opacity: arrowOpacity,
                  transform: [{ scale: arrowScale }],
                },
              ]}
            >
              <MaterialCommunityIcons
                name="arrow-right"
                size={15}
                color={colors.textDim}
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.pillRouteLabel,
                {
                  width: measuredDestinationWidth,
                  transform: [{ translateX: destinationTranslate }],
                },
              ]}
            >
              <Text
                style={styles.pillPlace}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.88}
              >
                {destination}
              </Text>
            </Animated.View>
          </View>
        </View>
      </View>
      <Animated.View style={{ transform: [{ rotate: swapRotation }] }}>
        <MaterialCommunityIcons
          name="swap-horizontal"
          size={17}
          color={colors.textDim}
        />
      </Animated.View>
    </Pressable>
  );
}

export function DirectionPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return <DirectionPickerSheetInner visible={visible} onClose={onClose} />;
}

function DirectionPickerSheetInner({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useAppColors();
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  const { activeDirection, selectDirection } = useActiveDirection();
  const { t } = useI18n();

  const activeMode = directionToMode(activeDirection);

  function handlePickMode(mode: Mode) {
    const nextDirection = modeToDirection(mode);
    onClose();

    if (nextDirection === activeDirection) return;

    setTimeout(() => {
      selectDirection(nextDirection, { persist: "deferred" });
    }, 0);
  }

  return (
    <NativeBottomSheet
      visible={visible}
      onClose={onClose}
      contentStyle={[
        styles.sheetContent,
        { paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
      <Text style={styles.title}>{t("directionTitle")}</Text>
      <Text style={styles.subtitle}>{t("directionSubtitle")}</Text>

      <View style={styles.options}>
        {(["kojori", "tbilisi"] as Mode[]).map((mode) => {
          const isActive = activeMode === mode;
          const label = mode === "kojori" ? t("cityKojori") : t("cityTbilisi");
          const sub =
            mode === "kojori"
              ? t("directionUpMountain")
              : t("directionDownCity");
          const accent = mode === "kojori" ? colors.route380 : colors.route316;
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityLabel={t("directionAccessibility", {
                origin: mode === "kojori" ? t("cityTbilisi") : t("cityKojori"),
                destination: label,
              })}
              accessibilityState={{ selected: isActive }}
              onPress={() => handlePickMode(mode)}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: isActive ? accent : colors.border,
                  backgroundColor: isActive
                    ? alpha(accent, "14")
                    : pressed
                      ? colors.surfaceHigh
                      : colors.surface,
                },
              ]}
            >
              <View style={[styles.optionDot, { backgroundColor: accent }]} />
              <View style={styles.optionCopy}>
                <Text
                  style={[
                    styles.optionLabel,
                    { color: isActive ? accent : colors.text },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionTo,
                      {
                        color: isActive ? alpha(accent, "AA") : colors.textDim,
                      },
                    ]}
                  >
                    {t("directionTo")}
                  </Text>
                  {label}
                </Text>
                <Text style={styles.optionSub}>{sub}</Text>
              </View>
              {isActive ? (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={18}
                  color={accent}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </NativeBottomSheet>
  );
}

function createPillStyles(C: AppColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      position: "relative",
      paddingLeft: 14,
      paddingRight: 12,
      paddingVertical: 10,
      borderRadius: 16,
      borderWidth: 1,
      minHeight: 58,
      minWidth: 176,
      maxWidth: 224,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    pillWide: {
      minWidth: 226,
      maxWidth: 288,
    },
    pillExtraWide: {
      minWidth: 254,
      maxWidth: 320,
    },
    pillBorder: {
      ...StyleSheet.absoluteFill,
      borderRadius: 16,
      borderWidth: 1,
    },
    pillDot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
    pillText: { minWidth: 0, flexGrow: 0, flexShrink: 0, gap: 4 },
    pillEyebrow: {
      color: C.textFaint,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 2,
    },
    pillRouteRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 0,
    },
    pillRouteTrack: {
      height: PILL_ROUTE_TRACK_HEIGHT,
      flexShrink: 0,
    },
    pillMeasureLayer: {
      position: "absolute",
      opacity: 0,
      flexDirection: "row",
    },
    pillRouteLabel: {
      position: "absolute",
      top: 0,
      height: PILL_ROUTE_TRACK_HEIGHT,
      justifyContent: "center",
      left: 0,
    },
    pillRouteArrow: {
      position: "absolute",
      top: 1,
      width: 15,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    pillPlace: {
      color: C.text,
      fontSize: 15,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
  });
}

function usePillStyles() {
  const C = useAppColors();
  return useMemo(() => createPillStyles(C), [C]);
}

function createSheetStyles(C: AppColors) {
  return StyleSheet.create({
    sheetContent: {
      paddingHorizontal: 20,
      gap: 14,
    },
    title: {
      color: C.text,
      fontSize: 22,
      fontWeight: "700",
      letterSpacing: -0.3,
    },
    subtitle: { color: C.textDim, fontSize: 13, lineHeight: 18, marginTop: -6 },
    options: { gap: 10, marginTop: 4 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 18,
      borderWidth: 1,
    },
    optionDot: { width: 10, height: 10, borderRadius: 5 },
    optionCopy: { flex: 1, minWidth: 0, gap: 2 },
    optionLabel: { fontSize: 18, fontWeight: "700" },
    optionTo: { fontSize: 15, fontWeight: "500", fontStyle: "italic" },
    optionSub: { color: C.textDim, fontSize: 12 },
  });
}

function useSheetStyles() {
  const C = useAppColors();
  return useMemo(() => createSheetStyles(C), [C]);
}
