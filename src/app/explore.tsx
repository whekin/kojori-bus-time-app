import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, type MapMarker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionPill } from '@/components/direction-picker';
import { TtcStatusChip } from '@/components/ttc-status-banner';
import { getCuratedStopIds } from '@/constants/curated-stops';
import { alpha, BottomTabInset } from '@/constants/theme';
import { useActiveDirection } from '@/hooks/use-active-direction';
import { useAppColors, useResolvedAppThemeMode } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useMapFocus } from '@/hooks/use-map-focus';
import { useRoutePolylines } from '@/hooks/use-route-polylines';
import { useRouteStops } from '@/hooks/use-route-stops';
import { getDemoVehiclePositions, useVehiclePositions } from '@/hooks/use-vehicle-positions';
import { useSettings } from '@/hooks/use-settings';
import { useTabNav } from '@/hooks/use-tab-nav';
import { findStop } from '@/services/ttc';
import { splitPolylinesByOverlap } from '@/utils/polyline-offset';

const DEFAULT_REGION: Region = {
  latitude: 41.639,
  longitude: 44.76,
  latitudeDelta: 0.12,
  longitudeDelta: 0.1,
};

const MAP_BOUNDS = {
  latMin: 41.55,
  latMax: 41.75,
  lonMin: 44.65,
  lonMax: 44.87,
};

type ExploreScreenProps = {
  isActive?: boolean;
};

function routeAccent(bus: '380' | '316', colors: ReturnType<typeof useAppColors>) {
  return bus === '380' ? colors.route380 : colors.route316;
}

function BusStopGlyph({
  size,
  color,
  shiftX = 0,
  shiftY = 0,
}: {
  size: number;
  color: string;
  shiftX?: number;
  shiftY?: number;
}) {
  const poleWidth = Math.max(1, Math.round(size * 0.1));
  const dotSize = Math.max(2, Math.round(size * 0.2));
  const busSize = Math.round(size * 0.68);
  const poleHeight = Math.round(size * 0.62);
  const xOffset = size * shiftX;
  const yOffset = size * shiftY;

  return (
    <View style={{ width: size, height: size, transform: [{ translateX: xOffset }, { translateY: yOffset }] }}>
      <View
        style={{
          position: 'absolute',
          left: Math.round(size * 0.04),
          top: Math.round(size * 0.15),
          width: dotSize,
          alignItems: 'center',
        }}>
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            width: poleWidth,
            height: poleHeight,
            borderRadius: poleWidth / 2,
            backgroundColor: color,
          }}
        />
      </View>
      <View style={{ position: 'absolute', left: Math.round(size * 0.32), top: Math.round(size * 0.18) }}>
        <MaterialCommunityIcons name="bus" size={busSize} color={color} />
      </View>
    </View>
  );
}

function MapStopGlyph({ size, color }: { size: number; color: string }) {
  const poleWidth = Math.max(1, Math.round(size * 0.1));
  const dotSize = Math.max(2, Math.round(size * 0.2));
  const poleHeight = Math.round(size * 0.58);
  const busSize = Math.round(size * 0.78);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          left: Math.round(size * 0.1),
          top: Math.round(size * 0.18),
          width: dotSize,
          alignItems: 'center',
        }}>
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            width: poleWidth,
            height: poleHeight,
            borderRadius: poleWidth / 2,
            backgroundColor: color,
          }}
        />
      </View>
      <View style={{ position: 'absolute', left: Math.round(size * 0.32), top: Math.round(size * 0.14) }}>
        <MaterialCommunityIcons name="bus" size={busSize} color={color} />
      </View>
    </View>
  );
}

const VEHICLE_PIN_CANVAS_SIZE = 66;
const VEHICLE_PIN_ANCHOR = { x: 0.5, y: 0.5 };
const STOP_MARKER_ANCHOR = { x: 0.5, y: 0.5 };
const MAP_MIN_ZOOM_LEVEL = 11;
const SHOW_ORDINARY_STOPS_LAT_DELTA = 0.14;
const FULL_STOP_MARKERS_LAT_DELTA = 0.055;
const GOOGLE_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#444444' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6d6d6d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#171717' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f2f2f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f141a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5f7a88' }] },
];

