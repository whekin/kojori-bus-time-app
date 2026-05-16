import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useI18n } from '@/hooks/use-i18n';
import { fetchArrivalTimes, SCHEDULE_STOP_PROXY } from '@/services/ttc';

const MIN_REFRESH_VISIBLE_MS = 450;
const TTC_PROBE_STOP_ID = SCHEDULE_STOP_PROXY['1:2994'] ?? '1:3932';

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function useTtcStatusRefresh() {
  const queryClient = useQueryClient();
  const { ttcLocale } = useI18n();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refreshTtcStatus() {
    if (isRefreshing) return;

    const startedAt = Date.now();
    setIsRefreshing(true);

    try {
      await Promise.allSettled([
        queryClient.refetchQueries({
          predicate: query => query.meta?.source === 'ttc' && query.getObserversCount() > 0,
        }),
        fetchArrivalTimes(TTC_PROBE_STOP_ID, ttcLocale),
      ]);
    } finally {
      const remainingMs = MIN_REFRESH_VISIBLE_MS - (Date.now() - startedAt);
      if (remainingMs > 0) {
        await wait(remainingMs);
      }
      setIsRefreshing(false);
    }
  }

  return { isRefreshing, refreshTtcStatus };
}
