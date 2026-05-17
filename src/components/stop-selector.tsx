import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import {
  ScrollableBottomSheet,
  ScrollableBottomSheetScrollView,
} from '@/components/scrollable-bottom-sheet';
import { StopChoiceRow } from '@/components/stop-choice-row';
import { StopPickerModal } from '@/components/stop-picker-modal';
import { alpha } from '@/constants/theme';
import { useActiveDirection } from '@/hooks/use-active-direction';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useMapFocus } from '@/hooks/use-map-focus';
import { useTabNav, type TabRoute } from '@/hooks/use-tab-nav';
import { type SharedDirection } from '@/hooks/use-settings';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });

interface StopSelectorItem {
  id: string;
  label: string;
  lat?: number;
  lon?: number;
}

interface StopSelectorProps {
  stops: StopSelectorItem[];
  activeStopId: string;
  accentColor: string;
  onSelectStop: (id: string) => void;
  locationSuggestion?: {
    stop: StopSelectorItem;
    distanceMeters: number;
  };
  onAddStop?: () => void;
  addStopModal?: {
    title: string;
    direction: 'toKojori' | 'toTbilisi';
    favoriteIds: string[];
    onToggle: (id: string) => void;
  };
  label?: string;
  mapReturnRoute: TabRoute;
  showDirectionSwitch?: boolean;
}

function formatDistance(distanceMeters: number, t: ReturnType<typeof useI18n>['t']) {
  if (distanceMeters < 1000) return t('stopDistanceMeters', { distance: Math.round(distanceMeters) });
  return t('stopDistanceKm', { distance: (distanceMeters / 1000).toFixed(distanceMeters < 10_000 ? 1 : 0) });
}

function stopCode(id: string) {
  return '#' + (id.split(':')[1] ?? id);
}

function originLabel(
  direction: SharedDirection,
  t: ReturnType<typeof useI18n>['t'],
) {
  return direction === 'toKojori' ? t('cityTbilisi') : t('cityKojori');
}

function destinationLabel(
  direction: SharedDirection,
  t: ReturnType<typeof useI18n>['t'],
) {
  return direction === 'toKojori' ? t('cityKojori') : t('cityTbilisi');
}

function DirectionSwitch({ accentColor }: { accentColor: string }) {
  const colors = useAppColors();
  const styles = useStopSelectorStyles();
  const { activeDirection, selectDirection } = useActiveDirection();
  const { t } = useI18n();
  const origin = originLabel(activeDirection, t);
  const destination = destinationLabel(activeDirection, t);
  const nextDirection = activeDirection === 'toKojori' ? 'toTbilisi' : 'toKojori';

  function handlePress(event: GestureResponderEvent) {
    event.stopPropagation();
    selectDirection(nextDirection, { persist: 'deferred' });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('directionAccessibility', { origin, destination })}
      onPress={handlePress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.directionSwitch,
        {
          borderColor: alpha(accentColor, pressed ? '66' : '38'),
          backgroundColor: pressed ? alpha(accentColor, '1C') : alpha(accentColor, '10'),
        },
      ]}>
      <View style={[styles.directionSwitchDot, { backgroundColor: accentColor }]} />
      <Text
        style={[styles.directionSwitchText, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}>
        {origin}
      </Text>
      <MaterialCommunityIcons name="arrow-right" size={13} color={colors.textDim} />
      <Text
        style={[styles.directionSwitchText, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}>
        {destination}
      </Text>
      <MaterialCommunityIcons name="swap-horizontal" size={15} color={accentColor} />
    </Pressable>
  );
}

