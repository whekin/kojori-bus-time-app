import { reportTtcFailure, reportTtcSuccess } from '@/hooks/use-ttc-health';
import {
  getTtcErrorCode,
  recordTtcQuery,
  type TtcQueryKind,
} from '@/services/ttc-query-log';

const BASE = 'https://transit.ttc.com.ge/pis-gateway/api';
const API_KEY = 'c0a2f304-551a-4d08-b8df-2c53ecd57f9f';

const headers = { 'x-api-key': API_KEY };
export type TtcLocale = 'en' | 'ka';

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
  { id: '1:2994', label: 'Elene Akhvlediani Street', lat: 41.697618, lon: 44.809107 }, // actual first stop — TTC API omits it from schedule
  { id: '1:3932', label: 'Nikoloz Baratashvili Street', lat: 41.696601, lon: 44.803955 },
  { id: '1:853', label: 'Sulkhan-Saba Street', lat: 41.692531, lon: 44.799247 },
  { id: '1:857', label: 'Gergeti Street', lat: 41.689945, lon: 44.794908 },
  { id: '1:4673', label: 'Mikheil Lermontov Street', lat: 41.691163, lon: 44.798781 },
];

/**
 * TTC handles Elene Akhvlediani inconsistently and omits it from schedules.
 * Keep it as a user-facing stop, but use Baratashvili for TTC data lookups.
 */
export const TTC_STOP_LOOKUP_PROXY: Record<string, string> = {
  '1:2994': '1:3932',
};

export function resolveTtcLookupStopId(stopId: string) {
  return TTC_STOP_LOOKUP_PROXY[stopId] ?? stopId;
}

const EARLY_ROUTE_STOP_IDS = new Set([
  '1:2994',
  '1:3932',
  '1:853',
  '1:3078',
  '1:4186',
  '1:2856',
]);

export const ALL_KOJORI_STOPS: StopInfo[] = [
  { id: '1:3078', label: 'Kojori Center', lat: 41.663244, lon: 44.707207 },
  { id: '1:4186', label: 'Kojori, Niko Ketskhoveli Street', lat: 41.649008, lon: 44.700918 },
  { id: '1:2856', label: 'Kojori, Vazha-Pshavela St #56', lat: 41.649232, lon: 44.728292 },
  { id: '1:2139', label: 'Kojori Zakaria Bakradze Street', lat: 41.662317, lon: 44.699778 },
  { id: '1:3782', label: 'Kojori, Alexandre Chkheidze Street', lat: 41.661244, lon: 44.714077 },
  { id: '1:3537', label: 'Kojori, Nikoloz Baratashvili Street', lat: 41.659625, lon: 44.719993 },
];

/** Default favourite stop IDs shown as chips on home screen */
export const DEFAULT_TBILISI_FAVORITES = ['1:2994', '1:3932', '1:853', '1:857'];
export const DEFAULT_KOJORI_FAVORITES = ['1:3078', '1:4186', '1:2856', '1:2139', '1:3782', '1:3537'];

// Convenience: look up a StopInfo by ID from the full known set
export function findStop(id: string): StopInfo | undefined {
  return [...ALL_TBILISI_STOPS, ...ALL_KOJORI_STOPS].find(s => s.id === id);
}

export const BUS_COLORS: Record<BusLine, string> = {
  '380': '#F5A20A',
  '316': '#10B8A3',
};

// ── API functions ─────────────────────────────────────────────────────────────

export async function fetchArrivalTimes(stopId: string, locale: TtcLocale = 'en'): Promise<ArrivalTime[]> {
  return fetchTtcJson<ArrivalTime[]>(
    `${BASE}/v2/stops/${stopId}/arrival-times?locale=${locale}&ignoreScheduledArrivalTimes=false`,
    'arrivals',
  );
}

export async function fetchSchedule(
  routeId: string,
  patternSuffix: string,
  locale: TtcLocale = 'en',
): Promise<SchedulePeriod[]> {
  return fetchTtcJson<SchedulePeriod[]>(
    `${BASE}/v3/routes/${routeId}/schedule?patternSuffix=${patternSuffix}&locale=${locale}`,
    'schedule',
  );
}

