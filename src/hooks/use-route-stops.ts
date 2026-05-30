import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useI18n } from '@/hooks/use-i18n';
import { StopInfo } from '@/services/ttc';
import {
  getBakedRouteStops,
  readRouteStopsCache,
} from '@/services/ttc-offline';

type Direction = 'toKojori' | 'toTbilisi';

export function useRouteStops(direction: Direction) {
  const { localizedStopName, resolvedLanguage } = useI18n();
  const query = useQuery<StopInfo[]>({
    queryKey: ['route-stops', direction, resolvedLanguage],
    meta: { source: 'ttc' },
    initialData: () => getBakedRouteStops(direction),
    queryFn: async () => (await readRouteStopsCache(direction, true)) ?? getBakedRouteStops(direction),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });
  const stops = useMemo(
    () => (query.data ?? []).map(stop => ({ ...stop, label: localizedStopName(stop) })),
    [localizedStopName, query.data],
  );

  return {
    stops,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
