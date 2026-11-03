import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useEffectEvent, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, MaxContentWidth, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useLocation } from '@/hooks/use-location';
import { useTransitCopy } from '@/transit/copy';
import {
  detailsQuery,
  geometryQuery,
  INITIAL_ROUTES,
  routesQuery,
  scheduleQuery,
  stopRoutesQuery,
  stopsQuery,
} from '@/transit/data';
import { useFavorites } from '@/transit/favorites';
import {
  activeBoardings,
  boardingKey,
  lookupStopId,
  patternKey,
  reverseTrip,
  tripPatterns,
  tripRoutes,
  tripStopId,
  tripStops,
  type Boarding,
  type Favorite,
  type TransitPattern,
  type TransitRoute,
} from '@/transit/model';
import type { TripEditorOptions } from '@/transit/trip-ui';
import { routeColor, transitModeIcon, tripAccent, useFavoriteTitle } from '@/transit/ui';
import type { StopInfo } from '@/services/ttc';
import { createThemedStyles } from '@/utils/themed-styles';

const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });
const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const NO_ROUTE: TransitRoute = { id: '', shortName: '', longName: '', mode: 'BUS' };
const MAX_SUGGESTION_ROUTES = 10;

type Step = 'route' | 'direction' | 'stop' | 'trip' | 'done';
type RoutePattern = { route: TransitRoute; pattern: TransitPattern };

