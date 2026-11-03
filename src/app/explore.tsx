import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Callout, Marker, Polyline, type MapMarker, type MapPressEvent, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapEmptyState } from '@/components/map-empty-state';
import {
  hasCoordinates,
  headsignLabel,
  kojoriPatternDirection,
  kojoriTripDirection,
  mapTripAccent,
  plainStop,
  routePointsOf,
  stopAdditions,
  tripHasStop,
  tripWithoutStop,
  type KojoriDirection,
} from '@/components/map-trip';
import { TripSwitch } from '@/components/stop-selector';
import { TtcStatusChip } from '@/components/ttc-status-banner';
import { getCuratedStopIds } from '@/constants/curated-stops';
import { GOOGLE_DARK_MAP_STYLE, GOOGLE_LIGHT_MAP_STYLE } from '@/constants/map-style';
import { alpha, BottomTabInset } from '@/constants/theme';
import { useAppColors, useResolvedAppThemeMode } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useMapFocus } from '@/hooks/use-map-focus';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { getDemoVehiclePositions } from '@/hooks/use-vehicle-positions';
import { useSettings } from '@/hooks/use-settings';
import { useTabNav } from '@/hooks/use-tab-nav';
import {
  findStop,
  ROUTES,
  type ArrivalTime,
  type PolylinePoint,
  type StopInfo,
  type VehiclePosition,
} from '@/services/ttc';
import { arrivalsQuery, geometryQuery, positionsQuery, stopsQuery } from '@/transit/data';
import { useFavorites } from '@/transit/favorites';
import { patternKey, tripPatterns, tripStopId, tripStops, type Boarding } from '@/transit/model';
import { routeColor, transitModeIcon, useFavoriteTitle } from '@/transit/ui';
import { simplifyPolyline, splitPolylinesByOverlap } from '@/utils/polyline-offset';
import {
  buildPolylineMetrics,
  distanceMeters,
  headingAlongPolyline,
  interpolatePolylineAtDistance,
  projectPointToPolyline,
  projectStopToRoute,
  type PolylineMetrics,
} from '@/utils/route-progress';

const DEFAULT_REGION: Region = {
  latitude: 41.639,
  longitude: 44.76,
  latitudeDelta: 0.12,
  longitudeDelta: 0.1,
};

type MapBounds = {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
};

// Kojori trips keep the hand-tuned frame around Tbilisi and the Kojori road.
const KOJORI_MAP_BOUNDS: MapBounds = {
  latMin: 41.55,
  latMax: 41.75,
  lonMin: 44.65,
  lonMax: 44.87,
};
// Any other trip is framed by its own routes plus this much slack.
const ROUTE_BOUNDS_MARGIN_DEGREES = 0.05;
const FALLBACK_MAP_BOUNDS: MapBounds = {
  latMin: 41.55,
  latMax: 41.9,
  lonMin: 44.6,
  lonMax: 45.1,
};

type ExploreScreenProps = {
  isActive?: boolean;
  suspendNativeMap?: boolean;
};

type MapRoute = {
  key: string;
  boarding: Boarding;
  direction: KojoriDirection | null;
  stops: StopInfo[];
  points: PolylinePoint[];
};

type MapVehiclePosition = VehiclePosition & { routeKey: string };

const NO_STOPS: StopInfo[] = [];
const NO_VEHICLES: VehiclePosition[] = [];

// Module-level combiners: TanStack structurally shares their output, so the
// arrays below keep their identity until the underlying data really changes.
function combineData<T>(results: { data: T | undefined }[]) {
  return results.map(result => result.data);
}

function combineVehicles(results: {
  data: VehiclePosition[] | undefined;
  isError: boolean;
  isFetching: boolean;
  status: string;
}[]) {
  return {
    vehicles: results.map(result => (result.isError ? NO_VEHICLES : (result.data ?? NO_VEHICLES))),
    isFetching: results.some(result => result.isFetching),
    settled: results.every(result => result.status !== 'pending'),
  };
}

function boundsForPoints(points: PolylinePoint[], kojori: boolean): MapBounds {
  if (kojori) return KOJORI_MAP_BOUNDS;
  if (!points.length) return FALLBACK_MAP_BOUNDS;
  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  for (const point of points) {
    latMin = Math.min(latMin, point.latitude);
    latMax = Math.max(latMax, point.latitude);
    lonMin = Math.min(lonMin, point.longitude);
    lonMax = Math.max(lonMax, point.longitude);
  }
  return {
    latMin: latMin - ROUTE_BOUNDS_MARGIN_DEGREES,
    latMax: latMax + ROUTE_BOUNDS_MARGIN_DEGREES,
    lonMin: lonMin - ROUTE_BOUNDS_MARGIN_DEGREES,
    lonMax: lonMax + ROUTE_BOUNDS_MARGIN_DEGREES,
  };
}

function initialRegionFor(points: PolylinePoint[], kojori: boolean): Region {
  if (kojori || points.length < 2) return DEFAULT_REGION;
  const bounds = boundsForPoints(points, false);
  const margin = ROUTE_BOUNDS_MARGIN_DEGREES;
  return {
    latitude: (bounds.latMin + bounds.latMax) / 2,
    longitude: (bounds.lonMin + bounds.lonMax) / 2,
    latitudeDelta: Math.max(0.02, (bounds.latMax - bounds.latMin - 2 * margin) * 1.3),
    longitudeDelta: Math.max(0.02, (bounds.lonMax - bounds.lonMin - 2 * margin) * 1.3),
  };
}

