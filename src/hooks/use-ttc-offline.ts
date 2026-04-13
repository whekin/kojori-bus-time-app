import { useSyncExternalStore } from 'react';

import { getTtcOfflineSnapshot, subscribeTtcOfflineStatus } from '@/services/ttc-offline';

export function useTtcOfflineStatus() {
  return useSyncExternalStore(subscribeTtcOfflineStatus, getTtcOfflineSnapshot, getTtcOfflineSnapshot);
}
