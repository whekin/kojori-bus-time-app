import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

import {
    BAKED_AT,
    BAKED_POLYLINES,
    BAKED_SCHEDULES,
    BAKED_STOP_NAMES,
    BAKED_STOPS,
} from '@/assets/ttc-baked';

import {
    ALL_KOJORI_STOPS,
    ALL_TBILISI_STOPS,
    BusLine,
    decodeGooglePolyline,
    fetchRoutePolyline,
    fetchRoutePolylineFromStops,
    fetchRouteStops,
    fetchSchedule,
    PolylinePoint,
    RouteGeometrySource,
    ROUTES,
    SchedulePeriod,
    StopInfo,
} from '@/services/ttc';

type Direction = 'toKojori' | 'toTbilisi';
export type TtcOfflineDataset = 'schedules' | 'routeStops' | 'polylines';

interface CacheEnvelope<T> {
  cachedAt: number;
  data: T;
}

export interface CachedRoutePolylines {
  version: 3;
  polylines: Record<BusLine, PolylinePoint[]>;
  source: RouteGeometrySource;
}

export interface TtcDatasetSyncState {
  dataset: TtcOfflineDataset;
  cachedParts: number;
  totalParts: number;
  lastCacheSyncAt: number | null;
  effectiveUpdatedAt: number | null;
  source: 'cache' | 'bundled' | 'partial-cache';
}

export type TtcDatasetSyncMap = Record<TtcOfflineDataset, TtcDatasetSyncState>;

export interface TtcOfflineSnapshot {
  status: 'idle' | 'hydrating' | 'warming' | 'ready' | 'partial';
  completedSteps: number;
  totalSteps: number;
  availableDatasets: number;
  totalDatasets: number;
  lastHydratedAt: number | null;
  lastSyncAt: number | null;
  oldestEffectiveSyncAt: number | null;
  datasetSync: TtcDatasetSyncMap;
  error: string | null;
  activeDataset: TtcOfflineDataset | null;
  activeDatasetStep: number;
  activeRequestLabel: string | null;
  completedRequests: number;
  totalRequests: number;
  syncStartedAt: number | null;
  nextRequestAt: number | null;
  lastCompletedDataset: TtcOfflineDataset | null;
}

type TtcOfflineRequest = {
  label: string;
  run: () => Promise<void>;
};

type TtcThrottleState = {
  apiCallsMade: number;
};

export const SCHEDULE_CACHE_TTL = 12 * 60 * 60 * 1000;
export const ROUTE_STOPS_CACHE_TTL = 24 * 60 * 60 * 1000;
export const ROUTE_POLYLINES_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
export const STOP_NAMES_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
export const TTC_OFFLINE_AUTO_REFRESH_INTERVAL = 7 * 24 * 60 * 60 * 1000;
export const TTC_OFFLINE_THROTTLE_MS = 0;

const STOP_NAMES_CACHE_KEY = '@ttc_stop_names_v2';
const ROUTE_PATTERN_PAIRS = [
  { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toKojori },
  { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toTbilisi },
  { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toKojori },
  { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toTbilisi },
] as const;
const DIRECTIONS: Direction[] = ['toKojori', 'toTbilisi'];
const TOTAL_OFFLINE_DATASETS = 3;
const TOTAL_OFFLINE_STEPS = 3;
const BAKED_AT_MS = new Date(BAKED_AT).getTime();
let throttleMs = TTC_OFFLINE_THROTTLE_MS;

function buildDatasetSyncState(dataset: TtcOfflineDataset, cachedAtValues: (number | null)[]): TtcDatasetSyncState {
  const cachedValues = cachedAtValues.filter((value): value is number => typeof value === 'number');

  if (cachedValues.length === cachedAtValues.length) {
    return {
      dataset,
      cachedParts: cachedValues.length,
      totalParts: cachedAtValues.length,
      lastCacheSyncAt: Math.min(...cachedValues),
      effectiveUpdatedAt: Math.min(...cachedValues),
      source: 'cache',
    };
  }

  if (cachedValues.length > 0) {
    return {
      dataset,
      cachedParts: cachedValues.length,
      totalParts: cachedAtValues.length,
      lastCacheSyncAt: Math.max(...cachedValues),
      effectiveUpdatedAt: Math.max(...cachedValues),
      source: 'partial-cache',
    };
  }

  return {
    dataset,
    cachedParts: 0,
    totalParts: cachedAtValues.length,
    lastCacheSyncAt: null,
    effectiveUpdatedAt: BAKED_AT_MS,
    source: 'bundled',
  };
}

