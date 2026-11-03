import React, { useRef, useState } from "react";
import { Linking, Text, View } from "react-native";

import type { StopInfo } from "@/services/ttc";
import { useTransitCopy } from "./copy";
import type { MapRoute, TransitMapProps } from "./map-types";
import type { Boarding } from "./model";
import { Button, useTransitStyles } from "./ui";

const HEIGHT = 440;
const TILE = 256;

function project(lat: number, lon: number) {
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

function located(stop: StopInfo): stop is StopInfo & { lat: number; lon: number } {
  return typeof stop.lat === "number" && typeof stop.lon === "number";
}

/** Each stop once, drawn in the colour of the first route that serves it. */
function visibleStops(
  routes: MapRoute[],
  show: (stopId: string) => boolean,
) {
  const seen = new Map<
    string,
    { stop: StopInfo & { lat: number; lon: number }; boarding: Boarding; color: string }
  >();
  for (const route of routes)
    for (const stop of [...route.stops, route.boarding.stop])
      if (!seen.has(stop.id) && located(stop) && show(stop.id))
        seen.set(stop.id, { stop, boarding: route.boarding, color: route.color });
  return [...seen.values()];
}

/**
 * Web map: OpenStreetMap tiles under an SVG overlay. Street tiles are
 * optional; saved route geometry still renders without a connection.
 */
export function TransitMap({
  routes,
  showStops,
  savedStopIds,
  activeStopId,
  focusedStopId,
  onStop,
}: TransitMapProps) {
  const { colors, s } = useTransitStyles();
  const copy = useTransitCopy();
  const [width, setWidth] = useState(600);
  const [zoomOffset, setZoom] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0, key: "" });
  const drag = useRef<{
    x: number;
    y: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const key = routes.map((route) => route.key).join("|");
  const points = routes.flatMap((route) =>
    route.points.map((p) => project(p.latitude, p.longitude)),
  );
  if (!points.length) points.push(project(41.7151, 44.8271));
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const baseZoom = Math.floor(
    Math.log2(
      Math.min(
        (width - 80) / (TILE * Math.max(maxX - minX, 0.0001)),
        (HEIGHT - 80) / (TILE * Math.max(maxY - minY, 0.0001)),
      ),
    ),
  );
  const zoom = Math.max(5, Math.min(18, baseZoom + zoomOffset));
  const scale = TILE * 2 ** zoom;
  const panX = pan.key === key ? pan.x : 0;
  const panY = pan.key === key ? pan.y : 0;
  const left = ((minX + maxX) / 2) * scale - width / 2 + panX;
  const top = ((minY + maxY) / 2) * scale - HEIGHT / 2 + panY;
  const tiles: { x: number; y: number }[] = [];
  for (let x = Math.floor(left / TILE); x <= Math.floor((left + width) / TILE); x++)
    for (let y = Math.floor(top / TILE); y <= Math.floor((top + HEIGHT) / TILE); y++)
      if (x >= 0 && y >= 0 && x < 2 ** zoom && y < 2 ** zoom) tiles.push({ x, y });
  const screen = (lat: number, lon: number) => {
    const point = project(lat, lon);
    return { x: point.x * scale - left, y: point.y * scale - top };
  };
  const saved = new Set(savedStopIds);
  const stops = visibleStops(
    routes,
    (id) => showStops || saved.has(id) || id === focusedStopId,
  ).sort(
    (a, b) =>
      Number(saved.has(a.stop.id)) - Number(saved.has(b.stop.id)) ||
      Number(a.stop.id === focusedStopId) - Number(b.stop.id === focusedStopId),
  );
  function zoomBy(step: number) {
    setZoom((value) => value + step);
    setPan({ x: 0, y: 0, key });
  }
  return (
    <View
      style={{ gap: 8 }}
      onLayout={(event) =>
        setWidth(Math.max(200, event.nativeEvent.layout.width))
      }
    >
      <div
        style={{
          touchAction: "none",
          borderRadius: 24,
          overflow: "hidden",
          background: colors.panel,
          border: `1px solid ${colors.border}`,
          cursor: "grab",
        }}
        onPointerDown={(event) => {
          if ((event.target as Element).closest("[data-map-stop]")) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            initialX: panX,
            initialY: panY,
          };
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setPan({
              x: drag.current.initialX + drag.current.x - event.clientX,
              y: drag.current.initialY + drag.current.y - event.clientY,
              key,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <svg
          width="100%"
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          style={{ display: "block" }}
        >
          {tiles.map((tile) => (
            <image
              key={`${zoom}:${tile.x}:${tile.y}`}
              x={tile.x * TILE - left}
              y={tile.y * TILE - top}
              width={TILE}
              height={TILE}
              href={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            />
          ))}
          {/* Earlier routes of the trip draw on top. */}
          {[...routes].reverse().map((route) => {
            const line = route.points
              .map((p) => {
                const q = screen(p.latitude, p.longitude);
                return `${q.x},${q.y}`;
              })
              .join(" ");
            return (
              <g key={route.key}>
                <polyline
                  points={line}
                  fill="none"
                  stroke={colors.bg}
                  strokeOpacity={0.75}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={line}
                  fill="none"
                  stroke={route.color}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}
          {stops.map(({ stop, boarding, color }) => {
            const p = screen(stop.lat, stop.lon);
            const isSaved = saved.has(stop.id);
            const isFocused = stop.id === focusedStopId;
            const isActiveStop = stop.id === activeStopId;
            const radius = isFocused ? 11 : isActiveStop ? 9 : isSaved ? 7 : 5;
            return (
              <g
                key={stop.id}
                data-map-stop=""
                role="button"
                tabIndex={0}
                aria-label={stop.label}
                style={{ cursor: "pointer", outline: "none" }}
                onClick={() => onStop(boarding, stop)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onStop(boarding, stop);
                  }
                }}
              >
                <title>{stop.label}</title>
                {isFocused ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={radius + 8}
                    fill={color}
                    fillOpacity={0.18}
                    stroke={color}
                    strokeOpacity={0.6}
                    strokeWidth={2}
                  />
                ) : null}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={radius}
                  fill={isActiveStop || isFocused ? color : colors.panel}
                  stroke={isActiveStop || isFocused ? colors.panel : color}
                  strokeWidth={3}
                />
              </g>
            );
          })}
          {routes.map((route) =>
            route.vehicles.map((vehicle) => {
              const p = screen(vehicle.lat, vehicle.lon);
              return (
                <g key={`${route.key}:${vehicle.vehicleId}`}>
                  <title>{route.boarding.route.shortName}</title>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={16}
                    fill={route.color}
                    stroke="#FFFFFF"
                    strokeOpacity={0.85}
                    strokeWidth={3}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight="bold"
                    fill="#FFFFFF"
                  >
                    {route.boarding.route.shortName}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <View style={s.row}>
          <Button
            label={copy("zoomOut")}
            icon="minus"
            iconOnly
            onPress={() => zoomBy(-1)}
          />
          <Button
            label={copy("zoomIn")}
            icon="plus"
            iconOnly
            onPress={() => zoomBy(1)}
          />
        </View>
        <Text
          style={s.muted}
          accessibilityRole="link"
          onPress={() =>
            void Linking.openURL("https://www.openstreetmap.org/copyright")
          }
        >
          © OpenStreetMap contributors
        </Text>
      </View>
    </View>
  );
}