export default function ExploreScreen({ isActive = false }: ExploreScreenProps) {
  const colors = useAppColors();
  const { t } = useI18n();
  const resolvedThemeMode = useResolvedAppThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const focusedStopMarkerRef = useRef<MapMarker | null>(null);
  const { activeDirection } = useActiveDirection();
  const { settings } = useSettings();
  const { focusedStop, requestStopSheetReturn } = useMapFocus();
  const navigateToTab = useTabNav();
  const lastFitKeyRef = useRef<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region>(DEFAULT_REGION);
  const [demoNow, setDemoNow] = useState(() => Date.now());
  const [inactiveMapDirection, setInactiveMapDirection] = useState(activeDirection);

  const direction = isActive ? activeDirection : inactiveMapDirection;

  useEffect(() => {
    if (!isActive || inactiveMapDirection === activeDirection) return;
    setInactiveMapDirection(activeDirection);
  }, [activeDirection, inactiveMapDirection, isActive]);

  useEffect(() => {
    if (mapReady) return;
    const id = setTimeout(() => setMapTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, [mapReady]);

  const { data: toKojoriRouteData } = useRoutePolylines('toKojori');
  const { data: toTbilisiRouteData } = useRoutePolylines('toTbilisi');
  const { stops: routeStops } = useRouteStops(direction);
  const { data: livePositions = [], refetch, isFetching } = useVehiclePositions(direction, isActive);

  useEffect(() => {
    if (!settings.cancelledBusDemo || !isActive) return;

    setDemoNow(Date.now());
    const intervalId = setInterval(() => setDemoNow(Date.now()), 10_000);
    return () => clearInterval(intervalId);
  }, [isActive, settings.cancelledBusDemo]);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const vehiclePinSpinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isFetching) {
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
    }
  }, [isFetching, spinAnim]);

  const shouldAnimateVehiclePins = typeof __DEV__ === 'boolean' && __DEV__ && isActive;

  useEffect(() => {
    if (!shouldAnimateVehiclePins) {
      vehiclePinSpinAnim.stopAnimation();
      vehiclePinSpinAnim.setValue(0);
      return;
    }

    vehiclePinSpinAnim.setValue(0);
    const animation = Animated.loop(
      Animated.timing(vehiclePinSpinAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();

    return () => animation.stop();
  }, [shouldAnimateVehiclePins, vehiclePinSpinAnim]);

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const vehiclePinDebugRotation = vehiclePinSpinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const positions = useMemo(() => {
    if (!settings.cancelledBusDemo) return livePositions;

    const liveWithoutDemo = livePositions.filter(position => !position.vehicleId.startsWith('demo-'));
    return [
      ...getDemoVehiclePositions(direction, demoNow),
      ...liveWithoutDemo,
    ];
  }, [demoNow, direction, livePositions, settings.cancelledBusDemo]);
  const routeData = direction === 'toKojori' ? toKojoriRouteData : toTbilisiRouteData;
  const focusedRouteData = focusedStop?.direction === 'toKojori' ? toKojoriRouteData : toTbilisiRouteData;
  const routePolylines = routeData?.polylines;
  const focusedStopAccent = focusedStop?.direction === 'toKojori' ? colors.route380 : colors.route316;
  const focusedStopCoordinate =
    typeof focusedStop?.lat === 'number' && typeof focusedStop.lon === 'number'
      ? { latitude: focusedStop.lat, longitude: focusedStop.lon }
      : null;

  const splitPolylines = useMemo(() => {
    if (!routePolylines) return null;

    const polyline380 = routePolylines['380'] ?? [];
    const polyline316 = routePolylines['316'] ?? [];

    if (polyline380.length < 2 || polyline316.length < 2) {
      return {
        '380': { exclusive: polyline380 },
        '316': { exclusive: polyline316 },
        sharedZebra: [],
      };
    }

    const split = splitPolylinesByOverlap(polyline380, polyline316, 40);

    return {
      '380': { exclusive: split.route1.exclusive },
      '316': { exclusive: split.route2.exclusive },
      sharedZebra: split.sharedZebra,
    };
  }, [routePolylines]);

  const groupedCounts = useMemo(() => ({
    '380': positions.filter(position => position.bus === '380').length,
    '316': positions.filter(position => position.bus === '316').length,
  }), [positions]);

  const showMarkers = useMemo(() => {
    return currentRegion.latitudeDelta < 0.5;
  }, [currentRegion.latitudeDelta]);
  const stopMarkerZoomTier = currentRegion.latitudeDelta >= SHOW_ORDINARY_STOPS_LAT_DELTA
    ? 'overview'
    : currentRegion.latitudeDelta >= FULL_STOP_MARKERS_LAT_DELTA
      ? 'mid'
      : 'close';
  const showOrdinaryStopMarkers = stopMarkerZoomTier !== 'overview';
  const favoriteStopIds = direction === 'toKojori' ? settings.tbilisiFavorites : settings.kojoriFavorites;
  const curatedStopIds = getCuratedStopIds(direction);

  const stopMarkers = useMemo(() => {
    const favoriteStopSet = new Set(favoriteStopIds);
    const curatedStopSet = new Set(curatedStopIds);
    const promotedStopSet = new Set([...favoriteStopIds, ...curatedStopIds]);
    const routeStopMap = new Map(routeStops.map(stop => [stop.id, stop]));
    const stopsWithPromotedFallbacks = [
      ...routeStops,
      ...Array.from(promotedStopSet)
        .filter(stopId => !routeStopMap.has(stopId))
        .map(stopId => findStop(stopId))
        .filter((stop): stop is NonNullable<ReturnType<typeof findStop>> => Boolean(stop)),
    ];

    return stopsWithPromotedFallbacks
      .filter(stop => typeof stop.lat === 'number' && typeof stop.lon === 'number')
      .filter(stop => stop.id !== focusedStop?.id)
      .filter(stop => showOrdinaryStopMarkers || promotedStopSet.has(stop.id))
      .map(stop => ({
        stop,
        isPromoted: favoriteStopSet.has(stop.id) || curatedStopSet.has(stop.id),
      }))
      .sort((a, b) => Number(a.isPromoted) - Number(b.isPromoted));
  }, [curatedStopIds, favoriteStopIds, focusedStop?.id, routeStops, showOrdinaryStopMarkers]);

  function handleCenterOnBus(bus: '380' | '316') {
    const busPositions = positions.filter(p => p.bus === bus);
    if (busPositions.length === 0) return;

    if (busPositions.length === 1) {
      mapRef.current?.animateToRegion({
        latitude: busPositions[0].lat,
        longitude: busPositions[0].lon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.04,
      }, 500);
    } else {
      mapRef.current?.fitToCoordinates(
        busPositions.map(p => ({ latitude: p.lat, longitude: p.lon })),
        {
          edgePadding: { top: 100, right: 60, bottom: 160, left: 60 },
          animated: true,
        },
      );
    }
  }

  useEffect(() => {
    if (!isActive || positions.length === 0 || focusedStop) return;

    const fitKey = `${direction}-${positions.map(position => `${position.bus}-${position.vehicleId}`).sort().join('|')}`;
    if (fitKey === lastFitKeyRef.current) return;

    lastFitKeyRef.current = fitKey;
    const timeoutId = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        positions.map(position => ({
          latitude: position.lat,
          longitude: position.lon,
        })),
        {
          edgePadding: {
            top: 100,
            right: 60,
            bottom: 160,
            left: 60,
          },
          animated: true,
        },
      );
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [direction, focusedStop, isActive, positions]);

  useEffect(() => {
    if (!isActive || !mapReady || !focusedStop) return;

    const timeoutId = setTimeout(() => {
      if (focusedStopCoordinate) {
        mapRef.current?.animateToRegion(
          {
            ...focusedStopCoordinate,
            latitudeDelta: 0.018,
            longitudeDelta: 0.018,
          },
          450,
        );
        return;
      }

      const fallbackCoordinates = Object.values(focusedRouteData?.polylines ?? {}).flat();
      if (fallbackCoordinates.length >= 2) {
        mapRef.current?.fitToCoordinates(fallbackCoordinates, {
          edgePadding: { top: 100, right: 60, bottom: 160, left: 60 },
          animated: true,
        });
      }
    }, 180);

    return () => clearTimeout(timeoutId);
  }, [focusedRouteData?.polylines, focusedStop, focusedStopCoordinate, isActive, mapReady]);

  useEffect(() => {
    if (!isActive || !mapReady || typeof focusedStop?.lat !== 'number' || typeof focusedStop.lon !== 'number') {
      return;
    }

    const timeoutId = setTimeout(() => {
      focusedStopMarkerRef.current?.showCallout();
    }, 700);

    return () => clearTimeout(timeoutId);
  }, [focusedStop?.lat, focusedStop?.lon, focusedStop?.requestedAt, isActive, mapReady]);

  useEffect(() => {
    lastFitKeyRef.current = null;
  }, [direction]);

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
      latitude: Math.max(MAP_BOUNDS.latMin, Math.min(MAP_BOUNDS.latMax, region.latitude)),
      longitude: Math.max(MAP_BOUNDS.lonMin, Math.min(MAP_BOUNDS.lonMax, region.longitude)),
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    };
    
    if (
      clampedRegion.latitude !== region.latitude ||
      clampedRegion.longitude !== region.longitude
    ) {
      mapRef.current?.animateToRegion(clampedRegion, 300);
    }
    
    setCurrentRegion(clampedRegion);
  }

  return (
    <View style={styles.screen}>
      <MapView
        key={`map-${resolvedThemeMode}`}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={currentRegion}
        userInterfaceStyle={resolvedThemeMode}
        customMapStyle={resolvedThemeMode === 'dark' ? GOOGLE_DARK_MAP_STYLE : undefined}
        showsUserLocation={hasUserLocation}
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
        onRegionChangeComplete={handleRegionChange}>
        {splitPolylines
          ? (
            <>
              {(['316', '380'] as const).map((bus) => {
                const { exclusive } = splitPolylines[bus];
                const color = routeAccent(bus, colors);
                return exclusive.length >= 2 ? (
                  <Polyline
                    key={`route-${bus}-exclusive`}
                    coordinates={exclusive}
                    strokeColor={color}
                    strokeWidth={4}
                    zIndex={2}
                    lineCap="round"
                    lineJoin="round"
                  />
                ) : null;
              })}
              {splitPolylines.sharedZebra.map((seg, i) => (
                <Polyline
                  key={`zebra-${i}`}
                  coordinates={seg.coords}
                  strokeColor={routeAccent(seg.colorIndex === 0 ? '380' : '316', colors)}
                  strokeWidth={4}
                  zIndex={3}
                  lineCap="butt"
                  lineJoin="miter"
                />
              ))}
            </>
          )
          : null}
        {showMarkers && stopMarkers.map(({ stop, isPromoted }) => {
          const isOverviewZoom = stopMarkerZoomTier === 'overview';
          const isMidZoom = stopMarkerZoomTier === 'mid';
          const isSimpleOrdinaryStop = !isPromoted && isMidZoom;
          const markerSize = isPromoted
            ? isOverviewZoom ? 24 : isMidZoom ? 28 : 30
            : isSimpleOrdinaryStop ? 16 : 24;
          const hitSize = isPromoted
            ? markerSize + (isOverviewZoom ? 6 : 10)
            : isSimpleOrdinaryStop ? 32 : markerSize + 6;
          const iconSize = isPromoted
            ? isOverviewZoom ? 16 : 20
            : isSimpleOrdinaryStop ? 0 : 17;
          const stopAccent = direction === 'toKojori' ? colors.route380 : colors.route316;
          const markerColor = isPromoted || isSimpleOrdinaryStop ? stopAccent : colors.map;

          return (
            <Marker
              key={`stop-${direction}-${stop.id}`}
              coordinate={{ latitude: stop.lat!, longitude: stop.lon! }}
              anchor={STOP_MARKER_ANCHOR}
              tracksViewChanges={false}
              zIndex={isPromoted ? 6 : 4}>
              <View
                collapsable={false}
                style={[
                  styles.stopMarkerOuter,
                  {
                    width: hitSize,
                    height: hitSize,
                    borderRadius: hitSize / 2,
                    backgroundColor: 'transparent',
                    opacity: isPromoted ? isOverviewZoom ? 0.92 : 1 : isSimpleOrdinaryStop ? 0.78 : 0.82,
                  },
                ]}>
                <View
                  style={[
                    styles.stopMarker,
                    isPromoted && !isOverviewZoom && styles.favoriteStopMarker,
                    isSimpleOrdinaryStop && styles.simpleStopMarker,
                    {
                      width: markerSize,
                      height: markerSize,
                      borderRadius: isSimpleOrdinaryStop ? markerSize / 2 : isPromoted ? 10 : 8,
                      borderColor: isSimpleOrdinaryStop
                        ? alpha(colors.panel, 'D9')
                        : isPromoted ? alpha(markerColor, 'D9') : alpha(colors.panel, 'E6'),
                      backgroundColor: isSimpleOrdinaryStop
                        ? alpha(markerColor, resolvedThemeMode === 'dark' ? 'D9' : 'EE')
                        : isPromoted
                        ? markerColor
                        : alpha(colors.map, resolvedThemeMode === 'dark' ? 'CC' : 'E8'),
                    },
                  ]}>
                  {isSimpleOrdinaryStop ? null : (
                    <MapStopGlyph
                      size={iconSize}
                      color="#FFFFFF"
                    />
                  )}
                </View>
              </View>
              <Callout tooltip>
                <View style={styles.stopCallout}>
                  <View
                    style={[
                      styles.stopCalloutIcon,
                      { backgroundColor: isPromoted ? markerColor : colors.map },
                    ]}>
                    <BusStopGlyph size={18} color="#FFFFFF" shiftY={0.14} />
                  </View>
                  <View style={styles.stopCalloutCopy}>
                    <Text style={styles.stopCalloutLabel} numberOfLines={2}>
                      {stop.label}
                    </Text>
                    <Text style={styles.stopCalloutCode}>
                      Stop [{stop.id.split(':')[1] ?? stop.id}]
                    </Text>
                  </View>
                </View>
              </Callout>
            </Marker>
          );
        })}
        {showMarkers && positions.map(position => {
          const accent = routeAccent(position.bus, colors);
          const pinWidth = VEHICLE_PIN_CANVAS_SIZE;
          const pinHeight = VEHICLE_PIN_CANVAS_SIZE;
          const busIconSize = 16;
          const routeFontSize = 10;
          const routeDigits = position.bus.split('');
          const destination = direction === 'toKojori' ? t('cityKojori') : t('cityTbilisi');
          const heading = Number.isFinite(position.heading) ? position.heading : 0;
          
          return (
            <React.Fragment key={`${position.bus}-${position.vehicleId}`}>
              <Marker
                coordinate={{ latitude: position.lat, longitude: position.lon }}
                anchor={VEHICLE_PIN_ANCHOR}
                tracksViewChanges={shouldAnimateVehiclePins}
                zIndex={21}>
                <View collapsable={false} style={[styles.vehiclePin, { width: pinWidth, height: pinHeight }]}>
                  <Animated.View
                    style={[
                      styles.vehiclePinShape,
                      { transform: [{ rotate: `${heading}deg` }, { rotate: vehiclePinDebugRotation }] },
                    ]}>
                    <View style={styles.vehiclePinOuterCircle} />
                    <View style={styles.vehiclePinOuterPoint} />
                    <View style={[styles.vehiclePinInnerCircle, { backgroundColor: accent }]} />
                    <View style={[styles.vehiclePinInnerPoint, { borderBottomColor: accent }]} />
                  </Animated.View>
                  <View collapsable={false} style={styles.vehiclePinContent}>
                    <View collapsable={false} style={styles.vehiclePinBusIconSlot}>
                      <MaterialCommunityIcons
                        name="bus"
                        size={busIconSize}
                        color="#FFFFFF"
                        style={styles.vehiclePinBusIcon}
                      />
                    </View>
                    <View style={styles.vehicleRouteDigits}>
                      {routeDigits.map((digit, index) => (
                        <Text
                          key={`${position.bus}-${index}`}
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
                      <MaterialCommunityIcons name="bus" size={22} color="#FFFFFF" />
                    </View>
                    <View style={styles.vehicleCalloutCopy}>
                      <Text style={styles.vehicleCalloutTitle} numberOfLines={1}>
                        {position.bus} {t('directionTo')}{destination}
                      </Text>
                      <Text style={styles.vehicleCalloutSubtitle} numberOfLines={1}>
                        {t('mapVehicle', { id: position.vehicleId })}
                      </Text>
                    </View>
                  </View>
                </Callout>
              </Marker>
            </React.Fragment>
          );
        })}
        {focusedStop && focusedStopCoordinate ? (
          <Marker
            ref={focusedStopMarkerRef}
            key={`focused-stop-${focusedStop.id}-${focusedStop.requestedAt}`}
            coordinate={focusedStopCoordinate}
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: -24 }}
            tracksViewChanges={false}
            zIndex={30}
          >
            <View collapsable={false} style={styles.focusedStopMarker}>
              <View style={styles.focusedStopMarkerHalo} />
              <View style={styles.focusedStopMarkerCore}>
                <BusStopGlyph size={19} color="#FFFFFF" shiftY={0.18} />
              </View>
            </View>
            <Callout tooltip>
              <View style={styles.focusedStopCallout}>
                <View style={styles.focusedStopCalloutIcon}>
                  <BusStopGlyph size={22} color="#FFFFFF" shiftY={0.14} />
                </View>
                <View style={styles.focusedStopCalloutCopy}>
                  <Text style={styles.focusedStopCalloutLabel} numberOfLines={2}>
                    {focusedStop.label}
                  </Text>
                  <Text style={styles.focusedStopCalloutCode}>
                    Stop [{focusedStop.id.split(':')[1] ?? focusedStop.id}]
                  </Text>
                </View>
              </View>
            </Callout>
          </Marker>
        ) : null}
      </MapView>

      {/* Top controls */}
      <View style={[styles.topPanel, { top: insets.top + 12 }]}>
        <DirectionPill
          accentColor={direction === 'toKojori' ? colors.route380 : colors.route316}
          style={styles.directionPill}
        />

        <View style={styles.legendRow}>
          {(['380', '316'] as const).map(bus => {
            const accent = routeAccent(bus, colors);
            const count = groupedCounts[bus];
            const hasActiveBuses = count > 0;
            return (
              <Pressable 
                key={bus} 
                style={[styles.legendChip, hasActiveBuses && styles.legendChipClickable]}
                onPress={() => hasActiveBuses && handleCenterOnBus(bus)}
                disabled={!hasActiveBuses}>
                <View style={[styles.legendDot, { backgroundColor: accent }]} />
                <Text style={styles.legendLabel}>{bus}</Text>
                <Text style={styles.legendCount}>{count}</Text>
              </Pressable>
            );
          })}
          <TtcStatusChip />
          <Pressable style={styles.refreshChip} onPress={() => refetch()} disabled={isFetching}>
            <Animated.View style={{ transform: [{ rotate: spinRotation }] }}>
              <MaterialCommunityIcons name="refresh" size={14} color={isFetching ? colors.primary : colors.textDim} />
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {/* Locate me — bottom right */}
      <Pressable
        style={[
          styles.locateButton,
          {
            bottom: focusedStop
              ? insets.bottom + BottomTabInset + 108
              : insets.bottom + BottomTabInset + 24,
          },
          isLocating && styles.locateButtonActive,
        ]}
        onPress={handleLocateMe}
        disabled={isLocating}>
        <MaterialCommunityIcons
          name={isLocating ? 'crosshairs-question' : 'crosshairs-gps'}
          size={20}
          color={isLocating ? colors.primary : colors.text}
        />
      </Pressable>

      {locationMessage ? (
        <View style={[styles.bottomPillContainer, { bottom: insets.bottom + BottomTabInset + 18 }]}>
          <View style={styles.bottomPill}>
            <Text style={styles.bottomPillText}>{locationMessage}</Text>
          </View>
        </View>
      ) : null}

      {focusedStop ? (
        <View style={[styles.focusedStopTrayWrap, { bottom: insets.bottom + BottomTabInset + 18 }]}>
          <View
            style={[
              styles.focusedStopTray,
              {
                borderColor: alpha(focusedStopAccent, '42'),
                backgroundColor: alpha(colors.panel, resolvedThemeMode === 'dark' ? 'F2' : 'FA'),
              },
            ]}
          >
            <View style={[styles.focusedStopTrayRail, { backgroundColor: focusedStopAccent }]} />
            <View style={styles.focusedStopTrayCopy}>
              <Text style={styles.focusedStopTrayEyebrow}>
                {focusedStop.direction === 'toKojori' ? t('cityKojori') : t('cityTbilisi')}
              </Text>
              <Text style={styles.focusedStopTrayTitle} numberOfLines={1}>
                {focusedStop.label}
              </Text>
              <Text style={[styles.focusedStopTrayCode, { color: focusedStopAccent }]}>
                #{focusedStop.id.split(':')[1] ?? focusedStop.id}
              </Text>
            </View>
            {focusedStop.returnRoute ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('stopSheetTitle')}
                onPress={() => {
                  requestStopSheetReturn();
                  navigateToTab?.(focusedStop.returnRoute ?? 'index');
                }}
                style={[styles.focusedStopTrayAction, { borderColor: alpha(focusedStopAccent, '42') }]}
              >
                <MaterialCommunityIcons name="chevron-up" size={15} color={focusedStopAccent} />
                <Text style={[styles.focusedStopTrayActionText, { color: focusedStopAccent }]}>
                  {t('commonChange')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
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
    gap: 8,
  },
  directionPill: {
    alignSelf: 'flex-start',
    backgroundColor: `${C.panel}E6`,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 6,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: `${C.panel}D9`,
    borderWidth: 1,
    borderColor: C.border,
    opacity: 0.5,
  },
  legendChipClickable: {
    opacity: 1,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: C.text, fontSize: 12, fontWeight: '700' },
  legendCount: { color: C.textDim, fontSize: 11, fontWeight: '700' },
  refreshChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: `${C.panel}D9`,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  focusedStopTrayCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
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
  focusedStopTrayAction: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  focusedStopTrayActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stopMarkerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopMarker: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  favoriteStopMarker: {
    borderWidth: 2,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  simpleStopMarker: {
    borderWidth: 1,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stopCallout: {
    width: 272,
    minHeight: 72,
    borderRadius: 5,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  stopCalloutIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopCalloutCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  stopCalloutLabel: {
    color: '#32343A',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  stopCalloutCode: {
    color: '#6F737C',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
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
  vehiclePinOuterCircle: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: alpha('#FFFFFF', 'F2'),
  },
  vehiclePinOuterPoint: {
    position: 'absolute',
    top: 2,
    left: 21,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 17,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: alpha('#FFFFFF', 'F2'),
  },
  vehiclePinInnerCircle: {
    position: 'absolute',
    top: 15,
    left: 15,
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  vehiclePinInnerPoint: {
    position: 'absolute',
    top: 7,
    left: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 14,
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
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
    color: '#32343A',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
  },
  vehicleCalloutSubtitle: {
    color: '#6F737C',
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
  focusedStopMarkerHalo: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: alpha(C.error, '20'),
  },
  focusedStopMarkerCore: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: alpha('#FFFFFF', 'E6'),
    backgroundColor: C.error,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  focusedStopCallout: {
    width: 340,
    minHeight: 86,
    borderRadius: 5,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  focusedStopCalloutIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: C.error,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  focusedStopCalloutCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  focusedStopCalloutLabel: {
    color: '#32343A',
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '700',
  },
  focusedStopCalloutCode: {
    color: '#6F737C',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
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
