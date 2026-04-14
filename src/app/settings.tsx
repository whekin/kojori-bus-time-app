import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useQueryClient } from '@tanstack/react-query';
import { APP_PALETTES, BottomTabInset, alpha, type AppPaletteId, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useSettings } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import { useTtcOfflineStatus } from '@/hooks/use-ttc-offline';
import { StopInfo } from '@/services/ttc';
import {
  ROUTE_POLYLINES_CACHE_TTL,
  ROUTE_STOPS_CACHE_TTL,
  SCHEDULE_CACHE_TTL,
  STOP_NAMES_CACHE_TTL,
  warmTtcOfflineData,
} from '@/services/ttc-offline';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });
const PALETTE_IDS = Object.keys(APP_PALETTES) as AppPaletteId[];
const PALETTE_CARD_WIDTH = 250;
const PALETTE_CARD_GAP = 12;

function useStyles() {
  const colors = useAppColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const modalStyles = useMemo(() => createModalStyles(colors), [colors]);

  return { colors, styles, modalStyles };
}

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
  const { modalStyles, colors } = useStyles();
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
      ...enriched.filter(s => favoriteSet.has(s.id)),
      ...enriched.filter(s => !favoriteSet.has(s.id)),
    ];
    if (!query) return all;
    return all.filter(s => s.label.toLowerCase().includes(query) || s.id.includes(query));
  }, [enriched, favoriteSet, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[modalStyles.screen, { paddingTop: insets.top }]}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.backBtn} hitSlop={12}>
            <Text style={modalStyles.backText}>←</Text>
          </Pressable>
          <Text style={modalStyles.headerTitle}>{title}</Text>
          <View style={modalStyles.backBtn} />
        </View>

        <View style={modalStyles.searchWrap}>
          <TextInput
            style={modalStyles.searchInput}
            placeholder="Search by name or stop ID…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {isLoading ? <ActivityIndicator color={colors.textDim} size="small" style={modalStyles.spinner} /> : null}
        </View>

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
                style={[modalStyles.stopRow, isFav && { backgroundColor: alpha(accentColor, '0C') }, disabled && modalStyles.disabled]}
                onPress={() => onToggle(item.id)}
                disabled={disabled}>
                <View style={[modalStyles.checkbox, isFav && { borderColor: accentColor, backgroundColor: alpha(accentColor, '22') }]}>
                  {isFav ? <View style={[modalStyles.checkmark, { backgroundColor: accentColor }]} /> : null}
                </View>
                <Text style={[modalStyles.stopLabel, isFav && { color: colors.text }]} numberOfLines={1}>
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
  const { styles } = useStyles();

  return (
    <View style={styles.card}>
      {favoriteIds.map((id, i) => {
        const shortId = id.split(':')[1];
        const label = stopNames[id] ?? `Stop #${shortId}`;

        return (
          <View key={id}>
            <View style={[styles.favRow, { backgroundColor: alpha(accentColor, '08') }]}>
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
            {i < favoriteIds.length - 1 ? <View style={styles.itemDivider} /> : null}
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

function WidgetStopCard({
  title,
  stopId,
  accentColor,
  stopNames,
  onManage,
}: {
  title: string;
  stopId: string;
  accentColor: string;
  stopNames: Record<string, string>;
  onManage: () => void;
}) {
  const { styles } = useStyles();
  const shortId = stopId.split(':')[1];
  const label = stopNames[stopId] ?? `Stop #${shortId}`;

  return (
    <View style={styles.card}>
      <View style={[styles.favRow, { backgroundColor: alpha(accentColor, '08') }]}>
        <View style={[styles.favDot, { backgroundColor: accentColor }]} />
        <View style={styles.widgetCopy}>
          <Text style={styles.widgetTitle}>{title}</Text>
          <Text style={styles.widgetValue} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={[styles.stopCodeInline, { fontFamily: MONO }]}>{shortId}</Text>
      </View>
      <View style={styles.itemDivider} />
      <Pressable style={styles.manageBtn} onPress={onManage}>
        <Text style={[styles.manageBtnText, { color: accentColor }]}>Change stop</Text>
      </Pressable>
    </View>
  );
}

function SingleStopPickerModal({
  visible,
  title,
  direction,
  selectedId,
  accentColor,
  stopNames,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  direction: 'toKojori' | 'toTbilisi';
  selectedId: string;
  accentColor: string;
  stopNames: Record<string, string>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const { modalStyles, colors } = useStyles();
  const { stops: routeStops, isLoading } = useRouteStops(direction);
  const insets = useSafeAreaInsets();
  const query = search.trim().toLowerCase();

  const enriched = useMemo<StopInfo[]>(
    () => routeStops.map(s => ({ id: s.id, label: stopNames[s.id] ?? s.label })),
    [routeStops, stopNames],
  );

  const filtered = useMemo(() => {
    if (!query) return enriched;
    return enriched.filter(s => s.label.toLowerCase().includes(query) || s.id.includes(query));
  }, [enriched, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[modalStyles.screen, { paddingTop: insets.top }]}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} style={modalStyles.backBtn} hitSlop={12}>
            <Text style={modalStyles.backText}>←</Text>
          </Pressable>
          <Text style={modalStyles.headerTitle}>{title}</Text>
          <View style={modalStyles.backBtn} />
        </View>

        <View style={modalStyles.searchWrap}>
          <TextInput
            style={modalStyles.searchInput}
            placeholder="Search by name or stop ID…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {isLoading ? <ActivityIndicator color={colors.textDim} size="small" style={modalStyles.spinner} /> : null}
        </View>

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
            const isSelected = item.id === selectedId;
            const shortId = item.id.split(':')[1];

            return (
              <Pressable
                style={[modalStyles.stopRow, isSelected && { backgroundColor: alpha(accentColor, '0C') }]}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}>
                <View style={[modalStyles.checkbox, isSelected && { borderColor: accentColor, backgroundColor: alpha(accentColor, '22') }]}>
                  {isSelected ? <View style={[modalStyles.checkmark, { backgroundColor: accentColor }]} /> : null}
                </View>
                <Text style={[modalStyles.stopLabel, isSelected && { color: colors.text }]} numberOfLines={1}>
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

function PaletteCard({
  paletteId,
  selected,
  onSelect,
}: {
  paletteId: AppPaletteId;
  selected: boolean;
  onSelect: (paletteId: AppPaletteId) => void;
}) {
  const { styles } = useStyles();
  const palette = APP_PALETTES[paletteId];
  const selectedProgress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected, selectedProgress]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(selectedProgress.value, [0, 1], [0.97, 1]) },
      { translateY: interpolate(selectedProgress.value, [0, 1], [0, -2]) },
    ],
    borderColor: interpolateColor(selectedProgress.value, [0, 1], [palette.border, palette.primary]),
    shadowOpacity: interpolate(selectedProgress.value, [0, 1], [0.14, 0.26]),
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(selectedProgress.value, [0, 1], [0.28, 1]),
    transform: [{ scale: interpolate(selectedProgress.value, [0, 1], [0.92, 1]) }],
  }));

  return (
    <Pressable onPress={() => onSelect(paletteId)}>
      <Animated.View
        style={[
          styles.paletteCard,
          {
            backgroundColor: palette.surface,
            shadowColor: palette.primary,
          },
          animatedCardStyle,
        ]}>
        <Animated.View style={[styles.paletteGlow, { backgroundColor: alpha(palette.primary, '22') }, animatedGlowStyle]} />
        <Animated.View style={[styles.paletteGlowSecondary, { backgroundColor: alpha(palette.route380, '18') }, animatedGlowStyle]} />

        <View style={[styles.palettePreview, { backgroundColor: palette.bg, borderColor: palette.border }]}>
          <View style={[styles.palettePreviewTop, { backgroundColor: palette.panelHigh }]} />
          <View style={[styles.palettePreviewAccent, { backgroundColor: palette.route380 }]} />
          <View style={[styles.palettePreviewAccentAlt, { backgroundColor: palette.route316 }]} />
          <View style={[styles.palettePreviewChip, { borderColor: alpha(palette.primary, '55'), backgroundColor: alpha(palette.primary, '14') }]} />
        </View>

        <View style={styles.paletteMeta}>
          <View style={styles.paletteHeaderRow}>
            <Text style={[styles.paletteName, { color: palette.text, fontFamily: DISPLAY }]}>{palette.name}</Text>
            {selected ? <Text style={[styles.paletteSelected, { color: palette.primary }]}>LIVE</Text> : null}
          </View>
          <Text style={[styles.paletteTagline, { color: palette.textDim }]}>{palette.tagline}</Text>
          <View style={styles.paletteSwatches}>
            {[palette.primary, palette.route380, palette.route316].map((color, index) => (
              <View key={`${paletteId}-${index}-${color}`} style={[styles.paletteSwatch, { backgroundColor: color }]} />
            ))}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, styles } = useStyles();
  const { settings, toggleKojoriFavorite, toggleTbilisiFavorite, update } = useSettings();
  const stopNames = useStopNames();
  const offlineStatus = useTtcOfflineStatus();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modal, setModal] = useState<'kojori' | 'tbilisi' | 'widget-kojori' | 'widget-tbilisi' | null>(null);
  const paletteCarouselRef = useRef<ICarouselInstance>(null);
  const paletteIndex = Math.max(0, PALETTE_IDS.indexOf(settings.paletteId));
  const paletteCarouselWidth = Math.max(windowWidth, PALETTE_CARD_WIDTH + 40);

  useEffect(() => {
    paletteCarouselRef.current?.scrollTo({ index: paletteIndex, animated: true });
  }, [paletteIndex]);

  async function handleRefreshTimetables() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await warmTtcOfflineData(queryClient);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + BottomTabInset + 32 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.paletteHero}>
          <Text style={styles.paletteEyebrow}>LOOK & FEEL</Text>
          <Text style={styles.paletteHeadline}>Pick palette for whole app.</Text>
          <Text style={styles.paletteBody}>
            Three tuned color systems. Tabs, cards, route accents, badges, map traces, settings.
          </Text>
        </View>

        <View style={styles.paletteCarouselWrap}>
          <Carousel
            ref={paletteCarouselRef}
            loop={false}
            width={paletteCarouselWidth}
            height={230}
            data={PALETTE_IDS}
            defaultIndex={paletteIndex}
            pagingEnabled
            snapEnabled
            overscrollEnabled={false}
            style={styles.paletteCarousel}
            mode="parallax"
            modeConfig={{
              parallaxScrollingScale: 0.92,
              parallaxScrollingOffset: 84,
              parallaxAdjacentItemScale: 0.8,
            }}
            onSnapToItem={index => {
              const nextPaletteId = PALETTE_IDS[index];
              if (nextPaletteId && nextPaletteId !== settings.paletteId) {
                update({ paletteId: nextPaletteId });
              }
            }}
            renderItem={({ item: paletteId, index }) => (
              <View
                style={[
                  styles.paletteSlide,
                  index === 0 && styles.paletteSlideFirst,
                  index === PALETTE_IDS.length - 1 && styles.paletteSlideLast,
                ]}>
                <PaletteCard
                  paletteId={paletteId}
                  selected={settings.paletteId === paletteId}
                  onSelect={nextPaletteId => {
                    update({ paletteId: nextPaletteId });
                    paletteCarouselRef.current?.scrollTo({
                      index: PALETTE_IDS.indexOf(nextPaletteId),
                      animated: true,
                    });
                  }}
                />
              </View>
            )}
          />
        </View>

        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>KOJORI STOPS</Text>
          <Text style={styles.sectionNote}>Used for real-time arrivals when heading to Tbilisi.</Text>
        </View>
        <FavoritesCard
          favoriteIds={settings.kojoriFavorites}
          accentColor={colors.route316}
          stopNames={stopNames}
          canRemove={settings.kojoriFavorites.length > 1}
          onRemove={toggleKojoriFavorite}
          onManage={() => setModal('kojori')}
        />

        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>TBILISI DEPARTURE STOPS</Text>
          <Text style={styles.sectionNote}>Used for schedule when heading to Kojori. Most accurate at starting stop.</Text>
        </View>
        <FavoritesCard
          favoriteIds={settings.tbilisiFavorites}
          accentColor={colors.route380}
          stopNames={stopNames}
          canRemove={settings.tbilisiFavorites.length > 1}
          onRemove={toggleTbilisiFavorite}
          onManage={() => setModal('tbilisi')}
        />

        {Platform.OS === 'android' ? (
          <>
            <View style={styles.sectionMeta}>
              <Text style={styles.sectionHeader}>ANDROID WIDGET</Text>
              <Text style={styles.sectionNote}>Used by home-screen widget as default stop for each direction.</Text>
            </View>
            <WidgetStopCard
              title="→ Kojori default stop"
              stopId={settings.widgetTbilisiStopId}
              accentColor={colors.route380}
              stopNames={stopNames}
              onManage={() => setModal('widget-tbilisi')}
            />
            <View style={styles.sectionSpacer} />
            <WidgetStopCard
              title="→ Tbilisi default stop"
              stopId={settings.widgetKojoriStopId}
              accentColor={colors.route316}
              stopNames={stopNames}
              onManage={() => setModal('widget-kojori')}
            />
          </>
        ) : null}

        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>MAP</Text>
          <Text style={styles.sectionNote}>Route shape drawn on live map.</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleLabel}>Encoded polylines</Text>
              <Text style={styles.toggleNote}>Use API route geometry. Disable to fall back to stop-coordinate interpolation.</Text>
            </View>
            <Switch
              value={settings.useEncodedPolylines}
              onValueChange={value => update({ useEncodedPolylines: value })}
              trackColor={{ false: colors.border, true: alpha(colors.route316, 'aa') }}
              thumbColor={settings.useEncodedPolylines ? colors.route316 : colors.textDim}
            />
          </View>
        </View>

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
              <View style={[styles.miniTag, { borderColor: colors.route380 }]}>
                <Text style={[styles.miniTagText, { color: colors.route380, fontFamily: MONO }]}>380</Text>
              </View>
              <View style={[styles.miniTag, { borderColor: colors.route316 }]}>
                <Text style={[styles.miniTagText, { color: colors.route316, fontFamily: MONO }]}>316</Text>
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
            <Text style={styles.infoValue}>{offlineStatus.availableDatasets}/{offlineStatus.totalDatasets}</Text>
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
            <Text style={styles.infoValue}>{formatTtl(Math.max(ROUTE_STOPS_CACHE_TTL, STOP_NAMES_CACHE_TTL))}</Text>
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
          <View style={styles.itemDivider} />
          <Pressable
            style={[styles.manageBtn, isRefreshing && { opacity: 0.5 }]}
            onPress={handleRefreshTimetables}
            disabled={isRefreshing}>
            {isRefreshing
              ? <ActivityIndicator size="small" color={colors.route316} />
              : <Text style={[styles.manageBtnText, { color: colors.route316 }]}>Refresh timetables</Text>}
          </Pressable>
        </View>
      </ScrollView>

      <StopPickerModal
        visible={modal === 'kojori'}
        title="Kojori Stops"
        direction="toTbilisi"
        favoriteIds={settings.kojoriFavorites}
        accentColor={colors.route316}
        stopNames={stopNames}
        onToggle={toggleKojoriFavorite}
        onClose={() => setModal(null)}
      />
      <StopPickerModal
        visible={modal === 'tbilisi'}
        title="Tbilisi Departure Stops"
        direction="toKojori"
        favoriteIds={settings.tbilisiFavorites}
        accentColor={colors.route380}
        stopNames={stopNames}
        onToggle={toggleTbilisiFavorite}
        onClose={() => setModal(null)}
      />
      <SingleStopPickerModal
        visible={modal === 'widget-tbilisi'}
        title="Widget default for → Kojori"
        direction="toKojori"
        selectedId={settings.widgetTbilisiStopId}
        accentColor={colors.route380}
        stopNames={stopNames}
        onSelect={id => update({ widgetTbilisiStopId: id })}
        onClose={() => setModal(null)}
      />
      <SingleStopPickerModal
        visible={modal === 'widget-kojori'}
        title="Widget default for → Tbilisi"
        direction="toTbilisi"
        selectedId={settings.widgetKojoriStopId}
        accentColor={colors.route316}
        stopNames={stopNames}
        onSelect={id => update({ widgetKojoriStopId: id })}
        onClose={() => setModal(null)}
      />
    </View>
  );
}