function StopPostGlyph({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1, Math.round(size * 0.1));
  const plateWidth = Math.round(size * 0.72);
  const plateHeight = Math.round(size * 0.52);
  const plateLeft = Math.round((size - plateWidth) / 2);
  const dotSize = Math.max(2, Math.round(size * 0.18));
  const poleWidth = Math.max(1, Math.round(size * 0.11));
  const poleHeight = Math.round(size * 0.35);
  const footWidth = Math.round(size * 0.48);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: plateLeft,
          width: plateWidth,
          height: plateHeight,
          borderRadius: Math.max(2, Math.round(size * 0.14)),
          borderWidth: stroke,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          top: plateHeight - stroke,
          left: Math.round((size - poleWidth) / 2),
          width: poleWidth,
          height: poleHeight,
          borderRadius: poleWidth / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: Math.round((size - footWidth) / 2),
          width: footWidth,
          height: stroke,
          borderRadius: stroke / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const VEHICLE_PIN_CANVAS_SIZE = 66;
const VEHICLE_PIN_ANCHOR = { x: 0.5, y: 0.5 };
const STOP_MARKER_ANCHOR = { x: 0.5, y: 0.5 };
const MAP_MIN_ZOOM_LEVEL = 11;
const SHOW_ORDINARY_STOPS_LAT_DELTA = 0.14;
const FULL_STOP_MARKERS_LAT_DELTA = 0.055;
const PROMOTED_STOP_DECLUTTER_MIN_LAT_DELTA = 0.085;
const PROMOTED_STOP_DECLUTTER_PX = {
  overview: 46,
  mid: 34,
};
const KOJORI_CENTER_STOP_ID = '1:3078';
const ROUTE_LINE_SIMPLIFY_TOLERANCE_METERS = 12;
// Route lines thicken as you zoom in, and each sits on a contrasting casing
// so the accent stays readable over both the cream and the near-black basemap.
const ROUTE_LINE_WIDTH_BY_TIER: Record<StopMarkerZoomTier, number> = {
  overview: 3.5,
  mid: 4.5,
  close: 6,
};
const ROUTE_CASING_EXTRA_WIDTH = 3;
const ROUTE_CASING_COLOR = {
  dark: '#000000A6',
  light: '#FFFFFFD9',
};
const SHARED_ROUTE_STRIPE_METERS = 260;
const LIVE_VEHICLE_TICK_MS = 800;
const LIVE_VEHICLE_ACTIVATION_DELAY_MS = 750;
// How far ahead of the last GPS fix the marker may dead-reckon before it
// eases to a stop, and how strongly it accelerates when it falls behind.
const LIVE_VEHICLE_MAX_LEAD_METERS = 120;
const LIVE_VEHICLE_CATCH_UP_METERS = 150;
const LIVE_VEHICLE_HARD_SNAP_METERS = 400;
const LIVE_VEHICLE_START_HOLD_METERS = 350;
const LIVE_VEHICLE_OFF_ROUTE_LIMIT_METERS = 280;
// Translucency is baked into the fill colors (never a view-level `opacity`):
// Android renders an alpha-composited layer solid for a frame when the marker
// icon is recaptured, which reads as flicker.
const VEHICLE_PIN_BACKGROUND_ALPHA_HEX = 'D1'; // ~0.82
// The direction arrow rotates in 15° steps. Rotation lives in the icon (the
// Fabric marker manager has no runtime rotation prop handler), so each step
// costs one marker icon recapture — quantizing keeps those rare.
const VEHICLE_ARROW_SECTOR_DEGREES = 15;
const VEHICLE_ARROW_LOOK_AHEAD_METERS = 40;
const TBILISI_TRAFFIC_ANCHOR_STOP_ID = '1:845';
const TBILISI_TRAFFIC_SPEED_KMH = 22;
const CITY_SPEED_KMH = 25;
const KOJORI_SPEED_KMH = 45;
const LOCATE_BUTTON_TRAY_LIFT = 166;
const MAP_OVERLAY_ENTRANCE_MS = 260;
const MAP_OVERLAY_EXIT_MS = 170;
// Stop markers are bitmap snapshots on Android, so they cannot cross-fade
// through a view transform without a per-frame icon recapture. The native
// marker `opacity` prop is a plain alpha the map applies to the existing
// bitmap, so a handful of stepped commits buys the fade for almost nothing.
const MARKER_REVEAL_STEPS = [0.15, 0.5, 0.8, 1];
const MARKER_REVEAL_STEP_MS = 55;
// Same trick for the focused stop's halo: one extra marker whose alpha
// breathes, driven by a slow timer rather than by redrawing the icon.
const FOCUSED_HALO_CANVAS_SIZE = 96;
const FOCUSED_HALO_RING_SIZE = 74;
// The focused pin hangs above its coordinate: its 50dp box is anchored at the
// bottom, so the 42dp core's centre lands half the box up. The halo centres
// its ring on that point rather than on the coordinate itself. Verified on
// device — a least-squares fit of the rendered ring puts its centre within a
// pixel of the pin core's.
const FOCUSED_HALO_CENTER_LIFT = 25;
const FOCUSED_HALO_STEP_MS = 80;
const FOCUSED_HALO_CYCLE_MS = 2200;
const FOCUSED_HALO_MIN_OPACITY = 0.18;
const FOCUSED_HALO_MAX_OPACITY = 0.62;
// `onRegionChange` fires continuously through a gesture. Sampled at this
// interval, and committed only when the marker tier actually flips, so a
// pinch re-tiers live instead of waiting for the fingers to lift.
const REGION_SAMPLE_THROTTLE_MS = 150;
const REGION_CENTER_EPSILON = 0.00035;
const REGION_DELTA_EPSILON = 0.0015;

type StopMarkerZoomTier = 'overview' | 'mid' | 'close';
type StopMarkerData = {
  stop: StopInfo;
  isPromoted: boolean;
  priority: number;
};
type DeclutteredStopMarkers = {
  visible: StopMarkerData[];
  compact: StopMarkerData[];
};
type VehicleSample = {
  routeKey: string;
  /** Route number painted on the pin. */
  label: string;
  mode: string;
  vehicleId: string;
  rawCoordinate: { latitude: number; longitude: number };
  heading: number | null;
  onRoute: boolean;
  routeMeters: number;
};
type VehicleRouteTrack = {
  metrics: PolylineMetrics;
  /** Set for 380/316 patterns, which use the Kojori road speed model. */
  direction: KojoriDirection | null;
  trafficAnchorMeters: number | null;
  // Projecting a stop onto the route walks every polyline point. The ETA
  // readout asks for the same boarding stop once per vehicle per render, so
  // the answer is memoised on the track it belongs to.
  stopMetersCache: Map<string, number | null>;
};

function StopMapMarker({
  stop,
  isPromoted,
  isSimpleOrdinaryStop,
  markerColor,
  revealOpacity,
  styles,
  resolvedThemeMode,
  colors,
  onPress,
}: {
  stop: StopInfo;
  isPromoted: boolean;
  isSimpleOrdinaryStop: boolean;
  markerColor: string;
  revealOpacity: number;
  styles: ReturnType<typeof createStyles>;
  resolvedThemeMode: ReturnType<typeof useResolvedAppThemeMode>;
  colors: ReturnType<typeof useAppColors>;
  onPress: () => void;
}) {
  const [trackMarkerViewChanges, setTrackMarkerViewChanges] = useState(true);
  const markerSize = isSimpleOrdinaryStop ? 10 : 20;
  // Invisible touch slop around the dot — small dots were hard to tap.
  const hitSize = 34;
  const promotedHitSize = 44;
  const promotedMarkerWidth = 28;
  const promotedMarkerHeight = 34;
  const markerVisualStateKey = [
    isPromoted ? 'promoted' : 'ordinary',
    isSimpleOrdinaryStop ? 'simple' : 'full',
    markerColor,
    resolvedThemeMode,
  ].join(':');

  useEffect(() => {
    setTrackMarkerViewChanges(true);
    const timeoutId = setTimeout(() => setTrackMarkerViewChanges(false), 180);
    return () => clearTimeout(timeoutId);
  }, [markerVisualStateKey]);

  if (isPromoted) {
    return (
      <Marker
        coordinate={{ latitude: stop.lat!, longitude: stop.lon! }}
        anchor={STOP_MARKER_ANCHOR}
        tracksViewChanges={trackMarkerViewChanges}
        opacity={revealOpacity}
        onPress={onPress}
        zIndex={6}>
        <View
          collapsable={false}
          style={[
            styles.promotedStopMarkerOuter,
            {
              width: promotedHitSize,
              height: promotedHitSize,
              borderRadius: promotedHitSize / 2,
            },
          ]}>
          <View
            style={[
              styles.promotedStopMarker,
              {
                width: promotedMarkerWidth,
                height: promotedMarkerHeight,
                borderRadius: 8,
                backgroundColor: colors.panel,
                borderColor: markerColor,
              },
            ]}>
            <StopPostGlyph size={20} color={markerColor} />
          </View>
        </View>
      </Marker>
    );
  }

  return (
    <Marker
      coordinate={{ latitude: stop.lat!, longitude: stop.lon! }}
      anchor={STOP_MARKER_ANCHOR}
      tracksViewChanges={trackMarkerViewChanges}
      // Baked into the native alpha rather than the view: a view-level
      // opacity is captured into the icon, so it cannot be stepped without
      // redrawing the bitmap.
      opacity={revealOpacity * (isSimpleOrdinaryStop ? 0.78 : 0.82)}
      onPress={onPress}
      zIndex={4}>
      <View
        collapsable={false}
        style={[
          styles.stopMarkerOuter,
          {
            width: hitSize,
            height: hitSize,
            borderRadius: hitSize / 2,
            backgroundColor: 'transparent',
          },
        ]}>
        <View
          style={[
            styles.stopMarker,
            isSimpleOrdinaryStop && styles.simpleStopMarker,
            {
              width: markerSize,
              height: markerSize,
              borderRadius: isSimpleOrdinaryStop ? 3 : 6,
              borderColor: markerColor,
              backgroundColor: colors.panel,
            },
          ]}>
          {isSimpleOrdinaryStop ? null : (
            <StopPostGlyph size={13} color={markerColor} />
          )}
        </View>
      </View>
    </Marker>
  );
}

function declutterPromotedStopMarkers(
  markers: StopMarkerData[],
  region: Region,
  zoomTier: StopMarkerZoomTier,
  mapWidth: number,
  mapHeight: number,
): DeclutteredStopMarkers {
  if (
    zoomTier === 'close' ||
    region.latitudeDelta < PROMOTED_STOP_DECLUTTER_MIN_LAT_DELTA ||
    mapWidth <= 0 ||
    mapHeight <= 0
  ) {
    return { visible: markers, compact: [] };
  }

  const threshold = zoomTier === 'overview'
    ? PROMOTED_STOP_DECLUTTER_PX.overview
    : PROMOTED_STOP_DECLUTTER_PX.mid;
  const thresholdSquared = threshold * threshold;
  const acceptedPromoted: { x: number; y: number }[] = [];
  const sorted = [...markers].sort((a, b) => b.priority - a.priority);
  const visible = new Set<string>();
  const compact = new Set<string>();

  sorted.forEach(marker => {
    if (!marker.isPromoted) {
      visible.add(marker.stop.id);
      return;
    }

    const x = ((marker.stop.lon! - region.longitude) / region.longitudeDelta + 0.5) * mapWidth;
    const y = ((region.latitude - marker.stop.lat!) / region.latitudeDelta + 0.5) * mapHeight;
    const overlaps = acceptedPromoted.some(point => {
      const dx = point.x - x;
      const dy = point.y - y;
      return dx * dx + dy * dy < thresholdSquared;
    });

    if (!overlaps) {
      acceptedPromoted.push({ x, y });
      visible.add(marker.stop.id);
    } else {
      compact.add(marker.stop.id);
    }
  });

  return {
    visible: markers.filter(marker => visible.has(marker.stop.id)),
    compact: markers.filter(marker => compact.has(marker.stop.id)),
  };
}

function getStopMarkerZoomTier(latitudeDelta: number): StopMarkerZoomTier {
  return latitudeDelta >= SHOW_ORDINARY_STOPS_LAT_DELTA
    ? 'overview'
    : latitudeDelta >= FULL_STOP_MARKERS_LAT_DELTA
      ? 'mid'
      : 'close';
}

function shouldUpdateMapRegion(previous: Region, next: Region) {
  const previousShowsMarkers = previous.latitudeDelta < 0.5;
  const nextShowsMarkers = next.latitudeDelta < 0.5;
  if (previousShowsMarkers !== nextShowsMarkers) return true;
  if (getStopMarkerZoomTier(previous.latitudeDelta) !== getStopMarkerZoomTier(next.latitudeDelta)) return true;

  return (
    Math.abs(previous.latitude - next.latitude) > REGION_CENTER_EPSILON ||
    Math.abs(previous.longitude - next.longitude) > REGION_CENTER_EPSILON ||
    Math.abs(previous.latitudeDelta - next.latitudeDelta) > REGION_DELTA_EPSILON ||
    Math.abs(previous.longitudeDelta - next.longitudeDelta) > REGION_DELTA_EPSILON
  );
}

function stopMarkerPriority(
  stopId: string,
  firstRouteStopId: string | undefined,
  favoriteStopSet: Set<string>,
  curatedStopSet: Set<string>,
  isKojoriTrip: boolean,
) {
  if (isKojoriTrip && stopId === KOJORI_CENTER_STOP_ID) return 5;
  if (stopId === firstRouteStopId) return 4;
  if (favoriteStopSet.has(stopId)) return 3;
  if (curatedStopSet.has(stopId)) return 2;
  return 1;
}

function kmhToMetersPerSecond(kmh: number) {
  return kmh / 3.6;
}

function isLikelyTbilisiTraffic(point: { latitude: number; longitude: number }) {
  return point.latitude >= 41.675 || point.longitude >= 44.77;
}

function vehicleCruiseSpeedMetersPerSecond(
  progressMeters: number,
  point: { latitude: number; longitude: number },
  track: VehicleRouteTrack,
) {
  const direction = track.direction;
  // Only the Kojori road has a tuned speed profile; everything else moves at
  // city traffic pace.
  if (!direction) return kmhToMetersPerSecond(CITY_SPEED_KMH);

  const trafficAnchorMeters = track.trafficAnchorMeters;
  const isAfterTrafficAnchor = trafficAnchorMeters !== null
    ? direction === 'toTbilisi'
      ? progressMeters >= trafficAnchorMeters
      : progressMeters <= trafficAnchorMeters
    : false;

  if (isAfterTrafficAnchor) return kmhToMetersPerSecond(TBILISI_TRAFFIC_SPEED_KMH);
  if (isLikelyTbilisiTraffic(point)) return kmhToMetersPerSecond(CITY_SPEED_KMH);
  return kmhToMetersPerSecond(KOJORI_SPEED_KMH);
}

function buildVehicleTrack(route: MapRoute): VehicleRouteTrack | null {
  if (route.points.length < 2) return null;
  const metrics = buildPolylineMetrics(route.points);
  const trafficAnchorMeters = route.direction
    ? projectStopToRoute(findStop(TBILISI_TRAFFIC_ANCHOR_STOP_ID), metrics)?.distanceMeters ?? null
    : null;
  return { metrics, direction: route.direction, trafficAnchorMeters, stopMetersCache: new Map() };
}

function buildVehicleSample(
  position: MapVehiclePosition,
  route: MapRoute,
  track: VehicleRouteTrack | undefined,
): VehicleSample {
  const rawCoordinate = { latitude: position.lat, longitude: position.lon };
  const base: VehicleSample = {
    routeKey: route.key,
    label: route.boarding.route.shortName,
    mode: route.boarding.route.mode,
    vehicleId: position.vehicleId,
    rawCoordinate,
    heading: Number.isFinite(position.heading) ? position.heading : null,
    onRoute: false,
    routeMeters: 0,
  };

  if (!track || track.metrics.points.length < 2) return base;

  const projected = projectPointToPolyline(rawCoordinate, track.metrics);
  if (!projected || projected.offRouteMeters > LIVE_VEHICLE_OFF_ROUTE_LIMIT_METERS) {
    return base;
  }

  return { ...base, onRoute: true, routeMeters: projected.distanceMeters };
}

function quantizeArrowSector(heading: number | null): number | null {
  if (heading == null || !Number.isFinite(heading)) return null;
  const normalized = ((heading % 360) + 360) % 360;
  return Math.round(normalized / VEHICLE_ARROW_SECTOR_DEGREES) % (360 / VEHICLE_ARROW_SECTOR_DEGREES);
}

function vehicleArrowSectorAt(sample: VehicleSample, track: VehicleRouteTrack | undefined): number | null {
  if (sample.onRoute && track) {
    return quantizeArrowSector(
      headingAlongPolyline(track.metrics, sample.routeMeters, VEHICLE_ARROW_LOOK_AHEAD_METERS),
    );
  }
  return quantizeArrowSector(sample.heading);
}

// Rough ETA from a live vehicle to a stop further along its route, using the
// same segment speed model that drives the marker animation. Returns null
// when the bus is off-route, at, or already past the stop.
function stopMetersOnTrack(track: VehicleRouteTrack, stop: StopInfo): number | null {
  const cached = track.stopMetersCache.get(stop.id);
  if (cached !== undefined) return cached;

  const meters = projectStopToRoute(stop, track.metrics)?.distanceMeters ?? null;
  track.stopMetersCache.set(stop.id, meters);
  return meters;
}

function estimateVehicleEtaMinutes(
  sample: VehicleSample,
  track: VehicleRouteTrack | undefined,
  stop: StopInfo,
): number | null {
  if (!sample.onRoute || !track) return null;

  const stopMeters = stopMetersOnTrack(track, stop);
  if (stopMeters == null) return null;
  if (stopMeters <= sample.routeMeters + 30) return null;

  let meters = sample.routeMeters;
  let seconds = 0;
  while (meters < stopMeters) {
    const chunkMeters = Math.min(500, stopMeters - meters);
    const point = interpolatePolylineAtDistance(track.metrics, meters)?.point ?? sample.rawCoordinate;
    const speed = vehicleCruiseSpeedMetersPerSecond(meters, point, track);
    seconds += chunkMeters / Math.max(1, speed);
    meters += chunkMeters;
  }

  return Math.max(1, Math.round(seconds / 60));
}

function AnimatedVehicleMarker({
  sample,
  track,
  isActive,
  reduceMotion,
  accent,
  title,
  subtitle,
  styles,
}: {
  sample: VehicleSample;
  track: VehicleRouteTrack | undefined;
  isActive: boolean;
  reduceMotion: boolean;
  accent: string;
  title: string;
  subtitle: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const contentMarkerRef = useRef<MapMarker | null>(null);
  // The marker is uncontrolled after mount: the coordinate prop never
  // changes, and all motion goes through the native marker API on a fixed
  // tick. The tick advances a progress-in-meters value along the route and
  // only ever modulates speed — the marker never animates backwards when a
  // stale GPS fix projects behind the dead-reckoned position, and chained
  // short segments follow the road instead of cutting corners.
  const sampleRef = useRef(sample);
  const trackRef = useRef(track);
  const displayedMetersRef = useRef<number | null>(null);
  const displayedCoordinateRef = useRef(sample.rawCoordinate);
  const [initialCoordinate] = useState(() => {
    if (!sample.onRoute || !track) return sample.rawCoordinate;
    return interpolatePolylineAtDistance(track.metrics, sample.routeMeters)?.point ?? sample.rawCoordinate;
  });
  // Direction is a rotated arrow point baked into the marker icon. The Fabric
  // marker manager has no runtime rotation prop handler, so the arrow rotates
  // via the view transform and the icon is explicitly recaptured — but only
  // when the quantized sector actually changes (i.e. the bus turns).
  const [arrowSector, setArrowSector] = useState(() => vehicleArrowSectorAt(sample, track));
  const arrowSectorRef = useRef(arrowSector);
  const [canAnimateNativeMarker, setCanAnimateNativeMarker] = useState(false);
  const pinWidth = VEHICLE_PIN_CANVAS_SIZE;
  const pinHeight = VEHICLE_PIN_CANVAS_SIZE;
  const busIconSize = 16;
  const routeFontSize = 10;
  const routeDigits = sample.label.split('');
  const modeIcon = transitModeIcon(sample.mode);

  useEffect(() => {
    setCanAnimateNativeMarker(false);
    if (!isActive) return;

    // Let the tab transition and any initial camera fit finish before native
    // marker animations start competing for Android render-thread time.
    const readyTimeoutId = setTimeout(
      () => setCanAnimateNativeMarker(true),
      LIVE_VEHICLE_ACTIVATION_DELAY_MS,
    );
    return () => clearTimeout(readyTimeoutId);
  }, [isActive]);

  useEffect(() => {
    sampleRef.current = sample;
    trackRef.current = track;
  }, [sample, track]);

  useEffect(() => {
    if (!isActive || !canAnimateNativeMarker) return;

    // Motion goes only through the native marker animation API — no React
    // commits on the movement path.
    const moveTo = (
      coordinate: { latitude: number; longitude: number },
      durationMs: number,
    ) => {
      displayedCoordinateRef.current = coordinate;
      if (durationMs <= 0) {
        contentMarkerRef.current?.setCoordinates(coordinate);
        return;
      }
      contentMarkerRef.current?.animateMarkerToCoordinate(coordinate, durationMs);
    };
    // Commits a new arrow orientation only when the quantized sector changes;
    // the render effect below then recaptures the marker icon once.
    const updateArrowSector = (meters: number | null) => {
      const currentSample = sampleRef.current;
      const currentTrack = trackRef.current;
      const sector = meters != null && currentTrack
        ? quantizeArrowSector(
            headingAlongPolyline(currentTrack.metrics, meters, VEHICLE_ARROW_LOOK_AHEAD_METERS),
          )
        : quantizeArrowSector(currentSample.heading);
      if (sector != null && sector !== arrowSectorRef.current) {
        arrowSectorRef.current = sector;
        setArrowSector(sector);
      }
    };

    const tick = () => {
      const currentSample = sampleRef.current;
      const currentTrack = trackRef.current;

      if (!currentSample.onRoute || !currentTrack) {
        displayedMetersRef.current = null;
        updateArrowSector(null);
        if (distanceMeters(displayedCoordinateRef.current, currentSample.rawCoordinate) > 1) {
          moveTo(currentSample.rawCoordinate, reduceMotion ? 0 : LIVE_VEHICLE_TICK_MS);
        }
        return;
      }

      const gpsMeters = currentSample.routeMeters;
      const displayed = displayedMetersRef.current;

      if (
        displayed == null ||
        reduceMotion ||
        Math.abs(gpsMeters - displayed) > LIVE_VEHICLE_HARD_SNAP_METERS
      ) {
        if (displayed !== gpsMeters) {
          displayedMetersRef.current = gpsMeters;
          const point = interpolatePolylineAtDistance(currentTrack.metrics, gpsMeters)?.point ?? currentSample.rawCoordinate;
          moveTo(point, 0);
          updateArrowSector(gpsMeters);
        }
        return;
      }

      const errorMeters = gpsMeters - displayed;
      // Near the route start the bus is usually waiting at the terminal —
      // hold instead of creeping forward on dead reckoning alone.
      const holding = gpsMeters <= LIVE_VEHICLE_START_HOLD_METERS && errorMeters <= 0;
      const speedFactor = holding
        ? 0
        : errorMeters >= 0
          ? Math.min(2.2, 1 + errorMeters / LIVE_VEHICLE_CATCH_UP_METERS)
          : Math.max(0, 1 + errorMeters / LIVE_VEHICLE_MAX_LEAD_METERS);

      if (speedFactor <= 0) return;

      const cruiseSpeed = vehicleCruiseSpeedMetersPerSecond(
        displayed,
        displayedCoordinateRef.current,
        currentTrack,
      );
      const nextMeters = Math.min(
        displayed + cruiseSpeed * speedFactor * (LIVE_VEHICLE_TICK_MS / 1000),
        currentTrack.metrics.totalMeters,
      );
      if (nextMeters <= displayed) return;

      const point = interpolatePolylineAtDistance(currentTrack.metrics, nextMeters)?.point;
      if (!point) return;

      displayedMetersRef.current = nextMeters;
      moveTo(point, LIVE_VEHICLE_TICK_MS);
      updateArrowSector(nextMeters);
    };

    tick();
    const intervalId = setInterval(tick, LIVE_VEHICLE_TICK_MS);
    return () => clearInterval(intervalId);
  }, [canAnimateNativeMarker, isActive, reduceMotion]);

  useEffect(() => {
    // tracksViewChanges stays false, so a committed arrow rotation only lands
    // in the marker icon after an explicit recapture.
    if (!canAnimateNativeMarker) return;
    contentMarkerRef.current?.redraw();
  }, [arrowSector, canAnimateNativeMarker]);

  return (
    <Marker
      ref={contentMarkerRef}
      coordinate={initialCoordinate}
      anchor={VEHICLE_PIN_ANCHOR}
      tracksViewChanges={false}
      zIndex={22}>
      <View
        collapsable={false}
        style={[styles.vehiclePin, { width: pinWidth, height: pinHeight }]}>
        {/* Translucency comes from alpha baked into each fill color; a
            view-level opacity here composites solid for a frame on Android
            whenever the marker icon is recaptured. The circles are
            rotation-invariant, so rotating this layer only moves the
            arrow point. */}
        <View
          collapsable={false}
          style={[
            styles.vehiclePinShape,
            arrowSector != null && {
              transform: [{ rotate: `${arrowSector * VEHICLE_ARROW_SECTOR_DEGREES}deg` }],
            },
          ]}>
          {arrowSector != null && (
            <>
              <View style={styles.vehiclePinArrowOuter} />
              <View style={[styles.vehiclePinArrowInner, { borderBottomColor: accent }]} />
            </>
          )}
          <View style={styles.vehiclePinOuterCircle} />
          <View
            style={[
              styles.vehiclePinInnerCircle,
              { backgroundColor: alpha(accent, VEHICLE_PIN_BACKGROUND_ALPHA_HEX) },
            ]}
          />
        </View>
        <View collapsable={false} style={styles.vehiclePinContent}>
          <View collapsable={false} style={styles.vehiclePinBusIconSlot}>
            <MaterialCommunityIcons
              name={modeIcon}
              size={busIconSize}
              color="#FFFFFF"
              style={styles.vehiclePinBusIcon}
            />
          </View>
          <View style={styles.vehicleRouteDigits}>
            {routeDigits.map((digit, index) => (
              <Text
                key={`${sample.routeKey}-${index}`}
                allowFontScaling={false}
                style={[
                  styles.vehicleRouteLabel,
                  {
                    fontSize: routeFontSize,
                    lineHeight: routeFontSize + 2,
                  },
                ]}>
                {digit}
              </Text>
            ))}
          </View>
        </View>
      </View>
      <Callout tooltip>
        <View style={styles.vehicleCallout}>
          <View style={[styles.vehicleCalloutIcon, { backgroundColor: accent }]}>
            <MaterialCommunityIcons name={modeIcon} size={22} color="#FFFFFF" />
          </View>
          <View style={styles.vehicleCalloutCopy}>
            <Text style={styles.vehicleCalloutTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.vehicleCalloutSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>
      </Callout>
    </Marker>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Ramps a shared alpha from near-invisible to full whenever `revealKey`
// changes. One value drives every stop marker, so a zoom tier crossing costs
// a fixed three commits instead of one per marker.
function useSteppedReveal(revealKey: string, enabled: boolean) {
  const lastStepIndex = MARKER_REVEAL_STEPS.length - 1;
  const [stepIndex, setStepIndex] = useState(lastStepIndex);

  useEffect(() => {
    if (!enabled) {
      setStepIndex(lastStepIndex);
      return;
    }

    setStepIndex(0);
    let current = 0;
    const intervalId = setInterval(() => {
      current += 1;
      setStepIndex(current);
      if (current >= lastStepIndex) clearInterval(intervalId);
    }, MARKER_REVEAL_STEP_MS);

    return () => clearInterval(intervalId);
  }, [enabled, lastStepIndex, revealKey]);

  return MARKER_REVEAL_STEPS[Math.min(stepIndex, lastStepIndex)];
}

// A second marker under the focused pin whose native alpha breathes. Its icon
// is captured once; only the alpha is stepped, so nothing is redrawn.
function FocusedStopHalo({
  coordinate,
  accent,
  reduceMotion,
  styles,
}: {
  coordinate: { latitude: number; longitude: number };
  accent: string;
  reduceMotion: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  const [opacity, setOpacity] = useState(FOCUSED_HALO_MAX_OPACITY);

  useEffect(() => {
    if (reduceMotion) {
      setOpacity(FOCUSED_HALO_MAX_OPACITY);
      return;
    }

    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      const phase = ((Date.now() - startedAt) % FOCUSED_HALO_CYCLE_MS) / FOCUSED_HALO_CYCLE_MS;
      const swell = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
      setOpacity(
        FOCUSED_HALO_MIN_OPACITY + swell * (FOCUSED_HALO_MAX_OPACITY - FOCUSED_HALO_MIN_OPACITY),
      );
    }, FOCUSED_HALO_STEP_MS);

    return () => clearInterval(intervalId);
  }, [reduceMotion]);

  return (
    <Marker
      coordinate={coordinate}
      anchor={{
        x: 0.5,
        y: (FOCUSED_HALO_CANVAS_SIZE / 2 + FOCUSED_HALO_CENTER_LIFT) / FOCUSED_HALO_CANVAS_SIZE,
      }}
      tracksViewChanges={false}
      opacity={opacity}
      zIndex={29}>
      <View collapsable={false} style={styles.focusedStopHaloCanvas}>
        <View style={[styles.focusedStopHaloRing, { borderColor: accent, backgroundColor: alpha(accent, '1F') }]} />
      </View>
    </Marker>
  );
}

// Map overlays (the focused-stop tray, the location pill) used to appear and
// vanish in a single frame. This wrapper rises them in and slides them back
// out; `visible` going false keeps the last content mounted, and inert, until
// the exit finishes.
function MapOverlayTransition({
  visible,
  reduceMotion,
  style,
  children,
}: {
  visible: boolean;
  reduceMotion: boolean;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const [settledHidden, setSettledHidden] = useState(!visible);

  useEffect(() => {
    if (visible) setSettledHidden(false);
    if (reduceMotion) {
      progress.setValue(visible ? 1 : 0);
      setSettledHidden(!visible);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? MAP_OVERLAY_ENTRANCE_MS : MAP_OVERLAY_EXIT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setSettledHidden(true);
    });

    return () => animation.stop();
  }, [progress, reduceMotion, visible]);

  if (!visible && settledHidden) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.97, 1],
              }),
            },
          ],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

