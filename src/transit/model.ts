import type {
  ArrivalTime,
  SchedulePeriod,
  StopInfo,
  VehiclePosition,
} from "@/services/ttc";
import { mergeArrivalsIntoSchedule } from "@/services/ttc";

export type TransitRoute = {
  id: string;
  shortName: string;
  longName: string;
  mode: string;
};
export type TransitPattern = {
  patternSuffix: string;
  headsign: string;
  firstStop?: { id: string; name: string };
  lastStop?: { id: string; name: string };
};
export type RouteDetails = TransitRoute & {
  patterns: TransitPattern[];
  defaultPatternSuffix?: string;
};
export type Boarding = {
  route: TransitRoute;
  pattern: TransitPattern;
  stop: StopInfo;
  savedStopIds?: string[];
};
/**
 * A trip: interchangeable routes towards one destination, boarded at one of
 * several saved stops. `stopId` is the stop the rider currently boards at.
 */
export type Favorite = {
  id: string;
  title: string;
  boardings: Boarding[];
  stopId?: string;
};
export type FavoritesState = {
  version: 2;
  favorites: Favorite[];
  selectedId: string | null;
};
export type TransitDeparture = {
  key: string;
  boarding: Boarding;
  epochMs: number;
  scheduledEpochMs: number;
  live: boolean;
  confirmed: boolean;
};

export function patternKey(boarding: Pick<Boarding, "route" | "pattern">) {
  return `${boarding.route.id}/${boarding.pattern.patternSuffix}`;
}

export function boardingKey(boarding: Boarding) {
  return `${patternKey(boarding)}/${boarding.stop.id}`;
}

/** Keep the bridge-stop exception local to the two routes it belongs to. */
export function lookupStopId(boarding: Boarding) {
  return ["1:R97505", "1:R98445"].includes(boarding.route.id) &&
    boarding.stop.id === "1:2994"
    ? "1:3932"
    : boarding.stop.id;
}

export function requiresVehicleEvidence(boarding: Pick<Boarding, "route">) {
  return ["1:R97505", "1:R98445"].includes(boarding.route.id);
}

export function upstreamVehicleCount(
  boarding: Boarding,
  periods: SchedulePeriod[],
  positions: Pick<VehiclePosition, "vehicleId" | "nextStopId">[],
  now: number,
) {
  const { period } = periodForDate(periods, transitDate(now));
  if (!period) return 0;
  const resolve = (id: string) =>
    requiresVehicleEvidence(boarding) && id === "1:2994" ? "1:3932" : id;
  const indexOf = (id: string) =>
    period.stops.findIndex((stop) => resolve(stop.id) === resolve(id));
  const selected = indexOf(boarding.stop.id);
  if (selected < 0) return 0;
  return new Set(
    positions
      .filter((position) => {
        const next = indexOf(position.nextStopId);
        return Boolean(position.vehicleId) && next >= 0 && next <= selected;
      })
      .map((position) => position.vehicleId),
  ).size;
}

/** Saved boarding stops of a trip, in the order the rider added them. */
export function tripStops(favorite: Favorite) {
  return favorite.boardings
    .map((b) => b.stop)
    .filter((stop, i, all) => all.findIndex((s) => s.id === stop.id) === i);
}

export function tripStopId(favorite: Favorite) {
  return favorite.boardings.some((b) => b.stop.id === favorite.stopId)
    ? favorite.stopId!
    : (favorite.boardings[0]?.stop.id ?? "");
}

/** Boardings at the active stop — what Departures, widgets and the map show. */
export function activeBoardings(favorite: Favorite) {
  const stopId = tripStopId(favorite);
  return favorite.boardings.filter((b) => b.stop.id === stopId);
}

/** One boarding per route pattern, regardless of how many stops are saved. */
export function tripPatterns(favorite: Favorite) {
  return favorite.boardings.filter(
    (b, i, all) =>
      all.findIndex((other) => patternKey(b) === patternKey(other)) === i,
  );
}

export function tripRoutes(favorite: Favorite) {
  return favorite.boardings
    .map((b) => b.route)
    .filter((route, i, all) => all.findIndex((r) => r.id === route.id) === i);
}

/** The saved trip running the same routes the other way, if there is one. */
export function reverseTrip(favorite: Favorite, favorites: Favorite[]) {
  const routes = tripRoutes(favorite)
    .map((r) => r.id)
    .sort()
    .join();
  const patterns = new Set(tripPatterns(favorite).map(patternKey));
  return favorites.find(
    (other) =>
      other.id !== favorite.id &&
      tripRoutes(other)
        .map((r) => r.id)
        .sort()
        .join() === routes &&
      tripPatterns(other).every((b) => !patterns.has(patternKey(b))),
  );
}