function BoardingStopMapBackdrop({ accentColor }: { accentColor: string }) {
  const colors = useAppColors();
  const styles = useStopSelectorStyles();
  const minorOpacity = colors.mode === 'dark' ? 0.1 : 0.16;
  const streetOpacity = colors.mode === 'dark' ? 0.13 : 0.2;
  const arterialOpacity = colors.mode === 'dark' ? 0.16 : 0.17;
  const iconOpacity = colors.mode === 'dark' ? 0.64 : 0.58;

  return (
    <View pointerEvents="none" style={styles.triggerMapLayer}>
      <Svg width="100%" height="100%" viewBox="0 0 280 132" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="mapFade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.surface} stopOpacity="1" />
            <Stop offset="0.3" stopColor={colors.surface} stopOpacity="0.93" />
            <Stop offset="0.64" stopColor={colors.surface} stopOpacity={colors.mode === 'dark' ? '0.48' : '0.28'} />
            <Stop offset="1" stopColor={colors.surface} stopOpacity={colors.mode === 'dark' ? '0.1' : '0.08'} />
          </LinearGradient>
          <LinearGradient id="rightGlow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={alpha(accentColor, '00')} stopOpacity="0" />
            <Stop offset="1" stopColor={accentColor} stopOpacity={colors.mode === 'dark' ? '0.045' : '0.055'} />
          </LinearGradient>
        </Defs>

        <Rect width="280" height="132" fill="url(#rightGlow)" />
        <G opacity={minorOpacity} stroke={colors.textDim} strokeWidth="0.8" fill="none" strokeLinecap="round">
          <Path d="M58 18 L224 100" />
          <Path d="M70 8 L246 88" />
          <Path d="M42 36 L202 119" />
          <Path d="M94 0 L88 132" />
          <Path d="M126 0 L112 132" />
          <Path d="M158 0 L142 132" />
          <Path d="M198 0 L170 132" />
          <Path d="M230 0 L198 132" />
        </G>
        <G opacity={streetOpacity} stroke={colors.textDim} strokeWidth="1" fill="none" strokeLinecap="round">
          <Path d="M18 18 C52 28 78 30 118 24 S190 20 268 2" />
          <Path d="M0 44 C42 54 76 54 112 44 S184 28 280 34" />
          <Path d="M14 74 C66 68 98 64 140 56 S214 42 280 44" />
          <Path d="M24 103 C74 82 112 74 158 67 S226 54 280 58" />
          <Path d="M60 128 C88 101 110 90 146 76 S204 56 270 70" />
          <Path d="M28 86 L204 18" />
          <Path d="M36 113 L258 26" />
          <Path d="M84 12 C112 46 142 66 184 90 C210 105 236 118 272 130" />
          <Path d="M110 14 C134 36 160 54 204 70 C230 79 254 88 280 104" />
        </G>
        <G opacity={arterialOpacity} stroke={accentColor} strokeWidth="3.2" fill="none" strokeLinecap="round">
          <Path d="M0 122 C58 88 100 75 144 66 C184 58 220 40 280 6" />
          <Path d="M70 132 C112 105 150 88 188 78 C224 68 248 52 280 31" />
        </G>
        <Rect width="280" height="132" fill="url(#mapFade)" />
      </Svg>
      <View style={[styles.triggerMapIconWrap, { opacity: iconOpacity, borderColor: alpha(accentColor, '30'), backgroundColor: alpha(colors.surfaceHigh, colors.mode === 'dark' ? '80' : 'B8') }]}>
        <MaterialCommunityIcons name="bus" size={20} color={colors.textDim} />
        <View style={[styles.triggerMapIconDot, { backgroundColor: accentColor }]} />
      </View>
    </View>
  );
}

