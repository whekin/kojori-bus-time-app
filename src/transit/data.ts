import { submitPositionObservations } from "./observations";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, queryOptions } from "@tanstack/react-query";

import catalog from "@/assets/ttc-routes.json";
import {
  BAKED_POLYLINES,
  BAKED_SCHEDULES,
  BAKED_STOPS,
  BAKED_AT,
} from "@/assets/ttc-baked";
import {
  decodeGooglePolyline,
  fetchTtcJson,
  ROUTES,
  type ArrivalTime,
  type PolylinePoint,
  type SchedulePeriod,
  type StopInfo,
  type TtcLocale,
  type VehiclePosition,
} from "@/services/ttc";
import { reportTtcFailure } from "@/hooks/use-ttc-health";
import type { TtcQueryKind } from "@/services/ttc-query-log";
import {
  patternKey,
  type Boarding,
  type RouteDetails,
  type TransitRoute,
} from "./model";

const BASE = "https://transit.ttc.com.ge/pis-gateway/api";
const CACHE_PREFIX = "@ttc_transit_v1:";
const DAY = 86_400_000;
const waiting: (() => void)[] = [];
let running = 0;
let cacheGeneration = 0;
let writes = Promise.resolve();

async function request<T>(
  path: string,
  kind: TtcQueryKind,
  signal?: AbortSignal,
): Promise<T> {
  if (running >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else running += 1;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 20_000);
  try {
    return await fetchTtcJson<T>(`${BASE}${path}`, kind, controller.signal);
  } catch (error) {
    // Cancellations are neutral in fetchTtcJson; an unanswered TTC is not.
    if (timedOut) reportTtcFailure();
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  }
}

type Envelope = {
  queryKey: readonly unknown[];
  data: unknown;
  updatedAt: number;
};
function validCacheData(kind: unknown, data: unknown) {
  const object = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object";
  if (kind === "details")
    return (
      object(data) &&
      Array.isArray(data.patterns) &&
      data.patterns.every(
        (pattern) =>
          object(pattern) &&
          typeof pattern.patternSuffix === "string" &&
          typeof pattern.headsign === "string",
      )
    );
  if (!Array.isArray(data)) return false;
  if (kind === "catalog")
    return data.every(
      (route) =>
        object(route) &&
        typeof route.id === "string" &&
        typeof route.shortName === "string" &&
        typeof route.mode === "string",
    );
  if (kind === "stops")
    return data.every(
      (stop) =>
        object(stop) &&
        typeof stop.id === "string" &&
        typeof stop.label === "string",
    );
  if (kind === "geometry")
    return data.every(
      (point) =>
        object(point) &&
        typeof point.latitude === "number" &&
        typeof point.longitude === "number" &&
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude),
    );
  if (kind === "schedule")
    return data.every(
      (period) =>
        object(period) &&
        Array.isArray(period.serviceDates) &&
        Array.isArray(period.stops) &&
        period.stops.every(
          (stop) =>
            object(stop) &&
            typeof stop.id === "string" &&
            typeof stop.arrivalTimes === "string",
        ),
    );
  return false;
}

async function save(
  queryKey: readonly unknown[],
  data: unknown,
  generation: number,
) {
  writes = writes
    .catch(() => {})
    .then(async () => {
      if (generation !== cacheGeneration) return;
      await AsyncStorage.setItem(
        CACHE_PREFIX + JSON.stringify(queryKey),
        JSON.stringify({
          queryKey,
          data,
          updatedAt: Date.now(),
        } satisfies Envelope),
      );
    })
    .catch(() => {});
  await writes;
  return data;
}

export async function clearTransitData(client: QueryClient) {
  cacheGeneration += 1;
  await client.cancelQueries({ queryKey: ["transit"] });
  await writes;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(CACHE_PREFIX),
  );
  await AsyncStorage.multiRemove(keys);
  client.removeQueries({ queryKey: ["transit"] });
}

