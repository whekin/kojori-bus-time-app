import { useQuery } from '@tanstack/react-query';

import { ArrivalTime, BusLine, fetchArrivalTimes } from '@/services/ttc';

const BUSES: BusLine[] = ['380', '316'];

/** Real-time + scheduled arrivals for a stop. Refreshes every 30s. */
export function useArrivals(stopId: string) {
  const query = useQuery<ArrivalTime[]>({
    queryKey: ['arrivals', stopId],
    queryFn: () => fetchArrivalTimes(stopId),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 1,
  });

  // Filter to only our two bus lines and sort by ETA
  const arrivals = (query.data ?? [])
    .filter(a => (BUSES as string[]).includes(a.shortName))
    .sort((a, b) => a.realtimeArrivalMinutes - b.realtimeArrivalMinutes);

  return { ...query, arrivals };
}
