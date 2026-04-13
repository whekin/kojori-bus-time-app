import { useQuery } from '@tanstack/react-query';

import { useSettings } from '@/hooks/use-settings';
import { BusLine, PolylinePoint, RouteGeometrySource } from '@/services/ttc';
import {
  CachedRoutePolylines,
  fetchRoutePolylinesForDirection,
  fetchRoutePolylinesFromStopsForDirection,
  readRoutePolylinesCache,
  ROUTE_POLYLINES_CACHE_TTL,
  writeRoutePolylinesCache,
} from '@/services/ttc-offline';

type Direction = 'toKojori' | 'toTbilisi';

export interface RoutePolylinesPayload {
  polylines: Record<BusLine, PolylinePoint[]>;
  source: RouteGeometrySource;
}

function normalizeRoutePolylinesPayload(
  value: RoutePolylinesPayload | CachedRoutePolylines | Record<BusLine, PolylinePoint[]>,
): RoutePolylinesPayload {
  if ('polylines' in value) {
    return {
      polylines: value.polylines,
      source: value.source,
    };
  }

  return {
    polylines: value,
    source: 'stops-fallback',
  };
}

export function useRoutePolylines(direction: Direction) {
  const { settings } = useSettings();
  const useEncoded = settings.useEncodedPolylines;

  return useQuery<RoutePolylinesPayload>({
    queryKey: ['route-polylines', direction, useEncoded ? 'encoded' : 'stops'],
    meta: { source: 'ttc' },
    queryFn: async () => {
      try {
        const fetch = useEncoded
          ? fetchRoutePolylinesForDirection
          : fetchRoutePolylinesFromStopsForDirection;
        const data = await fetch(direction);
        void writeRoutePolylinesCache(direction, {
          version: 3,
          polylines: data.polylines,
          source: data.source,
        });
        return normalizeRoutePolylinesPayload(data);
      } catch (error) {
        const cached = await readRoutePolylinesCache(direction, true);
        if (cached) {
          return normalizeRoutePolylinesPayload(cached);
        }
        throw error;
      }
    },
    select: normalizeRoutePolylinesPayload,
    staleTime: ROUTE_POLYLINES_CACHE_TTL,
    retry: 1,
  });
}
