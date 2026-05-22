import { useQuery } from '@tanstack/react-query';

import { BAKED_POLYLINES } from '@/assets/ttc-baked';
import { BusLine, decodeGooglePolyline, fetchVehiclePositions, ROUTES, VehiclePosition, type PolylinePoint } from '@/services/ttc';

type Direction = 'toKojori' | 'toTbilisi';
const ACTIVE_MAP_LIVE_REFRESH_MS = 5_000;
const OFFLINE_REFRESH_MS = 30_000;
const DEMO_POLYLINES: Record<`${BusLine}_${Direction}`, PolylinePoint[]> = {
  '380_toKojori': decodeGooglePolyline(BAKED_POLYLINES['380_toKojori'] ?? ''),
  '316_toKojori': decodeGooglePolyline(BAKED_POLYLINES['316_toKojori'] ?? ''),
  '380_toTbilisi': decodeGooglePolyline(BAKED_POLYLINES['380_toTbilisi'] ?? ''),
  '316_toTbilisi': decodeGooglePolyline(BAKED_POLYLINES['316_toTbilisi'] ?? ''),
};

export interface LiveVehiclePosition extends VehiclePosition {
  bus: BusLine;
}

function demoPolylinePoint(bus: BusLine, direction: Direction, progress: number) {
  const points = DEMO_POLYLINES[`${bus}_${direction}`];
  const fallback = { latitude: 41.696601, longitude: 44.803955 };
  if (points.length === 0) {
    return { lat: fallback.latitude, lon: fallback.longitude, heading: 0 };
  }

  const index = Math.min(points.length - 1, Math.floor(Math.max(0, Math.min(0.999, progress)) * points.length));
  const point = points[index];
  const next = points[Math.min(points.length - 1, index + 1)] ?? point;
  const previous = points[Math.max(0, index - 1)] ?? point;
  const headingFrom = index < points.length - 1 ? point : previous;
  const headingTo = index < points.length - 1 ? next : point;
  const heading = (Math.atan2(headingTo.longitude - headingFrom.longitude, headingTo.latitude - headingFrom.latitude) * 180 / Math.PI + 360) % 360;

  return { lat: point.latitude, lon: point.longitude, heading };
}

export function getDemoVehiclePositions(direction: Direction, nowMs = Date.now()): LiveVehiclePosition[] {
  const phase = ((Math.floor(nowMs / ACTIVE_MAP_LIVE_REFRESH_MS) % 18) / 18);
  const demos: { bus: BusLine; offset: number; id: string; nextStopId: string }[] = [
    { bus: '380', offset: 0.12, id: 'demo-380-lead', nextStopId: direction === 'toKojori' ? '1:3078' : '1:3932' },
    { bus: '316', offset: 0.46, id: 'demo-316-mid', nextStopId: direction === 'toKojori' ? '1:2856' : '1:4673' },
    { bus: '380', offset: 0.78, id: 'demo-380-follow', nextStopId: direction === 'toKojori' ? '1:3078' : '1:2994' },
  ];

  return demos.map(demo => ({
    ...demoPolylinePoint(demo.bus, direction, (phase + demo.offset) % 1),
    bus: demo.bus,
    vehicleId: demo.id,
    nextStopId: demo.nextStopId,
  }));
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
      return query.state.status === 'error' ? OFFLINE_REFRESH_MS : ACTIVE_MAP_LIVE_REFRESH_MS;
    },
    retry: 0,
  });
}
