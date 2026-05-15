import React, { useMemo, useRef, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Animated, Easing, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeBottomSheet } from '@/components/native-bottom-sheet';
import { alpha, type AppColors } from '@/constants/theme';
import { useActiveDirection } from '@/hooks/use-active-direction';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { type SharedDirection } from '@/hooks/use-settings';

type Mode = 'kojori' | 'tbilisi';
const PILL_ROUTE_SLOT_WIDTH = 58;
const PILL_ROUTE_ARROW_SPACE = 24;
const PILL_ROUTE_SWAP_DISTANCE = PILL_ROUTE_SLOT_WIDTH + PILL_ROUTE_ARROW_SPACE;
const PILL_ROUTE_TRACK_WIDTH = PILL_ROUTE_SLOT_WIDTH * 2 + PILL_ROUTE_ARROW_SPACE;
const PILL_ROUTE_TRACK_HEIGHT = 22;
const PILL_ROUTE_ARROW_LEFT = PILL_ROUTE_SLOT_WIDTH + (PILL_ROUTE_ARROW_SPACE - 15) / 2;
const PILL_SWAP_DURATION_MS = 500;

function directionToMode(direction: SharedDirection): Mode {
  return direction === 'toKojori' ? 'kojori' : 'tbilisi';
}

function modeToDirection(mode: Mode): SharedDirection {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

function originLabel(direction: SharedDirection, t: ReturnType<typeof useI18n>['t']) {
  return direction === 'toKojori' ? t('cityTbilisi') : t('cityKojori');
}

function destinationLabel(direction: SharedDirection, t: ReturnType<typeof useI18n>['t']) {
  return direction === 'toKojori' ? t('cityKojori') : t('cityTbilisi');
}

export function DirectionPill({
  accentColor,
  style,
}: {
  accentColor: string;
  style?: ViewStyle;
}) {
  const colors = useAppColors();
  const styles = usePillStyles();
  const { activeDirection, selectDirection } = useActiveDirection();
  const { t } = useI18n();
  const switchAnim = useRef(new Animated.Value(0)).current;
  const [isSwitching, setIsSwitching] = useState(false);

  const origin = originLabel(activeDirection, t);
  const destination = destinationLabel(activeDirection, t);
  const nextDirection = activeDirection === 'toKojori' ? 'toTbilisi' : 'toKojori';
  const nextAccentColor = nextDirection === 'toKojori' ? colors.route380 : colors.route316;
  const swapRotation = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const originTranslate = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PILL_ROUTE_SWAP_DISTANCE],
  });
  const destinationTranslate = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -PILL_ROUTE_SWAP_DISTANCE],
  });
  const arrowScale = switchAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.72, 1],
  });
  const arrowOpacity = switchAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.42, 1],
  });
  const animatedAccentColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [accentColor, nextAccentColor],
  });
  const animatedBorderColor = switchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [alpha(accentColor, '40'), alpha(nextAccentColor, '40')],
  });

  function handlePress() {
    if (isSwitching) return;

    setIsSwitching(true);
    switchAnim.stopAnimation();
    switchAnim.setValue(0);
    Animated.timing(switchAnim, {
      toValue: 1,
      duration: PILL_SWAP_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) {
        setIsSwitching(false);
        return;
      }

      selectDirection(nextDirection, { persist: 'deferred' });
      requestAnimationFrame(() => {
        switchAnim.setValue(0);
        setIsSwitching(false);
      });
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('directionAccessibility', { origin, destination })}
      onPress={handlePress}
      disabled={isSwitching}
      style={({ pressed }) => [
        styles.pill,
        {
          borderColor: alpha(accentColor, '00'),
          backgroundColor: pressed && !isSwitching ? colors.surfaceHigh : colors.surface,
        },
        style,
      ]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pillBorder,
          {
            borderColor: animatedBorderColor,
          },
        ]}
      />
      <View style={styles.pillText}>
        <Text style={styles.pillEyebrow} numberOfLines={1}>{t('directionFromTo').toUpperCase()}</Text>
        <View style={styles.pillRouteRow}>
          <Animated.View style={[styles.pillDot, { backgroundColor: animatedAccentColor }]} />
          <View style={styles.pillRouteTrack}>
            <Animated.View
              style={[
                styles.pillRouteSlot,
                styles.pillRouteSlotOrigin,
                { transform: [{ translateX: originTranslate }] },
              ]}>
              <Text style={styles.pillPlace} numberOfLines={1}>{origin}</Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.pillRouteArrow,
                {
                  opacity: arrowOpacity,
                  transform: [{ scale: arrowScale }],
                },
              ]}>
              <MaterialCommunityIcons name="arrow-right" size={15} color={colors.textDim} />
            </Animated.View>
            <Animated.View
              style={[
                styles.pillRouteSlot,
                styles.pillRouteSlotDestination,
                { transform: [{ translateX: destinationTranslate }] },
              ]}>
              <Text style={styles.pillPlace} numberOfLines={1}>{destination}</Text>
            </Animated.View>
          </View>
        </View>
      </View>
      <Animated.View style={{ transform: [{ rotate: swapRotation }] }}>
        <MaterialCommunityIcons name="swap-horizontal" size={17} color={colors.textDim} />
      </Animated.View>
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
  return <DirectionPickerSheetInner visible={visible} onClose={onClose} />;
}

