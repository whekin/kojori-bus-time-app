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

import { BottomTabInset } from '@/constants/theme';
import { useSchedule } from '@/hooks/use-schedule';
import {
  ALL_KOJORI_STOPS,
  ALL_TBILISI_STOPS,
  BusLine,
  BUS_COLORS,
  extractStopTimes,
  getTodayPeriod,
  parseTimeToMins,
  ROUTES,
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
  amber: BUS_COLORS['380'],
  teal: BUS_COLORS['316'],
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
  const color = BUS_COLORS[bus];
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>{bus}</Text>
    </View>
  );
}

export default function TimetableScreen() {
  const insets = useSafeAreaInsets();
  const [direction, setDirection] = useState<Direction>('toKojori');
  const [filter, setFilter] = useState<Filter>('all');
  const [stopIndex, setStopIndex] = useState(0);

  const stops = direction === 'toKojori' ? ALL_TBILISI_STOPS : ALL_KOJORI_STOPS;
  const stopId = stops[stopIndex]?.id ?? stops[0].id;

  const { data: s380, isLoading: l380 } = useSchedule(
    ROUTES['380'].id,
    direction === 'toKojori' ? ROUTES['380'].toKojori : ROUTES['380'].toTbilisi,
  );
  const { data: s316, isLoading: l316 } = useSchedule(
    ROUTES['316'].id,
    direction === 'toKojori' ? ROUTES['316'].toKojori : ROUTES['316'].toTbilisi,
  );

  const isLoading = l380 || l316;
  const accentColor = direction === 'toKojori' ? C.amber : C.teal;

  const sections = useMemo<TimetableSection[]>(() => {
    const buses: BusLine[] = filter === 'all' ? ['380', '316'] : [filter];
    const entries: TimetableEntry[] = [];

    const schedules: Record<BusLine, typeof s380> = { '380': s380, '316': s316 };

    for (const bus of buses) {
      const schedule = schedules[bus];
      if (!schedule) continue;
      const period = getTodayPeriod(schedule);
      if (!period) continue;
      const times = extractStopTimes(period, stopId);

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
        {isLoading ? (
          <ActivityIndicator color={C.textDim} size="small" />
        ) : (
          <Text style={styles.headerCount}>{totalCount} departures</Text>
        )}
      </View>

      {/* Direction toggle */}
      <View style={styles.toggleWrap}>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleSeg, direction === 'toKojori' && styles.toggleSegOn]}
            onPress={() => { setDirection('toKojori'); setStopIndex(0); }}>
            <Text style={[styles.toggleText, direction === 'toKojori' && { color: C.amber }]}>
              → Kojori
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleSeg, direction === 'toTbilisi' && styles.toggleSegOn]}
            onPress={() => { setDirection('toTbilisi'); setStopIndex(0); }}>
            <Text style={[styles.toggleText, direction === 'toTbilisi' && { color: C.teal }]}>
              → Tbilisi
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Stop selector */}
      <View style={styles.chipRow}>
        {stops.map((s, i) => (
          <Pressable
            key={s.id}
            style={[styles.chip, i === stopIndex && { borderColor: accentColor, backgroundColor: accentColor + '14' }]}
            onPress={() => setStopIndex(i)}>
            <Text style={[styles.chipText, i === stopIndex && { color: accentColor, fontWeight: '600' }]}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Bus filter */}
      <View style={styles.filterRow}>
        {(['all', '380', '316'] as Filter[]).map(f => {
          const isActive = filter === f;
          const chipColor = f === '380' ? C.amber : f === '316' ? C.teal : accentColor;
          return (
            <Pressable
              key={f}
              style={[styles.filterChip, isActive && { borderColor: chipColor, backgroundColor: chipColor + '14' }]}
              onPress={() => setFilter(f)}>
              <Text style={[styles.filterChipText, isActive && { color: chipColor, fontWeight: '600' }]}>
                {f === 'all' ? 'All buses' : f}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Schedule accuracy note */}
      <View style={styles.noteBanner}>
        <Text style={styles.noteText}>
          {direction === 'toKojori'
            ? 'Times from the starting stop. Intermediate stops arrive ~5–10 min earlier.'
            : 'Times from selected Kojori stop.'}
        </Text>
      </View>

      {/* Timetable */}
      {isLoading && sections.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={accentColor} size="large" />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => `${item.bus}-${item.time}-${i}`}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + BottomTabInset + 24 },
          ]}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headerCount: { color: C.textDim, fontSize: 13, fontWeight: '500' },

  toggleWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  toggle: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleSeg: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 9 },
  toggleSegOn: { backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.borderStrong },
  toggleText: { color: C.textDim, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipText: { color: C.textDim, fontSize: 13, fontWeight: '500' },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
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
    marginHorizontal: 20,
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
