import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionToggle } from '@/components/direction-toggle';
import { StopSelector } from '@/components/stop-selector';
import { useTabNav } from '@/components/app-tabs';
import { TtcStatusHeaderBadge } from '@/components/ttc-status-banner';
import { BottomTabInset, alpha } from '@/constants/theme';
import { useArrivals } from '@/hooks/use-arrivals';
import { useAppColors } from '@/hooks/use-app-colors';
import { useLocation } from '@/hooks/use-location';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import {
  BusLine,
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
  amber: '#F5A20A',
  teal: '#10B8A3',
  live: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
} as const;

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
type SharedMode = 'kojori' | 'tbilisi';

function modeToDirection(mode: SharedMode) {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

function directionToMode(direction: 'toKojori' | 'toTbilisi'): SharedMode {
  return direction === 'toKojori' ? 'kojori' : 'tbilisi';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatHeaderTime(date = new Date()) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

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
      textColor: C.warning,
      backgroundColor: C.warning + '14',
      borderColor: C.warning + '38',
    };
  }

  return {
    label: 'LIVE on time',
    textColor: C.live,
    backgroundColor: C.live + '14',
    borderColor: C.live + '38',
  };
}

function routeColor(bus: BusLine, colors: ReturnType<typeof useAppColors>) {
  return bus === '380' ? colors.route380 : colors.route316;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
function BusTag({ bus }: { bus: BusLine }) {
  const colors = useAppColors();
  const color = routeColor(bus, colors);
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>{bus}</Text>
    </View>
  );
}