export async function hydrateTransitCache(client: QueryClient) {
  // Prefer a new bundled timetable over an older download, and preserve the
  // true update date when a newer legacy cache is carried forward.
  for (const [number, route] of Object.entries(ROUTES)) {
    for (const suffix of [route.toKojori, route.toTbilisi]) {
      const direction = suffix === route.toKojori ? "toKojori" : "toTbilisi";
      const seedKey = `${number}_${direction}` as keyof typeof BAKED_SCHEDULES;
      let data: unknown = BAKED_SCHEDULES[seedKey];
      let updatedAt = Date.parse(BAKED_AT);
      try {
        const raw = await AsyncStorage.getItem(
          `@ttc_schedule_${route.id}_${suffix.replace(":", "_")}`,
        );
        const envelope = raw ? JSON.parse(raw) : null;
        if (
          typeof envelope?.cachedAt === "number" &&
          envelope.cachedAt > updatedAt &&
          validCacheData("schedule", envelope.data)
        ) {
          updatedAt = envelope.cachedAt;
          data = envelope.data;
        }
      } catch {
        /* Bundled data remains available. */
      }
      client.setQueryData(
        ["transit", "schedule", `${route.id}/${suffix}`],
        data,
        { updatedAt },
      );
    }
  }
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(CACHE_PREFIX),
  );
  const entries = await AsyncStorage.multiGet(keys);
  for (const [, raw] of entries) {
    try {
      const entry = JSON.parse(raw ?? "") as Envelope;
      if (
        Array.isArray(entry.queryKey) &&
        entry.queryKey[0] === "transit" &&
        typeof entry.updatedAt === "number" &&
        validCacheData(entry.queryKey[1], entry.data)
      ) {
        if (
          (client.getQueryState(entry.queryKey)?.dataUpdatedAt ?? 0) <=
          entry.updatedAt
        ) {
          client.setQueryData(entry.queryKey, entry.data, {
            updatedAt: entry.updatedAt,
          });
        }
      }
    } catch {
      /* A corrupt entry must not block the rest of the offline data. */
    }
  }
}

export function bakedKey(boarding: Pick<Boarding, "route" | "pattern">) {
  if (!["0:01", "1:01"].includes(boarding.pattern.patternSuffix)) return null;
  if (boarding.route.id === "1:R97505")
    return `380_${boarding.pattern.patternSuffix === "0:01" ? "toKojori" : "toTbilisi"}`;
  if (boarding.route.id === "1:R98445")
    return `316_${boarding.pattern.patternSuffix === "1:01" ? "toKojori" : "toTbilisi"}`;
  return null;
}

export const INITIAL_ROUTES = catalog.routes as TransitRoute[];

export function routesQuery(locale: TtcLocale) {
  const queryKey = ["transit", "catalog", locale];
  return queryOptions({
    queryKey,
    meta: { source: "ttc" },
    staleTime: DAY,
    retry: 0,
    initialData: locale === "en" ? INITIAL_ROUTES : undefined,
    initialDataUpdatedAt: Date.parse(catalog.updatedAt),
    queryFn: async ({ signal }) => {
      const generation = cacheGeneration;
      const data = await request<TransitRoute[]>(
        `/v3/routes?locale=${locale}`,
        "catalog",
        signal,
      );
      if (
        !Array.isArray(data) ||
        data.some((route) => !route.id || !route.shortName)
      )
        throw new Error("Invalid TTC catalog");
      await save(queryKey, data, generation);
      return data;
    },
  });
}

