import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useQueries } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StopSelector } from "@/components/stop-selector";
import {
  boardingRoutes,
  dateLocale,
  dayConfirmation,
  groupByDayPart,
  timetableRows,
  type DayPart,
  type PeriodsByPattern,
  type TimetableRow,
} from "@/components/timetable-rows";
import { alpha, BottomTabInset, type AppColors } from "@/constants/theme";
import { useAppColors } from "@/hooks/use-app-colors";
import { useClosestTripStop } from "@/hooks/use-closest-stop";
import { useI18n } from "@/hooks/use-i18n";
import { useStopNames } from "@/hooks/use-stop-names";
import { useTransitCopy } from "@/transit/copy";
import { scheduleQuery } from "@/transit/data";
import { TransitDatePicker } from "@/transit/date-picker";
import { useFavorites } from "@/transit/favorites";
import {
  activeBoardings,
  patternKey,
  shiftTransitDate,
  transitDate,
  transitTime,
  tripPatterns,
  tripStopId,
  tripStops,
  type TransitRoute,
} from "@/transit/model";
import { routeColor, tripAccent } from "@/transit/ui";
import { useTripUi } from "@/transit/trip-ui";
import { createThemedStyles } from "@/utils/themed-styles";

const MONO = Platform.select({
  android: "monospace",
  ios: "Menlo",
  default: "monospace",
});

const MINUTE_MS = 60_000;

function currentMinute() {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

/** Wall clock, ticking on the minute while the tab is visible. */
function useMinuteClock(active: boolean) {
  const [now, setNow] = useState(currentMinute);
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => setNow(currentMinute());
    tick();
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(
      () => {
        tick();
        intervalId = setInterval(tick, MINUTE_MS);
      },
      MINUTE_MS - (Date.now() % MINUTE_MS),
    );
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [active]);
  return now;
}

function formatRelativeTimeHint(
  minsUntil: number,
  t: ReturnType<typeof useI18n>["t"],
  formatDuration: ReturnType<typeof useI18n>["formatDuration"],
  formatRelativeDuration: ReturnType<typeof useI18n>["formatRelativeDuration"],
) {
  if (minsUntil < -1) return null;
  if (minsUntil < 1) return t("commonNow");
  if (minsUntil < 60)
    return formatRelativeDuration("future", "minute", minsUntil);

  const hours = Math.floor(minsUntil / 60);
  const minutes = minsUntil % 60;
  return minutes > 0
    ? t("timeInHours", {
        hours: formatDuration("hour", hours),
        minutes: formatDuration("minute", minutes),
      })
    : formatRelativeDuration("future", "hour", hours);
}

function RouteTag({ route, color }: { route: TransitRoute; color: string }) {
  const styles = useTimetableStyles();
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text
        style={[styles.busTagText, { color, fontFamily: MONO }]}
        numberOfLines={1}
      >
        {route.shortName}
      </Text>
    </View>
  );
}

function Chip({
  label,
  accessibilityLabel,
  selected,
  color,
  icon,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  color: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  onPress: () => void;
}) {
  const colors = useAppColors();
  const styles = useTimetableStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[
        styles.filterChip,
        selected && {
          borderColor: color,
          backgroundColor: alpha(color, "14"),
        },
      ]}
      onPress={onPress}
    >
      {icon ? (
        <MaterialCommunityIcons
          name={icon}
          size={14}
          color={selected ? color : colors.textDim}
        />
      ) : null}
      <Text
        style={[
          styles.filterChipText,
          selected && { color, fontWeight: "600" },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function NoTrip() {
  const colors = useAppColors();
  const styles = useTimetableStyles();
  const copy = useTransitCopy();
  const { openEditor } = useTripUi();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        styles.noTrip,
        { paddingTop: insets.top, paddingBottom: insets.bottom + BottomTabInset },
      ]}
    >
      <MaterialCommunityIcons
        name="table-clock"
        size={34}
        color={colors.textFaint}
      />
      <Text style={styles.noTripText}>{copy("timetableNoTrip")}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => openEditor()}
        style={({ pressed }) => [
          styles.filterChip,
          styles.noTripButton,
          {
            borderColor: colors.primary,
            backgroundColor: alpha(colors.primary, pressed ? "26" : "14"),
          },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
        <Text style={[styles.filterChipText, { color: colors.primary, fontWeight: "600" }]}>
          {copy("addTrip")}
        </Text>
      </Pressable>
    </View>
  );
}

