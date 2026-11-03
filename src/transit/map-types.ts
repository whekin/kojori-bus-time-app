import type { PolylinePoint, StopInfo, VehiclePosition } from "@/services/ttc";
import type { Boarding } from "./model";

export type MapRoute = {
  key: string;
  boarding: Boarding;
  /** Route colour within its trip (`routeColor(routeId, colors, trip)`). */
  color: string;
  stops: StopInfo[];
  points: PolylinePoint[];
  vehicles: VehiclePosition[];
  error: boolean;
};
export type TransitMapProps = {
  routes: MapRoute[];
  active: boolean;
  /** Draw every stop on the routes, not only the trip's saved ones. */
  showStops: boolean;
  savedStopIds: string[];
  activeStopId?: string;
  focusedStopId?: string;
  onStop: (boarding: Boarding, stop: StopInfo) => void;
};
