import { useQuery } from '@tanstack/react-query';

import { useI18n } from '@/hooks/use-i18n';
import { ArrivalTime, BusLine, fetchArrivalTimes, resolveTtcLookupStopId, ROUTES } from '@/services/ttc';

const BUSES: BusLine[] = ['380', '316'];

/** Real-time + scheduled arrivals for a stop. Refreshes every 30s. */
export function useArrivals(stopId: string, direction?: 'toKojori' | 'toTbilisi', enabled = true) {
  const { ttcLocale } = useI18n();
  const fetchStopId = resolveTtcLookupStopId(stopId);
  const query = useQuery<ArrivalTime[]>({
    queryKey: ['arrivals', stopId, ttcLocale],
    meta: { source: 'ttc' },
    queryFn: () => fetchArrivalTimes(fetchStopId, ttcLocale),
    enabled,
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 0,
  });

  const arrivals = (query.data ?? [])
    .filter(a => {
      if (!(BUSES as string[]).includes(a.shortName)) return false;
      if (direction) {
        const expected = ROUTES[a.shortName as BusLine][direction];
        return a.patternSuffix === expected;
      }
      return true;
    })
    .sort((a, b) => a.realtimeArrivalMinutes - b.realtimeArrivalMinutes);

  return { ...query, arrivals };
}
