import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MapEmptyState } from "@/components/map-empty-state";
import {
  mapTripAccent,
  plainStop,
  stopAdditions,
  tripHasStop,
  tripWithoutStop,
} from "@/components/map-trip";
import { TripSwitch } from "@/components/stop-selector";
import { alpha, BottomTabInset, Fonts, Spacing } from "@/constants/theme";
import { useI18n } from "@/hooks/use-i18n";
import { useMapFocus } from "@/hooks/use-map-focus";
import { useTabNav } from "@/hooks/use-tab-nav";
import { useTransitCopy } from "@/transit/copy";
import { useFavorites } from "@/transit/favorites";
import { useFavoriteMap } from "@/transit/hooks";
import { TransitMap } from "@/transit/map";
import { tripStopId, tripStops } from "@/transit/model";
import {
  Button,
  Notice,
  routeColor,
  useFavoriteTitle,
  useTransitStyles,
} from "@/transit/ui";

/**
 * Web map tab. react-native-maps has no web build, so this draws the active
 * trip on OpenStreetMap tiles and keeps stop actions in a card below.
 */
export default function ExploreScreen({
  isActive = true,
}: {
  isActive?: boolean;
  suspendNativeMap?: boolean;
}) {
  const { colors, s } = useTransitStyles();
  const copy = useTransitCopy();
  const { t, localizedStopName } = useI18n();
  const tripTitle = useFavoriteTitle();
  const { selected: trip, isLoaded, select, setStop, save } = useFavorites();
  const data = useFavoriteMap(trip, isActive);
  const { focusedStop, requestStopFocus, clearStopFocus, requestStopSheetReturn } =
    useMapFocus();
  const navigate = useTabNav();
  const insets = useSafeAreaInsets();
  const [showStops, setShowStops] = useState(false);

  if (!isLoaded) return <View style={s.screen} />;
  if (!trip) return <MapEmptyState />;

  const accent = mapTripAccent(trip, colors);
  const routes = data.routes.map((route) => ({
    ...route,
    color: routeColor(route.boarding.route.id, colors, trip),
  }));
  const savedStopIds = tripStops(trip).map((stop) => stop.id);
  const activeStopId = tripStopId(trip);
  const focused = focusedStop?.tripId === trip.id ? focusedStop : null;
  const focusedSaved = focused ? tripHasStop(trip, focused.id) : false;
  const additions =
    focused && !focusedSaved
      ? stopAdditions(
          trip,
          data.routes.map((route) => route.stops),
          plainStop(focused),
        )
      : [];
  const saveDisabled = focusedSaved
    ? savedStopIds.length <= 1
    : additions.length === 0;
  const servingRoutes = focused
    ? routes.filter((route) =>
        route.stops.some((stop) => stop.id === focused.id),
      )
    : [];

  function showDepartures() {
    if (!focused || !trip) return;
    if (focusedSaved) {
      select(trip.id);
      setStop(trip.id, focused.id);
    } else if (additions.length) {
      // Departures run from saved stops, so boarding here saves it.
      save({
        ...trip,
        boardings: [...trip.boardings, ...additions],
        stopId: focused.id,
      });
    }
    navigate?.("index");
  }

  function toggleSaved() {
    if (!focused || !trip || saveDisabled) return;
    if (focusedSaved) {
      const next = tripWithoutStop(trip, focused.id);
      if (next) save(next);
    } else {
      save({ ...trip, boardings: [...trip.boardings, ...additions] });
    }
  }

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[
        s.content,
        {
          paddingTop: insets.top + Spacing.four,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={s.eyebrow}>{t("tabsMap")}</Text>
        <Text style={s.title} numberOfLines={2}>
          {tripTitle(trip)}
        </Text>
        <TripSwitch accentColor={accent} compact style={styles.tripSwitch} />
      </View>

      <View style={styles.toolbar}>
        <View style={s.row}>
          {routes.map((route) => (
            <View
              key={route.key}
              accessibilityLabel={t("mapRouteVehiclesCount", {
                bus: route.boarding.route.shortName,
                count: route.vehicles.length,
              })}
              style={[
                styles.legendChip,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <View style={[styles.legendDot, { backgroundColor: route.color }]} />
              <Text style={[styles.legendLabel, { color: colors.text }]}>
                {route.boarding.route.shortName}
              </Text>
              <Text style={[styles.legendCount, { color: colors.textDim }]}>
                {route.vehicles.length}
              </Text>
            </View>
          ))}
        </View>
        <View style={s.row}>
          <Button
            label={copy(showStops ? "hideStops" : "showStops")}
            icon="bus-stop"
            selected={showStops}
            onPress={() => setShowStops(!showStops)}
          />
          <Button
            label={data.refreshing ? t("mapRefreshingLive") : t("mapRefreshLive")}
            icon="refresh"
            iconOnly
            disabled={data.refreshing}
            onPress={() => void data.refresh()}
          />
        </View>
      </View>

      {data.routes.some((route) => route.error) ? (
        <Notice>{copy("partial")}</Notice>
      ) : null}

      <TransitMap
        routes={routes}
        active={isActive}
        showStops={showStops}
        savedStopIds={savedStopIds}
        activeStopId={activeStopId}
        focusedStopId={focused?.id}
        onStop={(_, stop) => requestStopFocus(stop, trip.id)}
      />

      {focused ? (
        <View
          style={[
            s.card,
            styles.stopCard,
            { borderColor: alpha(accent, "42") },
          ]}
        >
          <View style={[styles.stopRail, { backgroundColor: accent }]} />
          <View style={styles.stopBody}>
            <View style={styles.stopHeader}>
              <View style={s.column}>
                <Text style={s.eyebrow}>
                  {focused.id === activeStopId
                    ? t("commonSelected")
                    : tripTitle(trip)}
                </Text>
                <Text style={s.heading} numberOfLines={2}>
                  {localizedStopName(focused)}
                </Text>
                <Text style={[styles.stopCode, { color: accent }]}>
                  #{focused.id.split(":")[1] ?? focused.id}
                  {servingRoutes.length
                    ? `  ·  ${servingRoutes
                        .map((route) => route.boarding.route.shortName)
                        .join(" · ")}`
                    : ""}
                </Text>
              </View>
              <Button
                label={copy("close")}
                icon="close"
                iconOnly
                onPress={clearStopFocus}
              />
            </View>
            <View style={s.row}>
              <Button
                primary
                icon="clock-fast"
                label={t("mapShowNextBuses")}
                disabled={!focusedSaved && additions.length === 0}
                onPress={showDepartures}
              />
              <Button
                icon={focusedSaved ? "star" : "star-outline"}
                label={
                  focusedSaved ? t("mapRemoveSavedStop") : t("mapSaveStop")
                }
                selected={focusedSaved}
                disabled={saveDisabled}
                onPress={toggleSaved}
              />
              {focused.returnRoute ? (
                <Button
                  icon="chevron-up"
                  label={t("mapBackToPicker")}
                  onPress={() => {
                    requestStopSheetReturn();
                    navigate?.(focused.returnRoute ?? "index");
                  }}
                />
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.two },
  tripSwitch: { alignSelf: "flex-start", marginTop: Spacing.one },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  legendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 13, fontWeight: "700" },
  legendCount: { fontSize: 12, fontWeight: "700" },
  stopCard: { flexDirection: "row", gap: Spacing.three },
  stopRail: { width: 4, alignSelf: "stretch", borderRadius: 999 },
  stopBody: { flex: 1, minWidth: 0, gap: Spacing.three },
  stopHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  stopCode: { fontFamily: Fonts.mono, fontSize: 13, fontWeight: "700" },
});
