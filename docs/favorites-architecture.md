# Trips

The app stores **trips**: one or more TTC routes heading the same way, boarded at one of several saved stops. It remains scoped to TTC in Tbilisi and the surrounding area. Code calls a trip a `Favorite`.

## Product flow

The screens are the original Kojori screens, driven by the selected trip instead of a fixed 380/316 direction:

- **Start screen** (`src/components/start-screen.tsx`): one illustrated card per trip with its next departures, plus "Add a trip". Shown on launch unless the rider has one trip, chose "remember", or a nearby trip resolves by location.
- **Departures** (`src/app/index.tsx`): boarding-stop map with the trip's saved stops, the next-bus card and the upcoming list for the active stop. The pill on the map (`TripSwitch`) flips to the reverse trip when there are just two, otherwise opens the start screen.
- **Map / Timetable**: the selected trip's routes, stops and vehicles; the timetable adds Today/Tomorrow/any date.
- **Trip editor** (`src/components/trip-editor.tsx`): route → direction → boarding stop → summary. The summary names the trip, lists routes and stops, and suggests other routes TTC lists at the active stop (`/v2/stops/{id}/routes`) that continue to the same headsign or one of the trip's last stops. A new trip without a reverse offers to add the way back, which preselects the other pattern of each route.
- **Settings**: trip list with edit, reorder, delete with Undo and "add return trip".

Version-2 settings migrate to two trips, `legacy:toKojori` and `legacy:toTbilisi`, with all saved stops and the active stop. Version-1 favorites (one per stop, from an unreleased build) merge into trips on load.

## Domain and storage

- `src/transit/model.ts`: provider-scoped route/pattern/stop identities, trips (`tripStops`, `activeBoardings`, `reverseTrip`), calendar calculations and live matching.
- `src/transit/data.ts`: catalog, direction details, stops, timetables, geometry, arrivals and vehicles. Requests have a 20-second timeout and share three concurrent slots.
- `src/transit/favorites.tsx`: favorite persistence, selection, ordering and migration.
- `src/transit/hooks.ts`: polling and partial results for visible cards and the selected map.
- `src/transit/widget.ts`: the common offline snapshot for both native widget platforms.

Favorites use `@kojori_favorites_v1`; legacy settings remain at `@kojori_settings_v2`.
Downloaded transit envelopes use `@ttc_transit_v1:` with their full query key and original update timestamp. Hydration checks shapes and ignores corrupt entries. Cached or bundled data is not marked freshly downloaded simply because the app opened.

Patterns are identified by **route ID + pattern suffix**, and boardings add a stop ID.
Numbers are display labels, not storage keys. `0:01` and `1:01` do not imply common geographic directions. The catalog exposes any number of patterns.

Schedules and geometry are shared across favorites using the same pattern. Arrival requests are shared across the same stop and locale. A failed query keeps available saved schedules; one failed route does not prevent other routes from updating. Timetables retry after five minutes on an active screen following a failure. Vehicle and arrival polling back off separately.

The current catalog asset includes all TTC routes reported by the provider (282 at the October 29, 2026 verification). It can be refreshed with:

```sh
bun scripts/bake-ttc-catalog.ts
```

The existing baked 380/316 schedules remain the initial offline dataset. Other routes download their own data on first addition. Each service day is evaluated in Tbilisi time, including previous-day `24:xx` trips and weekday changes. Kojori's bridge-stop lookup and first-stop live tolerances stay scoped to those routes.

## Native widgets

Runtime: **`kojori-native-8`**. Install a new native build for the changed widget contract; an OTA update alone cannot add the iOS bridge or Android schema support.

Schema 3 contains an ordered favorite list, snapshots keyed by stable favorite IDs, route colors and offline calendar periods. Android accepts legacy schema 2 too, migrates old direction selections and stores the current selection per widget instance. The header cycles through favorites. Both native implementations evaluate calendar periods locally and never fetch TTC data themselves.

iOS receives the same snapshots through the local `KojoriWidget` Expo module and an App Group file. The plugin generates the matching app/extension entitlements and group identifier. Existing stop-based widget configuration is retained as a migration input; new widgets choose a favorite. Signed builds must provision that App Group for both targets. [Apple's App Group documentation](https://developer.apple.com/documentation/xcode/configuring-app-groups).

## Web

TTC's direct responses did not expose CORS headers during verification; browser preflight returned HTTP 400. The browser therefore reads the same-origin `/ttc` endpoint. Native clients still connect directly to TTC.

`src/app/ttc+api.ts` permits only the public route/catalog/schedule/stop/geometry/position/arrival read paths, validates query parameter names and fixes the upstream host. It cannot forward arbitrary URLs or write requests. Upstream failures remain failures so that the client can show saved data honestly.

The Expo web output is now `server`. A hosted web build needs **both** client assets and the exported server, as described in the [Expo API route documentation](https://docs.expo.dev/router/web/api-routes/). No hosting deployment was performed during this pass.

The web map uses OpenStreetMap street tiles with attribution and saved route geometry; native maps use their platform provider. Street tiles need a connection. Persisted transit data supports cached display, but this pass does not add a web service worker for loading the entire website without a server.

## Verification

The implementation checklist and current QA results are kept in [the app audit plan](app-audit-and-favorites-plan.md). Core checks:

```sh
bun test
bun run typecheck
bun lint
bun run i18n:check
bun run runtime:check
cd android
./gradlew :kojori-widget:testDebugUnitTest :app:assembleDebug
```

Swift calendar tests also cover arbitrary routes, legacy widget identifiers, Tbilisi timezone and midnight. The extension's SwiftUI/App Intents sources were typechecked against the iOS simulator SDK. Signed iOS device/App Group behavior still needs a provisioned native build.
