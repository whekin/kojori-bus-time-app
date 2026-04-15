import { reportTtcFailure, reportTtcSuccess } from '@/hooks/use-ttc-health';
import {
  getTtcErrorCode,
  recordTtcQuery,
  type TtcQueryKind,
} from '@/services/ttc-query-log';

const BASE = 'https://transit.ttc.com.ge/pis-gateway/api';
const API_KEY = 'c0a2f304-551a-4d08-b8df-2c53ecd57f9f';

const headers = { 'x-api-key': API_KEY };

async function fetchTtcJson<T>(url: string, kind: TtcQueryKind): Promise<T> {
  const startedAt = Date.now();
  let statusCode: number | null = null;

  try {
    const res = await fetch(url, { headers });
    statusCode = res.status;

    if (!res.ok) {
      const isRateLimited = res.status === 520;
      reportTtcFailure(isRateLimited);
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    reportTtcSuccess();
    recordTtcQuery({
      kind,
      endpoint: url.replace(`${BASE}/`, ''),
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      ok: true,
      statusCode,
      errorCode: null,
    });
    return data as T;
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('HTTP '))) {
      reportTtcFailure();
    }

    recordTtcQuery({
      kind,
      endpoint: url.replace(`${BASE}/`, ''),
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      ok: false,
      statusCode,
      errorCode: getTtcErrorCode(error, statusCode),
    });
    throw error;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ArrivalTime {
  shortName: string;
  color: string;
  headsign: string;
  patternSuffix: string;
  vehicleMode: string;
  realtime: boolean;
  realtimeArrivalMinutes: number;
  scheduledArrivalMinutes: number;
}

export interface ScheduleStop {
  name: string;
  id: string;
  position: number;
  arrivalTimes: string; // comma-separated "H:mm" strings
}

export interface SchedulePeriod {
  fromDay: string;
  toDay: string;
  serviceDates: string[];
  stops: ScheduleStop[];
}

export interface VehiclePosition {
  vehicleId: string;
  lat: number;
  lon: number;
  heading: number;
  nextStopId: string;
}

export type DepartureStatus = 'scheduled' | 'live' | 'cancelled';

export interface DepartureSummary {
  key: string;
  bus: BusLine;
  time: string;
  minsUntil: number;
  scheduledTime?: string;
  scheduledMinsUntil?: number;
}

export interface PolylinePoint {
  latitude: number;
  longitude: number;
}

export type RouteGeometrySource = 'google-directions' | 'hybrid-connected' | 'stops-fallback';

function dedupePolylinePoints(points: PolylinePoint[]) {
  return points.filter((point, index, allPoints) => {
    if (index === 0) return true;
    const previous = allPoints[index - 1];
    return point.latitude !== previous.latitude || point.longitude !== previous.longitude;
  });
}

function interpolateCatmullRom(
  p0: PolylinePoint,
  p1: PolylinePoint,
  p2: PolylinePoint,
  p3: PolylinePoint,
  t: number,
): PolylinePoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    latitude:
      0.5 *
      ((2 * p1.latitude) +
        (-p0.latitude + p2.latitude) * t +
        (2 * p0.latitude - 5 * p1.latitude + 4 * p2.latitude - p3.latitude) * t2 +
        (-p0.latitude + 3 * p1.latitude - 3 * p2.latitude + p3.latitude) * t3),
    longitude:
      0.5 *
      ((2 * p1.longitude) +
        (-p0.longitude + p2.longitude) * t +
        (2 * p0.longitude - 5 * p1.longitude + 4 * p2.longitude - p3.longitude) * t2 +
        (-p0.longitude + 3 * p1.longitude - 3 * p2.longitude + p3.longitude) * t3),
  };
}

function smoothPolyline(points: PolylinePoint[], segmentsPerLeg = 10) {
  if (points.length < 3) return points;
  const smoothed: PolylinePoint[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 1; step <= segmentsPerLeg; step += 1) {
      smoothed.push(interpolateCatmullRom(p0, p1, p2, p3, step / segmentsPerLeg));
    }
  }
  return dedupePolylinePoints(smoothed);
}

