import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { KOJORI_BOUNDS } from '@/services/ttc';

type Permission = 'unknown' | 'granted' | 'denied';
type LocationMode = 'kojori' | 'tbilisi' | null; // null = permission denied / not yet known
type LocationAccessResult = 'granted' | 'denied' | 'blocked' | 'error';

export function useLocation(enabled = true) {
  const [permission, setPermission] = useState<Permission>('unknown');
  const [detectedMode, setDetectedMode] = useState<LocationMode>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const detectCurrentMode = useCallback(async () => {
    setIsLocating(true);
    setLocationError(null);

    try {
      // Add 3 second timeout for location detection
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Location timeout')), 3000)
      );

      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const loc = await Promise.race([locationPromise, timeoutPromise]);

      if (!loc) {
        // Timeout occurred
        setDetectedMode(null);
        setLocationError('Location check timed out.');
        return false;
      }

      const { latitude: lat, longitude: lon } = loc.coords;
      const inKojori =
        lat >= KOJORI_BOUNDS.latMin &&
        lat <= KOJORI_BOUNDS.latMax &&
        lon >= KOJORI_BOUNDS.lonMin &&
        lon <= KOJORI_BOUNDS.lonMax;

      setDetectedMode(inKojori ? 'kojori' : 'tbilisi');
      return true;
    } catch (error) {
      setDetectedMode(null);
      const isTimeout = error instanceof Error && error.message === 'Location timeout';
      setLocationError(isTimeout ? 'Location check timed out.' : 'Could not determine your location.');
      return false;
    } finally {
      setIsLocating(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLocating(false);
      setLocationError(null);
      setDetectedMode(null);
      return;
    }

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
  }, [detectCurrentMode, enabled]);

  const requestLocationAccess = useCallback(async () => {
    setLocationError(null);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      setCanAskAgain(currentPermission.canAskAgain);

      if (currentPermission.status === 'granted') {
        setPermission('granted');
        await detectCurrentMode();
        return 'granted' satisfies LocationAccessResult;
      }

      if (currentPermission.status === 'denied' && !currentPermission.canAskAgain) {
        setPermission('denied');
        setDetectedMode(null);
        return 'blocked' satisfies LocationAccessResult;
      }

      const { status, canAskAgain: nextCanAskAgain } =
        await Location.requestForegroundPermissionsAsync();

      setCanAskAgain(nextCanAskAgain);

      if (status !== 'granted') {
        setPermission('denied');
        setDetectedMode(null);
        return nextCanAskAgain ? 'denied' : 'blocked';
      }

      setPermission('granted');
      await detectCurrentMode();
      return 'granted';
    } catch {
      setDetectedMode(null);
      setLocationError('Could not determine your location.');
      return 'error';
    }
  }, [detectCurrentMode]);

  const refreshLocation = useCallback(async () => {
    if (!enabled) return false;
    if (permission !== 'granted') return false;
    return detectCurrentMode();
  }, [detectCurrentMode, enabled, permission]);

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
