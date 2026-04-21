import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionPickerSheet, DirectionPill } from '@/components/direction-picker';
import { StopSelector } from '@/components/stop-selector';
import { TtcStatusHeaderBadge } from '@/components/ttc-status-banner';
import { BottomTabInset, alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useClosestStop } from '@/hooks/use-closest-stop';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import {
  BusLine,
  extractStopTimes,
  findStop,
  getTodayPeriod,
  parseTimeToMins,
  ROUTES,
  SCHEDULE_STOP_PROXY,
  type StopInfo,
} from '@/services/ttc';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

type Filter = 'all' | BusLine;

interface TimetableEntry {
  bus: BusLine;
  time: string;
  minsFromMidnight: number;
}

interface TimetableSection {
  title: string;
  data: TimetableEntry[];
}

function groupByPeriod(entries: TimetableEntry[]): TimetableSection[] {
  const periods = [
    { title: 'Morning', min: 0, max: 719 },
    { title: 'Afternoon', min: 720, max: 1019 },
    { title: 'Evening', min: 1020, max: 1439 },
  ];
  return periods
    .map(p => ({ title: p.title, data: entries.filter(e => e.minsFromMidnight >= p.min && e.minsFromMidnight <= p.max) }))
    .filter(s => s.data.length > 0);
}

function buildStopSelectorStops({
  favoriteIds,
  activeStopId,
  routeStops,
  stopNames,
}: {
  favoriteIds: string[];
  activeStopId: string;
  routeStops: StopInfo[];
  stopNames: Record<string, string>;
}) {
  const routeStopMap = new Map(routeStops.map(stop => [stop.id, stop]));
  const ids = favoriteIds.includes(activeStopId)
    ? favoriteIds
    : [...favoriteIds, activeStopId];

  return ids.map(id => {
    const base = routeStopMap.get(id) ?? findStop(id) ?? { id, label: `Stop #${id.split(':')[1]}` };
    return { ...base, label: stopNames[id] ?? base.label };
  });
}

function BusTag({ bus }: { bus: BusLine }) {
  const colors = useAppColors();
  const styles = useTimetableStyles();
  const color = bus === '380' ? colors.route380 : colors.route316;
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>{bus}</Text>
    </View>
  );
}

export default function TimetableScreen() {
  const colors = useAppColors();
  const styles = useTimetableStyles();
  const insets = useSafeAreaInsets();
  const { settings, update, toggleKojoriFavorite, toggleTbilisiFavorite } = useSettings();
  const stopNames = useStopNames();
  const [filter, setFilter] = useState<Filter>('all');
  const [directionSheetOpen, setDirectionSheetOpen] = useState(false);
  const direction = settings.sharedDirection;

  const favoriteIds = direction === 'toKojori' ? settings.tbilisiFavorites : settings.kojoriFavorites;
  const stopId = direction === 'toKojori' ? settings.activeTbilisiStopId : settings.activeKojoriStopId;
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
      }),
    [favoriteIds, routeStops, stopId, stopNames],
  );
  const locationSuggestion = useMemo(
    () =>
      closestStopStatus === 'available' && closestStop && closestStopDistance != null
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
    if (direction === 'toKojori') {
      update({ activeTbilisiStopId: id });
    } else {
      update({ activeKojoriStopId: id });
    }
  }

  const { data: s380, isLoading: l380 } = useSchedule(
    ROUTES['380'].id,
    direction === 'toKojori' ? ROUTES['380'].toKojori : ROUTES['380'].toTbilisi,
  );
  const { data: s316, isLoading: l316 } = useSchedule(
    ROUTES['316'].id,
    direction === 'toKojori' ? ROUTES['316'].toKojori : ROUTES['316'].toTbilisi,
  );

  const isLoading = l380 || l316;
  const accentColor = direction === 'toKojori' ? colors.route380 : colors.route316;

  const sections = useMemo<TimetableSection[]>(() => {
    const buses: BusLine[] = filter === 'all' ? ['380', '316'] : [filter];
    const entries: TimetableEntry[] = [];

    const schedules: Record<BusLine, typeof s380> = { '380': s380, '316': s316 };

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

    return groupByPeriod(entries.sort((a, b) => a.minsFromMidnight - b.minsFromMidnight));
  }, [s380, s316, stopId, filter]);

  const totalCount = sections.reduce((n, s) => n + s.data.length, 0);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <DirectionPill
          accentColor={accentColor}
          onPress={() => setDirectionSheetOpen(true)}
        />
        <TtcStatusHeaderBadge />
        <View style={styles.headerRight}>
          {isLoading ? (
            <ActivityIndicator color={colors.textDim} size="small" />
          ) : (
            <Text style={styles.headerCount}>{totalCount} departures</Text>
          )}
        </View>
      </View>

      <DirectionPickerSheet
        visible={directionSheetOpen}
        onClose={() => setDirectionSheetOpen(false)}
      />

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
            <View style={styles.stopSelectorWrap}>
              <StopSelector
                stops={stops}
                activeStopId={stopId}
                accentColor={accentColor}
                onSelectStop={handleSelectStop}
                locationSuggestion={locationSuggestion}
                addStopModal={{
                  title: direction === 'toKojori' ? 'Tbilisi Departure Stops' : 'Kojori Stops',
                  direction,
                  favoriteIds,
                  onToggle: direction === 'toKojori' ? toggleTbilisiFavorite : toggleKojoriFavorite,
                }}
                label="TIMETABLE STOP"
              />
            </View>

            <View style={styles.filterRow}>
              {(['all', '380', '316'] as Filter[]).map(f => {
                const isActive = filter === f;
                const chipColor = f === '380' ? colors.route380 : f === '316' ? colors.route316 : accentColor;
                return (
                  <Pressable
                    key={f}
                    style={[styles.filterChip, isActive && { borderColor: chipColor, backgroundColor: alpha(chipColor, '14') }]}
                    onPress={() => setFilter(f)}>
                    <Text style={[styles.filterChipText, isActive && { color: chipColor, fontWeight: '600' }]}>
                      {f === 'all' ? 'All buses' : f}
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
              <Text style={styles.emptyText}>No timetable entries for this filter.</Text>
            </View>
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{section.title.toUpperCase()}</Text>
            <View style={styles.sectionHeaderLine} />
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => (
          <View style={[styles.timeRow, index < section.data.length - 1 && styles.timeRowDivider]}>
            <BusTag bus={item.bus} />
            <Text style={[styles.timeText, { fontFamily: MONO }]}>{item.time}</Text>
          </View>
        )}
      />
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerRight: { minWidth: 72, alignItems: 'flex-end' },
  headerCount: { color: C.textDim, fontSize: 13, fontWeight: '500' },

  stopSelectorWrap: { paddingTop: 6, paddingBottom: 10 },

  filterRow: { flexDirection: 'row', gap: 8, paddingBottom: 12 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterChipText: { color: C.textDim, fontSize: 13, fontWeight: '500' },

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

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: C.textDim, fontSize: 14 },

  listContent: { paddingHorizontal: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  sectionHeaderText: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 },
  sectionHeaderLine: { flex: 1, height: 1, backgroundColor: C.border },
  sectionCount: { color: C.textFaint, fontSize: 11, fontWeight: '600' },

  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  timeRowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  timeText: { color: C.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.3 },

  busTag: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 46,
    alignItems: 'center',
  },
  busTagText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  });
}

function useTimetableStyles() {
  const colors = useAppColors();
  return useMemo(() => createStyles(colors), [colors]);
}
