import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import {
  boundsOf,
  cameraForBounds,
  GeoMap,
  GeoMarker,
  mapStyleFor,
  roughDistanceMeters,
  UserLocationMarker,
  zoomForLatitudeSpan,
  type LngLat,
  type MapFrame,
  type Padding,
} from '@/map';

const COLLAPSED_HEIGHT = 150;
const EXPANDED_HEIGHT = 320;
// Starting guess for the control column until it has measured itself.
const CONTROL_COLUMN = 150;
const COLUMN_GAP = 12;
// The OSM attribution button has to stay visible, so the bottom-left corner
// is reserved rather than framed into.
const ATTRIBUTION_INSET = 16;
// The active marker's radius plus a hair, so it sits fully on the map.
const MARKER_MARGIN = 18;
// Roughly 450m tall at the most, 6.5km at the least: a lone stop does not
// zoom to street level, and a spread-out trip does not zoom to the region.
const MIN_SPAN_DEGREES = 0.004;
const MAX_SPAN_DEGREES = 0.06;
// Beyond this the rider is not "at" the stops, and framing them together
// would zoom the stops themselves out of usefulness.
const INCLUDE_USER_WITHIN_METERS = 3_000;
const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });

export type MapPickerStop = {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
};

type GeoStop = MapPickerStop & { lat: number; lon: number };
type Coordinate = { latitude: number; longitude: number };

/**
 * The controls occupy the top-right corner, so the stops are kept clear of
 * them either by reserving a column down the side or a band across the top.
 * Which wastes less depends on how the stops are strung out; both are framed
 * and the closer one wins.
 */
function pickerFrame(
  points: LngLat[],
  size: { width: number; height: number },
  column: { width: number; height: number },
): MapFrame | null {
  const bounds = boundsOf(points);
  if (!bounds) return null;
  const latitude = (bounds[1] + bounds[3]) / 2;
  const minZoom = zoomForLatitudeSpan(MAX_SPAN_DEGREES, size.height, latitude);
  const maxZoom = zoomForLatitudeSpan(MIN_SPAN_DEGREES, size.height, latitude);
  const base: Padding = {
    top: MARKER_MARGIN,
    right: MARKER_MARGIN,
    bottom: ATTRIBUTION_INSET + MARKER_MARGIN,
    left: MARKER_MARGIN,
  };
  const asColumn: Padding = { ...base, right: base.right + column.width + COLUMN_GAP };
  const asBand: Padding = { ...base, top: base.top + column.height + COLUMN_GAP };
  const zoomFor = (padding: Padding) =>
    cameraForBounds(bounds, size, padding, { minZoom, maxZoom }).zoom;
  const padding = column.height > 0 && zoomFor(asBand) > zoomFor(asColumn) ? asBand : asColumn;
  return { bounds, padding, minZoom, maxZoom };
}

/**
 * Boarding stop control: the rider picks a stop by tapping it on a map instead
 * of recognising it by name. The map itself stays still — tapping it grows the
 * card instead of panning, so the one interactive map stays on its own tab.
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
  const styles = createStyles(colors);
  const { t, resolvedLanguage } = useI18n();
  const [cardSize, setCardSize] = useState({ width: 360, height: COLLAPSED_HEIGHT });
  // The switch is as wide as the destination name, which differs per direction
  // and per language, so the column measures itself rather than being guessed.
  const [columnSize, setColumnSize] = useState({ width: CONTROL_COLUMN, height: 0 });
  const [expanded, setExpanded] = useState(false);

  const geoStops = stops.filter(
    (stop): stop is GeoStop => typeof stop.lat === 'number' && typeof stop.lon === 'number',
  );
  const stopPoints = geoStops.map(stop => [stop.lon, stop.lat] as LngLat);
  const userPoint: LngLat | null = userLocation ? [userLocation.longitude, userLocation.latitude] : null;
  const includeUser = userPoint != null && stopPoints.length > 0 &&
    Math.min(...stopPoints.map(point => roughDistanceMeters(point, userPoint))) <= INCLUDE_USER_WITHIN_METERS;
  const height = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  const frame = pickerFrame(
    includeUser ? [...stopPoints, userPoint] : stopPoints,
    { width: cardSize.width, height },
    columnSize,
  );
  const activeStop = stops.find(stop => stop.id === activeStopId) ?? stops[0];

  if (!frame || !activeStop) return null;

  return (
    <View>
      <View
        style={[styles.card, { height, borderColor: alpha(accentColor, '30') }]}
        onLayout={event => {
          const { width } = event.nativeEvent.layout;
          if (width <= 0) return;
          setCardSize(previous => (previous.width === width ? previous : { width, height: previous.height }));
        }}>
        <GeoMap
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyleFor(colors.mode, resolvedLanguage, true)}
          initialCamera={frame}
          frame={frame}
          interactive={false}
          onPress={() => setExpanded(previous => !previous)}>
          {includeUser && userPoint ? <UserLocationMarker coordinate={userPoint} size={24} /> : null}
          {geoStops.map(stop => {
            const isActive = stop.id === activeStopId;
            const isClosest = !isActive && stop.id === closestStopId;
            return (
              <GeoMarker
                key={stop.id}
                coordinate={[stop.lon, stop.lat]}
                zIndex={isActive ? 3 : 2}
                accessibilityLabel={stop.label}
                onPress={() => onSelectStop(stop.id)}>
                <View testID={`boarding-stop-${stop.id}`} style={styles.markerHitArea}>
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
                </View>
              </GeoMarker>
            );
          })}
        </GeoMap>

        <View
          style={styles.controlColumn}
          onLayout={event => {
            const { width: columnWidth, height: columnHeight } = event.nativeEvent.layout;
            if (columnWidth <= 0 || columnHeight <= 0) return;
            setColumnSize(previous =>
              previous.width === columnWidth && previous.height === columnHeight
                ? previous
                : { width: columnWidth, height: columnHeight },
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
          testID={`active-boarding-stop-${activeStop.id}`}
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

const MARKER_HIT_SIZE = 46;

function createStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      backgroundColor: C.surfaceHigh,
      overflow: 'hidden',
    },
    // The padding gives the dots a finger-sized target without growing the
    // visible marker.
    markerHitArea: {
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