function createStyles(C: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
    headerTitle: { color: C.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20 },

    paletteHero: { marginTop: 22, marginBottom: 16, gap: 6 },
    paletteEyebrow: { color: C.primary, fontSize: 10, fontWeight: '800', letterSpacing: 2.8 },
    paletteHeadline: { color: C.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.7 },
    paletteBody: { color: C.textDim, fontSize: 13, lineHeight: 18, maxWidth: 320 },
    paletteCarouselWrap: { marginHorizontal: -20, marginBottom: 4 },
    paletteCarousel: { overflow: 'visible' },
    paletteSlide: {
      width: PALETTE_CARD_WIDTH,
      paddingTop: 8,
      paddingBottom: 14,
      justifyContent: 'center',
    },
    paletteSlideFirst: { paddingLeft: 20 },
    paletteSlideLast: { paddingRight: 20 },
    paletteCard: {
      width: PALETTE_CARD_WIDTH,
      minHeight: 206,
      borderRadius: 24,
      borderWidth: 1,
      padding: 16,
      overflow: 'visible',
      justifyContent: 'space-between',
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
      marginHorizontal: PALETTE_CARD_GAP / 2,
    },
    paletteGlow: {
      position: 'absolute',
      width: 150,
      height: 150,
      borderRadius: 999,
      top: -38,
      right: -28,
    },
    paletteGlowSecondary: {
      position: 'absolute',
      width: 110,
      height: 110,
      borderRadius: 999,
      bottom: 22,
      left: -22,
    },
    palettePreview: {
      height: 94,
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
      padding: 10,
      justifyContent: 'space-between',
    },
    palettePreviewTop: { width: '68%', height: 16, borderRadius: 999 },
    palettePreviewAccent: { width: '100%', height: 18, borderRadius: 999 },
    palettePreviewAccentAlt: { width: '74%', height: 12, borderRadius: 999 },
    palettePreviewChip: { width: 54, height: 20, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-end' },
    paletteMeta: { gap: 8 },
    paletteHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    paletteName: { fontSize: 20, fontWeight: '700' },
    paletteSelected: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
    paletteTagline: { fontSize: 12, lineHeight: 17 },
    paletteSwatches: { flexDirection: 'row', gap: 8 },
    paletteSwatch: { width: 24, height: 24, borderRadius: 999 },

    sectionMeta: { marginTop: 24, marginBottom: 10, gap: 4 },
    sectionHeader: { color: C.textFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 },
    sectionNote: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    sectionSpacer: { height: 12 },

    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
    favRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 10 },
    favDot: { width: 7, height: 7, borderRadius: 3.5, flexShrink: 0 },
    favLabel: { flex: 1, color: C.text, fontSize: 15, fontWeight: '500' },
    widgetCopy: { flex: 1, gap: 2 },
    widgetTitle: { color: C.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
    widgetValue: { color: C.text, fontSize: 15, fontWeight: '500' },
    removeBtn: { padding: 4 },
    removeBtnDisabled: { opacity: 0.2 },
    removeText: { fontSize: 13, fontWeight: '700' },
    stopCodeInline: { color: C.textFaint, fontSize: 12, flexShrink: 0 },
    manageBtn: { paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center' },
    manageBtnText: { fontSize: 14, fontWeight: '600' },
    itemDivider: { height: 1, backgroundColor: C.border, marginLeft: 16 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
    toggleCopy: { flex: 1, gap: 3 },
    toggleLabel: { color: C.text, fontSize: 15, fontWeight: '500' },
    toggleNote: { color: C.textDim, fontSize: 12, lineHeight: 17 },

    infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
    infoLabel: { color: C.textDim, fontSize: 14, fontWeight: '500' },
    infoValue: { color: C.text, fontSize: 14, fontWeight: '500' },
    infoValueWrap: { flex: 1, textAlign: 'right' },
    infoTags: { flexDirection: 'row', gap: 6 },
    miniTag: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    miniTagText: { fontSize: 12, fontWeight: '700' },
  });
}

function createModalStyles(C: AppColors) {
  return StyleSheet.create({
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
}
