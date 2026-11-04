import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { fetchPassedEarly, passedEarlyEnabled, passedEarlyBoardingEnabled, watchPassedEarlyExpiry, removePassedSlots, selectPassedEarly } from "./passed-early";
import { arrivalSource, backendRows, fetchBackendDepartures } from "./backend";
import { useI18n } from "@/hooks/use-i18n";
import {
  arrivalsQuery,
  geometryQuery,
  positionsQuery,
  scheduleQuery,
  stopsQuery,
} from "./data";
import {
  activeBoardings,
  boardingKey,
  lookupStopId,
  mergeTransitArrivals,
  patternKey,
  requiresVehicleEvidence,
  upstreamVehicleCount,
  scheduledDepartures,
  serviceDayBounds,
  type Favorite,
} from "./model";

export function useTransitNow(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (AppState.currentState !== "background") setNow(Date.now());
    };
    tick();
    const interval = setInterval(tick, 15_000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearInterval(interval);
      listener.remove();
    };
  }, [active]);
  return now;
}

export function useFavoriteDepartures(
  favorite: Favorite | undefined,
  active: boolean,
  now: number,
) {
  const { ttcLocale } = useI18n();
  const boardings = favorite ? activeBoardings(favorite) : [];
  const patterns = boardings.filter(
    (b, i, all) =>
      all.findIndex((other) => patternKey(b) === patternKey(other)) === i,
  );
  const schedules = useQueries({
    queries: patterns.map((b) => ({ ...scheduleQuery(b), enabled: active })),
  });
  const arrivalBoardings = boardings.filter(
    (b, i, all) =>
      all.findIndex((other) => lookupStopId(b) === lookupStopId(other)) === i,
  );
  const arrivals = useQueries({
    queries: arrivalBoardings.map((b) => arrivalsQuery(b, ttcLocale, active && arrivalSource === "ttc")),
  });
  const evidencePatterns = patterns.filter(requiresVehicleEvidence);
  const evidence = useQueries({
    queries: evidencePatterns.map((b) => positionsQuery(b, active, 30_000)),
  });
  const contexts = boardings
    .map((boarding) => {
      const schedule =
        schedules[
          patterns.findIndex((b) => patternKey(b) === patternKey(boarding))
        ];
      const arrival =
        arrivals[
          arrivalBoardings.findIndex(
            (b) => lookupStopId(b) === lookupStopId(boarding),
          )
        ];
      const vehicles =
        evidence[
          evidencePatterns.findIndex(
            (b) => patternKey(b) === patternKey(boarding),
          )
        ];
      const vehicleCount =
        vehicles?.data &&
        !vehicles.isError &&
        now - vehicles.dataUpdatedAt <= 90_000
          ? upstreamVehicleCount(
              boarding,
              schedule?.data ?? [],
              vehicles.data,
              now,
            )
          : 0;
      const today = scheduledDepartures(
        boarding,
        schedule?.data ?? [],
        now - 8 * 60_000,
        now + 86_400_000,
      );
      const scheduled = (
        today.length
          ? today
          : scheduledDepartures(
              boarding,
              schedule?.data ?? [],
              now - 8 * 60_000,
              now + 7 * 86_400_000,
            )
      ).slice(0, 32);
      return { boarding, scheduled, arrival, vehicleCount, evidenceAt: vehicles?.isError ? 0 : vehicles?.dataUpdatedAt ?? 0 };
    });
  const backend = useQueries({
    queries: contexts.map(({ boarding, scheduled, vehicleCount, evidenceAt }) => ({
      queryKey: ['gzaap', 'departures', boardingKey(boarding), scheduled.map(r => [r.key, r.epochMs, r.scheduledEpochMs, r.confirmed]), vehicleCount],
      enabled: active && arrivalSource === 'gzaap',
      staleTime: 20000,
      retry: false,
      refetchInterval: active && arrivalSource === 'gzaap' ? 30000 : false as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchBackendDepartures(boarding, scheduled, { count: vehicleCount, observedAt: evidenceAt }, signal),
    })),
  });
  const passed = useQueries({
    queries: boardings.map(boarding => ({
      queryKey: ['gzaap', 'passed-early', boardingKey(boarding)],
      enabled: active && passedEarlyEnabled && passedEarlyBoardingEnabled(boarding) && requiresVehicleEvidence(boarding),
      retry: false,
      staleTime: 8000,
      refetchInterval: active && passedEarlyEnabled && passedEarlyBoardingEnabled(boarding) && requiresVehicleEvidence(boarding) ? 15000 : false as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchPassedEarly(boarding, signal),
    })),
  });
  const [expiryClock, setExpiryClock] = useState(0);
  const cardNow = Math.max(now, expiryClock);
  const passedEarlyCards = active && passedEarlyEnabled ? contexts.flatMap(({ boarding, scheduled }, index) =>
    !passedEarlyBoardingEnabled(boarding) ? [] : selectPassedEarly(passed[index]?.data, passed[index]?.isError ?? false, scheduled, cardNow)) : [];
  const nextExpiry = passedEarlyCards.length ? Math.min(...passedEarlyCards.map(c => c.hideAt), ...passed.map(q => q.data?.validUntil ?? Infinity).filter(deadline => deadline > cardNow)) : 0;
  useEffect(() => {
    if (!active || !nextExpiry) return;
    return watchPassedEarlyExpiry(nextExpiry, setExpiryClock);
  }, [active, nextExpiry]);
  const rows = removePassedSlots(contexts.flatMap(({ boarding, scheduled, arrival, vehicleCount }, index) => {
    if (!active) return [];
    if (arrivalSource === 'gzaap') return backendRows(backend[index]?.data, backend[index]?.isError ?? false, scheduled, now);
    return mergeTransitArrivals(boarding, scheduled, arrival?.data ?? [], now, arrival?.dataUpdatedAt ?? 0, vehicleCount);
  }).filter(row => row.epochMs > cardNow), passedEarlyCards).sort((a, b) => a.epochMs - b.epochMs);
  const missingStops = boardings.filter((boarding) => {
    const schedule =
      schedules[
        patterns.findIndex((b) => patternKey(b) === patternKey(boarding))
      ];
    const data = schedule?.data;
    return (
      Boolean(data?.length) &&
      !data?.some((period) =>
        period.stops.some((stop) => stop.id === lookupStopId(boarding)),
      )
    );
  });
  const { start: dayStart } = serviceDayBounds(now);
  const servedToday = boardings.some((boarding) => {
    const schedule =
      schedules[
        patterns.findIndex((b) => patternKey(b) === patternKey(boarding))
      ];
    return (
      scheduledDepartures(boarding, schedule?.data ?? [], dayStart, now)
        .length > 0
    );
  });
  const sourceQueries = arrivalSource === "gzaap" ? backend : arrivals;
  const liveQueries = sourceQueries.filter((query) => query.dataUpdatedAt > 0);
  return {
    rows,
    passedEarlyCards,
    servedToday,
    missingStops,
    loading: schedules.some((query) => query.isLoading),
    refreshing: [...schedules, ...sourceQueries].some((query) => query.isFetching),
    hasSchedule: schedules.some((query) => Boolean(query.data?.length)),
    failedCount: schedules.filter((query) => query.isError).length,
    liveFailed: sourceQueries.some((query) => query.isError),
    updatedAt: liveQueries.length
      ? Math.min(...liveQueries.map((query) => arrivalSource === "gzaap" ? (query.data as { observedAt?: number } | undefined)?.observedAt ?? 0 : query.dataUpdatedAt))
      : 0,
    refresh: () =>
      Promise.all(
        [...schedules, ...sourceQueries, ...evidence, ...(passedEarlyEnabled ? passed.filter((_, i) => passedEarlyBoardingEnabled(boardings[i]) && requiresVehicleEvidence(boardings[i])) : [])].map((query) =>
          query.refetch(),
        ),
      ),
  };
}

