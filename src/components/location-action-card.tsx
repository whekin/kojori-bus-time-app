import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';

type Tone = 'default' | 'active' | 'error';

export function LocationActionCard({
  title,
  subtitle,
  onPress,
  disabled,
  isLocating,
  tone = 'default',
  compact = false,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  isLocating?: boolean;
  tone?: Tone;
  compact?: boolean;
}) {
  const colors = useAppColors();
  const styles = useStyles();

  const borderColor =
    tone === 'error'
      ? alpha(colors.warning, '24')
      : tone === 'active'
        ? alpha(colors.primary, '55')
        : colors.border;
  const iconColor =
    tone === 'error'
      ? colors.textDim
      : tone === 'active'
        ? colors.primary
        : colors.textDim;
  const iconName =
    tone === 'error'
      ? 'crosshairs-off'
      : tone === 'active'
        ? 'crosshairs-gps'
        : 'crosshairs';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isLocating}
      style={({ pressed }) => [
        styles.card,
        compact ? styles.cardCompact : styles.cardDefault,
        {
          borderColor,
          backgroundColor: pressed
            ? colors.surfaceHigh
            : tone === 'error'
              ? alpha(colors.warning, '07')
              : colors.surface,
        },
      ]}>
      <MaterialCommunityIcons name={iconName} size={compact ? 18 : 20} color={iconColor} />
      <View style={styles.copy}>
        <Text style={[styles.title, tone === 'error' && { color: colors.textDim }]}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={compact ? 2 : undefined}>
          {subtitle}
        </Text>
      </View>
      {isLocating ? <ActivityIndicator size="small" color={colors.primary} /> : null}
    </Pressable>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      borderWidth: 1,
    },
    cardDefault: {
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    cardCompact: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
    },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    title: { color: C.text, fontSize: 14, fontWeight: '700' },
    subtitle: { color: C.textDim, fontSize: 12, lineHeight: 16 },
  });
}

function useStyles() {
  const colors = useAppColors();
  return useMemo(() => createStyles(colors), [colors]);
}
