import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import Animated, {
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Carousel, { ICarouselInstance } from 'react-native-reanimated-carousel';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BAKED_AT } from '@/assets/ttc-baked';
import { SettingsSwitch } from '@/components/settings-switch';
import { StopPickerModal } from '@/components/stop-picker-modal';
import {
  alpha,
  APP_PALETTES,
  BottomTabInset,
  getAppColors,
  type AppColors,
  type AppPaletteId,
  type AppThemeMode,
} from '@/constants/theme';
import { useAppColors, useResolvedAppThemeMode } from '@/hooks/use-app-colors';
import { useLocation } from '@/hooks/use-location';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useSettings, type LaunchBehavior } from '@/hooks/use-settings';
import { useStopNames } from '@/hooks/use-stop-names';
import { useTtcQueryLog } from '@/hooks/use-ttc-query-log';
import { useTtcOfflineStatus } from '@/hooks/use-ttc-offline';
import { StopInfo } from '@/services/ttc';
import {
    clearAllTtcCache,
    ROUTE_POLYLINES_CACHE_TTL,
    ROUTE_STOPS_CACHE_TTL,
    SCHEDULE_CACHE_TTL,
    STOP_NAMES_CACHE_TTL,
} from '@/services/ttc-offline';
import {
  calculateTtcQueryMetrics,
  clearTtcQueryLog,
  type TtcQueryLogEntry,
} from '@/services/ttc-query-log';
import { useQueryClient } from '@tanstack/react-query';
import KojoriWidget from '../../modules/kojori-widget';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });
const DISPLAY = Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' });
const APP_VERSION = Constants.expoConfig?.version ?? '2026.4.15';
const BUILD_NUMBER = Platform.select({
  android: String(Constants.expoConfig?.android?.versionCode ?? 1),
  ios: Constants.expoConfig?.ios?.buildNumber ?? '1',
  default: '1',
});
const EASTER_EGG_TAPS = 7;
const EASTER_EGG_MESSAGES = [
  'You found it! This app was made with love for Kojori commuters.',
  'Fun fact: Kojori is 1,340m above sea level.',
  'The bus drivers are the real heroes.',
  'Did you know? Route 380 has been running since Soviet times.',
  'Sakartvelos gaumarjos!',
];
const PALETTE_IDS = Object.keys(APP_PALETTES) as AppPaletteId[];
const PALETTE_CARD_WIDTH = 250;
const PALETTE_CARD_GAP = 12;
const THEME_MODE_OPTIONS: { value: AppThemeMode; label: string; caption: string }[] = [
  { value: 'system', label: 'System', caption: 'Follow device' },
  { value: 'light', label: 'Light', caption: 'Always bright' },
  { value: 'dark', label: 'Dark', caption: 'Always moody' },
];
const LAUNCH_BEHAVIOR_OPTIONS: { value: LaunchBehavior; label: string; caption: string }[] = [
  { value: 'ask', label: 'Ask me each time', caption: 'Always show the destination screen on open.' },
  { value: 'smart', label: 'Use my location', caption: 'Try location first, then fall back to asking if needed.' },
  { value: 'remember', label: 'Remember last direction', caption: 'Open straight into the last direction you used.' },
];
const LEGAL_BASE_URL = 'https://github.com/whekin/kojori-bus-time-app/blob/main/release/google-play';
const LEGAL_URLS = {
  privacyPolicy: Constants.expoConfig?.extra?.legal?.privacyPolicyUrl ?? `${LEGAL_BASE_URL}/privacy-policy.md`,
  support: Constants.expoConfig?.extra?.legal?.supportUrl ?? 'https://github.com/whekin/kojori-bus-time-app/issues',
  termsOfService: Constants.expoConfig?.extra?.legal?.termsOfServiceUrl ?? `${LEGAL_BASE_URL}/terms-of-service.md`,
} as const;
const LEGAL_DOC_MODULES = {
  privacy: require('../../assets/legal/privacy-policy.md'),
  terms: require('../../assets/legal/terms-of-service.md'),
} as const;

type LegalDocument = keyof typeof LEGAL_DOC_MODULES;
type NoticeModalState = {
  icon: string;
  title: string;
  message: string;
};

async function readBundledTextAsset(moduleId: number) {
  const asset = Asset.fromModule(moduleId);

  if (!asset.downloaded) {
    await asset.downloadAsync();
  }

  const uri = asset.localUri ?? asset.uri;

  if (!uri) {
    throw new Error('Missing bundled asset URI');
  }

  if (Platform.OS === 'web' || uri.startsWith('http://') || uri.startsWith('https://')) {
    const response = await fetch(uri);
    return response.text();
  }

  return new File(uri).text();
}

function formatLegalMarkdown(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .trim();
}

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

