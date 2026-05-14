import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeBottomSheet } from '@/components/native-bottom-sheet';
import { alpha, type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useStopNames } from '@/hooks/use-stop-names';
import { StopInfo } from '@/services/ttc';

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

export function StopPickerModal({
  visible,
  title,
  direction,
  favoriteIds,
  accentColor,
  onToggle,
  onClose,
}: {
  visible: boolean;
  title: string;
  direction: 'toKojori' | 'toTbilisi';
  favoriteIds: string[];
  accentColor: string;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const colors = useAppColors();
  const { t } = useI18n();
  const stopNames = useStopNames();
  const modalStyles = useMemo(() => createModalStyles(colors), [colors]);
  const { stops: routeStops, isLoading } = useRouteStops(direction);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetMaxHeight = Math.round(height * 0.82);
  const listHeight = Math.max(220, sheetMaxHeight - 152);

  const enriched = useMemo<StopInfo[]>(
    () => routeStops.map(s => ({ id: s.id, label: stopNames[s.id] ?? s.label })),
    [routeStops, stopNames],
  );

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
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
    <NativeBottomSheet
      visible={visible}
      onClose={onClose}
      fallbackSheetStyle={{ maxHeight: sheetMaxHeight }}
      contentStyle={[modalStyles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={modalStyles.header}>
        <Text style={modalStyles.headerTitle}>{title}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('stopPickerClose')}
          onPress={onClose}
          style={modalStyles.closeButton}
          hitSlop={10}>
          <Text style={modalStyles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={modalStyles.searchWrap}>
        <TextInput
          style={modalStyles.searchInput}
          placeholder={t('stopSearch')}
          placeholderTextColor={colors.textFaint}
          value={search}
          onChangeText={setSearch}
          autoFocus
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {isLoading ? <ActivityIndicator color={colors.textDim} size="small" style={modalStyles.spinner} /> : null}
      </View>

      <ScrollView
        nestedScrollEnabled
        style={[modalStyles.list, { height: listHeight }]}
        contentContainerStyle={modalStyles.listContent}
        keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <Text style={modalStyles.emptyText}>
            {isLoading ? t('stopLoading') : t('stopNoneFound')}
          </Text>
        ) : null}
        {filtered.map((item, index) => {
          const isFav = favoriteSet.has(item.id);
          const disabled = isFav && favoriteIds.length === 1;
          const shortId = item.id.split(':')[1] ?? item.id;

          return (
            <React.Fragment key={item.id}>
              {index > 0 ? <View style={modalStyles.separator} /> : null}
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
                <Text style={[modalStyles.stopCode, { fontFamily: MONO }]}>#{shortId}</Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </ScrollView>
    </NativeBottomSheet>
  );
}

function createModalStyles(C: AppColors) {
  return StyleSheet.create({
    sheetContent: { paddingHorizontal: 18, gap: 14 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.surfaceHigh,
    },
    closeText: { color: C.textDim, fontSize: 24, lineHeight: 28 },
    headerTitle: { flex: 1, color: C.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      backgroundColor: C.surfaceHigh,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 12 },
    spinner: { marginLeft: 8 },
    list: { borderRadius: 14 },
    listContent: { paddingBottom: 8 },
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
