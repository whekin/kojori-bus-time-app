import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  View,
} from 'react-native';

import { getStopCuration, type StopDirection } from '@/constants/curated-stops';
import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useMapFocus } from '@/hooks/use-map-focus';
import { useTabNav } from '@/hooks/use-tab-nav';
import type { StopInfo } from '@/services/ttc';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

export function StopChoiceRow({
  stop,
  direction,
  accentColor,
  selected = false,
  disabled = false,
  showCheck = false,
  eyebrow,
  onPress,
  onRemove,
  removeDisabled = false,
  onMapPress,
}: {
  stop: StopInfo;
  direction: StopDirection;
  accentColor: string;
  selected?: boolean;
  disabled?: boolean;
  showCheck?: boolean;
  eyebrow?: string;
  onPress?: () => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
  onMapPress?: () => void;
}) {
  const colors = useAppColors();
  const styles = createStyles(colors);
  const { resolvedLanguage, t } = useI18n();
  const { requestStopFocus } = useMapFocus();
  const navigateToTab = useTabNav();
  const curation = getStopCuration(direction, stop.id, resolvedLanguage);
  const shortId = stop.id.split(':')[1] ?? stop.id;

  function handleMapPress(event: GestureResponderEvent) {
    event.stopPropagation();
    requestStopFocus(stop, direction);
    navigateToTab?.('explore');
    onMapPress?.();
  }

  function handleRemovePress(event: GestureResponderEvent) {
    event.stopPropagation();
    onRemove?.();
  }

  const stateColor = selected ? accentColor : colors.borderStrong;

  const rowContent = (
    <>
      <View
        style={[
          styles.state,
          {
            borderColor: stateColor,
            backgroundColor: selected ? alpha(accentColor, '22') : colors.panel,
          },
        ]}>
        {selected && showCheck ? (
          <MaterialCommunityIcons name="check" size={14} color={accentColor} />
        ) : (
          <View style={[styles.stateDot, { backgroundColor: selected ? accentColor : colors.borderStrong }]} />
        )}
      </View>

      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {stop.label}
          </Text>
          {curation?.badge ? (
            <View style={[styles.badge, { borderColor: alpha(accentColor, '45'), backgroundColor: alpha(accentColor, '10') }]}>
              <Text style={[styles.badgeText, { color: accentColor }]} numberOfLines={1}>
                {curation.badge}
              </Text>
            </View>
          ) : null}
        </View>
        {curation?.hint ? (
          <Text style={styles.hint} numberOfLines={2}>
            {curation.hint}
          </Text>
        ) : null}
        <Text style={[styles.code, { fontFamily: MONO }]}>#{shortId}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('stopShowOnMap', { stop: stop.label })}
          hitSlop={8}
          onPress={handleMapPress}
          style={[styles.iconButton, { borderColor: alpha(accentColor, '35'), backgroundColor: alpha(accentColor, '0D') }]}>
          <MaterialCommunityIcons name="map-marker-radius" size={17} color={accentColor} />
        </Pressable>
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            disabled={removeDisabled}
            hitSlop={8}
            onPress={handleRemovePress}
            style={[styles.iconButton, removeDisabled && styles.disabled]}>
            <MaterialCommunityIcons name="close" size={17} color={accentColor} />
          </Pressable>
        ) : null}
      </View>
    </>
  );

  const baseRowStyle = [
    styles.row,
    {
      borderColor: selected ? alpha(accentColor, '55') : colors.border,
      backgroundColor: selected ? alpha(accentColor, '10') : colors.surfaceRaised,
    },
    disabled && styles.disabled,
  ];

  if (!onPress || disabled) {
    return <View style={baseRowStyle}>{rowContent}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: selected ? alpha(accentColor, '55') : colors.border,
          backgroundColor: selected
            ? alpha(accentColor, '10')
            : pressed
              ? colors.surfaceHigh
              : colors.surfaceRaised,
        },
        disabled && styles.disabled,
      ]}>
      {rowContent}
    </Pressable>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    row: {
      minHeight: 86,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    disabled: { opacity: 0.35 },
    state: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    stateDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    eyebrow: {
      color: C.textFaint,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    title: {
      flex: 1,
      minWidth: 0,
      color: C.text,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '700',
    },
    badge: {
      maxWidth: 118,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 3,
      flexShrink: 0,
    },
    badgeText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    hint: {
      color: C.textDim,
      fontSize: 12,
      lineHeight: 16,
    },
    code: {
      color: C.textFaint,
      fontSize: 11,
      lineHeight: 14,
    },
    actions: {
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.surfaceHigh,
    },
  });
}
