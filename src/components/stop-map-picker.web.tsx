export type MapPickerStop = {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
};

/**
 * react-native-maps has no web build here. Callers fall back to the plain
 * stop row when this renders nothing.
 */
export function StopMapPicker(_props: {
  stops: MapPickerStop[];
  activeStopId: string;
  accentColor: string;
  closestStopId?: string | null;
  userLocation?: { latitude: number; longitude: number } | null;
  onSelectStop: (id: string) => void;
  onOpenFullMap: () => void;
  onRequestLocation?: () => void;
  directionSwitch?: React.ReactNode;
}) {
  return null;
}
