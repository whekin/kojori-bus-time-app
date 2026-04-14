import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  backdrop: 'rgba(4, 5, 8, 0.68)',
  surface: '#111316',
  surfaceHigh: '#18191E',
  surfaceRaised: '#1C2027',
  border: '#1E2128',
  borderStrong: '#2A2F3A',
  text: '#EDEAE4',
  textDim: '#565C6B',
  textFaint: '#2C3040',
} as const;

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });

interface StopSelectorItem {
  id: string;
  label: string;
}

interface StopSelectorProps {
  stops: StopSelectorItem[];
  activeStopId: string;
  accentColor: string;
  onSelectStop: (id: string) => void;
  onAddStop?: () => void;
  label?: string;
}

function formatIndex(index: number) {
  return String(index + 1).padStart(2, '0');
}

function formatCount(currentIndex: number, total: number) {
  return `${formatIndex(currentIndex)} / ${formatIndex(total - 1)}`;
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: isActive ? accentColor + '55' : C.border,
          backgroundColor: isActive ? accentColor + '10' : C.surfaceRaised,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <View style={styles.optionRail}>
        <View
          style={[
            styles.optionDot,
            {
              backgroundColor: isActive ? accentColor : C.borderStrong,
              borderColor: isActive ? accentColor + 'aa' : C.borderStrong,
            },
          ]}
        />
        {index < total - 1 ? (
          <View
            style={[
              styles.optionLine,
              { backgroundColor: isActive ? accentColor + '40' : C.border },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.optionCopy}>
        <View style={styles.optionMeta}>
          <Text style={styles.optionEyebrow}>STOP {formatIndex(index)}</Text>
          <Text style={[styles.optionState, { color: isActive ? accentColor : C.textDim, fontFamily: MONO }]}>
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

export function StopSelector({
  stops,
  activeStopId,
  accentColor,
  onSelectStop,
  onAddStop,
  label = 'BOARDING STOP',
}: StopSelectorProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${activeStop.label}. Double tap to change stop.`}
        onPress={() => totalStops > 1 ? setOpen(true) : onAddStop?.()}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: accentColor + '34',
            backgroundColor: pressed ? C.surfaceHigh : C.surface,
          },
        ]}>
        <View style={styles.triggerMain}>
          <Text style={styles.triggerLabel}>{label}</Text>
          <Text style={[styles.triggerValue, { fontFamily: DISPLAY }]} numberOfLines={1}>
            {activeStop.label}
          </Text>
          <Text style={[styles.triggerCode, { fontFamily: MONO }]}>{stopCode(activeStop.id)}</Text>
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
            <Text style={[styles.triggerAction, { color: accentColor }]}>+ Add</Text>
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
              {optionList}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  triggerLabel: {
    color: C.textFaint,
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
  triggerSide: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 6,
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.backdrop,
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