export function decodeGooglePolyline(encoded: string): PolylinePoint[] {
  const points: PolylinePoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const ROUTES = {
  '380': { id: '1:R97505', toKojori: '0:01', toTbilisi: '1:01' },
  '316': { id: '1:R98445', toKojori: '1:01', toTbilisi: '0:01' },
} as const;

export type BusLine = keyof typeof ROUTES;

export interface StopInfo {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
}

/**
 * All known stops for each direction.
 * Used in Settings to let the user pick favourites.
 * First entry = recommended default.
 */
export const ALL_TBILISI_STOPS: StopInfo[] = [
  { id: '1:2994', label: 'Elene Akhvlediani Street' }, // actual first stop — TTC API omits it from schedule
  { id: '1:3932', label: 'Nikoloz Baratashvili Street' },
  { id: '1:853', label: 'Sulkhan-Saba Street' },
];

/**
 * TTC omits stop 1:2994 from schedule data. When computing departures
 * for it, use 1:3932 (next stop, ~1 min later) as a proxy.
 */
export const SCHEDULE_STOP_PROXY: Record<string, string> = {
  '1:2994': '1:3932',
};

export const ALL_KOJORI_STOPS: StopInfo[] = [
  { id: '1:3078', label: 'Kojori Center' },
  { id: '1:2856', label: 'Kojori, Vazha-Pshavela St #56' },
  { id: '1:3782', label: 'Kojori, Alexandre Chkheidze Street' },
  { id: '1:3537', label: 'Kojori, Nikoloz Baratashvili Street' },
];

/** Default favourite stop IDs shown as chips on home screen */
export const DEFAULT_TBILISI_FAVORITES = ['1:2994'];
export const DEFAULT_KOJORI_FAVORITES = ['1:3078'];

// Convenience: look up a StopInfo by ID from the full known set
export function findStop(id: string): StopInfo | undefined {
  return [...ALL_TBILISI_STOPS, ...ALL_KOJORI_STOPS].find(s => s.id === id);
}

export const BUS_COLORS: Record<BusLine, string> = {
  '380': '#F5A20A',
  '316': '#10B8A3',
};

// Kojori geographic bounding box for location detection
export const KOJORI_BOUNDS = {
  latMin: 41.55,
  latMax: 41.60,
  lonMin: 44.77,
  lonMax: 44.82,
} as const;

// ── API functions ─────────────────────────────────────────────────────────────

export async function fetchArrivalTimes(stopId: string): Promise<ArrivalTime[]> {
  return fetchTtcJson<ArrivalTime[]>(
    `${BASE}/v2/stops/${stopId}/arrival-times?locale=en&ignoreScheduledArrivalTimes=false`,
    'arrivals',
  );
}

export async function fetchSchedule(
  routeId: string,
  patternSuffix: string,
): Promise<SchedulePeriod[]> {
  return fetchTtcJson<SchedulePeriod[]>(
    `${BASE}/v3/routes/${routeId}/schedule?patternSuffix=${patternSuffix}&locale=en`,
    'schedule',
  );
}

/** Fetches name + coordinates for a single stop. */
export async function fetchStopDetails(stopId: string): Promise<{ id: string; name: string }> {
  const data = await fetchTtcJson<{ id?: string; name: string }>(
    `${BASE}/v2/stops/${stopId}?locale=en`,
    'stop-details',
  );
  return { id: data.id ?? stopId, name: data.name };
}

/** Fetches all stops for a route pattern — used in Settings to populate the full picker. */
export async function fetchRouteStops(routeId: string, patternSuffix: string): Promise<StopInfo[]> {
  const raw = await fetchTtcJson<{ stop: { id: string; name: string; lat?: number; lon?: number } }[]>(
    `${BASE}/v3/routes/${routeId}/stops-of-patterns?patternSuffixes=${patternSuffix}&locale=en`,
    'route-stops',
  );
  return raw.map(s => ({ id: s.stop.id, label: s.stop.name, lat: s.stop.lat, lon: s.stop.lon }));
}

export async function fetchRoutePolyline(
  routeId: string,
  patternSuffix: string,
): Promise<{ points: PolylinePoint[]; source: RouteGeometrySource }> {
  const raw = await fetchTtcJson<Record<string, { encodedValue?: string }>>(
    `${BASE}/v3/routes/${routeId}/polylines?patternSuffixes=${patternSuffix}`,
    'route-polylines',
  );

  const encodedValue = raw[patternSuffix]?.encodedValue;
  if (!encodedValue) {
    return { points: [], source: 'stops-fallback' };
  }

  return {
    points: decodeGooglePolyline(encodedValue),
    source: 'google-directions',
  };
}

/** Builds a route polyline from stop coordinates + Catmull-Rom smoothing. */
export async function fetchRoutePolylineFromStops(
  routeId: string,
  patternSuffix: string,
): Promise<{ points: PolylinePoint[]; source: RouteGeometrySource }> {
  const raw = await fetchTtcJson<{ stop: { lat?: number; lon?: number } }[]>(
    `${BASE}/v3/routes/${routeId}/stops-of-patterns?patternSuffixes=${patternSuffix}&locale=en`,
    'route-stops',
  );

  const stopPoints = raw
    .map(entry => ({
      latitude: entry.stop.lat ?? NaN,
      longitude: entry.stop.lon ?? NaN,
    }))
    .filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .filter((point, index, points) => {
      if (index === 0) return true;
      const previous = points[index - 1];
      return point.latitude !== previous.latitude || point.longitude !== previous.longitude;
    });

  return {
    points: smoothPolyline(stopPoints),
    source: 'stops-fallback',
  };
}

export async function fetchVehiclePositions(
  routeId: string,
  patternSuffix: string,
): Promise<Record<string, VehiclePosition[]>> {
  return fetchTtcJson<Record<string, VehiclePosition[]>>(
    `${BASE}/v3/routes/${routeId}/positions?patternSuffixes=${patternSuffix}`,
    'vehicle-positions',
  );
}

// ── Schedule helpers ──────────────────────────────────────────────────────────

/** Returns the schedule period valid for today, falling back to first period. */
export function getTodayPeriod(periods: SchedulePeriod[]): SchedulePeriod | undefined {
  if (!periods.length) return undefined;
  const today = new Date().toISOString().split('T')[0];
  return periods.find(p => p.serviceDates.includes(today)) ?? periods[0];
}

/** Extracts and returns raw time strings for a specific stop from a schedule period. */
export function extractStopTimes(period: SchedulePeriod, stopId: string): string[] {
  const stop = period.stops.find(s => s.id === stopId);
  if (!stop || !stop.arrivalTimes) return [];
  return stop.arrivalTimes.split(',').map(t => t.trim()).filter(Boolean);
}

/** Parses "H:mm" or "HH:mm" to minutes since midnight. */
export function parseTimeToMins(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Formats minutes since midnight to "HH:mm". */
export function formatTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Formats a future offset in minutes from now to "HH:mm". */
export function formatFutureTime(offsetMins: number, now = new Date()): string {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return formatTime(nowMins + offsetMins);
}

export interface Departure {
  key: string;
  bus: BusLine;
  time: string;      // display time "HH:mm"
  minsUntil: number;
  status: DepartureStatus;
  live?: boolean;
  cancelled?: boolean;
  scheduledTime?: string;
  scheduledMinsUntil?: number;
  liveMinutes?: number; // realtime ETA in mins (only when live=true)
  driftMinutes?: number;
  replacedCancelledDeparture?: DepartureSummary;
}

/**
 * Merges and sorts upcoming departures for both bus lines from a given stop.
 * Returns departures within the next 3 hours.
 */
export function computeUpcomingDepartures(
  schedule380: SchedulePeriod[] | undefined,
  schedule316: SchedulePeriod[] | undefined,
  stopId: string,
  horizonMins = 23 * 60,
  now = new Date(),
): Departure[] {
  const lookupStopId = SCHEDULE_STOP_PROXY[stopId] ?? stopId;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const midnightWrapThresholdMins = 12 * 60;
  const result: Departure[] = [];

  const entries: [BusLine, SchedulePeriod[] | undefined][] = [
    ['380', schedule380],
    ['316', schedule316],
  ];

  for (const [bus, schedule] of entries) {
    if (!schedule) continue;
    const period = getTodayPeriod(schedule);
    if (!period) continue;
    const times = extractStopTimes(period, lookupStopId);

    for (const t of times) {
      const mins = parseTimeToMins(t);
      // Wrap only clearly next-day trips; slightly past departures should disappear.
      let minsUntil = mins - nowMins;
      if (minsUntil < -midnightWrapThresholdMins) minsUntil += 24 * 60;
      // Allow up to 5 min past scheduled time — a late bus can still be coming;
      // mergeArrivalsIntoSchedule will drop unmatched past departures.
      if (minsUntil < -5 || minsUntil > horizonMins) continue;
      result.push({
        key: `${bus}-${mins}`,
        bus,
        time: formatTime(mins),
        minsUntil,
        status: 'scheduled',
        scheduledTime: formatTime(mins),
      });
    }
  }

  return result.sort((a, b) => a.minsUntil - b.minsUntil);
}

/**
 * Overlays live arrival data onto schedule-based departures.
 * If a live arrival matches a departure within ±8 min, marks it live
 * and updates minsUntil to the realtime ETA.
 */
export function mergeArrivalsIntoSchedule(
  departures: Departure[],
  arrivals: ArrivalTime[],
  now = new Date(),
  arrivalsUpdatedAt?: number,
): Departure[] {
  const elapsedLiveMinutes = arrivalsUpdatedAt
    ? Math.max(0, Math.floor((now.getTime() - arrivalsUpdatedAt) / 60_000))
    : 0;

  const byBus = new Map<BusLine, Departure[]>();
  for (const dep of departures) {
    if (!byBus.has(dep.bus)) byBus.set(dep.bus, []);
    byBus.get(dep.bus)?.push({
      ...dep,
      status: dep.status ?? 'scheduled',
      scheduledTime: dep.scheduledTime ?? dep.time,
      live: false,
      cancelled: false,
    });
  }

  const merged: Departure[] = [];

  for (const bus of ['380', '316'] as const) {
    const scheduled = (byBus.get(bus) ?? [])
      .filter(dep => dep.minsUntil >= 0)
      .sort((a, b) => a.minsUntil - b.minsUntil);
    if (scheduled.length === 0) continue;

    const realtimeArrivals = arrivals
      .filter(arrival => arrival.shortName === bus && arrival.realtime)
      .map(arrival => Math.max(0, arrival.realtimeArrivalMinutes - elapsedLiveMinutes))
      .sort((a, b) => a - b);

    if (realtimeArrivals.length === 0) {
      merged.push(...scheduled.map<Departure>(dep => ({
        ...dep,
        status: 'scheduled',
        live: false,
        cancelled: false,
        scheduledMinsUntil: dep.scheduledMinsUntil ?? dep.minsUntil,
      })));
      continue;
    }

    const matchedByIndex = new Map<number, number>();
    const usedIndexes = new Set<number>();

    for (const liveMinutes of realtimeArrivals) {
      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < scheduled.length; index += 1) {
        if (usedIndexes.has(index)) continue;
        const distance = Math.abs(scheduled[index].minsUntil - liveMinutes);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      }

      if (closestIndex === -1) continue;
      usedIndexes.add(closestIndex);
      matchedByIndex.set(closestIndex, liveMinutes);
    }

    const cancelledIndexes = new Set<number>();
    let latestMatchedIndex = -1;
    for (let index = 0; index < scheduled.length; index += 1) {
      if (matchedByIndex.has(index)) {
        for (let skipped = latestMatchedIndex + 1; skipped < index; skipped += 1) {
          if (!matchedByIndex.has(skipped)) cancelledIndexes.add(skipped);
        }
        latestMatchedIndex = index;
      }
    }

    let mostRecentCancelled: DepartureSummary | undefined;
    for (let index = 0; index < scheduled.length; index += 1) {
      const dep = scheduled[index];
      const matchedLiveMinutes = matchedByIndex.get(index);

      if (matchedLiveMinutes != null) {
        merged.push({
          ...dep,
          status: 'live',
          live: true,
          cancelled: false,
          time: formatFutureTime(matchedLiveMinutes, now),
          scheduledTime: dep.scheduledTime ?? dep.time,
          scheduledMinsUntil: dep.minsUntil,
          liveMinutes: matchedLiveMinutes,
          driftMinutes: matchedLiveMinutes - dep.minsUntil,
          minsUntil: matchedLiveMinutes,
          replacedCancelledDeparture: mostRecentCancelled,
        });
        mostRecentCancelled = undefined;
        continue;
      }

      if (cancelledIndexes.has(index)) {
        const cancelledDep: Departure = {
          ...dep,
          status: 'cancelled',
          cancelled: true,
          live: false,
          scheduledTime: dep.scheduledTime ?? dep.time,
          scheduledMinsUntil: dep.minsUntil,
        };
        merged.push(cancelledDep);
        mostRecentCancelled = {
          key: cancelledDep.key,
          bus: cancelledDep.bus,
          time: cancelledDep.time,
          minsUntil: cancelledDep.minsUntil,
          scheduledTime: cancelledDep.scheduledTime,
          scheduledMinsUntil: cancelledDep.scheduledMinsUntil,
        };
        continue;
      }

      merged.push({
        ...dep,
        status: 'scheduled',
        live: false,
        cancelled: false,
        scheduledTime: dep.scheduledTime ?? dep.time,
        scheduledMinsUntil: dep.minsUntil,
      });
    }
  }

  return merged
    .filter(dep => dep.minsUntil >= 0)
    .sort((a, b) => a.minsUntil - b.minsUntil);
}

export function injectCancelledDemo(
  departures: Departure[],
  now = new Date(),
): Departure[] {
  const base = departures
    .filter(dep => dep.status !== 'cancelled')
    .sort((a, b) => a.minsUntil - b.minsUntil);

  const demoTarget = base.find(dep => dep.status === 'scheduled' && dep.minsUntil >= 4);
  if (!demoTarget) return departures;

  const demoDelay = Math.max(12, demoTarget.minsUntil + 11);
  const scheduledSummary: DepartureSummary = {
    key: demoTarget.key,
    bus: demoTarget.bus,
    time: demoTarget.scheduledTime ?? demoTarget.time,
    minsUntil: demoTarget.scheduledMinsUntil ?? demoTarget.minsUntil,
    scheduledTime: demoTarget.scheduledTime ?? demoTarget.time,
    scheduledMinsUntil: demoTarget.scheduledMinsUntil ?? demoTarget.minsUntil,
  };

  const demoLive: Departure = {
    ...demoTarget,
    status: 'live',
    live: true,
    cancelled: false,
    time: formatFutureTime(demoDelay, now),
    scheduledTime: scheduledSummary.time,
    scheduledMinsUntil: scheduledSummary.minsUntil,
    liveMinutes: demoDelay,
    driftMinutes: demoDelay - scheduledSummary.minsUntil,
    minsUntil: demoDelay,
    replacedCancelledDeparture: scheduledSummary,
  };

  const demoCancelled: Departure = {
    ...demoTarget,
    status: 'cancelled',
    live: false,
    cancelled: true,
    scheduledTime: scheduledSummary.time,
    scheduledMinsUntil: scheduledSummary.minsUntil,
  };

  const rest = base.filter(dep => dep.key !== demoTarget.key);
  return [demoCancelled, demoLive, ...rest]
    .filter(dep => dep.minsUntil >= 0)
    .sort((a, b) => {
      if (a.status === 'cancelled' && b.status !== 'cancelled' && a.key === demoTarget.key) return -1;
      if (b.status === 'cancelled' && a.status !== 'cancelled' && b.key === demoTarget.key) return 1;
      return a.minsUntil - b.minsUntil;
    });
}
