import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, useQuery } from '@tanstack/react-query';

import { fetchSchedule, SchedulePeriod } from '@/services/ttc';

const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

function cacheKey(routeId: string, patternSuffix: string) {
  return `@ttc_schedule_${routeId}_${patternSuffix.replace(':', '_')}`;
}

async function readCache(routeId: string, patternSuffix: string): Promise<SchedulePeriod[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(routeId, patternSuffix));
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw) as { data: SchedulePeriod[]; cachedAt: number };
    return Date.now() - cachedAt < CACHE_TTL ? data : null;
  } catch {
    return null;
  }
}

async function writeCache(routeId: string, patternSuffix: string, data: SchedulePeriod[]) {
  try {
    await AsyncStorage.setItem(cacheKey(routeId, patternSuffix), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {}
}

/**
 * Call this once in _layout.tsx after QueryClient is created.
 * Pre-fills the QueryClient with cached schedule data so screens
 * have data immediately (before the network response arrives).
 */
export async function prefillScheduleCache(client: QueryClient) {
  const pairs = [
    { routeId: '1:R97505', pattern: '0:01' }, // 380 → Kojori
    { routeId: '1:R97505', pattern: '1:01' }, // 380 → Tbilisi
    { routeId: '1:R98445', pattern: '1:01' }, // 316 → Kojori
    { routeId: '1:R98445', pattern: '0:01' }, // 316 → Tbilisi
  ];

  await Promise.all(
    pairs.map(async ({ routeId, pattern }) => {
      const cached = await readCache(routeId, pattern);
      if (cached) {
        client.setQueryData(['schedule', routeId, pattern], cached);
      }
    }),
  );
}

export function useSchedule(routeId: string, patternSuffix: string) {
  return useQuery<SchedulePeriod[]>({
    queryKey: ['schedule', routeId, patternSuffix],
    meta: { source: 'ttc' },
    queryFn: async () => {
      const data = await fetchSchedule(routeId, patternSuffix);
      writeCache(routeId, patternSuffix, data); // fire and forget
      return data;
    },
    staleTime: CACHE_TTL,
    retry: 2,
  });
}
