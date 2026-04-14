import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useTtcHealth } from '@/hooks/use-ttc-health';

function useStyles() {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return { colors, styles };
}

export function TtcStatusBanner() {
  return <TtcStatusBannerBase compact={false} centered />;
}

export function TtcStatusChip() {
  return <TtcStatusBannerBase compact centered />;
}

export function TtcStatusHeaderBadge() {
  return <TtcStatusBannerBase compact centered headerInline />;
}

function TtcStatusBannerBase({
  compact,
  centered,
  headerInline = false,
}: {
  compact: boolean;
  centered: boolean;
  headerInline?: boolean;
}) {
  const { colors, styles } = useStyles();
  const queryClient = useQueryClient();
  const { status, lastSuccessAt } = useTtcHealth();
  const [expanded, setExpanded] = useState(false);

  if (status === 'healthy') return null;

  const isOffline = status === 'offline';
  const isRateLimited = status === 'rate-limited';
  const accent = isOffline || isRateLimited ? colors.error : colors.warning;
  const textColor = isOffline || isRateLimited ? colors.rose : colors.sand;
  const label = isRateLimited ? 'Rate limited' : isOffline ? 'TTC offline' : 'TTC unstable';
  const message = isRateLimited
    ? 'TTC rate limiter hit. Requests are being throttled. Showing cached data when available.'
    : isOffline
    ? 'Cannot reach TTC right now. Showing cached data when available.'
    : 'TTC requests are failing intermittently. Some data may be stale.';

  const freshness = lastSuccessAt
    ? `Last TTC update ${new Date(lastSuccessAt).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
    : 'No TTC response yet this session';

  return (
    <View style={[headerInline ? styles.headerWrap : centered ? styles.centerWrap : styles.rowWrap]}>
      <Pressable
        onPress={() => setExpanded(current => !current)}
        style={[
          styles.badge,
          compact && styles.badgeCompact,
          {
            backgroundColor: alpha(accent, '14'),
            borderColor: alpha(accent, '42'),
          },
        ]}>
        <View style={styles.badgeMain}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text style={[styles.badgeLabel, { color: textColor }]}>{label}</Text>
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={textColor} />
        </View>
      </Pressable>

      {expanded ? (
        <View
          style={[
            styles.details,
            compact && styles.detailsCompact,
            {
              backgroundColor: colors.panel,
              borderColor: alpha(accent, '42'),
            },
          ]}>
          <Text style={[styles.message, { color: textColor }]}>{message}</Text>
          <View style={styles.detailsFooter}>
            <Text style={styles.freshness}>{freshness}</Text>
            <Pressable
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
    badgeMain: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    badgeLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.35 },
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