export function favoriteTitle(favorite: Favorite) {
  return (
    favorite.title.trim() ||
    [...new Set(favorite.boardings.map((b) => b.pattern.headsign))].join(" / ")
  );
}

export function routeAccentIndex(routeId: string) {
  if (routeId === "1:R97505") return 0;
  if (routeId === "1:R98445") return 1;
  return (
    [...routeId].reduce(
      (value, char) => (value * 31 + char.charCodeAt(0)) >>> 0,
      0,
    ) % 4
  );
}

/**
 * 380 and 316 keep their brand accents everywhere. Inside a trip, other routes
 * take the first accent no earlier route of that trip uses, so a trip never
 * shows two routes in the same colour; outside a trip they hash to an accent.
 */
export function tripRouteAccentIndex(routeId: string, favorite?: Favorite) {
  if (!favorite || routeId === "1:R97505" || routeId === "1:R98445")
    return routeAccentIndex(routeId);
  const used = new Set<number>();
  for (const route of tripRoutes(favorite)) {
    const fixed =
      route.id === "1:R97505" ? 0 : route.id === "1:R98445" ? 1 : null;
    const index =
      fixed ??
      [0, 1, 2, 3].find((i) => !used.has(i)) ??
      routeAccentIndex(route.id);
    if (route.id === routeId) return index;
    used.add(index);
  }
  return routeAccentIndex(routeId);
}

