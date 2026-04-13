import { useQuery } from '@tanstack/react-query';

import { BusLine, fetchVehiclePositions, ROUTES, VehiclePosition } from '@/services/ttc';

type Direction = 'toKojori' | 'toTbilisi';
const LIVE_REFRESH_MS = 3_000;
const OFFLINE_REFRESH_MS = 30_000;

export interface LiveVehiclePosition extends VehiclePosition {
  bus: BusLine;
}

function hasValidCoordinate(position: VehiclePosition) {
  return (
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lon) &&
    position.lat > 41 &&
    position.lat < 42 &&
    position.lon > 44 &&
    position.lon < 45
  );
}

async function fetchPositionsForDirection(direction: Direction): Promise<LiveVehiclePosition[]> {
  const entries = ([
    ['380', ROUTES['380']],
    ['316', ROUTES['316']],
  ] as const).map(async ([bus, route]) => {
    const response = await fetchVehiclePositions(route.id, route[direction]);
    return Object.values(response)
      .flat()
      .map(position => ({ ...position, bus }))
      .filter(hasValidCoordinate);
  });

  const rawPositions = (await Promise.all(entries)).flat();
  const deduped = new Map<string, LiveVehiclePosition>();

  rawPositions.forEach(position => {
    deduped.set(`${position.bus}-${position.vehicleId}`, position);
  });

  return [...deduped.values()];
}

export function useVehiclePositions(direction: Direction, enabled: boolean) {
  return useQuery<LiveVehiclePosition[]>({
    queryKey: ['vehicle-positions', direction],
    meta: { source: 'ttc' },
    queryFn: () => fetchPositionsForDirection(direction),
    enabled,
    staleTime: 2_000,
    refetchInterval: query => {
      if (!enabled) return false;
      return query.state.status === 'error' ? OFFLINE_REFRESH_MS : LIVE_REFRESH_MS;
    },
    retry: 0,
  });
}
