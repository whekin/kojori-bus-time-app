import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import { ALL_KOJORI_STOPS, ALL_TBILISI_STOPS, BUS_COLORS } from '@/services/ttc';

const C = {
  bg: '#09090B',
  surface: '#111316',
  border: '#1E2128',
  borderStrong: '#2A2F3A',
  text: '#EDEAE4',
  textDim: '#565C6B',
  textFaint: '#2C3040',
  amber: BUS_COLORS['380'],
  teal: BUS_COLORS['316'],
} as const;

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.sectionMeta}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
    </View>
  );
}

function StopToggleRow({
  label,
  stopId,
  isFavorite,
  accentColor,
  canRemove,
  onToggle,
}: {
  label: string;
  stopId: string;
  isFavorite: boolean;
  accentColor: string;
  canRemove: boolean;
  onToggle: () => void;
}) {
  const shortId = stopId.split(':')[1];
  return (
    <Pressable
      style={[styles.stopRow, isFavorite && { backgroundColor: accentColor + '0A' }]}
      onPress={onToggle}
      disabled={isFavorite && !canRemove}>
      <View style={styles.stopRowLeft}>
        <View style={[styles.checkbox, isFavorite && { borderColor: accentColor, backgroundColor: accentColor + '20' }]}>
          {isFavorite && (
            <View style={[styles.checkmark, { backgroundColor: accentColor }]} />
          )}
        </View>
        <Text style={[styles.stopLabel, isFavorite && { color: C.text }]}>{label}</Text>
      </View>
      <Text style={[styles.stopId, { fontFamily: MONO }]}>{shortId}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, toggleKojoriFavorite, toggleTbilisiFavorite } = useSettings();
  const stopNames = useStopNames();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + BottomTabInset + 32 }]}
        showsVerticalScrollIndicator={false}>

        {/* ── Kojori stops ── */}
        <SectionHeader
          title="KOJORI STOPS"
          note="Checked stops appear as quick-select chips when heading to Tbilisi. At least one must stay checked."
        />
        <View style={styles.card}>
          {ALL_KOJORI_STOPS.map((s, i) => {
            const isFav = settings.kojoriFavorites.includes(s.id);
            return (
              <View key={s.id}>
                <StopToggleRow
                  label={stopNames[s.id] ?? s.label}
                  stopId={s.id}
                  isFavorite={isFav}
                  accentColor={C.teal}
                  canRemove={settings.kojoriFavorites.length > 1}
                  onToggle={() => toggleKojoriFavorite(s.id)}
                />
                {i < ALL_KOJORI_STOPS.length - 1 && <View style={styles.itemDivider} />}
              </View>
            );
          })}
        </View>

        {/* ── Tbilisi departure stops ── */}
        <SectionHeader
          title="TBILISI DEPARTURE STOPS"
          note="Checked stops appear as chips when heading to Kojori. Schedule is most accurate at Baratashvili St (starting stop)."
        />
        <View style={styles.card}>
          {ALL_TBILISI_STOPS.map((s, i) => {
            const isFav = settings.tbilisiFavorites.includes(s.id);
            return (
              <View key={s.id}>
                <StopToggleRow
                  label={stopNames[s.id] ?? s.label}
                  stopId={s.id}
                  isFavorite={isFav}
                  accentColor={C.amber}
                  canRemove={settings.tbilisiFavorites.length > 1}
                  onToggle={() => toggleTbilisiFavorite(s.id)}
                />
                {i < ALL_TBILISI_STOPS.length - 1 && <View style={styles.itemDivider} />}
              </View>
            );
          })}
        </View>

        {/* ── Data info ── */}
        <SectionHeader title="DATA SOURCE" />
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Provider</Text>
            <Text style={styles.infoValue}>TTC (Tbilisi Transport)</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Routes</Text>
            <View style={styles.infoTags}>
              <View style={[styles.miniTag, { borderColor: C.amber }]}>
                <Text style={[styles.miniTagText, { color: C.amber, fontFamily: MONO }]}>380</Text>
              </View>
              <View style={[styles.miniTag, { borderColor: C.teal }]}>
                <Text style={[styles.miniTagText, { color: C.teal, fontFamily: MONO }]}>316</Text>
              </View>
            </View>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Schedule cache</Text>
            <Text style={styles.infoValue}>12 h</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Real-time refresh</Text>
            <Text style={styles.infoValue}>Every 30 s</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  sectionMeta: { marginTop: 24, marginBottom: 10, gap: 4 },
  sectionHeader: {
    color: C.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  sectionNote: { color: C.textDim, fontSize: 12, lineHeight: 17 },

  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  stopRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { width: 10, height: 10, borderRadius: 2 },
  stopLabel: { color: C.textDim, fontSize: 15, fontWeight: '500', flex: 1 },
  stopId: { color: C.textFaint, fontSize: 12 },

  itemDivider: { height: 1, backgroundColor: C.border, marginLeft: 18 },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  infoLabel: { color: C.textDim, fontSize: 14, fontWeight: '500' },
  infoValue: { color: C.text, fontSize: 14, fontWeight: '500' },
  infoTags: { flexDirection: 'row', gap: 6 },
  miniTag: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  miniTagText: { fontSize: 12, fontWeight: '700' },
});
