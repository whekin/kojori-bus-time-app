import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionToggle } from '@/components/direction-toggle';
import { StopSelector } from '@/components/stop-selector';
import { alpha, BottomTabInset, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useArrivals } from '@/hooks/use-arrivals';
import { useLocation } from '@/hooks/use-location';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import { useTtcHealth } from '@/hooks/use-ttc-health';
import {
    BusLine,
    computeUpcomingDepartures,
    Departure,
    findStop,
    injectCancelledDemo,
    mergeArrivalsIntoSchedule,
    ROUTES,
} from '@/services/ttc';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
type SharedMode = 'kojori' | 'tbilisi';
const CONTENT_SIDE = 20;
const SECTION_SPACE = 12;

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

function getRealtimeStatus(dep: Departure, colors: AppColors) {
  if (!dep.live) return null;

  const drift = dep.driftMinutes ?? 0;
  if (drift > 0) {
    return {
      label: `LIVE +${drift}m`,
      textColor: colors.error,
      backgroundColor: alpha(colors.error, '14'),
      borderColor: alpha(colors.error, '38'),
    };
  }

  if (drift < 0) {
    return {
      label: `LIVE ${Math.abs(drift)}m early`,
      textColor: colors.warning,
      backgroundColor: alpha(colors.warning, '14'),
      borderColor: alpha(colors.warning, '38'),
    };
  }

  return {
    label: 'LIVE on time',
    textColor: colors.live,
    backgroundColor: alpha(colors.live, '14'),
    borderColor: alpha(colors.live, '38'),
  };
}

function routeColor(bus: BusLine, colors: ReturnType<typeof useAppColors>) {
  return bus === '380' ? colors.route380 : colors.route316;
}

function getDisplayedDepartures(departures: Departure[]) {
  const next = departures.find(dep => dep.status !== 'cancelled');
  const hiddenKeys = new Set<string>();

  if (next) hiddenKeys.add(`${next.key}:${next.status}`);
  if (next?.replacedCancelledDeparture) hiddenKeys.add(`${next.replacedCancelledDeparture.key}:cancelled`);

  return {
    next,
    upcoming: departures.filter(dep => !hiddenKeys.has(`${dep.key}:${dep.status}`)),
  };
}

// ── Atoms ─────────────────────────────────────────────────────────────────────
function BusTag({ bus }: { bus: BusLine }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const color = routeColor(bus, colors);
  return (
    <View style={[styles.busTag, { borderColor: color }]}>
      <Text style={[styles.busTagText, { color, fontFamily: MONO }]}>{bus}</Text>
    </View>
  );
}

function LiveDot({ color }: { color?: string }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  return <View style={[styles.liveDot, { backgroundColor: color ?? colors.live }]} />;
}

function SectionDivider({ label, style }: { label: string; style?: ViewStyle }) {
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
          backgroundColor: alpha(colors.error, '18'),
          borderColor: alpha(colors.error, '40'),
        },
      ]}>
      <Text style={[styles.errorText, { color: colors.error }]}>{message}</Text>
    </View>
  );
}

