import { useSyncExternalStore } from 'react';

import {
  getTtcQueryLogSnapshot,
  subscribeTtcQueryLog,
} from '@/services/ttc-query-log';

const subscribeDisabled = () => () => {};

export function useTtcQueryLog() {
  return useSyncExternalStore(subscribeTtcQueryLog, getTtcQueryLogSnapshot, getTtcQueryLogSnapshot);
}

export function useTtcQueryLogSnapshot(enabled: boolean) {
  return useSyncExternalStore(
    enabled ? subscribeTtcQueryLog : subscribeDisabled,
    getTtcQueryLogSnapshot,
    getTtcQueryLogSnapshot,
  );
}
