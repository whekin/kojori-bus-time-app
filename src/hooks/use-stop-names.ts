import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, useQueries } from '@tanstack/react-query';

import { ALL_KOJORI_STOPS, ALL_TBILISI_STOPS, fetchStopDetails } from '@/services/ttc';

const CACHE_KEY = '@ttc_stop_names';
const ALL_STOP_IDS = [...ALL_TBILISI_STOPS, ...ALL_KOJORI_STOPS].map(s => s.id);

// ── Persistence ───────────────────────────────────────────────────────────────

async function readNameCache(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeNameCache(names: Record<string, string>) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(names));
  } catch {}
}

/**
 * Call once in _layout.tsx after QueryClient is created.
 * Loads cached stop names into QueryClient so Settings shows real names
 * immediately, then React Query refreshes stale ones in background.
 */
export async function prefillStopNames(client: QueryClient) {
  const cached = await readNameCache();
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
        const data = await fetchStopDetails(id);
        // Persist updated names to AsyncStorage
        const cached = await readNameCache();
        writeNameCache({ ...cached, [id]: data.name });
        return data;
      },
      staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days — stop names almost never change
      retry: 1,
    })),
  });

  const names: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.data?.name) names[ALL_STOP_IDS[i]] = r.data.name;
  });
  return names;
}
