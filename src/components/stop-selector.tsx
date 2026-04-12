import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const C = {
  surface: '#111316',
  border: '#1E2128',
  text: '#EDEAE4',
  textDim: '#565C6B',
  textFaint: '#2C3040',
} as const;

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

interface StopSelectorItem {
  id: string;
  label: string;
}

interface StopSelectorProps {
  stops: StopSelectorItem[];
  activeStopId: string;
  accentColor: string;
  onSelectStop: (id: string) => void;
  label?: string;
}

export function StopSelector({
  stops,
  activeStopId,
  accentColor,
  onSelectStop,
  label = 'BOARDING STOP',
}: StopSelectorProps) {
  const activeIndex = Math.max(
    0,
    stops.findIndex(stop => stop.id === activeStopId),
  );
  const activeStop = stops[activeIndex] ?? stops[0];

  if (!activeStop) return null;

  const handleShift = (delta: number) => {
    if (stops.length <= 1) return;
    const nextIndex = (activeIndex + delta + stops.length) % stops.length;
    onSelectStop(stops[nextIndex].id);
  };

  return (
    <View style={styles.root}>
      <Pressable
        style={[
          styles.navButton,
          stops.length <= 1 && styles.navButtonDisabled,
          { borderColor: accentColor + '35' },
        ]}
        disabled={stops.length <= 1}
        onPress={() => handleShift(-1)}>
        <Text style={[styles.navGlyph, { color: stops.length <= 1 ? C.textFaint : accentColor }]}>‹</Text>
      </Pressable>

      <View style={[styles.main, { borderColor: accentColor + '30', backgroundColor: accentColor + '10' }]}>
        <View style={styles.labelRow}>
          <Text style={styles.eyebrow}>{label}</Text>
          <Text style={[styles.count, { color: accentColor, fontFamily: MONO }]}>
            {String(activeIndex + 1).padStart(2, '0')} / {String(stops.length).padStart(2, '0')}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {activeStop.label}
        </Text>
      </View>

      <Pressable
        style={[
          styles.navButton,
          stops.length <= 1 && styles.navButtonDisabled,
          { borderColor: accentColor + '35' },
        ]}
        disabled={stops.length <= 1}
        onPress={() => handleShift(1)}>
        <Text style={[styles.navGlyph, { color: stops.length <= 1 ? C.textFaint : accentColor }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  main: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  count: { fontSize: 11, fontWeight: '700' },
  title: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 4 },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  navButtonDisabled: { borderColor: C.border, opacity: 0.5 },
  navGlyph: { fontSize: 18, fontWeight: '700', marginTop: -1 },
});
