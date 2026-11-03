import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Linking from "expo-linking";
import { useGlobalSearchParams } from "expo-router";
import React, { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Platform,
  Pressable,
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
import { useAppColors } from "@/hooks/use-app-colors";
import { useClosestTripStop } from "@/hooks/use-closest-stop";
import { useI18n } from "@/hooks/use-i18n";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useStopNames } from "@/hooks/use-stop-names";
import { createThemedStyles } from "@/utils/themed-styles";
import { useTransitCopy } from "@/transit/copy";
import { useFavorites } from "@/transit/favorites";
import { useFavoriteDepartures } from "@/transit/hooks";
import {
  serviceDayBounds,
  transitDate,
  transitTime,
  tripStopId,
  tripStops,
  type Favorite,
  type TransitDeparture,
  type TransitRoute,
} from "@/transit/model";
import { useTripUi } from "@/transit/trip-ui";
import { routeColor, transitModeIcon, tripAccent } from "@/transit/ui";

const MONO = Platform.select({
  android: "monospace",
  ios: "Menlo",
  default: "monospace",
});
const CONTENT_SIDE = 20;
const SECTION_SPACE = 12;

/** A departure as the home screen draws it. */
type Departure = {
  key: string;
  route: TransitRoute;
  time: string;
  minsUntil: number;
  scheduledTime?: string;
  live: boolean;
  driftMinutes?: number | null;
};

type ServiceDeparture = {
  route: TransitRoute;
  time: string;
  date: string;
  daysUntil: number;
};

type DepartureServiceBoundary = {
  nextServiceDeparture: ServiceDeparture | null;
  serviceEndedToday: boolean;
  nextDepartureIsFinal: boolean;
};

function toDeparture(dep: TransitDeparture, now: number): Departure {
  return {
    key: dep.key,
    route: dep.boarding.route,
    time: transitTime(dep.epochMs),
    minsUntil: Math.max(0, Math.round((dep.epochMs - now) / 60_000)),
    scheduledTime: transitTime(dep.scheduledEpochMs),
    live: dep.live,
    driftMinutes: dep.live
      ? Math.round((dep.epochMs - dep.scheduledEpochMs) / 60_000)
      : null,
  };
}

