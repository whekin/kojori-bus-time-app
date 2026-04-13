import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

import {
  ALL_KOJORI_STOPS,
  ALL_TBILISI_STOPS,
  BusLine,
  fetchRoutePolyline,
  RouteGeometrySource,
  fetchRouteStops,
  fetchSchedule,
  fetchStopDetails,
  PolylinePoint,
  ROUTES,
  SchedulePeriod,
  StopInfo,
} from '@/services/ttc';

type Direction = 'toKojori' | 'toTbilisi';
type OfflineDataset = 'schedules' | 'routeStops' | 'polylines' | 'stopNames';

interface CacheEnvelope<T> {
  cachedAt: number;
  data: T;
}

export interface CachedRoutePolylines {
  version: 3;
  polylines: Record<BusLine, PolylinePoint[]>;
  source: RouteGeometrySource;
}

export interface TtcOfflineSnapshot {
  status: 'idle' | 'hydrating' | 'warming' | 'ready' | 'partial';
  completedSteps: number;
  totalSteps: number;
  availableDatasets: number;
  totalDatasets: number;
  lastHydratedAt: number | null;
  lastSyncAt: number | null;
  error: string | null;
}

export const SCHEDULE_CACHE_TTL = 12 * 60 * 60 * 1000;
export const ROUTE_STOPS_CACHE_TTL = 24 * 60 * 60 * 1000;
export const ROUTE_POLYLINES_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
export const STOP_NAMES_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const STOP_NAMES_CACHE_KEY = '@ttc_stop_names_v2';
const ROUTE_PATTERN_PAIRS = [
  { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toKojori },
  { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toTbilisi },
  { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toKojori },
  { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toTbilisi },
] as const;
const DIRECTIONS: Direction[] = ['toKojori', 'toTbilisi'];
const IMPORTANT_STOP_IDS = [...new Set([...ALL_TBILISI_STOPS, ...ALL_KOJORI_STOPS].map(stop => stop.id))];
const TOTAL_OFFLINE_DATASETS = 4;
const TOTAL_OFFLINE_STEPS = 4;

