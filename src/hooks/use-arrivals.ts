import { useQuery } from '@tanstack/react-query';

import { ArrivalTime, BusLine, fetchArrivalTimes, ROUTES, SCHEDULE_STOP_PROXY } from '@/services/ttc';

const BUSES: BusLine[] = ['380', '316'];

/** Real-time + scheduled arrivals for a stop. Refreshes every 30s. */
export function useArrivals(stopId: string, direction?: 'toKojori' | 'toTbilisi') {
  const fetchStopId = SCHEDULE_STOP_PROXY[stopId] ?? stopId;
  const query = useQuery<ArrivalTime[]>({
    queryKey: ['arrivals', stopId],
    meta: { source: 'ttc' },
    queryFn: () => fetchArrivalTimes(fetchStopId),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 1,
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
