import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionPickerSheet, DirectionPill } from '@/components/direction-picker';
import { TtcStatusChip } from '@/components/ttc-status-banner';
import { BottomTabInset } from '@/constants/theme';
import { useAppColors, useResolvedAppThemeMode } from '@/hooks/use-app-colors';
import { useRoutePolylines } from '@/hooks/use-route-polylines';
import { useSettings } from '@/hooks/use-settings';
import { useVehiclePositions } from '@/hooks/use-vehicle-positions';
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

const MARKER_BADGE_IMAGES: Record<'380' | '316', number> = {
  '380': require('../../assets/images/map-marker-380.png'),
  '316': require('../../assets/images/map-marker-316.png'),
};

const MARKER_HEADING_IMAGES: Record<'380' | '316', number> = {
  '380': require('../../assets/images/map-heading-380.png'),
  '316': require('../../assets/images/map-heading-316.png'),
};

const MARKER_ANCHOR = { x: 0.5, y: 54 / 84 };
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
  const resolvedThemeMode = useResolvedAppThemeMode();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { settings } = useSettings();
  const direction = settings.sharedDirection;
  const [directionSheetOpen, setDirectionSheetOpen] = useState(false);
  const lastFitKeyRef = useRef<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [currentRegion, setCurrentRegion] = useState<Region>(DEFAULT_REGION);

  useEffect(() => {
    if (mapReady) return;
    const id = setTimeout(() => setMapTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, [mapReady]);

  const { data: routeData } = useRoutePolylines(direction);
  const { data: livePositions = [], refetch, isFetching } = useVehiclePositions(direction, isActive);

  const spinAnim = useRef(new Animated.Value(0)).current;

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

  const spinRotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const positions = livePositions;
  const routePolylines = routeData?.polylines;

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

  const markerScale = useMemo(() => {
    const delta = currentRegion.latitudeDelta;
    if (delta > 0.15) return 0.7;
    if (delta > 0.08) return 0.85;
    if (delta < 0.03) return 1.2;
    return 1.0;
  }, [currentRegion.latitudeDelta]);

  const showMarkers = useMemo(() => {
    return currentRegion.latitudeDelta < 0.5;
  }, [currentRegion.latitudeDelta]);

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
    if (!isActive || positions.length === 0) return;

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
  }, [direction, isActive, positions]);

  useEffect(() => {
    lastFitKeyRef.current = null;
  }, [direction]);

  async function handleLocateMe() {
    setIsLocating(true);
    setLocationMessage(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationMessage('Location permission required');
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
      setLocationMessage('Location unavailable');
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
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        userInterfaceStyle={resolvedThemeMode}
        customMapStyle={resolvedThemeMode === 'dark' ? GOOGLE_DARK_MAP_STYLE : []}
        showsUserLocation={hasUserLocation}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsIndoors={false}
        showsTraffic={false}
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
        {showMarkers && positions.map(position => {
          const markerWidth = 72 * markerScale;
          const markerHeight = 84 * markerScale;
          
          return (
            <React.Fragment key={`${position.bus}-${position.vehicleId}`}>
              <Marker
                coordinate={{ latitude: position.lat, longitude: position.lon }}
                anchor={MARKER_ANCHOR}
                tracksViewChanges={false}
                title={`${position.bus} to ${direction === 'toKojori' ? 'Kojori' : 'Tbilisi'}`}
                description={`Vehicle ${position.vehicleId}`}>
                <Image
                  source={MARKER_BADGE_IMAGES[position.bus]}
                  style={{ width: markerWidth, height: markerHeight }}
                  resizeMode="contain"
                />
              </Marker>
              <Marker
                coordinate={{ latitude: position.lat, longitude: position.lon }}
                anchor={MARKER_ANCHOR}
                flat
                rotation={position.heading}
                tracksViewChanges={false}>
                <Image
                  source={MARKER_HEADING_IMAGES[position.bus]}
                  style={{ width: markerWidth, height: markerHeight }}
                  resizeMode="contain"
                />
              </Marker>
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Top controls */}
      <View style={[styles.topPanel, { top: insets.top + 12 }]}>
        <DirectionPill
          accentColor={direction === 'toKojori' ? colors.route380 : colors.route316}
          onPress={() => setDirectionSheetOpen(true)}
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
          { bottom: insets.bottom + BottomTabInset + 24 },
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

      <DirectionPickerSheet
        visible={directionSheetOpen}
        onClose={() => setDirectionSheetOpen(false)}
      />

      {mapTimedOut ? (
        <View style={styles.configOverlay} pointerEvents="none">
          <Text style={styles.configTitle}>Map not loading</Text>
          <Text style={styles.configText}>
            The API key may be invalid or Maps SDK for Android is not enabled.{'\n'}
            Enable it at console.cloud.google.com → APIs &amp; Services → Library → &quot;Maps SDK for Android&quot;.
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
