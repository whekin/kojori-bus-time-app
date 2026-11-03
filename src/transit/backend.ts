import type { Boarding, TransitDeparture } from './model';

export type ArrivalSource = 'ttc' | 'gzaap';
export const arrivalSource: ArrivalSource = process.env.EXPO_PUBLIC_GZAAP_ARRIVALS === 'gzaap' ? 'gzaap' : 'ttc';
const baseUrl = process.env.EXPO_PUBLIC_GZAAP_API_URL ?? 'https://gzaap-api.whekin.dev';
export type BackendDepartures = {
  state: 'available' | 'stale' | 'unavailable';
  observedAt: number;
  expiresAt: number;
  rows: TransitDeparture[];
};
export function decodeBackendDepartures(value: unknown, boarding: Boarding, startedAt: number, receivedAt: number): BackendDepartures {
  if (!value || typeof value !== 'object') throw new Error('Invalid Gzaap response');
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !['available', 'stale', 'unavailable'].includes(String(v.state)) ||
    typeof v.serverTime !== 'number' || !Number.isFinite(v.serverTime) ||
    typeof v.validUntil !== 'number' || !Number.isFinite(v.validUntil) ||
    !(v.observedAt === null || (typeof v.observedAt === 'number' && Number.isFinite(v.observedAt))) ||
    !Array.isArray(v.rows) || v.rows.length > 256) throw new Error('Invalid Gzaap response');
  const rows = v.rows.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid Gzaap row');
    const r = row as Record<string, unknown>;
    if (typeof r.key !== 'string' || typeof r.epochMs !== 'number' || !Number.isFinite(r.epochMs) ||
      typeof r.scheduledEpochMs !== 'number' || !Number.isFinite(r.scheduledEpochMs) ||
      typeof r.live !== 'boolean' || typeof r.confirmed !== 'boolean') throw new Error('Invalid Gzaap row');
    return { key: r.key, epochMs: r.epochMs, scheduledEpochMs: r.scheduledEpochMs, live: r.live, confirmed: r.confirmed, boarding };
  });
  const roundTrip = Math.max(0, receivedAt - startedAt);
  const age = typeof v.observedAt === 'number' ? Math.max(0, v.serverTime - v.observedAt) + roundTrip : 0;
  return { state: v.state as BackendDepartures['state'],
    observedAt: v.observedAt === null ? 0 : receivedAt - age,
    expiresAt: receivedAt + Math.min(90000, v.validUntil - v.serverTime) - roundTrip, rows };
}
export async function fetchBackendDepartures(boarding: Boarding, scheduled: TransitDeparture[], evidence: { count: number; observedAt: number }, signal?: AbortSignal): Promise<BackendDepartures> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/departures`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ boarding,
        scheduled: scheduled.map(({ key, epochMs, scheduledEpochMs, confirmed }) => ({ key, epochMs, scheduledEpochMs, confirmed })),
        ...(evidence.observedAt > 0 && startedAt - evidence.observedAt <= 90000 ? { evidence: { count: evidence.count, ageMs: Math.max(0, startedAt - evidence.observedAt) } } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Gzaap HTTP ${response.status}`);
    return decodeBackendDepartures(await response.json(), boarding, startedAt, Date.now());
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
/** Expiry or any request error falls back to the current local timetable, never TTC. */
export function backendRows(data: BackendDepartures | undefined, isError: boolean, scheduled: TransitDeparture[], now: number) {
  if (isError || !data || data.state !== 'available' || now > data.expiresAt) return scheduled.filter(r => r.epochMs > now);
  return data.rows.filter(r => r.epochMs > now);
}