/** Today's departures on the home list; later ones only announce next service. */
function splitServiceDay(
  rows: TransitDeparture[],
  servedToday: boolean,
  now: number,
) {
  const { end } = serviceDayBounds(now);
  const today = rows.filter((dep) => dep.epochMs < end);
  const later = rows.find((dep) => dep.epochMs >= end);
  const boundary: DepartureServiceBoundary = {
    nextServiceDeparture:
      today.length === 0 && later
        ? {
            route: later.boarding.route,
            time: transitTime(later.epochMs),
            date: transitDate(later.epochMs),
            daysUntil: Math.max(
              1,
              Math.round(
                (Date.parse(transitDate(later.epochMs)) -
                  Date.parse(transitDate(now))) /
                  86_400_000,
              ),
            ),
          }
        : null,
    serviceEndedToday: today.length === 0 && servedToday,
    nextDepartureIsFinal: today.length === 1,
  };
  return { today, boundary };
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

function getDisplayedDepartures(departures: Departure[]) {
  const [next, ...upcoming] = departures;
  return { next, upcoming };
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

// ── Atoms ─────────────────────────────────────────────────────────────────────
function BusTag({ route, trip }: { route: TransitRoute; trip: Favorite }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const color = routeColor(route.id, colors, trip);
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      {route.mode !== "BUS" ? (
        <MaterialCommunityIcons
          name={transitModeIcon(route.mode)}
          size={13}
          color={color}
        />
      ) : null}
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>
        {route.shortName}
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
function DepartureRow({
  dep,
  trip,
  isLast,
}: {
  dep: Departure;
  trip: Favorite;
  isLast: boolean;
}) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const { t, formatDuration, formatRelativeDuration } = useI18n();
  const countdown = formatMins(dep.minsUntil, t, formatDuration, formatRelativeDuration);
  const realtimeStatus = getRealtimeStatus(dep, colors, t);

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <BusTag route={dep.route} trip={trip} />
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
  trip,
  accentColor,
  isLoading,
  serviceBoundary,
}: {
  dep: Departure | undefined;
  trip: Favorite;
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
              <BusTag route={serviceBoundary.nextServiceDeparture.route} trip={trip} />
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
  const busColor = routeColor(dep.route.id, colors, trip);
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
                  {dep.route.shortName}
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

// ── Trip view ─────────────────────────────────────────────────────────────────
function TripDeparturesView({
  trip,
  isActive,
  bottomInset,
  now,
}: {
  trip: Favorite;
  isActive: boolean;
  bottomInset: number;
  now: number;
}) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const { t } = useI18n();
  const copy = useTransitCopy();
  const stopNames = useStopNames();
  const { setStop } = useFavorites();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const activeStopId = tripStopId(trip);
  const stops = tripStops(trip).map((stop) => ({
    ...stop,
    label: stopNames[stop.id] ?? stop.label,
  }));
  const {
    closestStop,
    status: closestStopStatus,
    resolvedLocation,
    requestLocation: handleRequestLocation,
  } = useClosestTripStop(stops, activeStopId, isActive);
  const accentColor = tripAccent(trip, colors);
  const closestStopId =
    closestStopStatus === "available" && closestStop ? closestStop.id : null;

  const data = useFavoriteDepartures(trip, isActive, now);
  const { today, boundary: serviceBoundary } = splitServiceDay(
    data.rows,
    data.servedToday,
    now,
  );
  const { next, upcoming } = getDisplayedDepartures(
    today.map((dep) => toDeparture(dep, now)),
  );
  const isLoading = data.loading && !data.hasSchedule;
  const isError = !data.hasSchedule && !data.loading && data.failedCount > 0;
  const hasNextServiceCard = !next && Boolean(serviceBoundary.nextServiceDeparture);
  // With nothing next, the next card already says so.
  const showUpcomingEmpty =
    Boolean(next) &&
    !isLoading &&
    upcoming.length === 0 &&
    !serviceBoundary.nextDepartureIsFinal &&
    !hasNextServiceCard;

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await data.refresh();
    } finally {
      setIsRefreshing(false);
    }
  }

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
            onRefresh={handleRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surfaceHigh}
          />
        }
      >
        <View style={styles.fixedSection}>
          <StopSelector
            stops={stops}
            activeStopId={activeStopId}
            accentColor={accentColor}
            tripId={trip.id}
            onSelectStop={(id) => setStop(trip.id, id)}
            mapReturnRoute="index"
            closestStopId={closestStopId}
            userLocation={resolvedLocation}
            onRequestLocation={handleRequestLocation}
            showDirectionSwitch
          />

          {isError ? <ErrorBanner message={t("homeScheduleError")} /> : null}
          {data.missingStops.length > 0 ? (
            <ErrorBanner message={copy("stopsChanged")} />
          ) : null}

          <SectionDivider label={t("homeNext")} style={styles.nextDivider} />
          <NextCard
            dep={next}
            trip={trip}
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
                key={dep.key}
                dep={dep}
                trip={trip}
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

