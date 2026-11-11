import { PwaInstallCard } from '@/components/pwa-support';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SettingsSwitch } from '@/components/settings-switch';
import { TtcStatusChip } from '@/components/ttc-status-banner';
import { alpha, Fonts, Spacing, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useLocation } from '@/hooks/use-location';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import { useTransitCopy } from '@/transit/copy';
import { useFavorites } from '@/transit/favorites';
import { geometryQuery } from '@/transit/data';
import { useFavoriteDepartures } from '@/transit/hooks';
import {
  activeBoardings,
  nearbyFavorite,
  reverseTrip,
  transitDate,
  transitTime,
  tripStopId,
  tripStops,
  type Favorite,
  type TransitDeparture,
  type TransitRoute,
} from '@/transit/model';
import { useTripUi } from '@/transit/trip-ui';
import { routeColor, tripAccent, useFavoriteTitle } from '@/transit/ui';
import { routeShape } from '@/utils/route-shape';
import Svg, { Circle, Path } from 'react-native-svg';

const DISPLAY = Fonts.serif;
const MONO = Fonts.mono;
const APP_ICON = require('@/assets/images/icon.png');


/** A departure as a trip card lists it. */
type ServiceDeparture = {
  key: string;
  route: TransitRoute;
  time: string;
  minsUntil: number;
  daysUntil: number;
};

function toServiceDeparture(dep: TransitDeparture, now: number): ServiceDeparture {
  return {
    key: dep.key,
    route: dep.boarding.route,
    time: transitTime(dep.epochMs),
    minsUntil: Math.max(0, Math.round((dep.epochMs - now) / 60_000)),
    daysUntil: Math.round(
      (Date.parse(transitDate(dep.epochMs)) - Date.parse(transitDate(now))) / 86_400_000,
    ),
  };
}

function compactDepartureCountdown(
  departure: ServiceDeparture,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (departure.daysUntil > 1) {
    return t('startInDays', { days: departure.daysUntil });
  }
  if (departure.daysUntil === 1) return t('widgetTomorrow');
  if (departure.minsUntil <= 0) return t('commonNow');
  if (departure.minsUntil < 60) {
    return t('widgetCountdownCompactMinutes', { minutes: departure.minsUntil });
  }

  const hours = Math.floor(departure.minsUntil / 60);
  const minutes = departure.minsUntil % 60;
  return minutes === 0
    ? t('widgetCountdownCompactWholeHours', { hours })
    : t('widgetCountdownCompactHours', { hours, minutes });
}

function fullDepartureCountdown(
  departure: ServiceDeparture,
  t: ReturnType<typeof useI18n>['t'],
  formatRelativeDuration: ReturnType<typeof useI18n>['formatRelativeDuration'],
) {
  if (departure.daysUntil > 1) {
    return t('startInDays', { days: departure.daysUntil });
  }
  if (departure.daysUntil === 1) return t('widgetTomorrow');
  if (departure.minsUntil <= 0) return t('commonNow');
  if (departure.minsUntil < 60) {
    return formatRelativeDuration('future', 'minute', departure.minsUntil);
  }

  const hours = Math.floor(departure.minsUntil / 60);
  const minutes = departure.minsUntil % 60;
  return minutes === 0
    ? t('widgetCountdownWholeHours', { hours })
    : t('widgetCountdownHours', { hours, minutes });
}