/** Fetches name + coordinates for a single stop. */
export async function fetchStopDetails(stopId: string, locale: TtcLocale = 'en'): Promise<{ id: string; name: string }> {
  const data = await fetchTtcJson<{ id?: string; name: string }>(
    `${BASE}/v2/stops/${stopId}?locale=${locale}`,
    'stop-details',
  );
  return { id: data.id ?? stopId, name: data.name };
}

/** Fetches all stops for a route pattern — used in Settings to populate the full picker. */
export async function fetchRouteStops(routeId: string, patternSuffix: string, locale: TtcLocale = 'en'): Promise<StopInfo[]> {
  const raw = await fetchTtcJson<{ stop: { id: string; name: string; lat?: number; lon?: number } }[]>(
    `${BASE}/v3/routes/${routeId}/stops-of-patterns?patternSuffixes=${patternSuffix}&locale=${locale}`,
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
  locale: TtcLocale = 'en',
): Promise<{ points: PolylinePoint[]; source: RouteGeometrySource }> {
  const raw = await fetchTtcJson<{ stop: { lat?: number; lon?: number } }[]>(
    `${BASE}/v3/routes/${routeId}/stops-of-patterns?patternSuffixes=${patternSuffix}&locale=${locale}`,
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

function serviceDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addServiceDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

function getSchedulePeriodForDate(
  periods: SchedulePeriod[] | undefined,
  date: Date,
): SchedulePeriod | undefined {
  if (!periods?.length) return undefined;
  const serviceDate = serviceDateString(date);
  return periods.find(p => p.serviceDates.includes(serviceDate));
}

/** Returns the schedule period valid for today, falling back to first period. */
export function getTodayPeriod(periods: SchedulePeriod[], now = new Date()): SchedulePeriod | undefined {
  if (!periods.length) return undefined;
  const today = serviceDateString(now);
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
  const normalized = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
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
}

export interface ServiceDeparture extends DepartureSummary {
  date: string;
  daysUntil: number;
  minsFromMidnight: number;
}

export interface DepartureServiceBoundary {
  finalDepartureToday?: ServiceDeparture;
  nextServiceDeparture?: ServiceDeparture;
  nextDepartureIsFinal: boolean;
  hasServiceToday: boolean;
  serviceEndedToday: boolean;
}

const LIVE_ARRIVAL_MATCH_WINDOW_MINUTES = 8;
const LIVE_TIMETABLE_FALLBACK_MATCH_WINDOW_MINUTES = 20;
const MAX_TRUSTED_LIVE_DRIFT_MINUTES = 60;
const MAX_LIVE_ARRIVAL_AGE_MS = 2 * 60_000;
const MIN_SCHEDULED_DEPARTURE_MINUTES = 1;
const SUSPICIOUS_ORIGIN_LIVE_MINUTES_MIN = 6;
const SUSPICIOUS_ORIGIN_LIVE_MINUTES_MAX = 8;

function isEarlyRouteStopId(stopId?: string) {
  return Boolean(stopId && EARLY_ROUTE_STOP_IDS.has(resolveTtcLookupStopId(stopId)));
}

function scheduledDeparturesForDate(
  schedule380: SchedulePeriod[] | undefined,
  schedule316: SchedulePeriod[] | undefined,
  stopId: string,
  date: Date,
  daysUntil: number,
): ServiceDeparture[] {
  const lookupStopId = resolveTtcLookupStopId(stopId);
  const result: ServiceDeparture[] = [];
  const entries: [BusLine, SchedulePeriod[] | undefined][] = [
    ['380', schedule380],
    ['316', schedule316],
  ];

  for (const [bus, schedule] of entries) {
    const period = getSchedulePeriodForDate(schedule, date);
    if (!period) continue;
    const times = extractStopTimes(period, lookupStopId);

    for (const time of times) {
      const minsFromMidnight = parseTimeToMins(time);
      result.push({
        key: `${bus}-${serviceDateString(date)}-${minsFromMidnight}`,
        bus,
        time: formatTime(minsFromMidnight),
        minsUntil: daysUntil * 24 * 60 + minsFromMidnight,
        scheduledTime: formatTime(minsFromMidnight),
        scheduledMinsUntil: daysUntil * 24 * 60 + minsFromMidnight,
        date: serviceDateString(date),
        daysUntil,
        minsFromMidnight,
      });
    }
  }

  return result.sort((a, b) => a.daysUntil - b.daysUntil || a.minsFromMidnight - b.minsFromMidnight);
}

export function getLastDepartureToday(
  schedule380: SchedulePeriod[] | undefined,
  schedule316: SchedulePeriod[] | undefined,
  stopId: string,
  now = new Date(),
): ServiceDeparture | undefined {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const departures = scheduledDeparturesForDate(schedule380, schedule316, stopId, now, 0);
  const finalDeparture = departures.at(-1);
  return finalDeparture
    ? {
        ...finalDeparture,
        minsUntil: finalDeparture.minsFromMidnight - nowMins,
        scheduledMinsUntil: finalDeparture.minsFromMidnight - nowMins,
      }
    : undefined;
}

export function isFinalDepartureToday(
  departure: Pick<Departure, 'bus' | 'time' | 'scheduledTime'> | undefined,
  schedule380: SchedulePeriod[] | undefined,
  schedule316: SchedulePeriod[] | undefined,
  stopId: string,
  now = new Date(),
): boolean {
  if (!departure) return false;
  const finalDeparture = getLastDepartureToday(schedule380, schedule316, stopId, now);
  if (!finalDeparture) return false;
  return departure.bus === finalDeparture.bus && (departure.scheduledTime ?? departure.time) === finalDeparture.time;
}

export function getNextServiceDeparture(
  schedule380: SchedulePeriod[] | undefined,
  schedule316: SchedulePeriod[] | undefined,
  stopId: string,
  now = new Date(),
  lookaheadDays = 14,
): ServiceDeparture | undefined {
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (let daysUntil = 0; daysUntil <= lookaheadDays; daysUntil += 1) {
    const date = addServiceDays(now, daysUntil);
    const departures = scheduledDeparturesForDate(schedule380, schedule316, stopId, date, daysUntil)
      .filter(dep => daysUntil > 0 || dep.minsFromMidnight >= nowMins);
    if (departures.length > 0) {
      const first = departures[0];
      return {
        ...first,
        minsUntil: daysUntil * 24 * 60 + first.minsFromMidnight - nowMins,
        scheduledMinsUntil: daysUntil * 24 * 60 + first.minsFromMidnight - nowMins,
      };
    }
  }

  return undefined;
}

export function getDepartureServiceBoundary(
  schedule380: SchedulePeriod[] | undefined,
  schedule316: SchedulePeriod[] | undefined,
  stopId: string,
  nextDeparture: Pick<Departure, 'bus' | 'time' | 'scheduledTime'> | undefined,
  now = new Date(),
): DepartureServiceBoundary {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const todaysDepartures = scheduledDeparturesForDate(schedule380, schedule316, stopId, now, 0);
  const rawFinalDepartureToday = todaysDepartures.at(-1);
  const finalDepartureToday = rawFinalDepartureToday
    ? {
        ...rawFinalDepartureToday,
        minsUntil: rawFinalDepartureToday.minsFromMidnight - nowMins,
        scheduledMinsUntil: rawFinalDepartureToday.minsFromMidnight - nowMins,
      }
    : undefined;
  const serviceEndedToday = Boolean(finalDepartureToday && finalDepartureToday.minsFromMidnight < nowMins);
  const nextServiceDeparture = getNextServiceDeparture(schedule380, schedule316, stopId, now);

  return {
    finalDepartureToday,
    nextServiceDeparture,
    nextDepartureIsFinal: isFinalDepartureToday(nextDeparture, schedule380, schedule316, stopId, now),
    hasServiceToday: todaysDepartures.length > 0,
    serviceEndedToday,
  };
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
  options: { includeRecentPast?: boolean } = {},
): Departure[] {
  const lookupStopId = resolveTtcLookupStopId(stopId);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const midnightWrapThresholdMins = 12 * 60;
  const minMinsUntil = options.includeRecentPast
    ? -LIVE_ARRIVAL_MATCH_WINDOW_MINUTES
    : MIN_SCHEDULED_DEPARTURE_MINUTES;
  const result: Departure[] = [];

  const entries: [BusLine, SchedulePeriod[] | undefined][] = [
    ['380', schedule380],
    ['316', schedule316],
  ];

  for (const [bus, schedule] of entries) {
    if (!schedule) continue;
    const period = getTodayPeriod(schedule, now);
    if (!period) continue;
    const times = extractStopTimes(period, lookupStopId);

    for (const t of times) {
      const mins = parseTimeToMins(t);
      // Wrap only clearly next-day trips; slightly past departures should disappear.
      let minsUntil = mins - nowMins;
      if (minsUntil < -midnightWrapThresholdMins) minsUntil += 24 * 60;
      // Scheduled-only rows should not pretend a bus is "Now".
      // If a bus is still coming after schedule, TTC live data can surface it.
      if (minsUntil < minMinsUntil || minsUntil > horizonMins) continue;
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
 * and updates minsUntil to the realtime ETA. Unmatched live arrivals are
 * still shown because TTC can expose delayed buses after schedule time.
 */
export function mergeArrivalsIntoSchedule(
  departures: Departure[],
  arrivals: ArrivalTime[],
  now = new Date(),
  arrivalsUpdatedAt?: number,
  options: { stopId?: string } = {},
): Departure[] {
  const liveDataAgeMs = arrivalsUpdatedAt ? now.getTime() - arrivalsUpdatedAt : 0;
  const useLiveArrivals = !arrivalsUpdatedAt || liveDataAgeMs <= MAX_LIVE_ARRIVAL_AGE_MS;
  const elapsedLiveMinutes = useLiveArrivals && arrivalsUpdatedAt
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
    const scheduleCandidates = (byBus.get(bus) ?? [])
      .sort((a, b) => a.minsUntil - b.minsUntil);
    const scheduled = scheduleCandidates.filter(
      dep => dep.minsUntil >= MIN_SCHEDULED_DEPARTURE_MINUTES,
    );

    const realtimeArrivals = useLiveArrivals
      ? arrivals
          .filter(arrival => arrival.shortName === bus && arrival.realtime)
          .map(arrival => ({
            realtimeMinutes: arrival.realtimeArrivalMinutes - elapsedLiveMinutes,
            reportedRealtimeMinutes: arrival.realtimeArrivalMinutes,
            scheduledMinutes: arrival.scheduledArrivalMinutes - elapsedLiveMinutes,
          }))
          .filter(arrival => Number.isFinite(arrival.realtimeMinutes) && Number.isFinite(arrival.scheduledMinutes))
          .filter(arrival => arrival.realtimeMinutes > 0)
          .filter(arrival => !isSuspiciousEarlyStopLiveArrival(arrival, scheduleCandidates, options.stopId))
          .sort((a, b) => a.scheduledMinutes - b.scheduledMinutes)
      : [];

    if (scheduleCandidates.length === 0) {
      merged.push(...realtimeArrivals.map<Departure>(arrival => liveDepartureFromArrival(bus, arrival, now)));
      continue;
    }

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

    const matchedByIndex = new Map<number, { realtimeMinutes: number; scheduledMinutes: number }>();
    const usedScheduledIndexes = new Set<number>();
    const usedArrivalIndexes = new Set<number>();

    realtimeArrivals.forEach((arrival, arrivalIndex) => {
      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < scheduleCandidates.length; index += 1) {
        if (usedScheduledIndexes.has(index)) continue;
        const distance = Math.abs(scheduleCandidates[index].minsUntil - arrival.scheduledMinutes);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      }

      if (closestIndex === -1 || closestDistance > LIVE_ARRIVAL_MATCH_WINDOW_MINUTES) return;
      usedScheduledIndexes.add(closestIndex);
      usedArrivalIndexes.add(arrivalIndex);
      matchedByIndex.set(closestIndex, arrival);
    });

    realtimeArrivals.forEach((arrival, arrivalIndex) => {
      if (usedArrivalIndexes.has(arrivalIndex)) return;

      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (let index = 0; index < scheduleCandidates.length; index += 1) {
        if (usedScheduledIndexes.has(index)) continue;
        const driftMinutes = arrival.realtimeMinutes - scheduleCandidates[index].minsUntil;
        const distance = Math.abs(driftMinutes);
        if (distance > LIVE_TIMETABLE_FALLBACK_MATCH_WINDOW_MINUTES) continue;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      }

      if (closestIndex === -1) return;
      usedScheduledIndexes.add(closestIndex);
      usedArrivalIndexes.add(arrivalIndex);
      matchedByIndex.set(closestIndex, arrival);
    });

    for (let index = 0; index < scheduleCandidates.length; index += 1) {
      const dep = scheduleCandidates[index];
      const matchedArrival = matchedByIndex.get(index);

      if (matchedArrival != null) {
        const driftMinutes = matchedArrival.realtimeMinutes - dep.minsUntil;
        const hasTrustedScheduleAnchor = Math.abs(driftMinutes) <= MAX_TRUSTED_LIVE_DRIFT_MINUTES;
        merged.push({
          ...dep,
          status: 'live',
          live: true,
          cancelled: false,
          time: formatFutureTime(matchedArrival.realtimeMinutes, now),
          scheduledTime: hasTrustedScheduleAnchor ? (dep.scheduledTime ?? dep.time) : undefined,
          scheduledMinsUntil: hasTrustedScheduleAnchor ? dep.minsUntil : undefined,
          liveMinutes: matchedArrival.realtimeMinutes,
          driftMinutes: hasTrustedScheduleAnchor ? driftMinutes : undefined,
          minsUntil: matchedArrival.realtimeMinutes,
        });
        continue;
      }

      if (dep.minsUntil < MIN_SCHEDULED_DEPARTURE_MINUTES) continue;

      merged.push({
        ...dep,
        status: 'scheduled',
        live: false,
        cancelled: false,
        scheduledTime: dep.scheduledTime ?? dep.time,
        scheduledMinsUntil: dep.minsUntil,
      });
    }

    realtimeArrivals.forEach((arrival, index) => {
      if (usedArrivalIndexes.has(index)) return;
      merged.push(liveDepartureFromArrival(bus, arrival, now));
    });
  }

  return merged
    .filter(dep => dep.live || dep.minsUntil >= MIN_SCHEDULED_DEPARTURE_MINUTES)
    .sort((a, b) => a.minsUntil - b.minsUntil);
}

function isSuspiciousEarlyStopLiveArrival(
  arrival: { realtimeMinutes: number; reportedRealtimeMinutes: number; scheduledMinutes: number },
  scheduled: Departure[],
  stopId?: string,
) {
  if (!isEarlyRouteStopId(stopId)) return false;
  if (
    arrival.reportedRealtimeMinutes < SUSPICIOUS_ORIGIN_LIVE_MINUTES_MIN ||
    arrival.reportedRealtimeMinutes > SUSPICIOUS_ORIGIN_LIVE_MINUTES_MAX
  ) {
    return false;
  }

  const nearestSchedule = scheduled.reduce<Departure | undefined>((nearest, dep) => {
    if (!nearest) return dep;
    const depDistance = Math.abs(dep.minsUntil - arrival.scheduledMinutes);
    const nearestDistance = Math.abs(nearest.minsUntil - arrival.scheduledMinutes);
    return depDistance < nearestDistance ? dep : nearest;
  }, undefined);
  return Boolean(nearestSchedule && nearestSchedule.minsUntil < arrival.realtimeMinutes);
}

function liveDepartureFromArrival(
  bus: BusLine,
  arrival: { realtimeMinutes: number; scheduledMinutes: number },
  now: Date,
): Departure {
  return {
    key: `${bus}-live-${arrival.scheduledMinutes}-${arrival.realtimeMinutes}`,
    bus,
    status: 'live',
    live: true,
    cancelled: false,
    time: formatFutureTime(arrival.realtimeMinutes, now),
    minsUntil: arrival.realtimeMinutes,
    liveMinutes: arrival.realtimeMinutes,
  };
}

export function injectLiveDelayDemo(
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
  };

  const rest = base.filter(dep => dep.key !== demoTarget.key);
  return [demoLive, ...rest]
    .filter(dep => dep.minsUntil >= 0)
    .sort((a, b) => a.minsUntil - b.minsUntil);
}
