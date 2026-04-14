# AGENTS.md

Guidelines for AI agents working on this codebase.

## Project Overview

**Kojoring Time** — Android transit app for Kojori–Tbilisi bus routes (380, 316). Built with Expo Router + React Native, targeting Android primarily. Shows real-time departures, full timetables, live vehicle map, and native home screen widgets.

## Key Conventions

- **Package manager**: Bun (never npm/yarn)
- **Path aliases**: `@/*` → `src/*`, `@/assets/*` → `assets/*`
- **Theming**: All colors/fonts/spacing from `src/constants/theme.ts` via `useTheme()` hook
- **React Compiler** is enabled — avoid manual `useMemo`/`useCallback`
- **Platform variants**: `.web.tsx` suffix for web-specific components
- **No test suite** yet — verify changes manually or via `bun lint`

## Architecture at a Glance

```
src/
  app/           # Expo Router file-based routes (index, timetable, explore, settings)
  components/    # Reusable UI (ThemedText, ThemedView, AppTabs, etc.)
  constants/     # Theme, route configs
  hooks/         # useTheme, useSettings, useAppColors, TTC data hooks
  services/      # TTC API client, offline data, widget sync
assets/          # Images, icons, fonts, legal docs
modules/         # Native Expo modules (kojori-widget)
scripts/         # Release, icon gen, data baking
```

## TTC API

- Base: `https://transit.ttc.com.ge/pis-gateway/api`
- Auth: `x-api-key` header (see CLAUDE.md for value)
- Static data baked into `src/assets/ttc-baked.ts` — regenerate with `bun scripts/bake-ttc.ts`
- API can rate-limit (520 errors) — app handles this gracefully

## Android Widget

Native module at `modules/kojori-widget/`. Three sizes (2x2, 2x3, 3x3). Schedule-only (no API calls from widget). Data synced from JS via `KojoriWidget.syncWidgetState()`.

## Releasing

`bun release` — date-based versioning `YYYY.M.D`. Always update CHANGELOG.md with user-facing changes before releasing.

**CHANGELOG.md**: Must have a `## vX.Y.Z` section matching release version. Release script extracts this section for GitHub release notes. Group changes under `### New`, `### Improved`, `### Fixed`, `### Infra`.

## Common Pitfalls

- TTC API omits the actual first Tbilisi stop (Elene Akhvlediani `1:2994`) — app adds it as fallback
- Starting stop schedule times are reliable; middle/end stops arrive ~5–10 min early
- Widget must stay offline-only (no network calls from native side)
- Android 12+ requires `set()` not `setExact()` for widget alarms (no SCHEDULE_EXACT_ALARM permission)
