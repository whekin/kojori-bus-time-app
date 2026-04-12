import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { KOJORI_BOUNDS } from '@/services/ttc';

type Permission = 'unknown' | 'granted' | 'denied';
type LocationMode = 'kojori' | 'tbilisi' | null; // null = permission denied / not yet known

export function useLocation() {
  const [permission, setPermission] = useState<Permission>('unknown');
  const [detectedMode, setDetectedMode] = useState<LocationMode>(null);

  useEffect(() => {
    let cancelled = false;

    async function detect() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== 'granted') {
        setPermission('denied');
        return;
      }

      setPermission('granted');

      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;

        const { latitude: lat, longitude: lon } = loc.coords;
        const inKojori =
          lat >= KOJORI_BOUNDS.latMin &&
          lat <= KOJORI_BOUNDS.latMax &&
          lon >= KOJORI_BOUNDS.lonMin &&
          lon <= KOJORI_BOUNDS.lonMax;

        setDetectedMode(inKojori ? 'kojori' : 'tbilisi');
      } catch {
        // Location fetch failed — leave detectedMode null, let user toggle manually
      }
    }

    detect();
    return () => { cancelled = true; };
  }, []);

  return { permission, detectedMode };
}
