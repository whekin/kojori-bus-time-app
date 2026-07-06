import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StopSelector } from "@/components/stop-selector";
import { TtcStatusTopBar } from "@/components/ttc-status-top-bar";
import { alpha, BottomTabInset, type AppColors } from "@/constants/theme";
import { useActiveDirection } from "@/hooks/use-active-direction";
import { useAppColors } from "@/hooks/use-app-colors";
import { useArrivals } from "@/hooks/use-arrivals";
import { useClosestStop } from "@/hooks/use-closest-stop";
import { useI18n } from "@/hooks/use-i18n";
import { useRouteStops } from "@/hooks/use-route-stops";
import { useSchedule } from "@/hooks/use-schedule";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useSettings } from "@/hooks/use-settings";
import { useStopNames } from "@/hooks/use-stop-names";
import { useVehiclePositions } from "@/hooks/use-vehicle-positions";
import {
  BusLine,
  computeUpcomingDepartures,
  Departure,
  findStop,
  getDepartureServiceBoundary,
  getLiveVehicleCountsForStop,
  injectLiveDelayDemo,
  mergeArrivalsIntoSchedule,
  ROUTES,
  type DepartureServiceBoundary,
  type ServiceDeparture,
  type StopInfo,
} from "@/services/ttc";

const MONO = Platform.select({
  android: "monospace",
  ios: "Menlo",
  default: "monospace",
});
type SharedMode = "kojori" | "tbilisi";
const CONTENT_SIDE = 20;
const SECTION_SPACE = 12;
const DEPARTURES_LIVE_VEHICLE_REFRESH_MS = 30_000;

function modeToDirection(mode: SharedMode) {
  return mode === "kojori" ? "toKojori" : "toTbilisi";
}

function directionToMode(direction: "toKojori" | "toTbilisi"): SharedMode {
  return direction === "toKojori" ? "kojori" : "tbilisi";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMins(
  mins: number,
  t: ReturnType<typeof useI18n>["t"],
  formatDuration: ReturnType<typeof useI18n>["formatDuration"],
  formatRelativeDuration: ReturnType<typeof useI18n>["formatRelativeDuration"],
) {
  if (mins < 1) return t("commonNow");
  if (mins < 60) return formatRelativeDuration("future", "minute", mins);

  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (minutes === 0) return formatRelativeDuration("future", "hour", hours);

  return t("timeInHours", {
    hours: formatDuration("hour", hours),
    minutes: formatDuration("minute", minutes),
  });
}

function getRealtimeStatus(
  dep: Departure,
  colors: AppColors,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (!dep.live) return null;

  if (dep.driftMinutes == null) {
    return {
      label: t("liveEstimate"),
      textColor: colors.live,
      backgroundColor: alpha(colors.live, "14"),
      borderColor: alpha(colors.live, "38"),
    };
  }

  const drift = dep.driftMinutes;
  if (drift > 0) {
    return {
      label: t("liveLate", { minutes: drift }),
      textColor: colors.live,
      backgroundColor: alpha(colors.live, "14"),
      borderColor: alpha(colors.live, "38"),
    };
  }

  if (drift < 0) {
    return {
      label: t("liveEarly", { minutes: Math.abs(drift) }),
      textColor: colors.live,
      backgroundColor: alpha(colors.live, "14"),
      borderColor: alpha(colors.live, "38"),
    };
  }

  return {
    label: t("liveOnTime"),
    textColor: colors.live,
    backgroundColor: alpha(colors.live, "14"),
    borderColor: alpha(colors.live, "38"),
  };
}

function routeColor(bus: BusLine, colors: ReturnType<typeof useAppColors>) {
  return bus === "380" ? colors.route380 : colors.route316;
}

function getDisplayedDepartures(departures: Departure[]) {
  const visibleDepartures = departures.filter(
    (dep) => dep.status !== "cancelled" && !dep.cancelled,
  );
  const next = visibleDepartures[0];
  const hiddenKeys = new Set<string>();

  if (next) hiddenKeys.add(`${next.key}:${next.status}`);

  return {
    next,
    upcoming: visibleDepartures.filter(
      (dep) => !hiddenKeys.has(`${dep.key}:${dep.status}`),
    ),
  };
}

function languageDateLocale(language: "en" | "ka" | "ru") {
  if (language === "ka") return "ka-GE";
  if (language === "ru") return "ru-RU";
  return "en-GB";
}

function formatNextServiceWhen(
  departure: ServiceDeparture,
  t: ReturnType<typeof useI18n>["t"],
  language: "en" | "ka" | "ru",
) {
  if (departure.daysUntil === 1) return t("homeNextServiceTomorrow", { time: departure.time });

  const date = new Date(`${departure.date}T12:00:00`);
  const label = date.toLocaleDateString(languageDateLocale(language), {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return t("homeNextServiceDate", { date: label, time: departure.time });
}

function splitCountdownLabel(label: string) {
  const displayLabel = label.charAt(0).toLocaleUpperCase() + label.slice(1);
  const match = displayLabel.match(/(\d+)/);
  if (!match || match.index == null) {
    return { before: "", value: displayLabel, after: "" };
  }

  return {
    before: displayLabel.slice(0, match.index),
    value: match[0],
    after: displayLabel.slice(match.index + match[0].length),
  };
}

function buildStopSelectorStops({
  favoriteIds,
  activeStopId,
  routeStops,
  stopNames,
  stopFallback,
}: {
  favoriteIds: string[];
  activeStopId: string;
  routeStops: StopInfo[];
  stopNames: Record<string, string>;
  stopFallback: (id: string) => string;
}) {
  const routeStopMap = new Map(routeStops.map((stop) => [stop.id, stop]));
  const ids = favoriteIds.includes(activeStopId)
    ? favoriteIds
    : [...favoriteIds, activeStopId];

  return ids.map((id) => {
    const base = routeStopMap.get(id) ??
      findStop(id) ?? { id, label: stopFallback(id) };
    return { ...base, label: stopNames[id] ?? base.label };
  });
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
function BusTag({ bus }: { bus: BusLine }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const color = routeColor(bus, colors);
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>
        {bus}
      </Text>
    </View>
  );
}

function LiveDot({ color }: { color?: string }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return undefined;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.42,
          duration: 780,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 780,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.liveDot,
        { backgroundColor: color ?? colors.live, opacity },
      ]}
    />
  );
}

