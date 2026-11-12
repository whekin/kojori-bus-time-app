import type { ExpressionSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { ReactElement, ReactNode, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { CameraPosition, LngLat, LngLatBounds, Padding } from './projection';

export type { CameraPosition, LngLat, LngLatBounds, Padding };

export type MapViewState = CameraPosition & {
  bounds: LngLatBounds;
  /** True when a gesture moved the camera, false for programmatic moves. */
  userInteraction: boolean;
};

export type MapFrame = {
  bounds: LngLatBounds;
  padding?: Partial<Padding>;
  minZoom?: number;
  maxZoom?: number;
};

export type MapCameraTarget = CameraPosition | MapFrame;

export interface GeoMapRef {
  /** Animated move to a centre (and zoom, when given). */
  easeTo(target: { center: LngLat; zoom?: number }, durationMs?: number): void;
  /** Animated fit of `bounds` inside the view minus `padding`. */
  fitBounds(
    bounds: LngLatBounds,
    options?: { padding?: Partial<Padding>; durationMs?: number; maxZoom?: number },
  ): void;
}

export type GeoMapProps = {
  ref?: Ref<GeoMapRef>;
  style?: StyleProp<ViewStyle>;
  mapStyle: StyleSpecification;
  initialCamera: MapCameraTarget;
  minZoom?: number;
  maxZoom?: number;
  /** Panning stops at these bounds. */
  maxBounds?: LngLatBounds;
  /** False turns the map into a still picture: no pan, zoom or rotate. */
  interactive?: boolean;
  /**
   * Keeps the camera fitted to these bounds, refitting (animated) whenever
   * they, the padding or the view size change. Overrides `initialCamera`.
   */
  frame?: MapFrame;
  /** Where the OSM attribution sits; it must stay visible. */
  attributionPosition?: 'bottom-left' | 'bottom-right';
  /** Lifts the attribution clear of chrome drawn over the map's bottom edge. */
  attributionBottomInset?: number;
  testID?: string;
  onReady?: () => void;
  /** Taps on the map itself; taps on a marker do not reach here. */
  onPress?: (lngLat: LngLat) => void;
  /** Fires through gestures and animations. */
  onCameraChanging?: (state: MapViewState) => void;
  /** Fires once the camera settles. */
  onCameraIdle?: (state: MapViewState) => void;
  children?: ReactNode;
};

export type GeoLine = {
  coordinates: LngLat[];
  color: string;
};

export type GeoLineLayerProps = {
  /** Unique per map; layers draw in the order they are rendered. */
  id: string;
  lines: GeoLine[];
  /** Pixels, or a zoom expression. */
  width: number | ExpressionSpecification;
  opacity?: number;
};

export type GeoMarkerAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right';

export type GeoMarkerProps = {
  coordinate: LngLat;
  anchor?: GeoMarkerAnchor;
  /** Pixel nudge after anchoring, [x, y]. */
  offset?: [number, number];
  zIndex?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  children: ReactElement;
};
