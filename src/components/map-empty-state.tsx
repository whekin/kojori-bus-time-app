import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, BottomTabInset, Fonts } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useTransitCopy } from '@/transit/copy';
import { useFavorites } from '@/transit/favorites';
import { useTripUi } from '@/transit/trip-ui';
import { createThemedStyles } from '@/utils/themed-styles';

/** Shown on the map tab when no trip is selected. */
export function MapEmptyState() {
  const colors = useAppColors();
  const styles = getStyles(colors);
  const copy = useTransitCopy();
  const insets = useSafeAreaInsets();
  const { state } = useFavorites();
  const { openEditor, openPicker } = useTripUi();
  const hasTrips = state.favorites.length > 0;
  const label = hasTrips ? copy('selectFavorite') : copy('add');

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + BottomTabInset + 24 },
      ]}>
      <View style={styles.content}>
        <View style={[styles.iconWrap, { backgroundColor: alpha(colors.primary, '14') }]}>
          <MaterialCommunityIcons name="map-marker-path" size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>{copy('mapEmptyTitle')}</Text>
        <Text style={styles.note}>{copy('mapEmptyNote')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => (hasTrips ? openPicker() : openEditor())}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <MaterialCommunityIcons
            name={hasTrips ? 'format-list-bulleted' : 'plus'}
            size={18}
            color={colors.bg}
          />
          <Text style={[styles.buttonText, { color: colors.bg }]}>{label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = createThemedStyles((C: ReturnType<typeof useAppColors>) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    content: {
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      gap: 12,
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    title: {
      color: C.text,
      fontFamily: Fonts.serif,
      fontSize: 26,
      lineHeight: 32,
      textAlign: 'center',
    },
    note: {
      color: C.textDim,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    button: {
      marginTop: 12,
      minHeight: 46,
      paddingHorizontal: 20,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '800',
    },
  }),
);
