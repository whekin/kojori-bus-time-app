import React, { useMemo } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeBottomSheet } from '@/components/native-bottom-sheet';
import { alpha, type AppColors } from '@/constants/theme';
import { useActiveDirection } from '@/hooks/use-active-direction';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { type SharedDirection } from '@/hooks/use-settings';

type Mode = 'kojori' | 'tbilisi';

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
  onPress,
  style,
}: {
  accentColor: string;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const colors = useAppColors();
  const styles = usePillStyles();
  const { activeDirection } = useActiveDirection();
  const { t } = useI18n();

  const origin = originLabel(activeDirection, t);
  const destination = destinationLabel(activeDirection, t);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('directionAccessibility', { origin, destination })}
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
        <Text style={styles.pillEyebrow} numberOfLines={1}>{t('directionFrom', { origin }).toUpperCase()}</Text>
        <Text style={styles.pillDest} numberOfLines={1}>
          <Text style={styles.pillTo}>{t('directionTo')}</Text>{destination}
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