function ScheduledTimeHint({
  time,
  compact = false,
  showLabel = false,
  prominent = false,
  highlightColor,
}: {
  time?: string;
  compact?: boolean;
  showLabel?: boolean;
  prominent?: boolean;
  highlightColor?: string;
}) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const { t } = useI18n();
  if (!time) return null;
  const label = showLabel ? t("homeScheduledTime", { time }) : time;
  const timeIndex = showLabel ? label.indexOf(time) : -1;
  const labelBeforeTime = timeIndex >= 0 ? label.slice(0, timeIndex) : "";
  const labelAfterTime = timeIndex >= 0 ? label.slice(timeIndex + time.length) : "";

  return (
    <View
      accessible
      accessibilityLabel={t("homeScheduledTimeA11y", { time })}
      style={[styles.scheduledHint, compact && styles.scheduledHintCompact]}
    >
      <MaterialCommunityIcons
        name="calendar-clock"
        size={compact ? 12 : prominent ? 16 : 14}
        color={compact ? colors.textFaint : prominent ? highlightColor ?? colors.live : colors.textDim}
      />
      <Text
        style={[
          styles.scheduledHintText,
          compact && styles.scheduledHintTextCompact,
          prominent && styles.scheduledHintTextProminent,
          !prominent && { fontFamily: MONO },
        ]}
        numberOfLines={1}
      >
        {timeIndex >= 0 ? (
          <>
            {labelBeforeTime}
            <Text
              style={[
                styles.scheduledHintTime,
                prominent && styles.scheduledHintTimeProminent,
                { color: highlightColor ?? colors.live },
              ]}
            >
              {time}
            </Text>
            {labelAfterTime}
          </>
        ) : (
          label
        )}
      </Text>
    </View>
  );
}

