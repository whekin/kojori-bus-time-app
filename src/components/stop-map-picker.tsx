import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop as SvgStop } from 'react-native-svg';

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
  type Coordinate,
  type MapRegion,
} from '@/utils/map-region';

const COLLAPSED_HEIGHT = 150;
const EXPANDED_HEIGHT = 320;
const DEFAULT_ASPECT = 360 / COLLAPSED_HEIGHT;
const MARKER_HIT_SIZE = 46;
const USER_POINT_KEY = '__user__';
const PROJECTION_SETTLE_MS = 120;
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
  const [cardSize, setCardSize] = useState({ width: 0, height: 0 });
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
  const aspect = cardSize.width > 0 && cardSize.height > 0
    ? cardSize.width / cardSize.height
    : DEFAULT_ASPECT;
  const region = useStableRegion(buildPickerRegion(geoStops, userLocation ?? null, aspect));
  const activeStop = stops.find(stop => stop.id === activeStopId) ?? stops[0];

  const projectionKey = [
    expanded,
    region?.latitude,
    region?.longitude,
    region?.latitudeDelta,
    cardSize.width,
    cardSize.height,
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
    const targets: { key: string; coordinate: Coordinate }[] = geoStops.map(stop => ({
      key: stop.id,
      coordinate: { latitude: stop.lat, longitude: stop.lon },
    }));
    if (userLocation) targets.push({ key: USER_POINT_KEY, coordinate: userLocation });

    // The camera applies a frame after the region prop lands, so asking any
    // sooner returns positions for the previous view.
    const timeoutId = setTimeout(() => {
      Promise.all(
        targets.map(target =>
          mapRef.current
            ?.pointForCoordinate(target.coordinate)
            .then(point => [target.key, point] as const)
            .catch(() => null),
        ),
      ).then(results => {
        if (cancelled) return;
        const next: Record<string, { x: number; y: number }> = {};
        for (const result of results) {
          if (result) next[result[0]] = { x: result[1].x, y: result[1].y };
        }
        if (Object.keys(next).length > 0) {
          setProjected({ key: projectionKey, points: next });
        } else {
          setFailedKey(projectionKey);
        }
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
        liteMode
        region={region}
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

      <Svg pointerEvents="none" style={styles.captionScrim} width="100%" height="46">
        <Defs>
          <LinearGradient id="stop-map-caption" x1="0" y1="0" x2="0" y2="1">
            <SvgStop offset="0" stopColor={colors.bg} stopOpacity="0" />
            <SvgStop offset="0.55" stopColor={colors.bg} stopOpacity="0.72" />
            <SvgStop offset="1" stopColor={colors.bg} stopOpacity="0.93" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="46" fill="url(#stop-map-caption)" />
      </Svg>

      <View pointerEvents="none" style={styles.caption}>
        <Text style={[styles.captionName, { fontFamily: DISPLAY }]} numberOfLines={1}>
          {activeStop.label}
        </Text>
        <Text style={[styles.captionCode, { fontFamily: MONO }]}>
          {'#' + (activeStop.id.split(':')[1] ?? activeStop.id)}
        </Text>
      </View>

      {directionSwitch ? <View style={styles.switchSlot}>{directionSwitch}</View> : null}

      <View style={styles.cornerActions}>
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
          <Text style={[styles.chipText, { color: accentColor }]}>{t('tabsMap')}</Text>
        </Pressable>
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
    markerDotIdle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 3,
    },
    closestHalo: {
      position: 'absolute',
      width: 32,
      height: 32,
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
    captionScrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    caption: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 8,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 7,
    },
    captionName: {
      flexShrink: 1,
      color: C.text,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
    },
    captionCode: {
      flexShrink: 0,
      color: C.textFaint,
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '700',
    },
    switchSlot: { position: 'absolute', left: 10, top: 10 },
    cornerActions: {
      position: 'absolute',
      right: 10,
      top: 10,
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
    chipText: { fontSize: 11, lineHeight: 15, fontWeight: '800' },
  });
}

function useStyles() {
  return createStyles(useAppColors());
}