type IslandStatusItem = {
  key: string;
  dismissToken: string;
  label: string;
  detail: string;
  meta?: string;
  accentColor: string;
  textColor: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

function StatusIsland({
  items,
}: {
  items: IslandStatusItem[];
}) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [dismissedTokens, setDismissedTokens] = useState<Record<string, string>>({});

  const visibleItems = items.filter(item => dismissedTokens[item.key] !== item.dismissToken);

  useEffect(() => {
    if (expandedKey && !visibleItems.some(item => item.key === expandedKey)) {
      setExpandedKey(null);
    }
  }, [expandedKey, visibleItems]);

  if (visibleItems.length === 0) return null;

  const expandedItem = visibleItems.find(item => item.key === expandedKey) ?? null;

  function handleDismiss(item: IslandStatusItem) {
    item.onDismiss?.();
    setDismissedTokens(current => ({ ...current, [item.key]: item.dismissToken }));
    setExpandedKey(current => current === item.key ? null : current);
  }

  return (
    <View style={styles.statusIslandWrap}>
      <View style={styles.statusIslandRow}>
        {visibleItems.map(item => {
          const isExpanded = expandedKey === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setExpandedKey(current => current === item.key ? null : item.key)}
              style={[
                styles.statusPill,
                {
                  backgroundColor: alpha(item.accentColor, isExpanded ? '20' : '14'),
                  borderColor: alpha(item.accentColor, isExpanded ? '66' : '42'),
                },
              ]}>
              <View style={[styles.statusPillDot, { backgroundColor: item.accentColor }]} />
              <Text style={[styles.statusPillLabel, { color: item.textColor }]} numberOfLines={1}>
                {item.label}
              </Text>
              <MaterialCommunityIcons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={item.textColor}
              />
            </Pressable>
          );
        })}
      </View>

      {expandedItem ? (
        <View
          style={[
            styles.statusPanel,
            {
              borderColor: alpha(expandedItem.accentColor, '42'),
              backgroundColor: colors.surface,
            },
          ]}>
          <View style={styles.statusPanelHeader}>
            <View style={styles.statusPanelHeaderMain}>
              <View style={[styles.statusPillDot, { backgroundColor: expandedItem.accentColor }]} />
              <Text style={[styles.statusPanelTitle, { color: expandedItem.textColor }]}>
                {expandedItem.label}
              </Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => setExpandedKey(null)}
              style={styles.statusPanelClose}>
              <MaterialCommunityIcons name="close" size={15} color={expandedItem.textColor} />
            </Pressable>
          </View>
          <Text style={styles.statusPanelText}>{expandedItem.detail}</Text>
          <View style={styles.statusPanelFooter}>
            <View style={styles.statusPanelFooterLeft}>
              {expandedItem.meta ? (
                <Text style={styles.statusPanelMeta}>{expandedItem.meta}</Text>
              ) : null}
              <Pressable
                style={[
                  styles.statusPanelButton,
                  styles.statusPanelDismissButton,
                  { borderColor: alpha(expandedItem.accentColor, '36') },
                ]}
                onPress={() => handleDismiss(expandedItem)}>
                <Text style={[styles.statusPanelButtonText, { color: colors.textDim }]}>
                  Dismiss
                </Text>
              </Pressable>
            </View>
            {expandedItem.actionLabel && expandedItem.onAction ? (
              <Pressable
                style={[
                  styles.statusPanelButton,
                  { borderColor: alpha(expandedItem.accentColor, '55') },
                ]}
                onPress={expandedItem.onAction}>
                <Text style={[styles.statusPanelButtonText, { color: expandedItem.textColor }]}>
                  {expandedItem.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Shared departure row ───────────────────────────────────────────────────────
function DepartureRow({ dep, isLast }: { dep: Departure; isLast: boolean }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  const countdown = formatMins(dep.minsUntil);
  const realtimeStatus = getRealtimeStatus(dep, colors);
  const isCancelled = dep.status === 'cancelled';
  return (
    <View style={[styles.row, isCancelled && styles.rowCancelled, !isLast && styles.rowDivider]}>
      <BusTag bus={dep.bus} />
      <Text style={[styles.rowTime, isCancelled && styles.rowTimeCancelled, { fontFamily: MONO }]}>
        {dep.time}
      </Text>
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
      ) : isCancelled ? (
        <View
          style={[
            styles.cancelledBadgeSmall,
            {
              backgroundColor: alpha(colors.warning, '12'),
              borderColor: alpha(colors.warning, '30'),
            },
          ]}>
          <Text style={[styles.cancelledBadgeSmallText, { color: colors.warning }]}>Likely cancelled</Text>
        </View>
      ) : null}
      <Text
        style={[
          styles.rowCountdown,
          isCancelled && styles.rowCountdownCancelled,
          isCancelled && { color: colors.warning },
          { fontFamily: MONO },
        ]}>
        {isCancelled ? 'skip' : countdown}
      </Text>
    </View>
  );
}

function CancelledDepartureSlab({ dep }: { dep: NonNullable<Departure['replacedCancelledDeparture']> }) {
  const colors = useAppColors();
  const styles = useHomeStyles();
  return (
    <View
      style={[
        styles.cancelledSlab,
        {
          borderColor: alpha(colors.warning, '30'),
          backgroundColor: alpha(colors.warning, '10'),
        },
      ]}>
      <View style={styles.cancelledSlabHeader}>
        <BusTag bus={dep.bus} />
        <View style={styles.cancelledSlabCopy}>
          <Text style={[styles.cancelledEyebrow, { color: alpha(colors.warning, 'CC') }]}>
            SCHEDULED BEFORE LIVE UPDATE
          </Text>
          <Text
            style={[
              styles.cancelledTime,
              {
                color: alpha(colors.warning, 'F0'),
                textDecorationColor: alpha(colors.warning, 'C0'),
                fontFamily: MONO,
              },
            ]}>
            {dep.time}
          </Text>
        </View>
        <View
          style={[
            styles.cancelledPill,
            {
              backgroundColor: alpha(colors.warning, '18'),
              borderColor: alpha(colors.warning, '38'),
            },
          ]}>
          <Text style={[styles.cancelledPillText, { color: colors.warning }]}>Likely cancelled</Text>
        </View>
      </View>
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
  const styles = useHomeStyles();
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
  const minsLabel = dep.minsUntil < 1
    ? 'now'
    : dep.minsUntil < 60
      ? `in ${dep.minsUntil} min`
      : `in ${Math.floor(dep.minsUntil / 60)}h ${dep.minsUntil % 60}min`;
  const realtimeStatus = getRealtimeStatus(dep, colors);
  return (
    <View style={styles.nextBlock}>
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
                  { borderColor: busColor },
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
      {dep.replacedCancelledDeparture ? <CancelledDepartureSlab dep={dep.replacedCancelledDeparture} /> : null}
    </View>
  );
}

// ── To Kojori view ────────────────────────────────────────────────────────────
function ToKojoriView({
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

  const departures = useMemo(() => {
    const merged = mergeArrivalsIntoSchedule(rawDepartures, arrivals, now, dataUpdatedAt);
    return demoEnabled ? injectCancelledDemo(merged, now) : merged;
  }, [rawDepartures, arrivals, now, dataUpdatedAt, demoEnabled]);

  const isLoading = l380 || l316;
  const isError = (e380 || e316) && !s380 && !s316;
  const { next, upcoming } = useMemo(() => getDisplayedDepartures(departures), [departures]);

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
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surfaceHigh}
          />
        }>
        <View style={styles.fixedSection}>
          <StopSelector
            stops={favoriteStops}
            activeStopId={activeStopId}
            accentColor={colors.route380}
            onSelectStop={onSelectStop}
            addStopModal={{
              title: 'Tbilisi Departure Stops',
              direction: 'toKojori',
              favoriteIds,
              onToggle: onToggleFavorite,
            }}
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
                key={`${dep.key}-${dep.status}`}
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
  onToggleFavorite,
  bottomInset,
  isRefreshing,
  onRefresh,
  now,
  demoEnabled,
}: {
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

  const departures = useMemo(() => {
    const merged = mergeArrivalsIntoSchedule(rawDepartures, arrivals, now, dataUpdatedAt);
    return demoEnabled ? injectCancelledDemo(merged, now) : merged;
  }, [rawDepartures, arrivals, now, dataUpdatedAt, demoEnabled]);

  const isLoading = l380 || l316;
  const isError = (e380 || e316 || eArrival) && !s380 && !s316;
  const { next, upcoming } = useMemo(() => getDisplayedDepartures(departures), [departures]);

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
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surfaceHigh}
          />
        }>
        <View style={styles.fixedSection}>
          <StopSelector
            stops={favoriteStops}
            activeStopId={activeStopId}
            accentColor={colors.route316}
            onSelectStop={onSelectStop}
            addStopModal={{
              title: 'Kojori Stops',
              direction: 'toTbilisi',
              favoriteIds,
              onToggle: onToggleFavorite,
            }}
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
                key={`${dep.key}-${dep.status}`}
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
  const styles = useHomeStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const {
    settings,
    update,
    setSharedDirection,
    hasManualDirectionOverride,
    isLoaded,
    toggleKojoriFavorite,
    toggleTbilisiFavorite,
  } = useSettings();
  const {
    detectedMode,
    permission,
    canAskAgain,
    isLocating,
    locationError,
    requestLocationAccess,
    refreshLocation,
  } = useLocation(settings.enableSmartDirection);
  const { status: ttcStatus, lastSuccessAt } = useTtcHealth();
  const { widgetMode, widgetStopId } = useLocalSearchParams<{
    widgetMode?: string;
    widgetStopId?: string;
  }>();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const handledWidgetLink = useRef<string | null>(null);
  const mode = directionToMode(settings.sharedDirection);

  useEffect(() => {
    if (!isLoaded || !settings.enableSmartDirection || hasManualDirectionOverride || !detectedMode) return;

    setSharedDirection(modeToDirection(detectedMode), false);
  }, [detectedMode, hasManualDirectionOverride, isLoaded, setSharedDirection, settings.enableSmartDirection]);

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

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') setNow(new Date());
    });

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      sub.remove();
    };
  }, []);

  const accentColor = mode === 'kojori' ? colors.route380 : colors.route316;
  const activeDirection = settings.sharedDirection;
  const activeStopId = mode === 'kojori' ? settings.activeTbilisiStopId : settings.activeKojoriStopId;
  const showLocationStatus =
    (!settings.hasSeenSmartDirectionPrompt && !settings.enableSmartDirection) ||
    (settings.enableSmartDirection && (
      (permission !== 'granted' && permission !== 'unknown') ||
      hasManualDirectionOverride ||
      isLocating ||
      Boolean(locationError)));

  function handleModeToggle(next: SharedMode) {
    setSharedDirection(modeToDirection(next));
  }

  const handleEnableLocation = useCallback(async () => {
    setSharedDirection(settings.sharedDirection, false);

    if (!settings.enableSmartDirection) {
      const result = await requestLocationAccess();

      if (result === 'granted') {
        update({
          enableSmartDirection: true,
          hasSeenSmartDirectionPrompt: true,
        });
        return;
      }

      if (result === 'denied' || result === 'blocked') {
        update({ hasSeenSmartDirectionPrompt: true });
      }
      return;
    }

    if (permission === 'granted') {
      await refreshLocation();
      return;
    }

    const result = await requestLocationAccess();
    if (result === 'denied' || result === 'blocked') {
      update({ hasSeenSmartDirectionPrompt: true });
    }
  }, [
    permission,
    refreshLocation,
    requestLocationAccess,
    setSharedDirection,
    settings.enableSmartDirection,
    settings.sharedDirection,
    update,
  ]);

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

  const statusItems = useMemo<IslandStatusItem[]>(() => {
    const items: IslandStatusItem[] = [];

    if (ttcStatus !== 'healthy') {
      const isOffline = ttcStatus === 'offline';
      const isRateLimited = ttcStatus === 'rate-limited';
      const accent = isOffline || isRateLimited ? colors.error : colors.warning;
      const textColor = isOffline || isRateLimited ? colors.rose : colors.sand;
      const timeAgo = lastSuccessAt
        ? (() => {
            const mins = Math.floor((Date.now() - lastSuccessAt) / 60000);
            if (mins < 1) return 'just now';
            if (mins === 1) return '1m ago';
            if (mins < 60) return `${mins}m ago`;
            const hours = Math.floor(mins / 60);
            return hours === 1 ? '1h ago' : `${hours}h ago`;
          })()
        : null;

      items.push({
        key: 'ttc',
        dismissToken: `ttc:${ttcStatus}`,
        label: timeAgo ? `${isRateLimited ? 'Rate limited' : isOffline ? 'TTC offline' : 'TTC unstable'} · ${timeAgo}` : (isRateLimited ? 'Rate limited' : isOffline ? 'TTC offline' : 'TTC unstable'),
        detail: isRateLimited
          ? 'TTC rate limiter hit. Requests are being throttled. Showing cached data when available.'
          : isOffline
          ? 'Cannot reach TTC right now. Showing cached data when available.'
          : 'TTC requests are failing intermittently. Some data may be stale.',
        meta: lastSuccessAt
          ? `Last TTC update ${new Date(lastSuccessAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
          : 'No TTC response yet this session',
        actionLabel: 'Refresh',
        onAction: () => {
          queryClient.refetchQueries({
            predicate: query => query.meta?.source === 'ttc' && query.getObserversCount() > 0,
          });
        },
        accentColor: accent,
        textColor,
      });
    }

    if (!showLocationStatus) return items;

    if (!settings.enableSmartDirection && !settings.hasSeenSmartDirectionPrompt) {
      items.push({
        key: 'location',
        dismissToken: 'location:first-run',
        label: 'Try smart direction',
        detail: 'First run: turn on smart direction and allow location if you want app to suggest Kojori or Tbilisi automatically.',
        actionLabel: 'Turn on',
        onAction: handleEnableLocation,
        onDismiss: () => {
          update({ hasSeenSmartDirectionPrompt: true });
        },
        accentColor: colors.primary,
        textColor: colors.text,
      });
      return items;
    }

    if (isLocating) {
      items.push({
        key: 'location',
        dismissToken: 'location:checking',
        label: 'Checking location',
        detail: 'Finding whether you are closer to Kojori or Tbilisi for automatic direction.',
        accentColor: colors.primary,
        textColor: colors.text,
      });
      return items;
    }

    if (hasManualDirectionOverride) {
      items.push({
        key: 'location',
        dismissToken: 'location:manual',
        label: 'Manual direction',
        detail: 'You switched direction manually. Use location again if you want the app to suggest the right side automatically.',
        actionLabel: permission === 'granted' ? 'Use my location' : 'Enable location',
        onAction: handleEnableLocation,
        accentColor,
        textColor: colors.text,
      });
      return items;
    }

    if (permission === 'denied' && !canAskAgain) {
      items.push({
        key: 'location',
        dismissToken: 'location:blocked',
        label: 'Location blocked',
        detail: 'Open system settings to turn location back on for automatic direction suggestions. Manual switching still works.',
        actionLabel: 'Open settings',
        onAction: () => {
          void Linking.openSettings();
        },
        accentColor: colors.warning,
        textColor: colors.sand,
      });
      return items;
    }

    if (permission === 'denied') {
      items.push({
        key: 'location',
        dismissToken: 'location:denied',
        label: 'Location off',
        detail: 'Allow location if you want the app to switch between Kojori and Tbilisi automatically. You can still control it manually.',
        actionLabel: 'Allow location',
        onAction: handleEnableLocation,
        accentColor: colors.warning,
        textColor: colors.sand,
      });
      return items;
    }

    if (locationError) {
      items.push({
        key: 'location',
        dismissToken: 'location:error',
        label: 'Location error',
        detail: 'Automatic direction is available, but the last location check failed. Try again or keep using the manual toggle.',
        actionLabel: 'Try again',
        onAction: handleEnableLocation,
        accentColor: colors.warning,
        textColor: colors.sand,
      });
      return items;
    }

    items.push({
      key: 'location',
      dismissToken: 'location:enable',
      label: 'Enable location',
      detail: 'Allow location to suggest whether you are heading to Kojori or Tbilisi automatically. You can keep using the toggle whenever you want.',
      actionLabel: 'Enable location',
      onAction: handleEnableLocation,
      accentColor: colors.primary,
      textColor: colors.text,
    });
    return items;
  }, [
    canAskAgain,
    colors.error,
    colors.primary,
    colors.rose,
    colors.sand,
    colors.warning,
    colors.text,
    handleEnableLocation,
    hasManualDirectionOverride,
    isLocating,
    lastSuccessAt,
    locationError,
    permission,
    queryClient,
    settings.enableSmartDirection,
    settings.hasSeenSmartDirectionPrompt,
    showLocationStatus,
    ttcStatus,
    accentColor,
    update,
  ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.locationDot, { backgroundColor: accentColor }]} />
          <Text style={styles.headerCity}>{mode === 'kojori' ? 'Tbilisi' : 'Kojori'}</Text>
        </View>
        <View style={styles.headerCenter}>
          <StatusIsland items={statusItems} />
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.headerClock, { fontFamily: MONO }]}>{formatHeaderTime(now)}</Text>
          <Pressable
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={isRefreshing}>
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.textDim} />
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

      {mode === 'kojori' ? (
          <ToKojoriView
            favoriteIds={settings.tbilisiFavorites}
            activeStopId={settings.activeTbilisiStopId}
            onSelectStop={id => update({ activeTbilisiStopId: id })}
            onToggleFavorite={toggleTbilisiFavorite}
            bottomInset={insets.bottom}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            now={now}
            demoEnabled={settings.cancelledBusDemo}
          />
        ) : (
          <ToTbilisiView
            favoriteIds={settings.kojoriFavorites}
            activeStopId={settings.activeKojoriStopId}
            onSelectStop={id => update({ activeKojoriStopId: id })}
            onToggleFavorite={toggleKojoriFavorite}
            bottomInset={insets.bottom}
            isRefreshing={isRefreshing}
            onRefresh={handleRefresh}
            now={now}
            demoEnabled={settings.cancelledBusDemo}
          />
        )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function createStyles(C: AppColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CONTENT_SIDE,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 92 },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 92, justifyContent: 'flex-end' },
  locationDot: { width: 8, height: 8, borderRadius: 4 },
  headerCity: { color: C.text, fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  headerClock: { color: C.textDim, fontSize: 15, letterSpacing: 0.4 },
  statusIslandWrap: { alignItems: 'center', gap: 8, maxWidth: '100%' },
  statusIslandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusPill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
    maxWidth: 220,
  },
  statusPillDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  statusPillLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  statusPanel: {
    position: 'absolute',
    top: 44,
    alignSelf: 'center',
    width: '100%',
    minWidth: 252,
    maxWidth: 340,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    zIndex: 40,
  },
  statusPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  statusPanelHeaderMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  statusPanelClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPanelTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.35 },
  statusPanelText: { color: C.textDim, fontSize: 12, lineHeight: 17 },
  statusPanelFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  statusPanelFooterLeft: { flex: 1, gap: 8, minWidth: 0 },
  statusPanelMeta: { color: C.textFaint, fontSize: 10, flex: 1 },
  statusPanelButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: alpha(C.surfaceHigh, 'AA'),
  },
  statusPanelDismissButton: {
    alignSelf: 'flex-start',
    backgroundColor: alpha(C.surfaceHigh, '66'),
  },
  statusPanelButtonText: { fontSize: 11, fontWeight: '700' },
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

  toggleWrap: {
    paddingHorizontal: CONTENT_SIDE,
    paddingTop: 4,
    paddingBottom: CONTENT_SIDE,
  },

  modeContainer: { flex: 1 },
  pageScroll: { flex: 1 },
  pageScrollContent: { flexGrow: 1 },
  fixedSection: { paddingHorizontal: CONTENT_SIDE, paddingTop: 0 },
  dividerPadded: { paddingHorizontal: CONTENT_SIDE },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: SECTION_SPACE },
  nextDivider: { paddingTop: SECTION_SPACE, paddingBottom: SECTION_SPACE },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerLabel: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 },

  nextBlock: { gap: 10 },
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
  nextEyebrow: { color: alpha(C.text, 'B8'), fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  nextBodyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  nextMain: { flex: 1, minWidth: 0, justifyContent: 'flex-end' },
  nextTime: { color: C.text, fontSize: 46, fontWeight: '700', letterSpacing: -1.6, lineHeight: 48, flexShrink: 1 },
  nextRouteBadge: {
    minWidth: 54,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1.5,
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
  nextCountdownLabel: { color: alpha(C.text, 'C4'), fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  nextCountdownValue: { fontSize: 16, fontWeight: '800', marginTop: 3 },
  cancelledSlab: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: alpha(C.warning, '30'),
    backgroundColor: alpha(C.warning, '10'),
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cancelledSlabHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelledSlabCopy: { flex: 1, minWidth: 0, gap: 2 },
  cancelledEyebrow: { color: alpha(C.warning, 'CC'), fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  cancelledTime: {
    color: alpha(C.text, 'A8'),
    fontSize: 20,
    fontWeight: '700',
    textDecorationLine: 'line-through',
    textDecorationColor: alpha(C.warning, 'C0'),
  },
  cancelledPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: alpha(C.warning, '18'),
    borderWidth: 1,
    borderColor: alpha(C.warning, '38'),
  },
  cancelledPillText: { color: C.warning, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
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
  listSection: { marginHorizontal: CONTENT_SIDE },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 14 },
  rowCancelled: { opacity: 0.86 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  rowTime: { flex: 1, color: C.text, fontSize: 22, fontWeight: '600', letterSpacing: -0.3 },
  rowTimeCancelled: {
    color: alpha(C.text, '8F'),
    textDecorationLine: 'line-through',
    textDecorationColor: alpha(C.warning, 'B0'),
  },
  rowCountdown: { color: C.textDim, fontSize: 13, fontWeight: '500' },
  rowCountdownCancelled: { color: C.warning },

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
  cancelledBadgeSmall: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: alpha(C.warning, '12'),
    borderWidth: 1,
    borderColor: alpha(C.warning, '30'),
  },
  cancelledBadgeSmallText: { color: C.warning, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
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
}

function useHomeStyles() {
  const colors = useAppColors();
  return useMemo(() => createStyles(colors), [colors]);
}
