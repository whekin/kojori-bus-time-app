# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun start              # Start Expo dev server
bun android            # Start on Android
bun ios                # Start on iOS
bun web                # Start on web
bun lint               # Run ESLint via expo lint
bun add <pkg>          # Add dependency (use instead of npm install)
```

No test suite configured yet.

## Architecture

Expo Router (file-based) app targeting Android primarily. Entry point is `expo-router/entry`. All source lives in `src/`, assets in `assets/`.

**Path aliases** (`tsconfig.json`):
- `@/*` → `src/*`
- `@/assets/*` → `assets/*`

**Routing** (`src/app/`): File-based. `_layout.tsx` wraps everything in `ThemeProvider` + animated splash, then renders `AppTabs`. Tabs use `expo-router/unstable-native-tabs` (NativeTabs), not the standard React Navigation tab bar.

**Theming** (`src/constants/theme.ts`): Single source of truth. `Colors` (light/dark), `Fonts` (platform-specific), `Spacing` (numeric scale 2–64), `BottomTabInset`, `MaxContentWidth`. Access via `useTheme()` hook which resolves `'unspecified'` → `'light'`.

**Components** (`src/components/`): `ThemedText` / `ThemedView` accept a `themeColor` or `type` prop to apply theme colors without manual `useTheme()` calls. Platform-specific variants use `.web.tsx` suffix (e.g. `app-tabs.web.tsx`, `animated-icon.web.tsx`).

**React Compiler** is enabled (`experiments.reactCompiler: true`) — avoid manual `useMemo`/`useCallback` unless profiling shows a specific need.

## TTC API

Base: `https://transit.ttc.com.ge/pis-gateway/api`  
Auth header: `x-api-key: c0a2f304-551a-4d08-b8df-2c53ecd57f9f`

Key routes:
- Bus 380: route `1:R97505`, Tbilisi→Kojori pattern `0:01`, Kojori→Tbilisi `1:01`
- Bus 316: route `1:R98445`, Tbilisi→Kojori pattern `1:01`, Kojori→Tbilisi `0:01`

Tbilisi departure stops: `1:3932` (primary), `1:853` (Liberty Square)

Kojori stops: `1:2856`, `1:4181`, `1:3782`, `1:3078`

Endpoints used:
- `GET /v2/stops/{stopId}/arrival-times?locale=en&ignoreScheduledArrivalTimes=false` — real-time + scheduled arrivals
- `GET /v3/routes/{routeId}/schedule?patternSuffix={suffix}&locale=en` — full schedule (prefetch + cache)
- `GET /v3/routes/{routeId}/positions?patternSuffixes={suffix}` — live vehicle GPS (3s refresh on map)
- `GET /v3/routes/{routeId}/stops-of-patterns?patternSuffixes={suffix}&locale=en` — stop list (prefetch)
- `GET /v3/routes/{routeId}/polylines?patternSuffixes={suffix}` — route shape; returns `{ [patternSuffix]: { encodedValue: string, color: string } }` where `encodedValue` is a Google-encoded polyline

Response field notes: `realtimeArrivalMinutes` = GPS-tracked ETA; `scheduledArrivalMinutes` = timetable. Starting stop schedule is reliable; middle/end stops arrive ~5–10 min early.

## Planned Features (not yet built)

- **Home screen**: Direction toggle (To Kojori / To Tbilisi). Auto-detected via GPS (Kojori bounding box ~41.55–41.60 lat, 44.77–44.82 lon).
  - To Kojori: combined 380+316 schedule from selected Tbilisi stop, sorted chronologically
  - To Tbilisi: real-time arrivals at nearest Kojori stop, auto-refreshed every 30s
- **Map screen**: Live vehicle positions for 380/316, route polyline, user location. 5s refresh. Filter by route.
- **Settings**: Preferred Kojori stop override, preferred Tbilisi departure stop.
- **Caching**: Schedule + stops + polylines prefetched into AsyncStorage on app open; shown offline with stale indicator.
- **Dependencies to install**: `bun add @tanstack/react-query dayjs` + `bunx expo install @react-native-async-storage/async-storage expo-location react-native-maps` (use `bunx expo install` for Expo-managed packages to get compatible versions)
