import { useQuery } from '@tanstack/react-query';

import { fetchSchedule, SchedulePeriod } from '@/services/ttc';
import {
  readScheduleCache,
  SCHEDULE_CACHE_TTL,
  writeScheduleCache,
} from '@/services/ttc-offline';

export function useSchedule(routeId: string, patternSuffix: string) {
  return useQuery<SchedulePeriod[]>({
    queryKey: ['schedule', routeId, patternSuffix],
    meta: { source: 'ttc' },
    queryFn: async () => {
      try {
        const data = await fetchSchedule(routeId, patternSuffix);
        void writeScheduleCache(routeId, patternSuffix, data);
        return data;
      } catch (error) {
        const cached = await readScheduleCache(routeId, patternSuffix, true);
        if (cached) return cached;
        throw error;
      }
    },
    staleTime: SCHEDULE_CACHE_TTL,
    retry: 2,
  });
}
