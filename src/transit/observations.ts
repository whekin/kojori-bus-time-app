import type { VehiclePosition } from '@/services/ttc';
const supported = new Map([
 ['1:R97505', new Set(['0:01', '1:01'])],
 ['1:R98445', new Set(['0:01', '1:01'])],
]);
type Dependencies = { enabled: boolean; baseUrl: string; fetch: typeof fetch; now: () => number };
/** Best-effort upload of existing TTC responses. No timers, disk queue, IDs or user location. */
export function createObservationSender(deps: Dependencies) {
 const sent = new Map<string, number>();
 let busy = false, pausedUntil = 0, failures = 0;
 return async (routeId: string, pattern: string, positions: VehiclePosition[], fetchedAt: number) => {
  const now = deps.now();
  const key = `${routeId}/${pattern}`;
  if (!deps.enabled || !supported.get(routeId)?.has(pattern) || busy || now < pausedUntil ||
    now - (sent.get(key) ?? -Infinity) < 30000 || now - fetchedAt < 0 || now - fetchedAt > 90000) return;
  if (!Array.isArray(positions)) return;
  const valid = positions.filter(v => v && typeof v.vehicleId === 'string' && v.vehicleId.length > 0 && v.vehicleId.length <= 128 &&
   Number.isFinite(v.lat) && v.lat >= 41 && v.lat <= 43 && Number.isFinite(v.lon) && v.lon >= 43 && v.lon <= 46);
  if (!valid.length || valid.length > 50) return;
  busy = true; sent.set(key, now);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
   const response = await deps.fetch(`${deps.baseUrl.replace(/\/$/, '')}/v1/observations/positions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
    body: JSON.stringify({ version: 1, routeId, pattern, ageMs: Math.floor(now-fetchedAt), positions: valid.map(v => ({
     vehicleId: v.vehicleId, lat: v.lat, lon: v.lon,
     heading: Number.isFinite(v.heading) && v.heading >= 0 && v.heading <= 360 ? v.heading : null,
     nextStopId: typeof v.nextStopId === 'string' && /^1:\d+$/.test(v.nextStopId) ? v.nextStopId : null,
    })) }),
   });
   if (!response.ok) {
    failures = Math.min(failures + 1, 5);
    const header = response.headers.get('Retry-After');
    const seconds = header ? Number(header) : NaN;
    const retryAfter = header ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header)-deps.now()) : 0;
    pausedUntil = deps.now() + Math.max(Math.min(900000, 30000 * 2 ** failures), Number.isFinite(retryAfter) ? Math.min(86400000, retryAfter) : 0);
   } else failures = 0;
  } catch {
   failures = Math.min(failures + 1, 5);
   pausedUntil = deps.now() + Math.min(900000, 30000 * 2 ** failures);
  } finally { clearTimeout(timeout); busy = false; }
 };
}
export const submitPositionObservations = createObservationSender({
 enabled: process.env.EXPO_PUBLIC_GZAAP_OBSERVATIONS === 'true',
 baseUrl: process.env.EXPO_PUBLIC_GZAAP_API_URL ?? 'https://gzaap-api.whekin.dev',
 fetch: (...args) => fetch(...args), now: () => Date.now(),
});