function createBundledDatasetSync(): TtcDatasetSyncMap {
  return {
    schedules: buildDatasetSyncState('schedules', [null, null, null, null]),
    routeStops: buildDatasetSyncState('routeStops', [null, null]),
    polylines: buildDatasetSyncState('polylines', [null, null]),
  };
}

const listeners = new Set<() => void>();
let snapshot: TtcOfflineSnapshot = {
  status: 'idle',
  completedSteps: 0,
  totalSteps: TOTAL_OFFLINE_STEPS,
  availableDatasets: 0,
  totalDatasets: TOTAL_OFFLINE_DATASETS,
  lastHydratedAt: null,
  lastSyncAt: null,
  oldestEffectiveSyncAt: null,
  datasetSync: createBundledDatasetSync(),
  error: null,
  activeDataset: null,
  activeDatasetStep: 0,
  activeRequestLabel: null,
  completedRequests: 0,
  totalRequests: 0,
  syncStartedAt: null,
  nextRequestAt: null,
  lastCompletedDataset: null,
};

function emit() {
  listeners.forEach(listener => listener());
}

function updateSnapshot(patch: Partial<TtcOfflineSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function scheduleCacheKey(routeId: string, patternSuffix: string) {
  return `@ttc_schedule_${routeId}_${patternSuffix.replace(':', '_')}`;
}

function routeStopsCacheKey(direction: Direction) {
  return `@ttc_route_stops_${direction}`;
}

function routePolylinesCacheKey(direction: Direction) {
  return `@ttc_route_polylines_v3_${direction}`;
}

function createEmptyProgressPatch() {
  return {
    activeDataset: null,
    activeDatasetStep: 0,
    activeRequestLabel: null,
    completedRequests: 0,
    totalRequests: 0,
    syncStartedAt: null,
    nextRequestAt: null,
  } satisfies Partial<TtcOfflineSnapshot>;
}

function createThrottleState(): TtcThrottleState {
  return { apiCallsMade: 0 };
}

function formatDirectionLabel(direction: Direction) {
  return direction === 'toKojori' ? 'to Kojori' : 'to Tbilisi';
}

function formatRouteRequestLabel(bus: BusLine, direction: Direction) {
  return `${bus} ${formatDirectionLabel(direction)}`;
}

function routePatternToLabel(routeId: string, patternSuffix: string) {
  const entry = Object.entries(ROUTES).find(([, route]) => route.id === routeId);
  if (!entry) return `${routeId} ${patternSuffix}`;
  const [bus, route] = entry as [BusLine, (typeof ROUTES)[BusLine]];
  const direction = route.toKojori === patternSuffix ? 'toKojori' : 'toTbilisi';
  return formatRouteRequestLabel(bus, direction);
}

function bakedScheduleKey(routeId: string, patternSuffix: string) {
  const routeEntry = Object.entries(ROUTES).find(([, route]) => route.id === routeId);
  if (!routeEntry) return null;

  const [bus, route] = routeEntry as [BusLine, (typeof ROUTES)[BusLine]];
  const direction = route.toKojori === patternSuffix
    ? 'toKojori'
    : route.toTbilisi === patternSuffix
      ? 'toTbilisi'
      : null;

  return direction ? `${bus}_${direction}` : null;
}

async function readEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

async function writeEnvelope<T>(key: string, data: T) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, cachedAt: Date.now() } satisfies CacheEnvelope<T>));
  } catch {}
}

function isFresh(cachedAt: number, ttl: number) {
  return Date.now() - cachedAt < ttl;
}

async function readCachedData<T>(key: string, ttl: number, acceptStale = false): Promise<T | null> {
  const envelope = await readEnvelope<T>(key);
  if (!envelope) return null;
  if (!acceptStale && !isFresh(envelope.cachedAt, ttl)) return null;
  return envelope.data;
}

async function readCachedAt(key: string): Promise<number | null> {
  const envelope = await readEnvelope<unknown>(key);
  return envelope?.cachedAt ?? null;
}