/** Nearby stops cannot resolve the rider's destination when choices overlap. */
export function nearbyFavorite(
  favorites: Favorite[],
  latitude: number,
  longitude: number,
) {
  const distances = favorites
    .map((favorite) => ({
      favorite,
      distance: Math.min(
        ...favorite.boardings.map((b) => {
          if (typeof b.stop.lat !== "number" || typeof b.stop.lon !== "number")
            return Infinity;
          return Math.hypot(
            (b.stop.lat - latitude) * 111_000,
            (b.stop.lon - longitude) * 83_000,
          );
        }),
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  const first = distances[0];
  if (!first || first.distance > 2500) return { status: "far" as const };
  if (distances[1] && distances[1].distance - first.distance < 100)
    return { status: "ambiguous" as const };
  return { status: "available" as const, favorite: first.favorite };
}

function isBoarding(value: unknown): value is Boarding {
  if (!value || typeof value !== "object") return false;
  const b = value as Boarding;
  return (
    typeof b.route?.id === "string" &&
    Boolean(b.route.id) &&
    typeof b.route.shortName === "string" &&
    typeof b.route.mode === "string" &&
    typeof b.pattern?.patternSuffix === "string" &&
    typeof b.pattern.headsign === "string" &&
    typeof b.stop?.id === "string" &&
    typeof b.stop.label === "string" &&
    (b.stop.lat === undefined ||
      (Number.isFinite(b.stop.lat) && Math.abs(b.stop.lat) <= 90)) &&
    (b.stop.lon === undefined ||
      (Number.isFinite(b.stop.lon) && Math.abs(b.stop.lon) <= 180)) &&
    (b.savedStopIds === undefined ||
      (Array.isArray(b.savedStopIds) &&
        b.savedStopIds.every((id) => typeof id === "string")))
  );
}

export function readFavoritesState(value: unknown): FavoritesState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Omit<FavoritesState, "version"> & { version: number };
  if ((raw.version !== 1 && raw.version !== 2) || !Array.isArray(raw.favorites))
    return null;
  const seen = new Set<string>();
  const favorites = raw.favorites
    .filter((favorite) => {
      if (
        !favorite ||
        typeof favorite.id !== "string" ||
        !favorite.id ||
        seen.has(favorite.id) ||
        typeof favorite.title !== "string" ||
        !Array.isArray(favorite.boardings) ||
        !favorite.boardings.length ||
        !favorite.boardings.every(isBoarding)
      )
        return false;
      seen.add(favorite.id);
      return true;
    })
    .map((favorite) => ({
      id: favorite.id,
      title: favorite.title,
      boardings: favorite.boardings.filter(
        (b, i, all) =>
          all.findIndex((other) => boardingKey(b) === boardingKey(other)) === i,
      ),
      ...(typeof favorite.stopId === "string"
        ? { stopId: favorite.stopId }
        : {}),
    }));
  const merged = raw.version === 1 ? mergeSplitTrips(favorites) : favorites;
  let selectedId = raw.selectedId;
  const oldSelected = favorites.find((f) => f.id === raw.selectedId);
  if (raw.version === 1 && oldSelected) {
    const trip = merged.find(
      (f) => !oldSelected.title && !f.title && samePatterns(oldSelected, f),
    );
    if (trip) {
      trip.stopId = oldSelected.boardings[0]?.stop.id;
      selectedId = trip.id;
    }
  }
  return {
    version: 2,
    favorites: merged,
    selectedId: merged.some((f) => f.id === selectedId)
      ? selectedId
      : (merged[0]?.id ?? null),
  };
}

function samePatterns(a: Favorite, b: Favorite) {
  const keys = (f: Favorite) => tripPatterns(f).map(patternKey).sort().join();
  return keys(a) === keys(b);
}

/**
 * Version 1 stored one favorite per boarding stop. Untitled entries running the
 * same patterns are one trip boarded at several stops.
 */
function mergeSplitTrips(favorites: Favorite[]) {
  const result: Favorite[] = [];
  for (const favorite of favorites) {
    const into = result.find(
      (f) => !f.title && !favorite.title && samePatterns(f, favorite),
    );
    if (!into) {
      result.push({
        ...favorite,
        id: favorite.id.replace(/^(legacy:to(?:Kojori|Tbilisi)):.*$/, "$1"),
        stopId: favorite.boardings[0]?.stop.id,
      });
      continue;
    }
    into.boardings = [
      ...into.boardings,
      ...favorite.boardings.filter(
        (b) => !into.boardings.some((o) => boardingKey(o) === boardingKey(b)),
      ),
    ];
  }
  return result;
}

const DAY_MS = 86_400_000;
const TBILISI_OFFSET_MS = 4 * 60 * 60_000;
const DAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export function transitDate(epochMs = Date.now()) {
  return new Date(epochMs + TBILISI_OFFSET_MS).toISOString().slice(0, 10);
}

export function shiftTransitDate(date: string, offset: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function serviceMidnight(date: string) {
  return Date.parse(`${date}T00:00:00+04:00`);
}

export function transitTime(epochMs: number) {
  return new Date(epochMs + TBILISI_OFFSET_MS).toISOString().slice(11, 16);
}

const SERVICE_DAY_START_MS = 4 * 60 * 60_000;

/**
 * The rider's "today": 04:00 to 04:00 Tbilisi time, so a 00:30 night trip
 * still counts as tonight's service rather than tomorrow's.
 */
export function serviceDayBounds(nowMs: number) {
  const start =
    serviceMidnight(transitDate(nowMs - SERVICE_DAY_START_MS)) +
    SERVICE_DAY_START_MS;
  return { start, end: start + DAY_MS };
}

export function periodForDate(periods: SchedulePeriod[], date: string) {
  const exact = periods.find((period) => period.serviceDates.includes(date));
  if (exact) return { period: exact, confirmed: true };
  const listedDates = periods.flatMap((period) => period.serviceDates).sort();
  if (
    listedDates.length &&
    !periods.some((period) => period.serviceDates.length === 0) &&
    date <= listedDates[listedDates.length - 1]
  ) {
    // Within a supplied calendar, a missing date is a real gap. Weekly fallback
    // is useful after expiry, but must not invent trips before service starts.
    return { period: undefined, confirmed: false };
  }
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const period = periods.find((p) => {
    const from = DAYS.indexOf(p.fromDay),
      to = DAYS.indexOf(p.toDay);
    return (
      from >= 0 &&
      to >= 0 &&
      (from <= to
        ? weekday >= from && weekday <= to
        : weekday >= from || weekday <= to)
    );
  });
  return { period, confirmed: false };
}

/** Absolute epochs in the provider timezone, including previous-day 24:xx service. */
export function scheduledDepartures(
  boarding: Boarding,
  periods: SchedulePeriod[],
  fromMs: number,
  toMs: number,
) {
  const departures: TransitDeparture[] = [];
  const firstDate = transitDate(fromMs);
  const days = Math.ceil((toMs - fromMs) / DAY_MS) + 1;
  const seen = new Set<number>();
  for (let offset = -1; offset <= days; offset += 1) {
    const date = shiftTransitDate(firstDate, offset);
    const { period, confirmed } = periodForDate(periods, date);
    const times =
      period?.stops
        .find((stop) => stop.id === lookupStopId(boarding))
        ?.arrivalTimes.split(",") ?? [];
    for (const time of times) {
      if (!/^\s*\d{1,2}:\d{2}\s*$/.test(time)) continue;
      const [hours, minutes] = time.trim().split(":").map(Number);
      if (hours >= 48 || minutes >= 60) continue;
      const epochMs = serviceMidnight(date) + (hours * 60 + minutes) * 60_000;
      if (epochMs < fromMs || epochMs > toMs || seen.has(epochMs)) continue;
      seen.add(epochMs);
      departures.push({
        key: `${boardingKey(boarding)}/${epochMs}`,
        boarding,
        epochMs,
        scheduledEpochMs: epochMs,
        live: false,
        confirmed,
      });
    }
  }
  return departures.sort((a, b) => a.epochMs - b.epochMs);
}

export function mergeTransitArrivals(
  boarding: Boarding,
  scheduled: TransitDeparture[],
  arrivals: ArrivalTime[],
  nowMs: number,
  updatedAt: number,
  vehicleCount?: number,
) {
  const result = scheduled.map((departure) => ({ ...departure }));
  if (!updatedAt || nowMs - updatedAt > 90_000)
    return result.filter((dep) => dep.epochMs > nowMs);
  const elapsed = Math.max(0, (nowMs - updatedAt) / 60_000);
  const matched = new Set<string>();
  const live = arrivals.filter(
    (arrival) =>
      arrival.realtime &&
      arrival.shortName === boarding.route.shortName &&
      arrival.patternSuffix === boarding.pattern.patternSuffix &&
      (!arrival.vehicleMode || arrival.vehicleMode === boarding.route.mode),
  );
  // Preserve the measured first-stop safeguards for Kojori without applying
  // those route-specific tolerances to unrelated TTC routes.
  if (requiresVehicleEvidence(boarding)) {
    const bus = boarding.route.id === "1:R97505" ? "380" : "316";
    const merged = mergeArrivalsIntoSchedule(
      scheduled.map((dep) => ({
        key: dep.key,
        bus,
        time: transitTime(dep.epochMs),
        minsUntil: (dep.epochMs - nowMs) / 60_000,
        scheduledTime: transitTime(dep.scheduledEpochMs),
        status: "scheduled",
      })),
      live,
      new Date(nowMs),
      updatedAt,
      {
        stopId: boarding.stop.id,
        liveVehicleCounts: { [bus]: vehicleCount ?? 0 },
      },
    );
    return merged.map((dep) => ({
      key: dep.key,
      boarding,
      epochMs: nowMs + dep.minsUntil * 60_000,
      scheduledEpochMs:
        nowMs + (dep.scheduledMinsUntil ?? dep.minsUntil) * 60_000,
      live: Boolean(dep.live),
      confirmed:
        scheduled.find((row) => row.key === dep.key)?.confirmed ??
        Boolean(dep.live),
    }));
  }
  for (const arrival of live) {
    const mins = arrival.realtimeArrivalMinutes - elapsed;
    if (!Number.isFinite(mins) || mins <= 0) continue;
    const epochMs = nowMs + mins * 60_000;
    const rawAnchor =
      nowMs + (arrival.scheduledArrivalMinutes - elapsed) * 60_000;
    const plausibleAnchor =
      Number.isFinite(rawAnchor) &&
      Math.abs(rawAnchor - epochMs) <= 45 * 60_000;
    const anchorMs = plausibleAnchor ? rawAnchor : epochMs;
    const nearest = result
      .filter(
        (dep) =>
          !matched.has(dep.key) &&
          Math.abs(dep.scheduledEpochMs - anchorMs) <= 8 * 60_000,
      )
      .sort(
        (a, b) =>
          Math.abs(a.scheduledEpochMs - anchorMs) -
          Math.abs(b.scheduledEpochMs - anchorMs),
      )[0];
    if (nearest) {
      matched.add(nearest.key);
      nearest.epochMs = epochMs;
      nearest.live = true;
    } else {
      result.push({
        key: `${boardingKey(boarding)}/live/${Math.round(anchorMs / 60_000)}`,
        boarding,
        epochMs,
        scheduledEpochMs: anchorMs,
        live: true,
        confirmed: true,
      });
    }
  }
  return result
    .filter((dep) => dep.epochMs > nowMs)
    .sort((a, b) => a.epochMs - b.epochMs);
}
