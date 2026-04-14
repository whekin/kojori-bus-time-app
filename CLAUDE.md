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
bun scripts/bake-ttc.ts  # Re-fetch static TTC data and write src/assets/ttc-baked.ts
bun release            # Full release pipeline (see Releasing below)
```

No test suite configured yet.

## Releasing

Full pipeline: `bun release` (or `bun release 2026.5.1` for explicit version).

Steps: preflight → changelog check → stamp version → prebuild → build APK → commit → tag → push → GitHub release with APK.

**Versioning**: Date-based `YYYY.M.D` (e.g. `2026.4.15`). Build number is `YYYYMMDD00` — last two digits for same-day re-releases. In dev, `app.config.ts` auto-computes version from today's date. Production builds use stamped values from `app.json`.

**CHANGELOG.md**: Must have a `## vX.Y.Z` section matching the release version. The release script extracts this section for GitHub release notes. Always update CHANGELOG.md when making user-facing changes — group under `### New`, `### Improved`, `### Fixed`, `### Infra` as appropriate.

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

Tbilisi departure stops: `1:2994` (Elene Akhvlediani — actual first stop, TTC API omits it), `1:3932` (Baratashvili), `1:853` (Sulkhan-Saba)

Kojori stops: `1:2856`, `1:4181`, `1:3782`, `1:3078`

Endpoints used:
- `GET /v2/stops/{stopId}/arrival-times?locale=en&ignoreScheduledArrivalTimes=false` — real-time + scheduled arrivals
- `GET /v3/routes/{routeId}/schedule?patternSuffix={suffix}&locale=en` — full schedule (prefetch + cache)
- `GET /v3/routes/{routeId}/positions?patternSuffixes={suffix}` — live vehicle GPS (10s refresh on map)
- `GET /v3/routes/{routeId}/stops-of-patterns?patternSuffixes={suffix}&locale=en` — stop list (prefetch)
- `GET /v3/routes/{routeId}/polylines?patternSuffixes={suffix}` — route shape; returns `{ [patternSuffix]: { encodedValue: string, color: string } }` where `encodedValue` is a Google-encoded polyline

Response field notes: `realtimeArrivalMinutes` = GPS-tracked ETA; `scheduledArrivalMinutes` = timetable. Starting stop schedule is reliable; middle/end stops arrive ~5–10 min early.

## Android Widget

Native Expo module at `modules/kojori-widget/`. Three size variants (2x2, 2x3, 3x3) sharing the same provider logic via subclassing (`KojoriBusWidgetProvider` → `KojoriBusWidget2x2`, `KojoriBusWidget3x3`). All registered in `AndroidManifest.xml` with separate widget info XMLs. `refreshAll()` iterates all provider classes. Widget data synced from JS via `KojoriWidget.syncWidgetState()`. Users can pin widgets from Settings.
