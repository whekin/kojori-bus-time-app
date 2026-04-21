import { useMemo } from 'react';

import { useLocation } from '@/hooks/use-location';
import { useRouteStops } from '@/hooks/use-route-stops';
import type { StopInfo } from '@/services/ttc';

const MAX_CLOSEST_STOP_DISTANCE_METERS = 2_500;

type GeoStop = StopInfo & Required<Pick<StopInfo, 'lat' | 'lon'>>;
type ResolvedLocation = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type ClosestStopStatus =
  | 'available'
  | 'already-active'
  | 'denied'
  | 'disabled'
  | 'locating'
  | 'missing-geometry'
  | 'no-location'
  | 'too-far';

function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLon = toRadians(longitudeB - longitudeA);
  const latA = toRadians(latitudeA);
  const latB = toRadians(latitudeB);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

export function getClosestStopCandidate(
  stops: StopInfo[],
  resolvedLocation: ResolvedLocation | null,
  options?: { activeStopId?: string },
) {
  if (!resolvedLocation) {
    return { status: 'no-location' as const, closestStop: null, distanceMeters: null };
  }

  const geoStops = stops.filter(
    (stop): stop is GeoStop => typeof stop.lat === 'number' && typeof stop.lon === 'number',
  );

  if (geoStops.length === 0) {
    return { status: 'missing-geometry' as const, closestStop: null, distanceMeters: null };
  }

  const nearest = geoStops.reduce<{
    stop: GeoStop;
    distanceMeters: number;
  } | null>((currentNearest, stop) => {
    const nextDistance = distanceMeters(
      resolvedLocation.latitude,
      resolvedLocation.longitude,
      stop.lat,
      stop.lon,
    );

    if (!currentNearest || nextDistance < currentNearest.distanceMeters) {
      return { stop, distanceMeters: nextDistance };
    }

    return currentNearest;
  }, null);

  if (!nearest) {
    return { status: 'missing-geometry' as const, closestStop: null, distanceMeters: null };
  }

  if (nearest.distanceMeters > MAX_CLOSEST_STOP_DISTANCE_METERS) {
    return { status: 'too-far' as const, closestStop: null, distanceMeters: nearest.distanceMeters };
  }

  if (options?.activeStopId && nearest.stop.id === options.activeStopId) {
    return { status: 'already-active' as const, closestStop: null, distanceMeters: nearest.distanceMeters };
  }

  return {
    status: 'available' as const,
    closestStop: nearest.stop,
    distanceMeters: nearest.distanceMeters,
  };
}

export function useClosestStop(
  direction: 'toKojori' | 'toTbilisi',
  activeStopId: string,
  enabled = true,
) {
  const { stops } = useRouteStops(direction);
  const { permission, resolvedLocation, isLocating } = useLocation(enabled);

  return useMemo(() => {
    if (!enabled) {
      return { status: 'disabled' as const, closestStop: null, distanceMeters: null };
    }

    if (permission === 'denied') {
      return { status: 'denied' as const, closestStop: null, distanceMeters: null };
    }

    if (!resolvedLocation) {
      return {
        status: isLocating ? ('locating' as const) : ('no-location' as const),
        closestStop: null,
        distanceMeters: null,
      };
    }
    return getClosestStopCandidate(stops, resolvedLocation, { activeStopId });
  }, [activeStopId, enabled, isLocating, permission, resolvedLocation, stops]);
}
