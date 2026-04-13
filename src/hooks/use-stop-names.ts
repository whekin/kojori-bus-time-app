import { QueryClient, useQueries } from '@tanstack/react-query';

import { ALL_KOJORI_STOPS, ALL_TBILISI_STOPS, fetchStopDetails } from '@/services/ttc';
import {
  readCachedStopName,
  readStopNameCache,
  STOP_NAMES_CACHE_TTL,
  writeStopName,
} from '@/services/ttc-offline';

const ALL_STOP_IDS = [...ALL_TBILISI_STOPS, ...ALL_KOJORI_STOPS].map(s => s.id);

/**
 * Call once in _layout.tsx after QueryClient is created.
 * Loads cached stop names into QueryClient so Settings shows real names
 * immediately, then React Query refreshes stale ones in background.
 */
export async function prefillStopNames(client: QueryClient) {
  const cached = await readStopNameCache(true);
  for (const [stopId, name] of Object.entries(cached)) {
    client.setQueryData(['stop', stopId], { id: stopId, name });
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Fetches and caches display names for all known stops.
 * Returns a map of stopId → name.
 * Falls back to the static label (e.g. "Stop #3537") until the API responds.
 */
export function useStopNames(): Record<string, string> {
  const results = useQueries({
    queries: ALL_STOP_IDS.map(id => ({
      queryKey: ['stop', id],
      meta: { source: 'ttc' },
      queryFn: async () => {
        try {
          const data = await fetchStopDetails(id);
          void writeStopName(id, data.name);
          return data;
        } catch (error) {
          const cachedName = await readCachedStopName(id, true);
          if (cachedName) return { id, name: cachedName };
          throw error;
        }
      },
      staleTime: STOP_NAMES_CACHE_TTL,
      retry: 1,
    })),
  });

  const names: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.data?.name) names[ALL_STOP_IDS[i]] = r.data.name;
  });
  return names;
}