const listeners = new Set<() => void>();
let snapshot: TtcOfflineSnapshot = {
  status: 'idle',
  completedSteps: 0,
  totalSteps: TOTAL_OFFLINE_STEPS,
  availableDatasets: 0,
  totalDatasets: TOTAL_OFFLINE_DATASETS,
  lastHydratedAt: null,
  lastSyncAt: null,
  error: null,
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

async function refreshStep(
  dataset: OfflineDataset,
  run: () => Promise<boolean>,
  stepIndex: number,
) {
  try {
    await run();
    updateSnapshot({
      completedSteps: stepIndex,
      error: snapshot.error,
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
  const [scheduleFlags, routeStopFlags, polylineFlags, stopNames, cachedAtValues] = await Promise.all([
    Promise.all(
      ROUTE_PATTERN_PAIRS.map(pair =>
        readEnvelope<SchedulePeriod[]>(scheduleCacheKey(pair.routeId, pair.patternSuffix)),
      ),
    ),
    Promise.all(DIRECTIONS.map(direction => readEnvelope<StopInfo[]>(routeStopsCacheKey(direction)))),
    Promise.all(
      DIRECTIONS.map(direction =>
        readEnvelope<CachedRoutePolylines>(routePolylinesCacheKey(direction)),
      ),
    ),
    readEnvelope<Record<string, string>>(STOP_NAMES_CACHE_KEY),
    Promise.all([
      ...ROUTE_PATTERN_PAIRS.map(pair => readCachedAt(scheduleCacheKey(pair.routeId, pair.patternSuffix))),
      ...DIRECTIONS.map(direction => readCachedAt(routeStopsCacheKey(direction))),
      ...DIRECTIONS.map(direction => readCachedAt(routePolylinesCacheKey(direction))),
      readCachedAt(STOP_NAMES_CACHE_KEY),
    ]),
  ]);

  const availability = {
    schedules: scheduleFlags.every(Boolean),
    routeStops: routeStopFlags.every(Boolean),
    polylines: polylineFlags.every(Boolean),
    stopNames: IMPORTANT_STOP_IDS.every(id => Boolean(stopNames?.data?.[id])),
  } satisfies Record<OfflineDataset, boolean>;

  const availableDatasets = Object.values(availability).filter(Boolean).length;
  const lastSyncAt = cachedAtValues.filter((value): value is number => typeof value === 'number').sort((a, b) => b - a)[0] ?? null;

  return { availability, availableDatasets, lastSyncAt };
}

export function subscribeTtcOfflineStatus(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTtcOfflineSnapshot() {
  return snapshot;
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
  return dedupeStops([...stops380, ...stops316]);
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

  const { availableDatasets, lastSyncAt } = await loadAvailability();
  updateSnapshot({
    status: availableDatasets === TOTAL_OFFLINE_DATASETS ? 'ready' : 'partial',
    availableDatasets,
    lastHydratedAt: Date.now(),
    lastSyncAt,
  });
}

export async function warmTtcOfflineData(client: QueryClient) {
  updateSnapshot({
    status: 'warming',
    completedSteps: 0,
    totalSteps: TOTAL_OFFLINE_STEPS,
    error: null,
  });

  await refreshStep(
    'schedules',
    async () => {
      let anySucceeded = false;
      for (const pair of ROUTE_PATTERN_PAIRS) {
        try {
          const fresh = await readScheduleCache(pair.routeId, pair.patternSuffix);
          if (fresh) {
            client.setQueryData(['schedule', pair.routeId, pair.patternSuffix], fresh);
            anySucceeded = true;
            continue;
          }

          const data = await fetchSchedule(pair.routeId, pair.patternSuffix);
          await writeScheduleCache(pair.routeId, pair.patternSuffix, data);
          client.setQueryData(['schedule', pair.routeId, pair.patternSuffix], data);
          anySucceeded = true;
        } catch {}
      }

      if (!anySucceeded) throw new Error('Could not refresh schedules');
      return true;
    },
    1,
  );

  await refreshStep(
    'routeStops',
    async () => {
      let anySucceeded = false;
      for (const direction of DIRECTIONS) {
        try {
          const fresh = await readRouteStopsCache(direction);
          if (fresh) {
            client.setQueryData(['route-stops', direction], fresh);
            anySucceeded = true;
            continue;
          }

          const data = await fetchRouteStopsForDirection(direction);
          await writeRouteStopsCache(direction, data);
          client.setQueryData(['route-stops', direction], data);
          anySucceeded = true;
        } catch {}
      }

      if (!anySucceeded) throw new Error('Could not refresh route stops');
      return true;
    },
    2,
  );

  await refreshStep(
    'polylines',
    async () => {
      let anySucceeded = false;
      for (const direction of DIRECTIONS) {
        try {
          const fresh = await readRoutePolylinesCache(direction);
          if (fresh) {
            client.setQueryData(['route-polylines', direction], fresh);
            anySucceeded = true;
            continue;
          }

          const data = await fetchRoutePolylinesForDirection(direction);
          await writeRoutePolylinesCache(direction, {
            version: 3,
            polylines: data.polylines,
            source: data.source,
          });
          client.setQueryData(['route-polylines', direction], {
            version: 3,
            polylines: data.polylines,
            source: data.source,
          });
          anySucceeded = true;
        } catch {}
      }

      if (!anySucceeded) throw new Error('Could not refresh route polylines');
      return true;
    },
    3,
  );

  await refreshStep(
    'stopNames',
    async () => {
      const freshNames = await readStopNameCache();
      const missingStopIds = IMPORTANT_STOP_IDS.filter(id => !freshNames[id]);

      if (missingStopIds.length === 0) {
        buildStopNamesQueryData(freshNames).forEach(entry => {
          client.setQueryData(entry.queryKey, entry.data);
        });
        return true;
      }

      const results = await Promise.allSettled(missingStopIds.map(id => fetchStopDetails(id)));
      const nextNames = { ...freshNames };

      results.forEach(result => {
        if (result.status === 'fulfilled') {
          nextNames[result.value.id] = result.value.name;
          client.setQueryData(['stop', result.value.id], result.value);
        }
      });

      if (Object.keys(nextNames).length > Object.keys(freshNames).length) {
        await writeStopNameCache(nextNames);
      }

      if (results.length > 0 && results.every(result => result.status === 'rejected')) {
        throw new Error('Could not refresh stop names');
      }

      buildStopNamesQueryData(nextNames).forEach(entry => {
        client.setQueryData(entry.queryKey, entry.data);
      });

      return true;
    },
    4,
  );

  const { availableDatasets, lastSyncAt } = await loadAvailability();
  updateSnapshot({
    status: availableDatasets === TOTAL_OFFLINE_DATASETS ? 'ready' : 'partial',
    availableDatasets,
    lastSyncAt,
  });
}
