import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';

import { StopMapPicker } from '@/components/stop-map-picker';
import { alpha } from '@/constants/theme';
import { useActiveDirection } from '@/hooks/use-active-direction';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useMapFocus } from '@/hooks/use-map-focus';
import { useTabNav, type TabRoute } from '@/hooks/use-tab-nav';
import { type SharedDirection } from '@/hooks/use-settings';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });

interface StopSelectorItem {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
}

interface StopSelectorProps {
  stops: StopSelectorItem[];
  activeStopId: string;
  accentColor: string;
  direction: SharedDirection;
  onSelectStop: (id: string) => void;
  /** Stop the rider is standing closest to, highlighted on the map. */
  closestStopId?: string | null;
  userLocation?: { latitude: number; longitude: number } | null;
  onRequestLocation?: () => void;
  label?: string;
  mapReturnRoute: TabRoute;
  showDirectionSwitch?: boolean;
}

function stopCode(id: string) {
  return '#' + (id.split(':')[1] ?? id);
}

function originLabel(
  direction: SharedDirection,
  t: ReturnType<typeof useI18n>['t'],
) {
  return direction === 'toKojori' ? t('cityTbilisi') : t('cityKojori');
}

function destinationLabel(
  direction: SharedDirection,
  t: ReturnType<typeof useI18n>['t'],
) {
  return direction === 'toKojori' ? t('cityKojori') : t('cityTbilisi');
}

export function DirectionSwitch({
  accentColor,
  compact = false,
  style,
}: {
  accentColor: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useAppColors();
  const styles = useStopSelectorStyles();
  const { activeDirection, selectDirection } = useActiveDirection();
  const { t } = useI18n();
  const origin = originLabel(activeDirection, t);
  const destination = destinationLabel(activeDirection, t);
  const nextDirection = activeDirection === 'toKojori' ? 'toTbilisi' : 'toKojori';

  function handlePress(event: GestureResponderEvent) {
    event.stopPropagation();
    selectDirection(nextDirection, { persist: 'deferred' });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('directionAccessibility', { origin, destination })}
      onPress={handlePress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.directionSwitch,
        {
          borderColor: pressed ? alpha(accentColor, '55') : colors.border,
          backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
        },
        style,
      ]}>
      <View
        style={[
          styles.directionRouteSegment,
          compact && styles.directionRouteSegmentCompact,
          { backgroundColor: accentColor },
        ]}>
        {compact ? <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" /> : null}
        {!compact ? (
          <Text
            style={styles.directionRouteText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}>
            {origin}
          </Text>
        ) : null}
        {!compact ? <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" /> : null}
        <Text
          style={[styles.directionRouteText, compact && styles.directionRouteTextCompact]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={compact ? 0.86 : 0.78}>
          {destination}
        </Text>
      </View>
      <View style={[styles.directionSwapSegment, compact && styles.directionSwapSegmentCompact]}>
        <MaterialCommunityIcons name="swap-horizontal" size={17} color={colors.textDim} />
      </View>
    </Pressable>
  );
}

/**
 * Boarding stop control. The map is the primary way to choose a stop — riders
 * recognise where a stop is far more reliably than what it is called. Adding
 * and removing saved stops lives on the full map tab and in Settings.
 */
export function StopSelector({
  stops,
  activeStopId,
  accentColor,
  direction,
  onSelectStop,
  closestStopId,
  userLocation,
  onRequestLocation,
  label,
  mapReturnRoute,
  showDirectionSwitch = false,
}: StopSelectorProps) {
  const styles = useStopSelectorStyles();
  const { t } = useI18n();
  const { requestStopFocus } = useMapFocus();
  const navigateToTab = useTabNav();
  const resolvedLabel = label ?? t('stopBoarding');

  const activeStop = stops.find(stop => stop.id === activeStopId) ?? stops[0];

  if (!activeStop) return null;

  function handleOpenFullMap() {
    requestStopFocus(activeStop, direction, { returnRoute: mapReturnRoute });
    navigateToTab?.('explore');
  }

  const mapPicker = (
    <StopMapPicker
      stops={stops}
      activeStopId={activeStop.id}
      accentColor={accentColor}
      closestStopId={closestStopId}
      userLocation={userLocation}
      onSelectStop={onSelectStop}
      onOpenFullMap={handleOpenFullMap}
      onRequestLocation={onRequestLocation}
      directionSwitch={showDirectionSwitch ? <DirectionSwitch accentColor={accentColor} compact /> : undefined}
    />
  );

  // Without stop geometry (or on web) there is no map to render, so fall back
  // to a plain row that still names the stop and reaches the full map.
  const hasGeometry = stops.some(
    stop => typeof stop.lat === 'number' && typeof stop.lon === 'number',
  );

  if (!hasGeometry) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('stopShowOnMap', { stop: activeStop.label })}
        onPress={handleOpenFullMap}
        style={({ pressed }) => [
          styles.fallbackRow,
          {
            borderColor: pressed ? alpha(accentColor, '55') : alpha(accentColor, '30'),
          },
        ]}>
        <MaterialCommunityIcons name="bus-stop" size={22} color={accentColor} />
        <View style={styles.fallbackCopy}>
          <Text style={styles.fallbackLabel}>{resolvedLabel}</Text>
          <Text style={[styles.fallbackName, { fontFamily: DISPLAY }]} numberOfLines={1}>
            {activeStop.label}
          </Text>
        </View>
        <Text style={[styles.fallbackCode, { fontFamily: MONO }]}>{stopCode(activeStop.id)}</Text>
      </Pressable>
    );
  }

  return mapPicker;
}

function createStyles(C: ReturnType<typeof useAppColors>) {
  return StyleSheet.create({
    directionSwitch: {
      height: 38,
      maxWidth: 224,
      borderRadius: 999,
      borderWidth: 1,
      padding: 2,
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
    },
    directionRouteSegment: {
      height: 32,
      borderRadius: 16,
      paddingHorizontal: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      minWidth: 0,
      flexShrink: 1,
    },
    directionRouteText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '800',
      flexShrink: 1,
      minWidth: 28,
    },
    directionRouteSegmentCompact: {
      paddingHorizontal: 10,
      gap: 5,
    },
    directionRouteTextCompact: {
      minWidth: 0,
    },
    directionSwapSegment: {
      width: 34,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    directionSwapSegmentCompact: {
      width: 30,
    },
    fallbackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderRadius: 16,
      backgroundColor: C.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    fallbackCopy: { flex: 1, minWidth: 0, gap: 2 },
    fallbackLabel: {
      color: C.textFaint,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    fallbackName: {
      color: C.text,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
    },
    fallbackCode: {
      color: C.textFaint,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
  });
}

function useStopSelectorStyles() {
  return createStyles(useAppColors());
}