function newTripId() {
  return `trip:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function distanceMeters(a: { latitude: number; longitude: number }, stop: StopInfo) {
  if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return Infinity;
  const rad = Math.PI / 180;
  const dLat = (stop.lat - a.latitude) * rad;
  const dLon = (stop.lon - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(stop.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** The draft as it will look with these routes, so colours match the result. */
function withPreview(trip: Favorite, patterns: RoutePattern[]): Favorite {
  return {
    ...trip,
    boardings: [
      ...trip.boardings,
      ...patterns.map(p => ({ ...p, stop: { id: '', label: '' } })),
    ],
  };
}

/** Add one boarding per pattern that calls at the stop. */
function withStop(
  boardings: Boarding[],
  patterns: RoutePattern[],
  stopsOf: (p: RoutePattern) => StopInfo[] | undefined,
  stop: StopInfo,
) {
  const added = patterns
    .filter(p => {
      // Kojori's first stop is listed under the bridge stop it shares buses with.
      const lookupId = lookupStopId({ ...p, stop });
      return stopsOf(p)?.some(s => s.id === stop.id || s.id === lookupId);
    })
    .map(p => ({ route: p.route, pattern: p.pattern, stop }));
  return [
    ...boardings,
    ...added.filter(b => !boardings.some(o => boardingKey(o) === boardingKey(b))),
  ];
}

/**
 * Full-screen flow for adding or editing a trip. A trip is built route by
 * route: choose a route, its direction and the stop you board at; later
 * routes reuse the stops already saved wherever they call.
 */
export function TripEditor({
  options,
  onClose,
  onRestart,
}: {
  options: TripEditorOptions;
  onClose: () => void;
  onRestart: (options: TripEditorOptions) => void;
}) {
  const colors = useAppColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const copy = useTransitCopy();
  const { t, ttcLocale, localizedStopName } = useI18n();
  const tripTitle = useFavoriteTitle();
  const client = useQueryClient();
  const { state, save, remove, select } = useFavorites();
  const existing = state.favorites.find(f => f.id === options.id);
  const reverseSource = state.favorites.find(f => f.id === options.reverseOf);

  const [draft, setDraft] = useState<Favorite>(
    () => existing ?? { id: newTripId(), title: '', boardings: [] },
  );
  const [step, setStep] = useState<Step>(existing ? 'trip' : reverseSource ? 'stop' : 'route');
  const [pending, setPending] = useState<RoutePattern[]>([]);
  const [route, setRoute] = useState<TransitRoute | null>(null);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────────
  const catalog = useQuery({ ...routesQuery(ttcLocale), enabled: step === 'route' });
  const details = useQuery({
    ...detailsQuery(route ?? NO_ROUTE, ttcLocale),
    enabled: Boolean(route) && step === 'direction',
  });
  const reverseRoutes = reverseSource ? tripRoutes(reverseSource) : [];
  const reverseDetails = useQueries({
    queries: reverseRoutes.map(r => ({
      ...detailsQuery(r, ttcLocale),
      enabled: step === 'stop' && draft.boardings.length === 0,
    })),
  });
  // The way back runs the same routes; on each, take the first pattern the
  // source trip does not use.
  const reversePending: RoutePattern[] = reverseSource
    ? reverseDetails.flatMap(q => {
        const detail = q.data;
        if (!detail) return [];
        const used = new Set(tripPatterns(reverseSource).map(patternKey));
        const route: TransitRoute = {
          id: detail.id,
          shortName: detail.shortName,
          longName: detail.longName,
          mode: detail.mode,
        };
        const pattern = detail.patterns.find(p => !used.has(patternKey({ route, pattern: p })));
        return pattern ? [{ route, pattern }] : [];
      })
    : [];
  const choosing =
    pending.length || draft.boardings.length ? pending : reversePending;

  const draftPatterns: RoutePattern[] = tripPatterns(draft);
  const patternsForStops = [...choosing, ...draftPatterns].filter(
    (p, i, all) => all.findIndex(o => patternKey(o) === patternKey(p)) === i,
  );
  const patternStops = useQueries({
    queries: patternsForStops.map(p => stopsQuery(p, ttcLocale)),
  });
  const stopsOf = (p: RoutePattern) =>
    patternStops[patternsForStops.findIndex(o => patternKey(o) === patternKey(p))]?.data;

  // Suggestions: routes TTC lists at the active stop whose patterns continue
  // to the same destination (same headsign, or one of our last stops later on).
  const activeStopId = tripStopId(draft);
  // TTC lists Kojori's first stop under the bridge stop it shares buses with.
  const firstActive = activeBoardings(draft)[0];
  const lookupId = firstActive ? lookupStopId(firstActive) : activeStopId;
  const destinationStops = new Set(
    draftPatterns.flatMap(p => (stopsOf(p) ?? []).slice(-3).map(s => s.id)),
  );
  const headsigns = new Set(draftPatterns.map(p => p.pattern.headsign.trim().toLowerCase()));
  const stopRoutes = useQuery({
    ...stopRoutesQuery(lookupId, ttcLocale),
    enabled: step === 'trip' && Boolean(lookupId),
  });
  const candidates = (stopRoutes.data ?? [])
    .filter(r => !draft.boardings.some(b => b.route.id === r.id))
    .slice(0, MAX_SUGGESTION_ROUTES);
  const candidateDetails = useQueries({
    queries: candidates.map(r => ({ ...detailsQuery(r, ttcLocale), enabled: step === 'trip' })),
  });
  const candidatePatterns: RoutePattern[] = candidateDetails.flatMap((q, i) =>
    (q.data?.patterns ?? []).map(pattern => ({ route: candidates[i], pattern })),
  );
  const candidateStops = useQueries({
    queries: candidatePatterns.map(p => ({ ...stopsQuery(p, ttcLocale), enabled: step === 'trip' })),
  });
  const suggestions = candidatePatterns.filter((p, i) => {
    const stops = candidateStops[i]?.data;
    if (!stops) return false;
    const at = stops.findIndex(s => s.id === lookupId || s.id === activeStopId);
    if (at < 0 || at === stops.length - 1) return false;
    return (
      headsigns.has(p.pattern.headsign.trim().toLowerCase()) ||
      stops.slice(at + 1).some(s => destinationStops.has(s.id))
    );
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  function goBack() {
    setSearch('');
    setConfirmDelete(false);
    if (step === 'done' || step === 'trip') return onClose();
    if (step === 'stop' && reverseSource && !draft.boardings.length) return onClose();
    if (step === 'stop') return setStep(route ? 'direction' : 'trip');
    if (step === 'direction') return setStep('route');
    if (draft.boardings.length) return setStep('trip');
    onClose();
  }
  const handleBack = useEffectEvent(() => {
    goBack();
    return true;
  });
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => handleBack());
    return () => sub.remove();
  }, []);

  function pickRoute(next: TransitRoute) {
    setRoute(next);
    setSearch('');
    setStep('direction');
  }

  async function pickPattern(pattern: TransitPattern) {
    if (!route) return;
    const picked = { route, pattern };
    setPending([picked]);
    if (!draft.boardings.length) return setStep('stop');
    // A further route joins the trip at every saved stop it calls at.
    const stops = await client.fetchQuery(stopsQuery(picked, ttcLocale)).catch(() => []);
    const next = tripStops(draft).reduce(
      (acc, stop) => withStop(acc, [picked], () => stops, stop),
      draft.boardings,
    );
    if (next.length === draft.boardings.length) return setStep('stop');
    setDraft({ ...draft, boardings: next });
    setPending([]);
    setRoute(null);
    setStep('trip');
  }

  function pickStop(stop: StopInfo) {
    const patterns = choosing.length ? choosing : draftPatterns;
    const boardings = withStop(draft.boardings, patterns, stopsOf, stop);
    setDraft({ ...draft, boardings, stopId: draft.boardings.length ? draft.stopId : stop.id });
    setPending([]);
    setRoute(null);
    setSearch('');
    setStep('trip');
  }

  function addSuggestion(p: RoutePattern) {
    const stops = candidateStops[candidatePatterns.indexOf(p)]?.data;
    setDraft({
      ...draft,
      boardings: tripStops(draft).reduce(
        (acc, stop) => withStop(acc, [p], () => stops, stop),
        draft.boardings,
      ),
    });
  }

  function removeRoute(routeId: string) {
    setDraft({ ...draft, boardings: draft.boardings.filter(b => b.route.id !== routeId) });
  }

  function removeStop(stopId: string) {
    setDraft({ ...draft, boardings: draft.boardings.filter(b => b.stop.id !== stopId) });
  }

  function commit() {
    const trip = { ...draft, title: draft.title.trim() };
    save(trip);
    select(trip.id);
    for (const boarding of tripPatterns(trip)) {
      void client.prefetchQuery(scheduleQuery(boarding));
      void client.prefetchQuery(geometryQuery(boarding));
    }
    const hasReverse = Boolean(reverseTrip(trip, state.favorites));
    if (existing || options.reverseOf || hasReverse) onClose();
    else setStep('done');
  }

  function deleteTrip() {
    if (!existing) return onClose();
    if (!confirmDelete) return setConfirmDelete(true);
    remove(existing.id);
    onClose();
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  const accent = tripAccent(draft.boardings.length ? draft : undefined, colors);
  const title =
    step === 'route'
      ? copy('tripWhichRoute')
      : step === 'direction'
        ? copy('tripWhichWay')
        : step === 'stop'
          ? copy('tripWhereBoard')
          : step === 'done'
            ? copy('tripSaved')
            : existing
              ? copy('tripEdit')
              : copy('tripNew');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.frame}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('back')}
            onPress={goBack}
            hitSlop={8}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons
              name={step === 'trip' || step === 'done' ? 'close' : 'arrow-left'}
              size={22}
              color={colors.text}
            />
          </Pressable>
          {step !== 'trip' && step !== 'done' ? (
            <StepDots step={step} accent={accent} />
          ) : null}
        </View>
        <Text style={[styles.title, { fontFamily: DISPLAY }]}>{title}</Text>
      </View>

      {step === 'route' ? (
        <RouteStep
          routes={catalog.data ?? INITIAL_ROUTES}
          taken={new Set(draft.boardings.map(b => b.route.id))}
          search={search}
          onSearch={setSearch}
          mode={mode}
          onMode={setMode}
          onPick={pickRoute}
          bottomInset={insets.bottom}
        />
      ) : null}

      {step === 'direction' && route ? (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          <RouteLine
            route={route}
            trip={withPreview(draft, [{ route, pattern: { patternSuffix: '', headsign: '' } }])}
          />
          {details.isLoading ? (
            <ActivityIndicator style={styles.loader} color={accent} />
          ) : details.isError || !details.data?.patterns.length ? (
            <ErrorRow message={copy('unavailable')} onRetry={() => details.refetch()} />
          ) : (
            details.data.patterns.map(pattern => (
              <DirectionCard
                key={pattern.patternSuffix}
                trip={withPreview(draft, [{ route, pattern }])}
                route={route}
                pattern={pattern}
                taken={draft.boardings.some(
                  b => patternKey(b) === patternKey({ route, pattern }),
                )}
                onPress={() => void pickPattern(pattern)}
              />
            ))
          )}
        </ScrollView>
      ) : null}

      {step === 'stop' ? (
        <StopStep
          patterns={choosing.length ? choosing : draftPatterns}
          stopsOf={stopsOf}
          loading={
            Boolean(reverseSource && !choosing.length && !draft.boardings.length) ||
            patternStops.some(q => q.isLoading)
          }
          failed={patternStops.length > 0 && patternStops.every(q => q.isError)}
          onRetry={() => patternStops.forEach(q => void q.refetch())}
          saved={new Set(tripStops(draft).map(s => s.id))}
          search={search}
          onSearch={setSearch}
          onPick={pickStop}
          trip={draft}
          bottomInset={insets.bottom}
          note={
            pending.length && draft.boardings.length
              ? copy('tripNotServed', { route: pending[0].route.shortName })
              : undefined
          }
        />
      ) : null}

      {step === 'trip' ? (
        <>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}>
            <View style={[styles.hero, { borderColor: alpha(accent, '40') }]}>
              <View style={[styles.heroBar, { backgroundColor: accent }]} />
              <View style={styles.heroContent}>
                <Text style={[styles.heroTo, { color: accent, fontFamily: DISPLAY }]}>
                  {t('directionTo').trim()}
                </Text>
                <TextInput
                  value={draft.title}
                  onChangeText={value => setDraft({ ...draft, title: value })}
                  placeholder={tripTitle({ ...draft, title: '' })}
                  placeholderTextColor={colors.text}
                  accessibilityLabel={copy('tripName')}
                  style={[styles.heroName, { fontFamily: DISPLAY }]}
                  maxLength={40}
                />
                <View style={styles.heroBadges}>
                  {tripRoutes(draft).map(r => (
                    <RouteBadge key={r.id} route={r} trip={draft} />
                  ))}
                  <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.textFaint} style={styles.heroPencil} />
                </View>
              </View>
            </View>

            <SectionLabel label={copy('tripRoutes')} />
            <View style={styles.group}>
              {draftPatterns.map(p => (
                <View key={patternKey(p)} style={styles.groupRow}>
                  <RouteBadge route={p.route} trip={draft} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      → {p.pattern.headsign}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {p.route.longName}
                    </Text>
                  </View>
                  {tripRoutes(draft).length > 1 ? (
                    <RemoveButton
                      label={copy('tripRemoveRoute', { route: p.route.shortName })}
                      onPress={() => removeRoute(p.route.id)}
                    />
                  ) : null}
                </View>
              ))}
              <AddRow
                label={copy('tripAddRoute')}
                accent={accent}
                onPress={() => {
                  setRoute(null);
                  setStep('route');
                }}
              />
            </View>

            {suggestions.length ? (
              <>
                <SectionLabel label={copy('tripAlsoHere')} />
                <View style={styles.suggestions}>
                  {suggestions.map(p => (
                    <Pressable
                      key={patternKey(p)}
                      accessibilityRole="button"
                      onPress={() => addSuggestion(p)}
                      style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                      <MaterialCommunityIcons name="plus" size={16} color={colors.textDim} />
                      <Text style={[styles.suggestionNumber, { fontFamily: MONO }]}>
                        {p.route.shortName}
                      </Text>
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        → {p.pattern.headsign}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <SectionLabel label={copy('tripStops')} />
            <View style={styles.group}>
              {tripStops(draft).map(stop => {
                const active = stop.id === activeStopId;
                const served = draft.boardings.filter(b => b.stop.id === stop.id);
                return (
                  <Pressable
                    key={stop.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setDraft({ ...draft, stopId: stop.id })}
                    style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}>
                    <View style={[styles.radio, { borderColor: active ? accent : colors.borderStrong }]}>
                      {active ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {localizedStopName(stop)}
                      </Text>
                      <Text style={[styles.rowSub, { fontFamily: MONO }]} numberOfLines={1}>
                        {served.map(b => b.route.shortName).join(' · ')}
                      </Text>
                    </View>
                    {tripStops(draft).length > 1 ? (
                      <RemoveButton
                        label={copy('tripRemoveStop', { stop: localizedStopName(stop) })}
                        onPress={() => removeStop(stop.id)}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
              <AddRow
                label={copy('tripAddStop')}
                accent={accent}
                onPress={() => {
                  setPending([]);
                  setRoute(null);
                  setStep('stop');
                }}
              />
            </View>

            {existing ? (
              <Pressable
                accessibilityRole="button"
                onPress={deleteTrip}
                style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
                <Text style={[styles.deleteText, { color: colors.error }]}>
                  {confirmDelete ? copy('tripDeleteConfirm') : copy('tripDelete')}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
            <PrimaryButton
              label={copy('tripSave')}
              accent={accent}
              disabled={!draft.boardings.length}
              onPress={commit}
            />
          </View>
        </>
      ) : null}

      {step === 'done' ? (
        <View style={[styles.done, { paddingBottom: insets.bottom + 24 }]}>
          <View style={[styles.doneIcon, { backgroundColor: alpha(accent, '22') }]}>
            <MaterialCommunityIcons name="check" size={36} color={accent} />
          </View>
          <Text style={[styles.doneTitle, { fontFamily: DISPLAY }]}>{copy('tripReturnPrompt')}</Text>
          <Text style={styles.doneNote}>{copy('tripReturnNote')}</Text>
          <View style={styles.doneActions}>
            <PrimaryButton
              label={copy('tripReturnAdd')}
              icon="swap-horizontal"
              accent={accent}
              onPress={() => onRestart({ reverseOf: draft.id })}
            />
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>{copy('tripNotNow')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

// ── Steps ───────────────────────────────────────────────────────────────────
function StepDots({ step, accent }: { step: Step; accent: string }) {
  const styles = useStyles();
  const colors = useAppColors();
  const index = step === 'route' ? 0 : step === 'direction' ? 1 : 2;
  return (
    <View style={styles.dots} accessibilityLabel={`${index + 1} / 3`}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            styles.dot,
            i === index && styles.dotActive,
            { backgroundColor: i <= index ? accent : colors.borderStrong },
          ]}
        />
      ))}
    </View>
  );
}

function RouteStep({
  routes,
  taken,
  search,
  onSearch,
  mode,
  onMode,
  onPick,
  bottomInset,
}: {
  routes: TransitRoute[];
  taken: Set<string>;
  search: string;
  onSearch: (value: string) => void;
  mode: string;
  onMode: (value: string) => void;
  onPick: (route: TransitRoute) => void;
  bottomInset: number;
}) {
  const styles = useStyles();
  const copy = useTransitCopy();
  const query = search.trim().toLocaleLowerCase();
  const modes = [
    ['all', copy('allModes')],
    ['BUS', copy('bus')],
    ['SUBWAY', copy('subway')],
    ['GONDOLA', copy('gondola')],
  ].filter(([value]) => value === 'all' || routes.some(r => r.mode === value));
  const visible = routes
    .filter(
      r =>
        (mode === 'all' || r.mode === mode) &&
        `${r.shortName} ${r.longName}`.toLocaleLowerCase().includes(query),
    )
    .sort(
      (a, b) =>
        Number(b.shortName.toLocaleLowerCase() === query) -
          Number(a.shortName.toLocaleLowerCase() === query) ||
        Number(b.shortName.toLocaleLowerCase().startsWith(query)) -
          Number(a.shortName.toLocaleLowerCase().startsWith(query)) ||
        a.shortName.localeCompare(b.shortName, undefined, { numeric: true }),
    );
  return (
    <FlatList
      data={visible}
      keyExtractor={r => r.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + 24 }]}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <SearchField
            value={search}
            onChange={onSearch}
            placeholder={copy('searchRoute')}
            autoFocus
          />
          {modes.length > 2 ? (
            <View style={styles.modes}>
              {modes.map(([value, label]) => (
                <Chip key={value} label={label} selected={mode === value} onPress={() => onMode(value)} />
              ))}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{copy('noMatches')}</Text>}
      renderItem={({ item }) => (
        <RouteRow route={item} taken={taken.has(item.id)} onPress={() => onPick(item)} />
      )}
    />
  );
}

function StopStep({
  patterns,
  stopsOf,
  loading,
  failed,
  onRetry,
  saved,
  search,
  onSearch,
  onPick,
  trip,
  note,
  bottomInset,
}: {
  patterns: RoutePattern[];
  stopsOf: (p: RoutePattern) => StopInfo[] | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  saved: Set<string>;
  search: string;
  onSearch: (value: string) => void;
  onPick: (stop: StopInfo) => void;
  trip: Favorite;
  note?: string;
  bottomInset: number;
}) {
  const styles = useStyles();
  const colors = useAppColors();
  const copy = useTransitCopy();
  const { localizedStopName } = useI18n();
  const { resolvedLocation, permission, isLocating, requestLocationAccess } = useLocation(true);
  // The first pattern sets the order; stops only other routes call at follow.
  const all = patterns
    .flatMap(p => stopsOf(p) ?? [])
    .filter((stop, i, list) => list.findIndex(s => s.id === stop.id) === i);
  const query = search.trim().toLocaleLowerCase();
  const visible = all.filter(stop =>
    `${localizedStopName(stop)} ${stop.label} ${stop.id}`.toLocaleLowerCase().includes(query),
  );
  const nearby = resolvedLocation && !query
    ? all
        .map(stop => ({ stop, meters: distanceMeters(resolvedLocation, stop) }))
        .filter(n => n.meters < 2_500)
        .sort((a, b) => a.meters - b.meters)
        .slice(0, 3)
    : [];
  const preview = withPreview(trip, patterns);
  const accent = patterns[0] ? routeColor(patterns[0].route.id, colors, preview) : colors.route380;
  const formatDistance = (m: number) =>
    m < 1000
      ? copy('tripMeters', { meters: Math.max(10, Math.round(m / 10) * 10) })
      : copy('tripKm', { km: (m / 1000).toFixed(1) });

  return (
    <FlatList
      data={loading || failed ? [] : visible}
      keyExtractor={stop => stop.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + 24 }]}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          {patterns.length ? (
            <View style={styles.heroBadges}>
              {patterns.map(p => (
                <RouteBadge key={patternKey(p)} route={p.route} trip={preview} />
              ))}
              <Text style={styles.rowSub} numberOfLines={1}>
                → {patterns[0].pattern.headsign}
              </Text>
            </View>
          ) : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <SearchField value={search} onChange={onSearch} placeholder={copy('searchStop')} />
          {loading ? <ActivityIndicator style={styles.loader} color={accent} /> : null}
          {failed ? <ErrorRow message={copy('unavailable')} onRetry={onRetry} /> : null}
          {!loading && !failed && nearby.length ? (
            <>
              <SectionLabel label={copy('tripNearby')} />
              <View style={styles.group}>
                {nearby.map(({ stop, meters }) => (
                  <Pressable
                    key={stop.id}
                    accessibilityRole="button"
                    onPress={() => onPick(stop)}
                    style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={18} color={accent} />
                    <Text style={[styles.rowTitle, styles.rowCopy]} numberOfLines={1}>
                      {localizedStopName(stop)}
                    </Text>
                    <Text style={[styles.rowSub, { fontFamily: MONO }]}>{formatDistance(meters)}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          {!loading && !failed && !resolvedLocation && permission !== 'denied' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void requestLocationAccess({ forceFresh: true })}
              style={({ pressed }) => [styles.locate, pressed && styles.pressed]}>
              {isLocating ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <MaterialCommunityIcons name="crosshairs-gps" size={18} color={accent} />
              )}
              <Text style={styles.locateText}>{copy('location')}</Text>
            </Pressable>
          ) : null}
          {!loading && !failed ? <SectionLabel label={copy('tripAllStops')} /> : null}
        </View>
      }
      renderItem={({ item, index }) => {
        const isSaved = saved.has(item.id);
        const isEdge = !query && (index === 0 || index === visible.length - 1);
        return (
          <Pressable
            accessibilityRole="button"
            disabled={isSaved}
            onPress={() => onPick(item)}
            style={({ pressed }) => [styles.timelineRow, pressed && styles.pressed]}>
            <View style={styles.timelineRail}>
              <View
                style={[
                  styles.timelineLine,
                  { backgroundColor: alpha(accent, '55') },
                  index === 0 && styles.timelineLineFirst,
                  index === visible.length - 1 && styles.timelineLineLast,
                ]}
              />
              <View
                style={[
                  styles.timelineDot,
                  isEdge && styles.timelineDotEdge,
                  {
                    borderColor: accent,
                    backgroundColor: isSaved || isEdge ? accent : colors.bg,
                  },
                ]}
              />
            </View>
            <Text
              style={[styles.timelineName, isSaved && styles.timelineSaved]}
              numberOfLines={2}>
              {localizedStopName(item)}
            </Text>
            {isSaved ? (
              <MaterialCommunityIcons name="check" size={18} color={accent} />
            ) : (
              <Text style={[styles.timelineCode, { fontFamily: MONO }]}>
                #{item.id.split(':')[1] ?? item.id}
              </Text>
            )}
          </Pressable>
        );
      }}
    />
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────
function RouteBadge({ route, trip }: { route: TransitRoute; trip?: Favorite }) {
  const styles = useStyles();
  const colors = useAppColors();
  const color = routeColor(route.id, colors, trip?.boardings.length ? trip : undefined);
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: alpha(color, '1C') }]}>
      {route.mode !== 'BUS' ? (
        <MaterialCommunityIcons name={transitModeIcon(route.mode)} size={13} color={color} />
      ) : null}
      <Text style={[styles.badgeText, { color, fontFamily: MONO }]}>{route.shortName}</Text>
    </View>
  );
}

function RouteLine({ route, trip }: { route: TransitRoute; trip: Favorite }) {
  const styles = useStyles();
  return (
    <View style={styles.routeLine}>
      <RouteBadge route={route} trip={trip.boardings.length ? trip : undefined} />
      <Text style={styles.rowSub} numberOfLines={2}>
        {route.longName}
      </Text>
    </View>
  );
}

function RouteRow({
  route,
  taken,
  onPress,
}: {
  route: TransitRoute;
  taken: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useAppColors();
  const [from, to] = route.longName.split(/\s+[-–—]\s+/);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${route.shortName} ${route.longName}`}
      disabled={taken}
      onPress={onPress}
      style={({ pressed }) => [styles.routeRow, pressed && styles.pressed, taken && styles.taken]}>
      <View style={styles.routeNumberBox}>
        {route.mode !== 'BUS' ? (
          <MaterialCommunityIcons name={transitModeIcon(route.mode)} size={16} color={colors.textDim} />
        ) : null}
        <Text style={[styles.routeNumber, { fontFamily: MONO }]} numberOfLines={1} adjustsFontSizeToFit>
          {route.shortName}
        </Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {from ?? route.longName}
        </Text>
        {to ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            ↔ {to}
          </Text>
        ) : null}
      </View>
      <MaterialCommunityIcons
        name={taken ? 'check' : 'chevron-right'}
        size={20}
        color={colors.textFaint}
      />
    </Pressable>
  );
}

