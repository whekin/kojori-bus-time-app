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
