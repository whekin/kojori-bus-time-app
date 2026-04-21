import React, { useMemo } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Modal, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, type AppColors } from '@/constants/theme';
import { LocationActionCard } from '@/components/location-action-card';
import { useAppColors } from '@/hooks/use-app-colors';
import { useLocation } from '@/hooks/use-location';
import { useSettings, type SharedDirection } from '@/hooks/use-settings';

type Mode = 'kojori' | 'tbilisi';

function directionToMode(direction: SharedDirection): Mode {
  return direction === 'toKojori' ? 'kojori' : 'tbilisi';
}

function modeToDirection(mode: Mode): SharedDirection {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

function originLabel(direction: SharedDirection) {
  return direction === 'toKojori' ? 'Tbilisi' : 'Kojori';
}

function destinationLabel(direction: SharedDirection) {
  return direction === 'toKojori' ? 'Kojori' : 'Tbilisi';
}

export function DirectionPill({
  accentColor,
  onPress,
  style,
}: {
  accentColor: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const colors = useAppColors();
  const styles = usePillStyles();
  const { settings } = useSettings();

  const origin = originLabel(settings.sharedDirection);
  const destination = destinationLabel(settings.sharedDirection);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Going from ${origin} to ${destination}. Tap to change.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: alpha(accentColor, '40'),
          backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
        },
        style,
      ]}>
      <View style={[styles.pillDot, { backgroundColor: accentColor }]} />
      <View style={styles.pillText}>
        <Text style={styles.pillEyebrow} numberOfLines={1}>FROM {origin.toUpperCase()}</Text>
        <Text style={styles.pillDest} numberOfLines={1}>
          <Text style={styles.pillTo}>to </Text>{destination}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-down" size={14} color={colors.textDim} />
    </Pressable>
  );
}

export function DirectionPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;
  return <DirectionPickerSheetInner onClose={onClose} />;
}

function DirectionPickerSheetInner({ onClose }: { onClose: () => void }) {
  const colors = useAppColors();
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  const {
    settings,
    setSharedDirection,
  } = useSettings();
  const {
    suggestedMode,
    permission,
    isLocating,
    locationError,
    requestLocationSelection,
  } = useLocation(true);

  const activeMode = directionToMode(settings.sharedDirection);

  function handlePickMode(mode: Mode) {
    setSharedDirection(modeToDirection(mode));
    onClose();
  }

  async function handleUseLocation() {
    const result = await requestLocationSelection({ forceFresh: true });
    if (result.access === 'granted' && result.suggestedMode) {
      setSharedDirection(modeToDirection(result.suggestedMode), false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Where are you going?</Text>
          <Text style={styles.subtitle}>
            Change direction any time. Smart direction uses your location to suggest one.
          </Text>

          <View style={styles.options}>
            {(['kojori', 'tbilisi'] as Mode[]).map(mode => {
              const isActive = activeMode === mode;
              const label = mode === 'kojori' ? 'Kojori' : 'Tbilisi';
              const sub = mode === 'kojori' ? 'Up the mountain' : 'Down in the city';
              const accent = mode === 'kojori' ? colors.route380 : colors.route316;
              return (
                <Pressable
                  key={mode}
                  onPress={() => handlePickMode(mode)}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderColor: isActive ? accent : colors.border,
                      backgroundColor: isActive
                        ? alpha(accent, '14')
                        : pressed
                          ? colors.surfaceHigh
                          : colors.surface,
                    },
                  ]}>
                  <View style={[styles.optionDot, { backgroundColor: accent }]} />
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, { color: isActive ? accent : colors.text }]}>
                      <Text style={[styles.optionTo, { color: isActive ? alpha(accent, 'AA') : colors.textDim }]}>to </Text>{label}
                    </Text>
                    <Text style={styles.optionSub}>{sub}</Text>
                  </View>
                  {isActive ? (
                    <MaterialCommunityIcons name="check-circle" size={18} color={accent} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <LocationActionCard
            title={locationError ? 'Location unavailable' : 'Use my location'}
            subtitle={
              isLocating
                ? 'Detecting where you are…'
                : locationError
                  ? 'Timed out. Tap to retry, or choose a direction manually.'
                  : suggestedMode
                    ? `Suggested: ${suggestedMode === 'kojori' ? 'Kojori' : 'Tbilisi'}. Tap to refresh.`
                    : permission === 'granted'
                      ? 'Tap to refresh location'
                      : 'Auto-pick direction once from where you are'
            }
            onPress={handleUseLocation}
            isLocating={isLocating}
            tone={locationError ? 'error' : permission === 'granted' ? 'active' : 'default'}
            compact
          />
        </View>
      </View>
    </Modal>
  );
}

function createPillStyles(C: AppColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 10,
      paddingRight: 8,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      minHeight: 34,
    },
    pillDot: { width: 8, height: 8, borderRadius: 4 },
    pillText: { minWidth: 0, flexShrink: 1 },
    pillEyebrow: {
      color: C.textFaint,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    pillDest: {
      color: C.text,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    pillTo: {
      color: C.textDim,
      fontSize: 12,
      fontWeight: '500',
      fontStyle: 'italic',
    },
  });
}

function usePillStyles() {
  const C = useAppColors();
  return useMemo(() => createPillStyles(C), [C]);
}

function createSheetStyles(C: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: `${C.bg}CC` },
    sheet: {
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: C.borderStrong,
      backgroundColor: C.surface,
      paddingTop: 10,
      paddingHorizontal: 20,
      gap: 14,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 999,
      backgroundColor: C.borderStrong,
      marginBottom: 6,
    },
    title: { color: C.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    subtitle: { color: C.textDim, fontSize: 13, lineHeight: 18, marginTop: -6 },
    options: { gap: 10, marginTop: 4 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 18,
      borderWidth: 1,
    },
    optionDot: { width: 10, height: 10, borderRadius: 5 },
    optionCopy: { flex: 1, minWidth: 0, gap: 2 },
    optionLabel: { fontSize: 18, fontWeight: '700' },
    optionTo: { fontSize: 15, fontWeight: '500', fontStyle: 'italic' },
    optionSub: { color: C.textDim, fontSize: 12 },
  });
}

function useSheetStyles() {
  const C = useAppColors();
  return useMemo(() => createSheetStyles(C), [C]);
}
