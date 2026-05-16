import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useEffectiveTtcHealth } from '@/hooks/use-effective-ttc-health';
import { useI18n } from '@/hooks/use-i18n';

type StatusBarItem = {
  key: string;
  modeLabel: string;
  label: string;
  detail: string;
  meta?: string;
  accentColor: string;
  textColor: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function TtcStatusTopBar() {
  const colors = useAppColors();
  const styles = useStyles(colors);
  const { t, formatRelativeDuration } = useI18n();
  const queryClient = useQueryClient();
  const { status, lastSuccessAt } = useEffectiveTtcHealth();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  let item: StatusBarItem | null = null;

  if (status !== 'healthy') {
    const isOffline = status === 'offline';
    const isDeviceOffline = status === 'device-offline';
    const isRateLimited = status === 'rate-limited';
    const isSevere = isOffline || isRateLimited || isDeviceOffline;
    const accent = isSevere ? colors.error : colors.warning;
    const textColor = isSevere ? colors.rose : colors.sand;
    const baseLabel = isRateLimited
      ? t('ttcRateLimited')
      : isDeviceOffline
        ? t('ttcDeviceOffline')
        : isOffline
          ? t('ttcOffline')
          : t('ttcUnstable');
    const timeAgo = lastSuccessAt
      ? (() => {
          const mins = Math.floor((Date.now() - lastSuccessAt) / 60000);
          if (mins < 1) return t('ttcJustNow');
          if (mins < 60) return formatRelativeDuration('past', 'minute', mins);
          const hours = Math.floor(mins / 60);
          return formatRelativeDuration('past', 'hour', hours);
        })()
      : null;

    item = {
      key: 'ttc',
      modeLabel: t('ttcOfflineMode'),
      label: timeAgo ? `${baseLabel} · ${timeAgo}` : baseLabel,
      detail: isRateLimited
        ? t('ttcRateDetail')
        : isDeviceOffline
          ? t('ttcDeviceOfflineDetail')
          : isOffline
            ? t('ttcOfflineDetail')
            : t('ttcUnstableDetail'),
      meta: lastSuccessAt
        ? t('ttcLastUpdate', {
            time: new Date(lastSuccessAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })
        : t('ttcNoResponse'),
      actionLabel: t('commonRefresh'),
      onAction: () => {
        queryClient.refetchQueries({
          predicate: query => query.meta?.source === 'ttc' && query.getObserversCount() > 0,
        });
      },
      accentColor: accent,
      textColor,
    };
  }

  useEffect(() => {
    if (expandedKey && item?.key !== expandedKey) {
      setExpandedKey(null);
    }
  }, [expandedKey, item?.key]);

  if (!item) return null;

  const expandedItem = expandedKey === item.key ? item : null;
  const primaryItem = expandedItem ?? item;
  const isExpanded = Boolean(expandedItem);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${primaryItem.modeLabel}. ${primaryItem.label}. ${
        isExpanded ? t('ttcStatusCollapse') : t('ttcStatusExpand')
      }`}
      accessibilityState={{ expanded: isExpanded }}
      onPress={() => setExpandedKey(current => current === primaryItem.key ? null : primaryItem.key)}
      style={[
        styles.statusBar,
        isExpanded && styles.statusBarExpanded,
        {
          backgroundColor: alpha(primaryItem.accentColor, isExpanded ? '18' : '0F'),
          borderColor: alpha(primaryItem.accentColor, isExpanded ? '45' : '2E'),
        },
      ]}>
      <View style={styles.statusBarHeader}>
        <View
          style={[
            styles.statusBarIcon,
            {
              borderColor: alpha(primaryItem.accentColor, '45'),
              backgroundColor: alpha(primaryItem.accentColor, '14'),
            },
          ]}>
          <MaterialCommunityIcons name="cloud-alert" size={15} color={primaryItem.textColor} />
        </View>
        <Text style={[styles.statusBarMode, { color: primaryItem.textColor }]} numberOfLines={1}>
          {primaryItem.modeLabel}
        </Text>
        <Text style={styles.statusBarDivider}>/</Text>
        <Text style={styles.statusBarReason} numberOfLines={1}>
          {primaryItem.label}
        </Text>
        <MaterialCommunityIcons
          name={isExpanded ? 'chevron-up' : 'information-outline'}
          size={16}
          color={primaryItem.textColor}
        />
      </View>

      {isExpanded ? (
        <View style={styles.statusBarBody}>
          <Text style={styles.statusBarDetail}>{primaryItem.detail}</Text>
          <View style={styles.statusBarFooter}>
            {primaryItem.meta ? <Text style={styles.statusBarMeta}>{primaryItem.meta}</Text> : null}
            {primaryItem.actionLabel && primaryItem.onAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={primaryItem.actionLabel}
                hitSlop={8}
                onPress={event => {
                  event.stopPropagation();
                  primaryItem.onAction?.();
                }}
                style={[
                  styles.statusBarAction,
                  { borderColor: alpha(primaryItem.accentColor, '55') },
                ]}>
                <MaterialCommunityIcons name="refresh" size={14} color={primaryItem.textColor} />
                <Text style={[styles.statusBarActionText, { color: primaryItem.textColor }]}>
                  {primaryItem.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    statusBar: {
      marginHorizontal: 20,
      marginTop: 8,
      marginBottom: 2,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
    },
    statusBarExpanded: { borderRadius: 16 },
    statusBarHeader: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      gap: 8,
    },
    statusBarIcon: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    statusBarMode: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      letterSpacing: 0.2,
      flexShrink: 0,
    },
    statusBarDivider: { color: C.textFaint, fontSize: 11, fontWeight: '800' },
    statusBarReason: {
      flex: 1,
      minWidth: 0,
      color: C.textDim,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
    statusBarBody: {
      borderTopWidth: 1,
      borderTopColor: C.border,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      gap: 10,
    },
    statusBarDetail: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    statusBarFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    statusBarMeta: { color: C.textFaint, fontSize: 10, flex: 1 },
    statusBarAction: {
      minHeight: 30,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: alpha(C.surfaceHigh, 'AA'),
      flexShrink: 0,
    },
    statusBarActionText: { fontSize: 11, fontWeight: '800' },
  });
}

function useStyles(colors: AppColors) {
  return useMemo(() => createStyles(colors), [colors]);
}
