import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { SettingsSwitch } from '@/components/settings-switch';
import { alpha, type AppColors } from '@/constants/theme';
import { useActiveDirection } from '@/hooks/use-active-direction';
import { useAppColors } from '@/hooks/use-app-colors';
import { getClosestStopCandidate } from '@/hooks/use-closest-stop';
import { useI18n } from '@/hooks/use-i18n';
import { useLocation } from '@/hooks/use-location';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useSchedule } from '@/hooks/use-schedule';
import { useSettings, type SharedDirection } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import {
  type BusLine,
  findStop,
  getUpcomingServiceDepartures,
  ROUTES,
  type ServiceDeparture,
} from '@/services/ttc';

const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });
const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const CARD_BACKGROUNDS = {
  dark: {
    kojori: require('@/assets/images/start-kojori-card.png'),
    tbilisi: require('@/assets/images/start-tbilisi-card.png'),
  },
  light: {
    kojori: require('@/assets/images/start-kojori-card-light.png'),
    tbilisi: require('@/assets/images/start-tbilisi-card-light.png'),
  },
} as const;
const APP_ICON = require('@/assets/images/icon.png');

type Mode = 'kojori' | 'tbilisi';

function modeToDirection(mode: Mode): SharedDirection {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

function departureColor(bus: BusLine, colors: AppColors) {
  return bus === '380' ? colors.route380 : colors.route316;
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

function CardSchedule({
  departures,
  stopName,
}: {
  departures: ServiceDeparture[];
  stopName: string;
}) {
  const colors = useAppColors();
  const styles = useStyles();
  const { t } = useI18n();

  if (departures.length === 0) return null;

  return (
    <View style={styles.cardSchedule}>
      <Text style={styles.cardStopLabel} numberOfLines={1}>
        {t('directionFrom', { origin: stopName })}
      </Text>
      <View style={styles.departurePills}>
        {departures.map((departure, index) => {
          const accent = departureColor(departure.bus, colors);
          const prominent = index === 0;
          return (
            <View
              key={departure.key}
              style={[
                styles.departurePill,
                {
                  backgroundColor: alpha(accent, prominent ? '24' : '12'),
                  borderColor: alpha(accent, prominent ? 'C0' : '72'),
                },
              ]}>
              <Text style={[styles.departureBus, { color: accent }]}>{departure.bus}</Text>
              <View style={[styles.departureDivider, { backgroundColor: alpha(accent, '55') }]} />
              <Text
                style={[styles.departureTime, !prominent && styles.departureTimeSecondary]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.86}>
                {departure.time}
              </Text>
              <Text
                style={[
                  styles.departureCountdown,
                  { color: prominent ? accent : alpha(accent, 'D8') },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}>
                {compactDepartureCountdown(departure, t)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function StartScreen({ onDone }: { onDone: () => void }) {
  const colors = useAppColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { selectDirection } = useActiveDirection();
  const { settings, update } = useSettings();
  const { t, resolvedLanguage } = useI18n();
  const stopNames = useStopNames();
  const pickedRef = useRef(false);
  const [now, setNow] = useState(() => new Date());
  const smartEnabled = settings.launchBehavior === 'smart';
  const {
    isLocating,
    locationError,
    requestLocationSelection,
  } = useLocation(smartEnabled);
  const { stops: toKojoriStops } = useRouteStops('toKojori');
  const { stops: toTbilisiStops } = useRouteStops('toTbilisi');
  const { data: toKojori380 } = useSchedule(ROUTES['380'].id, ROUTES['380'].toKojori);
  const { data: toKojori316 } = useSchedule(ROUTES['316'].id, ROUTES['316'].toKojori);
  const { data: toTbilisi380 } = useSchedule(ROUTES['380'].id, ROUTES['380'].toTbilisi);
  const { data: toTbilisi316 } = useSchedule(ROUTES['316'].id, ROUTES['316'].toTbilisi);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  function handlePick(mode: Mode) {
    if (pickedRef.current) return;
    pickedRef.current = true;
    selectDirection(modeToDirection(mode), { persist: 'deferred' });
    onDone();
  }

  async function handleEnableSmart() {
    const result = await requestLocationSelection({ forceFresh: true });
    if (result.access !== 'granted' || !result.suggestedMode || !result.resolvedLocation) return;

    const direction = modeToDirection(result.suggestedMode);
    const routeStops = direction === 'toKojori' ? toKojoriStops : toTbilisiStops;
    const closestStopResult = getClosestStopCandidate(routeStops, result.resolvedLocation);
    if (closestStopResult.status !== 'available' || !closestStopResult.closestStop) return;

    if (direction === 'toKojori') {
      update({
        launchBehavior: 'smart',
        activeTbilisiStopId: closestStopResult.closestStop.id,
      });
    } else {
      update({
        launchBehavior: 'smart',
        activeKojoriStopId: closestStopResult.closestStop.id,
      });
    }

    selectDirection(direction, { manual: false, persist: 'immediate' });
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
  const kojoriAccent = colors.route380;
  const tbilisiAccent = colors.route316;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 118 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <Image source={APP_ICON} style={styles.brandIcon} />
            <Text style={styles.brandName} numberOfLines={1}>Kojoring Time</Text>
          </View>
        </View>

        <View style={styles.header}>
          <Text style={[styles.title, { fontFamily: DISPLAY }]}>{t('startTitle')}</Text>
          <Text style={styles.subtitle}>
            {t('startSubtitle')}
          </Text>
        </View>

        <View style={styles.cards}>
          {(['kojori', 'tbilisi'] as Mode[]).map(mode => {
            const label = mode === 'kojori' ? t('cityKojori') : t('cityTbilisi');
            const accent = mode === 'kojori' ? kojoriAccent : tbilisiAccent;
            const borderColor = alpha(accent, colors.mode === 'dark' ? '55' : '35');
            const arrowColor = colors.mode === 'light' ? colors.text : '#FFFFFF';
            const arrowFill = colors.mode === 'dark' ? alpha(accent, '3D') : alpha('#FFFFFF', 'A8');
            const arrowBorder = colors.mode === 'dark' ? alpha('#FFFFFF', '54') : alpha('#FFFFFF', 'E0');
            const arrowShadowColor = colors.mode === 'light' ? '#FFFFFF' : '#000000';
            const arrowShadowOpacity = colors.mode === 'light' ? 0.34 : 0.22;
            const cardShadow = alpha('#000000', colors.mode === 'dark' ? 'CC' : '9F');
            const cardToColor = colors.mode === 'light' ? '#FFFFFF' : accent;
            const activeStopId = mode === 'kojori'
              ? settings.activeTbilisiStopId
              : settings.activeKojoriStopId;
            const stopName = stopNames[activeStopId]
              ?? findStop(activeStopId)?.label
              ?? t('commonStopNumber', { id: activeStopId.split(':')[1] ?? activeStopId });
            const departures = mode === 'kojori'
              ? getUpcomingServiceDepartures(
                toKojori380,
                toKojori316,
                activeStopId,
                now,
              )
              : getUpcomingServiceDepartures(
                toTbilisi380,
                toTbilisi316,
                activeStopId,
                now,
              );
            const accessibilityLabel = departures.length > 0
              ? t('startGoToWithDepartures', {
                place: label,
                stop: stopName,
                departures: departures
                  .map(departure => `${departure.bus} ${departure.time}`)
                  .join(', '),
              })
              : t('startGoTo', { place: label });
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel}
                onPress={() => handlePick(mode)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    borderColor,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}>
                <ImageBackground
                  source={CARD_BACKGROUNDS[colors.mode][mode]}
                  resizeMode="cover"
                  style={styles.cardImageBackground}
                  imageStyle={styles.cardImage}
                />
                <CardScrim mode={mode} colors={colors} accent={accent} />
                <View style={styles.cardContent}>
                  <View style={styles.cardHeroRow}>
                    <View style={styles.cardCopy}>
                      <Text style={[styles.cardTo, resolvedLanguage === 'ka' && styles.cardToGeorgian, { color: cardToColor, fontFamily: DISPLAY, textShadowColor: cardShadow }]}>{t('directionTo').trim()}</Text>
                      <Text style={[styles.cardLabel, resolvedLanguage === 'ka' && styles.cardLabelGeorgian, { fontFamily: DISPLAY, textShadowColor: cardShadow }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{label}</Text>
                    </View>
                    <View style={[styles.arrowButton, { backgroundColor: arrowFill, borderColor: arrowBorder, shadowColor: arrowShadowColor, shadowOpacity: arrowShadowOpacity }]}>
                      <MaterialCommunityIcons name="arrow-right" size={26} color={arrowColor} />
                    </View>
                  </View>
                  <CardSchedule departures={departures} stopName={stopName} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.locationFixedArea, { bottom: insets.bottom + 12 }]}>
        <View style={styles.locationDock}>
          <View style={styles.locationRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={smartIssue ? t('locationUnavailable') : t('locationUseNextTime')}
              onPress={handleEnableSmart}
              disabled={isLocating}
              style={({ pressed }) => [styles.locationTapTarget, pressed && styles.locationTapTargetPressed]}>
              <MaterialCommunityIcons
                name={smartIssue ? 'crosshairs-off' : smartEnabled ? 'crosshairs-gps' : 'crosshairs'}
                size={28}
                color={smartIssue ? colors.warning : colors.textDim}
              />
              <View style={styles.locationCopy}>
                <Text style={styles.locationTitle}>
                  {smartIssue ? t('locationUnavailable') : smartEnabled ? t('locationSetNextTime') : t('locationUseNextTime')}
                </Text>
                <Text style={styles.locationSubtitle}>
                  {isLocating
                    ? t('locationDetectingClosest')
                    : locationError
                      ? t('locationChooseDestination')
                      : t('locationSkipManual')}
                </Text>
              </View>
            </Pressable>
            {isLocating ? (
              <ActivityIndicator size="small" color={kojoriAccent} />
            ) : (
              <SettingsSwitch
                value={smartEnabled}
                disabled={isLocating}
                accentColor={kojoriAccent}
                onValueChange={handleLocationToggle}
              />
            )}
          </View>
        </View>
        <View style={styles.privacyRow}>
          <MaterialCommunityIcons name="lock" size={13} color={colors.textFaint} />
          <Text style={styles.privacyText}>{t('locationPrivacyNote')}</Text>
        </View>
      </View>
    </View>
  );
}

function CardScrim({ mode, colors, accent }: { mode: Mode; colors: AppColors; accent: string }) {
  const isDark = colors.mode === 'dark';
  const scrimColor = isDark ? colors.bg : '#070B12';
  const baseOpacity = isDark ? 0.36 : 0;
  const leftOpacity = isDark ? 0.9 : 0.54;
  const midOpacity = isDark ? '0.42' : '0.24';
  const fadeOpacity = isDark ? '0.1' : '0.04';
  const rightOpacity = isDark ? '0.1' : '0';
  const bottomOpacity = isDark ? 0.68 : 0.22;
  const rightGlowOpacity = mode === 'kojori' ? 0.12 : 0.16;
  return (
    <Svg pointerEvents="none" style={stylesStatic.cardScrim} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`${mode}-card-left`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={scrimColor} stopOpacity={leftOpacity} />
          <Stop offset="0.48" stopColor={scrimColor} stopOpacity={midOpacity} />
          <Stop offset="0.72" stopColor={scrimColor} stopOpacity={fadeOpacity} />
          <Stop offset="1" stopColor={scrimColor} stopOpacity={rightOpacity} />
        </LinearGradient>
        <LinearGradient id={`${mode}-card-bottom`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={scrimColor} stopOpacity="0.03" />
          <Stop offset="1" stopColor={scrimColor} stopOpacity={bottomOpacity} />
        </LinearGradient>
        <LinearGradient id={`${mode}-card-glow`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={accent} stopOpacity="0" />
          <Stop offset="1" stopColor={accent} stopOpacity={rightGlowOpacity} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={scrimColor} opacity={baseOpacity} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${mode}-card-left)`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${mode}-card-bottom)`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${mode}-card-glow)`} />
    </Svg>
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
    header: { gap: 8, marginTop: 10, marginBottom: 16, maxWidth: 330 },
    title: { color: C.text, fontSize: 42, fontWeight: '700', lineHeight: 47 },
    subtitle: { color: C.textDim, fontSize: 18, lineHeight: 24 },
    cards: { gap: 14 },
    card: {
      minHeight: 194,
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
      minHeight: 194,
      justifyContent: 'space-between',
      gap: 11,
      paddingHorizontal: 19,
      paddingTop: 15,
      paddingBottom: 14,
      overflow: 'hidden',
    },
    cardHeroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    cardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    cardTo: {
      fontSize: 25,
      fontWeight: '400',
      fontStyle: 'italic',
      lineHeight: 29,
      textShadowColor: alpha('#000000', '99'),
      textShadowRadius: 10,
      textShadowOffset: { width: 0, height: 2 },
    },
    cardToGeorgian: {
      lineHeight: 38,
      paddingTop: 4,
      marginBottom: -5,
    },
    cardLabel: {
      color: '#FFFFFF',
      fontSize: 39,
      fontWeight: '700',
      lineHeight: 44,
      textShadowColor: alpha('#000000', 'CC'),
      textShadowRadius: 12,
      textShadowOffset: { width: 0, height: 2 },
    },
    cardLabelGeorgian: {
      lineHeight: 54,
      paddingTop: 4,
      marginBottom: -5,
    },
    cardSchedule: { gap: 6 },
    cardStopLabel: {
      color: alpha('#FFFFFF', 'C7'),
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
      letterSpacing: 0.7,
      textShadowColor: alpha('#000000', 'CC'),
      textShadowRadius: 6,
      textShadowOffset: { width: 0, height: 1 },
    },
    departurePills: {
      flexDirection: 'row',
      gap: 7,
    },
    departurePill: {
      flex: 1,
      minWidth: 0,
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 9,
    },
    departureBus: {
      minWidth: 25,
      fontFamily: MONO,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '900',
    },
    departureDivider: { width: 1, height: 17 },
    departureTime: {
      color: '#FFFFFF',
      fontFamily: MONO,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '800',
    },
    departureTimeSecondary: { color: alpha('#FFFFFF', 'D8') },
    departureCountdown: {
      flexShrink: 1,
      marginLeft: 'auto',
      fontFamily: MONO,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '800',
      textAlign: 'right',
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
    locationFixedArea: {
      position: 'absolute',
      left: 20,
      right: 20,
      gap: 8,
    },
    locationDock: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
      shadowColor: C.mode === 'dark' ? '#000000' : C.borderStrong,
      shadowOpacity: C.mode === 'dark' ? 0.24 : 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
      overflow: 'hidden',
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingRight: 14,
    },
    locationTapTarget: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 16,
      paddingTop: 13,
      paddingBottom: 8,
    },
    locationTapTargetPressed: { backgroundColor: C.surfaceHigh },
    locationCopy: { flex: 1, minWidth: 0, gap: 2 },
    locationTitle: { color: C.text, fontSize: 15, lineHeight: 19, fontWeight: '800' },
    locationSubtitle: { color: C.textDim, fontSize: 13, lineHeight: 18 },
    privacyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 12,
    },
    privacyText: { color: C.textFaint, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  });
}

function useStyles() {
  const colors = useAppColors();
  return createStyles(colors);
}

const stylesStatic = StyleSheet.create({
  cardScrim: {
    ...StyleSheet.absoluteFill,
  },
});