function DirectionPickerSheetInner({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useAppColors();
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  const { activeDirection, selectDirection } = useActiveDirection();
  const { t } = useI18n();

  const activeMode = directionToMode(activeDirection);

  function handlePickMode(mode: Mode) {
    const nextDirection = modeToDirection(mode);
    onClose();

    if (nextDirection === activeDirection) return;

    setTimeout(() => {
      selectDirection(nextDirection, { persist: 'deferred' });
    }, 0);
  }

  return (
    <NativeBottomSheet
      visible={visible}
      onClose={onClose}
      contentStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Text style={styles.title}>{t('directionTitle')}</Text>
      <Text style={styles.subtitle}>
        {t('directionSubtitle')}
      </Text>

      <View style={styles.options}>
        {(['kojori', 'tbilisi'] as Mode[]).map(mode => {
          const isActive = activeMode === mode;
          const label = mode === 'kojori' ? t('cityKojori') : t('cityTbilisi');
          const sub = mode === 'kojori' ? t('directionUpMountain') : t('directionDownCity');
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
                  <Text style={[styles.optionTo, { color: isActive ? alpha(accent, 'AA') : colors.textDim }]}>{t('directionTo')}</Text>{label}
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
    </NativeBottomSheet>
  );
}

function createPillStyles(C: AppColors) {
  return StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      position: 'relative',
      paddingLeft: 14,
      paddingRight: 12,
      paddingVertical: 10,
      borderRadius: 16,
      borderWidth: 1,
      minHeight: 58,
      minWidth: 202,
      maxWidth: 260,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    pillBorder: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
      borderWidth: 1,
    },
    pillDot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
    pillText: { minWidth: 0, flex: 1, gap: 4 },
    pillEyebrow: {
      color: C.textFaint,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 2,
    },
    pillRouteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    pillRouteTrack: {
      width: PILL_ROUTE_TRACK_WIDTH,
      height: PILL_ROUTE_TRACK_HEIGHT,
      flexShrink: 0,
    },
    pillRouteSlot: {
      position: 'absolute',
      top: 0,
      width: PILL_ROUTE_SLOT_WIDTH,
      height: PILL_ROUTE_TRACK_HEIGHT,
      justifyContent: 'center',
    },
    pillRouteSlotOrigin: {
      left: 0,
      alignItems: 'center',
    },
    pillRouteSlotDestination: {
      left: PILL_ROUTE_SWAP_DISTANCE,
      alignItems: 'center',
    },
    pillRouteArrow: {
      position: 'absolute',
      left: PILL_ROUTE_ARROW_LEFT,
      top: 1,
      width: 15,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillPlace: {
      color: C.text,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
}

function usePillStyles() {
  const C = useAppColors();
  return useMemo(() => createPillStyles(C), [C]);
}

function createSheetStyles(C: AppColors) {
  return StyleSheet.create({
    sheetContent: {
      paddingHorizontal: 20,
      gap: 14,
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