export function StopSelector({
  stops,
  activeStopId,
  accentColor,
  onSelectStop,
  locationSuggestion,
  onAddStop,
  addStopModal,
  label,
  mapReturnRoute,
  showDirectionSwitch = false,
}: StopSelectorProps) {
  const colors = useAppColors();
  const styles = useStopSelectorStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { t } = useI18n();
  const { requestStopFocus, stopSheetReturnRequest } = useMapFocus();
  const navigateToTab = useTabNav();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const resolvedLabel = label ?? t('stopBoarding');

  const activeIndex = Math.max(0, stops.findIndex(stop => stop.id === activeStopId));
  const activeStop = stops[activeIndex] ?? stops[0];
  const totalStops = stops.length;
  const sheetMaxHeight = Math.round(height * 0.88);
  const optionsHeight = Math.max(260, sheetMaxHeight - 214 - Math.max(insets.bottom, 16));

  useEffect(() => {
    if (!stopSheetReturnRequest) return;
    if (stopSheetReturnRequest.route !== mapReturnRoute) return;
    if (stopSheetReturnRequest.direction !== (addStopModal?.direction ?? 'toKojori')) return;

    setOpen(true);
  }, [addStopModal?.direction, mapReturnRoute, stopSheetReturnRequest]);

  const optionList = useMemo(
    () =>
      stops.map((stop) => {
        const isActive = stop.id === activeStop?.id;

        return (
          <StopChoiceRow
            key={stop.id}
            stop={stop}
            direction={addStopModal?.direction ?? 'toKojori'}
            accentColor={accentColor}
            selected={isActive}
            showCheck
            onPress={() => {
              if (!isActive) onSelectStop(stop.id);
              setOpen(false);
            }}
            onMapPress={() => setOpen(false)}
            mapReturnRoute={mapReturnRoute}
          />
        );
      }),
    [accentColor, activeStop?.id, addStopModal?.direction, mapReturnRoute, onSelectStop, stops],
  );

  if (!activeStop) return null;

  function handleShowActiveStopOnMap(event?: GestureResponderEvent) {
    event?.stopPropagation();
    requestStopFocus(activeStop, addStopModal?.direction ?? 'toKojori', { returnRoute: mapReturnRoute });
    navigateToTab?.('explore');
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('stopAccessibility', { label: resolvedLabel, stop: activeStop.label })}
        onPress={() => {
          if (totalStops > 1) {
            setOpen(true);
            return;
          }

          if (addStopModal) {
            setAddOpen(true);
            return;
          }

          onAddStop?.();
        }}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: pressed ? accentColor + '55' : accentColor + '34',
            backgroundColor: colors.surface,
          },
        ]}>
        <BoardingStopMapBackdrop accentColor={accentColor} />
        <View style={styles.triggerMain}>
          <View style={styles.triggerTopRow}>
            <Text style={styles.triggerLabel}>{resolvedLabel}</Text>
          </View>
          <Text style={[styles.triggerValue, { fontFamily: DISPLAY }]} numberOfLines={1}>
            {activeStop.label}
          </Text>
          <View style={styles.triggerBottomRow}>
            <Text style={[styles.triggerCode, { fontFamily: MONO }]}>{stopCode(activeStop.id)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('stopShowOnMap', { stop: activeStop.label })}
              onPress={handleShowActiveStopOnMap}
              hitSlop={8}
              style={[
                styles.routeButton,
                {
                  borderColor: accentColor + '30',
                  backgroundColor: accentColor + '10',
                },
              ]}>
              <MaterialCommunityIcons name="map-marker-radius" size={14} color={accentColor} />
              <Text style={[styles.routeButtonText, { color: accentColor }]}>{t('tabsMap')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.triggerSide}>
          {showDirectionSwitch ? <DirectionSwitch accentColor={accentColor} /> : null}
          {totalStops > 1 ? (
            <Text
              style={[styles.triggerAction, { color: accentColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}>
              {t('stopChange')}
            </Text>
          ) : (
            <View style={styles.triggerActionSolo}>
              <Text style={[styles.triggerAction, { color: accentColor }]}>{t('commonAdd')}</Text>
            </View>
          )}
        </View>
      </Pressable>

      <ScrollableBottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        snapPoint="88%"
        contentStyle={[
          styles.sheetContent,
          {
            maxHeight: sheetMaxHeight,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetCopy}>
                <Text style={styles.sheetEyebrow}>{resolvedLabel}</Text>
                <Text style={styles.sheetTitle}>{t('stopSheetTitle')}</Text>
                <Text style={styles.sheetNote}>
                  {t('stopSheetNote')}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.currentRow,
                {
                  borderColor: accentColor + '28',
                  backgroundColor: accentColor + '0d',
                },
              ]}>
              <View style={[styles.currentMarker, { backgroundColor: accentColor }]} />
              <View style={styles.currentCopy}>
                <Text style={styles.currentLabel}>{t('stopCurrentLabel')}</Text>
                <Text style={[styles.currentValue, { fontFamily: DISPLAY }]} numberOfLines={1}>
                  {activeStop.label}
                </Text>
                <Text style={[styles.currentCode, { fontFamily: MONO }]}>{stopCode(activeStop.id)}</Text>
              </View>
            </View>

            <ScrollableBottomSheetScrollView
              style={{ height: optionsHeight }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.optionsContent}>
              {locationSuggestion ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('stopUseClosest', { stop: locationSuggestion.stop.label })}
                  onPress={() => {
                    onSelectStop(locationSuggestion.stop.id);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.closestStopCard,
                    {
                      borderColor: accentColor + '45',
                      backgroundColor: pressed ? accentColor + '18' : accentColor + '10',
                    },
                  ]}>
                  <View style={styles.closestStopIcon}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={18} color={accentColor} />
                  </View>
                  <View style={styles.closestStopCopy}>
                    <Text style={styles.closestStopEyebrow}>{t('stopClosest')}</Text>
                    <Text style={[styles.closestStopTitle, { fontFamily: DISPLAY }]} numberOfLines={2}>
                      {locationSuggestion.stop.label}
                    </Text>
                    <Text style={[styles.closestStopDistance, { fontFamily: MONO }]}>
                      {formatDistance(locationSuggestion.distanceMeters, t)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={accentColor} />
                </Pressable>
              ) : null}
              {optionList}
              {addStopModal ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('stopAddAnother')}
                  onPress={() => {
                    setOpen(false);
                    setAddOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.addStopBtn,
                    {
                      borderColor: accentColor + '55',
                      backgroundColor: pressed ? accentColor + '18' : accentColor + '0C',
                    },
                  ]}>
                  <Text style={[styles.addStopPlus, { color: accentColor }]}>+</Text>
                  <Text style={[styles.addStopText, { color: accentColor }]}>
                    {t('stopAddAnother')}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollableBottomSheetScrollView>
      </ScrollableBottomSheet>

      {addStopModal ? (
        <StopPickerModal
          visible={addOpen}
          title={addStopModal.title}
          direction={addStopModal.direction}
          favoriteIds={addStopModal.favoriteIds}
          accentColor={accentColor}
          onToggle={addStopModal.onToggle}
          onClose={() => setAddOpen(false)}
        />
      ) : null}
    </>
  );
}