export function useFavoriteMap(
  favorite: Favorite | undefined,
  active: boolean,
) {
  const { ttcLocale } = useI18n();
  const boardings = (favorite?.boardings ?? []).filter(
    (b, i, all) =>
      all.findIndex((other) => patternKey(b) === patternKey(other)) === i,
  );
  const stops = useQueries({
    queries: boardings.map((b) => ({
      ...stopsQuery(b, ttcLocale),
      enabled: active,
    })),
  });
  const shapes = useQueries({
    queries: boardings.map((b) => ({ ...geometryQuery(b), enabled: active })),
  });
  const vehicles = useQueries({
    queries: boardings.map((b) => positionsQuery(b, active)),
  });
  return {
    routes: boardings.map((boarding, index) => ({
      key: boardingKey(boarding),
      boarding,
      stops: stops[index]?.data ?? [],
      points: shapes[index]?.data?.length
        ? shapes[index].data
        : (stops[index]?.data ?? [])
            .filter(
              (stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon),
            )
            .map((stop) => ({ latitude: stop.lat!, longitude: stop.lon! })),
      vehicles: vehicles[index]?.isError ? [] : (vehicles[index]?.data ?? []),
      error: vehicles[index]?.isError ?? false,
    })),
    refreshing: [...stops, ...shapes, ...vehicles].some(
      (query) => query.isFetching,
    ),
    refresh: () =>
      Promise.all(
        [...stops, ...shapes, ...vehicles].map((query) => query.refetch()),
      ),
  };
}
