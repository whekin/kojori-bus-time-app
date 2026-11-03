import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useTransitCopy } from '@/transit/copy';
import type { TransitCopyKey } from '@/transit/copy-values';
import { useFavorites } from '@/transit/favorites';
import {
  reverseTrip,
  tripRoutes,
  tripStopId,
  tripStops,
  type Favorite,
} from '@/transit/model';
import { useTripUi } from '@/transit/trip-ui';
import { routeColor, transitModeIcon, tripAccent, useFavoriteTitle } from '@/transit/ui';
import { createThemedStyles } from '@/utils/themed-styles';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const UNDO_WINDOW_MS = 6000;

type Removed = { trip: Favorite; index: number; title: string };

const getStyles = createThemedStyles(createStyles);

/** Russian needs three plural forms; English and Georgian only pick one/other. */
export function tripCountKey(count: number, language: 'en' | 'ka' | 'ru'): TransitCopyKey {
  const n = Math.abs(Math.trunc(count));
  if (language === 'ru') {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'tripsCountOne';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'tripsCountFew';
    return 'tripsCountMany';
  }
  return n === 1 ? 'tripsCountOne' : 'tripsCountMany';
}

/** "3 trips", pluralised for the app language. */
export function useTripCountLabel() {
  const copy = useTransitCopy();
  const { resolvedLanguage } = useI18n();
  return (count: number) => copy(tripCountKey(count, resolvedLanguage), { count });
}

/**
 * Saved trips in the settings card style: tap to edit, reorder, delete with
 * undo, and a shortcut to add the way back when a trip has none yet.
 */
