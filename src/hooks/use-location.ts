import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

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
// Cache seeds UI instantly but never substitutes for a fresh fetch on open/foreground.
const FRESH_LOCATION_TTL_MS = 15 * 60 * 1000;
const LOCATION_TIMEOUT_MS = 2000;
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

function remainingTimeMs(startedAt: number) {
  return Math.max(1, LOCATION_TIMEOUT_MS - (Date.now() - startedAt));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Location timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function useLocation(enabled = true) {
  const [permission, setPermission] = useState<Permission>('unknown');
  const [detectedMode, setDetectedMode] = useState<LocationMode>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const detectCurrentMode = useCallback(async (options?: { startupDelayMs?: number }) => {
    setLocationError(null);
    const startedAt = Date.now();

    try {
      const cached = await readCachedLocation();
      const cacheFresh = Boolean(cached && isFreshCachedLocation(cached));

      // Seed UI from fresh cache immediately — user sees a direction without waiting.
      if (cached && cacheFresh) {
        setDetectedMode(cached.mode);
      }

      // Prevent rapid back-to-back fetches (e.g. tap refresh twice, foreground churn).
      if (cached && shouldCooldownLiveQuery(cached)) {
        return cacheFresh;
      }

      setIsLocating(true);

      if ((options?.startupDelayMs ?? 0) > 0) {
        const delayMs = Math.min(options?.startupDelayMs ?? 0, remainingTimeMs(startedAt));
        await delay(delayMs);
      }

      // Mark the attempt now so concurrent calls hit the cooldown guard above.
      await markLocationAttempt(cached);

      const lastKnown = await withTimeout(
        Location.getLastKnownPositionAsync({
          maxAge: FRESH_LOCATION_TTL_MS,
          requiredAccuracy: 1000,
        }),
        remainingTimeMs(startedAt),
      );

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

      const loc = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        remainingTimeMs(startedAt),
      );

      if (!loc) {
        if (!cacheFresh) {
          setDetectedMode(null);
          setLocationError('Location check timed out.');
        }
        return cacheFresh;
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
        void detectCurrentMode({ startupDelayMs: STARTUP_QUERY_DELAY_MS });
        return;
      }

      setPermission(status === 'denied' ? 'denied' : 'unknown');
    }

    void hydratePermission();
    return () => { cancelled = true; };
  }, [detectCurrentMode, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const sub = AppState.addEventListener('change', async state => {
      if (state !== 'active') return;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      // Always recheck on foreground — cooldown inside detectCurrentMode prevents thrash.
      void detectCurrentMode();
    });

    return () => sub.remove();
  }, [detectCurrentMode, enabled]);

  const requestLocationAccess = useCallback(async () => {
    setLocationError(null);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      setCanAskAgain(currentPermission.canAskAgain);

      if (currentPermission.status === 'granted') {
        setPermission('granted');
        await detectCurrentMode({ startupDelayMs: STARTUP_QUERY_DELAY_MS });
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

  // detectedMode = where the user currently is.
  // suggestedMode = where they most likely want to go (the opposite side).
  const suggestedMode: LocationMode =
    detectedMode === 'kojori' ? 'tbilisi' : detectedMode === 'tbilisi' ? 'kojori' : null;

  return {
    permission,
    detectedMode,
    suggestedMode,
    canAskAgain,
    isLocating,
    locationError,
    requestLocationAccess,
    refreshLocation,
  };
}
