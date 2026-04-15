import { useQuery } from '@tanstack/react-query';

import { SchedulePeriod } from '@/services/ttc';
import {
  getBakedSchedule,
  readScheduleCache,
} from '@/services/ttc-offline';

export function useSchedule(routeId: string, patternSuffix: string) {
  return useQuery<SchedulePeriod[]>({
    queryKey: ['schedule', routeId, patternSuffix],
    meta: { source: 'ttc' },
    initialData: () => getBakedSchedule(routeId, patternSuffix) ?? undefined,
    queryFn: async () => {
      const cached = await readScheduleCache(routeId, patternSuffix, true);
      return cached ?? getBakedSchedule(routeId, patternSuffix) ?? [];
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });
}
