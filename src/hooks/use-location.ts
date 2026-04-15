import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { KOJORI_BOUNDS } from '@/services/ttc';

type Permission = 'unknown' | 'granted' | 'denied';
type LocationMode = 'kojori' | 'tbilisi' | null; // null = permission denied / not yet known
type LocationAccessResult = 'granted' | 'denied' | 'blocked' | 'error';
type CachedLocation = {
  latitude: number;
  longitude: number;
  mode: Exclude<LocationMode, null>;
  timestamp: number;
  lastAttemptAt?: number;
};

const LOCATION_CACHE_KEY = '@kojori_last_location_v1';
const FRESH_LOCATION_TTL_MS = 30 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 3000;
const STARTUP_QUERY_DELAY_MS = 300;
const LIVE_QUERY_COOLDOWN_MS = 6000;

function getModeFromCoords(latitude: number, longitude: number): Exclude<LocationMode, null> {
  const inKojori =
    latitude >= KOJORI_BOUNDS.latMin &&
    latitude <= KOJORI_BOUNDS.latMax &&
    longitude >= KOJORI_BOUNDS.lonMin &&
    longitude <= KOJORI_BOUNDS.lonMax;

  return inKojori ? 'kojori' : 'tbilisi';
}

function isFreshCachedLocation(cached: CachedLocation | null, now = Date.now()) {
  return Boolean(cached && now - cached.timestamp <= FRESH_LOCATION_TTL_MS);
}

async function readCachedLocation(): Promise<CachedLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedLocation;
  } catch {
    return null;
  }
}

async function writeCachedLocation(location: CachedLocation) {
  try {
    await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location));
  } catch {}
}

async function markLocationAttempt(cached: CachedLocation | null) {
  await writeCachedLocation({
    latitude: cached?.latitude ?? 0,
    longitude: cached?.longitude ?? 0,
    mode: cached?.mode ?? 'tbilisi',
    timestamp: cached?.timestamp ?? 0,
    lastAttemptAt: Date.now(),
  });
}

function shouldCooldownLiveQuery(cached: CachedLocation | null, now = Date.now()) {
  return Boolean(cached?.lastAttemptAt && now - cached.lastAttemptAt < LIVE_QUERY_COOLDOWN_MS);
}

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export function useLocation(enabled = true) {
  const [permission, setPermission] = useState<Permission>('unknown');
  const [detectedMode, setDetectedMode] = useState<LocationMode>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const detectCurrentMode = useCallback(async (options?: { allowFreshCache?: boolean; startupDelayMs?: number }) => {
    setIsLocating(true);
    setLocationError(null);

    try {
      const cached = await readCachedLocation();

      if (options?.allowFreshCache && cached && isFreshCachedLocation(cached)) {
        setDetectedMode(cached.mode);
        return true;
      }

      if (cached && shouldCooldownLiveQuery(cached) && isFreshCachedLocation(cached)) {
        setDetectedMode(cached.mode);
        return true;
      }

      if ((options?.startupDelayMs ?? 0) > 0) {
        await delay(options?.startupDelayMs ?? 0);
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: FRESH_LOCATION_TTL_MS,
        requiredAccuracy: 1000,
      });

      if (lastKnown) {
        const mode = getModeFromCoords(lastKnown.coords.latitude, lastKnown.coords.longitude);
        setDetectedMode(mode);
        void writeCachedLocation({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          mode,
          timestamp: lastKnown.timestamp || Date.now(),
        });
        return true;
      }

      await markLocationAttempt(cached);

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Location timeout')), LOCATION_TIMEOUT_MS)
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

      const mode = getModeFromCoords(loc.coords.latitude, loc.coords.longitude);
      setDetectedMode(mode);
      void writeCachedLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        mode,
        timestamp: loc.timestamp || Date.now(),
      });
      return true;
    } catch (error) {
      const cached = await readCachedLocation();
      if (cached && isFreshCachedLocation(cached)) {
        setDetectedMode(cached.mode);
        setLocationError(null);
        return true;
      }

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
        void detectCurrentMode({ allowFreshCache: true, startupDelayMs: STARTUP_QUERY_DELAY_MS });
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
        await detectCurrentMode({ allowFreshCache: true, startupDelayMs: STARTUP_QUERY_DELAY_MS });
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