function SectionDivider({
  label,
  style,
}: {
  label: string;
  style?: ViewStyle;
}) {
  const styles = useHomeStyles();
  return (
    <View style={[styles.divider, style]}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  const styles = useHomeStyles();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  return (
    <View
      style={[
        styles.errorBanner,
        {
          backgroundColor: alpha(colors.error, "18"),
          borderColor: alpha(colors.error, "40"),
        },
      ]}
    >
      <Text style={[styles.errorText, { color: colors.error }]}>{message}</Text>
    </View>
  );
}

// ── Shared departure row ───────────────────────────────────────────────────────
function DepartureRow({ dep, isLast }: { dep: Departure; isLast: boolean }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const { t, formatDuration, formatRelativeDuration } = useI18n();
  const countdown = formatMins(dep.minsUntil, t, formatDuration, formatRelativeDuration);
  const realtimeStatus = getRealtimeStatus(dep, colors, t);

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <BusTag bus={dep.bus} />
      <View style={styles.rowMain}>
        <Text
          style={[
            styles.rowTime,
            { fontFamily: MONO },
          ]}
          numberOfLines={1}
        >
          {dep.time}
        </Text>
        {dep.live ? (
          <ScheduledTimeHint time={dep.scheduledTime} compact />
        ) : null}
      </View>
      <View style={styles.rowMeta}>
        {realtimeStatus ? (
          <View
            style={[
              styles.liveBadgeSmall,
              styles.rowMetaBadge,
              {
                backgroundColor: realtimeStatus.backgroundColor,
                borderColor: realtimeStatus.borderColor,
              },
            ]}
          >
            <LiveDot color={realtimeStatus.textColor} />
            <Text
              style={[
                styles.liveBadgeSmallText,
                { color: realtimeStatus.textColor },
              ]}
              numberOfLines={1}
            >
              {realtimeStatus.label}
            </Text>
          </View>
        ) : null}
        <Text
          style={[
            styles.rowCountdown,
          ]}
          numberOfLines={2}
        >
          {countdown}
        </Text>
      </View>
    </View>
  );
}

