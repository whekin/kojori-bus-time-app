import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  GOOGLE_DARK_MINIMAL_MAP_STYLE,
  GOOGLE_LIGHT_MINIMAL_MAP_STYLE,
} from '@/constants/map-style';
import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  buildPickerRegion,
  projectToView,
  regionsEqual,
  zoomForRegion,
  type Coordinate,
  type MapRegion,
} from '@/utils/map-region';

const COLLAPSED_HEIGHT = 150;
const EXPANDED_HEIGHT = 320;
const DEFAULT_VIEWPORT = { width: 360, height: COLLAPSED_HEIGHT };
const MARKER_HIT_SIZE = 46;
// Starting guess for the control column until it has measured itself.
const CONTROL_COLUMN = 150;
const COLUMN_GAP = 12;
// Google's logo and attribution have to stay visible and unobstructed under the
// Maps Platform terms, so the bottom-left corner is reserved, not used.
const LOGO_INSET = 16;
// Below this the framing is close enough that another correction would only
// cost a redraw.
const ZOOM_TOLERANCE = 0.05;
const MAX_CALIBRATION_ROUNDS = 4;

// How far the map's own zoom sits from the Web Mercator figure. It is a
// property of the device, not of any one framing, so it is measured once and
// shared: two pickers are mounted at a time and each calibrating separately
// meant a redundant round trip to the native map.
const zoomCalibration = { offset: 0, rounds: 0 };
const USER_POINT_KEY = '__user__';
const PROJECTION_SETTLE_MS = 160;
const MARKER_FADE_MS = 130;
const USER_DOT_SIZE = 24;
const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });

export type MapPickerStop = {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
};

type GeoStop = MapPickerStop & { lat: number; lon: number };

/**
 * Boarding stop control: the rider picks a stop by tapping it on a map instead
 * of recognising it by name. Lite mode keeps this a static bitmap, so the one
 * interactive map in the app stays the one on its own tab — tapping the map
 * grows this card instead of navigating away.
 */
