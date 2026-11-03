// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { BAKED_AT } from '@/assets/ttc-baked';
import type { TtcOfflineSnapshot } from './ttc-offline';

const storage = new Map<string, string>();

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
    getAllKeys: async () => [...storage.keys()],
    multiGet: async (keys: string[]) => keys.map(key => [key, storage.get(key) ?? null]),
    multiRemove: async (keys: string[]) => {
      keys.forEach(key => storage.delete(key));
    },
    clear: async () => {
      storage.clear();
    },
  },
}));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function writeEnvelope(key: string, cachedAt: number, data: unknown = []) {
  storage.set(key, JSON.stringify({ cachedAt, data }));
}

function installFetchMock(failScheduleOnce = false) {
  let scheduleCalls = 0;
  let stopDetailCalls = 0;
  let fetchCalls = 0;

  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    fetchCalls += 1;
    const url = String(input);

    if (url.includes('/schedule?')) {
      scheduleCalls += 1;
      if (failScheduleOnce && scheduleCalls === 1) {
        return new Response('broken', { status: 500 });
      }
      return Response.json([]);
    }

    if (url.includes('/stops-of-patterns?')) {
      return Response.json([
        { stop: { id: '1:999', name: 'Mock stop', lat: 41.7, lon: 44.8 } },
      ]);
    }

    if (url.includes('/polylines?')) {
      const suffix = new URL(url).searchParams.get('patternSuffixes') ?? '0:01';
      return Response.json({ [suffix]: { encodedValue: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' } });
    }

    if (url.includes('/v2/stops/')) {
      stopDetailCalls += 1;
      const id = url.match(/\/v2\/stops\/([^?]+)/)?.[1] ?? '1:999';
      return Response.json({ id, name: `Stop ${id}` });
    }

    return Response.json({});
  }) as unknown as typeof fetch;

  return {
    fetchCalls: () => fetchCalls,
    scheduleCalls: () => scheduleCalls,
    stopDetailCalls: () => stopDetailCalls,
  };
}

describe('ttc offline sync progress', () => {
  let offline: typeof import('./ttc-offline');

  beforeEach(async () => {
    storage.clear();
    installFetchMock();
    offline = await import('./ttc-offline');
    offline.__resetTtcOfflineStateForTests();
    offline.__setTtcOfflineThrottleMsForTests(0);
  });

  afterEach(() => {
    offline.__resetTtcOfflineStateForTests();
    storage.clear();
  });

  it('reports bundled freshness for every dataset when cache is empty', async () => {
    const client = makeQueryClient();
    const bakedAt = new Date(BAKED_AT).getTime();

    await offline.hydrateTtcOfflineData(client);

    const snapshot = offline.getTtcOfflineSnapshot();
    expect(snapshot.oldestEffectiveSyncAt).toBe(bakedAt);
    expect(snapshot.lastSyncAt).toBe(bakedAt);
    expect(Object.values(snapshot.datasetSync).map(sync => sync.source)).toEqual([
      'bundled',
      'bundled',
      'bundled',
    ]);
    expect(snapshot.datasetSync.schedules.effectiveUpdatedAt).toBe(bakedAt);
  });

  it('hydrates arbitrary-route downloads and removes them without deleting favorites', async () => {
    const transit = await import('@/transit/data');
    const client = makeQueryClient();
    const boarding = { route: { id: '1:R216088', shortName: '101', longName: 'Test', mode: 'BUS' }, pattern: { patternSuffix: '1:01', headsign: 'School' }, stop: { id: '1:2949', label: 'School' } };
    const options = transit.scheduleQuery(boarding);
    await client.fetchQuery(options);
    const restored = makeQueryClient();
    storage.set('@ttc_transit_v1:corrupt', JSON.stringify({ queryKey: ['transit', 'catalog', 'ka'], updatedAt: Date.now(), data: {} }));
    await transit.hydrateTransitCache(restored);
    expect(restored.getQueryData(options.queryKey)).toEqual([]);
    expect(restored.getQueryData(['transit', 'catalog', 'ka'])).toBeUndefined();
    storage.set('@kojori_favorites_v1', 'favorite-101');
    await offline.clearAllTtcCache(restored);
    expect(storage.get('@kojori_favorites_v1')).toBe('favorite-101');
    expect([...storage.keys()].some(key => key.startsWith('@ttc_transit_v1:'))).toBe(false);
  });

  it('does not mark old bundled or downloaded timetables fresh merely by hydrating them', async () => {
    const transit = await import('@/transit/data');
    const { ROUTES } = await import('./ttc');
    const route = ROUTES['380'];
    const client = makeQueryClient();
    offline.loadBakedData(client);
    const cachedAt = Date.parse('2026-05-01T00:00:00Z');
    writeEnvelope(`@ttc_schedule_${route.id}_0_01`, cachedAt, []);
    await offline.hydrateTtcOfflineData(client);
    await transit.hydrateTransitCache(client);
    expect(client.getQueryState(['transit', 'schedule', `${route.id}/0:01`])?.dataUpdatedAt).toBe(Date.parse(BAKED_AT));
    expect(client.getQueryData(['transit', 'schedule', `${route.id}/0:01`]).length).toBeGreaterThan(0);
    const newer = Date.parse(BAKED_AT) + 1000;
    writeEnvelope(`@ttc_schedule_${route.id}_0_01`, newer, []);
    await transit.hydrateTransitCache(client);
    expect(client.getQueryState(['transit', 'schedule', `${route.id}/0:01`])?.dataUpdatedAt).toBe(newer);
    expect(client.getQueryState(['transit', 'schedule', `${route.id}/1:01`])?.dataUpdatedAt).toBe(Date.parse(BAKED_AT));
  });

  it('clears transit cache while preserving settings, location and unrelated queries', async () => {
    const client = makeQueryClient();
    storage.set('@kojori_settings_v2', 'saved favorites');
    storage.set('@kojori_last_location_v1', 'saved location');
    storage.set('@ttc_schedule_old_route', 'old schedule');
    storage.set('@ttc_route_polylines_v2_toKojori', 'old geometry');
    storage.set('@ttc_stop_names_v1', 'old stop names');
    storage.set('@ttc_query_log_v1', 'diagnostic history');
    client.setQueryData(['schedule', 'route', 'pattern'], []);
    client.setQueryData(['arrivals', 'stop'], []);
    client.setQueryData(['unrelated'], 'keep');

    await offline.clearAllTtcCache(client);

    expect(storage.get('@kojori_settings_v2')).toBe('saved favorites');
    expect(storage.get('@kojori_last_location_v1')).toBe('saved location');
    expect(storage.has('@ttc_schedule_old_route')).toBe(false);
    expect(storage.has('@ttc_route_polylines_v2_toKojori')).toBe(false);
    expect(storage.has('@ttc_stop_names_v1')).toBe(false);
    expect(storage.get('@ttc_query_log_v1')).toBe('diagnostic history');
    expect(client.getQueryData(['schedule', 'route', 'pattern'])).toBeUndefined();
    expect(client.getQueryData(['arrivals', 'stop'])).toBeUndefined();
    expect(client.getQueryData(['unrelated'])).toBe('keep');
  });

  it('reports request progress for a forced schedule refresh', async () => {
    const client = makeQueryClient();
    const snapshots: TtcOfflineSnapshot[] = [];
    const unsubscribe = offline.subscribeTtcOfflineStatus(() => {
      snapshots.push({ ...offline.getTtcOfflineSnapshot() });
    });

    await offline.refreshTtcOfflineDataset(client, 'schedules', { force: true });
    unsubscribe();

    expect(snapshots.some(snapshot => snapshot.activeDataset === 'schedules')).toBe(true);
    expect(snapshots.some(snapshot => snapshot.totalRequests === 4)).toBe(true);
    expect(snapshots.some(snapshot => snapshot.completedRequests === 4)).toBe(true);
    expect(offline.getTtcOfflineSnapshot().lastCompletedDataset).toBe('schedules');
  });

  it('does not auto-refresh before hydration and coalesces concurrent startup checks', async () => {
    const client = makeQueryClient();
    expect(await offline.refreshTtcOfflineDataIfDue(client)).toBe(false);
    await offline.hydrateTtcOfflineData(client);
    const now = Math.max(Date.now(), new Date(BAKED_AT).getTime() + 8 * 24 * 60 * 60_000);
    const results = await Promise.all([
      offline.refreshTtcOfflineDataIfDue(client, now),
      offline.refreshTtcOfflineDataIfDue(client, now),
    ]);
    expect(results).toEqual([true, false]);
    expect(await offline.refreshTtcOfflineDataIfDue(client, now + 60_000)).toBe(false);
    expect(offline.getTtcOfflineSnapshot().scheduleRevision).toBeGreaterThan(1);
  });

  it('retries failed background refreshes after cooldown without discarding saved schedules', async () => {
    const client = makeQueryClient();
    await offline.hydrateTtcOfflineData(client);
    client.setQueryData(['schedule', 'saved'], ['offline timetable']);
    const now = Math.max(Date.now(), new Date(BAKED_AT).getTime() + 8 * 24 * 60 * 60_000);
    globalThis.fetch = mock(async () => new Response('unavailable', { status: 500 }));
    expect(await offline.refreshTtcOfflineDataIfDue(client, now)).toBe(true);
    expect(offline.getTtcOfflineSnapshot().error).not.toBeNull();
    expect(offline.getTtcOfflineSnapshot().scheduleRevision).toBe(1);
    expect(client.getQueryData(['schedule', 'saved'])).toEqual(['offline timetable']);
    expect(await offline.refreshTtcOfflineDataIfDue(client, now + 60_000)).toBe(false);
    installFetchMock();
    expect(await offline.refreshTtcOfflineDataIfDue(client, now + 5 * 60_000)).toBe(true);
    expect(offline.getTtcOfflineSnapshot().error).toBeNull();
    expect(offline.getTtcOfflineSnapshot().scheduleRevision).toBe(2);
  });

  it('clears downloaded schedules after an in-flight refresh finishes without losing favorites', async () => {
    const client = makeQueryClient();
    storage.set('@kojori_settings_v2', 'saved favorites');
    await Promise.all([
      offline.refreshTtcOfflineDataset(client, 'schedules', { force: true }),
      offline.clearAllTtcCache(client),
    ]);
    expect(storage.get('@kojori_settings_v2')).toBe('saved favorites');
    expect([...storage.keys()].filter(key => key !== '@ttc_query_log_v1')).toEqual(['@kojori_settings_v2']);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(offline.getTtcOfflineSnapshot().lastHydratedAt).toBeNull();
  });

  it('coalesces duplicate refreshes and queues different datasets', async () => {
    const client = makeQueryClient();
    const fetchMock = installFetchMock();
    await Promise.all([
      offline.refreshTtcOfflineDataset(client, 'schedules', { force: true }),
      offline.refreshTtcOfflineDataset(client, 'schedules', { force: true }),
    ]);
    expect(fetchMock.scheduleCalls()).toBe(4);
    expect(fetchMock.fetchCalls()).toBe(4);
    await Promise.all([
      offline.refreshTtcOfflineDataset(client, 'schedules', { force: true }),
      offline.warmTtcOfflineData(client),
    ]);
    expect(fetchMock.scheduleCalls()).toBe(8);
    expect(offline.getTtcOfflineSnapshot().datasetSync.routeStops.source).toBe('cache');
    expect(offline.getTtcOfflineSnapshot().datasetSync.polylines.source).toBe('cache');
  });

  it('updates only schedule freshness after a forced schedule refresh', async () => {
    const client = makeQueryClient();
    const bakedAt = new Date(BAKED_AT).getTime();

    await offline.refreshTtcOfflineDataset(client, 'schedules', { force: true });

    const snapshot = offline.getTtcOfflineSnapshot();
    expect(snapshot.datasetSync.schedules.source).toBe('cache');
    expect(snapshot.datasetSync.routeStops.source).toBe('bundled');
    expect(snapshot.datasetSync.polylines.source).toBe('bundled');
    expect(snapshot.oldestEffectiveSyncAt).toBe(bakedAt);
    expect(snapshot.lastSyncAt).toBe(bakedAt);
  });

  it('skips network requests when non-forced schedule cache is fresh', async () => {
    const client = makeQueryClient();
    const fetchMock = installFetchMock();
    const { ROUTES } = await import('./ttc');
    const pairs = [
      { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toKojori },
      { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toTbilisi },
      { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toKojori },
      { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toTbilisi },
    ];

    for (const pair of pairs) {
      await offline.writeScheduleCache(pair.routeId, pair.patternSuffix, []);
    }

    await offline.refreshTtcOfflineDataset(client, 'schedules');

    expect(fetchMock.fetchCalls()).toBe(0);
    expect(offline.getTtcOfflineSnapshot().totalRequests).toBe(0);
    expect(offline.getTtcOfflineSnapshot().lastCompletedDataset).toBe('schedules');
  });

  it('uses the oldest route-stop part timestamp when route-stop cache is complete', async () => {
    const client = makeQueryClient();
    const older = new Date('2026-05-01T08:00:00Z').getTime();
    const newer = new Date('2026-05-02T08:00:00Z').getTime();

    writeEnvelope('@ttc_route_stops_toKojori', older);
    writeEnvelope('@ttc_route_stops_toTbilisi', newer);

    await offline.hydrateTtcOfflineData(client);

    const routeStops = offline.getTtcOfflineSnapshot().datasetSync.routeStops;
    expect(routeStops.source).toBe('cache');
    expect(routeStops.cachedParts).toBe(2);
    expect(routeStops.totalParts).toBe(2);
    expect(routeStops.lastCacheSyncAt).toBe(older);
    expect(routeStops.effectiveUpdatedAt).toBe(older);
  });

  it('reports partial route-stop freshness without marking the dataset complete', async () => {
    const client = makeQueryClient();
    const cachedAt = new Date('2026-05-02T08:00:00Z').getTime();

    writeEnvelope('@ttc_route_stops_toKojori', cachedAt);

    await offline.hydrateTtcOfflineData(client);

    const routeStops = offline.getTtcOfflineSnapshot().datasetSync.routeStops;
    expect(routeStops.source).toBe('partial-cache');
    expect(routeStops.cachedParts).toBe(1);
    expect(routeStops.totalParts).toBe(2);
    expect(routeStops.lastCacheSyncAt).toBe(cachedAt);
    expect(routeStops.effectiveUpdatedAt).toBe(cachedAt);
  });

  it('records partial errors when one forced schedule request fails', async () => {
    const client = makeQueryClient();
    installFetchMock(true);

    await offline.refreshTtcOfflineDataset(client, 'schedules', { force: true });

    const snapshot = offline.getTtcOfflineSnapshot();
    expect(snapshot.completedRequests).toBe(4);
    expect(snapshot.error).toContain('schedules');
    expect(snapshot.lastCompletedDataset).toBe('schedules');
  });

  it('sets nextRequestAt while waiting between throttled requests', async () => {
    const client = makeQueryClient();
    const snapshots: TtcOfflineSnapshot[] = [];
    offline.__setTtcOfflineThrottleMsForTests(1);
    const unsubscribe = offline.subscribeTtcOfflineStatus(() => {
      snapshots.push({ ...offline.getTtcOfflineSnapshot() });
    });

    await offline.refreshTtcOfflineDataset(client, 'schedules', { force: true });
    unsubscribe();

    expect(snapshots.some(snapshot => typeof snapshot.nextRequestAt === 'number')).toBe(true);
  });

  it('does not wait between requests by default', async () => {
    const client = makeQueryClient();
    const snapshots: TtcOfflineSnapshot[] = [];
    offline.__resetTtcOfflineStateForTests();
    const unsubscribe = offline.subscribeTtcOfflineStatus(() => {
      snapshots.push({ ...offline.getTtcOfflineSnapshot() });
    });

    await offline.refreshTtcOfflineDataset(client, 'schedules', { force: true });
    unsubscribe();

    expect(snapshots.some(snapshot => typeof snapshot.nextRequestAt === 'number')).toBe(false);
    expect(offline.getTtcOfflineSnapshot().completedRequests).toBe(4);
  });

  it('keeps dataset step progress while warming all offline data', async () => {
    const client = makeQueryClient();
    const snapshots: TtcOfflineSnapshot[] = [];
    const unsubscribe = offline.subscribeTtcOfflineStatus(() => {
      snapshots.push({ ...offline.getTtcOfflineSnapshot() });
    });

    await offline.warmTtcOfflineData(client);
    unsubscribe();

    expect(snapshots.some(snapshot => snapshot.activeDataset === 'schedules' && snapshot.activeDatasetStep === 1)).toBe(true);
    expect(snapshots.some(snapshot => snapshot.activeDataset === 'routeStops' && snapshot.activeDatasetStep === 2)).toBe(true);
    expect(snapshots.some(snapshot => snapshot.activeDataset === 'polylines' && snapshot.activeDatasetStep === 3)).toBe(true);
    expect(snapshots.some(snapshot => snapshot.totalRequests > 0 && snapshot.completedRequests > 0)).toBe(true);
  });

  it('forces every dataset when manually refreshing all offline data', async () => {
    const client = makeQueryClient();
    const fetchMock = installFetchMock();
    const { ROUTES } = await import('./ttc');
    const pairs = [
      { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toKojori },
      { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toTbilisi },
      { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toKojori },
      { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toTbilisi },
    ];

    for (const pair of pairs) {
      await offline.writeScheduleCache(pair.routeId, pair.patternSuffix, []);
    }

    await offline.warmTtcOfflineData(client, { force: true });

    expect(fetchMock.scheduleCalls()).toBe(4);
    expect(fetchMock.stopDetailCalls()).toBe(0);
    expect(offline.getTtcOfflineSnapshot().lastCompletedDataset).toBe('polylines');
  });

  it('skips recently refreshed datasets during a forced all refresh', async () => {
    const client = makeQueryClient();
    const fetchMock = installFetchMock();
    const { ROUTES } = await import('./ttc');
    const pairs = [
      { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toKojori },
      { routeId: ROUTES['380'].id, patternSuffix: ROUTES['380'].toTbilisi },
      { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toKojori },
      { routeId: ROUTES['316'].id, patternSuffix: ROUTES['316'].toTbilisi },
    ];

    for (const pair of pairs) {
      await offline.writeScheduleCache(pair.routeId, pair.patternSuffix, []);
    }

    await offline.warmTtcOfflineData(client, { force: true, skipFreshMs: 3 * 60 * 60 * 1000 });

    expect(fetchMock.scheduleCalls()).toBe(0);
    expect(fetchMock.stopDetailCalls()).toBe(0);
    expect(offline.getTtcOfflineSnapshot().lastCompletedDataset).toBe('polylines');
  });
});
