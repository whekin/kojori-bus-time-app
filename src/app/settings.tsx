import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import { useTtcOfflineStatus } from '@/hooks/use-ttc-offline';
import { BUS_COLORS, StopInfo } from '@/services/ttc';
import {
  ROUTE_POLYLINES_CACHE_TTL,
  ROUTE_STOPS_CACHE_TTL,
  SCHEDULE_CACHE_TTL,
  STOP_NAMES_CACHE_TTL,
} from '@/services/ttc-offline';

const C = {
  bg: '#09090B',
  surface: '#111316',
  surfaceHigh: '#18191E',
  border: '#1E2128',
  borderStrong: '#2A2F3A',
  text: '#EDEAE4',
  textDim: '#565C6B',
  textFaint: '#2C3040',
  amber: BUS_COLORS['380'],
  teal: BUS_COLORS['316'],
} as const;

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

function formatTtl(ms: number) {
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

function formatLastSync(timestamp: number | null) {
  if (!timestamp) return 'Not yet';
  return new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatOfflineStatus(status: ReturnType<typeof useTtcOfflineStatus>) {
  if (status.status === 'warming') {
    return `Syncing ${status.completedSteps}/${status.totalSteps}`;
  }

  if (status.status === 'hydrating') {
    return 'Loading saved data';
  }

  if (status.availableDatasets === status.totalDatasets) {
    return 'Ready';
  }

  return `Partial ${status.availableDatasets}/${status.totalDatasets}`;
}

// ── Stop picker modal ─────────────────────────────────────────────────────────

function StopPickerModal({
  visible,
  title,
  direction,
  favoriteIds,
  accentColor,
  stopNames,
  onToggle,
  onClose,
}: {
  visible: boolean;
  title: string;
  direction: 'toKojori' | 'toTbilisi';
  favoriteIds: string[];
  accentColor: string;
  stopNames: Record<string, string>;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const { stops: routeStops, isLoading } = useRouteStops(direction);
  const insets = useSafeAreaInsets();

  const enriched = useMemo<StopInfo[]>(
    () => routeStops.map(s => ({ id: s.id, label: stopNames[s.id] ?? s.label })),
    [routeStops, stopNames],
  );

  const favoriteSet = new Set(favoriteIds);
  const query = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const all = [
      // Favorites first
      ...enriched.filter(s => favoriteSet.has(s.id)),
      // Then the rest
      ...enriched.filter(s => !favoriteSet.has(s.id)),
    ];
    if (!query) return all;
    return all.filter(s => s.label.toLowerCase().includes(query) || s.id.includes(query));
  }, [enriched, favoriteIds, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[modalStyles.screen, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.backBtn} hitSlop={12}>
            <Text style={modalStyles.backText}>←</Text>
          </Pressable>
          <Text style={modalStyles.headerTitle}>{title}</Text>
          <View style={modalStyles.backBtn} />
        </View>

        {/* Search */}
        <View style={modalStyles.searchWrap}>
          <TextInput
            style={modalStyles.searchInput}
            placeholder="Search by name or stop ID…"
            placeholderTextColor={C.textFaint}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {isLoading && <ActivityIndicator color={C.textDim} size="small" style={modalStyles.spinner} />}
        </View>

        {/* Stop list */}
        <FlatList
          data={filtered}
          keyExtractor={s => s.id}
          contentContainerStyle={[modalStyles.listContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={modalStyles.separator} />}
          ListEmptyComponent={
            <Text style={modalStyles.emptyText}>
              {isLoading ? 'Loading stops…' : 'No stops found'}
            </Text>
          }
          renderItem={({ item }) => {
            const isFav = favoriteSet.has(item.id);
            const disabled = isFav && favoriteIds.length === 1;
            const shortId = item.id.split(':')[1];
            return (
              <Pressable
                style={[modalStyles.stopRow, isFav && { backgroundColor: accentColor + '0C' }, disabled && modalStyles.disabled]}
                onPress={() => onToggle(item.id)}
                disabled={disabled}>
                <View style={[modalStyles.checkbox, isFav && { borderColor: accentColor, backgroundColor: accentColor + '22' }]}>
                  {isFav && <View style={[modalStyles.checkmark, { backgroundColor: accentColor }]} />}
                </View>
                <Text style={[modalStyles.stopLabel, isFav && { color: C.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[modalStyles.stopCode, { fontFamily: MONO }]}>{shortId}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

// ── Favorites card ────────────────────────────────────────────────────────────

function FavoritesCard({
  favoriteIds,
  accentColor,
  stopNames,
  canRemove,
  onRemove,
  onManage,
}: {
  favoriteIds: string[];
  accentColor: string;
  stopNames: Record<string, string>;
  canRemove: boolean;
  onRemove: (id: string) => void;
  onManage: () => void;
}) {
  return (
    <View style={styles.card}>
      {favoriteIds.map((id, i) => {
        const shortId = id.split(':')[1];
        const label = stopNames[id] ?? `Stop #${shortId}`;
        return (
          <View key={id}>
            <View style={[styles.favRow, { backgroundColor: accentColor + '08' }]}>
              <View style={[styles.favDot, { backgroundColor: accentColor }]} />
              <Text style={styles.favLabel} numberOfLines={1}>{label}</Text>
              <Pressable
                onPress={() => onRemove(id)}
                disabled={!canRemove}
                hitSlop={10}
                style={[styles.removeBtn, !canRemove && styles.removeBtnDisabled]}>
                <Text style={[styles.removeText, { color: accentColor }]}>✕</Text>
              </Pressable>
            </View>
            {i < favoriteIds.length - 1 && <View style={styles.itemDivider} />}
          </View>
        );
      })}
      <View style={styles.itemDivider} />
      <Pressable style={styles.manageBtn} onPress={onManage}>
        <Text style={[styles.manageBtnText, { color: accentColor }]}>+ Add stop</Text>
      </Pressable>
    </View>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, toggleKojoriFavorite, toggleTbilisiFavorite } = useSettings();
  const stopNames = useStopNames();
  const offlineStatus = useTtcOfflineStatus();

  const [modal, setModal] = useState<'kojori' | 'tbilisi' | null>(null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + BottomTabInset + 32 }]}
        showsVerticalScrollIndicator={false}>

        {/* Kojori stops */}
        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>KOJORI STOPS</Text>
          <Text style={styles.sectionNote}>Used for real-time arrivals when heading to Tbilisi.</Text>
        </View>
        <FavoritesCard
          favoriteIds={settings.kojoriFavorites}
          accentColor={C.teal}
          stopNames={stopNames}
          canRemove={settings.kojoriFavorites.length > 1}
          onRemove={toggleKojoriFavorite}
          onManage={() => setModal('kojori')}
        />

        {/* Tbilisi stops */}
        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>TBILISI DEPARTURE STOPS</Text>
          <Text style={styles.sectionNote}>Used for schedule when heading to Kojori. Most accurate at the starting stop.</Text>
        </View>
        <FavoritesCard
          favoriteIds={settings.tbilisiFavorites}
          accentColor={C.amber}
          stopNames={stopNames}
          canRemove={settings.tbilisiFavorites.length > 1}
          onRemove={toggleTbilisiFavorite}
          onManage={() => setModal('tbilisi')}
        />

        {/* Data info */}
        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>DATA SOURCE</Text>
        </View>
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
            <Text style={styles.infoLabel}>Offline cache</Text>
            <Text style={styles.infoValue}>{formatOfflineStatus(offlineStatus)}</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Saved datasets</Text>
            <Text style={styles.infoValue}>
              {offlineStatus.availableDatasets}/{offlineStatus.totalDatasets}
            </Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last offline sync</Text>
            <Text style={styles.infoValue}>{formatLastSync(offlineStatus.lastSyncAt)}</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Timetables</Text>
            <Text style={styles.infoValue}>{formatTtl(SCHEDULE_CACHE_TTL)}</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Stops + names</Text>
            <Text style={styles.infoValue}>
              {formatTtl(Math.max(ROUTE_STOPS_CACHE_TTL, STOP_NAMES_CACHE_TTL))}
            </Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Polylines</Text>
            <Text style={styles.infoValue}>{formatTtl(ROUTE_POLYLINES_CACHE_TTL)}</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Real-time refresh</Text>
            <Text style={styles.infoValue}>Every 30 s</Text>
          </View>
          {offlineStatus.error ? (
            <>
              <View style={styles.itemDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Offline sync note</Text>
                <Text style={[styles.infoValue, styles.infoValueWrap]}>{offlineStatus.error}</Text>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Modals */}
      <StopPickerModal
        visible={modal === 'kojori'}
        title="Kojori Stops"
        direction="toTbilisi"
        favoriteIds={settings.kojoriFavorites}
        accentColor={C.teal}
        stopNames={stopNames}
        onToggle={toggleKojoriFavorite}
        onClose={() => setModal(null)}
      />
      <StopPickerModal
        visible={modal === 'tbilisi'}
        title="Tbilisi Departure Stops"
        direction="toKojori"
        favoriteIds={settings.tbilisiFavorites}
        accentColor={C.amber}
        stopNames={stopNames}
        onToggle={toggleTbilisiFavorite}
        onClose={() => setModal(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { color: C.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  sectionMeta: { marginTop: 24, marginBottom: 10, gap: 4 },
  sectionHeader: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 },
  sectionNote: { color: C.textDim, fontSize: 12, lineHeight: 17 },

  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },

  favRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
  favDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
  favLabel: { flex: 1, color: C.text, fontSize: 15, fontWeight: '500' },
  removeBtn: { padding: 4 },
  removeBtnDisabled: { opacity: 0.2 },
  removeText: { fontSize: 13, fontWeight: '700' },

  manageBtn: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
  manageBtnText: { fontSize: 14, fontWeight: '600' },

  itemDivider: { height: 1, backgroundColor: C.border, marginLeft: 16 },

  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
  infoLabel: { color: C.textDim, fontSize: 14, fontWeight: '500' },
  infoValue: { color: C.text, fontSize: 14, fontWeight: '500' },
  infoValueWrap: { flex: 1, textAlign: 'right' },
  infoTags: { flexDirection: 'row', gap: 6 },
  miniTag: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  miniTagText: { fontSize: 12, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backText: { color: C.text, fontSize: 22 },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: '600' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 14,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 12 },
  spinner: { marginLeft: 8 },

  listContent: { paddingHorizontal: 16 },
  separator: { height: 1, backgroundColor: C.border, marginLeft: 48 },

  stopRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  disabled: { opacity: 0.3 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkmark: { width: 10, height: 10, borderRadius: 2 },
  stopLabel: { flex: 1, color: C.textDim, fontSize: 15, fontWeight: '500' },
  stopCode: { color: C.textFaint, fontSize: 12, flexShrink: 0 },

  emptyText: { color: C.textFaint, textAlign: 'center', paddingVertical: 40, fontSize: 14 },
});