function CardSchedule({
  departures,
  stopName,
  trip,
}: {
  departures: ServiceDeparture[];
  stopName: string;
  trip: Favorite;
}) {
  const colors = useAppColors();
  const styles = useStyles();
  const { t, formatRelativeDuration } = useI18n();

  if (departures.length === 0) {
    return (
      <View style={styles.cardSchedule}>
        <Text style={styles.cardStopLabel} numberOfLines={1}>
          {t('directionFrom', { origin: stopName })}
        </Text>
        <Text style={styles.scheduleEmpty} numberOfLines={2}>
          {t('homeNoDepartures')}
        </Text>
      </View>
    );
  }

  const [primary, ...rest] = departures;
  const primaryAccent = routeColor(primary.route.id, colors, trip);

  return (
    <View style={styles.cardSchedule}>
      <Text style={styles.cardStopLabel} numberOfLines={1}>
        {t('directionFrom', { origin: stopName })}
      </Text>

      <View style={styles.primaryDeparture}>
        <View
          style={[
            styles.primaryBusBadge,
            { backgroundColor: alpha(primaryAccent, '2E'), borderColor: alpha(primaryAccent, 'C0') },
          ]}>
          <Text style={[styles.primaryBus, { color: primaryAccent }]}>{primary.route.shortName}</Text>
        </View>
        <Text
          style={styles.primaryTime}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          {primary.time}
        </Text>
        <Text
          style={[styles.primaryCountdown, { color: primaryAccent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}>
          {fullDepartureCountdown(primary, t, formatRelativeDuration)}
        </Text>
      </View>

      {rest.length > 0 ? (
        <View style={styles.secondaryDepartures}>
          {rest.map(departure => {
            const accent = routeColor(departure.route.id, colors, trip);
            return (
              <Text key={departure.key} style={styles.secondaryDeparture} numberOfLines={1}>
                <Text style={[styles.secondaryBus, { color: alpha(accent, 'E6') }]}>
                  {departure.route.shortName}
                </Text>
                {`  ${departure.time}  ·  ${compactDepartureCountdown(departure, t)}`}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The trip's real path, drawn faintly behind the card: the whole pattern, the
 * stretch you ride from your stop drawn stronger, your stop and the end.
 * Geometry comes from the shared, persisted geometry query (baked for 380/316).
 */
function RouteShapeBackdrop({
  trip,
  accent,
  width,
  height,
  top,
}: {
  trip: Favorite;
  accent: string;
  width: number;
  height: number;
  top: number;
}) {
  const colors = useAppColors();
  const boarding = activeBoardings(trip)[0];
  const geometry = useQuery({ ...geometryQuery(boarding ?? trip.boardings[0]), enabled: Boolean(boarding) });
  const shape = routeShape(geometry.data ?? [], boarding?.stop, width, height, 18);
  if (!shape) return null;
  return (
    <Svg
      pointerEvents="none"
      width={width}
      height={height}
      style={[stylesStatic.shape, { width, height, top }]}>
      <Path d={shape.full} stroke={alpha(accent, '24')} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={shape.ahead} stroke={alpha(accent, '73')} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={shape.end.x} cy={shape.end.y} r={4} fill={alpha(accent, '99')} />
      <Circle cx={shape.stop.x} cy={shape.stop.y} r={5} fill={colors.surface} stroke={accent} strokeWidth={2.5} />
    </Svg>
  );
}

function TripCard({
  trips, now, onPick,
}: {
  trips: Favorite[];
  now: number;
  onPick: (trip: Favorite) => void;
}) {
  const colors = useAppColors();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const { t, resolvedLanguage, localizedStopName } = useI18n();
  const stopNames = useStopNames();
  const tripTitle = useFavoriteTitle();
  const [chosen, setChosen] = useState(trips[0].id);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const touched = useRef(false);
  const [flip] = useState(() => new Animated.Value(1));
  const storageKey = '@trip_card_direction:' + trips.map(trip => trip.id).sort().join('|');
  useEffect(() => {
    let disposed = false;
    void AsyncStorage.getItem(storageKey).then(id => {
      if (!disposed && !touched.current && id) setChosen(id);
    }).catch(() => {});
    return () => { disposed = true; };
  }, [storageKey]);
  const trip = trips.find(item => item.id === chosen) ?? trips[0];
  const other = trips.find(item => item.id !== trip.id);
  const accent = tripAccent(trip, colors);
  const data = useFavoriteDepartures(trip, true, now);
  const departures = data.rows.filter(dep => dep.epochMs > now).slice(0, 2)
    .map(dep => toServiceDeparture(dep, now));
  const stop = tripStops(trip).find(s => s.id === tripStopId(trip));
  const stopName = stop ? stopNames[stop.id] ?? localizedStopName(stop) : '';
  const title = tripTitle(trip);

  function turnAround() {
    if (!other) return;
    touched.current = true;
    setChosen(other.id);
    void AsyncStorage.setItem(storageKey, other.id).catch(() => {});
    if (reduceMotion) return;
    flip.setValue(0);
    Animated.timing(flip, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  const flipStyle = {
    opacity: flip,
    transform: [{ translateX: flip.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
  };

  return (
    <Pressable
      testID={`start-${trip.id}`}
      accessibilityRole="button"
      accessibilityLabel={departures.length
        ? t('startGoToWithDepartures', {
          place: title, stop: stopName,
          departures: departures.map(dep => `${dep.route.shortName} ${dep.time}`).join(', '),
        })
        : t('startGoTo', { place: title })}
      onPress={() => onPick(trip)}
      onLayout={event => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
      style={({ pressed }) => [
        styles.card,
        { borderColor: alpha(accent, '55'), transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}>
      <View pointerEvents="none" style={[stylesStatic.wash, { backgroundColor: alpha(accent, '0D') }]} />
      {size.width ? (
        <RouteShapeBackdrop
          trip={trip}
          accent={accent}
          width={Math.round(size.width * 0.52)}
          // Keep the drawing clear of the way-back pill in the corner.
          top={other ? 44 : 0}
          height={Math.round(size.height - (other ? 44 : 0))}
        />
      ) : null}
      <View style={styles.cardContent}>
        <View style={styles.cardHeroRow}>
          <Animated.View style={[styles.cardCopy, flipStyle]}>
            <Text style={[styles.cardTo, resolvedLanguage === 'ka' && styles.cardToGeorgian, { color: accent, fontFamily: DISPLAY }]}>
              {t('directionTo').trim()}
            </Text>
            <Text
              style={[styles.cardLabel, resolvedLanguage === 'ka' && styles.cardLabelGeorgian, { fontFamily: DISPLAY }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {title}
            </Text>
          </Animated.View>
          {other ? (
            <Pressable
              testID="card-direction-toggle"
              accessibilityRole="button"
              accessibilityLabel={t('startGoTo', { place: tripTitle(other) })}
              onPress={turnAround}
              hitSlop={8}
              style={({ pressed }) => [
                styles.returnPill,
                {
                  borderColor: alpha(tripAccent(other, colors), '66'),
                  backgroundColor: pressed ? alpha(tripAccent(other, colors), '26') : colors.surface,
                },
              ]}>
              <MaterialCommunityIcons name="arrow-u-left-top" size={16} color={tripAccent(other, colors)} />
              <Text style={styles.returnPillText} numberOfLines={1}>{tripTitle(other)}</Text>
            </Pressable>
          ) : null}
        </View>
        <Animated.View style={flipStyle}>
          <CardSchedule departures={departures} stopName={stopName} trip={trip} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

export function StartScreen({ onDone }: { onDone: () => void }) {
  const colors = useAppColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { state, select } = useFavorites();
  const { openEditor } = useTripUi();
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const copy = useTransitCopy();
  const pickedRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const smartEnabled = settings.launchBehavior === 'smart';
  const {
    isLocating,
    locationError,
    requestLocationSelection,
  } = useLocation(smartEnabled);
  const groups: Favorite[][] = [];
  const used = new Set<string>();
  for (const trip of state.favorites) {
    if (used.has(trip.id)) continue;
    const reverse = reverseTrip(trip, state.favorites.filter(item => !used.has(item.id)));
    const group = reverse ? [trip, reverse] : [trip];
    group.forEach(item => used.add(item.id));
    groups.push(group);
  }

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(() => {
      setNow(Date.now());
      intervalId = setInterval(() => setNow(Date.now()), 60_000);
    }, 60_000 - (Date.now() % 60_000));

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  function handlePick(trip: Favorite) {
    if (pickedRef.current) return;
    pickedRef.current = true;
    select(trip.id);
    onDone();
  }

  async function handleEnableSmart() {
    const result = await requestLocationSelection({ forceFresh: true });
    if (result.access !== 'granted' || !result.resolvedLocation) return;
    update({ launchBehavior: 'smart' });
    const nearby = nearbyFavorite(
      state.favorites,
      result.resolvedLocation.latitude,
      result.resolvedLocation.longitude,
    );
    if (nearby.status !== 'available') return;
    select(nearby.favorite.id);
    onDone();
  }

  function handleLocationToggle(value: boolean) {
    if (value) {
      void handleEnableSmart();
      return;
    }

    update({ launchBehavior: 'ask' });
  }

  const smartIssue = Boolean(locationError);
  const locationSubtitle = isLocating
    ? t('locationDetectingClosest')
    : locationError
      ? t('locationChooseDestination')
      : smartEnabled
        ? ''
        : t('locationSkipManual');
  const kojoriAccent = colors.route380;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Image source={APP_ICON} style={styles.brandIcon} />
            <Text style={styles.brandName} numberOfLines={1}>Kojoring Time</Text>
          </View>
          <TtcStatusChip constrained />
        </View>

        <PwaInstallCard />
        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: DISPLAY }]}>
            {state.favorites.length ? t('startTitle') : copy('tripsEmpty')}
          </Text>
          {state.favorites.length ? null : (
            <Text style={styles.headerNote}>{copy('tripsEmptyNote')}</Text>
          )}
        </View>

        <View style={styles.cards}>
          {groups.map(trips => (
            <TripCard key={trips[0].id} trips={trips} now={now} onPick={handlePick} />
          ))}
          <Pressable
            testID="start-add-trip"
            accessibilityRole="button"
            onPress={() => openEditor()}
            style={({ pressed }) => [
              styles.addCard,
              !state.favorites.length && styles.addCardProminent,
              { borderColor: alpha(kojoriAccent, '66'), opacity: pressed ? 0.7 : 1 },
            ]}>
            <View style={[styles.addIcon, { backgroundColor: alpha(kojoriAccent, '22') }]}>
              <MaterialCommunityIcons name="plus" size={22} color={kojoriAccent} />
            </View>
            <Text style={styles.addText}>{copy('tripAdd')}</Text>
          </Pressable>
        </View>

        {state.favorites.length ? (
        <View style={styles.locationArea}>
          <View style={styles.locationRow}>
            <MaterialCommunityIcons
              name={smartIssue ? 'crosshairs-off' : smartEnabled ? 'crosshairs-gps' : 'crosshairs'}
              size={22}
              color={smartIssue ? colors.warning : colors.textFaint}
            />
            <View style={styles.locationCopy}>
              <Text style={styles.locationTitle}>
                {smartIssue ? t('locationUnavailable') : smartEnabled ? t('locationSetNextTime') : t('locationUseNextTime')}
              </Text>
              {locationSubtitle ? (
                <Text style={styles.locationSubtitle}>{locationSubtitle}</Text>
              ) : null}
            </View>
            {isLocating ? (
              <ActivityIndicator size="small" color={kojoriAccent} />
            ) : smartIssue ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('locationRefresh')}
                onPress={handleEnableSmart}
                hitSlop={10}
                style={({ pressed }) => [styles.locationRetry, pressed && styles.locationRetryPressed]}>
                <Text style={styles.locationRetryText}>{t('commonRefresh')}</Text>
              </Pressable>
            ) : (
              <SettingsSwitch
                value={smartEnabled}
                accentColor={kojoriAccent}
                onValueChange={handleLocationToggle}
              />
            )}
          </View>

          {smartEnabled || isLocating ? (
            <View style={styles.privacyRow}>
              <MaterialCommunityIcons name="lock" size={12} color={colors.textFaint} />
              <Text style={styles.privacyText}>{t('locationPrivacyNote')}</Text>
            </View>
          ) : null}
        </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 20, gap: 14 },
    topBar: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brandRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    brandIcon: {
      width: 34,
      height: 34,
      borderRadius: 9,
      tintColor: C.text,
    },
    brandName: {
      flex: 1,
      minWidth: 0,
      color: C.text,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '900',
    },
    header: { marginTop: 4, marginBottom: 10, maxWidth: 330 },
    title: { color: C.text, fontSize: 32, fontWeight: '700', lineHeight: 38 },
    headerNote: { color: C.textDim, fontSize: 15, lineHeight: 21, marginTop: 8 },
    cards: { gap: 14 },
    tripTitle: { color: C.text, fontFamily: DISPLAY, fontSize: 21, lineHeight: 27, fontWeight: '700' },
    cardCompact: { minHeight: 168 },
    cardContentCompact: { minHeight: 168, paddingTop: 12, paddingBottom: 12 },
    cardLabelCompact: { fontSize: 32, lineHeight: 38 },
    addCard: {
      minHeight: 64,
      borderRadius: 24,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    addCardProminent: { minHeight: 140 },
    addIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: { color: C.text, fontSize: 16, fontWeight: '800' },
    card: {
      minHeight: 0,
      borderWidth: 1,
      borderRadius: 24,
      backgroundColor: C.surface,
      shadowColor: C.mode === 'dark' ? '#000000' : C.borderStrong,
      shadowOpacity: C.mode === 'dark' ? 0.28 : 0.18,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
      overflow: 'hidden',
    },
    cardImageBackground: {
      ...StyleSheet.absoluteFill,
    },
    cardImage: {
      borderRadius: 23,
    },
    cardContent: {
      minHeight: 0,
      justifyContent: 'space-between',
      gap: Spacing.two,
      paddingHorizontal: Spacing.four,
      paddingVertical: Spacing.three,
      overflow: 'hidden',
    },
    cardHeroRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    cardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    cardTo: {
      fontSize: 21,
      fontWeight: '400',
      fontStyle: 'italic',
      lineHeight: 25,
    },
    cardToGeorgian: {
      lineHeight: 38,
      paddingTop: 4,
      marginBottom: -5,
    },
    cardLabel: {
      color: C.text,
      fontSize: 36,
      fontWeight: '700',
      lineHeight: 42,
    },
    returnPill: {
      flexShrink: 0,
      maxWidth: 140,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      paddingHorizontal: 11,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
    },
    returnPillText: { color: C.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    cardLabelGeorgian: {
      lineHeight: 54,
      paddingTop: 4,
      marginBottom: -5,
    },
    cardSchedule: { gap: 7 },
    cardStopLabel: {
      color: C.textDim,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      letterSpacing: 0.7,
    },
    primaryDeparture: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    primaryBusBadge: {
      flexShrink: 0,
      height: 26,
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 13,
      paddingHorizontal: 9,
    },
    primaryBus: {
      fontFamily: MONO,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '900',
    },
    primaryTime: {
      flexShrink: 0,
      color: C.text,
      fontFamily: MONO,
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '800',
    },
    primaryCountdown: {
      flexShrink: 1,
      marginLeft: 'auto',
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '800',
      textAlign: 'right',
    },
    secondaryDepartures: { gap: 2 },
    secondaryDeparture: {
      color: C.textDim,
      fontFamily: MONO,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    secondaryBus: { fontWeight: '900' },
    scheduleEmpty: {
      color: C.textDim,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    arrowButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      alignSelf: 'center',
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.mode === 'dark' ? '#000000' : C.route380,
      shadowOpacity: C.mode === 'dark' ? 0.22 : 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    locationArea: { marginTop: 4, gap: 8 },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 4,
      minHeight: 44,
    },
    locationCopy: { flex: 1, minWidth: 0, gap: 1 },
    locationTitle: { color: C.textDim, fontSize: 14, lineHeight: 18, fontWeight: '700' },
    locationSubtitle: { color: C.textFaint, fontSize: 12, lineHeight: 16 },
    locationRetry: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    locationRetryPressed: { backgroundColor: C.surfaceHigh },
    locationRetryText: { color: C.text, fontSize: 13, lineHeight: 17, fontWeight: '700' },
    privacyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 4,
    },
    privacyText: { color: C.textFaint, fontSize: 11, lineHeight: 15 },
  });
}

function useStyles() {
  const colors = useAppColors();
  return createStyles(colors);
}

const stylesStatic = StyleSheet.create({
  wash: { ...StyleSheet.absoluteFill },
  shape: { position: 'absolute', right: 0, top: 0 },
});
