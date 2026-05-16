import React, { useEffect, useMemo, useState } from "react";
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

import { DirectionPill } from "@/components/direction-picker";
import { StopSelector } from "@/components/stop-selector";
import { TtcStatusTopBar } from "@/components/ttc-status-top-bar";
import { alpha, BottomTabInset, type AppColors } from "@/constants/theme";
import { useActiveDirection } from "@/hooks/use-active-direction";
import { useAppColors } from "@/hooks/use-app-colors";
import { useClosestStop } from "@/hooks/use-closest-stop";
import { useI18n } from "@/hooks/use-i18n";
import { useRouteStops } from "@/hooks/use-route-stops";
import { useSchedule } from "@/hooks/use-schedule";
import { useSettings } from "@/hooks/use-settings";
import { useStopNames } from "@/hooks/use-stop-names";
import {
  BusLine,
  extractStopTimes,
  findStop,
  getTodayPeriod,
  parseTimeToMins,
  ROUTES,
  SCHEDULE_STOP_PROXY,
  type StopInfo,
} from "@/services/ttc";

const MONO = Platform.select({
  android: "monospace",
  ios: "Menlo",
  default: "monospace",
});

type Filter = "all" | BusLine;

interface TimetableEntry {
  bus: BusLine;
  time: string;
  minsFromMidnight: number;
}

interface TimetableSection {
  title: string;
  data: TimetableEntry[];
}

function groupByPeriod(
  entries: TimetableEntry[],
  t: ReturnType<typeof useI18n>["t"],
): TimetableSection[] {
  const periods = [
    { title: t("timetableMorning"), min: 0, max: 719 },
    { title: t("timetableAfternoon"), min: 720, max: 1019 },
    { title: t("timetableEvening"), min: 1020, max: 1439 },
  ];
  return periods
    .map((p) => ({
      title: p.title,
      data: entries.filter(
        (e) => e.minsFromMidnight >= p.min && e.minsFromMidnight <= p.max,
      ),
    }))
    .filter((s) => s.data.length > 0);
}