export function StopMapPicker({
  stops,
  activeStopId,
  accentColor,
  closestStopId,
  userLocation,
  onSelectStop,
  onOpenFullMap,
  onRequestLocation,
  directionSwitch,
}: {
  stops: MapPickerStop[];
  activeStopId: string;
  accentColor: string;
  closestStopId?: string | null;
  userLocation?: Coordinate | null;
  onSelectStop: (id: string) => void;
  onOpenFullMap: () => void;
  onRequestLocation?: () => void;
  directionSwitch?: React.ReactNode;
}) {
  const colors = useAppColors();
  const styles = useStyles();
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const markersOpacity = useSharedValue(0);
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  // Screen positions come from the map's own projection. Google snaps to its
  // own zoom levels, so the span it actually shows is not the span we asked
  // for, and anything we compute ourselves drifts further the further a stop
  // sits from the centre.
  const [projected, setProjected] = useState<
    { key: string; points: Record<string, { x: number; y: number }> } | null
  >(null);
  // Set only when the map genuinely could not answer, so the approximate
  // fallback is a last resort rather than something shown while waiting.
  const [failedKey, setFailedKey] = useState<string | null>(null);
  // Zoom is calibrated against what the map actually draws. The Web Mercator
  // formula is off by a constant here — tile size and density conventions are
  // not something to guess at — but the offset is stable, so one measured round
  // settles it for every later framing.
  const [zoomAdjust, setZoomAdjust] = useState(zoomCalibration.offset);
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
  // The switch is as wide as the destination name, which differs per direction
  // and per language, so the column measures itself rather than being guessed.
  const [columnSize, setColumnSize] = useState({ width: CONTROL_COLUMN, height: 0 });
  const [expanded, setExpanded] = useState(false);
  // Lite mode also reports a map press when a marker is hit, so a marker tap
  // must not toggle the size on its way to selecting the stop.
  const markerTappedAt = useRef(0);

  const geoStops = stops.filter(
    (stop): stop is GeoStop => typeof stop.lat === 'number' && typeof stop.lon === 'number',
  );
  // Measured, not derived from the size state: the map applies a region against
  // the size it currently has, so re-framing has to happen after the resize has
  // landed. onLayout gives us exactly that edge, and since the size switches
  // between two fixed states it fires once per toggle rather than per frame.
  // The controls occupy the top-right corner, so the stops can be kept clear of
  // them either by reserving a column down the side or a band across the top.
  // Which one wastes less depends on how the stops are strung out: a column
  // costs width, a band costs height. Build both and keep the tighter framing.
  const measured = cardSize.width > 0 && cardSize.height > 0;
  const base = measured
    ? { width: cardSize.width, height: cardSize.height, insetBottom: LOGO_INSET }
    : DEFAULT_VIEWPORT;
  const asColumn = buildPickerRegion(geoStops, userLocation ?? null, {
    ...base,
    insetRight: measured ? columnSize.width + COLUMN_GAP : 0,
  });
  const asBand = measured && columnSize.height > 0
    ? buildPickerRegion(geoStops, userLocation ?? null, {
        ...base,
        insetTop: columnSize.height + COLUMN_GAP,
      })
    : null;
  const tightest = asBand && asColumn && asBand.latitudeDelta < asColumn.latitudeDelta
    ? asBand
    : asColumn;
  const region = useStableRegion(tightest);
  const activeStop = stops.find(stop => stop.id === activeStopId) ?? stops[0];
  // A region prop only asks the map to cover a box and rounds the zoom outwards
  // to do it — measured at 1.6-1.8x on a card this short. A camera says exactly
  // what to show, so the framing is the one we computed.
  const requestedRegion = region;

  const projectionKey = [
    expanded,
    region?.latitude,
    region?.longitude,
    region?.latitudeDelta,
    cardSize.width,
    cardSize.height,
    columnSize.width,
    columnSize.height,
    zoomAdjust.toFixed(2),
    geoStops.map(stop => stop.id).join(','),
    userLocation?.latitude,
    userLocation?.longitude,
  ].join('|');
  // Positions are only trusted while they belong to the current framing. The
  // moment the card changes size the old ones are stale, so the markers go with
  // the map in the same commit instead of catching up a beat later.
  const points = projected?.key === projectionKey ? projected.points : null;
  // Nothing is drawn until the positions belong to the current framing.
  // Rendering them early — even for a single frame — puts the markers on screen
  // at coordinates the map has already moved away from.
  const markersVisible = Boolean(points) || failedKey === projectionKey;

  useEffect(() => {
    if (!mapReady || !region || cardSize.width <= 0) return undefined;

    let cancelled = false;

    // One native call, not one per stop: pointForCoordinate runs on the UI
    // thread, and a call per marker per direction change queued up enough work
    // to hang the app outright. The visible bounds give the same answer, and
    // the projection from them is ours and already covered by tests.
    const timeoutId = setTimeout(() => {
      mapRef.current
        ?.getMapBoundaries()
        .then(bounds => {
          if (cancelled || !bounds?.northEast || !bounds?.southWest) return;

          const shownLatitudeDelta = bounds.northEast.latitude - bounds.southWest.latitude;
          const shownLongitudeDelta = bounds.northEast.longitude - bounds.southWest.longitude;
          if (!(shownLatitudeDelta > 0) || !(shownLongitudeDelta > 0)) return;

          const shown = {
            latitude: (bounds.northEast.latitude + bounds.southWest.latitude) / 2,
            longitude: (bounds.northEast.longitude + bounds.southWest.longitude) / 2,
            latitudeDelta: shownLatitudeDelta,
            longitudeDelta: shownLongitudeDelta,
          };

          const next: Record<string, { x: number; y: number }> = {};
          for (const stop of geoStops) {
            next[stop.id] = projectToView(
              { latitude: stop.lat, longitude: stop.lon },
              shown,
              cardSize,
            );
          }
          if (userLocation) {
            next[USER_POINT_KEY] = projectToView(userLocation, shown, cardSize);
          }
          setProjected({ key: projectionKey, points: next });

          if (region && zoomCalibration.rounds < MAX_CALIBRATION_ROUNDS) {
            const drift = Math.log2(shownLatitudeDelta / region.latitudeDelta);
            zoomCalibration.rounds += 1;
            if (Math.abs(drift) > ZOOM_TOLERANCE && Number.isFinite(drift)) {
              zoomCalibration.offset = Math.max(-6, Math.min(6, zoomCalibration.offset + drift));
            }
          }

          // Picks up a calibration another instance settled after this one
          // mounted; React drops the update when the value has not moved.
          setZoomAdjust(zoomCalibration.offset);
        })
        .catch(() => {
          if (!cancelled) setFailedKey(projectionKey);
        });
    }, PROJECTION_SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, projectionKey]);

  // Fades in on arrival but hides instantly: easing the markers out would put
  // back the two-step read this replaced.
  useEffect(() => {
    if (!markersVisible) {
      markersOpacity.value = 0;
      return;
    }
    markersOpacity.value = reduceMotion ? 1 : withTiming(1, { duration: MARKER_FADE_MS });
  }, [markersOpacity, markersVisible, reduceMotion]);

  const markersStyle = useAnimatedStyle(() => ({ opacity: markersOpacity.value }));

  if (!region || !activeStop) return null;

  return (
    <View>
    <View
      style={[
        styles.card,
        {
          height: expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
          borderColor: alpha(accentColor, '30'),
        },
      ]}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setCardSize(previous =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
      }}>
      <MapView
        style={StyleSheet.absoluteFill}
        camera={requestedRegion ? {
          center: { latitude: requestedRegion.latitude, longitude: requestedRegion.longitude },
          zoom: zoomForRegion(requestedRegion, cardSize.width * PixelRatio.get()) + zoomAdjust,
          pitch: 0,
          heading: 0,
          altitude: 0,
        } : undefined}
        userInterfaceStyle={colors.mode}
        customMapStyle={
          colors.mode === 'dark' ? GOOGLE_DARK_MINIMAL_MAP_STYLE : GOOGLE_LIGHT_MINIMAL_MAP_STYLE
        }
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsIndoors={false}
        showsTraffic={false}
        ref={mapRef}
        onMapReady={() => setMapReady(true)}
        onPress={() => {
          if (Date.now() - markerTappedAt.current < 400) return;
          setExpanded(previous => !previous);
        }}
      />

      {/* Markers live above the map rather than inside it. Android rasterises
          native marker views into a bitmap sized on first render and then clips
          anything that grows past it, which left the selected stop permanently
          cut in half. Drawing them ourselves removes that step entirely, and
          the projection is exact because we choose the region. */}
      <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, markersStyle]}>
        {markersVisible ? geoStops.map(stop => {
          const isActive = stop.id === activeStopId;
          const isClosest = !isActive && stop.id === closestStopId;
          const point = points?.[stop.id]
            ?? projectToView({ latitude: stop.lat, longitude: stop.lon }, region, cardSize);

          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

          return (
            <Pressable
              key={stop.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={stop.label}
              onPress={() => {
                markerTappedAt.current = Date.now();
                onSelectStop(stop.id);
              }}
              style={[
                styles.markerHitArea,
                { left: point.x - MARKER_HIT_SIZE / 2, top: point.y - MARKER_HIT_SIZE / 2 },
              ]}>
              {isClosest ? (
                <View style={[styles.closestHalo, { borderColor: alpha(accentColor, 'AA') }]} />
              ) : null}
              <View
                style={[
                  styles.markerDot,
                  isActive ? styles.markerDotActive : styles.markerDotIdle,
                  {
                    backgroundColor: isActive ? accentColor : colors.surface,
                    borderColor: isActive ? '#FFFFFF' : alpha(accentColor, 'CC'),
                  },
                ]}>
                {isActive ? (
                  <MaterialCommunityIcons name="bus-stop" size={16} color={colors.bg} />
                ) : null}
              </View>
            </Pressable>
          );
        }) : null}

        {markersVisible && userLocation ? (
          (() => {
            const point = points?.[USER_POINT_KEY]
              ?? projectToView(userLocation, region, cardSize);
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

            return (
              <View
                pointerEvents="none"
                style={[
                  styles.userHalo,
                  { left: point.x - USER_DOT_SIZE / 2, top: point.y - USER_DOT_SIZE / 2 },
                ]}>
                <View style={styles.userDot} />
              </View>
            );
          })()
        ) : null}
      </Animated.View>

      <View
        style={styles.controlColumn}
        onLayout={event => {
          const { width, height } = event.nativeEvent.layout;
          if (width <= 0 || height <= 0) return;
          setColumnSize(previous =>
            previous.width === width && previous.height === height
              ? previous
              : { width, height },
          );
        }}>
        {directionSwitch}

        <View style={styles.columnChips}>
        {!userLocation && onRequestLocation ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('locationUseMine')}
            onPress={onRequestLocation}
            hitSlop={6}
            style={({ pressed }) => [
              styles.chip,
              {
                borderColor: alpha(accentColor, '40'),
                backgroundColor: pressed ? colors.surfaceHigh : alpha(colors.surface, 'E6'),
              },
            ]}>
            <MaterialCommunityIcons name="crosshairs-gps" size={13} color={accentColor} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('stopMapCollapse') : t('stopMapExpand')}
          onPress={() => setExpanded(previous => !previous)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: alpha(accentColor, '40'),
              backgroundColor: pressed ? colors.surfaceHigh : alpha(colors.surface, 'E6'),
            },
          ]}>
          <MaterialCommunityIcons
            name={expanded ? 'arrow-collapse' : 'arrow-expand'}
            size={13}
            color={accentColor}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('stopShowOnMap', { stop: activeStop.label })}
          onPress={onOpenFullMap}
          hitSlop={6}
          style={({ pressed }) => [
            styles.chip,
            {
              borderColor: alpha(accentColor, '40'),
              backgroundColor: pressed ? colors.surfaceHigh : alpha(colors.surface, 'E6'),
            },
          ]}>
          <MaterialCommunityIcons name="map-marker-radius" size={13} color={accentColor} />
        </Pressable>
        </View>
      </View>
    </View>

    <View style={styles.infoRow}>
      <Text
        style={[styles.captionName, { fontFamily: DISPLAY }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}>
        {activeStop.label}
      </Text>
      <Text style={[styles.captionCode, { fontFamily: MONO }]}>
        {'#' + (activeStop.id.split(':')[1] ?? activeStop.id)}
      </Text>
    </View>
    </View>
  );
}

