import { useQuery } from '@tanstack/react-query';

import { BusLine, PolylinePoint, RouteGeometrySource } from '@/services/ttc';
import {
  CachedRoutePolylines,
  getBakedRoutePolylines,
  readRoutePolylinesCache,
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
  return useQuery<RoutePolylinesPayload>({
    queryKey: ['route-polylines', direction],
    meta: { source: 'ttc' },
    initialData: () => normalizeRoutePolylinesPayload(getBakedRoutePolylines(direction)),
    queryFn: async () => {
      const cached = await readRoutePolylinesCache(direction, true);
      return normalizeRoutePolylinesPayload(cached ?? getBakedRoutePolylines(direction));
    },
    select: normalizeRoutePolylinesPayload,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });
}
