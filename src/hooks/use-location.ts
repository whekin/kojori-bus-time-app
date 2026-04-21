import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ALL_KOJORI_STOPS, ALL_TBILISI_STOPS, type StopInfo } from '@/services/ttc';

type Permission = 'unknown' | 'granted' | 'denied';
type LocationMode = 'kojori' | 'tbilisi' | null; // null = permission denied / not yet known
type LocationAccessResult = 'granted' | 'denied' | 'blocked' | 'error';
type ResolvedLocation = {
  latitude: number;
  longitude: number;
  timestamp: number;
};
type LocationResolutionResult = {
  ok: boolean;
  detectedMode: LocationMode;
  suggestedMode: LocationMode;
  resolvedLocation: ResolvedLocation | null;
};
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
const MAX_CLASSIFICATION_DISTANCE_METERS = 25_000;
const MIN_CLASSIFICATION_GAP_METERS = 2_500;
const FRESH_LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;

type GeoStop = StopInfo & Required<Pick<StopInfo, 'lat' | 'lon'>>;

const KOJORI_LOCATION_STOPS = ALL_KOJORI_STOPS.filter(
  (stop): stop is GeoStop => typeof stop.lat === 'number' && typeof stop.lon === 'number',
);
const TBILISI_LOCATION_STOPS = ALL_TBILISI_STOPS.filter(
  (stop): stop is GeoStop => typeof stop.lat === 'number' && typeof stop.lon === 'number',
);

function distanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLon = toRadians(longitudeB - longitudeA);
  const latA = toRadians(latitudeA);
  const latB = toRadians(latitudeB);

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function nearestStopDistanceMeters(latitude: number, longitude: number, stops: GeoStop[]) {
  return Math.min(
    ...stops.map(stop => distanceMeters(latitude, longitude, stop.lat, stop.lon)),
  );
}

