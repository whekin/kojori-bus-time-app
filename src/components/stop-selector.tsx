import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StopPickerModal } from '@/components/stop-picker-modal';
import { useAppColors } from '@/hooks/use-app-colors';

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
}

function formatIndex(index: number) {
  return String(index + 1).padStart(2, '0');
}

function formatCount(currentIndex: number, total: number) {
  return `${formatIndex(currentIndex)} / ${formatIndex(total)}`;
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m away`;
  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10_000 ? 1 : 0)} km away`;
}

function StopOption({
  stop,
  index,
  total,
  isActive,
  accentColor,
  onPress,
}: {
  stop: StopSelectorItem;
  index: number;
  total: number;
  isActive: boolean;
  accentColor: string;
  onPress: () => void;
}) {
  const colors = useAppColors();
  const styles = useStopSelectorStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: isActive ? accentColor + '55' : colors.border,
          backgroundColor: isActive ? accentColor + '10' : colors.surfaceRaised,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <View style={styles.optionRail}>
        <View
          style={[
            styles.optionDot,
            {
              backgroundColor: isActive ? accentColor : colors.borderStrong,
              borderColor: isActive ? accentColor + 'aa' : colors.borderStrong,
            },
          ]}
        />
        {index < total - 1 ? (
          <View
            style={[
              styles.optionLine,
              { backgroundColor: isActive ? accentColor + '40' : colors.border },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.optionCopy}>
        <View style={styles.optionMeta}>
          <Text style={styles.optionEyebrow}>STOP {formatIndex(index)}</Text>
          <Text style={[styles.optionState, { color: isActive ? accentColor : colors.textDim, fontFamily: MONO }]}>
            {isActive ? 'CURRENT' : 'SWITCH'}
          </Text>
        </View>
        <Text style={[styles.optionTitle, { fontFamily: DISPLAY }]} numberOfLines={2}>
          {stop.label}
        </Text>
        <Text style={[styles.optionCode, { fontFamily: MONO }]}>#{stop.id.split(':')[1] ?? stop.id}</Text>
      </View>
    </Pressable>
  );
}

function stopCode(id: string) {
  return '#' + (id.split(':')[1] ?? id);
}

function stopDestination(stop: StopSelectorItem) {
  if (typeof stop.lat === 'number' && typeof stop.lon === 'number') {
    return `${stop.lat},${stop.lon}`;
  }

  return `${stop.label}, Tbilisi, Georgia`;
}

export function StopSelector({
  stops,
  activeStopId,
  accentColor,
  onSelectStop,
  locationSuggestion,
  onAddStop,
  addStopModal,
  label = 'BOARDING STOP',
}: StopSelectorProps) {
  const colors = useAppColors();
  const styles = useStopSelectorStyles();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const activeIndex = Math.max(0, stops.findIndex(stop => stop.id === activeStopId));
  const activeStop = stops[activeIndex] ?? stops[0];
  const totalStops = stops.length;

  const optionList = useMemo(
    () =>
      stops.map((stop, index) => {
        const isActive = stop.id === activeStop?.id;

        return (
          <StopOption
            key={stop.id}
            stop={stop}
            index={index}
            total={totalStops}
            isActive={isActive}
            accentColor={accentColor}
            onPress={() => {
              if (!isActive) onSelectStop(stop.id);
              setOpen(false);
            }}
          />
        );
      }),
    [accentColor, activeStop?.id, onSelectStop, stops, totalStops],
  );

  if (!activeStop) return null;

  async function handleOpenRoute() {
    const destination = stopDestination(activeStop);
    const encodedDestination = encodeURIComponent(destination);
    const appUrl = `comgooglemaps://?daddr=${encodedDestination}&directionsmode=walking`;
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}&travelmode=walking`;

    try {
      const canUseGoogleMaps = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canUseGoogleMaps ? appUrl : webUrl);
    } catch {
      await Linking.openURL(webUrl);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${activeStop.label}. Double tap to change stop.`}
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
            borderColor: accentColor + '34',
            backgroundColor: pressed ? colors.surfaceHigh : colors.surface,
          },
        ]}>
        <View style={styles.triggerMain}>
          <View style={styles.triggerTopRow}>
            <Text style={styles.triggerLabel}>{label}</Text>
          </View>
          <Text style={[styles.triggerValue, { fontFamily: DISPLAY }]} numberOfLines={1}>
            {activeStop.label}
          </Text>
          <View style={styles.triggerBottomRow}>
            <Text style={[styles.triggerCode, { fontFamily: MONO }]}>{stopCode(activeStop.id)}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleOpenRoute}
              hitSlop={8}
              style={[
                styles.routeButton,
                {
                  borderColor: accentColor + '30',
                  backgroundColor: accentColor + '10',
                },
              ]}>
              <MaterialCommunityIcons name="walk" size={14} color={accentColor} />
              <Text style={[styles.routeButtonText, { color: accentColor }]}>Route</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.triggerSide}>
          {totalStops > 1 ? (
            <>
              <View
                style={[
                  styles.triggerCount,
                  {
                    borderColor: accentColor + '30',
                    backgroundColor: accentColor + '10',
                  },
                ]}>
                <Text style={[styles.triggerCountText, { color: accentColor, fontFamily: MONO }]}>
                  {formatCount(activeIndex, totalStops)}
                </Text>
              </View>
              <Text style={[styles.triggerAction, { color: accentColor }]}>Change</Text>
            </>
          ) : (
            <View style={styles.triggerActionSolo}>
              <Text style={[styles.triggerAction, { color: accentColor }]}>+ Add</Text>
            </View>
          )}
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View
            style={[
              styles.sheet,
                {
                  paddingBottom: Math.max(insets.bottom, 16),
                },
            ]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetCopy}>
                <Text style={styles.sheetEyebrow}>{label}</Text>
                <Text style={styles.sheetTitle}>Choose the stop you are tracking</Text>
                <Text style={styles.sheetNote}>
                  The selected stop controls the departures shown on this screen.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close stop picker"
                hitSlop={10}
                onPress={() => setOpen(false)}
                style={styles.closeButton}>
                <Text style={styles.closeGlyph}>×</Text>
              </Pressable>
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
                <Text style={styles.currentLabel}>CURRENT STOP</Text>
                <Text style={[styles.currentValue, { fontFamily: DISPLAY }]} numberOfLines={1}>
                  {activeStop.label}
                </Text>
                <Text style={[styles.currentCode, { fontFamily: MONO }]}>{stopCode(activeStop.id)}</Text>
              </View>
              {totalStops > 1 && (
                <Text style={[styles.currentCount, { color: accentColor, fontFamily: MONO }]}>
                  {formatCount(activeIndex, totalStops)}
                </Text>
              )}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.optionsContent}>
              {locationSuggestion ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Use closest stop ${locationSuggestion.stop.label}`}
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
                    <Text style={styles.closestStopEyebrow}>CLOSEST STOP</Text>
                    <Text style={[styles.closestStopTitle, { fontFamily: DISPLAY }]} numberOfLines={2}>
                      {locationSuggestion.stop.label}
                    </Text>
                    <Text style={[styles.closestStopDistance, { fontFamily: MONO }]}>
                      {formatDistance(locationSuggestion.distanceMeters)}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={accentColor} />
                </Pressable>
              ) : null}
              {optionList}
              {addStopModal ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add another stop"
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
                    Add another stop
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 12,
  },
  triggerMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
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
  },
  triggerBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triggerSide: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    minWidth: 76,
  },
  triggerCount: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  triggerCountText: {
    fontSize: 12,
    fontWeight: '700',
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: `${C.bg}CC`,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.borderStrong,
    backgroundColor: C.surface,
    paddingTop: 10,
    paddingHorizontal: 18,
    maxHeight: '76%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: C.borderStrong,
    marginBottom: 14,
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
  currentCount: {
    fontSize: 12,
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