function createStyles(C: ReturnType<typeof useAppColors>) {
  return StyleSheet.create({
  trigger: {
    minHeight: 74,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
  },
  triggerMapLayer: {
    position: 'absolute',
    top: 0,
    right: -10,
    bottom: 0,
    width: '76%',
  },
  triggerMapIconWrap: {
    position: 'absolute',
    top: 28,
    right: 98,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerMapIconDot: {
    position: 'absolute',
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  triggerMain: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  triggerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  triggerLabel: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.1,
  },
  triggerValue: {
    color: C.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  triggerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  triggerSide: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    minWidth: 128,
    zIndex: 1,
  },
  directionSwitch: {
    minHeight: 30,
    maxWidth: 154,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 8,
    paddingRight: 7,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  directionSwitchDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  directionSwitchText: {
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
    minWidth: 28,
  },
  triggerAction: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  triggerActionSolo: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  routeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  routeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sheetFrame: {
    maxHeight: '76%',
  },
  peekSheetFrame: {
    marginHorizontal: 12,
    marginBottom: 92,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
  },
  sheetContent: {
    paddingHorizontal: 18,
    maxHeight: '76%',
  },
  peekSheetContent: {
    paddingHorizontal: 12,
  },
  peekStopTray: {
    minHeight: 76,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  peekStopMarker: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  peekStopCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  peekStopEyebrow: {
    color: C.textFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  peekStopTitle: {
    color: C.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  peekStopCode: {
    color: C.textDim,
    fontSize: 11,
    lineHeight: 14,
  },
  peekStopAction: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  peekStopActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  peekCloseButton: {
    width: 30,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  peekCloseGlyph: {
    color: C.textDim,
    fontSize: 22,
    lineHeight: 22,
    marginTop: -1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetCopy: {
    flex: 1,
    gap: 4,
  },
  sheetEyebrow: {
    color: C.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.1,
  },
  sheetTitle: {
    color: C.text,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700',
  },
  sheetNote: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceHigh,
  },
  closeGlyph: {
    color: C.textDim,
    fontSize: 24,
    lineHeight: 24,
    marginTop: -1,
  },
  currentRow: {
    marginTop: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  currentMarker: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  currentCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  currentLabel: {
    color: C.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  currentValue: {
    color: C.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  optionsContent: {
    gap: 10,
    paddingBottom: 6,
  },
  closestStopCard: {
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closestStopIcon: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closestStopCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  closestStopEyebrow: {
    color: C.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.1,
  },
  closestStopTitle: {
    color: C.text,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
  },
  closestStopDistance: {
    color: C.textDim,
    fontSize: 11,
  },
  option: {
    minHeight: 92,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    gap: 12,
  },
  optionRail: {
    alignItems: 'center',
    minHeight: 48,
  },
  optionDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  optionLine: {
    width: 1.5,
    flex: 1,
    minHeight: 24,
    marginTop: 6,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  optionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  optionEyebrow: {
    color: C.textFaint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.1,
  },
  optionState: {
    fontSize: 11,
    fontWeight: '700',
  },
  optionTitle: {
    color: C.text,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '700',
  },
  optionCode: {
    color: C.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  triggerCode: {
    color: C.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  currentCode: {
    color: C.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  addStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 16,
  },
  addStopPlus: {
    fontSize: 18,
    fontWeight: '700',
  },
  addStopText: {
    fontSize: 14,
    fontWeight: '600',
  },
  });
}

function useStopSelectorStyles() {
  const colors = useAppColors();
  return useMemo(() => createStyles(colors), [colors]);
}