function LiveDot({ color = C.live }: { color?: string }) {
  return <View style={[styles.liveDot, { backgroundColor: color }]} />;
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

function LocationAssistCard({
  title,
  message,
  actionLabel,
  onPress,
  disabled = false,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.locationCard}>
      <View style={styles.locationCardCopy}>
        <Text style={styles.locationCardTitle}>{title}</Text>
        <Text style={styles.locationCardText}>{message}</Text>
      </View>
      {actionLabel && onPress ? (
        <Pressable
          style={[styles.locationCardButton, disabled && styles.locationCardButtonDisabled]}
          onPress={onPress}
          disabled={disabled}>
          <Text style={styles.locationCardButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
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
          <LiveDot color={realtimeStatus.textColor} />
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
  const colors = useAppColors();
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
    <View style={[styles.nextCard, { borderColor: alpha(accentColor, '30') }]}>
      <View style={[styles.nextAccentBar, { backgroundColor: accentColor }]} />
      <View style={styles.nextContent}>
        <View style={styles.nextHeaderRow}>
          <View style={styles.nextHeaderLeft}>
            {(() => {
              const busColor = routeColor(dep.bus, colors);
              return (
            <View
              style={[
                styles.nextRouteBadge,
                { backgroundColor: alpha(busColor, '18'), borderColor: alpha(busColor, '55') },
              ]}>
              <Text style={[styles.nextRouteBadgeText, { color: busColor, fontFamily: MONO }]}>
                {dep.bus}
              </Text>
            </View>
              );
            })()}
            <Text style={styles.nextEyebrow}>NEXT DEPARTURE</Text>
          </View>

          {realtimeStatus ? (
            <View
              style={[
                styles.liveBadge,
                styles.nextStatusBadge,
                {
                  backgroundColor: realtimeStatus.backgroundColor,
                  borderColor: realtimeStatus.borderColor,
                },
              ]}>
              <LiveDot color={realtimeStatus.textColor} />
              <Text style={[styles.liveBadgeText, { color: realtimeStatus.textColor }]}>
                {realtimeStatus.label}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.nextBodyRow}>
          <View style={styles.nextMain}>
            <Text
              style={[styles.nextTime, { fontFamily: MONO }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}>
              {dep.time}
            </Text>
          </View>

          {(() => {
            const busColor = routeColor(dep.bus, colors);
            return (
          <View
            style={[
              styles.nextCountdownBadge,
              { backgroundColor: alpha(busColor, '16'), borderColor: alpha(busColor, '45') },
            ]}>
            <Text style={styles.nextCountdownLabel}>ARRIVES</Text>
            <Text style={[styles.nextCountdownValue, { color: busColor, fontFamily: MONO }]}>
              {minsLabel}
            </Text>
          </View>
            );
          })()}
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
  onAddStop,
  bottomInset,
  isRefreshing,
  onRefresh,
  now,
}: {
  favoriteIds: string[];
  activeStopId: string;
  onSelectStop: (id: string) => void;
  onAddStop: () => void;
  bottomInset: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  now: Date;
}) {
  const colors = useAppColors();
  const stopNames = useStopNames();
  const favoriteStops = favoriteIds.map(id => {
    const base = findStop(id) ?? { id, label: `Stop #${id.split(':')[1]}` };
    return { ...base, label: stopNames[id] ?? base.label };
  });

  const { data: s380, isLoading: l380, isError: e380 } = useSchedule(ROUTES['380'].id, ROUTES['380'].toKojori);
  const { data: s316, isLoading: l316, isError: e316 } = useSchedule(ROUTES['316'].id, ROUTES['316'].toKojori);
  const { arrivals, dataUpdatedAt } = useArrivals(activeStopId, 'toKojori');

  const rawDepartures = useMemo(
    () => computeUpcomingDepartures(s380, s316, activeStopId, undefined, now),
    [s380, s316, activeStopId, now],
  );

  const departures = useMemo(
    () => mergeArrivalsIntoSchedule(rawDepartures, arrivals, now, dataUpdatedAt),
    [rawDepartures, arrivals, now, dataUpdatedAt],
  );

  const isLoading = l380 || l316;
  const isError = (e380 || e316) && !s380 && !s316;
  const next = departures[0];
  const upcoming = departures.slice(1);

  return (
    <View style={styles.modeContainer}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[styles.pageScrollContent, { paddingBottom: bottomInset + BottomTabInset + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={C.text}
            colors={[C.text]}
            progressBackgroundColor={C.surfaceHigh}
          />
        }>
        <View style={styles.fixedSection}>
          <StopSelector
            stops={favoriteStops}
            activeStopId={activeStopId}
            accentColor={colors.route380}
            onSelectStop={onSelectStop}
            onAddStop={onAddStop}
          />

          {isError && <ErrorBanner message="Could not load schedule. Showing cached data." />}

          <SectionDivider label="NEXT" style={styles.nextDivider} />
          <NextCard dep={next} accentColor={colors.route380} isLoading={isLoading} />
        </View>

        <SectionDivider label="UPCOMING" style={styles.dividerPadded} />

        {upcoming.length > 0 ? (
          <View style={[styles.list, styles.listSection]}>
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
  onAddStop,
  bottomInset,
  isRefreshing,
  onRefresh,
  now,
}: {
  favoriteIds: string[];
  activeStopId: string;
  onSelectStop: (id: string) => void;
  onAddStop: () => void;
  bottomInset: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  now: Date;
}) {
  const colors = useAppColors();
  const stopNames = useStopNames();
  const favoriteStops = favoriteIds.map(id => {
    const base = findStop(id) ?? { id, label: `Stop #${id.split(':')[1]}` };
    return { ...base, label: stopNames[id] ?? base.label };
  });

  const { data: s380, isLoading: l380, isError: e380 } = useSchedule(ROUTES['380'].id, ROUTES['380'].toTbilisi);
  const { data: s316, isLoading: l316, isError: e316 } = useSchedule(ROUTES['316'].id, ROUTES['316'].toTbilisi);
  const { arrivals, dataUpdatedAt, isError: eArrival } = useArrivals(activeStopId, 'toTbilisi');

  const rawDepartures = useMemo(
    () => computeUpcomingDepartures(s380, s316, activeStopId, undefined, now),
    [s380, s316, activeStopId, now],
  );

  const departures = useMemo(
    () => mergeArrivalsIntoSchedule(rawDepartures, arrivals, now, dataUpdatedAt),
    [rawDepartures, arrivals, now, dataUpdatedAt],
  );

  const isLoading = l380 || l316;
  const isError = (e380 || e316 || eArrival) && !s380 && !s316;
  const next = departures[0];
  const upcoming = departures.slice(1);

  return (
    <View style={styles.modeContainer}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={[styles.pageScrollContent, { paddingBottom: bottomInset + BottomTabInset + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={C.text}
            colors={[C.text]}
            progressBackgroundColor={C.surfaceHigh}
          />
        }>
        <View style={styles.fixedSection}>
          <StopSelector
            stops={favoriteStops}
            activeStopId={activeStopId}
            accentColor={colors.route316}
            onSelectStop={onSelectStop}
            onAddStop={onAddStop}
          />

          {isError && <ErrorBanner message="Could not load schedule. Showing cached data." />}

          <SectionDivider label="NEXT" style={styles.nextDivider} />
          <NextCard dep={next} accentColor={colors.route316} isLoading={isLoading} />
        </View>

        <SectionDivider label="UPCOMING" style={styles.dividerPadded} />

        {upcoming.length > 0 ? (
          <View style={[styles.list, styles.listSection]}>
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
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { settings, update, setSharedDirection, hasManualDirectionOverride, isLoaded } = useSettings();
  const {
    detectedMode,
    permission,
    canAskAgain,
    isLocating,
    locationError,
    requestLocationAccess,
    refreshLocation,
  } = useLocation();
  const { widgetMode, widgetStopId } = useLocalSearchParams<{
    widgetMode?: string;
    widgetStopId?: string;
  }>();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const handledWidgetLink = useRef<string | null>(null);
  const mode = directionToMode(settings.sharedDirection);

  useEffect(() => {
    if (!isLoaded || hasManualDirectionOverride || !detectedMode) return;

    setSharedDirection(modeToDirection(detectedMode), false);
  }, [detectedMode, hasManualDirectionOverride, isLoaded, setSharedDirection]);

  useEffect(() => {
    if (widgetMode !== 'kojori' && widgetMode !== 'tbilisi') return;

    const nextKey = `${widgetMode}:${widgetStopId ?? ''}`;
    if (handledWidgetLink.current === nextKey) return;
    handledWidgetLink.current = nextKey;

    setSharedDirection(modeToDirection(widgetMode));

    if (!widgetStopId) return;

    if (widgetMode === 'kojori') {
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
    setSharedDirection,
    settings.kojoriFavorites,
    settings.tbilisiFavorites,
    update,
    widgetMode,
    widgetStopId,
  ]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => {
        setNow(new Date());
      }, 60_000);
    }, 60_000 - (Date.now() % 60_000));

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const navigateToTab = useTabNav();
  const accentColor = mode === 'kojori' ? colors.route380 : colors.route316;
  const activeDirection = settings.sharedDirection;
  const activeStopId = mode === 'kojori' ? settings.activeTbilisiStopId : settings.activeKojoriStopId;
  const showLocationCard =
    (permission !== 'granted' && permission !== 'unknown') ||
    hasManualDirectionOverride ||
    isLocating ||
    Boolean(locationError);

  function handleModeToggle(next: SharedMode) {
    setSharedDirection(modeToDirection(next));
  }

  async function handleEnableLocation() {
    setSharedDirection(settings.sharedDirection, false);

    if (permission === 'granted') {
      await refreshLocation();
      return;
    }

    await requestLocationAccess();
  }

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setNow(new Date());

    try {
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ['arrivals', activeStopId],
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: ['schedule', ROUTES['380'].id, ROUTES['380'][activeDirection]],
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: ['schedule', ROUTES['316'].id, ROUTES['316'][activeDirection]],
          exact: true,
        }),
      ]);
    } finally {
      setNow(new Date());
      setIsRefreshing(false);
    }
  }

  const locationCard = useMemo(() => {
    if (!showLocationCard) return null;

    if (isLocating) {
      return {
        title: 'Checking your location',
        message: 'Finding whether you are closer to Kojori or Tbilisi for automatic direction.',
      };
    }

    if (hasManualDirectionOverride) {
      return {
        title: 'Manual direction is active',
        message: 'You switched direction manually. Re-enable location if you want the app to suggest the right side automatically again.',
        actionLabel: permission === 'granted' ? 'Use my location' : 'Enable location',
        onPress: handleEnableLocation,
      };
    }

    if (permission === 'denied' && !canAskAgain) {
      return {
        title: 'Location permission is blocked',
        message: 'Open system settings to turn location back on for automatic direction suggestions. Manual switching still works.',
        actionLabel: 'Open settings',
        onPress: () => {
          void Linking.openSettings();
        },
      };
    }

    if (permission === 'denied') {
      return {
        title: 'Location is off',
        message: 'Allow location if you want the app to switch between Kojori and Tbilisi automatically. You can still control it manually.',
        actionLabel: 'Allow location',
        onPress: handleEnableLocation,
      };
    }

    if (locationError) {
      return {
        title: 'Could not read your location',
        message: 'Automatic direction is available, but the last location check failed. Try again or keep using the manual toggle.',
        actionLabel: 'Try again',
        onPress: handleEnableLocation,
      };
    }

    return {
      title: 'Use location for smart direction',
      message: 'Allow location to suggest whether you are heading to Kojori or Tbilisi automatically. You can keep using the toggle whenever you want.',
      actionLabel: 'Enable location',
      onPress: handleEnableLocation,
    };
  }, [
    canAskAgain,
    handleEnableLocation,
    hasManualDirectionOverride,
    isLocating,
    locationError,
    permission,
    showLocationCard,
  ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.locationDot, { backgroundColor: accentColor }]} />
          <Text style={styles.headerCity}>{mode === 'kojori' ? 'Tbilisi' : 'Kojori'}</Text>
        </View>
        <TtcStatusHeaderBadge />
        <View style={styles.headerRight}>
          <Text style={[styles.headerClock, { fontFamily: MONO }]}>{formatHeaderTime(now)}</Text>
          <Pressable
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={isRefreshing}>
            {isRefreshing ? (
              <ActivityIndicator size="small" color={C.textDim} />
            ) : (
              <Text style={styles.refreshGlyph}>↻</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Mode toggle */}
      <View style={styles.toggleWrap}>
        <DirectionToggle
          value={mode}
          onChange={handleModeToggle}
          options={[
            { value: 'kojori', label: '→ Kojori', accentColor: colors.route380 },
            { value: 'tbilisi', label: '→ Tbilisi', accentColor: colors.route316 },
          ]}
        />
      </View>

      {locationCard ? (
        <View style={styles.locationCardWrap}>
          <LocationAssistCard
            title={locationCard.title}
            message={locationCard.message}
            actionLabel={locationCard.actionLabel}
            onPress={locationCard.onPress}
            disabled={isLocating}
          />
        </View>
      ) : null}

      {mode === 'kojori' ? (
        <ToKojoriView
          favoriteIds={settings.tbilisiFavorites}
          activeStopId={settings.activeTbilisiStopId}
          onSelectStop={id => update({ activeTbilisiStopId: id })}
          onAddStop={() => navigateToTab?.('settings')}
          bottomInset={insets.bottom}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          now={now}
        />
      ) : (
        <ToTbilisiView
          favoriteIds={settings.kojoriFavorites}
          activeStopId={settings.activeKojoriStopId}
          onSelectStop={id => update({ activeKojoriStopId: id })}
          onAddStop={() => navigateToTab?.('settings')}
          bottomInset={insets.bottom}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          now={now}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationDot: { width: 8, height: 8, borderRadius: 4 },
  headerCity: { color: C.text, fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  headerClock: { color: C.textDim, fontSize: 15, letterSpacing: 0.4 },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshGlyph: { fontSize: 16, fontWeight: '700', color: C.textDim },

  toggleWrap: { paddingHorizontal: 20, paddingBottom: 4 },
  locationCardWrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  locationCard: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    gap: 12,
  },
  locationCardCopy: { gap: 5 },
  locationCardTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  locationCardText: { color: C.textDim, fontSize: 12, lineHeight: 17 },
  locationCardButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.surfaceHigh,
  },
  locationCardButtonDisabled: { opacity: 0.6 },
  locationCardButtonText: { color: C.text, fontSize: 12, fontWeight: '700' },

  modeContainer: { flex: 1 },
  pageScroll: { flex: 1 },
  pageScrollContent: { flexGrow: 1 },
  fixedSection: { paddingHorizontal: 20, paddingTop: 8 },
  dividerPadded: { paddingHorizontal: 20 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  nextDivider: { paddingVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerLabel: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 },

  nextCard: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 96,
  },
  centered: { justifyContent: 'center' },
  nextAccentBar: { width: 4, alignSelf: 'stretch' },
  nextContent: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  nextHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  nextHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 },
  nextEyebrow: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  nextBodyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  nextMain: { flex: 1, minWidth: 0, justifyContent: 'flex-end' },
  nextTime: { color: C.text, fontSize: 46, fontWeight: '700', letterSpacing: -1.6, lineHeight: 48, flexShrink: 1 },
  nextRouteBadge: {
    minWidth: 54,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  nextRouteBadgeText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
  nextStatusBadge: { flexShrink: 1 },
  nextCountdownBadge: {
    minWidth: 84,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  nextCountdownLabel: { color: C.textFaint, fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  nextCountdownValue: { fontSize: 16, fontWeight: '800', marginTop: 3 },
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

  list: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  listSection: { marginHorizontal: 20 },
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
