import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useEffectiveTtcHealth } from '@/hooks/use-effective-ttc-health';
import { useI18n } from '@/hooks/use-i18n';

function useStyles() {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return { colors, styles };
}

export function TtcStatusBanner() {
  return <TtcStatusBannerBase compact={false} centered />;
}

export function TtcStatusChip({ constrained = false }: { constrained?: boolean }) {
  return <TtcStatusBannerBase compact centered constrained={constrained} />;
}

export function TtcStatusHeaderBadge() {
  return <TtcStatusBannerBase compact centered headerInline />;
}

function TtcStatusBannerBase({
  compact,
  centered,
  headerInline = false,
  constrained = false,
}: {
  compact: boolean;
  centered: boolean;
  headerInline?: boolean;
  constrained?: boolean;
}) {
  const { colors, styles } = useStyles();
  const { t, formatRelativeDuration } = useI18n();
  const queryClient = useQueryClient();
  const { status, lastSuccessAt } = useEffectiveTtcHealth();
  const [expanded, setExpanded] = useState(false);

  if (status === 'healthy') return null;

  const isOffline = status === 'offline';
  const isDeviceOffline = status === 'device-offline';
  const isRateLimited = status === 'rate-limited';
  const isSevere = isOffline || isRateLimited || isDeviceOffline;
  const accent = isSevere ? colors.error : colors.warning;
  const textColor = isSevere ? colors.rose : colors.sand;

  const timeAgo = lastSuccessAt
    ? (() => {
        const mins = Math.floor((Date.now() - lastSuccessAt) / 60000);
        if (mins < 1) return t('ttcJustNow');
        if (mins < 60) return formatRelativeDuration('past', 'minute', mins);
        const hours = Math.floor(mins / 60);
        return formatRelativeDuration('past', 'hour', hours);
      })()
    : null;

  const baseLabel = isRateLimited
    ? t('ttcRateLimited')
    : isDeviceOffline
      ? t('ttcDeviceOffline')
      : isOffline
        ? t('ttcOffline')
        : t('ttcUnstable');

  const label = constrained ? baseLabel : timeAgo ? `${baseLabel} · ${timeAgo}` : baseLabel;

  const message = isRateLimited
    ? t('ttcRateDetail')
    : isDeviceOffline
      ? t('ttcDeviceOfflineDetail')
      : isOffline
        ? t('ttcOfflineDetail')
        : t('ttcUnstableDetail');

  const freshness = lastSuccessAt
    ? t('ttcLastUpdate', { time: new Date(lastSuccessAt).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    }) })
    : t('ttcNoResponse');

  return (
    <View
      style={[
        headerInline ? styles.headerWrap : centered ? styles.centerWrap : styles.rowWrap,
        constrained && styles.centerWrapConstrained,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${expanded ? t('ttcStatusCollapse') : t('ttcStatusExpand')}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(current => !current)}
        style={[
          styles.badge,
          compact && styles.badgeCompact,
          constrained && styles.badgeConstrained,
          {
            backgroundColor: alpha(accent, '14'),
            borderColor: alpha(accent, '42'),
          },
        ]}>
        <View style={styles.badgeMain}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.badgeLabel, { color: textColor }]} numberOfLines={1}>
            {label}
          </Text>
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={textColor} />
        </View>
      </Pressable>

      {expanded ? (
        <View
          style={[
            styles.details,
            compact && styles.detailsCompact,
            constrained && styles.detailsConstrained,
            {
              backgroundColor: colors.panel,
              borderColor: alpha(accent, '42'),
            },
          ]}>
          <Text style={[styles.message, { color: textColor }]}>{message}</Text>
          <View style={styles.detailsFooter}>
            <Text style={styles.freshness}>{freshness}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('ttcStatusRefresh')}
              style={[styles.retryButton, { borderColor: alpha(accent, '55') }]}
              onPress={() => {
                queryClient.refetchQueries({
                  predicate: query => query.meta?.source === 'ttc' && query.getObserversCount() > 0,
                });
              }}>
              <MaterialCommunityIcons name="refresh" size={16} color={textColor} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    headerWrap: {
      position: 'relative',
      flexShrink: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      zIndex: 30,
    },
    rowWrap: {
      position: 'relative',
      marginHorizontal: 20,
      marginBottom: 8,
      zIndex: 20,
    },
    centerWrap: {
      position: 'relative',
      alignItems: 'center',
      marginHorizontal: 0,
      marginBottom: 0,
      zIndex: 20,
    },
    centerWrapConstrained: {
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '100%',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      minHeight: 34,
    },
    badgeCompact: {
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    badgeConstrained: {
      maxWidth: '100%',
    },
    badgeMain: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    badgeLabel: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.35,
    },
    details: {
      position: 'absolute',
      top: 42,
      alignSelf: 'center',
      minWidth: 250,
      maxWidth: 360,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    detailsCompact: { maxWidth: 300 },
    detailsConstrained: { right: 0 },
    message: { fontSize: 11, lineHeight: 15, marginTop: 1 },
    detailsFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 8,
    },
    freshness: { color: C.textDim, fontSize: 10, flex: 1 },
    retryButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(C.bg, '33'),
    },
  });
}
