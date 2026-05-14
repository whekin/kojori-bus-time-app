import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
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

import { KojoriIllustration, TbilisiIllustration } from '@/components/onboarding-illustrations';
import { SettingsSwitch } from '@/components/settings-switch';
import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { getClosestStopCandidate } from '@/hooks/use-closest-stop';
import { useI18n } from '@/hooks/use-i18n';
import { useLocation } from '@/hooks/use-location';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useSettings, type SharedDirection } from '@/hooks/use-settings';

const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });
const KOJORI_ACCENT = '#12AFA1';
const TBILISI_ACCENT = '#F2A008';
const INK = '#071B2B';
const MUTED = '#607889';
const CANVAS = '#F4FBFD';

type Mode = 'kojori' | 'tbilisi';

function modeToDirection(mode: Mode): SharedDirection {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

export function StartScreen({ onDone }: { onDone: () => void }) {
  const colors = useAppColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { settings, update, setSharedDirection } = useSettings();
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
    onDone();
    requestAnimationFrame(() => {
      setSharedDirection(modeToDirection(mode));
    });
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

    setSharedDirection(direction, false);
    onDone();
  }

  function handleLocationToggle(value: boolean) {
    if (value) {
      void handleEnableSmart();
      return;
    }

    update({ launchBehavior: 'ask' });
  }

  const artSize = Math.min(96, Math.max(78, width * 0.22));
  const smartIssue = Boolean(locationError);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <ScenicBackdrop width={width} accent={KOJORI_ACCENT} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 118 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="map-marker" size={27} color={KOJORI_ACCENT} />
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
            const accent = mode === 'kojori' ? KOJORI_ACCENT : TBILISI_ACCENT;
            const borderColor = mode === 'kojori' ? '#BFEFEB' : '#F9DFB6';
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
                <View style={[styles.cardArt, { width: artSize, height: artSize, backgroundColor: alpha(accent, '14') }]}>
                  {mode === 'kojori' ? (
                    <KojoriIllustration
                      width={artSize}
                      height={artSize}
                      accent={accent}
                      bg="#ECFBF9"
                      outline="#417E8A"
                      dim="#77A6AE"
                    />
                  ) : (
                    <TbilisiIllustration
                      width={artSize}
                      height={artSize}
                      accent={accent}
                      bg="#FFF6E7"
                      outline="#7D8A91"
                      dim="#D7AA60"
                    />
                  )}
                </View>
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
                <View style={[styles.arrowButton, { backgroundColor: accent }]}>
                  <MaterialCommunityIcons name="arrow-right" size={29} color="#FFFFFF" />
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
                color={smartIssue ? colors.warning : MUTED}
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
              <ActivityIndicator size="small" color={KOJORI_ACCENT} />
            ) : (
              <SettingsSwitch
                value={smartEnabled}
                disabled={isLocating}
                accentColor={KOJORI_ACCENT}
                onValueChange={handleLocationToggle}
              />
            )}
          </View>
        </View>
        <View style={styles.privacyRow}>
          <MaterialCommunityIcons name="lock" size={13} color="#8194A1" />
          <Text style={styles.privacyText}>{t('locationPrivacyNote')}</Text>
        </View>
      </View>
    </View>
  );
}

function ScenicBackdrop({ width, accent }: { width: number; accent: string }) {
  const sceneWidth = Math.max(320, width * 0.92);
  return (
    <View pointerEvents="none" style={stylesStatic.backdrop}>
      <Svg width={sceneWidth} height={260} viewBox="0 0 360 230" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="start-mist" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.72" />
          </LinearGradient>
          <LinearGradient id="start-ridge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity="0.26" />
            <Stop offset="1" stopColor={accent} stopOpacity="0.08" />
          </LinearGradient>
        </Defs>

        <Circle cx="286" cy="78" r="15" fill="#EADFC6" opacity="0.5" />
        <Circle cx="286" cy="78" r="26" fill="#F4EBD9" opacity="0.28" />
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
          <Path d="M 214 132 L 214 112 Q 224 101 234 112 L 234 132 Z" fill="#FFFFFF" opacity="0.38" />
          <Path d="M 250 132 L 250 102 L 260 94 L 270 102 L 270 132 Z" fill={accent} />
          <Rect x="195" y="52" width="2" height="10" fill={accent} />
          <Polygon points="197,52 207,55 197,58" fill={accent} />
        </G>

        <G opacity="0.32" fill="#568B96">
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
    root: { flex: 1, backgroundColor: C.mode === 'light' ? C.bg : CANVAS },
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
    eyebrow: { color: '#6C7E8E', fontSize: 12, fontWeight: '900', letterSpacing: 5 },
    header: { gap: 8, marginTop: 10, marginBottom: 16, maxWidth: 330 },
    title: { color: INK, fontSize: 42, fontWeight: '700', lineHeight: 47 },
    subtitle: { color: MUTED, fontSize: 18, lineHeight: 24 },
    cards: { gap: 14 },
    card: {
      minHeight: 128,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 15,
      padding: 15,
      borderWidth: 1,
      borderRadius: 22,
      backgroundColor: '#FFFFFF',
      shadowColor: '#97B3C0',
      shadowOpacity: 0.18,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    cardArt: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      overflow: 'hidden',
    },
    cardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    cardTo: { fontSize: 22, fontWeight: '400', fontStyle: 'italic', lineHeight: 25 },
    cardLabel: { color: INK, fontSize: 32, fontWeight: '700', lineHeight: 37 },
    cardSub: { color: MUTED, fontSize: 15, lineHeight: 20 },
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
      borderBottomColor: alpha(KOJORI_ACCENT, '55'),
    },
    mountainPeakLeft: { left: 0 },
    mountainPeakRight: { left: 11, borderBottomColor: alpha(KOJORI_ACCENT, '85') },
    elevationText: { color: MUTED, fontSize: 14, lineHeight: 18 },
    arrowButton: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#2E8F89',
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
      borderColor: '#DCE9EF',
      backgroundColor: '#FFFFFF',
      shadowColor: '#9DB7C4',
      shadowOpacity: 0.14,
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
    locationTapTargetPressed: { backgroundColor: '#F9FDFF' },
    locationCopy: { flex: 1, minWidth: 0, gap: 2 },
    locationTitle: { color: INK, fontSize: 15, lineHeight: 19, fontWeight: '800' },
    locationSubtitle: { color: MUTED, fontSize: 13, lineHeight: 18 },
    privacyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 12,
    },
    privacyText: { color: '#718797', fontSize: 12, lineHeight: 16, textAlign: 'center' },
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
});
