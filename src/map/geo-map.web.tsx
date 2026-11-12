import 'maplibre-gl/dist/maplibre-gl.css';

import type * as MapLibreGL from 'maplibre-gl';
import React, {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View } from 'react-native';

import { cameraForBounds, NO_PADDING, type LngLatBounds, type Padding } from './projection';
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

type MapLibreModule = typeof import('maplibre-gl');
type MapContextValue = {
  lib: MapLibreModule;
  map: MapLibreGL.Map;
  /** Bumped whenever the basemap style reloads and drops our layers. */
  styleRevision: number;
};

const DEFAULT_EASE_MS = 450;
const MapContext = createContext<MapContextValue | null>(null);

// Required lazily: the module touches `window` at load, and the page shell is
// rendered on the server where there is none.
function loadMapLibre(): MapLibreModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module = require('maplibre-gl');
  const lib = (module.default ?? module) as MapLibreModule;
  // Served from public/ by scripts/copy-maplibre-worker.ts; Metro does not
  // bundle maplibre's module worker.
  lib.setWorkerUrl(`/maplibre/maplibre-gl-worker-${lib.getVersion()}.mjs`);
  return lib;
}

function viewState(map: MapLibreGL.Map, userInteraction: boolean): MapViewState {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()] as LngLatBounds,
    userInteraction,
  };
}

function resolveCamera(
  target: MapCameraTarget,
  size: { width: number; height: number },
  minZoom?: number,
  maxZoom?: number,
) {
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

/** maplibre-gl behind the app's map API; see `geo-map.tsx` for native. */
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
  const containerRef = useRef<React.ComponentRef<typeof View>>(null);
  const mapRef = useRef<MapLibreGL.Map | null>(null);
  const [context, setContext] = useState<MapContextValue | null>(null);
  // Handlers are read through a ref so the map is built once, not per render.
  const handlers = useRef({ onReady, onPress, onCameraChanging, onCameraIdle });
  useEffect(() => {
    handlers.current = { onReady, onPress, onCameraChanging, onCameraIdle };
  });
  const appliedStyle = useRef(mapStyle);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const fittedKey = useRef('');
  const currentFrameKey = frameKey(frame, size);

  useImperativeHandle(ref, () => ({
    easeTo: (target, durationMs = DEFAULT_EASE_MS) => {
      mapRef.current?.easeTo({
        center: target.center,
        ...(target.zoom != null ? { zoom: target.zoom } : {}),
        duration: durationMs,
      });
    },
    fitBounds: (bounds, options = {}) => {
      const map = mapRef.current;
      if (!map) return;
      const canvas = map.getContainer();
      const padding: Padding = { ...NO_PADDING, ...options.padding };
      const camera = cameraForBounds(
        bounds,
        { width: canvas.clientWidth, height: canvas.clientHeight },
        padding,
        { minZoom, maxZoom: Math.min(options.maxZoom ?? 18, maxZoom ?? 22) },
      );
      map.easeTo({ center: camera.center, zoom: camera.zoom, duration: options.durationMs ?? DEFAULT_EASE_MS });
    },
  }));

  useEffect(() => {
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container) return;
    const lib = loadMapLibre();
    const mountSize = { width: container.clientWidth || 1, height: container.clientHeight || 1 };
    const camera = resolveCamera(frame ?? initialCamera, mountSize, minZoom, maxZoom);
    fittedKey.current = frameKey(frame, mountSize);
    const map = new lib.Map({
      container,
      style: mapStyle,
      center: camera.center,
      zoom: camera.zoom,
      minZoom,
      maxZoom,
      maxBounds,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // The basemap is ours and static; skip the fade so tiles land crisply.
      fadeDuration: 0,
    });
    mapRef.current = map;
    // maplibre's stylesheet sets `.maplibregl-map { position: relative }`,
    // which beats react-native-web's absolute fill and collapses the map to
    // zero height. Inline style wins over both.
    container.style.position = 'absolute';
    container.style.inset = '0';
    map.resize();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    if (!interactive) {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.boxZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
      map.keyboard.disable();
    }
    map.addControl(new lib.AttributionControl({ compact: true }), attributionPosition);

    map.on('load', () => {
      setContext({ lib, map, styleRevision: 0 });
      handlers.current.onReady?.();
    });
    map.on('move', (event: { originalEvent?: Event }) => handlers.current.onCameraChanging?.(viewState(map, Boolean(event.originalEvent))));
    map.on('moveend', (event: { originalEvent?: Event }) => handlers.current.onCameraIdle?.(viewState(map, Boolean(event.originalEvent))));
    map.on('click', (event: MapLibreGL.MapMouseEvent) => {
      const target = event.originalEvent.target as Element | null;
      if (target?.closest?.('.maplibregl-marker')) return;
      handlers.current.onPress?.([event.lngLat.lng, event.lngLat.lat]);
    });

    const resize = new ResizeObserver(() => {
      map.resize();
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      setSize(previous => (previous.width === width && previous.height === height ? previous : { width, height }));
    });
    resize.observe(container);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      setContext(null);
    };
    // The map is built once; camera and style changes go through the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const corner = mapRef.current?.getContainer().querySelector<HTMLElement>(`.maplibregl-ctrl-${attributionPosition}`);
    if (corner) corner.style.bottom = `${attributionBottomInset}px`;
  }, [attributionBottomInset, attributionPosition, context]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !frame || fittedKey.current === currentFrameKey) return;
    fittedKey.current = currentFrameKey;
    const camera = resolveCamera(frame, size, minZoom, maxZoom);
    map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 250 });
    // Keyed on the serialised frame and size; the objects themselves churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFrameKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyle.current === mapStyle) return;
    appliedStyle.current = mapStyle;
    map.once('style.load', () => {
      setContext(previous => previous && { ...previous, styleRevision: previous.styleRevision + 1 });
    });
    map.setStyle(mapStyle, { diff: false });
  }, [mapStyle]);

  return (
    <View style={[styles.frame, style]} testID={testID}>
      <View ref={containerRef} style={StyleSheet.absoluteFill} />
      {context ? <MapContext.Provider value={context}>{children}</MapContext.Provider> : null}
    </View>
  );
}

