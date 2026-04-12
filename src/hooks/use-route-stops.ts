import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchRouteStops, ROUTES, StopInfo } from '@/services/ttc';

type Direction = 'toKojori' | 'toTbilisi';

async function fetchStopsForDirection(direction: Direction): Promise<StopInfo[]> {
  // Fetch from both bus lines and merge
  const [stops380, stops316] = await Promise.all([
    fetchRouteStops(ROUTES['380'].id, ROUTES['380'][direction]),
    fetchRouteStops(ROUTES['316'].id, ROUTES['316'][direction]),
  ]);

  // Deduplicate by stop ID, preserving order
  const seen = new Set<string>();
  return [...stops380, ...stops316].filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export function useRouteStops(direction: Direction) {
  return useQueries({
    queries: [
      {
        queryKey: ['route-stops', direction],
        queryFn: () => fetchStopsForDirection(direction),
        staleTime: 24 * 60 * 60 * 1000, // 24h — route stops almost never change
        retry: 1,
      },
    ],
    combine: results => ({
      stops: (results[0].data ?? []) as StopInfo[],
      isLoading: results[0].isLoading,
      isError: results[0].isError,
    }),
  });
}
