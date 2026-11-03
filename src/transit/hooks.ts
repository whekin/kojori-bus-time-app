import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

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
    queries: arrivalBoardings.map((b) => arrivalsQuery(b, ttcLocale, active)),
  });
  const evidencePatterns = patterns.filter(requiresVehicleEvidence);
  const evidence = useQueries({
    queries: evidencePatterns.map((b) => positionsQuery(b, active, 30_000)),
  });
  const rows = boardings
    .flatMap((boarding) => {
      if (!active) return [];
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
      return mergeTransitArrivals(
        boarding,
        scheduled,
        arrival?.data ?? [],
        now,
        arrival?.dataUpdatedAt ?? 0,
        vehicleCount,
      );
    })
    .sort((a, b) => a.epochMs - b.epochMs);
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
  const liveQueries = arrivals.filter((query) => query.dataUpdatedAt > 0);
  return {
    rows,
    servedToday,
    missingStops,
    loading: schedules.some((query) => query.isLoading),
    refreshing: [...schedules, ...arrivals].some((query) => query.isFetching),
    hasSchedule: schedules.some((query) => Boolean(query.data?.length)),
    failedCount: schedules.filter((query) => query.isError).length,
    liveFailed: arrivals.some((query) => query.isError),
    updatedAt: liveQueries.length
      ? Math.min(...liveQueries.map((query) => query.dataUpdatedAt))
      : 0,
    refresh: () =>
      Promise.all(
        [...schedules, ...arrivals, ...evidence].map((query) =>
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
