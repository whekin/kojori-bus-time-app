import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { useArrivals } from '@/hooks/use-arrivals';
import { useLocation } from '@/hooks/use-location';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import {
  BusLine,
  BUS_COLORS,
  computeUpcomingDepartures,
  Departure,
  findStop,
  mergeArrivalsIntoSchedule,
  ROUTES,
} from '@/services/ttc';

// ── Design tokens ─────────────────────────────────────────────────────────────
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
  live: '#22C55E',
  error: '#EF4444',
} as const;

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatMins(mins: number) {
  if (mins < 1) return 'now';
  if (mins < 60) return `+${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `+${h}h\u202F${m}m` : `+${h}h`;
}

function getRealtimeStatus(dep: Departure) {
  if (!dep.live) return null;

  const drift = dep.driftMinutes ?? 0;
  if (drift > 0) {
    return {
      label: `LIVE +${drift}m`,
      textColor: C.error,
      backgroundColor: C.error + '14',
      borderColor: C.error + '38',
    };
  }

  if (drift < 0) {
    return {
      label: `LIVE ${Math.abs(drift)}m early`,
      textColor: '#7DD3FC',
      backgroundColor: '#7DD3FC14',
      borderColor: '#7DD3FC38',
    };
  }

  return {
    label: 'LIVE on time',
    textColor: C.live,
    backgroundColor: C.live + '14',
    borderColor: C.live + '38',
  };
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
function BusTag({ bus }: { bus: BusLine }) {
  const color = BUS_COLORS[bus];
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>{bus}</Text>
    </View>
  );
}

function LiveDot() {
  return <View style={styles.liveDot} />;
}

function SectionDivider({ label, style }: { label: string; style?: ViewStyle }) {
  return (
    <View style={[styles.divider, style]}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// ── Shared departure row ───────────────────────────────────────────────────────
function DepartureRow({ dep, isLast }: { dep: Departure; isLast: boolean }) {
  const countdown = formatMins(dep.minsUntil);
  const realtimeStatus = getRealtimeStatus(dep);
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <BusTag bus={dep.bus} />
      <Text style={[styles.rowTime, { fontFamily: MONO }]}>{dep.time}</Text>
      {realtimeStatus ? (
        <View
          style={[
            styles.liveBadgeSmall,
            {
              backgroundColor: realtimeStatus.backgroundColor,
              borderColor: realtimeStatus.borderColor,
            },
          ]}>
          <LiveDot />
          <Text style={[styles.liveBadgeSmallText, { color: realtimeStatus.textColor }]}>
            {realtimeStatus.label}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.rowCountdown, { fontFamily: MONO }]}>{countdown}</Text>
    </View>
  );
}

// ── Shared "next bus" card ─────────────────────────────────────────────────────
function NextCard({
  dep,
  accentColor,
  isLoading,
}: {
  dep: Departure | undefined;
  accentColor: string;
  isLoading: boolean;
}) {
  if (isLoading && !dep) {
    return (
      <View style={[styles.nextCard, styles.centered]}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }
  if (!dep) {
    return <EmptyState message="No more departures today" />;
  }
  const minsLabel = dep.minsUntil < 1 ? 'now' : `in ${dep.minsUntil} min`;
  const realtimeStatus = getRealtimeStatus(dep);
  return (
    <View style={styles.nextCard}>
      <View style={styles.nextMain}>
        <Text
          style={[styles.nextTime, { fontFamily: MONO }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}>
          {dep.time}
        </Text>
      </View>

      <View style={styles.nextMetaColumn}>
        <View
          style={[
            styles.nextRouteBadge,
            { backgroundColor: BUS_COLORS[dep.bus] + '18', borderColor: BUS_COLORS[dep.bus] + '55' },
          ]}>
          <Text style={[styles.nextRouteBadgeText, { color: BUS_COLORS[dep.bus], fontFamily: MONO }]}>
            {dep.bus}
          </Text>
        </View>

        {realtimeStatus && (
          <View
            style={[
              styles.liveBadge,
              {
                backgroundColor: realtimeStatus.backgroundColor,
                borderColor: realtimeStatus.borderColor,
              },
            ]}>
            <LiveDot />
            <Text style={[styles.liveBadgeText, { color: realtimeStatus.textColor }]}>
              {realtimeStatus.label}
            </Text>
          </View>
        )}

        <View style={[styles.badge, { backgroundColor: BUS_COLORS[dep.bus] + '1A', borderColor: BUS_COLORS[dep.bus] + '50' }]}>
          <Text style={[styles.badgeText, { color: BUS_COLORS[dep.bus] }]}>{minsLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ── To Kojori view ────────────────────────────────────────────────────────────
function ToKojoriView({
  favoriteIds,
  activeStopId,
  onSelectStop,
  bottomInset,
}: {
  favoriteIds: string[];
  activeStopId: string;
  onSelectStop: (id: string) => void;
  bottomInset: number;
}) {
  const stopNames = useStopNames();
  const favoriteStops = favoriteIds.map(id => {
    const base = findStop(id) ?? { id, label: `Stop #${id.split(':')[1]}` };
    return { ...base, label: stopNames[id] ?? base.label };
  });

  const { data: s380, isLoading: l380, isError: e380 } = useSchedule(ROUTES['380'].id, ROUTES['380'].toKojori);
  const { data: s316, isLoading: l316, isError: e316 } = useSchedule(ROUTES['316'].id, ROUTES['316'].toKojori);
  const { arrivals } = useArrivals(activeStopId, 'toKojori');

  const rawDepartures = useMemo(
    () => computeUpcomingDepartures(s380, s316, activeStopId),
    [s380, s316, activeStopId],
  );

  const departures = useMemo(
    () => mergeArrivalsIntoSchedule(rawDepartures, arrivals),
    [rawDepartures, arrivals],
  );

  const isLoading = l380 || l316;
  const isError = (e380 || e316) && !s380 && !s316;
  const next = departures[0];
  const upcoming = departures.slice(1);

  return (
    <View style={styles.modeContainer}>
      <View style={styles.fixedSection}>
        <View style={styles.chipRow}>
          {favoriteStops.map(s => (
            <Pressable
              key={s.id}
              style={[styles.chip, s.id === activeStopId && { borderColor: C.amber, backgroundColor: C.amber + '14' }]}
              onPress={() => onSelectStop(s.id)}>
              <Text style={[styles.chipText, s.id === activeStopId && { color: C.amber, fontWeight: '600' }]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {isError && <ErrorBanner message="Could not load schedule. Showing cached data." />}

        <SectionDivider label="NEXT" />
        <NextCard dep={next} accentColor={C.amber} isLoading={isLoading} />
      </View>

      <SectionDivider label="UPCOMING" style={styles.dividerPadded} />

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={[styles.listScrollContent, { paddingBottom: bottomInset + BottomTabInset + 24 }]}
        showsVerticalScrollIndicator={false}>
        {upcoming.length > 0 ? (
          <View style={styles.list}>
            {upcoming.map((dep, i) => (
              <DepartureRow
                key={`${dep.bus}-${dep.time}`}
                dep={dep}
                isLast={i === upcoming.length - 1}
              />
            ))}
          </View>
        ) : !isLoading ? (
          <EmptyState message="No more departures today" />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── To Tbilisi view ───────────────────────────────────────────────────────────
function ToTbilisiView({
  favoriteIds,
  activeStopId,
  onSelectStop,
  bottomInset,
}: {
  favoriteIds: string[];
  activeStopId: string;
  onSelectStop: (id: string) => void;
  bottomInset: number;
}) {
  const stopNames = useStopNames();
  const favoriteStops = favoriteIds.map(id => {
    const base = findStop(id) ?? { id, label: `Stop #${id.split(':')[1]}` };
    return { ...base, label: stopNames[id] ?? base.label };
  });

  const { data: s380, isLoading: l380, isError: e380 } = useSchedule(ROUTES['380'].id, ROUTES['380'].toTbilisi);
  const { data: s316, isLoading: l316, isError: e316 } = useSchedule(ROUTES['316'].id, ROUTES['316'].toTbilisi);
  const { arrivals, isError: eArrival } = useArrivals(activeStopId, 'toTbilisi');

  const rawDepartures = useMemo(
    () => computeUpcomingDepartures(s380, s316, activeStopId),
    [s380, s316, activeStopId],
  );

  const departures = useMemo(
    () => mergeArrivalsIntoSchedule(rawDepartures, arrivals),
    [rawDepartures, arrivals],
  );

  const isLoading = l380 || l316;
  const isError = (e380 || e316 || eArrival) && !s380 && !s316;
  const next = departures[0];
  const upcoming = departures.slice(1);

  return (
    <View style={styles.modeContainer}>
      <View style={styles.fixedSection}>
        <View style={styles.chipRow}>
          {favoriteStops.map(s => (
            <Pressable
              key={s.id}
              style={[styles.chip, s.id === activeStopId && { borderColor: C.teal, backgroundColor: C.teal + '14' }]}
              onPress={() => onSelectStop(s.id)}>
              <Text style={[styles.chipText, s.id === activeStopId && { color: C.teal, fontWeight: '600' }]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {isError && <ErrorBanner message="Could not load schedule. Showing cached data." />}

        <SectionDivider label="NEXT" />
        <NextCard dep={next} accentColor={C.teal} isLoading={isLoading} />
      </View>

      <SectionDivider label="UPCOMING" style={styles.dividerPadded} />

      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={[styles.listScrollContent, { paddingBottom: bottomInset + BottomTabInset + 24 }]}
        showsVerticalScrollIndicator={false}>
        {upcoming.length > 0 ? (
          <View style={styles.list}>
            {upcoming.map((dep, i) => (
              <DepartureRow
                key={`${dep.bus}-${dep.time}`}
                dep={dep}
                isLast={i === upcoming.length - 1}
              />
            ))}
          </View>
        ) : !isLoading ? (
          <EmptyState message="No more departures today" />
        ) : null}
      </ScrollView>
    </View>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { detectedMode } = useLocation();

  const [mode, setMode] = useState<'kojori' | 'tbilisi'>('kojori');
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!manualOverride && detectedMode) setMode(detectedMode);
  }, [detectedMode, manualOverride]);

  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const accentColor = mode === 'kojori' ? C.amber : C.teal;

  function handleModeToggle(next: 'kojori' | 'tbilisi') {
    setMode(next);
    setManualOverride(true);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.locationDot, { backgroundColor: accentColor }]} />
          <Text style={styles.headerCity}>{mode === 'kojori' ? 'Tbilisi' : 'Kojori'}</Text>
        </View>
        <Text style={[styles.headerClock, { fontFamily: MONO }]}>{clock}</Text>
      </View>

      {/* Mode toggle */}
      <View style={styles.toggleWrap}>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleSeg, mode === 'kojori' && styles.toggleSegOn]}
            onPress={() => handleModeToggle('kojori')}>
            <Text style={[styles.toggleText, mode === 'kojori' && { color: C.amber }]}>→ Kojori</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleSeg, mode === 'tbilisi' && styles.toggleSegOn]}
            onPress={() => handleModeToggle('tbilisi')}>
            <Text style={[styles.toggleText, mode === 'tbilisi' && { color: C.teal }]}>→ Tbilisi</Text>
          </Pressable>
        </View>
      </View>

      {mode === 'kojori' ? (
        <ToKojoriView
          favoriteIds={settings.tbilisiFavorites}
          activeStopId={settings.activeTbilisiStopId}
          onSelectStop={id => update({ activeTbilisiStopId: id })}
          bottomInset={insets.bottom}
        />
      ) : (
        <ToTbilisiView
          favoriteIds={settings.kojoriFavorites}
          activeStopId={settings.activeKojoriStopId}
          onSelectStop={id => update({ activeKojoriStopId: id })}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationDot: { width: 8, height: 8, borderRadius: 4 },
  headerCity: { color: C.text, fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  headerClock: { color: C.textDim, fontSize: 15 },

  toggleWrap: { paddingHorizontal: 20, paddingBottom: 4 },
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

  modeContainer: { flex: 1 },
  fixedSection: { paddingHorizontal: 20, paddingTop: 8 },
  dividerPadded: { paddingHorizontal: 20 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 14 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipText: { color: C.textDim, fontSize: 13, fontWeight: '500' },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerLabel: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 },

  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 88,
  },
  centered: { justifyContent: 'center' },
  nextMain: { flex: 1, minWidth: 0, justifyContent: 'center' },
  nextTime: { color: C.text, fontSize: 48, fontWeight: '700', letterSpacing: -1.5, lineHeight: 52, flexShrink: 1 },
  nextMetaColumn: { alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  nextRouteBadge: {
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  nextRouteBadgeText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.8 },
  badge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },

  busTag: {
    borderWidth: 1.5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 46,
    alignItems: 'center',
  },
  busTagText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },

  listScroll: { flex: 1 },
  listScrollContent: { paddingHorizontal: 20 },

  list: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  rowTime: { flex: 1, color: C.text, fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  rowCountdown: { color: C.textDim, fontSize: 13, fontWeight: '500' },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  liveBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  liveBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveBadgeSmallText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.live },

  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { color: C.textDim, fontSize: 14 },
  errorBanner: {
    backgroundColor: C.error + '18',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.error + '40',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
  },
  errorText: { color: C.error, fontSize: 12 },
});
