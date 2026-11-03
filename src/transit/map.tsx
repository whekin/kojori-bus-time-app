import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import MapView, { Marker, Polyline } from "react-native-maps";

import { GOOGLE_DARK_MAP_STYLE } from "@/constants/map-style";
import { useAppColors } from "@/hooks/use-app-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { transitModeIcon } from "./ui";
import type { TransitMapProps } from "./map-types";

/**
 * Compact native route map. The map tab draws its own full-screen map; this
 * shares the web map's props so `@/transit/map` resolves on every platform.
 */
export function TransitMap({
  routes,
  active,
  showStops,
  savedStopIds,
  activeStopId,
  onStop,
}: TransitMapProps) {
  const colors = useAppColors();
  const reducedMotion = useReducedMotion();
  const ref = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const key = routes.map((route) => route.key).join("|");
  const fitted = useRef("");
  const coordinates = routes.flatMap((route) =>
    route.points.length
      ? route.points
      : route.stops
          .filter(
            (stop) =>
              typeof stop.lat === "number" && typeof stop.lon === "number",
          )
          .map((stop) => ({ latitude: stop.lat!, longitude: stop.lon! })),
  );
  useEffect(() => {
    if (!ready || !active || !coordinates.length || fitted.current === key)
      return;
    const timer = setTimeout(() => {
      if (coordinates.length === 1)
        ref.current?.animateToRegion(
          {
            ...coordinates[0],
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          reducedMotion ? 0 : 300,
        );
      else
        ref.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 48, right: 36, bottom: 48, left: 36 },
          animated: !reducedMotion,
        });
      fitted.current = key;
    }, 120);
    return () => clearTimeout(timer);
  }, [active, ready, key, coordinates, reducedMotion]);
  return (
    <View
      style={{ flex: 1, minHeight: 260, overflow: "hidden", borderRadius: 24 }}
    >
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        testID="favorite-map"
        onMapReady={() => setReady(true)}
        customMapStyle={colors.mode === "dark" ? GOOGLE_DARK_MAP_STYLE : []}
        initialRegion={{
          latitude: 41.7151,
          longitude: 44.8271,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
      >
        {routes.map((route) => (
          <React.Fragment key={route.key}>
            {route.points.length > 1 ? (
              <Polyline
                coordinates={route.points}
                strokeColor={route.color}
                strokeWidth={5}
              />
            ) : null}
            {(showStops
              ? route.stops
              : route.stops.filter((stop) => savedStopIds.includes(stop.id))
            )
              .filter(
                (stop) =>
                  typeof stop.lat === "number" && typeof stop.lon === "number",
              )
              .map((stop) => (
                <Marker
                  key={stop.id}
                  coordinate={{ latitude: stop.lat!, longitude: stop.lon! }}
                  title={stop.label}
                  description={route.boarding.pattern.headsign}
                  pinColor={route.color}
                  opacity={stop.id === activeStopId ? 1 : 0.8}
                  onPress={() => onStop(route.boarding, stop)}
                />
              ))}
            {route.vehicles.map((vehicle) => (
              <Marker
                key={`${vehicle.vehicleId}:${route.color}`}
                coordinate={{ latitude: vehicle.lat, longitude: vehicle.lon }}
                tracksViewChanges={false}
                title={route.boarding.route.shortName}
                description={route.boarding.pattern.headsign}
              >
                <View
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: route.color,
                    borderWidth: 2,
                    borderRadius: 16,
                    padding: 6,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <MaterialCommunityIcons
                    name={transitModeIcon(route.boarding.route.mode)}
                    size={17}
                    color={colors.text}
                  />
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {route.boarding.route.shortName}
                  </Text>
                </View>
              </Marker>
            ))}
          </React.Fragment>
        ))}
      </MapView>
    </View>
  );
}
