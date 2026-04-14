import React, { useEffect, useMemo, useState } from 'react';
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

import { DirectionToggle } from '@/components/direction-toggle';
import { StopSelector } from '@/components/stop-selector';
import { TtcStatusHeaderBadge } from '@/components/ttc-status-banner';
import { BottomTabInset, alpha } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import {
  BusLine,
  extractStopTimes,
  findStop,
  getTodayPeriod,
  parseTimeToMins,
  ROUTES,
  SCHEDULE_STOP_PROXY,
} from '@/services/ttc';

const C = {
  bg: '#09090B',
  surface: '#111316',
  surfaceHigh: '#18191E',
  border: '#1E2128',
  borderStrong: '#2A2F3A',
  text: '#EDEAE4',
  textDim: '#565C6B',
  textFaint: '#2C3040',
  amber: '#F5A20A',
  teal: '#10B8A3',
} as const;

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

type Direction = 'toKojori' | 'toTbilisi';
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

function BusTag({ bus }: { bus: BusLine }) {
  const colors = useAppColors();
  const color = bus === '380' ? colors.route380 : colors.route316;
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>{bus}</Text>
    </View>
  );
}

export default function TimetableScreen() {
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const { settings, setSharedDirection, update } = useSettings();
  const [filter, setFilter] = useState<Filter>('all');
  const direction = settings.sharedDirection;

  const favoriteIds = direction === 'toKojori' ? settings.tbilisiFavorites : settings.kojoriFavorites;
  const stops = favoriteIds.map(id => findStop(id) ?? { id, label: `Stop #${id.split(':')[1]}` });
  const stopId = direction === 'toKojori' ? settings.activeTbilisiStopId : settings.activeKojoriStopId;

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
        <Text style={styles.headerTitle}>Timetable</Text>
        <TtcStatusHeaderBadge />
        <View style={styles.headerRight}>
          {isLoading ? (
            <ActivityIndicator color={C.textDim} size="small" />
          ) : (
            <Text style={styles.headerCount}>{totalCount} departures</Text>
          )}
        </View>
      </View>

      <View style={styles.toggleWrap}>
        <DirectionToggle
          value={direction}
          onChange={setSharedDirection}
          options={[
            { value: 'toKojori', label: '→ Kojori', accentColor: colors.route380 },
            { value: 'toTbilisi', label: '→ Tbilisi', accentColor: colors.route316 },
          ]}
        />
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
            <View style={styles.stopSelectorWrap}>
              <StopSelector
                stops={stops}
                activeStopId={stopId}
                accentColor={accentColor}
                onSelectStop={handleSelectStop}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headerRight: { minWidth: 72, alignItems: 'flex-end' },
  headerCount: { color: C.textDim, fontSize: 13, fontWeight: '500' },

  toggleWrap: { paddingHorizontal: 20, paddingBottom: 12 },

  stopSelectorWrap: { paddingBottom: 10 },

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
