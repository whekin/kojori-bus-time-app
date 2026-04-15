import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@ttc_query_log_v1';
const MAX_LOG_ENTRIES = 240;

export type TtcQueryKind =
  | 'arrivals'
  | 'vehicle-positions'
  | 'schedule'
  | 'route-stops'
  | 'route-polylines'
  | 'stop-details';

export interface TtcQueryLogEntry {
  id: string;
  kind: TtcQueryKind;
  endpoint: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  ok: boolean;
  statusCode: number | null;
  errorCode: string | null;
}

export interface TtcQueryLogMetrics {
  queriesLastMinute: number;
  queriesLastTenMinutes: number;
  totalQueries: number;
  totalErrors: number;
}

export interface TtcQueryLogSnapshot {
  entries: TtcQueryLogEntry[];
  metrics: TtcQueryLogMetrics;
  hydrated: boolean;
}

const listeners = new Set<() => void>();
let persistChain = Promise.resolve();

let snapshot: TtcQueryLogSnapshot = {
  entries: [],
  metrics: {
    queriesLastMinute: 0,
    queriesLastTenMinutes: 0,
    totalQueries: 0,
    totalErrors: 0,
  },
  hydrated: false,
};

function emit() {
  listeners.forEach(listener => listener());
}

export function calculateTtcQueryMetrics(entries: TtcQueryLogEntry[], now = Date.now()): TtcQueryLogMetrics {
  const oneMinuteAgo = now - 60_000;
  const tenMinutesAgo = now - 10 * 60_000;

  return {
    queriesLastMinute: entries.filter(entry => entry.startedAt >= oneMinuteAgo).length,
    queriesLastTenMinutes: entries.filter(entry => entry.startedAt >= tenMinutesAgo).length,
    totalQueries: entries.length,
    totalErrors: entries.filter(entry => !entry.ok).length,
  };
}

function setSnapshot(entries: TtcQueryLogEntry[], hydrated = snapshot.hydrated) {
  snapshot = {
    entries,
    metrics: calculateTtcQueryMetrics(entries),
    hydrated,
  };
  emit();
}

function persistEntries(entries: TtcQueryLogEntry[]) {
  persistChain = persistChain
    .catch(() => {})
    .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)))
    .catch(() => {});
}

export async function hydrateTtcQueryLog() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TtcQueryLogEntry[]) : [];
    setSnapshot(parsed.slice(0, MAX_LOG_ENTRIES), true);
  } catch {
    setSnapshot([], true);
  }
}

export function subscribeTtcQueryLog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTtcQueryLogSnapshot() {
  return snapshot;
}

export async function clearTtcQueryLog() {
  setSnapshot([], true);
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

export function recordTtcQuery(entry: Omit<TtcQueryLogEntry, 'id'>) {
  const nextEntry: TtcQueryLogEntry = {
    ...entry,
    id: `${entry.startedAt}-${entry.kind}-${Math.random().toString(36).slice(2, 8)}`,
  };

  const nextEntries = [nextEntry, ...snapshot.entries].slice(0, MAX_LOG_ENTRIES);
  setSnapshot(nextEntries, snapshot.hydrated);
  persistEntries(nextEntries);
}

export function getTtcErrorCode(error: unknown, statusCode?: number | null) {
  if (typeof statusCode === 'number') {
    return `HTTP_${statusCode}`;
  }

  if (error instanceof Error) {
    if (error.message.startsWith('HTTP ')) {
      return error.message.replace('HTTP ', 'HTTP_');
    }

    if (error.name) {
      return error.name.toUpperCase();
    }
  }

  return 'UNKNOWN_ERROR';
}