export default function ExploreScreen({
  isActive = false,
  suspendNativeMap = false,
}: ExploreScreenProps) {
  const liveColors = useAppColors();
  const liveResolvedThemeMode = useResolvedAppThemeMode();
  const [inactiveThemeSnapshot, setInactiveThemeSnapshot] = useState(() => ({
    colors: liveColors,
    resolvedThemeMode: liveResolvedThemeMode,
  }));
  const colors = isActive ? liveColors : inactiveThemeSnapshot.colors;
  const resolvedThemeMode = isActive ? liveResolvedThemeMode : inactiveThemeSnapshot.resolvedThemeMode;
  const { t, ttcLocale, localizedStopName } = useI18n();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const queryClient = useQueryClient();
  const {
    state: favoritesState,
    selected,
    isLoaded: favoritesLoaded,
    select,
    setStop,
    save,
  } = useFavorites();
  const tripTitle = useFavoriteTitle();
  const { settings } = useSettings();
  const { focusedStop, clearStopFocus, requestStopFocus, requestStopSheetReturn } = useMapFocus();
  const navigateToTab = useTabNav();
  const lastFitKeyRef = useRef<string | null>(null);
  const lastRegionSampleAtRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [demoNow, setDemoNow] = useState(() => Date.now());
  // While the tab is hidden the map keeps drawing the trip it last showed, so
  // switching trips elsewhere does not churn the native map off-screen.
  const [inactiveTripId, setInactiveTripId] = useState(selected?.id ?? null);

  const trip = isActive
    ? selected
    : (favoritesState.favorites.find(favorite => favorite.id === inactiveTripId) ?? selected);
  const tripId = trip?.id ?? null;
  const tripKojoriDirection = trip ? kojoriTripDirection(trip) : null;
  const isKojoriTrip = tripKojoriDirection !== null;
  const mapAccent = mapTripAccent(trip, colors);
  const useCompactMapControls = windowWidth < 390;

  // One boarding per route pattern — the lines, stops and vehicles drawn.
  const patterns = useMemo(() => (trip ? tripPatterns(trip) : []), [trip]);
  const stopsData = useQueries({
    queries: patterns.map(boarding => ({ ...stopsQuery(boarding, ttcLocale), enabled: isActive })),
    combine: combineData<StopInfo[]>,
  });
  const geometryData = useQueries({
    queries: patterns.map(boarding => ({ ...geometryQuery(boarding), enabled: isActive })),
    combine: combineData<PolylinePoint[]>,
  });
  const liveVehicles = useQueries({
    queries: patterns.map(boarding => positionsQuery(boarding, isActive)),
    combine: combineVehicles,
  });
  const isFetching = liveVehicles.isFetching;

  const routePoints = useMemo(
    () => geometryData.map((geometry, index) => routePointsOf(geometry, stopsData[index])),
    [geometryData, stopsData],
  );
  const mapRoutes = useMemo<MapRoute[]>(
    () => patterns.map((boarding, index) => ({
      key: patternKey(boarding),
      boarding,
      direction: kojoriPatternDirection(boarding),
      stops: stopsData[index] ?? NO_STOPS,
      points: routePoints[index] ?? [],
    })),
    [patterns, routePoints, stopsData],
  );
  const allRoutePoints = useMemo(() => routePoints.flat(), [routePoints]);
  const mapBounds = useMemo(
    () => boundsForPoints(allRoutePoints, isKojoriTrip),
    [allRoutePoints, isKojoriTrip],
  );
  const [currentRegion, setCurrentRegion] = useState<Region>(() =>
    initialRegionFor(allRoutePoints, isKojoriTrip),
  );

  useEffect(() => {
    if (!isActive && !suspendNativeMap) return;
    setInactiveThemeSnapshot((prev) => {
      if (prev.colors === liveColors && prev.resolvedThemeMode === liveResolvedThemeMode) {
        return prev;
      }

      return {
        colors: liveColors,
        resolvedThemeMode: liveResolvedThemeMode,
      };
    });
  }, [isActive, liveColors, liveResolvedThemeMode, suspendNativeMap]);

  useEffect(() => {
    const selectedId = selected?.id ?? null;
    if (!isActive || inactiveTripId === selectedId) return;
    setInactiveTripId(selectedId);
  }, [inactiveTripId, isActive, selected?.id]);

  const hasMapView = !suspendNativeMap && tripId !== null;

  useEffect(() => {
    if (hasMapView) return;
    setMapReady(false);
    setMapTimedOut(false);
    lastFitKeyRef.current = null;
  }, [hasMapView]);

  useEffect(() => {
    if (!isActive || mapReady || !hasMapView) return;
    const id = setTimeout(() => setMapTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, [hasMapView, isActive, mapReady]);

  useEffect(() => {
    if (!settings.cancelledBusDemo || !isActive || !isKojoriTrip) return;

    setDemoNow(Date.now());
    const intervalId = setInterval(() => setDemoNow(Date.now()), 10_000);
    return () => clearInterval(intervalId);
  }, [isActive, isKojoriTrip, settings.cancelledBusDemo]);

  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFetching && !reduceMotion) {
      spinAnim.setValue(0);
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [isFetching, reduceMotion, spinAnim]);

  // The tray slides the locate button up rather than teleporting it: the
  // offset is a transform so the whole move stays on the native driver.
  const locateButtonLift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = focusedStop ? -LOCATE_BUTTON_TRAY_LIFT : 0;
    if (reduceMotion) {
      locateButtonLift.setValue(target);
      return;
    }

    const animation = Animated.spring(locateButtonLift, {
      toValue: target,
      damping: 20,
      stiffness: 180,
      mass: 0.9,
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [focusedStop, locateButtonLift, reduceMotion]);

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const positions = useMemo<MapVehiclePosition[]>(() => {
    const live = mapRoutes.flatMap((route, index) =>
      (liveVehicles.vehicles[index] ?? NO_VEHICLES).map(position => ({ ...position, routeKey: route.key })),
    );
    if (!settings.cancelledBusDemo || !tripKojoriDirection) return live;

    // The cancelled-bus demo only knows the 380/316 Kojori lines.
    const demo = getDemoVehiclePositions(tripKojoriDirection, demoNow).flatMap(position => {
      const route = mapRoutes.find(candidate => candidate.boarding.route.id === ROUTES[position.bus].id);
      return route ? [{ ...position, routeKey: route.key }] : [];
    });
    return [...demo, ...live.filter(position => !position.vehicleId.startsWith('demo-'))];
  }, [demoNow, liveVehicles.vehicles, mapRoutes, settings.cancelledBusDemo, tripKojoriDirection]);

  const vehicleRouteTracks = useMemo(() => {
    const tracks = new Map<string, VehicleRouteTrack>();
    mapRoutes.forEach(route => {
      const track = buildVehicleTrack(route);
      if (track) tracks.set(route.key, track);
    });
    return tracks;
  }, [mapRoutes]);
  const vehicleSamples = useMemo(() => {
    const routes = new Map(mapRoutes.map(route => [route.key, route]));
    return positions.flatMap(position => {
      const route = routes.get(position.routeKey);
      return route ? [buildVehicleSample(position, route, vehicleRouteTracks.get(route.key))] : [];
    });
  }, [mapRoutes, positions, vehicleRouteTracks]);
  // The boarding stop on each pattern: where the ETA readout counts down to.
  const activeStopId = trip ? tripStopId(trip) : '';
  const boardingStops = useMemo(() => {
    const stops = new Map<string, StopInfo>();
    trip?.boardings
      .filter(boarding => boarding.stop.id === activeStopId)
      .forEach(boarding => stops.set(patternKey(boarding), boarding.stop));
    return stops;
  }, [activeStopId, trip]);
  // ETA walks the route in 500m chunks per vehicle. Kept out of the render
  // body so panning and zooming (which commit `currentRegion`) never redo it.
  const vehicleMarkers = useMemo(() => {
    const routes = new Map(mapRoutes.map(route => [route.key, route]));

    return vehicleSamples.map(sample => {
      const route = routes.get(sample.routeKey)!;
      const track = vehicleRouteTracks.get(sample.routeKey);
      const boardingStop = boardingStops.get(sample.routeKey);
      const etaMinutes = boardingStop ? estimateVehicleEtaMinutes(sample, track, boardingStop) : null;

      return {
        sample,
        track,
        accent: routeColor(route.boarding.route.id, colors, trip),
        title: `${sample.label} ${t('directionTo')}${headsignLabel(route.boarding.pattern.headsign, t)}`,
        subtitle: etaMinutes != null
          ? t('mapVehicleEta', { minutes: etaMinutes })
          : t('mapVehicle', { id: sample.vehicleId }),
      };
    });
  }, [boardingStops, colors, mapRoutes, t, trip, vehicleRouteTracks, vehicleSamples]);

  // Stop focus can come from another trip (the home screen's selector, or a
  // trip switch while the tray is open), so actions resolve the trip by id.
  const findTrip = (id: string | undefined) =>
    id ? favoritesState.favorites.find(favorite => favorite.id === id) : undefined;
  const focusedTrip = focusedStop ? (findTrip(focusedStop.tripId) ?? trip) : undefined;
  // The tray animates out after the focus is cleared, so it renders from the
  // last stop that was focused rather than from the live one — reading the
  // live value would empty the tray mid-exit and collapse its height.
  const [trayStop, setTrayStop] = useState(focusedStop);
  const trayTrip = trayStop ? (findTrip(trayStop.tripId) ?? trip) : undefined;
  const trayPatterns = useMemo(() => (trayTrip ? tripPatterns(trayTrip) : []), [trayTrip]);
  // Same query keys as the map's own stop lists, so this is a cache read
  // unless the tray belongs to another trip.
  const trayPatternStops = useQueries({
    queries: trayPatterns.map(boarding => ({ ...stopsQuery(boarding, ttcLocale), enabled: isActive })),
    combine: combineData<StopInfo[]>,
  });
  const arrivalBoarding: Boarding | null = focusedStop && focusedTrip?.boardings[0]
    ? { ...focusedTrip.boardings[0], stop: plainStop(focusedStop) }
    : null;
  const [focusedArrivalsQuery] = useQueries({
    queries: (arrivalBoarding ? [arrivalBoarding] : []).map(boarding =>
      arrivalsQuery(boarding, ttcLocale, isActive),
    ),
  });
  const focusedStopArrivals = focusedArrivalsQuery?.data;
  const isFetchingFocusedStopArrivals = focusedArrivalsQuery?.isFetching ?? false;
  const focusedLiveArrivals = useMemo(() => {
    if (!focusedTrip) return [];
    const tripRoutePatterns = tripPatterns(focusedTrip);
    return (focusedStopArrivals ?? [])
      .flatMap(arrival => {
        const boarding = tripRoutePatterns.find(candidate =>
          candidate.route.shortName === arrival.shortName &&
          candidate.pattern.patternSuffix === arrival.patternSuffix,
        );
        return arrival.realtime && boarding
          ? [{ arrival, routeId: boarding.route.id }]
          : [];
      })
      .sort((a, b) => a.arrival.realtimeArrivalMinutes - b.arrival.realtimeArrivalMinutes)
      .slice(0, 3);
  }, [focusedStopArrivals, focusedTrip]);
  const [trayArrivals, setTrayArrivals] = useState<{
    arrivals: { arrival: ArrivalTime; routeId: string }[];
    isFetching: boolean;
  }>({
    arrivals: focusedLiveArrivals,
    isFetching: isFetchingFocusedStopArrivals,
  });

  useEffect(() => {
    if (!focusedStop) return;
    setTrayStop(focusedStop);
  }, [focusedStop]);

  useEffect(() => {
    if (!focusedStop) return;
    setTrayArrivals({
      arrivals: focusedLiveArrivals,
      isFetching: isFetchingFocusedStopArrivals,
    });
  }, [focusedLiveArrivals, focusedStop, isFetchingFocusedStopArrivals]);

  // Two accents, deliberately: map layers follow the live focus, because the
  // halo captures its icon once and would otherwise bake in the accent of the
  // previously focused stop (`trayStop` lags by a render). The tray follows
  // the held stop so it keeps its colour while animating out.
  const focusedStopAccent = mapTripAccent(focusedTrip, colors);
  const trayAccent = mapTripAccent(trayTrip, colors);
  const trayStopLabel = trayStop ? localizedStopName(trayStop) : '';
  const focusedStopIsSaved = trayStop && trayTrip ? tripHasStop(trayTrip, trayStop.id) : false;
  // Saving a stop adds a boarding for every route of the trip that serves it.
  const trayStopAdditions = trayStop && trayTrip && !focusedStopIsSaved
    ? stopAdditions(trayTrip, trayPatternStops, plainStop(trayStop))
    : [];
  const focusedStopSaveDisabled = focusedStopIsSaved
    ? !trayTrip || tripStops(trayTrip).length <= 1
    : trayStopAdditions.length === 0;
  const focusedStopIsActive = trayStop && trayTrip ? tripStopId(trayTrip) === trayStop.id : false;
  const focusedStopCoordinate =
    typeof focusedStop?.lat === 'number' && typeof focusedStop.lon === 'number'
      ? { latitude: focusedStop.lat, longitude: focusedStop.lon }
      : null;

  const splitPolylines = useMemo(() => {
    // The casing runs under the full line of each route — exclusive stretches
    // and the shared zebra alike — so the stripes never sit bare on the map.
    const casing = routePoints.map(points => simplifyPolyline(points, ROUTE_LINE_SIMPLIFY_TOLERANCE_METERS));

    // Two routes that share road (380 and 316 into Kojori) stripe the shared
    // stretch in both colours. Any other count draws each line whole.
    if (routePoints.length !== 2 || routePoints[0].length < 2 || routePoints[1].length < 2) {
      return {
        exclusive: casing,
        casing,
        sharedZebra: [],
      };
    }

    const split = splitPolylinesByOverlap(routePoints[0], routePoints[1], SHARED_ROUTE_STRIPE_METERS);

    return {
      exclusive: [
        simplifyPolyline(split.route1.exclusive, ROUTE_LINE_SIMPLIFY_TOLERANCE_METERS),
        simplifyPolyline(split.route2.exclusive, ROUTE_LINE_SIMPLIFY_TOLERANCE_METERS),
      ],
      casing,
      sharedZebra: split.sharedZebra
        .map(segment => ({
          ...segment,
          coords: simplifyPolyline(segment.coords, ROUTE_LINE_SIMPLIFY_TOLERANCE_METERS),
        }))
        .filter(segment => segment.coords.length >= 2),
    };
  }, [routePoints]);
  // Earlier routes in the trip draw on top, as 380 always sat over 316.
  const routeDrawOrder = mapRoutes.map((route, index) => ({ route, index })).reverse();

  const groupedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    positions.forEach(position => counts.set(position.routeKey, (counts.get(position.routeKey) ?? 0) + 1));
    return counts;
  }, [positions]);

  const showMarkers = useMemo(() => {
    return currentRegion.latitudeDelta < 0.5;
  }, [currentRegion.latitudeDelta]);
  const stopMarkerZoomTier = getStopMarkerZoomTier(currentRegion.latitudeDelta);
  // One shared alpha ramp for the whole stop layer: crossing a zoom tier or
  // switching trips swaps a lot of markers at once, and fading them in
  // together costs three commits instead of one per marker.
  const stopMarkerRevealOpacity = useSteppedReveal(
    `${tripId}:${stopMarkerZoomTier}`,
    isActive && !reduceMotion,
  );
  const routeLineWidth = ROUTE_LINE_WIDTH_BY_TIER[stopMarkerZoomTier];
  const routeCasingColor = ROUTE_CASING_COLOR[resolvedThemeMode === 'dark' ? 'dark' : 'light'];
  const showOrdinaryStopMarkers = stopMarkerZoomTier !== 'overview';

  const stopMarkers = useMemo(() => {
    if (!trip) return [];
    const savedStops = tripStops(trip);
    const favoriteStopSet = new Set(savedStops.map(stop => stop.id));
    const curatedStopIds = tripKojoriDirection ? getCuratedStopIds(tripKojoriDirection) : [];
    const curatedStopSet = new Set(curatedStopIds);
    const promotedStopSet = new Set([...favoriteStopSet, ...curatedStopSet]);
    const firstRouteStopId = mapRoutes[0]?.stops[0]?.id;
    const routeStopMap = new Map<string, StopInfo>();
    mapRoutes.forEach(route => route.stops.forEach(stop => {
      if (!routeStopMap.has(stop.id)) routeStopMap.set(stop.id, stop);
    }));
    const fallbackStops = [
      ...savedStops,
      ...curatedStopIds
        .map(stopId => findStop(stopId))
        .filter((stop): stop is StopInfo => Boolean(stop)),
    ];
    fallbackStops.forEach(stop => {
      if (!routeStopMap.has(stop.id)) routeStopMap.set(stop.id, stop);
    });

    return Array.from(routeStopMap.values())
      .filter(hasCoordinates)
      .filter(stop => stop.id !== focusedStop?.id)
      .filter(stop => showOrdinaryStopMarkers || promotedStopSet.has(stop.id))
      .map(stop => ({
        stop,
        isPromoted: favoriteStopSet.has(stop.id) || curatedStopSet.has(stop.id),
        priority: stopMarkerPriority(stop.id, firstRouteStopId, favoriteStopSet, curatedStopSet, isKojoriTrip),
      }))
      .sort((a, b) => a.priority - b.priority);
  }, [focusedStop?.id, isKojoriTrip, mapRoutes, showOrdinaryStopMarkers, trip, tripKojoriDirection]);

  const visibleStopMarkers = useMemo(() => {
    return declutterPromotedStopMarkers(
      stopMarkers,
      currentRegion,
      stopMarkerZoomTier,
      windowWidth,
      windowHeight,
    );
  }, [currentRegion, stopMarkerZoomTier, stopMarkers, windowHeight, windowWidth]);
  const fullStopMarkers = visibleStopMarkers.visible;
  const compactStopMarkers = visibleStopMarkers.compact;

  function handleCenterOnRoute(routeKey: string) {
    const routePositions = positions.filter(p => p.routeKey === routeKey);
    if (routePositions.length === 0) return;

    if (routePositions.length === 1) {
      mapRef.current?.animateToRegion({
        latitude: routePositions[0].lat,
        longitude: routePositions[0].lon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.04,
      }, 500);
    } else {
      mapRef.current?.fitToCoordinates(
        routePositions.map(p => ({ latitude: p.lat, longitude: p.lon })),
        {
          edgePadding: { top: 100, right: 60, bottom: 160, left: 60 },
          animated: true,
        },
      );
    }
  }

  useEffect(() => {
    if (!isActive || !mapReady || !tripId || focusedStop || !liveVehicles.settled) return;

    // Fit once per trip while this native map stays mounted. Keying on the
    // vehicle set made the camera yank away from wherever the user had panned
    // every time a bus appeared or dropped off. With no bus on the road the
    // trip's own lines frame the view instead.
    const fitKey = tripId;
    if (fitKey === lastFitKeyRef.current) return;

    const coordinates = positions.length > 0
      ? positions.map(position => ({ latitude: position.lat, longitude: position.lon }))
      : splitPolylines.casing.flat();
    if (coordinates.length === 0) return;

    // The key is claimed when the fit actually runs: positions or geometry
    // landing inside the delay re-run this effect, and claiming it up front
    // let that cleanup cancel the only fit.
    const timeoutId = setTimeout(() => {
      lastFitKeyRef.current = fitKey;
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: {
          top: 100,
          right: 60,
          bottom: 160,
          left: 60,
        },
        animated: true,
      });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [focusedStop, isActive, liveVehicles.settled, mapReady, positions, splitPolylines.casing, tripId]);

  useEffect(() => {
    if (!isActive || !mapReady || !focusedStop) return;

    const timeoutId = setTimeout(() => {
      if (typeof focusedStop.lat === 'number' && typeof focusedStop.lon === 'number') {
        mapRef.current?.animateToRegion(
          {
            latitude: focusedStop.lat,
            longitude: focusedStop.lon,
            latitudeDelta: 0.018,
            longitudeDelta: 0.018,
          },
          450,
        );
        return;
      }

      const fallbackCoordinates = splitPolylines.casing.flat();
      if (fallbackCoordinates.length >= 2) {
        mapRef.current?.fitToCoordinates(fallbackCoordinates, {
          edgePadding: { top: 100, right: 60, bottom: 160, left: 60 },
          animated: true,
        });
      }
    }, 180);

    return () => clearTimeout(timeoutId);
  }, [focusedStop, isActive, mapReady, splitPolylines.casing]);

  useEffect(() => {
    if (!isActive || !focusedStop) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      clearStopFocus();
      return true;
    });

    return () => subscription.remove();
  }, [clearStopFocus, focusedStop, isActive]);

  // Show the user-location dot whenever permission is already granted, without
  // prompting — the locate button remains the only place that requests it.
  useEffect(() => {
    if (!isActive || hasUserLocation) return;

    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then(permission => {
        if (!cancelled && permission.status === 'granted') setHasUserLocation(true);
      })
      .catch(() => { });

    return () => {
      cancelled = true;
    };
  }, [isActive, hasUserLocation]);

  async function handleLocateMe() {
    setIsLocating(true);
    setLocationMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage(t('mapLocationRequired'));
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setHasUserLocation(true);
      mapRef.current?.animateToRegion(
        {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.018,
          longitudeDelta: 0.018,
        },
        450,
      );
    } catch {
      setLocationMessage(t('locationUnavailable'));
    } finally {
      setIsLocating(false);
    }
  }

  function handleRegionChange(region: Region) {
    const clampedRegion = {
      latitude: Math.max(mapBounds.latMin, Math.min(mapBounds.latMax, region.latitude)),
      longitude: Math.max(mapBounds.lonMin, Math.min(mapBounds.lonMax, region.longitude)),
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    };

    // Bounce back only when meaningfully outside the bounds — re-animating on
    // sub-epsilon clamp deltas made the edge feel springy on every gesture.
    const clampDelta = Math.max(
      Math.abs(clampedRegion.latitude - region.latitude),
      Math.abs(clampedRegion.longitude - region.longitude),
    );
    if (clampDelta > 0.002) {
      mapRef.current?.animateToRegion(clampedRegion, 300);
    }

    setCurrentRegion(previousRegion => (
      shouldUpdateMapRegion(previousRegion, clampedRegion)
        ? clampedRegion
        : previousRegion
    ));
  }

  // Mid-gesture sampling. `onRegionChangeComplete` still owns the clamping and
  // the authoritative region; this only re-tiers the marker layer while the
  // fingers are still down, and bails unless the tier actually flipped.
  function handleRegionChangeSample(region: Region) {
    const now = Date.now();
    if (now - lastRegionSampleAtRef.current < REGION_SAMPLE_THROTTLE_MS) return;
    lastRegionSampleAtRef.current = now;

    setCurrentRegion(previousRegion => {
      const tierChanged =
        getStopMarkerZoomTier(previousRegion.latitudeDelta) !== getStopMarkerZoomTier(region.latitudeDelta);
      const markerVisibilityChanged =
        previousRegion.latitudeDelta < 0.5 !== region.latitudeDelta < 0.5;

      return tierChanged || markerVisibilityChanged ? region : previousRegion;
    });
  }

  function handleMapPress(event: MapPressEvent) {
    if (event.nativeEvent.action === 'marker-press') return;
    clearStopFocus();
  }

  function applyFocusedStop() {
    if (!focusedStop || !focusedTrip) return;

    if (tripHasStop(focusedTrip, focusedStop.id)) {
      select(focusedTrip.id);
      setStop(focusedTrip.id, focusedStop.id);
      return;
    }

    // Departures only run from saved stops, so boarding somewhere new saves it.
    if (trayStopAdditions.length > 0) {
      save({
        ...focusedTrip,
        boardings: [...focusedTrip.boardings, ...trayStopAdditions],
        stopId: focusedStop.id,
      });
    }
  }

  function handleShowFocusedStopDepartures() {
    applyFocusedStop();
    navigateToTab?.('index');
  }

  function handleToggleFocusedStopSaved() {
    if (!focusedStop || !focusedTrip || focusedStopSaveDisabled) return;

    if (focusedStopIsSaved) {
      const next = tripWithoutStop(focusedTrip, focusedStop.id);
      if (next) save(next);
      return;
    }

    save({ ...focusedTrip, boardings: [...focusedTrip.boardings, ...trayStopAdditions] });
  }

  function handleRefreshVehicles() {
    patterns.forEach(boarding => {
      void queryClient.refetchQueries({ queryKey: positionsQuery(boarding, true).queryKey, exact: true });
    });
  }

  if (suspendNativeMap || !favoritesLoaded) {
    return <View style={styles.screen} />;
  }

  if (!trip) {
    return <MapEmptyState />;
  }

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={currentRegion}
        userInterfaceStyle={resolvedThemeMode}
        // Both themes pass a non-empty style so switching always restyles the
        // map at runtime without remounting the MapView (which would reload
        // tiles and reset the camera).
        customMapStyle={resolvedThemeMode === 'dark' ? GOOGLE_DARK_MAP_STYLE : GOOGLE_LIGHT_MAP_STYLE}
        showsUserLocation={isActive && hasUserLocation}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsIndoors={false}
        showsTraffic={false}
        minZoomLevel={MAP_MIN_ZOOM_LEVEL}
        onMapReady={() => {
          setMapReady(true);
          setMapTimedOut(false);
        }}
        onRegionChange={handleRegionChangeSample}
        onRegionChangeComplete={handleRegionChange}
        onPress={handleMapPress}>
        {routeDrawOrder.map(({ route, index }) => {
          const casing = splitPolylines.casing[index] ?? [];
          return casing.length >= 2 ? (
            <Polyline
              key={`route-${route.key}-casing`}
              coordinates={casing}
              strokeColor={routeCasingColor}
              strokeWidth={routeLineWidth + ROUTE_CASING_EXTRA_WIDTH}
              zIndex={1}
              lineCap="round"
              lineJoin="round"
            />
          ) : null;
        })}
        {routeDrawOrder.map(({ route, index }) => {
          const exclusive = splitPolylines.exclusive[index] ?? [];
          return exclusive.length >= 2 ? (
            <Polyline
              key={`route-${route.key}-exclusive`}
              coordinates={exclusive}
              strokeColor={routeColor(route.boarding.route.id, colors, trip)}
              strokeWidth={routeLineWidth}
              zIndex={2}
              lineCap="round"
              lineJoin="round"
            />
          ) : null;
        })}
        {/* Round caps, not butt: consecutive stripes share an endpoint,
            and at a bend two butt-capped strokes leave the outside of
            the turn uncovered — a notch the casing shows straight
            through. The half-width the caps add overlaps into the
            neighbouring stripe, which is exactly what closes it. */}
        {splitPolylines.sharedZebra.map((seg, i) => {
          const route = mapRoutes[seg.colorIndex];
          return route ? (
            <Polyline
              key={`zebra-${i}`}
              coordinates={seg.coords}
              strokeColor={routeColor(route.boarding.route.id, colors, trip)}
              strokeWidth={routeLineWidth}
              zIndex={3}
              lineCap="round"
              lineJoin="round"
            />
          ) : null;
        })}
        {/* One flat keyed list: decluttering re-buckets stops between the full
            and compact tiers on every pan/zoom, and rendering them as two
            sibling fragments remounted (blinked) every marker that crossed. */}
        {showMarkers && [
          ...fullStopMarkers.map(entry => ({ ...entry, compact: false })),
          ...compactStopMarkers.map(({ stop }) => ({ stop, isPromoted: false, compact: true })),
        ].map(({ stop, isPromoted, compact }) => {
          const isSimpleOrdinaryStop = compact || (!isPromoted && stopMarkerZoomTier === 'mid');

          return (
            <StopMapMarker
              key={`stop-${tripId}-${stop.id}`}
              stop={stop}
              isPromoted={isPromoted}
              isSimpleOrdinaryStop={isSimpleOrdinaryStop}
              markerColor={mapAccent}
              revealOpacity={stopMarkerRevealOpacity}
              styles={styles}
              resolvedThemeMode={resolvedThemeMode}
              colors={colors}
              onPress={() => requestStopFocus(stop, trip.id)}
            />
          );
        })}
        {showMarkers && vehicleMarkers.map(({ sample, track, accent, title, subtitle }) => (
          <AnimatedVehicleMarker
            key={`${sample.routeKey}-${sample.vehicleId}`}
            sample={sample}
            track={track}
            isActive={isActive}
            reduceMotion={reduceMotion}
            accent={accent}
            title={title}
            subtitle={subtitle}
            styles={styles}
          />
        ))}
        {focusedStop && focusedStopCoordinate ? (
          <FocusedStopHalo
            key={`focused-stop-halo-${focusedStop.id}-${focusedStopAccent}`}
            coordinate={focusedStopCoordinate}
            accent={focusedStopAccent}
            reduceMotion={reduceMotion}
            styles={styles}
          />
        ) : null}
        {focusedStop && focusedStopCoordinate ? (
          <Marker
            key={`focused-stop-${focusedStop.id}-${focusedStop.requestedAt}-${focusedStopAccent}`}
            coordinate={focusedStopCoordinate}
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: -24 }}
            tracksViewChanges={false}
            zIndex={30}
          >
            <View collapsable={false} style={styles.focusedStopMarker}>
              <View
                style={[
                  styles.focusedStopMarkerCore,
                  {
                    backgroundColor: colors.panel,
                    borderColor: focusedStopAccent,
                  },
                ]}>
                <StopPostGlyph size={26} color={focusedStopAccent} />
              </View>
            </View>
          </Marker>
        ) : null}
      </MapView>

      {/* Top controls */}
      <View style={[styles.topPanel, useCompactMapControls && styles.topPanelCompact, { top: insets.top + 12 }]}>
        <TripSwitch
          accentColor={mapAccent}
          compact={useCompactMapControls}
          style={[styles.directionSwitch, useCompactMapControls && styles.directionSwitchCompact]}
        />

        <View style={[styles.legendRow, useCompactMapControls && styles.legendRowCompact]}>
          {mapRoutes.map(route => {
            const bus = route.boarding.route.shortName;
            const accent = routeColor(route.boarding.route.id, colors, trip);
            const count = groupedCounts.get(route.key) ?? 0;
            const hasActiveBuses = count > 0;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel={t('mapRouteVehiclesCount', { bus, count })}
                accessibilityHint={hasActiveBuses ? t('mapCenterRouteVehicles', { bus }) : undefined}
                accessibilityState={{ disabled: !hasActiveBuses }}
                style={[
                  styles.legendChip,
                  useCompactMapControls && styles.legendChipCompact,
                  hasActiveBuses && styles.legendChipClickable,
                ]}
                onPress={() => hasActiveBuses && handleCenterOnRoute(route.key)}
                disabled={!hasActiveBuses}>
                <View style={[styles.legendDot, useCompactMapControls && styles.legendDotCompact, { backgroundColor: accent }]} />
                <Text style={[styles.legendLabel, useCompactMapControls && styles.legendLabelCompact]}>{bus}</Text>
                <Text style={[styles.legendCount, useCompactMapControls && styles.legendCountCompact]}>{count}</Text>
              </Pressable>
            );
          })}
          <TtcStatusChip constrained />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFetching ? t('mapRefreshingLive') : t('mapRefreshLive')}
            accessibilityState={{ busy: isFetching, disabled: isFetching }}
            style={[styles.refreshChip, useCompactMapControls && styles.refreshChipCompact]}
            onPress={handleRefreshVehicles}
            disabled={isFetching}>
            <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
              <MaterialCommunityIcons
                name="refresh"
                size={useCompactMapControls ? 15 : 16}
                color={isFetching ? colors.primary : colors.textDim}
              />
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {/* Locate me — bottom right */}
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={isLocating ? t('mapLocatingMe') : t('mapLocateMe')}
        accessibilityState={{ busy: isLocating, disabled: isLocating }}
        style={[
          styles.locateButton,
          { bottom: insets.bottom + BottomTabInset + 24 },
          isLocating && styles.locateButtonActive,
          { transform: [{ translateY: locateButtonLift }] },
        ]}
        onPress={handleLocateMe}
        disabled={isLocating}>
        <MaterialCommunityIcons
          name={isLocating ? 'crosshairs-question' : 'crosshairs-gps'}
          size={20}
          color={isLocating ? colors.primary : colors.text}
        />
      </AnimatedPressable>

      {locationMessage ? (
        <MapOverlayTransition
          key={`location-message-${locationMessage}`}
          visible
          reduceMotion={reduceMotion}
          style={[styles.bottomPillContainer, { bottom: insets.bottom + BottomTabInset + 18 }]}>
          <View style={styles.bottomPill}>
            <Text style={styles.bottomPillText}>{locationMessage}</Text>
          </View>
        </MapOverlayTransition>
      ) : null}

      {trayStop ? (
        <MapOverlayTransition
          key={`focused-stop-tray-${trayStop.id}-${trayStop.requestedAt}`}
          visible={Boolean(focusedStop)}
          reduceMotion={reduceMotion}
          style={[styles.focusedStopTrayWrap, { bottom: insets.bottom + BottomTabInset + 18 }]}>
          <View
            style={[
              styles.focusedStopTray,
              {
                borderColor: alpha(trayAccent, '42'),
                backgroundColor: alpha(colors.panel, resolvedThemeMode === 'dark' ? 'F2' : 'FA'),
              },
            ]}
          >
            <View style={[styles.focusedStopTrayRail, { backgroundColor: trayAccent }]} />
            <View style={styles.focusedStopTrayContent}>
              <View style={styles.focusedStopTrayHeader}>
                <View style={styles.focusedStopTrayCopy}>
                  <Text style={styles.focusedStopTrayEyebrow} numberOfLines={1}>
                    {trayTrip ? tripTitle(trayTrip) : ''}
                  </Text>
                  <Text style={styles.focusedStopTrayTitle} numberOfLines={1}>
                    {trayStopLabel}
                  </Text>
                  <Text style={[styles.focusedStopTrayCode, { color: trayAccent }]}>
                    #{trayStop.id.split(':')[1] ?? trayStop.id}
                  </Text>
                </View>
                {focusedStopIsActive ? (
                  <View
                    style={[
                      styles.focusedStopTrayBadge,
                      {
                        borderColor: alpha(trayAccent, '36'),
                        backgroundColor: alpha(trayAccent, '16'),
                      },
                    ]}>
                    <Text style={[styles.focusedStopTrayBadgeText, { color: trayAccent }]}>
                      {t('commonSelected')}
                    </Text>
                  </View>
                ) : null}
              </View>
              {trayArrivals.arrivals.length > 0 || trayArrivals.isFetching ? (
                <View style={styles.focusedStopLiveArrivals}>
                  {trayArrivals.arrivals.length > 0 ? trayArrivals.arrivals.map(({ arrival, routeId }) => {
                    const bus = arrival.shortName;
                    const busAccent = routeColor(routeId, colors, trayTrip);
                    const minutes = Math.max(0, Math.round(arrival.realtimeArrivalMinutes));
                    const minutesLabel = minutes < 1
                      ? t('commonNow')
                      : t('timePlusMinutes', { minutes });

                    return (
                      <View
                        key={`${bus}-${arrival.patternSuffix}-${arrival.realtimeArrivalMinutes}`}
                        style={[
                          styles.focusedStopLiveArrivalChip,
                          {
                            borderColor: alpha(busAccent, '3D'),
                            backgroundColor: alpha(busAccent, '16'),
                          },
                        ]}>
                        <View style={[styles.focusedStopLiveBusBadge, { backgroundColor: busAccent }]}>
                          <Text style={styles.focusedStopLiveBusText}>{bus}</Text>
                        </View>
                        <Text style={[styles.focusedStopLiveArrivalText, { color: busAccent }]}>
                          {minutesLabel}
                        </Text>
                      </View>
                    );
                  }) : (
                    <View style={[styles.focusedStopLiveArrivalChip, { borderColor: alpha(trayAccent, '30') }]}>
                      <MaterialCommunityIcons name="sync" size={13} color={trayAccent} />
                      <Text style={[styles.focusedStopLiveArrivalText, { color: trayAccent }]}>
                        {t('liveEstimate')}
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}
              <View
                accessibilityLabel={t('mapStopActionsFor', { stop: trayStopLabel })}
                style={styles.focusedStopTrayActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    focusedStopIsSaved
                      ? t('mapRemoveSavedStopA11y', { stop: trayStopLabel })
                      : t('mapSaveStopA11y', { stop: trayStopLabel })
                  }
                  accessibilityState={{ selected: focusedStopIsSaved, disabled: focusedStopSaveDisabled }}
                  onPress={handleToggleFocusedStopSaved}
                  disabled={focusedStopSaveDisabled}
                  style={[
                    styles.focusedStopTrayAction,
                    { borderColor: alpha(trayAccent, '42') },
                    focusedStopIsSaved && {
                      backgroundColor: alpha(trayAccent, '12'),
                    },
                    focusedStopSaveDisabled && styles.focusedStopTrayActionDisabled,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={focusedStopIsSaved ? 'star' : 'star-outline'}
                    size={15}
                    color={trayAccent}
                  />
                  <Text style={[styles.focusedStopTrayActionText, { color: trayAccent }]}>
                    {focusedStopIsSaved ? t('mapRemoveSavedStop') : t('mapSaveStop')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('mapShowNextBusesA11y', { stop: trayStopLabel })}
                  onPress={handleShowFocusedStopDepartures}
                  style={[
                    styles.focusedStopTrayAction,
                    styles.focusedStopTrayPrimaryAction,
                    { backgroundColor: trayAccent, borderColor: trayAccent },
                  ]}
                >
                  <MaterialCommunityIcons name="clock-fast" size={15} color="#FFFFFF" />
                  <Text style={[styles.focusedStopTrayActionText, styles.focusedStopTrayPrimaryActionText]}>
                    {t('mapShowNextBuses')}
                  </Text>
                </Pressable>
                {trayStop.returnRoute ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('mapBackToPicker')}
                    onPress={() => {
                      requestStopSheetReturn();
                      navigateToTab?.(trayStop.returnRoute ?? 'index');
                    }}
                    style={[styles.focusedStopTrayAction, { borderColor: alpha(trayAccent, '42') }]}
                  >
                    <MaterialCommunityIcons name="chevron-up" size={15} color={trayAccent} />
                    <Text style={[styles.focusedStopTrayActionText, { color: trayAccent }]}>
                      {t('mapBackToPicker')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        </MapOverlayTransition>
      ) : null}

      {mapTimedOut ? (
        <View style={styles.configOverlay} pointerEvents="none">
          <Text style={styles.configTitle}>{t('mapNotLoading')}</Text>
          <Text style={styles.configText}>
            {t('mapConfigIssue')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(C: ReturnType<typeof useAppColors>) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // The legend drops to its own line rather than overflowing the row: its
    // chips are fixed-width, so without this the row shrank under them and
    // they spilled back over the direction switch.
    flexWrap: 'wrap',
    rowGap: 8,
  },
  topPanelCompact: {
    left: 12,
    right: 12,
    gap: 6,
  },
  directionSwitch: {
    // Translucent shell to match the chips (overrides the component's opaque
    // surface). The compact map variant below avoids squeezing the full
    // Tbilisi→Kojori label past its readable width on small phones.
    flexShrink: 1,
    backgroundColor: `${C.panel}D9`,
  },
  directionSwitchCompact: {
    flexShrink: 0,
    minWidth: 108,
    maxWidth: 128,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Grows to push itself to the right edge on whichever line it lands on,
    // and refuses to shrink so the row wraps instead of overlapping.
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: 'flex-end',
  },
  legendRowCompact: {
    gap: 4,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: `${C.panel}D9`,
    borderWidth: 1,
    borderColor: C.border,
    opacity: 0.5,
    flexShrink: 0,
  },
  legendChipClickable: {
    opacity: 1,
  },
  legendChipCompact: {
    height: 36,
    paddingHorizontal: 8,
    gap: 4,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendDotCompact: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { color: C.text, fontSize: 12, fontWeight: '700' },
  legendLabelCompact: { fontSize: 11 },
  legendCount: { color: C.textDim, fontSize: 11, fontWeight: '700' },
  legendCountCompact: { fontSize: 10 },
  refreshChip: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: `${C.panel}D9`,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  refreshChipCompact: {
    width: 36,
    height: 36,
  },
  locateButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${C.panel}E6`,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateButtonActive: { borderColor: C.primary },
  bottomPillContainer: {
    position: 'absolute',
    left: 16,
    right: 76,
    alignItems: 'flex-start',
  },
  bottomPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: `${C.panel}E0`,
    borderWidth: 1,
    borderColor: C.border,
  },
  bottomPillText: { color: C.textDim, fontSize: 12 },
  focusedStopTrayWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  focusedStopTray: {
    minHeight: 78,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  focusedStopTrayRail: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  focusedStopTrayContent: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  focusedStopTrayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  focusedStopTrayCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  focusedStopTrayBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  focusedStopTrayBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  focusedStopTrayEyebrow: {
    color: C.textFaint,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  focusedStopTrayTitle: {
    color: C.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  focusedStopTrayCode: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },
  focusedStopLiveArrivals: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  focusedStopLiveArrivalChip: {
    minHeight: 30,
    borderRadius: 16,
    borderWidth: 1,
    paddingLeft: 5,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  focusedStopLiveBusBadge: {
    minWidth: 34,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedStopLiveBusText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
  },
  focusedStopLiveArrivalText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
  },
  focusedStopTrayActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  focusedStopTrayAction: {
    minHeight: 34,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  focusedStopTrayPrimaryAction: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  focusedStopTrayActionDisabled: {
    opacity: 0.55,
  },
  focusedStopTrayActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  focusedStopTrayPrimaryActionText: {
    color: '#FFFFFF',
  },
  stopMarkerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopMarker: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  simpleStopMarker: {
    borderWidth: 1.5,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  promotedStopMarkerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  promotedStopMarker: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePin: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  vehiclePinShape: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: VEHICLE_PIN_CANVAS_SIZE,
    height: VEHICLE_PIN_CANVAS_SIZE,
    alignItems: 'center',
    overflow: 'visible',
    zIndex: 1,
  },
  // White ring + accent disc, alphas pre-baked per color. The disc tucks 1px
  // under the ring border so no map-colored hairline shows between them.
  vehiclePinOuterCircle: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: alpha('#FFFFFF', 'C7'),
  },
  vehiclePinInnerCircle: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  vehiclePinArrowOuter: {
    position: 'absolute',
    top: 1,
    left: 23,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: alpha('#FFFFFF', 'F2'),
  },
  vehiclePinArrowInner: {
    position: 'absolute',
    top: 4,
    left: 26,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  vehiclePinContent: {
    position: 'absolute',
    top: 16,
    left: 15,
    width: 36,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    elevation: 2,
  },
  vehiclePinBusIconSlot: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  vehiclePinBusIcon: {
    lineHeight: 16,
    transform: [{ translateX: 0.5 }, { translateY: 0.5 }],
  },
  vehicleRouteDigits: {
    marginTop: -1,
    width: 34,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleRouteLabel: {
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  vehicleCallout: {
    width: 260,
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${C.panel}F2`,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  vehicleCalloutIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  vehicleCalloutCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  vehicleCalloutTitle: {
    color: C.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
  },
  vehicleCalloutSubtitle: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  focusedStopMarker: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedStopHaloCanvas: {
    width: FOCUSED_HALO_CANVAS_SIZE,
    height: FOCUSED_HALO_CANVAS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusedStopHaloRing: {
    width: FOCUSED_HALO_RING_SIZE,
    height: FOCUSED_HALO_RING_SIZE,
    borderRadius: FOCUSED_HALO_RING_SIZE / 2,
    borderWidth: 2,
  },
  focusedStopMarkerCore: {
    width: 38,
    height: 42,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  configOverlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '40%',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: `${C.panel}F0`,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  configTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  configText: { color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  });
}
