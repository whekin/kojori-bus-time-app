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
import { alpha, Fonts, Spacing } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useMapFocus } from '@/hooks/use-map-focus';
import { useTabNav, type TabRoute } from '@/hooks/use-tab-nav';
import { useFavorites } from '@/transit/favorites';
import { reverseTrip } from '@/transit/model';
import { useTripUi } from '@/transit/trip-ui';
import { useFavoriteTitle } from '@/transit/ui';
import { createThemedStyles } from '@/utils/themed-styles';

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
  tripId: string;
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

/**
 * Compact trip control on the stop map. With a saved return trip it flips
 * direction in place, as the Kojori app always did; otherwise it opens the
 * trip chooser.
 */
export function TripSwitch({
  accentColor,
  compact = false,
  style,
}: {
  accentColor: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { state, selected, select } = useFavorites();
  const { openPicker } = useTripUi();
  const tripTitle = useFavoriteTitle();
  if (!selected) return null;
  const reverse = reverseTrip(selected, state.favorites);
  const destination = tripTitle(selected);
  const origin = reverse ? tripTitle(reverse) : null;
  const many = state.favorites.length > 2 || !reverse;

  function handlePress(event: GestureResponderEvent) {
    event.stopPropagation();
    if (reverse && !many) select(reverse.id);
    else openPicker();
  }

  return <DirectionToggle origin={origin} destination={destination} accentColor={accentColor}
    compact={compact} style={style} many={many} onPress={handlePress}
    onLongPress={reverse ? () => select(reverse.id) : undefined} />;
}

/** Shared direction control; callers own selection and persistence. */
export function DirectionToggle({
  origin, destination, accentColor, compact = false, style, many = false, onPress, onLongPress, variant = 'pill',
}: {
  variant?: 'pill' | 'heading';
  origin: string | null;
  destination: string;
  accentColor: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  many?: boolean;
  onPress: (event: GestureResponderEvent) => void;
  onLongPress?: () => void;
}) {
  const colors = useAppColors();
  const styles = useStopSelectorStyles();
  const { t } = useI18n();
  if (variant === 'heading' && origin) {
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, style]}>
        <Text style={{ flex: 1, color: colors.textDim, fontFamily: Fonts.serif, fontSize: 21, lineHeight: 27 }}
          numberOfLines={2}>{origin}</Text>
        <Pressable accessibilityRole="button"
          accessibilityLabel={t('directionAccessibility', { origin, destination })}
          onPress={onPress} testID="card-direction-toggle"
          style={({ pressed }) => ({
            width: 44, height: 44, borderRadius: 22,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: alpha(accentColor, pressed ? '40' : '1F'),
            borderColor: alpha(accentColor, '55'), borderWidth: 1,
          })}>
          <MaterialCommunityIcons name="swap-horizontal" size={23} color={colors.text} />
        </Pressable>
        <Text style={{ flex: 1, color: colors.text, fontFamily: Fonts.serif, fontSize: 21,
          lineHeight: 27, fontWeight: '700', textAlign: 'right' }}
          numberOfLines={2}>{destination}</Text>
      </View>
    );
  }

  return (
    <Pressable
      testID="boarding-direction-toggle"
      accessibilityRole="button"
      accessibilityLabel={
        origin
          ? t('directionAccessibility', { origin, destination })
          : destination
      }
      onPress={onPress}
      onLongPress={onLongPress}
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
        {compact || !origin ? <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" /> : null}
        {!compact && origin ? (
          <Text
            style={styles.directionRouteText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}>
            {origin}
          </Text>
        ) : null}
        {!compact && origin ? <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" /> : null}
        <Text
          style={[styles.directionRouteText, compact && styles.directionRouteTextCompact]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={compact ? 0.86 : 0.78}>
          {destination}
        </Text>
      </View>
      <View style={[styles.directionSwapSegment, compact && styles.directionSwapSegmentCompact]}>
        <MaterialCommunityIcons
          name={many ? 'chevron-down' : 'swap-horizontal'}
          size={17}
          color={colors.textDim}
        />
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
  tripId,
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
    requestStopFocus(activeStop, tripId, { returnRoute: mapReturnRoute });
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
      directionSwitch={showDirectionSwitch ? <TripSwitch accentColor={accentColor} compact /> : undefined}
    />
  );

  // Without stop geometry there is no map to render, so fall back to a plain
  // row that still names the stop and reaches the full map.
  const hasGeometry = stops.some(
    stop => typeof stop.lat === 'number' && typeof stop.lon === 'number',
  );

  if (!hasGeometry) {
    return (
      <View style={styles.fallbackStack}>
      {showDirectionSwitch ? <TripSwitch accentColor={accentColor} compact style={styles.fallbackSwitch} /> : null}
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
      {stops.length > 1 ? (
        <View style={styles.fallbackChips}>
          {stops.map(stop => (
            <Pressable
              key={stop.id}
              accessibilityRole="button"
              accessibilityState={{ selected: stop.id === activeStop.id }}
              onPress={() => onSelectStop(stop.id)}
              style={[
                styles.fallbackChip,
                stop.id === activeStop.id && { borderColor: accentColor, backgroundColor: alpha(accentColor, '1F') },
              ]}>
              <Text style={styles.fallbackChipText} numberOfLines={1}>{stop.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      </View>
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
    fallbackStack: { gap: 10, alignItems: 'stretch' },
    fallbackSwitch: { alignSelf: 'flex-start' },
    fallbackChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    fallbackChip: {
      height: 32,
      maxWidth: '100%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 12,
      justifyContent: 'center',
    },
    fallbackChipText: { color: C.text, fontSize: 13, fontWeight: '700' },
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

const getStopSelectorStyles = createThemedStyles(createStyles);

function useStopSelectorStyles() {
  return getStopSelectorStyles(useAppColors());
}