// ── Shared "next bus" card ─────────────────────────────────────────────────────
function NextCard({
  dep,
  accentColor,
  isLoading,
  serviceBoundary,
}: {
  dep: Departure | undefined;
  accentColor: string;
  isLoading: boolean;
  serviceBoundary: DepartureServiceBoundary;
}) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const { t, formatDuration, formatRelativeDuration, resolvedLanguage } = useI18n();
  if (isLoading && !dep) {
    return (
      <View style={[styles.nextCard, styles.centered]}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }
  if (!dep) {
    if (serviceBoundary.nextServiceDeparture) {
      const when = formatNextServiceWhen(serviceBoundary.nextServiceDeparture, t, resolvedLanguage);
      return (
        <View style={[styles.nextCard, { borderColor: alpha(accentColor, "30") }]}>
          <View style={[styles.nextAccentBar, { backgroundColor: accentColor }]} />
          <View style={styles.nextContent}>
            <Text style={styles.nextEyebrow}>{t("homeNextService")}</Text>
            <Text style={styles.serviceTitle}>
              {serviceBoundary.serviceEndedToday
                ? t("homeServiceEndedTitle")
                : t("homeNoServiceTodayTitle")}
            </Text>
            <Text style={styles.serviceDetail}>
              {t("homeNextServiceDetail", { when })}
            </Text>
            <View style={[styles.servicePill, { borderColor: alpha(accentColor, "38"), backgroundColor: alpha(accentColor, "12") }]}>
              <BusTag bus={serviceBoundary.nextServiceDeparture.bus} />
              <Text style={[styles.servicePillText, { color: accentColor, fontFamily: MONO }]}>
                {serviceBoundary.nextServiceDeparture.time}
              </Text>
            </View>
          </View>
        </View>
      );
    }
    return <EmptyState message={t("homeNoDepartures")} />;
  }
  const minsLabel = (() => {
    if (dep.minsUntil < 1) return t("commonNow");
    if (dep.minsUntil < 60) return formatRelativeDuration("future", "minute", dep.minsUntil);

    const hours = Math.floor(dep.minsUntil / 60);
    const minutes = dep.minsUntil % 60;
    if (minutes === 0) return formatRelativeDuration("future", "hour", hours);

    return t("timeInHours", {
      hours: formatDuration("hour", hours),
      minutes: formatDuration("minute", minutes),
    });
  })();
  const realtimeStatus = getRealtimeStatus(dep, colors, t);
  const busColor = routeColor(dep.bus, colors);
  const highlightColor = busColor;
  const isLiveDeparture = dep.live === true;
  const statusColor = realtimeStatus?.textColor ?? colors.textDim;
  const statusPillStyle = realtimeStatus
    ? {
        backgroundColor: realtimeStatus.backgroundColor,
        borderColor: realtimeStatus.borderColor,
      }
    : {
        backgroundColor: alpha(colors.surfaceHigh, "55"),
        borderColor: alpha(colors.borderStrong, "55"),
      };
  const scheduledTime = isLiveDeparture ? dep.scheduledTime : dep.scheduledTime ?? dep.time;
  const countdownParts = splitCountdownLabel(minsLabel);
  const driftLabel = !isLiveDeparture || dep.driftMinutes == null
    ? null
    : dep.driftMinutes > 0
      ? t("homeDriftLate", { minutes: dep.driftMinutes })
      : dep.driftMinutes < 0
        ? t("homeDriftEarly", { minutes: Math.abs(dep.driftMinutes) })
        : t("liveOnTime");
  return (
    <View style={styles.nextBlock}>
      <View
        style={[styles.nextCard, { borderColor: alpha(highlightColor, "30") }]}
      >
        <View
          style={[styles.nextAccentBar, { backgroundColor: highlightColor }]}
        />
        <View style={styles.nextContent}>
          <View style={styles.nextHeaderRow}>
            <View style={styles.nextHeaderLeft}>
              <View
                style={[
                  styles.nextRouteBadge,
                  {
                    backgroundColor: busColor,
                    borderColor: alpha(busColor, "A8"),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.nextRouteBadgeText,
                    { color: colors.bg, fontFamily: MONO },
                  ]}
                >
                  {dep.bus}
                </Text>
              </View>
              <View style={styles.nextHeaderCopy}>
                <Text style={styles.nextTitle} numberOfLines={1}>
                  {serviceBoundary.nextDepartureIsFinal ? t("homeLastDeparture") : t("homeNextDeparture")}
                </Text>
                <Text style={styles.nextSubtitle} numberOfLines={1}>
                  {t("commonRoute")}
                </Text>
              </View>
            </View>
            {realtimeStatus ? (
              <View
                accessible
                accessibilityLabel={`${t("homeArrivalSignal")} ${dep.time || ""}`.trim()}
                style={[styles.nextStatusPill, statusPillStyle]}
              >
                <LiveDot color={realtimeStatus.textColor} />
                <Text
                  style={[
                    styles.nextStatusText,
                    { color: statusColor },
                    dep.time ? { fontFamily: MONO, fontSize: 12, letterSpacing: 0.3 } : null,
                  ]}
                  numberOfLines={1}
                >
                  {dep.time || t("homeArrivalSignal")}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.nextHero}>
            {isLiveDeparture ? (
              <Text
                style={styles.nextCountdownHero}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.62}
              >
                {countdownParts.before}
                <Text style={[styles.nextCountdownNumber, { color: busColor }]}>
                  {countdownParts.value}
                </Text>
                {countdownParts.after}
              </Text>
            ) : (
              <Text
                style={[
                  styles.nextScheduleHeroTime,
                  { color: busColor, fontFamily: MONO },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.76}
              >
                {scheduledTime}
              </Text>
            )}
          </View>

          {isLiveDeparture && !scheduledTime ? null : (
          <View style={styles.nextMetaRow}>
            {isLiveDeparture ? (
              <>
                <ScheduledTimeHint
                  time={scheduledTime}
                  showLabel
                  prominent
                  highlightColor={busColor}
                />
                {realtimeStatus && driftLabel ? (
                  <View
                    style={[
                      styles.nextDriftChip,
                      {
                        backgroundColor: realtimeStatus.backgroundColor,
                        borderColor: realtimeStatus.borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.nextDriftChipText,
                        { color: realtimeStatus.textColor },
                      ]}
                      numberOfLines={1}
                    >
                      {driftLabel}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <MaterialCommunityIcons
                  name="calendar-clock"
                  size={16}
                  color={colors.textDim}
                />
                <Text style={[styles.nextMetaStatus, styles.nextMetaLabel]} numberOfLines={1}>
                  {t("homeScheduledDeparture")}
                </Text>
                <Text style={styles.nextMetaDot}>•</Text>
                <Text
                  style={[
                    styles.nextMetaStatus,
                    styles.nextMetaCountdown,
                    { color: busColor },
                  ]}
                  numberOfLines={1}
                >
                  {minsLabel}
                </Text>
              </>
            )}
          </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Direction view ────────────────────────────────────────────────────────────
function DirectionDeparturesView({
  isActive,
  direction,
  favoriteIds,
  activeStopId,
  onSelectStop,
  onToggleFavorite,
  bottomInset,
  isRefreshing,
  onRefresh,
  now,
  demoEnabled,
}: {
  isActive: boolean;
  direction: "toKojori" | "toTbilisi";
  favoriteIds: string[];
  activeStopId: string;
  onSelectStop: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  bottomInset: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  now: Date;
  demoEnabled: boolean;
}) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const { t } = useI18n();
  const stopNames = useStopNames();
  const { stops: routeStops } = useRouteStops(direction);
  const {
    closestStop,
    distanceMeters: closestStopDistance,
    status: closestStopStatus,
  } = useClosestStop(direction, activeStopId, isActive);
  const accentColor = direction === "toKojori" ? colors.route380 : colors.route316;
  const stopPickerTitle =
    direction === "toKojori"
      ? t("timetableTbilisiStops")
      : t("timetableKojoriStops");
  const favoriteStops = useMemo(
    () =>
      buildStopSelectorStops({
        favoriteIds,
        activeStopId,
        routeStops,
        stopNames,
        stopFallback: (id) =>
          t("commonStopNumber", { id: id.split(":")[1] ?? id }),
      }),
    [activeStopId, favoriteIds, routeStops, stopNames, t],
  );
  const locationSuggestion = useMemo(
    () =>
      closestStopStatus === "available" &&
      closestStop &&
      closestStopDistance != null
        ? {
            stop: {
              ...closestStop,
              label: stopNames[closestStop.id] ?? closestStop.label,
            },
            distanceMeters: closestStopDistance,
          }
        : undefined,
    [closestStop, closestStopDistance, closestStopStatus, stopNames],
  );

  const {
    data: s380,
    isLoading: l380,
    isError: e380,
  } = useSchedule(ROUTES["380"].id, ROUTES["380"][direction]);
  const {
    data: s316,
    isLoading: l316,
    isError: e316,
  } = useSchedule(ROUTES["316"].id, ROUTES["316"][direction]);
  const {
    arrivals,
    dataUpdatedAt,
    isError: eArrival,
  } = useArrivals(activeStopId, direction, isActive);
  const { data: liveVehiclePositions } = useVehiclePositions(direction, isActive, {
    refetchIntervalMs: DEPARTURES_LIVE_VEHICLE_REFRESH_MS,
    staleTimeMs: 20_000,
  });

  const rawDepartures = useMemo(
    () => computeUpcomingDepartures(
      s380,
      s316,
      activeStopId,
      undefined,
      now,
      { includeRecentPast: true },
    ),
    [s380, s316, activeStopId, now],
  );
  const liveVehicleCounts = useMemo(
    () => getLiveVehicleCountsForStop(
      s380,
      s316,
      activeStopId,
      liveVehiclePositions ?? [],
      now,
    ),
    [s380, s316, activeStopId, liveVehiclePositions, now],
  );

  const departures = useMemo(() => {
    const merged = mergeArrivalsIntoSchedule(
      rawDepartures,
      arrivals,
      now,
      dataUpdatedAt,
      { stopId: activeStopId, liveVehicleCounts },
    );
    return demoEnabled ? injectLiveDelayDemo(merged, now) : merged;
  }, [rawDepartures, arrivals, now, dataUpdatedAt, activeStopId, liveVehicleCounts, demoEnabled]);

  const isLoading = l380 || l316;
  const isError = (e380 || e316 || eArrival) && !s380 && !s316;
  const { next, upcoming } = useMemo(
    () => getDisplayedDepartures(departures),
    [departures],
  );
  const serviceBoundary = useMemo(
    () => getDepartureServiceBoundary(s380, s316, activeStopId, next, now),
    [s380, s316, activeStopId, next, now],
  );
  const hasNextServiceCard = !next && Boolean(serviceBoundary.nextServiceDeparture);
  const showUpcomingEmpty = !isLoading && upcoming.length === 0 && !serviceBoundary.nextDepartureIsFinal && !hasNextServiceCard;

  return (
    <View style={styles.modeContainer}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[
          styles.pageScrollContent,
          { paddingBottom: bottomInset + BottomTabInset + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surfaceHigh}
          />
        }
      >
        <View style={styles.fixedSection}>
          <StopSelector
            stops={favoriteStops}
            activeStopId={activeStopId}
            accentColor={accentColor}
            onSelectStop={onSelectStop}
            mapReturnRoute="index"
            locationSuggestion={locationSuggestion}
            showDirectionSwitch
            addStopModal={{
              title: stopPickerTitle,
              direction,
              favoriteIds,
              onToggle: onToggleFavorite,
            }}
          />

          {isError && <ErrorBanner message={t("homeScheduleError")} />}

          <SectionDivider label={t("homeNext")} style={styles.nextDivider} />
          <NextCard
            dep={next}
            accentColor={accentColor}
            isLoading={isLoading}
            serviceBoundary={serviceBoundary}
          />
        </View>

        <SectionDivider
          label={t("homeUpcoming")}
          style={styles.dividerPadded}
        />

        {upcoming.length > 0 ? (
          <View style={[styles.list, styles.listSection]}>
            {upcoming.map((dep, i) => (
              <DepartureRow
                key={`${dep.key}-${dep.status}`}
                dep={dep}
                isLast={i === upcoming.length - 1}
              />
            ))}
          </View>
        ) : showUpcomingEmpty ? (
          <EmptyState message={t("homeNoDepartures")} />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function HomeScreen({
  isActive = false,
}: {
  isActive?: boolean;
}) {
  const styles = useHomeStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { settings, update, toggleKojoriFavorite, toggleTbilisiFavorite } =
    useSettings();
  const { activeDirection, selectDirection } = useActiveDirection();
  const { widgetMode, widgetStopId } = useLocalSearchParams<{
    widgetMode?: string;
    widgetStopId?: string;
  }>();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const handledWidgetLink = useRef<string | null>(null);
  const kojoriPaneNowRef = useRef(now);
  const tbilisiPaneNowRef = useRef(now);
  const mode = directionToMode(activeDirection);

  useEffect(() => {
    if (widgetMode !== "kojori" && widgetMode !== "tbilisi") return;

    const nextKey = `${widgetMode}:${widgetStopId ?? ""}`;
    if (handledWidgetLink.current === nextKey) return;
    handledWidgetLink.current = nextKey;

    selectDirection(modeToDirection(widgetMode), { persist: "immediate" });

    if (!widgetStopId) return;

    if (widgetMode === "kojori") {
      const nextFavorites = settings.tbilisiFavorites.includes(widgetStopId)
        ? settings.tbilisiFavorites
        : [widgetStopId, ...settings.tbilisiFavorites];
      update({
        tbilisiFavorites: nextFavorites,
        activeTbilisiStopId: widgetStopId,
      });
      return;
    }

    const nextFavorites = settings.kojoriFavorites.includes(widgetStopId)
      ? settings.kojoriFavorites
      : [widgetStopId, ...settings.kojoriFavorites];
    update({
      kojoriFavorites: nextFavorites,
      activeKojoriStopId: widgetStopId,
    });
  }, [
    selectDirection,
    settings.kojoriFavorites,
    settings.tbilisiFavorites,
    update,
    widgetMode,
    widgetStopId,
  ]);

  useEffect(() => {
    if (!isActive) return undefined;

    function updateClock() {
      setNow(new Date());
    }

    updateClock();
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(
      () => {
        updateClock();
        intervalId = setInterval(updateClock, 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") updateClock();
    });

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      sub.remove();
    };
  }, [isActive]);

  useEffect(() => {
    if (mode === "kojori") {
      kojoriPaneNowRef.current = now;
    } else {
      tbilisiPaneNowRef.current = now;
    }
  }, [mode, now]);

  const activeStopId =
    mode === "kojori"
      ? settings.activeTbilisiStopId
      : settings.activeKojoriStopId;
  const kojoriPaneNow = mode === "kojori" ? now : kojoriPaneNowRef.current;
  const tbilisiPaneNow = mode === "tbilisi" ? now : tbilisiPaneNowRef.current;

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setNow(new Date());

    try {
      await Promise.all([
        queryClient.refetchQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === "arrivals" &&
            query.queryKey[1] === activeStopId,
        }),
        queryClient.refetchQueries({
          queryKey: [
            "schedule",
            ROUTES["380"].id,
            ROUTES["380"][activeDirection],
          ],
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: [
            "schedule",
            ROUTES["316"].id,
            ROUTES["316"][activeDirection],
          ],
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: ["vehicle-positions", activeDirection],
          exact: true,
        }),
      ]);
    } finally {
      setNow(new Date());
      setIsRefreshing(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TtcStatusTopBar />

      <View style={styles.directionPaneStack}>
        <View
          pointerEvents={mode === "kojori" ? "auto" : "none"}
          style={[
            styles.directionPane,
            mode !== "kojori" && styles.directionPaneHidden,
          ]}
        >
          <DirectionDeparturesView
            isActive={isActive && mode === "kojori"}
            direction="toKojori"
            favoriteIds={settings.tbilisiFavorites}
            activeStopId={settings.activeTbilisiStopId}
            onSelectStop={(id) => update({ activeTbilisiStopId: id })}
            onToggleFavorite={toggleTbilisiFavorite}
            bottomInset={insets.bottom}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            now={kojoriPaneNow}
            demoEnabled={settings.cancelledBusDemo}
          />
        </View>
        <View
          pointerEvents={mode === "tbilisi" ? "auto" : "none"}
          style={[
            styles.directionPane,
            mode !== "tbilisi" && styles.directionPaneHidden,
          ]}
        >
          <DirectionDeparturesView
            isActive={isActive && mode === "tbilisi"}
            direction="toTbilisi"
            favoriteIds={settings.kojoriFavorites}
            activeStopId={settings.activeKojoriStopId}
            onSelectStop={(id) => update({ activeKojoriStopId: id })}
            onToggleFavorite={toggleKojoriFavorite}
            bottomInset={insets.bottom}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            now={tbilisiPaneNow}
            demoEnabled={settings.cancelledBusDemo}
          />
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function createStyles(C: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },

    modeContainer: { flex: 1 },
    directionPaneStack: { flex: 1 },
    directionPane: { ...StyleSheet.absoluteFill },
    directionPaneHidden: { opacity: 0 },
    pageScroll: { flex: 1 },
    pageScrollContent: { flexGrow: 1 },
    fixedSection: { paddingHorizontal: CONTENT_SIDE, paddingTop: 12 },
    dividerPadded: { paddingHorizontal: CONTENT_SIDE },

    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: SECTION_SPACE,
    },
    nextDivider: { paddingTop: SECTION_SPACE, paddingBottom: SECTION_SPACE },
    dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
    dividerLabel: {
      color: C.textFaint,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 2.5,
    },

    nextBlock: { gap: 10 },
    nextCard: {
      flexDirection: "row",
      backgroundColor: C.surface,
      borderRadius: 18,
      borderWidth: 1,
      overflow: "hidden",
      minHeight: 136,
    },
    centered: { justifyContent: "center" },
    nextAccentBar: { width: 4, alignSelf: "stretch" },
    nextContent: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 13,
    },
    nextHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    nextHeaderLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
      flexShrink: 1,
    },
    nextHeaderCopy: {
      flexShrink: 1,
      minWidth: 0,
      gap: 3,
    },
    nextTitle: {
      color: C.text,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: "700",
      letterSpacing: 0,
    },
    nextSubtitle: {
      color: C.textDim,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "600",
    },
    nextEyebrow: {
      color: alpha(C.text, "B8"),
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.8,
    },
    nextHero: {
      justifyContent: "center",
      minHeight: 46,
    },
    nextCountdownHero: {
      color: C.text,
      fontSize: 42,
      fontWeight: "800",
      letterSpacing: 0,
      lineHeight: 48,
      flexShrink: 1,
      textAlign: "center",
    },
    nextCountdownNumber: {
      fontSize: 48,
      fontWeight: "800",
      lineHeight: 52,
    },
    nextScheduleHeroTime: {
      fontSize: 46,
      fontWeight: "800",
      lineHeight: 52,
      letterSpacing: 0,
      textAlign: "center",
    },
    nextRouteBadge: {
      minWidth: 62,
      height: 36,
      borderRadius: 11,
      borderWidth: 1.5,
      paddingHorizontal: 10,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: C.bg,
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    nextRouteBadgeText: { fontSize: 25, fontWeight: "800", letterSpacing: 0 },
    nextStatusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: 104,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      flexShrink: 0,
    },
    nextStatusText: {
      flexShrink: 1,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    nextMetaRow: {
      flexDirection: "row",
      flexWrap: "nowrap",
      alignItems: "center",
      gap: 6,
      justifyContent: "center",
      minHeight: 22,
    },
    nextDriftChip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
      flexShrink: 0,
    },
    nextDriftChipText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    nextMetaDot: {
      color: C.textFaint,
      fontSize: 12,
      fontWeight: "800",
      marginHorizontal: 2,
      flexShrink: 0,
    },
    nextMetaStatus: {
      color: C.textDim,
      flexShrink: 1,
      minWidth: 0,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    nextMetaLabel: {
      flexShrink: 1,
    },
    nextMetaCountdown: {
      fontWeight: "800",
      flexShrink: 0,
    },
    serviceTitle: {
      color: C.text,
      fontSize: 23,
      lineHeight: 28,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    serviceDetail: {
      color: C.textDim,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    servicePill: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    servicePillText: {
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.2,
    },
    badge: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
    },
    badgeText: { fontSize: 13, fontWeight: "600", letterSpacing: 0.2 },

    busTag: {
      borderWidth: 1.5,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      minWidth: 46,
      alignItems: "center",
    },
    busTagText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },

    list: {
      backgroundColor: C.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      overflow: "hidden",
    },
    listSection: { marginHorizontal: CONTENT_SIDE },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 15,
      gap: 14,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    rowMain: { flex: 1, minWidth: 74, gap: 3 },
    rowTime: {
      color: C.text,
      fontSize: 22,
      fontWeight: "600",
      letterSpacing: -0.3,
      minWidth: 0,
    },
    rowMeta: {
      maxWidth: "62%",
      flexShrink: 1,
      minWidth: 0,
      alignItems: "flex-end",
      justifyContent: "center",
      gap: 7,
    },
    rowMetaBadge: { alignSelf: "flex-end", maxWidth: "100%" },
    rowCountdown: {
      color: C.textDim,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "500",
      textAlign: "right",
    },

    liveBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
    },
    liveBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
    liveBadgeSmall: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    liveBadgeSmallText: {
      flexShrink: 1,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    scheduledHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      maxWidth: "100%",
      flexShrink: 1,
    },
    scheduledHintCompact: { gap: 4 },
    scheduledHintText: {
      color: C.textDim,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    scheduledHintTextCompact: {
      color: C.textFaint,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    scheduledHintTextProminent: {
      color: C.text,
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0,
    },
    scheduledHintTime: {
      fontWeight: "800",
    },
    scheduledHintTimeProminent: {
      fontSize: 15,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.live },

    emptyState: { paddingVertical: 32, alignItems: "center" },
    emptyText: { color: C.textDim, fontSize: 14 },
    errorBanner: {
      backgroundColor: C.error + "18",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.error + "40",
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 4,
    },
    errorText: { color: C.error, fontSize: 12 },
  });
}

function useHomeStyles() {
  const colors = useAppColors();
  return useMemo(() => createStyles(colors), [colors]);
}
