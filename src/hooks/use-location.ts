import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { KOJORI_BOUNDS } from '@/services/ttc';

type Permission = 'unknown' | 'granted' | 'denied';
type LocationMode = 'kojori' | 'tbilisi' | null; // null = permission denied / not yet known

export function useLocation() {
  const [permission, setPermission] = useState<Permission>('unknown');
  const [detectedMode, setDetectedMode] = useState<LocationMode>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const detectCurrentMode = useCallback(async () => {
    setIsLocating(true);
    setLocationError(null);

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude: lat, longitude: lon } = loc.coords;
      const inKojori =
        lat >= KOJORI_BOUNDS.latMin &&
        lat <= KOJORI_BOUNDS.latMax &&
        lon >= KOJORI_BOUNDS.lonMin &&
        lon <= KOJORI_BOUNDS.lonMax;

      setDetectedMode(inKojori ? 'kojori' : 'tbilisi');
      return true;
    } catch {
      setDetectedMode(null);
      setLocationError('Could not determine your location.');
      return false;
    } finally {
      setIsLocating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydratePermission() {
      const { status, canAskAgain: nextCanAskAgain } =
        await Location.getForegroundPermissionsAsync();
      if (cancelled) return;

      setCanAskAgain(nextCanAskAgain);

      if (status === 'granted') {
        setPermission('granted');
        void detectCurrentMode();
        return;
      }

      setPermission(status === 'denied' ? 'denied' : 'unknown');
    }

    void hydratePermission();
    return () => { cancelled = true; };
  }, [detectCurrentMode]);

  const requestLocationAccess = useCallback(async () => {
    setLocationError(null);

    const { status, canAskAgain: nextCanAskAgain } =
      await Location.requestForegroundPermissionsAsync();

    setCanAskAgain(nextCanAskAgain);

    if (status !== 'granted') {
      setPermission('denied');
      setDetectedMode(null);
      return false;
    }

    setPermission('granted');
    return detectCurrentMode();
  }, [detectCurrentMode]);

  const refreshLocation = useCallback(async () => {
    if (permission !== 'granted') return false;
    return detectCurrentMode();
  }, [detectCurrentMode, permission]);

  return {
    permission,
    detectedMode,
    canAskAgain,
    isLocating,
    locationError,
    requestLocationAccess,
    refreshLocation,
  };
}