function formatBakedAt(timestamp: string) {
  return new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatQueryKind(kind: TtcQueryLogEntry['kind']) {
  switch (kind) {
    case 'arrivals':
      return 'Arrivals';
    case 'vehicle-positions':
      return 'Vehicles';
    case 'schedule':
      return 'Schedule';
    case 'route-stops':
      return 'Stops';
    case 'route-polylines':
      return 'Polylines';
    case 'stop-details':
      return 'Stop';
    default:
      return kind;
  }
}

function formatQueryAge(timestamp: number) {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatQueryDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function getQueryStatusLabel(entry: TtcQueryLogEntry) {
  if (entry.ok) {
    return entry.statusCode ? `${entry.statusCode}` : 'OK';
  }

  if (entry.statusCode) {
    return `HTTP ${entry.statusCode}`;
  }

  return entry.errorCode ?? 'ERROR';
}

function TtcQueryLogCard({
  entries,
  queriesLastMinute,
  queriesLastTenMinutes,
  totalErrors,
  onClear,
}: {
  entries: TtcQueryLogEntry[];
  queriesLastMinute: number;
  queriesLastTenMinutes: number;
  totalErrors: number;
  onClear: () => void;
}) {
  const { styles, colors } = useStyles();
  const visibleEntries = entries.slice(0, 18);

  return (
    <View style={styles.queryConsoleCard}>
      <View style={[styles.queryConsoleGlow, { backgroundColor: alpha(colors.primary, '15') }]} />
      <View style={[styles.queryConsoleGlowSecondary, { backgroundColor: alpha(colors.route380, '12') }]} />

      <View style={styles.queryConsoleHeader}>
        <View style={styles.queryConsoleCopy}>
          <Text style={styles.queryConsoleEyebrow}>TTC OBSERVABILITY</Text>
          <Text style={[styles.queryConsoleTitle, { fontFamily: DISPLAY }]}>Realtime calls only.</Text>
          <Text style={styles.queryConsoleBody}>
            Static schedules, stops, polylines, and known stop names now come from the bundled build. Normal live traffic should be arrivals on Departures and vehicle positions on Map.
          </Text>
        </View>
        <Pressable style={[styles.queryClearButton, { borderColor: colors.borderStrong }]} onPress={onClear}>
          <Text style={[styles.queryClearButtonText, { color: colors.text }]}>Clear logs</Text>
        </Pressable>
      </View>

      <View style={styles.queryMetricRow}>
        <View style={[styles.queryMetricTile, { backgroundColor: alpha(colors.primary, '0E') }]}>
          <Text style={styles.queryMetricValue}>{queriesLastMinute}</Text>
          <Text style={styles.queryMetricLabel}>queries / 1 min</Text>
        </View>
        <View style={[styles.queryMetricTile, { backgroundColor: alpha(colors.route380, '10') }]}>
          <Text style={styles.queryMetricValue}>{queriesLastTenMinutes}</Text>
          <Text style={styles.queryMetricLabel}>queries / 10 min</Text>
        </View>
        <View style={[styles.queryMetricTile, { backgroundColor: alpha(colors.route316, '10') }]}>
          <Text style={styles.queryMetricValue}>{totalErrors}</Text>
          <Text style={styles.queryMetricLabel}>errors saved</Text>
        </View>
      </View>

      <View style={styles.queryListWrap}>
        {visibleEntries.length === 0 ? (
          <View style={styles.queryEmptyState}>
            <Text style={styles.queryEmptyTitle}>No TTC requests captured yet.</Text>
            <Text style={styles.queryEmptyNote}>Open Departures or Map to generate live traffic, then return here.</Text>
          </View>
        ) : (
          visibleEntries.map((entry, index) => {
            const statusColor = entry.ok ? colors.route316 : colors.error;

            return (
              <View key={entry.id}>
                {index > 0 ? <View style={styles.queryDivider} /> : null}
                <View style={styles.queryRow}>
                  <View style={styles.queryRowTop}>
                    <View style={styles.queryRowLead}>
                      <Text style={styles.queryKind}>{formatQueryKind(entry.kind)}</Text>
                      <Text style={styles.queryAge}>{formatQueryAge(entry.finishedAt)}</Text>
                    </View>
                    <View style={[styles.queryStatusChip, { borderColor: alpha(statusColor, '40'), backgroundColor: alpha(statusColor, '12') }]}>
                      <Text style={[styles.queryStatusText, { color: statusColor }]}>{getQueryStatusLabel(entry)}</Text>
                    </View>
                  </View>
                  <Text style={styles.queryEndpoint} numberOfLines={1}>{entry.endpoint}</Text>
                  <View style={styles.queryMetaRow}>
                    <Text style={styles.queryMetaText}>{formatQueryDuration(entry.durationMs)}</Text>
                    <Text style={styles.queryMetaSeparator}>·</Text>
                    <Text style={styles.queryMetaText}>{new Date(entry.finishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
                    {!entry.ok && entry.errorCode ? (
                      <>
                        <Text style={styles.queryMetaSeparator}>·</Text>
                        <Text style={[styles.queryMetaText, { color: colors.error }]}>{entry.errorCode}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
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
  resolvedMode,
  onSelect,
}: {
  paletteId: AppPaletteId;
  selected: boolean;
  resolvedMode: 'light' | 'dark';
  onSelect: (paletteId: AppPaletteId) => void;
}) {
  const { styles } = useStyles();
  const darkPalette = getAppColors(paletteId, 'dark');
  const lightPalette = getAppColors(paletteId, 'light');
  const darkPreviewChipBorder = alpha(darkPalette.primary, '55');
  const lightPreviewChipBorder = alpha(lightPalette.primary, '55');
  const darkPreviewChipFill = alpha(darkPalette.primary, '14');
  const lightPreviewChipFill = alpha(lightPalette.primary, '14');
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const modeProgress = useSharedValue(resolvedMode === 'light' ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected, selectedProgress]);

  useEffect(() => {
    modeProgress.value = withTiming(resolvedMode === 'light' ? 1 : 0, { duration: 260 });
  }, [modeProgress, resolvedMode]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(selectedProgress.value, [0, 1], [0.97, 1]) },
      { translateY: interpolate(selectedProgress.value, [0, 1], [0, -2]) },
    ],
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.surface, lightPalette.surface]),
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [
        interpolateColor(modeProgress.value, [0, 1], [darkPalette.border, lightPalette.border]),
        interpolateColor(modeProgress.value, [0, 1], [darkPalette.primary, lightPalette.primary]),
      ],
    ),
    shadowColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.primary, lightPalette.primary]),
    shadowOpacity: interpolate(selectedProgress.value, [0, 1], [0.14, 0.26]),
  }));

  const animatedGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(selectedProgress.value, [0, 1], [0.28, 1]),
    transform: [{ scale: interpolate(selectedProgress.value, [0, 1], [0.92, 1]) }],
  }));

  const previewStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.bg, lightPalette.bg]),
    borderColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.border, lightPalette.border]),
  }));

  const previewTopStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.panelHigh, lightPalette.panelHigh]),
  }));

  const previewAccentStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.route380, lightPalette.route380]),
  }));

  const previewAccentAltStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.route316, lightPalette.route316]),
  }));

  const previewChipStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      modeProgress.value,
      [0, 1],
      [darkPreviewChipBorder, lightPreviewChipBorder],
    ),
    backgroundColor: interpolateColor(
      modeProgress.value,
      [0, 1],
      [darkPreviewChipFill, lightPreviewChipFill],
    ),
  }));

  const nameStyle = useAnimatedStyle(() => ({
    color: interpolateColor(modeProgress.value, [0, 1], [darkPalette.text, lightPalette.text]),
  }));

  const liveStyle = useAnimatedStyle(() => ({
    color: interpolateColor(modeProgress.value, [0, 1], [darkPalette.primary, lightPalette.primary]),
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    color: interpolateColor(modeProgress.value, [0, 1], [darkPalette.textDim, lightPalette.textDim]),
  }));

  const swatchPrimaryStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.primary, lightPalette.primary]),
  }));

  const swatchRoute380Style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.route380, lightPalette.route380]),
  }));

  const swatchRoute316Style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, [0, 1], [darkPalette.route316, lightPalette.route316]),
  }));

  return (
    <Pressable onPress={() => onSelect(paletteId)}>
      <Animated.View
        style={[
          styles.paletteCard,
          animatedCardStyle,
        ]}>
        <Animated.View
          style={[
            styles.paletteGlow,
            {
              backgroundColor: alpha(resolvedMode === 'light' ? lightPalette.primary : darkPalette.primary, '22'),
            },
            animatedGlowStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.paletteGlowSecondary,
            {
              backgroundColor: alpha(resolvedMode === 'light' ? lightPalette.route380 : darkPalette.route380, '18'),
            },
            animatedGlowStyle,
          ]}
        />

        <Animated.View style={[styles.palettePreview, previewStyle]}>
          <Animated.View style={[styles.palettePreviewTop, previewTopStyle]} />
          <Animated.View style={[styles.palettePreviewAccent, previewAccentStyle]} />
          <Animated.View style={[styles.palettePreviewAccentAlt, previewAccentAltStyle]} />
          <Animated.View style={[styles.palettePreviewChip, previewChipStyle]} />
        </Animated.View>

        <View style={styles.paletteMeta}>
          <View style={styles.paletteHeaderRow}>
            <Animated.Text style={[styles.paletteName, nameStyle, { fontFamily: DISPLAY }]}>
              {darkPalette.name}
            </Animated.Text>
            {selected ? <Animated.Text style={[styles.paletteSelected, liveStyle]}>LIVE</Animated.Text> : null}
          </View>
          <Animated.Text style={[styles.paletteTagline, taglineStyle]}>{darkPalette.tagline}</Animated.Text>
          <View style={styles.paletteSwatches}>
            <Animated.View style={[styles.paletteSwatch, swatchPrimaryStyle]} />
            <Animated.View style={[styles.paletteSwatch, swatchRoute380Style]} />
            <Animated.View style={[styles.paletteSwatch, swatchRoute316Style]} />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function ThemeModeCard({
  option,
  selected,
  colors,
  onSelect,
}: {
  option: { value: AppThemeMode; label: string; caption: string };
  selected: boolean;
  colors: AppColors;
  onSelect: (value: AppThemeMode) => void;
}) {
  const { styles } = useStyles();
  const selectedProgress = useSharedValue(selected ? 1 : 0);
  const selectedBackground = alpha(colors.primary, '14');

  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, { duration: 220 });
  }, [selected, selectedProgress]);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(selectedProgress.value, [0, 1], [colors.border, colors.primary]),
    backgroundColor: interpolateColor(selectedProgress.value, [0, 1], [colors.panel, selectedBackground]),
    transform: [{ translateY: interpolate(selectedProgress.value, [0, 1], [0, -1]) }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selectedProgress.value, [0, 1], [colors.textDim, colors.text]),
  }));

  const captionStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selectedProgress.value, [0, 1], [colors.textFaint, colors.primary]),
  }));

  return (
    <Pressable onPress={() => onSelect(option.value)} style={styles.themeModePressable}>
      <Animated.View style={[styles.themeModeButton, animatedStyle]}>
        <Animated.Text style={[styles.themeModeLabel, labelStyle]}>
          {option.label}
        </Animated.Text>
        <Animated.Text style={[styles.themeModeCaption, captionStyle]}>
          {option.caption}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, styles } = useStyles();
  const resolvedThemeMode = useResolvedAppThemeMode();
  const { settings, toggleKojoriFavorite, toggleTbilisiFavorite, update, hasManualDirectionOverride } = useSettings();
  const stopNames = useStopNames();
  const offlineStatus = useTtcOfflineStatus();
  const queryLog = useTtcQueryLog();
  const [queryMetricsNow, setQueryMetricsNow] = useState(() => Date.now());
  const queryClient = useQueryClient();
  const {
    permission,
    locationError,
    requestLocationAccess,
    isLocating,
  } = useLocation(settings.launchBehavior === 'smart');
  const [modal, setModal] = useState<'kojori' | 'tbilisi' | 'widget-kojori' | 'widget-tbilisi' | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [noticeModal, setNoticeModal] = useState<NoticeModalState | null>(null);
  const [easterEggTaps, setEasterEggTaps] = useState(0);
  const easterEggTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paletteCarouselRef = useRef<ICarouselInstance>(null);
  const paletteIndex = Math.max(0, PALETTE_IDS.indexOf(settings.paletteId));
  const paletteCarouselWidth = Math.max(windowWidth, PALETTE_CARD_WIDTH + 40);
  
  const [legalModal, setLegalModal] = useState<LegalDocument | null>(null);
  const [legalContent, setLegalContent] = useState<Record<LegalDocument, string>>({
    privacy: '',
    terms: '',
  });
  const [legalLoadError, setLegalLoadError] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => setQueryMetricsNow(Date.now()), 30_000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLegalDocs() {
      try {
        const [privacy, terms] = await Promise.all([
          readBundledTextAsset(LEGAL_DOC_MODULES.privacy),
          readBundledTextAsset(LEGAL_DOC_MODULES.terms),
        ]);

        if (cancelled) return;

        setLegalContent({ privacy, terms });
        setLegalLoadError(null);
      } catch {
        if (cancelled) return;
        setLegalLoadError('Failed to load this document.');
      }
    }

    void loadLegalDocs();

    return () => {
      cancelled = true;
    };
  }, []);

  const liveQueryMetrics = useMemo(
    () => calculateTtcQueryMetrics(queryLog.entries, queryMetricsNow),
    [queryLog.entries, queryMetricsNow],
  );

  useEffect(() => {
    paletteCarouselRef.current?.scrollTo({ index: paletteIndex, animated: true });
  }, [paletteIndex]);

  async function handleClearCache() {
    Alert.alert(
      'Clear Cache',
      'This will remove all cached data and settings. The app will reload to apply changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllTtcCache(queryClient);
              if (Platform.OS === 'web') {
                window.location.reload();
              } else {
                const Updates = require('expo-updates');
                await Updates.reloadAsync();
              }
            } catch {
              Alert.alert('Error', 'Failed to clear cache.');
            }
          },
        },
      ],
    );
  }

  function handleClearQueryLog() {
    Alert.alert(
      'Clear TTC logs',
      'Remove all persisted TTC request logs and metrics from this device?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void clearTtcQueryLog();
          },
        },
      ],
    );
  }

  function handleBuildTap() {
    if (easterEggTimerRef.current) clearTimeout(easterEggTimerRef.current);
    const next = easterEggTaps + 1;
    if (next >= EASTER_EGG_TAPS) {
      if (!settings.debugOptionsUnlocked) {
        update({ debugOptionsUnlocked: true });
        setNoticeModal({
          icon: '🛠️',
          title: 'Debug Options Unlocked',
          message: 'Extra debug controls are now visible in Settings.',
        });
        setEasterEggTaps(0);
        return;
      }
      const msg = EASTER_EGG_MESSAGES[Math.floor(Math.random() * EASTER_EGG_MESSAGES.length)];
      setNoticeModal({
        icon: '🚌',
        title: 'Kojori Time',
        message: msg,
      });
      setEasterEggTaps(0);
    } else {
      setEasterEggTaps(next);
      easterEggTimerRef.current = setTimeout(() => setEasterEggTaps(0), 2000);
    }
  }

  async function handleLaunchBehaviorSelect(value: LaunchBehavior) {
    update({ launchBehavior: value });

    if (value !== 'smart' || permission === 'granted') {
      return;
    }

    const result = await requestLocationAccess();
    if (result === 'blocked') {
      setShowPermissionModal(true);
    }
  }

  const launchBehaviorStatus = (() => {
    if (settings.launchBehavior === 'ask') {
      return {
        title: 'Ask every time',
        note: 'The start screen opens on each launch so the destination stays explicit.',
      };
    }

    if (settings.launchBehavior === 'remember') {
      return {
        title: 'Restore last direction',
        note: 'The app skips the start screen and opens directly into the last direction you used.',
      };
    }

    if (permission === 'granted') {
      if (hasManualDirectionOverride) {
        return {
          title: 'Using location with manual override',
          note: 'Launch will still try location first. Your current in-app direction stays manual until you ask for location again.',
        };
      }

      return {
        title: 'Using location on launch',
        note: 'The app will try your location first, then fall back to asking if detection is slow or unclear.',
      };
    }

    if (permission === 'denied') {
      return {
        title: 'Location permission is off',
        note: 'Use my location is selected, but launch will fall back to asking until permission is granted.',
      };
    }

    return {
      title: 'Location is not ready yet',
      note: 'Use my location is selected. Permission will be requested inline when available.',
    };
  })();

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
                  resolvedMode={resolvedThemeMode}
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
          <Text style={styles.sectionHeader}>COLOR MODE</Text>
          <Text style={styles.sectionNote}>
            Keep each palette, choose whether it runs in light, dark, or follows your device.
          </Text>
        </View>
        <View style={styles.card}>
          <View style={styles.themeModeRow}>
            {THEME_MODE_OPTIONS.map(option => {
              return (
                <ThemeModeCard
                  key={option.value}
                  option={option}
                  selected={settings.themeMode === option.value}
                  colors={colors}
                  onSelect={value => update({ themeMode: value })}
                />
              );
            })}
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.themeModeFooter}>
            <Text style={styles.themeModeFooterText}>
              Active now: {resolvedThemeMode === 'dark' ? 'Dark' : 'Light'}
              {settings.themeMode === 'system' ? ' from device setting.' : ' mode pinned in app.'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>ON LAUNCH</Text>
          <Text style={styles.sectionNote}>Choose whether the app should ask, use location, or restore your last direction.</Text>
        </View>
        <View style={styles.card}>
          {LAUNCH_BEHAVIOR_OPTIONS.map((option, index) => {
            const selected = settings.launchBehavior === option.value;

            return (
              <React.Fragment key={option.value}>
                {index > 0 ? <View style={styles.itemDivider} /> : null}
                <Pressable
                  onPress={() => {
                    void handleLaunchBehaviorSelect(option.value);
                  }}
                  style={({ pressed }) => [
                    styles.launchBehaviorRow,
                    {
                      backgroundColor: selected
                        ? alpha(colors.primary, '12')
                        : pressed
                          ? colors.panel
                          : colors.surface,
                    },
                  ]}>
                  <View style={styles.launchBehaviorCopy}>
                    <Text style={styles.launchBehaviorLabel}>{option.label}</Text>
                    <Text style={styles.launchBehaviorNote}>{option.caption}</Text>
                  </View>
                  <View style={styles.launchBehaviorControl}>
                    {option.value === 'smart' && isLocating ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <View
                        style={[
                          styles.launchBehaviorRadio,
                          selected && {
                            borderColor: colors.primary,
                            backgroundColor: alpha(colors.primary, '18'),
                          },
                        ]}>
                        {selected ? (
                          <View
                            style={[
                              styles.launchBehaviorRadioDot,
                              { backgroundColor: colors.primary },
                            ]}
                          />
                        ) : null}
                      </View>
                    )}
                  </View>
                </Pressable>
              </React.Fragment>
            );
          })}
          <View style={styles.itemDivider} />
          <View style={styles.launchBehaviorFooter}>
            <Text style={styles.launchBehaviorFooterTitle}>{launchBehaviorStatus.title}</Text>
            <Text style={styles.launchBehaviorFooterNote}>
              {locationError ?? launchBehaviorStatus.note}
            </Text>
          </View>
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
              <Text style={styles.sectionNote}>See upcoming departures right from your home screen.</Text>
            </View>
            {KojoriWidget?.canPinWidget() ? (
              <View style={styles.card}>
                {(['2x3', '3x3', '2x2'] as const).map((size, i) => {
                  const label = size === '2x3' ? '2×3 Tall (recommended)' : size === '3x3' ? '3×3 Large' : '2×2 Compact';
                  return (
                    <React.Fragment key={size}>
                      {i > 0 ? <View style={styles.itemDivider} /> : null}
                      <Pressable style={styles.manageBtn} onPress={() => KojoriWidget?.requestPinWidget(size)}>
                        <Text style={[styles.manageBtnText, { color: i === 0 ? colors.primary : colors.textDim }]}>{label}</Text>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>
            ) : null}
            <View style={styles.sectionMeta}>
              <Text style={styles.sectionHeader}>WIDGET STOPS</Text>
              <Text style={styles.sectionNote}>Default stop for each direction on the widget.</Text>
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

        {settings.debugOptionsUnlocked ? (
          <>
            <View style={styles.sectionMeta}>
              <Text style={styles.sectionHeader}>HOME DEBUG</Text>
              <Text style={styles.sectionNote}>Force one likely-cancelled departure so Home UI can be checked on demand.</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleLabel}>Cancelled bus demo</Text>
                  <Text style={styles.toggleNote}>Home screen only. Shows live replacement plus cancelled slab.</Text>
                </View>
                <SettingsSwitch
                  value={settings.cancelledBusDemo}
                  onValueChange={value => update({ cancelledBusDemo: value })}
                  accentColor={colors.primary}
                />
              </View>
            </View>
          </>
        ) : null}

        {settings.debugOptionsUnlocked ? (
          <>
            <View style={styles.sectionMeta}>
              <Text style={styles.sectionHeader}>TTC QUERY LOGGER</Text>
              <Text style={styles.sectionNote}>Persisted request history for live TTC traffic, with rolling query-rate metrics.</Text>
            </View>
            <TtcQueryLogCard
              entries={queryLog.entries}
              queriesLastMinute={liveQueryMetrics.queriesLastMinute}
              queriesLastTenMinutes={liveQueryMetrics.queriesLastTenMinutes}
              totalErrors={liveQueryMetrics.totalErrors}
              onClear={handleClearQueryLog}
            />
          </>
        ) : null}

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
            <Text style={styles.infoLabel}>Static data</Text>
            <Text style={[styles.infoValue, styles.infoValueWrap]}>Bundled schedules, stops, polylines, stop names</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Live data</Text>
            <Text style={[styles.infoValue, styles.infoValueWrap]}>Arrivals on Departures, vehicles on Map</Text>
          </View>
          <View style={styles.itemDivider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Baked asset</Text>
            <Text style={[styles.infoValue, styles.infoValueWrap]}>{formatBakedAt(BAKED_AT)}</Text>
          </View>
          {settings.debugOptionsUnlocked ? (
            <>
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
            </>
          ) : null}
          {settings.debugOptionsUnlocked ? (
            <>
              <Pressable
                style={styles.manageBtn}
                onPress={handleClearCache}>
                <Text style={[styles.manageBtnText, { color: colors.textDim }]}>Clear cache</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        <View style={styles.sectionMeta}>
          <Text style={styles.sectionHeader}>LEGAL</Text>
        </View>
        <View style={styles.card}>
          <Pressable style={styles.infoRow} onPress={() => setLegalModal('privacy')}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Privacy Policy</Text>
            <Text style={[styles.infoValue, { color: colors.textFaint }]}>→</Text>
          </Pressable>
          <View style={styles.itemDivider} />
          <Pressable style={styles.infoRow} onPress={() => setLegalModal('terms')}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Terms of Service</Text>
            <Text style={[styles.infoValue, { color: colors.textFaint }]}>→</Text>
          </Pressable>
          <View style={styles.itemDivider} />
          <Pressable style={styles.infoRow} onPress={() => Linking.openURL(LEGAL_URLS.support)}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>Support</Text>
            <Text style={[styles.infoValue, { color: colors.textFaint }]}>GitHub ↗</Text>
          </Pressable>
        </View>

        <View style={styles.buildFooter}>
          <View style={styles.buildDivider} />
          <Pressable onPress={handleBuildTap} style={styles.buildTapArea}>
            <Text style={styles.buildAppName}>Kojoring Time</Text>
            <Text style={styles.buildVersion}>v{APP_VERSION} · build {BUILD_NUMBER}</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://github.com/whekin')} hitSlop={8}>
            <Text style={styles.buildAuthor}>
              vibecoded with ♥ by <Text style={styles.buildLink}>whekin</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <StopPickerModal
        visible={modal === 'kojori'}
        title="Kojori Stops"
        direction="toTbilisi"
        favoriteIds={settings.kojoriFavorites}
        accentColor={colors.route316}
        onToggle={toggleKojoriFavorite}
        onClose={() => setModal(null)}
      />
      <StopPickerModal
        visible={modal === 'tbilisi'}
        title="Tbilisi Departure Stops"
        direction="toKojori"
        favoriteIds={settings.tbilisiFavorites}
        accentColor={colors.route380}
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
      <LegalModal
        visible={legalModal !== null}
        title={legalModal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
        content={legalModal ? legalContent[legalModal] : ''}
        isLoading={legalModal !== null && !legalLoadError && !legalContent[legalModal]}
        error={legalLoadError}
        colors={colors}
        onClose={() => setLegalModal(null)}
      />
      <PermissionModal
        visible={showPermissionModal}
        colors={colors}
        onClose={() => setShowPermissionModal(false)}
        onOpenSettings={() => {
          setShowPermissionModal(false);
          Linking.openSettings();
        }}
      />
      <NoticeModal
        visible={noticeModal !== null}
        colors={colors}
        icon={noticeModal?.icon ?? 'ℹ️'}
        title={noticeModal?.title ?? ''}
        message={noticeModal?.message ?? ''}
        onClose={() => setNoticeModal(null)}
      />
    </View>
  );
}

function LegalModal({
  visible,
  title,
  content,
  isLoading,
  error,
  colors,
  onClose,
}: {
  visible: boolean;
  title: string;
  content: string;
  isLoading: boolean;
  error: string | null;
  colors: AppColors;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const modalStyles = createModalStyles(colors);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[modalStyles.screen, { paddingTop: insets.top }]}>
        <View style={modalStyles.header}>
          <Pressable style={modalStyles.backBtn} onPress={onClose}>
            <Text style={modalStyles.backText}>←</Text>
          </Pressable>
          <Text style={modalStyles.headerTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>
              {error ?? formatLegalMarkdown(content)}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
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
    launchBehaviorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 15,
    },
    launchBehaviorCopy: { flex: 1, gap: 3 },
    launchBehaviorLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
    launchBehaviorNote: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    launchBehaviorControl: {
      width: 22,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    launchBehaviorRadio: {
      width: 20,
      height: 20,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: C.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.panel,
    },
    launchBehaviorRadioDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    launchBehaviorFooter: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 3,
    },
    launchBehaviorFooterTitle: { color: C.text, fontSize: 13, fontWeight: '600' },
    launchBehaviorFooterNote: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    themeModeRow: { flexDirection: 'row', gap: 10, padding: 12 },
    themeModePressable: { flex: 1 },
    themeModeButton: {
      minHeight: 88,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.panel,
      paddingHorizontal: 14,
      paddingVertical: 12,
      justifyContent: 'space-between',
      gap: 8,
    },
    themeModeLabel: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
    themeModeCaption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
    themeModeFooter: { paddingHorizontal: 16, paddingVertical: 12 },
    themeModeFooterText: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
    infoLabel: { color: C.textDim, fontSize: 14, fontWeight: '500' },
    infoValue: { color: C.text, fontSize: 14, fontWeight: '500' },
    infoValueWrap: { flex: 1, textAlign: 'right' },
    infoTags: { flexDirection: 'row', gap: 6 },
    miniTag: { borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    miniTagText: { fontSize: 12, fontWeight: '700' },

    queryConsoleCard: {
      position: 'relative',
      backgroundColor: C.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
      overflow: 'hidden',
      gap: 16,
    },
    queryConsoleGlow: {
      position: 'absolute',
      width: 170,
      height: 170,
      borderRadius: 999,
      top: -70,
      right: -46,
    },
    queryConsoleGlowSecondary: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 999,
      bottom: -52,
      left: -34,
    },
    queryConsoleHeader: { gap: 14 },
    queryConsoleCopy: { gap: 6 },
    queryConsoleEyebrow: { color: C.primary, fontSize: 10, fontWeight: '800', letterSpacing: 2.4 },
    queryConsoleTitle: { color: C.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.9 },
    queryConsoleBody: { color: C.textDim, fontSize: 13, lineHeight: 19, maxWidth: 520 },
    queryClearButton: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: alpha(C.bg, '86'),
    },
    queryClearButtonText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
    queryMetricRow: { flexDirection: 'row', gap: 10 },
    queryMetricTile: {
      flex: 1,
      minHeight: 84,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: alpha(C.borderStrong, '26'),
    },
    queryMetricValue: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.7, fontFamily: MONO },
    queryMetricLabel: { color: C.textDim, fontSize: 11, lineHeight: 15, textTransform: 'uppercase' },
    queryListWrap: {
      backgroundColor: alpha(C.bg, '82'),
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    queryEmptyState: { paddingHorizontal: 18, paddingVertical: 22, gap: 6 },
    queryEmptyTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
    queryEmptyNote: { color: C.textDim, fontSize: 12, lineHeight: 18 },
    queryDivider: { height: 1, backgroundColor: C.border, marginLeft: 16 },
    queryRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
    queryRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    queryRowLead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 },
    queryKind: { color: C.text, fontSize: 14, fontWeight: '700' },
    queryAge: { color: C.textFaint, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
    queryStatusChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
    queryStatusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, fontFamily: MONO },
    queryEndpoint: { color: C.textDim, fontSize: 12, lineHeight: 17, fontFamily: MONO },
    queryMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    queryMetaText: { color: C.textFaint, fontSize: 11, fontWeight: '500' },
    queryMetaSeparator: { color: C.textFaint, fontSize: 11 },

    buildFooter: { alignItems: 'center', paddingTop: 32, paddingBottom: 12, gap: 10 },
    buildDivider: { width: 40, height: 1, backgroundColor: C.border, marginBottom: 6 },
    buildTapArea: { alignItems: 'center', gap: 2 },
    buildAppName: { color: C.textDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
    buildVersion: { color: C.textFaint, fontSize: 11, fontFamily: MONO },
    buildAuthor: { color: C.textFaint, fontSize: 11, marginTop: 2 },
    buildLink: { textDecorationLine: 'underline' },
  });
}

function PermissionModal({
  visible,
  colors,
  onClose,
  onOpenSettings,
}: {
  visible: boolean;
  colors: AppColors;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.permissionOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.permissionCard, { marginBottom: insets.bottom + 20, backgroundColor: colors.surface }]}>
          <View style={[styles.permissionIconWrap, { backgroundColor: alpha(colors.primary, '18') }]}>
            <Text style={styles.permissionIcon}>📍</Text>
          </View>
          <Text style={[styles.permissionTitle, { color: colors.text }]}>
            Location Permission Required
          </Text>
          <Text style={[styles.permissionMessage, { color: colors.textDim }]}>
            Smart direction needs location access to automatically suggest whether you&apos;re heading to Kojori or Tbilisi. Please enable it in your device settings.
          </Text>
          <View style={styles.permissionButtons}>
            <Pressable
              style={[styles.permissionButton, styles.permissionButtonSecondary, { borderColor: colors.border }]}
              onPress={onClose}>
              <Text style={[styles.permissionButtonText, { color: colors.textDim }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={[styles.permissionButton, styles.permissionButtonPrimary, { backgroundColor: colors.primary }]}
              onPress={onOpenSettings}>
              <Text style={[styles.permissionButtonText, styles.permissionButtonTextPrimary, { color: colors.bg }]}>
                Open Settings
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NoticeModal({
  visible,
  colors,
  icon,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  colors: AppColors;
  icon: string;
  title: string;
  message: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.permissionOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.permissionCard, { marginBottom: insets.bottom + 20, backgroundColor: colors.surface }]}>
          <View style={[styles.permissionIconWrap, { backgroundColor: alpha(colors.primary, '18') }]}>
            <Text style={styles.permissionIcon}>{icon}</Text>
          </View>
          <Text style={[styles.permissionTitle, { color: colors.text }]}>
            {title}
          </Text>
          <Text style={[styles.permissionMessage, { color: colors.textDim }]}>
            {message}
          </Text>
          <View style={styles.permissionButtons}>
            <Pressable
              style={[styles.permissionButton, styles.permissionButtonPrimary, { backgroundColor: colors.primary }]}
              onPress={onClose}>
              <Text style={[styles.permissionButtonText, styles.permissionButtonTextPrimary, { color: colors.bg }]}>
                Nice
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  permissionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  permissionCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  permissionIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionIcon: {
    fontSize: 32,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  permissionMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  permissionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  permissionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  permissionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  permissionButtonPrimary: {
    borderWidth: 0,
  },
  permissionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  permissionButtonTextPrimary: {
    fontWeight: '700',
  },
});

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