export function GeoLineLayer({ id, lines, width, opacity = 1 }: GeoLineLayerProps) {
  const context = useContext(MapContext);
  const sourceId = `${id}-source`;

  useEffect(() => {
    if (!context) return;
    const { map } = context;
    const data = linesToFeatureCollection(lines);
    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else map.addSource(sourceId, { type: 'geojson', data });

    if (!map.getLayer(id)) {
      map.addLayer({ id, type: 'line', source: sourceId, layout: LINE_LAYOUT, paint: lineLayerPaint(width, opacity) });
    } else {
      map.setPaintProperty(id, 'line-width', width);
      map.setPaintProperty(id, 'line-opacity', opacity);
    }
  }, [context, id, lines, opacity, sourceId, width]);

  const map = context?.map;
  useEffect(() => {
    if (!map) return;
    return () => {
      // The map may already be gone (unmount) or restyled without us.
      if (!map.style) return;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [id, map, sourceId]);

  return null;
}

const ANCHORS = { center: 'center', top: 'top', bottom: 'bottom', left: 'left', right: 'right' } as const;

export function GeoMarker({
  coordinate,
  anchor = 'center',
  offset,
  zIndex,
  onPress,
  accessibilityLabel,
  children,
}: GeoMarkerProps) {
  const context = useContext(MapContext);
  const [element] = useState(() => (typeof document === 'undefined' ? null : document.createElement('div')));
  const markerRef = useRef<MapLibreGL.Marker | null>(null);
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  });
  const [longitude, latitude] = coordinate;
  const lib = context?.lib;
  const map = context?.map;

  useEffect(() => {
    if (!lib || !map || !element) return;
    const marker = new lib.Marker({ element, anchor: ANCHORS[anchor], offset })
      .setLngLat([longitude, latitude])
      .addTo(map);
    markerRef.current = marker;
    const click = (event: MouseEvent) => {
      if (!onPressRef.current) return;
      event.stopPropagation();
      onPressRef.current();
    };
    element.addEventListener('click', click);
    return () => {
      element.removeEventListener('click', click);
      marker.remove();
      markerRef.current = null;
    };
    // Position, offset and stacking update in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, element, lib, map]);

  useEffect(() => {
    markerRef.current?.setLngLat([longitude, latitude]);
  }, [latitude, longitude]);

  useEffect(() => {
    if (offset) markerRef.current?.setOffset(offset);
  }, [offset?.[0], offset?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!element) return;
    element.style.zIndex = String(zIndex ?? 0);
    element.style.cursor = onPress ? 'pointer' : '';
    element.style.pointerEvents = onPress ? 'auto' : 'none';
    if (onPress) element.setAttribute('role', 'button');
    else element.removeAttribute('role');
    if (accessibilityLabel) element.setAttribute('aria-label', accessibilityLabel);
    else element.removeAttribute('aria-label');
  }, [accessibilityLabel, element, onPress, zIndex]);

  return element && context ? createPortal(children, element) : null;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
