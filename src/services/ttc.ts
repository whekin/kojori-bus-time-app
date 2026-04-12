import { reportTtcFailure, reportTtcSuccess } from '@/hooks/use-ttc-health';

const BASE = 'https://transit.ttc.com.ge/pis-gateway/api';
const API_KEY = 'c0a2f304-551a-4d08-b8df-2c53ecd57f9f';

const headers = { 'x-api-key': API_KEY };

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

export interface PolylinePoint {
  latitude: number;
  longitude: number;
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
}

/**
 * All known stops for each direction.
 * Used in Settings to let the user pick favourites.
 * First entry = recommended default.
 */
export const ALL_TBILISI_STOPS: StopInfo[] = [
  { id: '1:3932', label: 'Nikoloz Baratashvili Street' }, // starting stop — most accurate schedule
  { id: '1:853',  label: 'Sulkhan-Saba Street' },
];

export const ALL_KOJORI_STOPS: StopInfo[] = [
  { id: '1:2856', label: 'Kojori, Vazha-Pshavela St #56' },
  { id: '1:3782', label: 'Kojori, Alexandre Chkheidze Street' },
  { id: '1:3537', label: 'Kojori, Nikoloz Baratashvili Street' },
];

/** Default favourite stop IDs shown as chips on home screen */
export const DEFAULT_TBILISI_FAVORITES = ALL_TBILISI_STOPS.map(s => s.id);
export const DEFAULT_KOJORI_FAVORITES  = ALL_KOJORI_STOPS.map(s => s.id);

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
  try {
    const res = await fetch(
      `${BASE}/v2/stops/${stopId}/arrival-times?locale=en&ignoreScheduledArrivalTimes=false`,
      { headers },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    reportTtcSuccess();
    return res.json();
  } catch (error) {
    reportTtcFailure();
    throw error;
  }
}

export async function fetchSchedule(
  routeId: string,
  patternSuffix: string,
): Promise<SchedulePeriod[]> {
  try {
    const res = await fetch(
      `${BASE}/v3/routes/${routeId}/schedule?patternSuffix=${patternSuffix}&locale=en`,
      { headers },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    reportTtcSuccess();
    return res.json();
  } catch (error) {
    reportTtcFailure();
    throw error;
  }
}

/** Fetches name + coordinates for a single stop. */
export async function fetchStopDetails(stopId: string): Promise<{ id: string; name: string }> {
  try {
    const res = await fetch(`${BASE}/v2/stops/${stopId}?locale=en`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    reportTtcSuccess();
    return { id: data.id ?? stopId, name: data.name };
  } catch (error) {
    reportTtcFailure();
    throw error;
  }
}

/** Fetches all stops for a route pattern — used in Settings to populate the full picker. */
export async function fetchRouteStops(routeId: string, patternSuffix: string): Promise<StopInfo[]> {
  try {
    const res = await fetch(
      `${BASE}/v3/routes/${routeId}/stops-of-patterns?patternSuffixes=${patternSuffix}&locale=en`,
      { headers },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Response: [{ stop: { id, name, ... }, patternSuffixes: [...] }]
    const raw: { stop: { id: string; name: string } }[] = await res.json();
    reportTtcSuccess();
    return raw.map(s => ({ id: s.stop.id, label: s.stop.name }));
  } catch (error) {
    reportTtcFailure();
    throw error;
  }
}

export async function fetchRoutePolyline(
  routeId: string,
  patternSuffix: string,
): Promise<PolylinePoint[]> {
  try {
    const res = await fetch(
      `${BASE}/v3/routes/${routeId}/stops-of-patterns?patternSuffixes=${patternSuffix}&locale=en`,
      { headers },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw: { stop: { lat?: number; lon?: number } }[] = await res.json();
    reportTtcSuccess();

    return raw
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
  } catch (error) {
    reportTtcFailure();
    throw error;
  }
}

export async function fetchVehiclePositions(
  routeId: string,
  patternSuffix: string,
): Promise<Record<string, VehiclePosition[]>> {
  try {
    const res = await fetch(
      `${BASE}/v3/routes/${routeId}/positions?patternSuffixes=${patternSuffix}`,
      { headers },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    reportTtcSuccess();
    return res.json();
  } catch (error) {
    reportTtcFailure();
    throw error;
  }
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
  bus: BusLine;
  time: string;      // display time "HH:mm"
  minsUntil: number;
  live?: boolean;
  scheduledMinsUntil?: number;
  liveMinutes?: number; // realtime ETA in mins (only when live=true)
  driftMinutes?: number;
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
): Departure[] {
  const now = new Date();
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
    const times = extractStopTimes(period, stopId);

    for (const t of times) {
      const mins = parseTimeToMins(t);
      // Wrap only clearly next-day trips; slightly past departures should disappear.
      let minsUntil = mins - nowMins;
      if (minsUntil < -midnightWrapThresholdMins) minsUntil += 24 * 60;
      if (minsUntil < 0 || minsUntil > horizonMins) continue;
      result.push({ bus, time: formatTime(mins), minsUntil });
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
): Departure[] {
  const now = new Date();

  return departures
    .map(dep => {
      const match = arrivals.find(
        a => a.shortName === dep.bus && Math.abs(a.realtimeArrivalMinutes - dep.minsUntil) <= 8,
      );
      if (!match) return dep;
      if (!match.realtime) {
        return {
          ...dep,
          live: false,
          scheduledMinsUntil: dep.minsUntil,
        };
      }

      return {
        ...dep,
        live: true,
        time: formatFutureTime(match.realtimeArrivalMinutes, now),
        scheduledMinsUntil: dep.minsUntil,
        liveMinutes: match.realtimeArrivalMinutes,
        driftMinutes: match.realtimeArrivalMinutes - dep.minsUntil,
        minsUntil: match.realtimeArrivalMinutes,
      };
    })
    .filter(dep => dep.minsUntil >= 0)
    .sort((a, b) => a.minsUntil - b.minsUntil);
}
