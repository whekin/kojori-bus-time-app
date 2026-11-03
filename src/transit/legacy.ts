import catalog from "@/assets/ttc-routes.json";
import { BAKED_STOPS } from "@/assets/ttc-baked";
import type { Settings } from "@/hooks/use-settings";
import {
  type Boarding,
  type Favorite,
  type FavoritesState,
  type TransitRoute,
} from "./model";

const DIRECTIONS = ["toKojori", "toTbilisi"] as const;

function legacyStop(
  number: "380" | "316",
  direction: (typeof DIRECTIONS)[number],
  stopId: string,
) {
  const key = `${number}_${direction}` as keyof typeof BAKED_STOPS;
  const rawStops = BAKED_STOPS[key] as unknown as {
    stop: { id: string; name: string; lat?: number; lon?: number };
  }[];
  const raw = rawStops.find(({ stop }) => stop.id === stopId)?.stop;
  if (raw) return { id: raw.id, label: raw.name, lat: raw.lat, lon: raw.lon };
  // TTC omits the actual first stop from its stop lists.
  return stopId === "1:2994" && direction === "toKojori"
    ? {
        id: stopId,
        label: "Elene Akhvlediani Street",
        lat: 41.697618,
        lon: 44.809107,
      }
    : null;
}

/**
 * One-time migration of the version-2 settings: each direction becomes a trip
 * on 380 + 316 boarded at the rider's saved stops. Kojori defaults stay data.
 */
export function migrateLegacyFavorites(settings: Settings): FavoritesState {
  const favorites = DIRECTIONS.map((direction): Favorite => {
    const toKojori = direction === "toKojori";
    const active = toKojori
      ? settings.activeTbilisiStopId
      : settings.activeKojoriStopId;
    const stopIds = [
      ...new Set([
        active,
        ...(toKojori ? settings.tbilisiFavorites : settings.kojoriFavorites),
        toKojori ? settings.widgetTbilisiStopId : settings.widgetKojoriStopId,
      ]),
    ].filter(Boolean);
    const boardings = stopIds.flatMap((stopId) =>
      (["380", "316"] as const).flatMap((number): Boarding[] => {
        const route = catalog.routes.find(
          (route) => route.shortName === number && route.mode === "BUS",
        ) as TransitRoute;
        const stop = legacyStop(number, direction, stopId);
        if (!route || !stop) return [];
        const forward = number === "380" ? toKojori : !toKojori;
        return [
          {
            route,
            stop,
            pattern: {
              patternSuffix: forward ? "0:01" : "1:01",
              headsign: toKojori ? "Kojori" : "Tbilisi",
            },
          },
        ];
      }),
    );
    return { id: `legacy:${direction}`, title: "", boardings, stopId: active };
  }).filter((favorite) => favorite.boardings.length > 0);
  const preferredId = `legacy:${settings.sharedDirection}`;
  return {
    version: 2,
    favorites,
    selectedId: favorites.some((f) => f.id === preferredId)
      ? preferredId
      : (favorites[0]?.id ?? null),
  };
}