function buildStopNamesQueryData(names: Record<string, string>) {
  return Object.entries(names).map(([stopId, name]) => ({
    queryKey: ['stop', stopId] as const,
    data: { id: stopId, name },
  }));
}

function dedupeStops(stops: StopInfo[]) {
  const seen = new Set<string>();
  return stops.filter(stop => {
    if (seen.has(stop.id)) return false;
    seen.add(stop.id);
    return true;
  });
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function runThrottledRequests(
  requests: TtcOfflineRequest[],
  throttleState: TtcThrottleState,
) {
  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;

  updateSnapshot({
    activeRequestLabel: null,
    completedRequests: 0,
    totalRequests: requests.length,
    nextRequestAt: null,
  });

  for (const request of requests) {
    if (throttleState.apiCallsMade > 0 && throttleMs > 0) {
      updateSnapshot({
        activeRequestLabel: request.label,
        nextRequestAt: Date.now() + throttleMs,
      });
      await delay(throttleMs);
    }

    throttleState.apiCallsMade += 1;
    updateSnapshot({
      activeRequestLabel: request.label,
      nextRequestAt: null,
    });

    try {
      await request.run();
      succeeded += 1;
    } catch (error) {
      failed += 1;
      errors.push(error instanceof Error ? error.message : request.label);
    } finally {
      updateSnapshot({
        completedRequests: snapshot.completedRequests + 1,
      });
    }
  }

  updateSnapshot({ nextRequestAt: null });

  return { succeeded, failed, errors };
}

function appendRequestErrors(dataset: TtcOfflineDataset, errors: string[]) {
  if (errors.length === 0) return;

  const summary = `${dataset}: ${errors.slice(0, 2).join('; ')}${errors.length > 2 ? `; +${errors.length - 2} more` : ''}`;
  updateSnapshot({
    error: snapshot.error ? `${snapshot.error}; ${summary}` : summary,
  });
}

async function refreshStep(
  dataset: TtcOfflineDataset,
  run: () => Promise<boolean>,
  stepIndex: number,
) {
  updateSnapshot({
    activeDataset: dataset,
    activeDatasetStep: stepIndex,
    activeRequestLabel: null,
    completedRequests: 0,
    totalRequests: 0,
    nextRequestAt: null,
    lastCompletedDataset: null,
  });

  try {
    await run();
    updateSnapshot({
      completedSteps: stepIndex,
      error: snapshot.error,
      lastCompletedDataset: dataset,
    });
  } catch (error) {
    const nextError = error instanceof Error ? error.message : `Could not refresh ${dataset}`;
    updateSnapshot({
      completedSteps: stepIndex,
      error: snapshot.error ? `${snapshot.error}; ${nextError}` : nextError,
    });
  }
}

async function loadAvailability() {
  const [scheduleCachedAtValues, routeStopCachedAtValues, polylineCachedAtValues] = await Promise.all([
    Promise.all(ROUTE_PATTERN_PAIRS.map(pair => readCachedAt(scheduleCacheKey(pair.routeId, pair.patternSuffix)))),
    Promise.all(DIRECTIONS.map(direction => readCachedAt(routeStopsCacheKey(direction)))),
    Promise.all(DIRECTIONS.map(direction => readCachedAt(routePolylinesCacheKey(direction)))),
  ]);

  const datasetSync = {
    schedules: buildDatasetSyncState('schedules', scheduleCachedAtValues),
    routeStops: buildDatasetSyncState('routeStops', routeStopCachedAtValues),
    polylines: buildDatasetSyncState('polylines', polylineCachedAtValues),
  } satisfies TtcDatasetSyncMap;

  const availability = {
    schedules: true,
    routeStops: true,
    polylines: true,
  } satisfies Record<TtcOfflineDataset, boolean>;

  const availableDatasets = Object.values(availability).filter(Boolean).length;
  const oldestEffectiveSyncAt = Object.values(datasetSync)
    .map(dataset => dataset.effectiveUpdatedAt)
    .filter((value): value is number => typeof value === 'number')
    .sort((a, b) => a - b)[0] ?? null;
  const lastSyncAt = oldestEffectiveSyncAt;

  return { availability, availableDatasets, lastSyncAt, oldestEffectiveSyncAt, datasetSync };
}

export function subscribeTtcOfflineStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTtcOfflineSnapshot() {
  return snapshot;
}

/** True when today's date is covered by at least one baked schedule's serviceDates. */
export function isBakedScheduleCurrent(): boolean {
  const today = new Date().toISOString().split('T')[0];
  return Object.values(BAKED_SCHEDULES).some((periods: unknown) =>
    (periods as { serviceDates: string[] }[]).some(p => p.serviceDates.includes(today)),
  );
}

/**
 * Seeds the query cache from the baked asset. Zero network, zero AsyncStorage.
 * Called before hydrateTtcOfflineData so live/cached data can override baked.
 */
export function loadBakedData(client: QueryClient) {
  // Schedules
  for (const [key, periods] of Object.entries(BAKED_SCHEDULES)) {
    const [bus, dir] = key.split('_') as [BusLine, Direction];
    const route = ROUTES[bus];
    const patternSuffix = route[dir];
    client.setQueryData(['schedule', route.id, patternSuffix], periods);
  }

  // Polylines
  for (const direction of ['toKojori', 'toTbilisi'] as Direction[]) {
    const polylines380 = decodeGooglePolyline(BAKED_POLYLINES[`380_${direction}`] ?? '');
    const polylines316 = decodeGooglePolyline(BAKED_POLYLINES[`316_${direction}`] ?? '');
    client.setQueryData(['route-polylines', direction, 'encoded'], {
      polylines: { '380': polylines380, '316': polylines316 },
      source: 'google-directions',
    });
  }

  // Stop names
  for (const [stopId, name] of Object.entries(BAKED_STOP_NAMES)) {
    client.setQueryData(['stop', stopId], { id: stopId, name });
  }

  // Route stops
  for (const direction of ['toKojori', 'toTbilisi'] as Direction[]) {
    type StopEntry = { stop: { id: string; name: string; lat?: number; lon?: number } };
    const stopsForDir380 = (BAKED_STOPS[`380_${direction}` as keyof typeof BAKED_STOPS] as unknown as StopEntry[]) ?? [];
    const stopsForDir316 = (BAKED_STOPS[`316_${direction}` as keyof typeof BAKED_STOPS] as unknown as StopEntry[]) ?? [];
    const merged = dedupeStops([
      ...stopsForDir380.map(s => ({ id: s.stop.id, label: s.stop.name, lat: s.stop.lat, lon: s.stop.lon })),
      ...stopsForDir316.map(s => ({ id: s.stop.id, label: s.stop.name, lat: s.stop.lat, lon: s.stop.lon })),
    ]);
    // TTC omits the actual first Tbilisi stop — prepend it
    if (direction === 'toKojori' && !merged.some(s => s.id === '1:2994')) {
      const firstTbilisiStop = ALL_TBILISI_STOPS.find(stop => stop.id === '1:2994');
      merged.unshift(firstTbilisiStop ?? { id: '1:2994', label: 'Elene Akhvlediani Street' });
    }
    client.setQueryData(['route-stops', direction], merged);
  }

  updateSnapshot({
    status: 'ready',
    availableDatasets: TOTAL_OFFLINE_DATASETS,
    lastSyncAt: BAKED_AT_MS,
    oldestEffectiveSyncAt: BAKED_AT_MS,
    datasetSync: createBundledDatasetSync(),
    lastCompletedDataset: null,
    ...createEmptyProgressPatch(),
  });
}

export function getBakedSchedule(routeId: string, patternSuffix: string): SchedulePeriod[] | null {
  const key = bakedScheduleKey(routeId, patternSuffix);
  if (!key) return null;
  return (BAKED_SCHEDULES[key as keyof typeof BAKED_SCHEDULES] as unknown as SchedulePeriod[] | undefined) ?? null;
}

export function getBakedRouteStops(direction: Direction): StopInfo[] {
  type StopEntry = { stop: { id: string; name: string; lat?: number; lon?: number } };

  const stopsForDir380 = (BAKED_STOPS[`380_${direction}` as keyof typeof BAKED_STOPS] as unknown as StopEntry[]) ?? [];
  const stopsForDir316 = (BAKED_STOPS[`316_${direction}` as keyof typeof BAKED_STOPS] as unknown as StopEntry[]) ?? [];
  const merged = dedupeStops([
    ...stopsForDir380.map(s => ({ id: s.stop.id, label: s.stop.name, lat: s.stop.lat, lon: s.stop.lon })),
    ...stopsForDir316.map(s => ({ id: s.stop.id, label: s.stop.name, lat: s.stop.lat, lon: s.stop.lon })),
  ]);

  if (direction === 'toKojori' && !merged.some(s => s.id === '1:2994')) {
    const firstTbilisiStop = ALL_TBILISI_STOPS.find(stop => stop.id === '1:2994');
    merged.unshift(firstTbilisiStop ?? { id: '1:2994', label: 'Elene Akhvlediani Street' });
  }

  return merged;
}

export function getBakedRoutePolylines(direction: Direction): CachedRoutePolylines {
  return {
    version: 3,
    polylines: {
      '380': decodeGooglePolyline(BAKED_POLYLINES[`380_${direction}`] ?? ''),
      '316': decodeGooglePolyline(BAKED_POLYLINES[`316_${direction}`] ?? ''),
    },
    source: 'google-directions',
  };
}

export function getBakedStopNames() {
  return {
    ...Object.fromEntries([...ALL_TBILISI_STOPS, ...ALL_KOJORI_STOPS].map(stop => [stop.id, stop.label])),
    ...BAKED_STOP_NAMES,
  };
}

export async function readScheduleCache(
  routeId: string,
  patternSuffix: string,
  acceptStale = false,
): Promise<SchedulePeriod[] | null> {
  return readCachedData(scheduleCacheKey(routeId, patternSuffix), SCHEDULE_CACHE_TTL, acceptStale);
}

export async function writeScheduleCache(routeId: string, patternSuffix: string, data: SchedulePeriod[]) {
  await writeEnvelope(scheduleCacheKey(routeId, patternSuffix), data);
}

export async function fetchRouteStopsForDirection(direction: Direction): Promise<StopInfo[]> {
  const stops380 = await fetchRouteStops(ROUTES['380'].id, ROUTES['380'][direction]);
  const stops316 = await fetchRouteStops(ROUTES['316'].id, ROUTES['316'][direction]);
  const merged = dedupeStops([...stops380, ...stops316]);
  // TTC omits the actual first Tbilisi stop (Elene Akhvlediani) — prepend it
  if (direction === 'toKojori' && !merged.some(s => s.id === '1:2994')) {
    const firstTbilisiStop = ALL_TBILISI_STOPS.find(stop => stop.id === '1:2994');
    merged.unshift(firstTbilisiStop ?? { id: '1:2994', label: 'Elene Akhvlediani Street' });
  }
  return merged;
}

export async function readRouteStopsCache(
  direction: Direction,
  acceptStale = false,
): Promise<StopInfo[] | null> {
  return readCachedData(routeStopsCacheKey(direction), ROUTE_STOPS_CACHE_TTL, acceptStale);
}

export async function writeRouteStopsCache(direction: Direction, data: StopInfo[]) {
  await writeEnvelope(routeStopsCacheKey(direction), data);
}

export async function fetchRoutePolylinesForDirection(
  direction: Direction,
): Promise<{
  polylines: Record<BusLine, PolylinePoint[]>;
  source: RouteGeometrySource;
}> {
  const result380 = await fetchRoutePolyline(ROUTES['380'].id, ROUTES['380'][direction]);
  const result316 = await fetchRoutePolyline(ROUTES['316'].id, ROUTES['316'][direction]);
  const entries: [BusLine, typeof result380][] = [['380', result380], ['316', result316]];

  const sources = entries.map(([, result]) => result.source);
  const source =
    sources.every(result => result === 'google-directions')
      ? 'google-directions'
      : sources.every(result => result === 'stops-fallback')
        ? 'stops-fallback'
        : 'hybrid-connected';

  return {
    polylines: Object.fromEntries(entries.map(([bus, result]) => [bus, result.points])) as Record<BusLine, PolylinePoint[]>,
    source,
  };
}

export async function fetchRoutePolylinesFromStopsForDirection(
  direction: Direction,
): Promise<{
  polylines: Record<BusLine, PolylinePoint[]>;
  source: RouteGeometrySource;
}> {
  const result380 = await fetchRoutePolylineFromStops(ROUTES['380'].id, ROUTES['380'][direction]);
  const result316 = await fetchRoutePolylineFromStops(ROUTES['316'].id, ROUTES['316'][direction]);
  return {
    polylines: { '380': result380.points, '316': result316.points },
    source: 'stops-fallback',
  };
}

export async function readRoutePolylinesCache(
  direction: Direction,
  acceptStale = false,
): Promise<CachedRoutePolylines | null> {
  return readCachedData(routePolylinesCacheKey(direction), ROUTE_POLYLINES_CACHE_TTL, acceptStale);
}

export async function writeRoutePolylinesCache(
  direction: Direction,
  data: CachedRoutePolylines,
) {
  await writeEnvelope(routePolylinesCacheKey(direction), data);
}

export async function readStopNameCache(acceptStale = false): Promise<Record<string, string>> {
  return (
    (await readCachedData<Record<string, string>>(STOP_NAMES_CACHE_KEY, STOP_NAMES_CACHE_TTL, acceptStale)) ??
    {}
  );
}

export async function writeStopNameCache(names: Record<string, string>) {
  await writeEnvelope(STOP_NAMES_CACHE_KEY, names);
}

export async function writeStopName(stopId: string, name: string) {
  const cached = await readStopNameCache(true);
  await writeStopNameCache({ ...cached, [stopId]: name });
}

export async function readCachedStopName(stopId: string, acceptStale = false) {
  const cached = await readStopNameCache(acceptStale);
  return cached[stopId];
}

export async function hydrateTtcOfflineData(client: QueryClient) {
  updateSnapshot({
    status: 'hydrating',
    completedSteps: 0,
    totalSteps: TOTAL_OFFLINE_STEPS,
    totalDatasets: TOTAL_OFFLINE_DATASETS,
    error: null,
    lastCompletedDataset: null,
    ...createEmptyProgressPatch(),
  });

  const [schedules, routeStops, polylines, stopNames] = await Promise.all([
    Promise.all(
      ROUTE_PATTERN_PAIRS.map(async pair => ({
        ...pair,
        data: await readScheduleCache(pair.routeId, pair.patternSuffix, true),
      })),
    ),
    Promise.all(
      DIRECTIONS.map(async direction => ({
        direction,
        data: await readRouteStopsCache(direction, true),
      })),
    ),
    Promise.all(
      DIRECTIONS.map(async direction => ({
        direction,
        data: await readRoutePolylinesCache(direction, true),
      })),
    ),
    readStopNameCache(true),
  ]);

  schedules.forEach(({ routeId, patternSuffix, data }) => {
    if (data) client.setQueryData(['schedule', routeId, patternSuffix], data);
  });

  routeStops.forEach(({ direction, data }) => {
    if (data) client.setQueryData(['route-stops', direction], data);
  });

  polylines.forEach(({ direction, data }) => {
    if (data) {
      client.setQueryData(['route-polylines', direction], data);
    }
  });

  buildStopNamesQueryData(stopNames).forEach(entry => {
    client.setQueryData(entry.queryKey, entry.data);
  });

  const { availableDatasets, lastSyncAt, oldestEffectiveSyncAt, datasetSync } = await loadAvailability();
  updateSnapshot({
    status: availableDatasets === TOTAL_OFFLINE_DATASETS ? 'ready' : 'partial',
    availableDatasets,
    lastHydratedAt: Date.now(),
    lastSyncAt,
    oldestEffectiveSyncAt,
    datasetSync,
  });
}

async function refreshSchedules(
  client: QueryClient,
  force: boolean,
  throttleState: TtcThrottleState,
) {
  let anySucceeded = false;
  const requests: TtcOfflineRequest[] = [];

  for (const pair of ROUTE_PATTERN_PAIRS) {
    const fresh = force ? null : await readScheduleCache(pair.routeId, pair.patternSuffix);
    if (fresh) {
      client.setQueryData(['schedule', pair.routeId, pair.patternSuffix], fresh);
      anySucceeded = true;
      continue;
    }

    requests.push({
      label: routePatternToLabel(pair.routeId, pair.patternSuffix),
      run: async () => {
        const data = await fetchSchedule(pair.routeId, pair.patternSuffix);
        await writeScheduleCache(pair.routeId, pair.patternSuffix, data);
        client.setQueryData(['schedule', pair.routeId, pair.patternSuffix], data);
        anySucceeded = true;
      },
    });
  }

  const result = await runThrottledRequests(requests, throttleState);
  appendRequestErrors('schedules', result.errors);
  if (!anySucceeded) throw new Error('Could not refresh schedules');
}

async function refreshRouteStops(
  client: QueryClient,
  force: boolean,
  throttleState: TtcThrottleState,
) {
  let anySucceeded = false;
  const requests: TtcOfflineRequest[] = [];
  const pending = new Map<Direction, Partial<Record<BusLine, StopInfo[]>>>();
  const requestedDirections = new Set<Direction>();

  for (const direction of DIRECTIONS) {
    const fresh = force ? null : await readRouteStopsCache(direction);
    if (fresh) {
      client.setQueryData(['route-stops', direction], fresh);
      anySucceeded = true;
      continue;
    }

    requestedDirections.add(direction);
    pending.set(direction, {});

    (['380', '316'] as BusLine[]).forEach(bus => {
      requests.push({
        label: `${formatRouteRequestLabel(bus, direction)} stops`,
        run: async () => {
          const data = await fetchRouteStops(ROUTES[bus].id, ROUTES[bus][direction]);
          pending.set(direction, { ...pending.get(direction), [bus]: data });
        },
      });
    });
  }

  const result = await runThrottledRequests(requests, throttleState);
  appendRequestErrors('routeStops', result.errors);

  for (const direction of requestedDirections) {
    const results = pending.get(direction);
    const stops380 = results?.['380'];
    const stops316 = results?.['316'];

    if (stops380 && stops316) {
      const data = dedupeStops([...stops380, ...stops316]);
      if (direction === 'toKojori' && !data.some(s => s.id === '1:2994')) {
        const firstTbilisiStop = ALL_TBILISI_STOPS.find(stop => stop.id === '1:2994');
        data.unshift(firstTbilisiStop ?? { id: '1:2994', label: 'Elene Akhvlediani Street' });
      }
      await writeRouteStopsCache(direction, data);
      client.setQueryData(['route-stops', direction], data);
      anySucceeded = true;
    }
  }

  if (!anySucceeded) throw new Error('Could not refresh route stops');
}

async function refreshPolylines(
  client: QueryClient,
  force: boolean,
  throttleState: TtcThrottleState,
) {
  let anySucceeded = false;
  const requests: TtcOfflineRequest[] = [];
  const pending = new Map<Direction, Partial<Record<BusLine, Awaited<ReturnType<typeof fetchRoutePolyline>>>>>();
  const requestedDirections = new Set<Direction>();

  for (const direction of DIRECTIONS) {
    const fresh = force ? null : await readRoutePolylinesCache(direction);
    if (fresh) {
      client.setQueryData(['route-polylines', direction], fresh);
      anySucceeded = true;
      continue;
    }

    requestedDirections.add(direction);
    pending.set(direction, {});

    (['380', '316'] as BusLine[]).forEach(bus => {
      requests.push({
        label: `${formatRouteRequestLabel(bus, direction)} map line`,
        run: async () => {
          const data = await fetchRoutePolyline(ROUTES[bus].id, ROUTES[bus][direction]);
          pending.set(direction, { ...pending.get(direction), [bus]: data });
        },
      });
    });
  }

  const result = await runThrottledRequests(requests, throttleState);
  appendRequestErrors('polylines', result.errors);

  for (const direction of requestedDirections) {
    const results = pending.get(direction);
    const result380 = results?.['380'];
    const result316 = results?.['316'];

    if (result380 && result316) {
      const sources = [result380.source, result316.source];
      const source = sources.every(result => result === 'google-directions')
        ? 'google-directions'
        : sources.every(result => result === 'stops-fallback')
          ? 'stops-fallback'
          : 'hybrid-connected';
      const data = {
        version: 3,
        polylines: { '380': result380.points, '316': result316.points },
        source,
      } satisfies CachedRoutePolylines;
      await writeRoutePolylinesCache(direction, data);
      client.setQueryData(['route-polylines', direction], data);
      anySucceeded = true;
    }
  }

  if (!anySucceeded) throw new Error('Could not refresh route polylines');
}

async function refreshDataset(
  client: QueryClient,
  dataset: TtcOfflineDataset,
  force: boolean,
  throttleState: TtcThrottleState,
) {
  switch (dataset) {
    case 'schedules':
      await refreshSchedules(client, force, throttleState);
      break;
    case 'routeStops':
      await refreshRouteStops(client, force, throttleState);
      break;
    case 'polylines':
      await refreshPolylines(client, force, throttleState);
      break;
  }
}

async function finishRefresh() {
  const { availableDatasets, lastSyncAt, oldestEffectiveSyncAt, datasetSync } = await loadAvailability();
  updateSnapshot({
    status: availableDatasets === TOTAL_OFFLINE_DATASETS ? 'ready' : 'partial',
    availableDatasets,
    lastSyncAt,
    oldestEffectiveSyncAt,
    datasetSync,
    activeDataset: null,
    activeDatasetStep: 0,
    activeRequestLabel: null,
    nextRequestAt: null,
  });
}

export async function refreshTtcOfflineDataset(
  client: QueryClient,
  dataset: TtcOfflineDataset,
  options: { force?: boolean } = {},
) {
  updateSnapshot({
    status: 'warming',
    completedSteps: 0,
    totalSteps: 1,
    error: null,
    syncStartedAt: Date.now(),
    lastCompletedDataset: null,
  });

  const throttleState = createThrottleState();
  await refreshStep(
    dataset,
    async () => {
      await refreshDataset(client, dataset, options.force ?? false, throttleState);
      return true;
    },
    1,
  );

  await finishRefresh();
}

/**
 * Gradually refreshes all offline datasets, throttling every TTC API request.
 * Cached data is used without delay unless force is enabled.
 */
export async function warmTtcOfflineData(
  client: QueryClient,
  options: { force?: boolean; skipFreshMs?: number } = {},
) {
  const throttleState = createThrottleState();
  const force = options.force ?? false;
  const startedAt = Date.now();
  const initialDatasetSync = force && options.skipFreshMs
    ? (await loadAvailability()).datasetSync
    : null;

  function shouldForceDataset(dataset: TtcOfflineDataset) {
    if (!force) return false;
    if (!options.skipFreshMs || !initialDatasetSync) return true;

    const sync = initialDatasetSync[dataset];
    return !(
      sync.source === 'cache' &&
      typeof sync.effectiveUpdatedAt === 'number' &&
      startedAt - sync.effectiveUpdatedAt < options.skipFreshMs
    );
  }

  updateSnapshot({
    status: 'warming',
    completedSteps: 0,
    totalSteps: TOTAL_OFFLINE_STEPS,
    error: null,
    syncStartedAt: Date.now(),
    lastCompletedDataset: null,
  });

  await refreshStep(
    'schedules',
    async () => {
      await refreshSchedules(client, shouldForceDataset('schedules'), throttleState);
      return true;
    },
    1,
  );

  await refreshStep(
    'routeStops',
    async () => {
      await refreshRouteStops(client, shouldForceDataset('routeStops'), throttleState);
      return true;
    },
    2,
  );

  await refreshStep(
    'polylines',
    async () => {
      await refreshPolylines(client, shouldForceDataset('polylines'), throttleState);
      return true;
    },
    3,
  );

  await finishRefresh();
}

export async function clearAllTtcCache(client: QueryClient) {
  await AsyncStorage.clear();
  client.clear();
  updateSnapshot({
    status: 'idle',
    completedSteps: 0,
    totalSteps: 0,
    availableDatasets: 0,
    totalDatasets: TOTAL_OFFLINE_DATASETS,
    lastHydratedAt: null,
    lastSyncAt: null,
    oldestEffectiveSyncAt: null,
    datasetSync: createBundledDatasetSync(),
    error: null,
    lastCompletedDataset: null,
    ...createEmptyProgressPatch(),
  });
}

export function __setTtcOfflineThrottleMsForTests(ms: number) {
  throttleMs = ms;
}

export function __resetTtcOfflineStateForTests() {
  throttleMs = TTC_OFFLINE_THROTTLE_MS;
  snapshot = {
    status: 'idle',
    completedSteps: 0,
    totalSteps: TOTAL_OFFLINE_STEPS,
    availableDatasets: 0,
    totalDatasets: TOTAL_OFFLINE_DATASETS,
    lastHydratedAt: null,
    lastSyncAt: null,
    oldestEffectiveSyncAt: null,
    datasetSync: createBundledDatasetSync(),
    error: null,
    activeDataset: null,
    activeDatasetStep: 0,
    activeRequestLabel: null,
    completedRequests: 0,
    totalRequests: 0,
    syncStartedAt: null,
    nextRequestAt: null,
    lastCompletedDataset: null,
  };
  emit();
}
