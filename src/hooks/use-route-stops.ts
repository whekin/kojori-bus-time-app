import { useQuery } from '@tanstack/react-query';

import { StopInfo } from '@/services/ttc';
import {
  fetchRouteStopsForDirection,
  readRouteStopsCache,
  ROUTE_STOPS_CACHE_TTL,
  writeRouteStopsCache,
} from '@/services/ttc-offline';

type Direction = 'toKojori' | 'toTbilisi';

export function useRouteStops(direction: Direction) {
  const query = useQuery<StopInfo[]>({
    queryKey: ['route-stops', direction],
    meta: { source: 'ttc' },
    queryFn: async () => {
      try {
        const data = await fetchRouteStopsForDirection(direction);
        void writeRouteStopsCache(direction, data);
        return data;
      } catch (error) {
        const cached = await readRouteStopsCache(direction, true);
        if (cached) return cached;
        throw error;
      }
    },
    staleTime: ROUTE_STOPS_CACHE_TTL,
    retry: 1,
  });

  return {
    stops: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