/**
 * Holds the region steady unless it meaningfully moved. The picker re-renders
 * whenever the screen around it does, and handing the native map a fresh region
 * object each time makes it redraw its snapshot for no visible gain.
 */
function useStableRegion(next: MapRegion | null) {
  const [stable, setStable] = useState(next);

  useEffect(() => {
    setStable(previous => (regionsEqual(previous, next) ? previous : next));
  }, [next]);

  return regionsEqual(stable, next) ? stable : next;
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      backgroundColor: C.surfaceHigh,
      overflow: 'hidden',
    },
    // Positioned by projection; the padding gives the dots a finger-sized
    // target without growing the visible marker.
    markerHitArea: {
      position: 'absolute',
      width: MARKER_HIT_SIZE,
      height: MARKER_HIT_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markerDot: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    markerDotActive: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 3,
    },
    // Deliberately small: the Kojori stops sit close enough together that a
    // larger idle dot makes neighbours touch.
    markerDotIdle: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 2.5,
    },
    closestHalo: {
      position: 'absolute',
      width: 26,
      height: 26,
      borderRadius: 16,
      borderWidth: 2,
    },
    userHalo: {
      position: 'absolute',
      width: USER_DOT_SIZE,
      height: USER_DOT_SIZE,
      borderRadius: USER_DOT_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha('#3B82F6', '33'),
    },
    userDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: '#FFFFFF',
      backgroundColor: '#3B82F6',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginTop: 8,
      paddingHorizontal: 2,
      minHeight: 26,
    },
    captionName: {
      flexShrink: 1,
      color: C.text,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '700',
    },
    captionCode: {
      flexShrink: 0,
      color: C.textFaint,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
    },
    controlColumn: {
      position: 'absolute',
      right: 10,
      top: 10,
      alignItems: 'flex-end',
      gap: 8,
    },
    columnChips: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 26,
      borderWidth: 1,
      borderRadius: 13,
      paddingHorizontal: 8,
    },
  });
}

function useStyles() {
  return createStyles(useAppColors());
}
