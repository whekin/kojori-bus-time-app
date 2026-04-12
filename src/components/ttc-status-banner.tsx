import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTtcHealth } from '@/hooks/use-ttc-health';

const C = {
  bg: '#09090B',
  amber: '#F59E0B',
  red: '#EF4444',
  sand: '#FDE68A',
  rose: '#FECACA',
  border: '#1E2430',
} as const;

export function TtcStatusBanner() {
  const queryClient = useQueryClient();
  const { status, lastSuccessAt } = useTtcHealth();

  if (status === 'healthy') return null;

  const isOffline = status === 'offline';
  const accent = isOffline ? C.red : C.amber;
  const textColor = isOffline ? C.rose : C.sand;
  const label = isOffline ? 'TTC offline' : 'TTC unstable';
  const message = isOffline
    ? 'Can’t reach TTC right now. Showing cached data when available.'
    : 'TTC requests are failing intermittently. Some data may be stale.';

  const freshness = lastSuccessAt
    ? `Last TTC update ${new Date(lastSuccessAt).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
    : 'No TTC response yet this session';

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: accent + '14',
          borderColor: accent + '42',
        },
      ]}>
      <View style={styles.main}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: textColor }]}>{label}</Text>
          <Text style={[styles.message, { color: textColor }]}>{message}</Text>
          <Text style={styles.freshness}>{freshness}</Text>
        </View>
      </View>
      <Pressable
        style={[styles.retryButton, { borderColor: accent + '55' }]}
        onPress={() => {
          queryClient.refetchQueries({
            predicate: query => query.meta?.source === 'ttc' && query.getObserversCount() > 0,
          });
        }}>
        <MaterialCommunityIcons name="refresh" size={16} color={textColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  copy: { flex: 1 },
  title: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  message: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  freshness: { color: '#7A8290', fontSize: 11, marginTop: 4 },
  retryButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg + '33',
  },
});
