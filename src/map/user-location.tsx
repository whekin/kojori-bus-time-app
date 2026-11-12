import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GeoMarker } from './geo-map';
import type { LngLat } from './projection';

const USER_BLUE = '#3B82F6';

/**
 * Follows the rider while `enabled`, without ever prompting: permission is
 * asked for by an explicit "locate me" press elsewhere.
 */
export function useWatchedPosition(enabled: boolean) {
  const [position, setPosition] = useState<LngLat | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | undefined;

    Location.getForegroundPermissionsAsync()
      .then(async permission => {
        if (cancelled || permission.status !== 'granted') return;
        const next = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5_000 },
          update => setPosition([update.coords.longitude, update.coords.latitude]),
        );
        if (cancelled) next.remove();
        else subscription = next;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return enabled ? position : null;
}

export function UserLocationMarker({ coordinate, size = 22 }: { coordinate: LngLat; size?: number }) {
  return (
    <GeoMarker coordinate={coordinate} zIndex={40}>
      <View
        pointerEvents="none"
        style={[styles.halo, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={styles.dot} />
      </View>
    </GeoMarker>
  );
}

const styles = StyleSheet.create({
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${USER_BLUE}33`,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: USER_BLUE,
  },
});