function getCurrentMinsFromMidnight(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatRelativeTimeHint(
  minsUntil: number,
  t: ReturnType<typeof useI18n>["t"],
  formatDuration: ReturnType<typeof useI18n>["formatDuration"],
  formatRelativeDuration: ReturnType<typeof useI18n>["formatRelativeDuration"],
) {
  if (minsUntil < -1) return null;
  if (minsUntil < 1) return t("commonNow");
  if (minsUntil < 60) return formatRelativeDuration("future", "minute", minsUntil);

  const hours = Math.floor(minsUntil / 60);
  const minutes = minsUntil % 60;
  return minutes > 0
    ? t("timeInHours", {
        hours: formatDuration("hour", hours),
        minutes: formatDuration("minute", minutes),
      })
    : formatRelativeDuration("future", "hour", hours);
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

function BusTag({ bus }: { bus: BusLine }) {
  const colors = useAppColors();
  const styles = useTimetableStyles();
  const color = bus === "380" ? colors.route380 : colors.route316;
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>
        {bus}
      </Text>
    </View>
  );
}

export default function TimetableScreen() {
  const colors = useAppColors();
  const styles = useTimetableStyles();
  const { t, formatCount, formatDuration, formatRelativeDuration } = useI18n();
  const insets = useSafeAreaInsets();
  const { settings, update, toggleKojoriFavorite, toggleTbilisiFavorite } =
    useSettings();
  const { activeDirection } = useActiveDirection();
  const stopNames = useStopNames();
  const [filter, setFilter] = useState<Filter>("all");
  const [nowMins, setNowMins] = useState(() => getCurrentMinsFromMidnight());
  const direction = activeDirection;

  useEffect(() => {
    setNowMins(getCurrentMinsFromMidnight());
    const intervalId = setInterval(
      () => setNowMins(getCurrentMinsFromMidnight()),
      30_000,
    );
    return () => clearInterval(intervalId);
  }, []);

  const favoriteIds =
    direction === "toKojori"
      ? settings.tbilisiFavorites
      : settings.kojoriFavorites;
  const stopId =
    direction === "toKojori"
      ? settings.activeTbilisiStopId
      : settings.activeKojoriStopId;
  const { stops: routeStops } = useRouteStops(direction);
  const {
    closestStop,
    distanceMeters: closestStopDistance,
    status: closestStopStatus,
  } = useClosestStop(direction, stopId);
  const stops = useMemo(
    () =>
      buildStopSelectorStops({
        favoriteIds,
        activeStopId: stopId,
        routeStops,
        stopNames,
        stopFallback: (id) =>
          t("commonStopNumber", { id: id.split(":")[1] ?? id }),
      }),
    [favoriteIds, routeStops, stopId, stopNames, t],
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

  function handleSelectStop(id: string) {
    if (direction === "toKojori") {
      update({ activeTbilisiStopId: id });
    } else {
      update({ activeKojoriStopId: id });
    }
  }

  const { data: s380ToKojori, isLoading: l380ToKojori } = useSchedule(
    ROUTES["380"].id,
    ROUTES["380"].toKojori,
  );
  const { data: s316ToKojori, isLoading: l316ToKojori } = useSchedule(
    ROUTES["316"].id,
    ROUTES["316"].toKojori,
  );
  const { data: s380ToTbilisi, isLoading: l380ToTbilisi } = useSchedule(
    ROUTES["380"].id,
    ROUTES["380"].toTbilisi,
  );
  const { data: s316ToTbilisi, isLoading: l316ToTbilisi } = useSchedule(
    ROUTES["316"].id,
    ROUTES["316"].toTbilisi,
  );

  const s380 = direction === "toKojori" ? s380ToKojori : s380ToTbilisi;
  const s316 = direction === "toKojori" ? s316ToKojori : s316ToTbilisi;
  const l380 = direction === "toKojori" ? l380ToKojori : l380ToTbilisi;
  const l316 = direction === "toKojori" ? l316ToKojori : l316ToTbilisi;

  const isLoading = l380 || l316;
  const accentColor =
    direction === "toKojori" ? colors.route380 : colors.route316;

  const sections = useMemo<TimetableSection[]>(() => {
    const buses: BusLine[] = filter === "all" ? ["380", "316"] : [filter];
    const entries: TimetableEntry[] = [];

    const schedules: Record<BusLine, typeof s380> = {
      "380": s380,
      "316": s316,
    };

    // Apply proxy fallback for stops that TTC omits from schedule
    const lookupStopId = SCHEDULE_STOP_PROXY[stopId] ?? stopId;

    for (const bus of buses) {
      const schedule = schedules[bus];
      if (!schedule) continue;
      const period = getTodayPeriod(schedule);
      if (!period) continue;
      const times = extractStopTimes(period, lookupStopId);

      for (const t of times) {
        entries.push({ bus, time: t, minsFromMidnight: parseTimeToMins(t) });
      }
    }

    return groupByPeriod(
      entries.sort((a, b) => a.minsFromMidnight - b.minsFromMidnight),
      t,
    );
  }, [s380, s316, stopId, filter, t]);

  const totalCount = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <TtcStatusTopBar />

      {/* Header */}
      <View style={styles.header}>
        <DirectionPill accentColor={accentColor} />
        <View style={styles.headerRight}>
          {isLoading ? (
            <ActivityIndicator color={colors.textDim} size="small" />
          ) : (
            <Text style={styles.headerCount}>
              {t("timetableCount", { count: formatCount("departures", totalCount) })}
            </Text>
          )}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${item.bus}-${item.time}-${i}`}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + BottomTabInset + 24 },
        ]}
        ListHeaderComponent={
          <View>
            <View style={styles.topDivider}>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.stopSelectorWrap}>
              <StopSelector
                stops={stops}
                activeStopId={stopId}
                accentColor={accentColor}
                onSelectStop={handleSelectStop}
                mapReturnRoute="timetable"
                locationSuggestion={locationSuggestion}
                addStopModal={{
                  title:
                    direction === "toKojori"
                      ? t("timetableTbilisiStops")
                      : t("timetableKojoriStops"),
                  direction,
                  favoriteIds,
                  onToggle:
                    direction === "toKojori"
                      ? toggleTbilisiFavorite
                      : toggleKojoriFavorite,
                }}
                label={t("stopTimetable")}
              />
            </View>

            <View style={styles.filterRow}>
              {(["all", "380", "316"] as Filter[]).map((f) => {
                const isActive = filter === f;
                const chipColor =
                  f === "380"
                    ? colors.route380
                    : f === "316"
                      ? colors.route316
                      : accentColor;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={f === "all" ? t("timetableAllBuses") : t("commonRoute") + ` ${f}`}
                    accessibilityState={{ selected: isActive }}
                    key={f}
                    style={[
                      styles.filterChip,
                      isActive && {
                        borderColor: chipColor,
                        backgroundColor: alpha(chipColor, "14"),
                      },
                    ]}
                    onPress={() => setFilter(f)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isActive && { color: chipColor, fontWeight: "600" },
                      ]}
                    >
                      {f === "all" ? t("timetableAllBuses") : f}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator color={accentColor} size="large" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t("timetableNoEntries")}</Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>
              {section.title.toUpperCase()}
            </Text>
            <View style={styles.sectionHeaderLine} />
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const minsUntil = item.minsFromMidnight - nowMins;
          const relativeHint = formatRelativeTimeHint(minsUntil, t, formatDuration, formatRelativeDuration);
          const isPast = minsUntil < -1;
          const isSoon = minsUntil >= -1 && minsUntil <= 30;

          return (
            <View
              style={[
                styles.timeRow,
                index === 0 && styles.timeRowFirst,
                index < section.data.length - 1
                  ? styles.timeRowDivider
                  : styles.timeRowLast,
                isPast && styles.timeRowPast,
                isSoon && {
                  borderColor: alpha(accentColor, "55"),
                  backgroundColor: alpha(accentColor, "0D"),
                },
              ]}
            >
              <BusTag bus={item.bus} />
              <View style={styles.timeMain}>
                <Text
                  style={[styles.timeText, { fontFamily: MONO }]}
                  numberOfLines={1}
                >
                  {item.time}
                </Text>
              </View>
              <View style={styles.timeMeta}>
                {relativeHint ? (
                  <Text
                    style={[
                      styles.relativeText,
                      isSoon && { color: accentColor },
                      { fontFamily: MONO },
                    ]}
                    numberOfLines={1}
                  >
                    {relativeHint}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    headerRight: { minWidth: 72, alignItems: "flex-end" },
    headerCount: { color: C.textDim, fontSize: 13, fontWeight: "500" },

    topDivider: {
      paddingTop: 4,
      paddingBottom: 16,
    },
    dividerLine: { height: 1, backgroundColor: C.border },
    stopSelectorWrap: { paddingTop: 2 },

    filterRow: {
      flexDirection: "row",
      gap: 8,
      paddingTop: 18,
      paddingBottom: 2,
    },
    filterChip: {
      paddingHorizontal: 15,
      paddingVertical: 6,
      borderRadius: 100,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    filterChipText: { color: C.textDim, fontSize: 13, fontWeight: "500" },

    noteBanner: {
      marginBottom: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: C.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    noteText: { color: C.textDim, fontSize: 12, lineHeight: 17 },

    loadingCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyState: { paddingVertical: 32, alignItems: "center" },
    emptyText: { color: C.textDim, fontSize: 14 },

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
    sectionCount: { color: C.textFaint, fontSize: 11, fontWeight: "600" },

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
    timeRowPast: { opacity: 0.54 },
    timeMain: { flex: 1, minWidth: 0 },
    timeText: {
      color: C.text,
      fontSize: 22,
      fontWeight: "600",
      letterSpacing: -0.3,
    },
    timeMeta: {
      minWidth: 92,
      flexShrink: 0,
      alignItems: "flex-end",
    },
    relativeText: {
      color: C.textDim,
      fontSize: 13,
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
      alignItems: "center",
    },
    busTagText: { fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  });
}

function useTimetableStyles() {
  const colors = useAppColors();
  return useMemo(() => createStyles(colors), [colors]);
}