function NoTrips({ bottomInset }: { bottomInset: number }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const copy = useTransitCopy();
  const { openEditor } = useTripUi();
  return (
    <View
      style={[
        styles.noTrips,
        { paddingBottom: bottomInset + BottomTabInset + 24 },
      ]}
    >
      <View
        style={[
          styles.noTripsIcon,
          { backgroundColor: alpha(colors.route380, "1F") },
        ]}
      >
        <MaterialCommunityIcons
          name="bus-marker"
          size={34}
          color={colors.route380}
        />
      </View>
      <Text style={styles.noTripsTitle}>{copy("tripsEmpty")}</Text>
      <Text style={styles.noTripsText}>{copy("tripsEmptyNote")}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => openEditor()}
        style={({ pressed }) => [
          styles.noTripsButton,
          { backgroundColor: colors.route380, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={20} color={colors.bg} />
        <Text style={[styles.noTripsButtonText, { color: colors.bg }]}>
          {copy("tripAdd")}
        </Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen({
  // Web renders tabs through the router without the native tab host's prop.
  isActive = Platform.OS === "web",
}: {
  isActive?: boolean;
}) {
  const styles = useHomeStyles();
  const insets = useSafeAreaInsets();
  const { state, selected, select, setStop } = useFavorites();
  const { widgetFavoriteId, widgetMode, widgetStopId } = useGlobalSearchParams<{
    widgetFavoriteId?: string;
    widgetMode?: string;
    widgetStopId?: string;
  }>();
  const [now, setNow] = useState(() => Date.now());
  const handledWidgetLink = useRef<string | null>(null);

  // Widgets link to a trip; widgets made before trips existed link to a
  // Kojori direction plus stop, which the migrated trips keep as their ids.
  const applyWidgetLink = useEffectEvent(
    (
      params: { favoriteId?: string; mode?: string; stopId?: string },
      repeatedTap = false,
    ) => {
      const id =
        params.favoriteId ??
        (params.mode === "kojori"
          ? "legacy:toKojori"
          : params.mode === "tbilisi"
            ? "legacy:toTbilisi"
            : undefined);
      if (!id || !state.favorites.some((f) => f.id === id)) return;
      const key = `${id}:${params.stopId ?? ""}`;
      if (!repeatedTap && handledWidgetLink.current === key) return;
      handledWidgetLink.current = key;
      select(id);
      if (params.stopId) setStop(id, params.stopId);
    },
  );

  // The screens are mounted by our tab host, so cold-start parameters belong
  // to the global router. A fresh URL event must also reapply an identical link
  // after the rider has manually changed trip or boarding stop.
  useEffect(() => {
    applyWidgetLink({
      favoriteId: widgetFavoriteId,
      mode: widgetMode,
      stopId: widgetStopId,
    });
  }, [widgetFavoriteId, widgetMode, widgetStopId]);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const params = Linking.parse(url).queryParams;
      const read = (value: unknown) =>
        typeof value === "string" ? value : undefined;
      applyWidgetLink(
        {
          favoriteId: read(params?.widgetFavoriteId),
          mode: read(params?.widgetMode),
          stopId: read(params?.widgetStopId),
        },
        true,
      );
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;

    function updateClock() {
      setNow(Date.now());
    }

    updateClock();
    // Live predictions move between minute ticks; 15 s keeps countdowns honest.
    const intervalId = setInterval(updateClock, 15_000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") updateClock();
    });

    return () => {
      clearInterval(intervalId);
      sub.remove();
    };
  }, [isActive]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TtcStatusTopBar />
      {selected ? (
        <TripDeparturesView
          key={selected.id}
          trip={selected}
          isActive={isActive}
          bottomInset={insets.bottom}
          now={now}
        />
      ) : (
        <NoTrips bottomInset={insets.bottom} />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function createStyles(C: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },

    modeContainer: { flex: 1 },
    noTrips: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 36,
      gap: 12,
    },
    noTripsIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    noTripsTitle: {
      color: C.text,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "700",
      textAlign: "center",
      fontFamily: Platform.select({ android: "serif", ios: "Georgia", default: "serif" }),
    },
    noTripsText: {
      color: C.textDim,
      fontSize: 15,
      lineHeight: 21,
      textAlign: "center",
    },
    noTripsButton: {
      marginTop: 12,
      height: 48,
      borderRadius: 24,
      paddingHorizontal: 22,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    noTripsButtonText: { fontSize: 16, fontWeight: "800" },
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

const getHomeStyles = createThemedStyles(createStyles);

function useHomeStyles() {
  return getHomeStyles(useAppColors());
}