function DirectionCard({
  trip,
  route,
  pattern,
  taken,
  onPress,
}: {
  trip: Favorite;
  route: TransitRoute;
  pattern: TransitPattern;
  taken: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  const colors = useAppColors();
  const { t, localizedStopName } = useI18n();
  const accent = routeColor(route.id, colors, trip);
  const from = pattern.firstStop ? localizedStopName({ id: pattern.firstStop.id, label: pattern.firstStop.name }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={taken}
      onPress={onPress}
      style={({ pressed }) => [
        styles.directionCard,
        { borderColor: alpha(accent, '45'), transform: [{ scale: pressed ? 0.985 : 1 }] },
        taken && styles.taken,
      ]}>
      <View style={[styles.heroBar, { backgroundColor: accent }]} />
      <View style={styles.directionCopy}>
        <Text style={[styles.heroTo, { color: accent, fontFamily: DISPLAY }]}>
          {t('directionTo').trim()}
        </Text>
        <Text
          style={[styles.directionName, { fontFamily: DISPLAY }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          {pattern.headsign}
        </Text>
        {from ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {t('directionFrom', { origin: from })}
          </Text>
        ) : null}
      </View>
      <View style={[styles.arrow, { backgroundColor: alpha(accent, '22'), borderColor: alpha(accent, '55') }]}>
        <MaterialCommunityIcons name={taken ? 'check' : 'arrow-right'} size={22} color={accent} />
      </View>
    </Pressable>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const styles = useStyles();
  const colors = useAppColors();
  return (
    <View style={styles.search}>
      <MaterialCommunityIcons name="magnify" size={20} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={placeholder}
        autoFocus={autoFocus}
        autoCorrect={false}
        style={styles.searchInput}
      />
      {value ? (
        <Pressable accessibilityRole="button" onPress={() => onChange('')} hitSlop={8}>
          <MaterialCommunityIcons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function SectionLabel({ label }: { label: string }) {
  const styles = useStyles();
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function AddRow({ label, accent, onPress }: { label: string; accent: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}>
      <View style={[styles.addIcon, { backgroundColor: alpha(accent, '22') }]}>
        <MaterialCommunityIcons name="plus" size={16} color={accent} />
      </View>
      <Text style={[styles.rowTitle, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useAppColors();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
      <MaterialCommunityIcons name="close" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

function PrimaryButton({
  label,
  accent,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  accent: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}) {
  const styles = useStyles();
  const colors = useAppColors();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: accent, opacity: disabled ? 0.4 : pressed ? 0.86 : 1 },
      ]}>
      {icon ? <MaterialCommunityIcons name={icon} size={20} color={colors.bg} /> : null}
      <Text style={[styles.primaryText, { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

function ErrorRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  const styles = useStyles();
  const copy = useTransitCopy();
  return (
    <View style={styles.errorRow}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>{copy('retry')}</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
function createStyles(C: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    frame: {
      width: '100%',
      maxWidth: MaxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: 20,
      gap: 6,
      paddingBottom: 10,
    },
    topBar: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconButton: {
      width: 42,
      height: 42,
      marginLeft: -8,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
    title: { color: C.text, fontSize: 32, lineHeight: 38, fontWeight: '700' },
    dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    dotActive: { width: 22 },
    scroll: {
      width: '100%',
      maxWidth: MaxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: 20,
      gap: 12,
    },
    listHeader: { gap: 12, marginBottom: 4 },
    loader: { marginVertical: 32 },
    empty: { color: C.textDim, fontSize: 14, textAlign: 'center', paddingVertical: 32 },
    note: { color: C.textDim, fontSize: 14, lineHeight: 20 },
    search: {
      height: 50,
      borderRadius: 25,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
    },
    searchInput: {
      flex: 1,
      color: C.text,
      fontSize: 16,
      height: '100%',
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
    },
    modes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: {
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    chipSelected: { backgroundColor: C.text, borderColor: C.text },
    chipText: { color: C.textDim, fontSize: 13, fontWeight: '700' },
    chipTextSelected: { color: C.bg },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    routeNumberBox: {
      width: 64,
      height: 40,
      borderRadius: 12,
      backgroundColor: C.surfaceHigh,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 6,
    },
    routeNumber: { color: C.text, fontSize: 17, fontWeight: '800' },
    taken: { opacity: 0.45 },
    rowCopy: { flex: 1, minWidth: 0, gap: 2 },
    rowTitle: { color: C.text, fontSize: 16, lineHeight: 21, fontWeight: '700' },
    rowSub: { color: C.textDim, fontSize: 13, lineHeight: 18, flexShrink: 1 },
    routeLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    directionCard: {
      minHeight: 116,
      borderRadius: 22,
      borderWidth: 1,
      backgroundColor: C.surface,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      paddingRight: 16,
    },
    directionCopy: { flex: 1, minWidth: 0, paddingVertical: 16, paddingLeft: 18, gap: 2 },
    directionName: { color: C.text, fontSize: 30, lineHeight: 36, fontWeight: '700' },
    arrow: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hero: {
      borderRadius: 22,
      borderWidth: 1,
      backgroundColor: C.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    heroBar: { width: 4, alignSelf: 'stretch' },
    heroContent: { flex: 1, paddingHorizontal: 18, paddingVertical: 16, gap: 2 },
    heroTo: { fontSize: 20, lineHeight: 25, fontStyle: 'italic' },
    heroName: {
      color: C.text,
      fontSize: 34,
      lineHeight: 42,
      fontWeight: '700',
      padding: 0,
      margin: 0,
      ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null),
    },
    heroBadges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
    heroPencil: { marginLeft: 'auto' },
    badge: {
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      paddingHorizontal: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    badgeText: { fontSize: 13, fontWeight: '900' },
    sectionLabel: {
      color: C.textFaint,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '900',
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      marginTop: 10,
      marginLeft: 4,
    },
    group: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      overflow: 'hidden',
    },
    groupRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    addIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    remove: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.surfaceHigh,
    },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    suggestion: {
      height: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: C.borderStrong,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
    },
    suggestionNumber: { color: C.text, fontSize: 14, fontWeight: '900' },
    suggestionText: { color: C.textDim, fontSize: 13, flexShrink: 1 },
    locate: {
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      paddingHorizontal: 14,
    },
    locateText: { color: C.text, fontSize: 14, fontWeight: '700' },
    timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50 },
    timelineRail: { width: 18, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
    timelineLine: { position: 'absolute', top: 0, bottom: 0, width: 2 },
    timelineLineFirst: { top: '50%' },
    timelineLineLast: { bottom: '50%' },
    timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
    timelineDotEdge: { width: 16, height: 16, borderRadius: 8 },
    timelineName: { flex: 1, color: C.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
    timelineSaved: { color: C.textDim },
    timelineCode: { color: C.textFaint, fontSize: 11, fontWeight: '700' },
    footer: {
      width: '100%',
      maxWidth: MaxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      backgroundColor: C.bg,
    },
    primary: {
      height: 54,
      borderRadius: 27,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'stretch',
    },
    primaryText: { fontSize: 16, fontWeight: '900' },
    secondaryButton: {
      height: 46,
      borderRadius: 23,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    secondaryText: { color: C.textDim, fontSize: 15, fontWeight: '700' },
    deleteButton: {
      marginTop: 18,
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    deleteText: { fontSize: 15, fontWeight: '700' },
    errorRow: { alignItems: 'center', gap: 8, paddingVertical: 24 },
    errorText: { color: C.textDim, fontSize: 14, textAlign: 'center' },
    done: {
      flex: 1,
      width: '100%',
      maxWidth: MaxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    doneIcon: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    doneTitle: { color: C.text, fontSize: 26, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
    doneNote: { color: C.textDim, fontSize: 15, lineHeight: 21, textAlign: 'center' },
    doneActions: { alignSelf: 'stretch', gap: 6, marginTop: 18 },
  });
}

const getStyles = createThemedStyles(createStyles);

function useStyles() {
  return getStyles(useAppColors());
}