function getModeFromCoords(latitude: number, longitude: number): LocationMode {
  const kojoriDistance = nearestStopDistanceMeters(latitude, longitude, KOJORI_LOCATION_STOPS);
  const tbilisiDistance = nearestStopDistanceMeters(latitude, longitude, TBILISI_LOCATION_STOPS);
  const closestDistance = Math.min(kojoriDistance, tbilisiDistance);

  if (!Number.isFinite(closestDistance) || closestDistance > MAX_CLASSIFICATION_DISTANCE_METERS) {
    return null;
  }

  if (Math.abs(kojoriDistance - tbilisiDistance) < MIN_CLASSIFICATION_GAP_METERS) {
    return null;
  }

  return kojoriDistance < tbilisiDistance ? 'kojori' : 'tbilisi';
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

function isRecentTimestamp(timestamp: number | null | undefined, maxAgeMs: number) {
  if (!timestamp) return false;
  return Date.now() - timestamp <= maxAgeMs;
}

function getSuggestedMode(detectedMode: LocationMode): LocationMode {
  return detectedMode === 'kojori' ? 'tbilisi' : detectedMode === 'tbilisi' ? 'kojori' : null;
}

function createLocationResolutionResult(
  detectedMode: LocationMode,
  resolvedLocation: ResolvedLocation | null,
): LocationResolutionResult {
  return {
    ok: Boolean(detectedMode && resolvedLocation),
    detectedMode,
    suggestedMode: getSuggestedMode(detectedMode),
    resolvedLocation,
  };
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
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  const detectCurrentMode = useCallback(async (options?: { startupDelayMs?: number; forceFresh?: boolean }) => {
    const requestId = ++latestRequestIdRef.current;
    let didTimeout = false;
    const watchdogId = setTimeout(() => {
      if (latestRequestIdRef.current !== requestId) return;
      didTimeout = true;
      setIsLocating(false);
      setLocationError('Location check timed out.');
    }, LOCATION_TIMEOUT_MS);

    const isExpired = () => didTimeout || latestRequestIdRef.current !== requestId;

    setLocationError(null);
    const startedAt = Date.now();
    const forceFresh = Boolean(options?.forceFresh);

    try {
      const cached = await readCachedLocation();
      const cacheFresh = Boolean(cached && isFreshCachedLocation(cached));

      if (cached && cacheFresh && !forceFresh) {
        setDetectedMode(cached.mode);
        setResolvedLocation({
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        });
      } else if (forceFresh) {
        setDetectedMode(null);
        setResolvedLocation(null);
      }

      if (!forceFresh && cached && shouldCooldownLiveQuery(cached)) {
        if (!cacheFresh) {
          setLocationError('Location check timed out.');
          setIsLocating(false);
        }
        return cacheFresh
          ? createLocationResolutionResult(cached.mode, {
              latitude: cached.latitude,
              longitude: cached.longitude,
              timestamp: cached.timestamp,
            })
          : createLocationResolutionResult(null, null);
      }

      setIsLocating(true);

      if ((options?.startupDelayMs ?? 0) > 0) {
        const delayMs = Math.min(options?.startupDelayMs ?? 0, remainingTimeMs(startedAt));
        await delay(delayMs);
        if (isExpired()) return createLocationResolutionResult(null, null);
      }

      await markLocationAttempt(cached);
      if (isExpired()) return createLocationResolutionResult(null, null);

      let lastKnown: Location.LocationObject | null = null;
      let lastKnownMode: LocationMode = null;

      if (!forceFresh) {
        lastKnown = await withTimeout(
          Location.getLastKnownPositionAsync({
            maxAge: FRESH_LOCATION_TTL_MS,
            requiredAccuracy: 1000,
          }),
          remainingTimeMs(startedAt),
        );
        if (isExpired()) return createLocationResolutionResult(null, null);

        lastKnownMode = lastKnown
          ? getModeFromCoords(lastKnown.coords.latitude, lastKnown.coords.longitude)
          : null;

        if (lastKnown) {
          setResolvedLocation({
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            timestamp: lastKnown.timestamp || Date.now(),
          });

          if (lastKnownMode) {
            setDetectedMode(lastKnownMode);
            void writeCachedLocation({
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              mode: lastKnownMode,
              timestamp: lastKnown.timestamp || Date.now(),
            });
          }

          if (lastKnownMode && isRecentTimestamp(lastKnown.timestamp, FRESH_LAST_KNOWN_MAX_AGE_MS)) {
            return createLocationResolutionResult(lastKnownMode, {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              timestamp: lastKnown.timestamp || Date.now(),
            });
          }
        }
      }

      const loc = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        remainingTimeMs(startedAt),
      );
      if (isExpired()) return createLocationResolutionResult(null, null);

      if (!loc) {
        if (!forceFresh && (lastKnownMode || cacheFresh)) {
          if (lastKnownMode && lastKnown) {
            return createLocationResolutionResult(lastKnownMode, {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              timestamp: lastKnown.timestamp || Date.now(),
            });
          }

          if (cacheFresh && cached) {
            return createLocationResolutionResult(cached.mode, {
              latitude: cached.latitude,
              longitude: cached.longitude,
              timestamp: cached.timestamp,
            });
          }
        }

        setDetectedMode(null);
        setResolvedLocation(null);
        setLocationError('Location check timed out.');
        return createLocationResolutionResult(null, null);
      }

      const nextResolvedLocation = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp || Date.now(),
      };
      const mode = getModeFromCoords(loc.coords.latitude, loc.coords.longitude);
      setResolvedLocation(nextResolvedLocation);

      if (!mode) {
        if (!forceFresh && (lastKnownMode || cacheFresh)) {
          if (lastKnownMode && lastKnown) {
            return createLocationResolutionResult(lastKnownMode, {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
              timestamp: lastKnown.timestamp || Date.now(),
            });
          }

          if (cacheFresh && cached) {
            return createLocationResolutionResult(cached.mode, {
              latitude: cached.latitude,
              longitude: cached.longitude,
              timestamp: cached.timestamp,
            });
          }
        }

        setDetectedMode(null);
        setResolvedLocation(null);
        setLocationError('Could not confidently place you near Kojori or Tbilisi.');
        return createLocationResolutionResult(null, null);
      }

      setDetectedMode(mode);
      void writeCachedLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        mode,
        timestamp: loc.timestamp || Date.now(),
      });
      return createLocationResolutionResult(mode, nextResolvedLocation);
    } catch (error) {
      if (isExpired()) return createLocationResolutionResult(null, null);

      const cached = await readCachedLocation();
      if (!forceFresh && cached && isFreshCachedLocation(cached)) {
        setDetectedMode(cached.mode);
        setResolvedLocation({
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        });
        setLocationError(null);
        return createLocationResolutionResult(cached.mode, {
          latitude: cached.latitude,
          longitude: cached.longitude,
          timestamp: cached.timestamp,
        });
      }

      setDetectedMode(null);
      setResolvedLocation(null);
      const isTimeout = error instanceof Error && error.message === 'Location timeout';
      setLocationError(isTimeout ? 'Location check timed out.' : 'Could not determine your location.');
      return createLocationResolutionResult(null, null);
    } finally {
      clearTimeout(watchdogId);
      if (latestRequestIdRef.current === requestId && !didTimeout) {
        setIsLocating(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLocating(false);
      setLocationError(null);
      setDetectedMode(null);
      setResolvedLocation(null);
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
      setResolvedLocation(null);
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

  const requestLocationAccess = useCallback(async (options?: { forceFresh?: boolean }) => {
    setLocationError(null);
    const forceFresh = Boolean(options?.forceFresh);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      setCanAskAgain(currentPermission.canAskAgain);

      if (currentPermission.status === 'granted') {
        setPermission('granted');
        const result = await detectCurrentMode({
          startupDelayMs: forceFresh ? 0 : STARTUP_QUERY_DELAY_MS,
          forceFresh,
        });
        return result.ok ? ('granted' satisfies LocationAccessResult) : ('error' satisfies LocationAccessResult);
      }

      if (currentPermission.status === 'denied' && !currentPermission.canAskAgain) {
        setPermission('denied');
        setDetectedMode(null);
        setResolvedLocation(null);
        return 'blocked' satisfies LocationAccessResult;
      }

      const { status, canAskAgain: nextCanAskAgain } =
        await Location.requestForegroundPermissionsAsync();

      setCanAskAgain(nextCanAskAgain);

      if (status !== 'granted') {
        setPermission('denied');
        setDetectedMode(null);
        setResolvedLocation(null);
        return nextCanAskAgain ? 'denied' : 'blocked';
      }

      setPermission('granted');
      const result = await detectCurrentMode({ forceFresh });
      return result.ok ? 'granted' : 'error';
    } catch {
      setDetectedMode(null);
      setResolvedLocation(null);
      setLocationError('Could not determine your location.');
      return 'error';
    }
  }, [detectCurrentMode]);

  const refreshLocation = useCallback(async () => {
    if (!enabled) return false;
    if (permission !== 'granted') return false;
    const result = await detectCurrentMode();
    return result.ok;
  }, [detectCurrentMode, enabled, permission]);

  const refreshLocationFresh = useCallback(async () => {
    if (!enabled) return false;
    if (permission !== 'granted') return false;
    const result = await detectCurrentMode({ forceFresh: true });
    return result.ok;
  }, [detectCurrentMode, enabled, permission]);

  const requestLocationSelection = useCallback(async (options?: { forceFresh?: boolean }) => {
    const forceFresh = Boolean(options?.forceFresh);
    setLocationError(null);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      setCanAskAgain(currentPermission.canAskAgain);

      if (currentPermission.status === 'granted') {
        setPermission('granted');
        const result = await detectCurrentMode({
          startupDelayMs: forceFresh ? 0 : STARTUP_QUERY_DELAY_MS,
          forceFresh,
        });
        return {
          access: result.ok ? ('granted' satisfies LocationAccessResult) : ('error' satisfies LocationAccessResult),
          ...result,
        };
      }

      if (currentPermission.status === 'denied' && !currentPermission.canAskAgain) {
        setPermission('denied');
        setDetectedMode(null);
        setResolvedLocation(null);
        return {
          access: 'blocked' as const,
          ...createLocationResolutionResult(null, null),
        };
      }

      const { status, canAskAgain: nextCanAskAgain } =
        await Location.requestForegroundPermissionsAsync();

      setCanAskAgain(nextCanAskAgain);

      if (status !== 'granted') {
        setPermission('denied');
        setDetectedMode(null);
        setResolvedLocation(null);
        return {
          access: nextCanAskAgain ? ('denied' as const) : ('blocked' as const),
          ...createLocationResolutionResult(null, null),
        };
      }

      setPermission('granted');
      const result = await detectCurrentMode({ forceFresh });
      return {
        access: result.ok ? ('granted' as const) : ('error' as const),
        ...result,
      };
    } catch {
      setDetectedMode(null);
      setResolvedLocation(null);
      setLocationError('Could not determine your location.');
      return {
        access: 'error' as const,
        ...createLocationResolutionResult(null, null),
      };
    }
  }, [detectCurrentMode]);

  // detectedMode = where the user currently is.
  // suggestedMode = where they most likely want to go (the opposite side).
  const suggestedMode: LocationMode = getSuggestedMode(detectedMode);

  return {
    permission,
    detectedMode,
    suggestedMode,
    resolvedLocation,
    canAskAgain,
    isLocating,
    locationError,
    requestLocationAccess,
    requestLocationSelection,
    refreshLocation,
    refreshLocationFresh,
  };
}
