import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

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

type Mode = 'kojori' | 'tbilisi';

function modeToDirection(mode: Mode): SharedDirection {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

export function StartScreen({ onDone }: { onDone: () => void }) {
  const colors = useAppColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { selectDirection } = useActiveDirection();
  const { settings, update } = useSettings();
  const { t } = useI18n();
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
      <ScenicBackdrop width={width} accent={kojoriAccent} colors={colors} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 118 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="map-marker" size={27} color={kojoriAccent} />
            <Text style={styles.eyebrow}>{t('startEyebrow')}</Text>
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
            const arrowColor = colors.mode === 'dark' ? '#FFFFFF' : colors.text;
            const arrowFill = alpha(accent, colors.mode === 'dark' ? '3D' : '2E');
            const arrowBorder = alpha('#FFFFFF', colors.mode === 'dark' ? '7A' : 'A8');
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
                    <Text style={[styles.cardTo, { color: accent, fontFamily: DISPLAY }]}>{t('directionTo').trim()}</Text>
                    <Text style={[styles.cardLabel, { fontFamily: DISPLAY }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{label}</Text>
                    <Text style={styles.cardSub}>{sub}</Text>
                    {mode === 'kojori' ? (
                      <View style={styles.elevationRow}>
                        <View style={styles.mountainIcon}>
                          <View style={[styles.mountainPeak, styles.mountainPeakLeft]} />
                          <View style={[styles.mountainPeak, styles.mountainPeakRight]} />
                        </View>
                        <Text style={styles.elevationText}>1340 m</Text>
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
  const baseOpacity = colors.mode === 'dark' ? 0.36 : 0.24;
  const leftOpacity = colors.mode === 'dark' ? 0.9 : 0.78;
  const bottomOpacity = colors.mode === 'dark' ? 0.68 : 0.5;
  const rightGlowOpacity = mode === 'kojori' ? 0.12 : 0.16;
  return (
    <Svg pointerEvents="none" style={stylesStatic.cardScrim} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`${mode}-card-left`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.bg} stopOpacity={leftOpacity} />
          <Stop offset="0.58" stopColor={colors.bg} stopOpacity={colors.mode === 'dark' ? '0.42' : '0.34'} />
          <Stop offset="1" stopColor={colors.bg} stopOpacity="0.1" />
        </LinearGradient>
        <LinearGradient id={`${mode}-card-bottom`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.bg} stopOpacity="0.03" />
          <Stop offset="1" stopColor={colors.bg} stopOpacity={bottomOpacity} />
        </LinearGradient>
        <LinearGradient id={`${mode}-card-glow`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={accent} stopOpacity="0" />
          <Stop offset="1" stopColor={accent} stopOpacity={rightGlowOpacity} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={colors.bg} opacity={baseOpacity} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${mode}-card-left)`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${mode}-card-bottom)`} />
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${mode}-card-glow)`} />
    </Svg>
  );
}

function ScenicBackdrop({ width, accent, colors }: { width: number; accent: string; colors: AppColors }) {
  const sceneWidth = Math.max(320, width * 0.92);
  return (
    <View pointerEvents="none" style={[stylesStatic.backdrop, { opacity: colors.mode === 'dark' ? 0.72 : 1 }]}>
      <Svg width={sceneWidth} height={260} viewBox="0 0 360 230" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="start-mist" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity="0" />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={colors.mode === 'dark' ? '0.86' : '0.72'} />
          </LinearGradient>
          <LinearGradient id="start-ridge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={colors.mode === 'dark' ? '0.22' : '0.26'} />
            <Stop offset="1" stopColor={accent} stopOpacity={colors.mode === 'dark' ? '0.06' : '0.08'} />
          </LinearGradient>
        </Defs>

        <Circle cx="286" cy="78" r="15" fill={colors.warning} opacity={colors.mode === 'dark' ? '0.34' : '0.5'} />
        <Circle cx="286" cy="78" r="26" fill={colors.sand} opacity={colors.mode === 'dark' ? '0.16' : '0.28'} />
        <Path d="M 10 152 L 52 116 L 80 144 L 122 106 L 154 136 L 194 86 L 226 120 L 262 82 L 288 102 L 322 58 L 342 72 L 368 44 L 368 230 L 10 230 Z" fill={accent} opacity="0.12" />
        <Path d="M -16 178 L 38 132 L 72 162 L 130 108 L 166 142 L 214 112 L 258 152 L 312 120 L 380 142 L 380 230 L -16 230 Z" fill="url(#start-ridge)" />
        <Path d="M 78 198 Q 142 134 218 142 Q 278 148 370 134 L 370 230 L 78 230 Z" fill={accent} opacity="0.2" />

        <G opacity="0.36">
          <Rect x="188" y="73" width="18" height="58" fill={accent} />
          <Rect x="184" y="61" width="5" height="13" fill={accent} />
          <Rect x="192" y="60" width="5" height="13" fill={accent} />
          <Rect x="200" y="62" width="5" height="11" fill={accent} />
          <Rect x="207" y="114" width="22" height="18" fill={accent} />
          <Rect x="235" y="120" width="14" height="12" fill={accent} />
          <Path d="M 214 132 L 214 112 Q 224 101 234 112 L 234 132 Z" fill={colors.surface} opacity="0.38" />
          <Path d="M 250 132 L 250 102 L 260 94 L 270 102 L 270 132 Z" fill={accent} />
          <Rect x="195" y="52" width="2" height="10" fill={accent} />
          <Polygon points="197,52 207,55 197,58" fill={accent} />
        </G>

        <G opacity={colors.mode === 'dark' ? '0.22' : '0.32'} fill={colors.map}>
          <Polygon points="86,196 98,154 110,196" />
          <Polygon points="118,190 128,166 138,190" />
          <Polygon points="145,188 154,166 163,188" />
        </G>
        <Rect x="0" y="0" width="360" height="230" fill="url(#start-mist)" />
      </Svg>
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
      gap: 10,
    },
    eyebrow: { color: C.textFaint, fontSize: 12, fontWeight: '900', letterSpacing: 5 },
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
      ...StyleSheet.absoluteFillObject,
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
    cardLabel: {
      color: '#FFFFFF',
      fontSize: 39,
      fontWeight: '700',
      lineHeight: 44,
      textShadowColor: alpha('#000000', 'CC'),
      textShadowRadius: 12,
      textShadowOffset: { width: 0, height: 2 },
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
      width: 54,
      height: 54,
      borderRadius: 27,
      borderWidth: 1,
      alignSelf: 'center',
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.mode === 'dark' ? '#000000' : C.route380,
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
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
  backdrop: {
    position: 'absolute',
    right: -20,
    top: 88,
    opacity: 1,
  },
  cardScrim: {
    ...StyleSheet.absoluteFillObject,
  },
});
