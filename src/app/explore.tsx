import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionToggle } from '@/components/direction-toggle';
import { BottomTabInset } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useRoutePolylines } from '@/hooks/use-route-polylines';
import { useTtcHealth } from '@/hooks/use-ttc-health';
import { useVehiclePositions } from '@/hooks/use-vehicle-positions';
import { splitPolylinesByOverlap } from '@/utils/polyline-offset';

const C = {
  bg: '#09090B',
  border: '#1E2430',
  text: '#EDEAE4',
  textDim: '#98A0AE',
  teal: '#10B8A3',
} as const;

const DEFAULT_REGION: Region = {
  latitude: 41.639,
  longitude: 44.76,
  latitudeDelta: 0.12,
  longitudeDelta: 0.1,
};

type Direction = 'toKojori' | 'toTbilisi';

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

export default function ExploreScreen({ isActive = false }: ExploreScreenProps) {
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [direction, setDirection] = useState<Direction>('toKojori');
  const lastFitKeyRef = useRef<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  const [hasUserLocation, setHasUserLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (mapReady) return;
    const id = setTimeout(() => setMapTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, [mapReady]);

  const { data: routeData } = useRoutePolylines(direction);
  const { data: livePositions = [], refetch } = useVehiclePositions(direction, isActive);

  const positions = livePositions;
  const { status: ttcStatus } = useTtcHealth();
  const routePolylines = routeData?.polylines;

  const splitPolylines = useMemo(() => {
    if (!routePolylines) return null;

    const polyline380 = routePolylines['380'] ?? [];
    const polyline316 = routePolylines['316'] ?? [];

    if (polyline380.length < 2 || polyline316.length < 2) {
      return {
        '380': { only: polyline380, shared: [] },
        '316': { only: polyline316, shared: [] },
      };
    }

    const split = splitPolylinesByOverlap(polyline380, polyline316, 2);

    return {
      '380': { only: split.polyline1Only, shared: split.polyline1Shared },
      '316': { only: split.polyline2Only, shared: split.polyline2Shared },
    };
  }, [routePolylines]);

  const serviceNote = ttcStatus === 'rate-limited'
    ? 'Rate limited — refresh slowed'
    : ttcStatus === 'offline'
    ? 'TTC offline — refresh slowed'
    : ttcStatus === 'degraded'
      ? 'TTC unstable — markers may lag'
      : null;
  const bottomNote = locationMessage ?? serviceNote;

  const groupedCounts = useMemo(() => ({
    '380': positions.filter(position => position.bus === '380').length,
    '316': positions.filter(position => position.bus === '316').length,
  }), [positions]);

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

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        userInterfaceStyle="dark"
        showsUserLocation={hasUserLocation}
        showsMyLocationButton={false}
        onMapReady={() => {
          setMapReady(true);
          setMapTimedOut(false);
        }}>
        {splitPolylines
          ? (['316', '380'] as const).map((bus) => {
              const segments = splitPolylines[bus];
              const color = routeAccent(bus, colors);

              return (
                <React.Fragment key={`route-${bus}`}>
                  {segments.only.length >= 2 && (
                    <Polyline
                      key={`route-${bus}-only`}
                      coordinates={segments.only}
                      strokeColor={color}
                      strokeWidth={4}
                      zIndex={2}
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}
                  {segments.shared.length >= 2 && (
                    <Polyline
                      key={`route-${bus}-shared`}
                      coordinates={segments.shared}
                      strokeColor={color}
                      strokeWidth={2}
                      zIndex={3}
                      lineCap="butt"
                      lineJoin="miter"
                    />
                  )}
                </React.Fragment>
              );
            })
          : null}
        {positions.map(position => {
          return (
            <React.Fragment key={`${position.bus}-${position.vehicleId}`}>
              <Marker
                coordinate={{ latitude: position.lat, longitude: position.lon }}
                anchor={MARKER_ANCHOR}
                image={MARKER_BADGE_IMAGES[position.bus]}
                tracksViewChanges={false}
                title={`${position.bus} to ${direction === 'toKojori' ? 'Kojori' : 'Tbilisi'}`}
                description={`Vehicle ${position.vehicleId}`}
              />
              <Marker
                coordinate={{ latitude: position.lat, longitude: position.lon }}
                anchor={MARKER_ANCHOR}
                image={MARKER_HEADING_IMAGES[position.bus]}
                flat
                rotation={position.heading}
                tracksViewChanges={false}
              />
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Top controls */}
      <View style={[styles.topPanel, { top: insets.top + 12 }]}>
        <DirectionToggle
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'toKojori', label: '→ Kojori', accentColor: colors.route380 },
            { value: 'toTbilisi', label: '→ Tbilisi', accentColor: colors.route316 },
          ]}
          style={styles.directionToggle}
        />

        <View style={styles.legendRow}>
          {(['380', '316'] as const).map(bus => {
            const accent = routeAccent(bus, colors);
            return (
              <View key={bus} style={styles.legendChip}>
                <View style={[styles.legendDot, { backgroundColor: accent }]} />
                <Text style={styles.legendLabel}>{bus}</Text>
                <Text style={styles.legendCount}>{groupedCounts[bus]}</Text>
              </View>
            );
          })}
          <Pressable style={styles.refreshChip} onPress={() => refetch()}>
            <MaterialCommunityIcons name="refresh" size={14} color={C.textDim} />
          </Pressable>
        </View>
      </View>

      {/* Locate me — bottom right */}
      <Pressable
        style={[
          styles.locateButton,
          { bottom: insets.bottom + BottomTabInset + (bottomNote ? 64 : 24) },
          isLocating && styles.locateButtonActive,
        ]}
        onPress={handleLocateMe}
        disabled={isLocating}>
        <MaterialCommunityIcons
          name={isLocating ? 'crosshairs-question' : 'crosshairs-gps'}
          size={20}
          color={isLocating ? C.teal : C.text}
        />
      </Pressable>

      {/* Bottom status — only when there's something to say */}
      {bottomNote ? (
        <View style={[styles.bottomPill, { bottom: insets.bottom + BottomTabInset + 18 }]}>
          <Text style={styles.bottomPillText}>{bottomNote}</Text>
        </View>
      ) : null}

      {mapTimedOut ? (
        <View style={styles.configOverlay} pointerEvents="none">
          <Text style={styles.configTitle}>Map not loading</Text>
          <Text style={styles.configText}>
            The API key may be invalid or Maps SDK for Android is not enabled.{'\n'}
            Enable it at console.cloud.google.com → APIs &amp; Services → Library → "Maps SDK for Android".
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 8,
  },
  directionToggle: {
    backgroundColor: 'rgba(14,17,23,0.88)',
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
    backgroundColor: 'rgba(14,17,23,0.85)',
    borderWidth: 1,
    borderColor: C.border,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: C.text, fontSize: 12, fontWeight: '700' },
  legendCount: { color: C.textDim, fontSize: 11, fontWeight: '700' },
  refreshChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(14,17,23,0.85)',
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
    backgroundColor: 'rgba(14,17,23,0.90)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateButtonActive: { borderColor: C.teal },
  bottomPill: {
    position: 'absolute',
    left: 16,
    right: 76,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(14,17,23,0.88)',
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
    backgroundColor: 'rgba(14,17,23,0.94)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  configTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  configText: { color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 6 },
});