export function detailsQuery(route: TransitRoute, locale: TtcLocale) {
  const queryKey = ["transit", "details", route.id, locale];
  const legacy = Object.entries(ROUTES).find(
    ([, value]) => value.id === route.id,
  );
  const seed: RouteDetails | undefined = legacy
    ? {
        ...route,
        patterns: (["toKojori", "toTbilisi"] as const).map((direction) => ({
          patternSuffix: legacy[1][direction],
          headsign: direction === "toKojori" ? "Kojori" : "Tbilisi",
        })),
      }
    : undefined;
  return queryOptions({
    queryKey,
    meta: { source: "ttc" },
    staleTime: DAY,
    retry: 0,
    initialData: seed,
    initialDataUpdatedAt: Date.parse(BAKED_AT),
    queryFn: async ({ signal }) => {
      const generation = cacheGeneration;
      const data = await request<RouteDetails>(
        `/v3/routes/${encodeURIComponent(route.id)}?locale=${locale}`,
        "catalog",
        signal,
      );
      if (!Array.isArray(data.patterns))
        throw new Error("TTC directions unavailable");
      const result = {
        ...route,
        ...data,
        longName: data.longName ?? route.longName,
      };
      await save(queryKey, result, generation);
      return result;
    },
  });
}

/** Routes TTC says call at a stop — used to suggest alternatives for a trip. */
export function stopRoutesQuery(stopId: string, locale: TtcLocale) {
  return queryOptions({
    queryKey: ["transit", "stop-routes", stopId, locale],
    meta: { source: "ttc" },
    staleTime: DAY,
    retry: 0,
    queryFn: async ({ signal }) => {
      const data = await request<TransitRoute[]>(
        `/v2/stops/${encodeURIComponent(stopId)}/routes?locale=${locale}`,
        "catalog",
        signal,
      );
      if (!Array.isArray(data)) throw new Error("Invalid TTC stop routes");
      return data.filter((route) => route.id && route.shortName);
    },
  });
}

export function stopsQuery(
  boarding: Pick<Boarding, "route" | "pattern">,
  locale: TtcLocale,
) {
  const queryKey = ["transit", "stops", patternKey(boarding), locale];
  const key = bakedKey(boarding) as keyof typeof BAKED_STOPS | null;
  const seed = key
    ? (
        BAKED_STOPS[key] as unknown as {
          stop: { id: string; name: string; lat: number; lon: number };
        }[]
      )?.map(({ stop }) => ({
        id: stop.id,
        label: stop.name,
        lat: stop.lat,
        lon: stop.lon,
      }))
    : undefined;
  return queryOptions({
    queryKey,
    meta: { source: "ttc" },
    staleTime: DAY,
    retry: 0,
    initialData: seed,
    initialDataUpdatedAt: Date.parse(BAKED_AT),
    queryFn: async ({ signal }) => {
      const generation = cacheGeneration;
      const data = await request<
        { stop: { id: string; name: string; lat?: number; lon?: number } }[]
      >(
        `/v3/routes/${encodeURIComponent(boarding.route.id)}/stops-of-patterns?patternSuffixes=${encodeURIComponent(boarding.pattern.patternSuffix)}&locale=${locale}`,
        "route-stops",
        signal,
      );
      const stops: StopInfo[] = data.map(({ stop }) => ({
        id: stop.id,
        label: stop.name,
        lat: stop.lat,
        lon: stop.lon,
      }));
      if (
        key?.endsWith("toKojori") &&
        !stops.some((stop) => stop.id === "1:2994")
      ) {
        stops.unshift({
          id: "1:2994",
          label: "Elene Akhvlediani Street",
          lat: 41.697618,
          lon: 44.809107,
        });
      }
      await save(queryKey, stops, generation);
      return stops;
    },
  });
}

export function scheduleQuery(boarding: Boarding) {
  const queryKey = ["transit", "schedule", patternKey(boarding)];
  const key = bakedKey(boarding) as keyof typeof BAKED_SCHEDULES | null;
  return queryOptions({
    queryKey,
    meta: { source: "ttc" },
    staleTime: 12 * 60 * 60_000,
    retry: 0,
    refetchInterval: (query) =>
      query.state.status === "error" ? 5 * 60_000 : 12 * 60 * 60_000,
    initialData: key
      ? (BAKED_SCHEDULES[key] as unknown as SchedulePeriod[])
      : undefined,
    initialDataUpdatedAt: Date.parse(BAKED_AT),
    queryFn: async ({ signal }) => {
      const generation = cacheGeneration;
      const data = await request<SchedulePeriod[]>(
        `/v3/routes/${encodeURIComponent(boarding.route.id)}/schedule?patternSuffix=${encodeURIComponent(boarding.pattern.patternSuffix)}&locale=en`,
        "schedule",
        signal,
      );
      if (!Array.isArray(data)) throw new Error("TTC timetable unavailable");
      await save(queryKey, data, generation);
      return data;
    },
  });
}

