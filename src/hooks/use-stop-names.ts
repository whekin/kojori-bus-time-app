import { QueryClient } from '@tanstack/react-query';

import {
  getBakedStopNames,
  readStopNameCache,
} from '@/services/ttc-offline';

const BUNDLED_STOP_NAMES = getBakedStopNames();

/**
 * Call once in _layout.tsx after QueryClient is created.
 * Loads bundled names first, then overlays any previously cached names.
 */
export async function prefillStopNames(client: QueryClient) {
  const cached = {
    ...BUNDLED_STOP_NAMES,
    ...(await readStopNameCache(true)),
  };
  for (const [stopId, name] of Object.entries(cached)) {
    client.setQueryData(['stop', stopId], { id: stopId, name });
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns bundled stop names for known app stops.
 * Returns a map of stopId → name.
 */
export function useStopNames(): Record<string, string> {
  return BUNDLED_STOP_NAMES;
}
