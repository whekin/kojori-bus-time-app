import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region, type MapStyleElement } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionToggle } from '@/components/direction-toggle';
import { BottomTabInset } from '@/constants/theme';
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

const DARK_MAP_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0b0f16' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7e8798' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f16' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#202938' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#596170' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0f1714' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4b6657' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2431' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#141b25' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7a8290' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#273445' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#141c28' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#142033' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#9ba3b5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071c28' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3c6a82' }] },
];

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

  useEffect(() => {
    if (mapReady) return;
    const id = setTimeout(() => setMapTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, [mapReady]);

  const { data: positions = [], isError, refetch } = useVehiclePositions(direction, isActive);

  const title = direction === 'toKojori' ? 'Inbound to Kojori' : 'Inbound to Tbilisi';
  const subtitle = direction === 'toKojori'
    ? 'Tracking live TTC vehicles heading uphill.'
    : 'Tracking live TTC vehicles heading back into the city.';

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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        initialRegion={DEFAULT_REGION}
        customMapStyle={DARK_MAP_STYLE}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        onMapReady={() => { setMapReady(true); setMapTimedOut(false); }}>
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
                <View style={[styles.markerCard, { borderColor: accent }]}>
                  <View style={[styles.markerBadge, { backgroundColor: accent }]}>
                    <Text style={styles.markerBadgeText}>{position.bus}</Text>
                  </View>
                  <View style={styles.markerArrowWrap}>
                    <MaterialCommunityIcons
                      name="navigation-variant"
                      size={18}
                      color={accent}
                      style={{ transform: [{ rotate: `${position.heading}deg` }] }}
                    />
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
          <Pressable style={styles.refreshButton} onPress={() => refetch()}>
            <MaterialCommunityIcons name="refresh" size={18} color={C.text} />
          </Pressable>
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
          {isError
            ? 'TTC is offline right now. The map stays available and vehicle markers will return automatically once the feed recovers.'
            : 'Updated every 3 seconds while this screen is visible.'}
        </Text>
      </View>

      {mapTimedOut ? (
        <View style={styles.configOverlay} pointerEvents="none">
          <Text style={styles.configTitle}>Map not loading</Text>
          <Text style={styles.configText}>
            The API key may be invalid or the Maps SDK for Android is not enabled in Google Cloud Console.
            Enable it at console.cloud.google.com → APIs &amp; Services → Library → "Maps SDK for Android".
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  map: { flex: 1 },
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
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panelHigh,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
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
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  markerCard: {
    minWidth: 52,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: 'rgba(14,17,23,0.94)',
    overflow: 'hidden',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  markerBadge: {
    width: '100%',
    paddingVertical: 4,
    alignItems: 'center',
  },
  markerBadgeText: { color: '#09090B', fontSize: 12, fontWeight: '900', letterSpacing: 0.4 },
  markerArrowWrap: { paddingHorizontal: 10, paddingVertical: 8 },
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
