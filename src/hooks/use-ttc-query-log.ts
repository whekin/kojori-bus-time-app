import { useSyncExternalStore } from 'react';

import {
  getTtcQueryLogSnapshot,
  subscribeTtcQueryLog,
} from '@/services/ttc-query-log';

export function useTtcQueryLog() {
  return useSyncExternalStore(subscribeTtcQueryLog, getTtcQueryLogSnapshot, getTtcQueryLogSnapshot);
}