export function geometryQuery(boarding: Boarding) {
  const queryKey = ["transit", "geometry", patternKey(boarding)];
  const key = bakedKey(boarding) as keyof typeof BAKED_POLYLINES | null;
  return queryOptions({
    queryKey,
    meta: { source: "ttc" },
    staleTime: 30 * DAY,
    retry: 0,
    initialData: key ? decodeGooglePolyline(BAKED_POLYLINES[key]) : undefined,
    initialDataUpdatedAt: Date.parse(BAKED_AT),
    queryFn: async ({ signal }): Promise<PolylinePoint[]> => {
      const generation = cacheGeneration;
      const data = await request<Record<string, { encodedValue?: string }>>(
        `/v3/routes/${encodeURIComponent(boarding.route.id)}/polylines?patternSuffixes=${encodeURIComponent(boarding.pattern.patternSuffix)}`,
        "route-polylines",
        signal,
      );
      const points = decodeGooglePolyline(
        data[boarding.pattern.patternSuffix]?.encodedValue ?? "",
      );
      await save(queryKey, points, generation);
      return points;
    },
  });
}

export function arrivalsQuery(
  boarding: Boarding,
  locale: TtcLocale,
  enabled: boolean,
) {
  const proxy =
    ["1:R97505", "1:R98445"].includes(boarding.route.id) &&
    boarding.stop.id === "1:2994"
      ? "1:3932"
      : boarding.stop.id;
  return queryOptions<ArrivalTime[]>({
    queryKey: ["transit", "arrivals", proxy, locale],
    meta: { source: "ttc" },
    enabled,
    staleTime: 20_000,
    retry: 0,
    refetchInterval: (query) =>
      enabled ? (query.state.status === "error" ? 60_000 : 30_000) : false,
    queryFn: ({ signal }) =>
      request<ArrivalTime[]>(
        `/v2/stops/${encodeURIComponent(proxy)}/arrival-times?locale=${locale}&ignoreScheduledArrivalTimes=false`,
        "arrivals",
        signal,
      ),
  });
}

export function positionsQuery(
  boarding: Boarding,
  enabled: boolean,
  refreshMs = 10_000,
) {
  return queryOptions<VehiclePosition[]>({
    queryKey: ["transit", "vehicles", patternKey(boarding)],
    meta: { source: "ttc" },
    enabled,
    staleTime: 4_000,
    retry: 0,
    refetchInterval: (query) =>
      enabled ? (query.state.status === "error" ? 60_000 : refreshMs) : false,
    queryFn: async ({ signal }) => {
      const data = await request<Record<string, VehiclePosition[]>>(
        `/v3/routes/${encodeURIComponent(boarding.route.id)}/positions?patternSuffixes=${encodeURIComponent(boarding.pattern.patternSuffix)}`,
        "vehicle-positions",
        signal,
      );
      // Only report the requested direction; a malformed extra pattern must not
      // be attributed to this boarding. Upload never blocks the TTC query.
      void submitPositionObservations(boarding.route.id, boarding.pattern.patternSuffix,
        data[boarding.pattern.patternSuffix] ?? [], Date.now());
      return Object.values(data)
        .flat()
        .filter(
          (p) =>
            Number.isFinite(p.lat) &&
            Number.isFinite(p.lon) &&
            Math.abs(p.lat) <= 90 &&
            Math.abs(p.lon) <= 180 &&
            (p.lat !== 0 || p.lon !== 0),
        );
    },
  });
}