export function SettingsTripsCard() {
  const colors = useAppColors();
  const styles = getStyles(colors);
  const copy = useTransitCopy();
  const { formatCount, localizedStopName } = useI18n();
  const favoriteTitle = useFavoriteTitle();
  const { openEditor } = useTripUi();
  const { state, remove, restore, move } = useFavorites();
  const [removed, setRemoved] = useState<Removed | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trips = state.favorites;

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  function handleRemove(trip: Favorite, index: number) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setRemoved({ trip, index, title: favoriteTitle(trip) });
    remove(trip.id);
    undoTimerRef.current = setTimeout(() => setRemoved(null), UNDO_WINDOW_MS);
  }

  function handleUndo() {
    if (!removed) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    restore(removed.trip, Math.min(removed.index, trips.length));
    setRemoved(null);
  }

  const undoIndex = removed ? Math.min(removed.index, trips.length) : -1;
  const rows: React.ReactNode[] = trips.map((trip, index) => {
    const title = favoriteTitle(trip);
    const accent = tripAccent(trip, colors);
    const stops = tripStops(trip);
    const activeStop = stops.find(stop => stop.id === tripStopId(trip)) ?? stops[0];
    const stopLabel = activeStop ? localizedStopName(activeStop) : '';
    const stopDetail = stops.length > 1
      ? `${stopLabel} · ${formatCount('stops', stops.length)}`
      : stopLabel;
    const routes = tripRoutes(trip);
    const canAddReturn = !reverseTrip(trip, trips);
    const isFirst = index === 0;
    const isLast = index === trips.length - 1;

    return (
      <View key={trip.id} testID={`settings-trip-${trip.id}`}>
        <View style={styles.tripRow}>
          <View style={[styles.tripRail, { backgroundColor: accent }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('tripsEdit', { title })}
            accessibilityHint={stopDetail}
            onPress={() => openEditor({ id: trip.id })}
            style={({ pressed }) => [styles.tripMain, pressed && { backgroundColor: colors.panel }]}>
            <View style={styles.badgeRow}>
              {routes.map(route => {
                const color = routeColor(route.id, colors, trip);
                return (
                  <View
                    key={route.id}
                    style={[styles.badge, { borderColor: color, backgroundColor: alpha(color, '10') }]}>
                    {route.mode !== 'BUS' ? (
                      <MaterialCommunityIcons name={transitModeIcon(route.mode)} size={12} color={color} />
                    ) : null}
                    <Text style={[styles.badgeText, { color }]}>{route.shortName}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.tripTitle} numberOfLines={2}>{title}</Text>
            {stopDetail ? (
              <View style={styles.stopLine}>
                <MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.textFaint} />
                <Text style={styles.stopText} numberOfLines={1}>{stopDetail}</Text>
              </View>
            ) : null}
          </Pressable>
          <View style={styles.controls}>
            {trips.length > 1 ? (
              <View style={styles.reorder}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy('tripsMoveUp', { title })}
                  accessibilityState={{ disabled: isFirst }}
                  disabled={isFirst}
                  hitSlop={4}
                  onPress={() => move(trip.id, -1)}
                  style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.panel }]}>
                  <MaterialCommunityIcons
                    name="chevron-up"
                    size={20}
                    color={isFirst ? colors.border : colors.textDim}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy('tripsMoveDown', { title })}
                  accessibilityState={{ disabled: isLast }}
                  disabled={isLast}
                  hitSlop={4}
                  onPress={() => move(trip.id, 1)}
                  style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.panel }]}>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={20}
                    color={isLast ? colors.border : colors.textDim}
                  />
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy('tripsDelete', { title })}
              hitSlop={4}
              onPress={() => handleRemove(trip, index)}
              style={({ pressed }) => [
                styles.iconButton,
                styles.deleteButton,
                pressed && { backgroundColor: alpha(colors.error, '12') },
              ]}>
              <MaterialCommunityIcons name="trash-can-outline" size={19} color={colors.textFaint} />
            </Pressable>
          </View>
        </View>
        {canAddReturn ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy('tripReturnAdd')}: ${title}`}
            onPress={() => openEditor({ reverseOf: trip.id })}
            style={({ pressed }) => [styles.returnAction, pressed && { opacity: 0.6 }]}>
            <MaterialCommunityIcons name="swap-horizontal" size={15} color={accent} />
            <Text style={[styles.returnActionText, { color: accent }]}>{copy('tripReturnAdd')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  });

  if (removed) {
    rows.splice(
      undoIndex,
      0,
      <View
        key={`removed-${removed.trip.id}`}
        accessibilityLiveRegion="polite"
        style={[styles.undoRow, { backgroundColor: alpha(colors.warning, '0E') }]}>
        <Text style={styles.undoText} numberOfLines={2}>
          {copy('tripsRemoved', { title: removed.title })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy('undo')}
          hitSlop={8}
          onPress={handleUndo}
          style={({ pressed }) => [
            styles.undoButton,
            { borderColor: alpha(colors.primary, '42'), backgroundColor: alpha(colors.primary, pressed ? '18' : '0D') },
          ]}>
          <MaterialCommunityIcons name="undo-variant" size={15} color={colors.primary} />
          <Text style={[styles.undoButtonText, { color: colors.primary }]}>{copy('undo')}</Text>
        </Pressable>
      </View>,
    );
  }

  return (
    <View style={styles.card}>
      {rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{copy('tripsEmpty')}</Text>
          <Text style={styles.emptyNote}>{copy('tripsEmptyNote')}</Text>
        </View>
      ) : (
        rows.map((row, index) => (
          <React.Fragment key={(row as React.ReactElement).key ?? index}>
            {index > 0 ? <View style={styles.itemDivider} /> : null}
            {row}
          </React.Fragment>
        ))
      )}
      <View style={styles.itemDivider} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy('tripAdd')}
        testID="settings-trip-add"
        onPress={() => openEditor()}
        style={({ pressed }) => [styles.addButton, pressed && { backgroundColor: colors.panel }]}>
        <MaterialCommunityIcons name="plus" size={18} color={colors.primary} />
        <Text style={[styles.addButtonText, { color: colors.primary }]}>{copy('tripAdd')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
    itemDivider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
    tripRow: { flexDirection: 'row', alignItems: 'stretch' },
    tripRail: { width: 4, marginVertical: 14, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
    tripMain: { flex: 1, minWidth: 0, paddingLeft: 13, paddingRight: 8, paddingVertical: 14, gap: 6 },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderWidth: 1.5,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: { fontSize: 12, fontWeight: '700', fontFamily: MONO },
    tripTitle: { color: C.text, fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: -0.2 },
    stopLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stopText: { flex: 1, color: C.textDim, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    controls: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, gap: 2 },
    reorder: { alignItems: 'center', gap: 2 },
    iconButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    deleteButton: { marginLeft: 2 },
    returnAction: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginLeft: 17,
      marginTop: -6,
      paddingVertical: 8,
      paddingRight: 12,
      marginBottom: 6,
    },
    returnActionText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
    undoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 17,
      paddingRight: 12,
      paddingVertical: 14,
    },
    undoText: { flex: 1, color: C.textDim, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    undoButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    undoButtonText: { fontSize: 13, fontWeight: '800' },
    emptyState: { paddingHorizontal: 18, paddingVertical: 18, gap: 5 },
    emptyTitle: { color: C.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
    emptyNote: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    addButtonText: { fontSize: 14, fontWeight: '600' },
  });
}
