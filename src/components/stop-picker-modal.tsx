import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NativeBottomSheet } from '@/components/native-bottom-sheet';
import { StopChoiceRow } from '@/components/stop-choice-row';
import { getCuratedStopIds } from '@/constants/curated-stops';
import { type AppColors } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { useRouteStops } from '@/hooks/use-route-stops';
import { useStopNames } from '@/hooks/use-stop-names';
import { findStop, StopInfo } from '@/services/ttc';

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
    const routeStopMap = new Map(enriched.map(stop => [stop.id, stop]));
    const curatedStops = getCuratedStopIds(direction)
      .map(id => routeStopMap.get(id) ?? findStop(id))
      .filter((stop): stop is StopInfo => Boolean(stop))
      .map(stop => ({ ...stop, label: stopNames[stop.id] ?? stop.label }));
    const curatedSet = new Set(curatedStops.map(stop => stop.id));
    const all = [
      ...curatedStops,
      ...enriched.filter(stop => !curatedSet.has(stop.id)),
    ];
    if (!query) return all;
    return all.filter(s => s.label.toLowerCase().includes(query) || s.id.includes(query));
  }, [direction, enriched, query, stopNames]);

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
        {filtered.map((item) => {
          const isFav = favoriteSet.has(item.id);
          const disabled = isFav && favoriteIds.length === 1;

          return (
            <StopChoiceRow
              key={item.id}
              stop={item}
              direction={direction}
              accentColor={accentColor}
              selected={isFav}
              disabled={disabled}
              showCheck
              onPress={() => onToggle(item.id)}
              onMapPress={onClose}
            />
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
    listContent: { paddingBottom: 8, gap: 10 },
    emptyText: { color: C.textFaint, textAlign: 'center', paddingVertical: 40, fontSize: 14 },
  });
}
