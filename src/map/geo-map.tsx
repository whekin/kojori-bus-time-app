import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import React, { createContext, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';

import { cameraForBounds, NO_PADDING, type Padding, type Size } from './projection';
import { linesToFeatureCollection, lineLayerPaint, LINE_LAYOUT } from './shared';
import type {
  GeoLineLayerProps,
  GeoMapProps,
  GeoMarkerProps,
  MapCameraTarget,
  MapFrame,
  MapViewState,
} from './types';

export type * from './types';

// A marker press must not also count as a press on the map underneath it.
const MARKER_PRESS_SHADOW_MS = 350;
const DEFAULT_EASE_MS = 450;

const MarkerPressContext = createContext<{ current: number } | null>(null);

function resolveCamera(target: MapCameraTarget, size: Size, minZoom?: number, maxZoom?: number) {
  if ('center' in target) return target;
  return cameraForBounds(
    target.bounds,
    size,
    { ...NO_PADDING, ...target.padding },
    {
      minZoom: Math.max(target.minZoom ?? 0, minZoom ?? 0),
      maxZoom: Math.min(target.maxZoom ?? 18, maxZoom ?? 22),
    },
  );
}

function frameKey(frame: MapFrame | undefined, size: { width: number; height: number }) {
  if (!frame) return '';
  return JSON.stringify([frame, Math.round(size.width), Math.round(size.height)]);
}

function viewState(event: NativeSyntheticEvent<ViewStateChangeEvent>): MapViewState {
  const { center, zoom, bounds, userInteraction } = event.nativeEvent;
  return { center, zoom, bounds, userInteraction };
}

/** MapLibre Native behind the app's map API; see `geo-map.web.tsx` for the browser. */
export function GeoMap({
  ref,
  style,
  mapStyle,
  initialCamera,
  minZoom,
  maxZoom,
  maxBounds,
  interactive = true,
  frame,
  attributionPosition = 'bottom-left',
  attributionBottomInset = 0,
  testID,
  onReady,
  onPress,
  onCameraChanging,
  onCameraIdle,
  children,
}: GeoMapProps) {
  const cameraRef = useRef<CameraRef>(null);
  const lastMarkerPressAt = useRef(0);
  // `mountSize` frames the first camera; `size` follows every resize.
  const [mountSize, setMountSize] = useState<Size | null>(null);
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  const sizeRef = useRef<Size>({ width: 1, height: 1 });
  const fittedKey = useRef('');
  const currentFrameKey = frameKey(frame, size);

  useEffect(() => {
    if (!frame || !mountSize) return;
    // The mount already framed this exact key.
    if (fittedKey.current === '') {
      fittedKey.current = currentFrameKey;
      return;
    }
    if (fittedKey.current === currentFrameKey) return;
    fittedKey.current = currentFrameKey;
    const camera = resolveCamera(frame, size, minZoom, maxZoom);
    cameraRef.current?.easeTo({ center: camera.center, zoom: camera.zoom, duration: 250, easing: 'ease' });
    // Keyed on the serialised frame and size; the objects themselves churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrameKey, mountSize]);

  useImperativeHandle(ref, () => ({
    easeTo: (target, durationMs = DEFAULT_EASE_MS) => {
      cameraRef.current?.easeTo({
        center: target.center,
        ...(target.zoom != null ? { zoom: target.zoom } : {}),
        duration: durationMs,
        easing: 'ease',
      });
    },
    fitBounds: (bounds, options = {}) => {
      const padding: Padding = { ...NO_PADDING, ...options.padding };
      const camera = cameraForBounds(bounds, sizeRef.current, padding, {
        minZoom,
        maxZoom: Math.min(options.maxZoom ?? 18, maxZoom ?? 22),
      });
      cameraRef.current?.easeTo({
        center: camera.center,
        zoom: camera.zoom,
        duration: options.durationMs ?? DEFAULT_EASE_MS,
        easing: 'ease',
      });
    },
  }));

  const attribution = attributionPosition === 'bottom-left'
    ? { bottom: 6 + attributionBottomInset, left: 6 }
    : { bottom: 6 + attributionBottomInset, right: 6 };

  return (
    <View
      style={[styles.frame, style]}
      testID={testID}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        sizeRef.current = { width, height };
        setSize(previous =>
          previous.width === width && previous.height === height ? previous : { width, height },
        );
        setMountSize(previous => previous ?? { width, height });
      }}>
      {/* The first camera is framed against the real view size, so the map
          waits for one layout pass before it mounts. */}
      {mountSize ? (
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyle}
          logo={false}
          compass={false}
          scaleBar={false}
          attribution
          attributionPosition={attribution}
          dragPan={interactive}
          touchZoom={interactive}
          doubleTapZoom={interactive}
          doubleTapHoldZoom={interactive}
          touchRotate={false}
          touchPitch={false}
          onDidFinishLoadingMap={() => onReady?.()}
          onPress={event => {
            if (Date.now() - lastMarkerPressAt.current < MARKER_PRESS_SHADOW_MS) return;
            onPress?.(event.nativeEvent.lngLat);
          }}
          onRegionIsChanging={onCameraChanging ? event => onCameraChanging(viewState(event)) : undefined}
          onRegionDidChange={onCameraIdle ? event => onCameraIdle(viewState(event)) : undefined}>
          <Camera
            ref={cameraRef}
            initialViewState={resolveCamera(frame ?? initialCamera, mountSize, minZoom, maxZoom)}
            minZoom={minZoom}
            maxZoom={maxZoom}
            maxBounds={maxBounds}
          />
          <MarkerPressContext.Provider value={lastMarkerPressAt}>{children}</MarkerPressContext.Provider>
        </Map>
      ) : null}
    </View>
  );
}

export function GeoLineLayer({ id, lines, width, opacity = 1 }: GeoLineLayerProps) {
  return (
    <GeoJSONSource id={`${id}-source`} data={linesToFeatureCollection(lines)}>
      <Layer id={id} type="line" layout={LINE_LAYOUT} paint={lineLayerPaint(width, opacity)} />
    </GeoJSONSource>
  );
}

export function GeoMarker({
  coordinate,
  anchor = 'center',
  offset,
  zIndex,
  onPress,
  accessibilityLabel,
  children,
}: GeoMarkerProps) {
  const lastMarkerPressAt = useContext(MarkerPressContext);
  return (
    <Marker
      lngLat={coordinate}
      anchor={anchor}
      offset={offset}
      style={zIndex != null ? { zIndex } : undefined}
      accessible={Boolean(onPress || accessibilityLabel)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress ? () => {
        if (lastMarkerPressAt) lastMarkerPressAt.current = Date.now();
        onPress();
      } : undefined}>
      {children}
    </Marker>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
