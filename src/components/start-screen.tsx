import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
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

import { KojoriIllustration, TbilisiIllustration } from '@/components/onboarding-illustrations';
import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useLocation } from '@/hooks/use-location';
import { useSettings, type SharedDirection } from '@/hooks/use-settings';
import { fetchArrivalTimes, SCHEDULE_STOP_PROXY } from '@/services/ttc';

const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });

type Mode = 'kojori' | 'tbilisi';

function modeToDirection(mode: Mode): SharedDirection {
  return mode === 'kojori' ? 'toKojori' : 'toTbilisi';
}

export function StartScreen({ onDone }: { onDone: () => void }) {
  const colors = useAppColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const { settings, update, setSharedDirection } = useSettings();
  const smartEnabled = settings.launchBehavior === 'smart';
  const {
    suggestedMode,
    permission,
    isLocating,
    locationError,
    requestLocationAccess,
  } = useLocation(smartEnabled);

  const [hint, setHint] = useState<Mode | null>(null);

  useEffect(() => {
    // Preload arrivals for both likely-active stops so landing is instant.
    const stops = [settings.activeTbilisiStopId, settings.activeKojoriStopId]
      .filter(Boolean)
      .map(id => SCHEDULE_STOP_PROXY[id] ?? id);
    const seen = new Set<string>();
    for (const stopId of stops) {
      if (seen.has(stopId)) continue;
      seen.add(stopId);
      void queryClient.prefetchQuery({
        queryKey: ['arrivals', stopId],
        queryFn: () => fetchArrivalTimes(stopId),
        staleTime: 20_000,
        meta: { source: 'ttc' },
      });
    }
  }, [queryClient, settings.activeKojoriStopId, settings.activeTbilisiStopId]);

  useEffect(() => {
    if (smartEnabled && suggestedMode) {
      setHint(suggestedMode);
    }
  }, [suggestedMode, smartEnabled]);

  function handlePick(mode: Mode) {
    setSharedDirection(modeToDirection(mode));
    onDone();
  }

  async function handleEnableSmart() {
    if (smartEnabled) return;
    const result = await requestLocationAccess();
    if (result === 'granted') {
      update({ launchBehavior: 'smart' });
    }
  }

  const cardHeight = Math.min(170, Math.max(140, width * 0.42));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20 }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>KOJORI · TBILISI</Text>
          <Text style={[styles.title, { fontFamily: DISPLAY }]}>Where are you going?</Text>
          <Text style={styles.subtitle}>
            Pick your destination so we can line up the right departures.
          </Text>
        </View>

        <View style={styles.cards}>
          {(['kojori', 'tbilisi'] as Mode[]).map(mode => {
            const isHint = hint === mode;
            const label = mode === 'kojori' ? 'Kojori' : 'Tbilisi';
            const sub = mode === 'kojori' ? 'Up the mountain · 1340 m' : 'Down in the city';
            const accent = mode === 'kojori' ? colors.route380 : colors.route316;
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${label}`}
                onPress={() => handlePick(mode)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    borderColor: isHint ? accent : alpha(accent, '35'),
                    backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                  },
                ]}>
                <View style={[styles.cardArt, { height: cardHeight, backgroundColor: alpha(accent, '10') }]}>
                  {mode === 'kojori' ? (
                    <KojoriIllustration
                      width={Math.min(width - 80, 360)}
                      height={cardHeight}
                      accent={accent}
                      bg={colors.surface}
                      outline={colors.textDim}
                      dim={colors.textFaint}
                    />
                  ) : (
                    <TbilisiIllustration
                      width={Math.min(width - 80, 360)}
                      height={cardHeight}
                      accent={accent}
                      bg={colors.surface}
                      outline={colors.textDim}
                      dim={colors.textFaint}
                    />
                  )}
                  {isHint ? (
                    <View style={[styles.hintBadge, { borderColor: accent, backgroundColor: alpha(accent, '18') }]}>
                      <MaterialCommunityIcons name="crosshairs-gps" size={12} color={accent} />
                      <Text style={[styles.hintBadgeText, { color: accent }]}>Near you</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardCopy}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.cardTo, { color: accent, fontFamily: DISPLAY }]}>to</Text>
                    <Text style={[styles.cardLabel, { fontFamily: DISPLAY }]}>{label}</Text>
                  </View>
                  <Text style={styles.cardSub}>{sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleEnableSmart}
          disabled={isLocating || (smartEnabled && permission === 'granted')}
          style={({ pressed }) => [
            styles.smartCard,
            {
              borderColor: smartEnabled ? alpha(colors.primary, '55') : colors.border,
              backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
            },
          ]}>
          <MaterialCommunityIcons
            name={smartEnabled ? 'crosshairs-gps' : 'crosshairs'}
            size={20}
            color={smartEnabled ? colors.primary : colors.textDim}
          />
          <View style={styles.smartCopy}>
            <Text style={styles.smartTitle}>
              {smartEnabled ? 'Smart direction on' : 'Use my location'}
            </Text>
            <Text style={styles.smartSub}>
              {isLocating
                ? 'Detecting where you are…'
                : locationError
                  ? locationError
                  : smartEnabled
                    ? suggestedMode
                      ? `Suggested: ${suggestedMode === 'kojori' ? 'Kojori' : 'Tbilisi'}`
                      : 'Checking location…'
                    : 'We can highlight the closest destination'}
            </Text>
          </View>
          {isLocating ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 20, gap: 18 },
    header: { gap: 6, marginTop: 4, marginBottom: 2 },
    eyebrow: { color: C.textFaint, fontSize: 11, fontWeight: '800', letterSpacing: 2.6 },
    title: { color: C.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.6, lineHeight: 38 },
    subtitle: { color: C.textDim, fontSize: 14, lineHeight: 20 },
    cards: { gap: 14 },
    card: {
      borderWidth: 1,
      borderRadius: 24,
      overflow: 'hidden',
    },
    cardArt: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    hintBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
    },
    hintBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
    cardCopy: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      gap: 4,
    },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    cardTo: { fontSize: 26, fontWeight: '400', fontStyle: 'italic', letterSpacing: -0.3 },
    cardLabel: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
    cardSub: { color: C.textDim, fontSize: 13, lineHeight: 18 },
    smartCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 18,
      borderWidth: 1,
    },
    smartCopy: { flex: 1, minWidth: 0, gap: 2 },
    smartTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
    smartSub: { color: C.textDim, fontSize: 12, lineHeight: 16 },
    skipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.surface,
    },
    skipCopy: { flex: 1, minWidth: 0, gap: 2 },
    skipTitle: { color: C.text, fontSize: 13, fontWeight: '700' },
    skipSub: { color: C.textDim, fontSize: 11, lineHeight: 15 },
  });
}

function useStyles() {
  const colors = useAppColors();
  return useMemo(() => createStyles(colors), [colors]);
}
