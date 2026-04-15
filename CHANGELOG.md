# Changelog

## v2026.4.15

First public release of **Kojoring Time** — a real-time transit companion for Kojori–Tbilisi bus routes 380 and 316.

### New

- **Home screen departures** — next bus card with live countdown, schedule drift indicator, and automatic refresh between API calls
- **Full timetable view** — complete daily schedule for both directions with live overlay highlighting upcoming departures
- **Live map** — real-time vehicle GPS positions on Google Maps with 10-second refresh, directional markers, locate-me button, and interactive route legend chips
- **Android home screen widget** — three size variants (2x2, 2x3, 3x3) with live countdown, scrollable departure list, refresh button, and pin-to-home from Settings
- **Searchable stop picker** — modal stop selector with stop codes, used across home and timetable views
- **Favorites system** — save preferred stops per direction, persisted across sessions and shared with timetable
- **TTC outage detection** — header badge with popover details; distinguishes between offline, rate-limited (520), and API errors
- **Cancelled bus inference** — surfaces likely cancelled departures when live data skips scheduled times
- **Late bus handling** — keeps late buses visible until live data confirms they've passed
- **Offline support** — static TTC schedule and stop data baked into the app; works without network
- **Animated route color palettes** — persistent theme colors per bus route
- **Legal docs** — bundled privacy policy and terms, accessible from Settings with Play Store policy links
- **Zebra-striped polylines** — shared road segments show both routes with zebra pattern instead of overlapping lines
- **Map bounds clamping** — keeps map focused on the Kojori–Tbilisi corridor
- **Elene Akhvlediani stop** — added as actual first Tbilisi departure stop (TTC API omits it)
- **Expanded theme suite** — Night Shift, Ember Punch, Sorbet Static, and Midnight Fig palettes with animated switching
- **Color mode selector** — each palette can now run in Light, Dark, or follow the system setting

### Improved

- Swipeable tab pager with smooth animated highlight following scroll position
- Arrival times formatted as hours + minutes for large values ("3h 53min" instead of "233 min")
- Stop selection stays prominent without dominating the screen
- Departure countdowns tick live between API refreshes
- Timetable refresh throttled to one API call per 30 seconds to avoid rate limits
- Serialized warmup requests prevent TTC rate limiting on startup
- Widget operates fully offline (schedule-only, no API calls from native side)
- Widget preview shows realistic sample data
- Location permission is opt-in, card hidden while status loads
- Settings footer with version, app name, and vibecoded tagline
- Data source internals behind debug unlock for cleaner Settings
- Refresh spinner inside button instead of replacing it
- Compact legal section (3 rows instead of 6)
- Theme switching now animates across app chrome, palette picker, and mode controls
- Departures, Timetable, stop picker, and map overlays now follow the active palette instead of fixed dark colors
- Settings uses modern in-app notice sheets for debug unlock and easter egg messages
- Smart direction now asks for location before enabling and shows a first-run opt-in prompt

### Fixed

- Widget crash on Android 12+ (uses `set()` instead of `setExact()`, no SCHEDULE_EXACT_ALARM needed)
- Widget direction/stop mismatch resolved
- Toggle chips no longer clipped by widget rounded corners
- Google Maps marker clipping while keeping vehicle direction readable
- Stale departures no longer present as next arrivals
- Android switch tint now stays palette-correct instead of falling back to violet
- Google Maps now correctly switches between light and dark styling with app theme mode
- Smart direction now turns itself off when location permission is denied
- Permission and notice modals now respect light mode instead of staying dark

### Infra

- Date-based versioning (`YYYY.M.D`) with automated release script (`bun release`)
- Dynamic version computation in dev via `app.config.ts`; stamped values for production in `app.json`
- Baked static TTC data pipeline (`bun scripts/bake-ttc.ts`)
- Icon generation from SVG source (`bun scripts/generate-icons.ts`)
- ESLint configured via Expo
- Local Gradle path for production APK builds
- EAS-managed versionCode
- App renamed to Kojoring Time with fortress-and-bus icon artwork
