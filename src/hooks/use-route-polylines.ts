import { useQuery } from '@tanstack/react-query';

import { BusLine, PolylinePoint } from '@/services/ttc';
import {
  fetchRoutePolylinesForDirection,
  readRoutePolylinesCache,
  ROUTE_POLYLINES_CACHE_TTL,
  writeRoutePolylinesCache,
} from '@/services/ttc-offline';

type Direction = 'toKojori' | 'toTbilisi';

export function useRoutePolylines(direction: Direction, enabled = true) {
  return useQuery<Record<BusLine, PolylinePoint[]>>({
    queryKey: ['route-polylines', direction],
    meta: { source: 'ttc' },
    enabled,
    queryFn: async () => {
      try {
        const data = await fetchRoutePolylinesForDirection(direction);
        void writeRoutePolylinesCache(direction, data);
        return data;
      } catch (error) {
        const cached = await readRoutePolylinesCache(direction, true);
        if (cached) return cached;
        throw error;
      }
    },
    staleTime: ROUTE_POLYLINES_CACHE_TTL,
    retry: 1,
  });
}
