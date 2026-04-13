import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionToggle } from '@/components/direction-toggle';
import { BottomTabInset } from '@/constants/theme';
import { useRoutePolylines } from '@/hooks/use-route-polylines';
import { useTtcHealth } from '@/hooks/use-ttc-health';
import { useVehiclePositions } from '@/hooks/use-vehicle-positions';
import { BUS_COLORS } from '@/services/ttc';

const C = {
  bg: '#09090B',
  panel: '#0E1117',
  panelHigh: '#151922',
  border: '#1E2430',
  text: '#EDEAE4',
  textDim: '#98A0AE',
  textFaint: '#586070',
  amber: BUS_COLORS['380'],
  teal: BUS_COLORS['316'],
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

function routeAccent(bus: '380' | '316') {
  return bus === '380' ? C.amber : C.teal;
}

export default function ExploreScreen({ isActive = false }: ExploreScreenProps) {
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

  const { data: routePolylines } = useRoutePolylines(direction);
  const { data: positions = [], refetch } = useVehiclePositions(direction, isActive);
  const { status: ttcStatus } = useTtcHealth();

  const title = direction === 'toKojori' ? 'Inbound to Kojori' : 'Inbound to Tbilisi';
  const subtitle = direction === 'toKojori'
    ? 'Tracking live TTC vehicles heading uphill.'
    : 'Tracking live TTC vehicles heading back into the city.';
  const serviceNote = ttcStatus === 'offline'
    ? 'TTC is offline right now. Auto-refresh is slowed down while the map stays available.'
    : ttcStatus === 'degraded'
      ? 'TTC is unstable right now. Vehicle markers may lag until the feed settles.'
      : 'Updated every 3 seconds while this screen is visible.';
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
            top: 170,
            right: 60,
            bottom: 220,
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
        setLocationMessage('Location permission is off. Enable it to jump to your position.');
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
      setLocationMessage('Centered on your current location.');
    } catch {
      setLocationMessage('Could not get your location right now.');
    } finally {
      setIsLocating(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={DEFAULT_REGION}
        userInterfaceStyle="dark"
        showsUserLocation={hasUserLocation}
        onMapReady={() => {
          setMapReady(true);
          setMapTimedOut(false);
        }}>
        {routePolylines
          ? (['316', '380'] as const).map((bus, index) => {
              const points = routePolylines[bus] ?? [];
              if (points.length < 2) return null;

              return (
                <Polyline
                  key={`route-${bus}`}
                  coordinates={points}
                  strokeColor={routeAccent(bus)}
                  strokeWidth={direction === 'toKojori' ? 4 : 3}
                  zIndex={index + 1}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            })
          : null}
        {positions.map(position => {
          const accent = routeAccent(position.bus);
          return (
            <Marker
              key={`${position.bus}-${position.vehicleId}`}
              coordinate={{ latitude: position.lat, longitude: position.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              title={`${position.bus} to ${direction === 'toKojori' ? 'Kojori' : 'Tbilisi'}`}
              description={`Vehicle ${position.vehicleId}`}>
              <View style={styles.markerWrap}>
                <View style={[styles.markerGlow, { backgroundColor: accent + '24' }]} />
                <View style={styles.markerHeadingWrap}>
                  <View style={[styles.markerHeadingStem, { backgroundColor: accent + '66' }]} />
                  <View style={[styles.markerHeadingBadge, { backgroundColor: accent, shadowColor: accent + '66' }]}>
                    <MaterialCommunityIcons
                      name="navigation-variant"
                      size={14}
                      color="#09090B"
                      style={{ transform: [{ rotate: `${position.heading}deg` }] }}
                    />
                  </View>
                </View>
                <View style={[styles.markerCircle, { borderColor: accent, shadowColor: accent }]}>
                  <View style={[styles.markerCircleInner, { backgroundColor: accent + '18' }]}>
                    <MaterialCommunityIcons name="bus-side" size={18} color={accent} />
                  </View>
                  <View style={[styles.markerRouteChip, { backgroundColor: accent }]}>
                    <Text style={styles.markerRouteChipText}>{position.bus}</Text>
                  </View>
                </View>
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.mapShadeTop} pointerEvents="none" />

      <View style={[styles.topPanel, { top: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerEyebrow}>LIVE MAP</Text>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.actionButton, isLocating && styles.actionButtonDisabled]}
              onPress={handleLocateMe}
              disabled={isLocating}>
              <MaterialCommunityIcons
                name={isLocating ? 'crosshairs-question' : 'crosshairs-gps'}
                size={18}
                color={C.text}
              />
            </Pressable>
            <Pressable style={styles.actionButton} onPress={() => refetch()}>
              <MaterialCommunityIcons name="refresh" size={18} color={C.text} />
            </Pressable>
          </View>
        </View>

        <DirectionToggle
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'toKojori', label: '→ Kojori', accentColor: C.amber },
            { value: 'toTbilisi', label: '→ Tbilisi', accentColor: C.teal },
          ]}
          style={styles.directionToggle}
        />

        <View style={styles.legendRow}>
          {(['380', '316'] as const).map(bus => {
            const accent = routeAccent(bus);
            return (
              <View key={bus} style={styles.legendCard}>
                <View style={[styles.legendSwatch, { backgroundColor: accent }]} />
                <Text style={styles.legendText}>{bus}</Text>
                <Text style={styles.legendCount}>{groupedCounts[bus]}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[styles.bottomPanel, { bottom: insets.bottom + BottomTabInset + 18 }]}>
        <Text style={styles.bottomMeta}>{positions.length} buses visible</Text>
        <Text style={styles.bottomNote}>
          {bottomNote}
        </Text>
      </View>

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
  mapShadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'rgba(9,9,11,0.34)',
  },
  topPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(14,17,23,0.90)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
  },
  headerEyebrow: { color: C.textFaint, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '700', marginTop: 4, letterSpacing: -0.6 },
  headerSubtitle: { color: C.textDim, fontSize: 13, marginTop: 3, lineHeight: 18 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panelHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDisabled: { opacity: 0.72 },
  directionToggle: {
    backgroundColor: 'rgba(14,17,23,0.92)',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(14,17,23,0.88)',
    borderWidth: 1,
    borderColor: C.border,
  },
  legendSwatch: { width: 9, height: 9, borderRadius: 4.5 },
  legendText: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  legendCount: { color: C.textDim, fontSize: 12, fontWeight: '700' },
  markerWrap: { alignItems: 'center', justifyContent: 'center' },
  markerGlow: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  markerHeadingWrap: {
    position: 'absolute',
    top: -20,
    right: -10,
    alignItems: 'center',
  },
  markerHeadingStem: {
    width: 2,
    height: 10,
    borderRadius: 999,
    marginBottom: -1,
  },
  markerHeadingBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    backgroundColor: 'rgba(14,17,23,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  markerCircleInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerRouteChip: {
    position: 'absolute',
    bottom: -7,
    minWidth: 24,
    paddingHorizontal: 6,
    height: 15,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerRouteChipText: { color: '#09090B', fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  bottomPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(14,17,23,0.92)',
    borderWidth: 1,
    borderColor: C.border,
  },
  bottomMeta: { color: C.text, fontSize: 13, fontWeight: '700' },
  bottomNote: { color: C.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 },
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
  configCode: { color: C.text, fontFamily: 'monospace', fontSize: 12 },
});
