import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, useQuery } from '@tanstack/react-query';

import { BusLine, fetchRoutePolyline, PolylinePoint, ROUTES } from '@/services/ttc';

type Direction = 'toKojori' | 'toTbilisi';

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function cacheKey(routeId: string, patternSuffix: string) {
  return `@ttc_polyline_${routeId}_${patternSuffix.replace(':', '_')}`;
}

async function readCache(routeId: string, patternSuffix: string): Promise<PolylinePoint[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(routeId, patternSuffix));
    if (!raw) return null;
    const { data, cachedAt } = JSON.parse(raw) as { data: PolylinePoint[]; cachedAt: number };
    return Date.now() - cachedAt < CACHE_TTL ? data : null;
  } catch {
    return null;
  }
}

async function writeCache(routeId: string, patternSuffix: string, data: PolylinePoint[]) {
  try {
    await AsyncStorage.setItem(cacheKey(routeId, patternSuffix), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {}
}

const POLYLINE_PAIRS = [
  { bus: '380' as const, routeId: ROUTES['380'].id, pattern: ROUTES['380'].toKojori, direction: 'toKojori' as const },
  { bus: '380' as const, routeId: ROUTES['380'].id, pattern: ROUTES['380'].toTbilisi, direction: 'toTbilisi' as const },
  { bus: '316' as const, routeId: ROUTES['316'].id, pattern: ROUTES['316'].toKojori, direction: 'toKojori' as const },
  { bus: '316' as const, routeId: ROUTES['316'].id, pattern: ROUTES['316'].toTbilisi, direction: 'toTbilisi' as const },
];

export async function prefillRoutePolylineCache(client: QueryClient) {
  await Promise.all(
    POLYLINE_PAIRS.map(async ({ routeId, pattern }) => {
      const cached = await readCache(routeId, pattern);
      if (cached) {
        client.setQueryData(['route-polyline', routeId, pattern], cached);
      }
    }),
  );
}

async function fetchPolylinesForDirection(direction: Direction): Promise<Record<BusLine, PolylinePoint[]>> {
  const entries = await Promise.all(
    ([
      ['380', ROUTES['380']],
      ['316', ROUTES['316']],
    ] as const).map(async ([bus, route]) => {
      const pattern = route[direction];

      try {
        const points = await fetchRoutePolyline(route.id, pattern);
        writeCache(route.id, pattern, points);
        return [bus, points] as const;
      } catch {
        const cached = await readCache(route.id, pattern);
        return [bus, cached ?? []] as const;
      }
    }),
  );

  return Object.fromEntries(entries) as Record<BusLine, PolylinePoint[]>;
}

export function useRoutePolylines(direction: Direction) {
  return useQuery<Record<BusLine, PolylinePoint[]>>({
    queryKey: ['route-polylines', direction],
    meta: { source: 'ttc' },
    queryFn: () => fetchPolylinesForDirection(direction),
    staleTime: CACHE_TTL,
    retry: 1,
  });
}
