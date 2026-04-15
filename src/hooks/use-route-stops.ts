import { useQuery } from '@tanstack/react-query';

import { StopInfo } from '@/services/ttc';
import {
  getBakedRouteStops,
  readRouteStopsCache,
} from '@/services/ttc-offline';

type Direction = 'toKojori' | 'toTbilisi';

export function useRouteStops(direction: Direction) {
  const query = useQuery<StopInfo[]>({
    queryKey: ['route-stops', direction],
    meta: { source: 'ttc' },
    initialData: () => getBakedRouteStops(direction),
    queryFn: async () => (await readRouteStopsCache(direction, true)) ?? getBakedRouteStops(direction),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });

  return {
    stops: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
