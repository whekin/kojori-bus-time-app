import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useRef } from 'react';
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
import { useSettings, type SharedDirection } from '@/hooks/use-settings';

const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });
const CARD_BACKGROUNDS = {
  kojori: require('@/assets/images/start-kojori-card.png'),
  tbilisi: require('@/assets/images/start-tbilisi-card.png'),
} as const;
const APP_ICON = require('@/assets/images/icon.png');

type Mode = 'kojori' | 'tbilisi';

function modeToDirection(mode: Mode): SharedDirection {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

export function StartScreen({ onDone }: { onDone: () => void }) {
  const colors = useAppColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { selectDirection } = useActiveDirection();
  const { settings, update } = useSettings();
  const { t, resolvedLanguage } = useI18n();
  const pickedRef = useRef(false);
  const smartEnabled = settings.launchBehavior === 'smart';
  const {
    isLocating,
    locationError,
    requestLocationSelection,
  } = useLocation(smartEnabled);
  const { stops: toKojoriStops } = useRouteStops('toKojori');
  const { stops: toTbilisiStops } = useRouteStops('toTbilisi');

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
            const sub = mode === 'kojori' ? t('startKojoriSub') : t('startTbilisiSub');
            const accent = mode === 'kojori' ? kojoriAccent : tbilisiAccent;
            const borderColor = alpha(accent, colors.mode === 'dark' ? '55' : '35');
            const arrowColor = '#FFFFFF';
            const arrowFill = colors.mode === 'dark' ? alpha(accent, '3D') : alpha('#05070B', '36');
            const arrowBorder = colors.mode === 'dark' ? alpha('#FFFFFF', '54') : alpha(accent, '8A');
            const cardShadow = alpha('#000000', colors.mode === 'dark' ? 'CC' : '9F');
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityLabel={t('startGoTo', { place: label })}
                onPress={() => handlePick(mode)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    borderColor,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  },
                ]}>
                <ImageBackground
                  source={CARD_BACKGROUNDS[mode]}
                  resizeMode="cover"
                  style={styles.cardImageBackground}
                  imageStyle={styles.cardImage}
                />
                <CardScrim mode={mode} colors={colors} accent={accent} />
                <View style={styles.cardContent}>
                  <View style={styles.cardCopy}>
                    <Text style={[styles.cardTo, resolvedLanguage === 'ka' && styles.cardToGeorgian, { color: accent, fontFamily: DISPLAY, textShadowColor: cardShadow }]}>{t('directionTo').trim()}</Text>
                    <Text style={[styles.cardLabel, resolvedLanguage === 'ka' && styles.cardLabelGeorgian, { fontFamily: DISPLAY, textShadowColor: cardShadow }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{label}</Text>
                    <Text style={[styles.cardSub, { textShadowColor: cardShadow }]}>{sub}</Text>
                    {mode === 'kojori' ? (
                      <View style={styles.elevationRow}>
                        <View style={styles.mountainIcon}>
                          <View style={[styles.mountainPeak, styles.mountainPeakLeft]} />
                          <View style={[styles.mountainPeak, styles.mountainPeakRight]} />
                        </View>
                        <Text style={[styles.elevationText, { textShadowColor: cardShadow }]}>1340 m</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.arrowButton, { backgroundColor: arrowFill, borderColor: arrowBorder }]}>
                    <MaterialCommunityIcons name="arrow-right" size={29} color={arrowColor} />
                  </View>
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
      minHeight: 176,
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
      minHeight: 176,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 14,
      paddingHorizontal: 19,
      paddingTop: 18,
      paddingBottom: 18,
      overflow: 'hidden',
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
    cardSub: {
      color: alpha('#FFFFFF', 'E6'),
      fontSize: 16,
      lineHeight: 21,
      textShadowColor: alpha('#000000', 'AA'),
      textShadowRadius: 8,
      textShadowOffset: { width: 0, height: 1 },
    },
    elevationRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
    mountainIcon: { width: 28, height: 15, position: 'relative' },
    mountainPeak: {
      position: 'absolute',
      bottom: 0,
      width: 0,
      height: 0,
      borderLeftWidth: 8,
      borderRightWidth: 8,
      borderBottomWidth: 15,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: alpha(C.route380, C.mode === 'dark' ? '66' : '55'),
    },
    mountainPeakLeft: { left: 0 },
    mountainPeakRight: { left: 11, borderBottomColor: alpha(C.route380, C.mode === 'dark' ? '99' : '85') },
    elevationText: {
      color: alpha('#FFFFFF', 'D6'),
      fontSize: 14,
      lineHeight: 18,
      textShadowColor: alpha('#000000', '99'),
      textShadowRadius: 6,
      textShadowOffset: { width: 0, height: 1 },
    },
    arrowButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
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
