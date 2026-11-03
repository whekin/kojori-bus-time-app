import type { AppColors } from '@/constants/theme';
import { ROUTES, type PolylinePoint, type StopInfo } from '@/services/ttc';
import {
  lookupStopId,
  tripPatterns,
  tripStops,
  type Boarding,
  type Favorite,
} from '@/transit/model';
import { tripAccent } from '@/transit/ui';

export type KojoriDirection = 'toKojori' | 'toTbilisi';

/** The Kojori direction a 380/316 pattern runs, or null for any other route. */
export function kojoriPatternDirection(
  boarding: Pick<Boarding, 'route' | 'pattern'>,
): KojoriDirection | null {
  const line = (['380', '316'] as const).find(bus => ROUTES[bus].id === boarding.route.id);
  if (!line) return null;
  return ROUTES[line].toKojori === boarding.pattern.patternSuffix ? 'toKojori' : 'toTbilisi';
}

/** Kojori-only map behaviour (curated stops, speed model) keys off this. */
export function kojoriTripDirection(trip: Favorite): KojoriDirection | null {
  for (const boarding of tripPatterns(trip)) {
    const direction = kojoriPatternDirection(boarding);
    if (direction) return direction;
  }
  return null;
}

/** Same accent as every other screen; kept as the map's import point. */
export function mapTripAccent(trip: Favorite | undefined, colors: AppColors) {
  return tripAccent(trip, colors);
}

export function plainStop(stop: StopInfo): StopInfo {
  return { id: stop.id, label: stop.label, lat: stop.lat, lon: stop.lon };
}

/**
 * Boardings that would add `stop` to the trip: one per trip pattern whose stop
 * list contains it. `patternStops` follows `tripPatterns(trip)` order.
 */
export function stopAdditions(
  trip: Favorite,
  patternStops: readonly (StopInfo[] | undefined)[],
  stop: StopInfo,
): Boarding[] {
  return tripPatterns(trip).flatMap((boarding, index): Boarding[] => {
    const stops = patternStops[index] ?? [];
    // The Kojori bridge stop is missing from TTC's lists but boards the same
    // buses as the stop it proxies to.
    const lookupId = lookupStopId({ ...boarding, stop: plainStop(stop) });
    const match =
      stops.find(candidate => candidate.id === stop.id) ??
      (lookupId !== stop.id && stops.some(candidate => candidate.id === lookupId) ? stop : undefined);
    if (!match) return [];
    return [
      {
        route: boarding.route,
        pattern: boarding.pattern,
        stop: {
          id: stop.id,
          label: match.label || stop.label,
          lat: match.lat ?? stop.lat,
          lon: match.lon ?? stop.lon,
        },
      },
    ];
  });
}

export function tripHasStop(trip: Favorite, stopId: string) {
  return trip.boardings.some(boarding => boarding.stop.id === stopId);
}

/** The trip without one saved stop, or null when it is the last one. */
export function tripWithoutStop(trip: Favorite, stopId: string): Favorite | null {
  if (tripStops(trip).length <= 1) return null;
  const boardings = trip.boardings.filter(boarding => boarding.stop.id !== stopId);
  if (!boardings.length) return null;
  const { stopId: activeStopId, ...rest } = trip;
  return activeStopId && activeStopId !== stopId
    ? { ...rest, boardings, stopId: activeStopId }
    : { ...rest, boardings };
}

export function headsignLabel(headsign: string, t: (key: 'cityKojori' | 'cityTbilisi') => string) {
  if (headsign === 'Kojori') return t('cityKojori');
  if (headsign === 'Tbilisi') return t('cityTbilisi');
  return headsign;
}

/** Route geometry, falling back to the stop sequence when TTC has no shape. */
export function routePointsOf(
  geometry: PolylinePoint[] | undefined,
  stops: StopInfo[] | undefined,
): PolylinePoint[] {
  if (geometry && geometry.length > 1) return geometry;
  return (stops ?? [])
    .filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .map(stop => ({ latitude: stop.lat!, longitude: stop.lon! }));
}

export function hasCoordinates(stop: StopInfo): stop is StopInfo & { lat: number; lon: number } {
  return typeof stop.lat === 'number' && typeof stop.lon === 'number';
}
