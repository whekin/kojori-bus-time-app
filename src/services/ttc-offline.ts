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
    fetchStopDetails,
    PolylinePoint,
    RouteGeometrySource,
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

const THROTTLE_MS = 30_000;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
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

  updateSnapshot({ status: 'ready', availableDatasets: TOTAL_OFFLINE_DATASETS, lastSyncAt: new Date(BAKED_AT).getTime() });
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

/**
 * Gradually refreshes all offline datasets, throttling API calls to avoid
 * TTC rate limiting. Each network request is separated by THROTTLE_MS.
 * Cached data is used without delay; only actual fetches incur the wait.
 */
export async function warmTtcOfflineData(client: QueryClient) {
  let apiCallsMade = 0;

  async function throttledFetch<T>(fn: () => Promise<T>): Promise<T> {
    if (apiCallsMade > 0) await delay(THROTTLE_MS);
    apiCallsMade++;
    return fn();
  }

  updateSnapshot({
    status: 'warming',
    completedSteps: 0,
    totalSteps: TOTAL_OFFLINE_STEPS,
    error: null,
  });

  // Step 1: Schedules (4 route/pattern pairs, each may need 1 API call)
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

          const data = await throttledFetch(() => fetchSchedule(pair.routeId, pair.patternSuffix));
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

  // Step 2: Route stops (2 directions, each fetches 2 routes internally)
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

          const data = await throttledFetch(() => fetchRouteStopsForDirection(direction));
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

  // Step 3: Polylines (2 directions, each fetches 2 routes internally)
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

          const data = await throttledFetch(() => fetchRoutePolylinesForDirection(direction));
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

  // Step 4: Stop names (batch, but throttled per call)
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

      const nextNames = { ...freshNames };
      let anyFetched = false;

      for (const id of missingStopIds) {
        try {
          const data = await throttledFetch(() => fetchStopDetails(id));
          nextNames[data.id] = data.name;
          client.setQueryData(['stop', data.id], data);
          anyFetched = true;
        } catch {}
      }

      if (anyFetched) {
        await writeStopNameCache(nextNames);
      }

      if (!anyFetched && missingStopIds.length > 0) {
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
  });
}
