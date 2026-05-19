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
          borderColor: pressed ? alpha(accentColor, '55') : colors.border,
          backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
        },
      ]}>
      <View style={[styles.directionRouteSegment, { backgroundColor: accentColor }]}>
        <Text
          style={styles.directionRouteText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}>
          {origin}
        </Text>
        <MaterialCommunityIcons name="arrow-right" size={14} color="#fff" />
        <Text
          style={styles.directionRouteText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}>
          {destination}
        </Text>
      </View>
      <View style={styles.directionSwapSegment}>
        <MaterialCommunityIcons name="swap-horizontal" size={17} color={colors.textDim} />
      </View>
    </Pressable>
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

  function handleOpenStopPicker(event?: GestureResponderEvent) {
    event?.stopPropagation();

    if (totalStops > 1) {
      setOpen(true);
      return;
    }

    if (addStopModal) {
      setAddOpen(true);
      return;
    }

    onAddStop?.();
  }

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
        onPress={handleOpenStopPicker}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: pressed ? accentColor + '55' : accentColor + '34',
            backgroundColor: colors.surface,
          },
        ]}>
        <View style={styles.triggerMain}>
          <View style={styles.triggerTopRow}>
            <Text style={styles.triggerLabel}>{resolvedLabel}</Text>
            {showDirectionSwitch ? <DirectionSwitch accentColor={accentColor} /> : null}
          </View>
          <View style={styles.triggerTitleRow}>
            <View style={[
              styles.triggerStopIcon,
              {
                borderColor: accentColor + '35',
                backgroundColor: accentColor + '10',
              },
            ]}>
              <MaterialCommunityIcons name="bus-stop" size={24} color={accentColor} />
            </View>
            <Text
              style={[styles.triggerValue, { fontFamily: DISPLAY }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.82}>
              {activeStop.label}
            </Text>
          </View>
          <View style={[styles.triggerInnerDivider, { backgroundColor: accentColor + '32' }]} />
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
            {totalStops > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('stopAccessibility', { label: resolvedLabel, stop: activeStop.label })}
                onPress={handleOpenStopPicker}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.changeStopButton,
                  {
                    borderColor: pressed ? accentColor + '40' : colors.border,
                    backgroundColor: pressed ? accentColor + '10' : colors.surfaceHigh,
                  },
                ]}>
                <MaterialCommunityIcons name="map-marker-outline" size={14} color={colors.textDim} />
                <Text style={styles.changeStopButtonText} numberOfLines={1}>
                  {t('stopChange')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('commonAdd')}
                onPress={handleOpenStopPicker}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.changeStopButton,
                  {
                    borderColor: pressed ? accentColor + '40' : colors.border,
                    backgroundColor: pressed ? accentColor + '10' : colors.surfaceHigh,
                  },
                ]}>
                <MaterialCommunityIcons name="plus" size={14} color={colors.textDim} />
                <Text style={styles.changeStopButtonText} numberOfLines={1}>
                  {t('commonAdd')}
                </Text>
              </Pressable>
            )}
          </View>
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
    minHeight: 108,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  triggerMain: {
    minWidth: 0,
    gap: 12,
  },
  triggerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  triggerLabel: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.1,
    flexShrink: 0,
  },
  triggerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  triggerStopIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  triggerValue: {
    color: C.text,
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
    flexShrink: 1,
    minWidth: 0,
  },
  triggerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  triggerInnerDivider: {
    height: 1.5,
    marginHorizontal: 6,
    marginVertical: 1,
    borderRadius: 999,
  },
  directionSwitch: {
    height: 38,
    maxWidth: 224,
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  directionRouteSegment: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
    flexShrink: 1,
  },
  directionRouteText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
    minWidth: 28,
  },
  directionSwapSegment: {
    width: 34,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
  changeStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 160,
  },
  changeStopButtonText: {
    color: C.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
    flexShrink: 1,
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