export default function TimetableScreen({
  isActive = true,
}: {
  isActive?: boolean;
}) {
  const colors = useAppColors();
  const styles = useTimetableStyles();
  const { t, formatDuration, formatRelativeDuration, resolvedLanguage } =
    useI18n();
  const copy = useTransitCopy();
  const insets = useSafeAreaInsets();
  const { selected: trip, setStop } = useFavorites();
  const stopNames = useStopNames();
  const [routeFilter, setRouteFilter] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const now = useMinuteClock(isActive);

  const stops = (trip ? tripStops(trip) : []).map((stop) => ({
    ...stop,
    label: stopNames[stop.id] ?? stop.label,
  }));
  const stopId = trip ? tripStopId(trip) : "";
  const closest = useClosestTripStop(stops, stopId, isActive && Boolean(trip));
  const closestStopId =
    closest.status === "available" && closest.closestStop
      ? closest.closestStop.id
      : null;

  // Every pattern of the trip, so switching boarding stops is instant.
  const patterns = trip ? tripPatterns(trip) : [];
  const schedules = useQueries({
    queries: patterns.map((b) => ({ ...scheduleQuery(b), enabled: isActive })),
  });

  if (!trip) return <NoTrip />;

  const periods: PeriodsByPattern = {};
  patterns.forEach((b, i) => {
    periods[patternKey(b)] = schedules[i]?.data;
  });
  const isLoading = schedules.some((q) => q.isLoading && !q.data);
  const isError = schedules.some((q) => q.isError && !q.data);

  const boardings = activeBoardings(trip);
  const routes = boardingRoutes(boardings);
  const filter = routes.some((r) => r.id === routeFilter) ? routeFilter : null;
  const accentColor = tripAccent(trip, colors);

  const today = transitDate(now);
  const tomorrow = shiftTransitDate(today, 1);
  const date = pickedDate ?? today;
  const locale = dateLocale(resolvedLanguage);
  const customDate = date !== today && date !== tomorrow;

  const rows = timetableRows(boardings, periods, date, filter);
  const confirmation = dayConfirmation(boardings, periods, date);
  const partTitles: Record<DayPart, string> = {
    morning: t("timetableMorning"),
    afternoon: t("timetableAfternoon"),
    evening: t("timetableEvening"),
  };
  const sections = groupByDayPart(rows).map((section) => ({
    title: partTitles[section.part],
    data: section.data,
  }));
  const allLabel = routes.every((r) => r.mode === "BUS")
    ? t("timetableAllBuses")
    : copy("allModes");

  function selectDate(next: string) {
    setPickedDate(next === today ? null : next);
  }

  function renderItem({
    item,
    index,
    section,
  }: {
    item: TimetableRow;
    index: number;
    section: { data: TimetableRow[] };
  }) {
    const minsUntil = Math.round((item.epochMs - now) / MINUTE_MS);
    const relativeHint =
      minsUntil < 24 * 60
        ? formatRelativeTimeHint(
            minsUntil,
            t,
            formatDuration,
            formatRelativeDuration,
          )
        : null;
    const isSoon = minsUntil >= -1 && minsUntil <= 30;

    return (
      <View
        style={[
          styles.timeRow,
          index === 0 && styles.timeRowFirst,
          index < section.data.length - 1
            ? styles.timeRowDivider
            : styles.timeRowLast,
          isSoon && {
            borderColor: alpha(accentColor, "55"),
            backgroundColor: alpha(accentColor, "0D"),
          },
        ]}
      >
        <RouteTag
          route={item.boarding.route}
          color={routeColor(item.boarding.route.id, colors, trip)}
        />
        <View style={styles.timeMain}>
          <Text
            style={[styles.timeText, { fontFamily: MONO }]}
            numberOfLines={1}
          >
            {transitTime(item.epochMs)}
          </Text>
        </View>
        <View style={styles.timeMeta}>
          {relativeHint ? (
            <Text
              style={[styles.relativeText, isSoon && { color: accentColor }]}
              numberOfLines={2}
            >
              {relativeHint}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + BottomTabInset + 24 },
        ]}
        ListHeaderComponent={
          <View>
            <View style={styles.stopSelectorWrap}>
              <StopSelector
                stops={stops}
                activeStopId={stopId}
                accentColor={accentColor}
                tripId={trip.id}
                onSelectStop={(id) => setStop(trip.id, id)}
                mapReturnRoute="timetable"
                closestStopId={closestStopId}
                userLocation={closest.resolvedLocation}
                onRequestLocation={closest.requestLocation}
                showDirectionSwitch
                label={t("stopTimetable")}
              />
            </View>

            <View style={styles.filterRow}>
              <Chip
                label={copy("today")}
                selected={date === today}
                color={accentColor}
                onPress={() => selectDate(today)}
              />
              <Chip
                label={copy("tomorrow")}
                selected={date === tomorrow}
                color={accentColor}
                onPress={() => selectDate(tomorrow)}
              />
              <Chip
                icon="calendar-month-outline"
                label={
                  customDate
                    ? new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })
                    : copy("otherDate")
                }
                accessibilityLabel={
                  customDate
                    ? new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        timeZone: "UTC",
                      })
                    : copy("otherDate")
                }
                selected={customDate}
                color={accentColor}
                onPress={() => setPickerOpen(true)}
              />
            </View>

            {confirmation ? (
              <View style={styles.statusRow}>
                <MaterialCommunityIcons
                  name={
                    confirmation === "confirmed"
                      ? "check-circle-outline"
                      : "calendar-week"
                  }
                  size={13}
                  color={colors.textFaint}
                />
                <Text style={styles.statusText} numberOfLines={2}>
                  {copy(
                    confirmation === "confirmed"
                      ? "timetableConfirmed"
                      : "timetableWeekly",
                  )}
                </Text>
              </View>
            ) : null}

            {routes.length > 1 ? (
              <View style={styles.filterRow}>
                <Chip
                  label={allLabel}
                  selected={filter === null}
                  color={accentColor}
                  onPress={() => setRouteFilter(null)}
                />
                {routes.map((route) => (
                  <Chip
                    key={route.id}
                    label={route.shortName}
                    accessibilityLabel={`${t("commonRoute")} ${route.shortName}`}
                    selected={filter === route.id}
                    color={routeColor(route.id, colors, trip)}
                    onPress={() => setRouteFilter(route.id)}
                  />
                ))}
              </View>
            ) : null}
            <View style={styles.headerSpacer} />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={accentColor} size="large" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {isError
                  ? copy("unavailable")
                  : filter
                    ? t("timetableNoEntries")
                    : copy("noDayTrips")}
              </Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLine} />
            <Text style={styles.sectionHeaderText}>
              {section.title.toUpperCase()}
            </Text>
            <View style={styles.sectionHeaderLine} />
          </View>
        )}
        renderItem={renderItem}
      />
      {pickerOpen ? (
        <TransitDatePicker
          value={date}
          today={today}
          accentColor={accentColor}
          onSelect={(next) => {
            selectDate(next);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    stopSelectorWrap: { paddingTop: 12 },

    filterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      paddingTop: 14,
    },
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 15,
      paddingVertical: 6,
      borderRadius: 100,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    filterChipText: { color: C.textDim, fontSize: 13, fontWeight: "500" },

    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingTop: 10,
      paddingHorizontal: 4,
    },
    statusText: {
      flexShrink: 1,
      color: C.textFaint,
      fontSize: 12,
      lineHeight: 16,
    },
    headerSpacer: { height: 6 },

    noTrip: {
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      paddingHorizontal: 32,
    },
    noTripText: {
      color: C.textDim,
      fontSize: 15,
      lineHeight: 21,
      textAlign: "center",
      maxWidth: 320,
    },
    noTripButton: { paddingHorizontal: 18, paddingVertical: 9 },

    loadingCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 32,
    },
    emptyState: { paddingVertical: 32, alignItems: "center" },
    emptyText: { color: C.textDim, fontSize: 14, textAlign: "center" },

    listContent: { paddingHorizontal: 20 },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingTop: 10,
      paddingBottom: 14,
    },
    sectionHeaderText: {
      color: C.textFaint,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 2.5,
    },
    sectionHeaderLine: { flex: 1, height: 1, backgroundColor: C.border },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: C.surface,
      paddingHorizontal: 20,
      paddingVertical: 15,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: C.border,
    },
    timeRowFirst: {
      borderTopWidth: 1,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    },
    timeRowLast: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
      marginBottom: 6,
    },
    timeRowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
    timeMain: { flex: 1, minWidth: 0 },
    timeText: {
      color: C.text,
      fontSize: 22,
      fontWeight: "600",
      letterSpacing: -0.3,
    },
    timeMeta: {
      minWidth: 0,
      maxWidth: "55%",
      flexShrink: 1,
      alignItems: "flex-end",
    },
    relativeText: {
      color: C.textDim,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "500",
      letterSpacing: 0.1,
      textAlign: "right",
    },

    busTag: {
      borderWidth: 1.5,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      minWidth: 46,
      maxWidth: 92,
      alignItems: "center",
    },
    busTagText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  });
}

const getTimetableStyles = createThemedStyles(createStyles);

function useTimetableStyles() {
  return getTimetableStyles(useAppColors());
}
