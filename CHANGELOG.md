# Changelog

## v2026.7.6
### Fixed

- Android widget now always follows the device light/dark theme instead of the in-app theme, with native day/night colors for background, text, and dividers — departure times stay readable regardless of the theme or palette chosen in the app.
- Widget route badge colors (380/316) still follow the app palette, but pick the light or dark variant matching the device theme.
- Removed the dark fading-edge bars the widget list drew over the direction toggle buttons and the last visible row.
- Direction toggle buttons are now pinned above the departure list instead of scrolling with it, so list edge effects can never overlap them; departure rows are slightly tighter so more times fit.
- The 3×3 widget now renders its preview in the widget picker instead of "Couldn't add widget" (its preview layout had an invalid `<include>` root).
- Widget no longer asks to "Open app to refresh": it now syncs a full week of scheduled departures and repeats the weekly timetable indefinitely, so it always shows upcoming times even if the app is never reopened.

## v2026.7.5
### Improved

- Simplified Departures direction handling so Kojori and Tbilisi panes stay behaviorally consistent.
- Improved accessibility labels for saved-stop, Settings, legal, and modal controls.

### Fixed

- Location errors in Settings now use localized app copy instead of English-only hook messages.
- Russian plural countdown labels now keep values like 21, 31, 41, and 51 instead of falling back to 1.
- Departures now trusts TTC live arrival times only when a matching active bus is visible in vehicle-position data, reducing noisy live badges for buses that have not started.
- Live buses whose TTC scheduled time points at a trip hours away now anchor to the nearest timetable slot by realtime ETA, so the next-bus card shows the scheduled time and drift instead of a bare "live" label alongside a duplicate scheduled row.
- The next-bus card no longer shows an orphaned dot separator when a live departure has no timetable anchor.
- Kojori stops now treat bus 316 as mid-route, so its live arrivals running several minutes ahead of the timetable are shown instead of being suppressed by the strict route-start filter (which still applies to 380 there).
- Route-start stops now accept live buses running up to 5 minutes late (buses still cannot depart more than 2 minutes ahead of the timetable there).

### Infra

- Removed unused starter/helper components from the app bundle and updated architecture notes to match.
- Restored Expo lint compatibility by disabling plugin checks that are already covered by TypeScript or incompatible with the current Expo lint stack.

## v2026.5.31
### Improved

- Reduced hidden-screen background work and tuned map/navigation motion for smoother tab switching, timetable updates, and live vehicle movement.
- Brake Dust now uses a calmer two-accent palette with brass navigation and muted rust UI elements.
- Bottom tab buttons now jump directly to distant tabs instead of sliding through Map and Timetable on the way.

## v2026.5.23
### Fixed

- First route stops now ignore live TTC countdowns that jump more than two minutes away from the timetable, keeping first-stop departures on schedule when live data is noisy.
- Russian Settings now capitalizes the Documents label consistently.

### Infra

- EAS Updates now use a stable manual runtime so compatible daily releases can receive automatic JS and asset updates.
- Release automation now supports same-day re-releases by incrementing the Android build suffix and replacing the existing GitHub release asset.
- Runtime checks now block releases and OTA publishes when native/runtime files changed without a runtime bump.

### Improved

- Theme changes now use simpler Settings controls, preview appearance choices locally, and delay app-wide updates until after interactions to reduce freezes on slower devices.
- The native map now unmounts while inactive, avoiding hidden map restyles during appearance changes.
- Added Brake Dust, a downhill-rider theme with graphite surfaces, fork-gold route marks, pine green, and trail orange.
- Sorbet theme colors now use stronger text, route, and status accents for better readability in light and dark mode.
- Woodland Party light theme now uses slightly stronger pink and route accents for readability.

### Fixed

- English countdown labels now use consistent pluralized hour/minute wording across Departures, Timetable, status, and Settings diagnostics.
- Scheduled-only next departure labels now use the themed muted text color instead of falling back to black.
- Russian next-departure relative times now use "через ..." wording instead of compact plus notation.
- Georgian live and relative departure labels now use words instead of compact plus/minus notation.

## v2026.5.22
### Improved

- App builds can now receive Expo over-the-air updates through the configured EAS production and preview channels.
- Next departure cards now lead with the time-until-arrival countdown while keeping the scheduled departure time and live/scheduled status visible.
- Scheduled-only next departure cards now emphasize the timetable time first and move the relative countdown into smaller supporting text.
- Russian next-departure labels are shorter so the card header fits beside the route and live signal.
- Live status dots now gently pulse while respecting reduced-motion settings.
- Start screen destination cards now use brighter daytime artwork and higher-contrast overlay details in light mode.
- Map direction switching now uses the same compact control as Departures and Timetable.
- Stop selector rows now reserve route accent colors for selected states and use consistent action-button tinting, making unselected stops easier to scan.
- Settings overview now uses tappable status cards, jumps the language card straight to language choices, and shows the last TTC data refresh instead of dataset counts.
- The bottom navigation now uses a compact rounded floating bar with a transparent fade behind it and no blur layer.
- The theme chooser now keeps the selected palette centered and shows compact palette position dots.
- Theme switching now avoids app-wide per-frame color interpolation, making palette changes much smoother.
- Dragging the theme chooser now previews palette changes before the carousel settles.
- Theme chooser swipes now require a shorter drag and settle to the palette preview shown during the drag.
- Non-selected theme cards now stay visually grounded in the active theme while still showing their palette accents.
- Tapping a theme card now immediately marks that card as selected and keeps carousel position in sync.

### Fixed

- Android now keeps the app window background themed so physical devices do not show a white frame around the app.
- Android status bar icons now switch between dark and light styles with the selected app theme.
- Departures no longer infer cancelled buses from TTC live-data gaps, keep delayed live buses visible after their scheduled time, and ignore noisy seven-minute live ETAs at early route stops when the schedule says the bus is sooner.
- Departures no longer keeps current-minute scheduled buses as "Now" when live data does not confirm them.
- Elene Akhvlediani now consistently uses Baratashvili for TTC data lookups while staying selectable as the displayed stop.
- Android widgets now open directly with the direction chooser and timetable, without the extra title and refresh row.
- Settings subpages now use a proper back icon with a cleaner touch target.
- Demo mode no longer creates fake cancelled departures.
- Focused map stop markers now use the active route color consistently and a larger centered bus glyph.
- Live delay badges in departure rows now get enough room for longer localized text.
- Live arrivals with stale TTC schedule anchors now stay visible without showing absurd delay badges.
- Live departures now show hard scheduled times when they can be matched to the timetable, without inventing scheduled times from live ETAs.
- Map rendering now uses fewer native route overlays and delays ordinary stop markers until close zoom to avoid Android map freezes.
- Live buses on the map now glide between TTC position updates, face along the route line, use route-aware speed caps, stop before the reported next stop, and stay still at route starts.
- Live bus positions now refresh every 5 seconds while the Map tab is active.
- Live bus markers now use a slightly translucent route pointer while keeping the route number readable.
- Map stop details now show live arrival chips when a selected stop has realtime buses.
- Ordinary map stops now use smaller route-colored dots that appear at mid zoom.
- Saved map stop pins now shrink into compact dots when decluttered at far and upper-mid zooms, with Kojori Center kept visible first.
- Saved map stop markers now use native Google map pins on Android instead of clipped custom marker views.
- Saved map stop markers now use route-colored bus-stop icons instead of Google's brighter native pin tint.
- The start screen app icon now stays visible in light mode.

### Infra

- Release automation now embeds the production update channel and publishes the matching EAS update after the GitHub release is created.

## v2026.5.20
### Improved

- Shortened the Russian timetable stop heading so the direction switch has more room.
- Removed the duplicate plus sign from the add-stop button.
- Removed the decorative SVG background from the start direction chooser.
- Added the app icon and name to the start direction chooser.
- Live departure cards now ignore stale live ETAs and match delayed buses to the correct scheduled trip.

## v2026.5.19
### Improved

- Stop cards now use a cleaner plain background, put the stop-change action beside the map button, and sit more comfortably below the status area.

## v2026.5.17
### Improved

- Departures and Timetable now fold direction switching into the stop card, leaving stop changes available without a separate route card.
- Timetable no longer shows departure-count totals in the header or section dividers.

### Fixed

- Bottom sheets now use a single scroll-aware implementation, so long stop lists remain scrollable while preserving drag-to-close.
- Departures no longer shows a redundant header clock and refresh button; pull-to-refresh remains available for manual updates.

## v2026.5.16
### Improved

- Web now shows Kojori app tabs instead of Expo starter navigation.
- Map stops are now actionable: tap a stop to save or remove it, or jump straight to the next buses.
- Focused map stops can now be dismissed by tapping empty map space or using Android back.
- Map stop and vehicle popups now use the same themed panel treatment as the rest of the map controls.
- Accessibility labels and selected states are clearer across tabs, route filters, map controls, TTC status, and Settings, with reduced-motion support for decorative animations.
- Light and dark theme switches now apply immediately instead of crossfading the full app palette.
- Appearance settings no longer include retired themes; old saved theme choices fall back to Midnight Fig.
- Added Woodland Party, a dusty pink and forest olive palette with bus colors from the reference swatches.
- Theme choices now start with Midnight Fig, followed by Woodland Party and Sorbet Static.
- Departures now calls out the last bus of the day and shows the next scheduled service instead of dead-ending after service ends.
- App status and empty-state copy is warmer in English, Georgian, and Russian, with plural-aware counts for stops, departures, durations, and saved TTC datasets.
- Stop picker badges now sit next to the stop name instead of floating at the row edge, with clearer Russian copy for the timetable start stop.
- TTC offline states now appear in a thin expandable top bar on Departures and Timetable, explaining the current fallback mode without covering route controls.
- Hidden demo controls can now force unstable, offline, rate-limited, and device-offline TTC states for UI testing.
- Russian TTC rate-limit copy now says “request limit” instead of calling TTC “busy”.

### Fixed

- Timetable rows stay fully readable after their scheduled time has passed.
- Bottom tab icons now reliably update their active tint when the app theme changes.
- Bottom tab highlighting now updates after direct tab taps even when the pager does not emit scroll progress.
- Saved map stop markers no longer clip their bus-stop glyph at smaller zoom levels.
- Stop cards no longer flash an uneven map-texture background during pointer interaction.
- Map refresh stays reachable when a TTC warning chip is visible.

### Infra

- Added an i18n parity check so English, Georgian, and Russian translation keys and placeholders stay aligned.
- Aligned Android native dependencies with Expo 55 compatibility so debug builds install cleanly after dependency updates.

## v2026.5.15
### Improved

- Map zoom now stays around the Tbilisi-Kojori route area, uses smaller live bus pins, and makes ordinary stop markers clearer at route zooms while keeping saved stops visible.
- Map now uses code-drawn circular live bus icons with custom popups and TTC-style route stop markers, with saved stops emphasized and focused stops opening a larger callout.
- Stop pickers now start with curated Kojori and Tbilisi stops, local hints, and in-app map focus buttons.
- Start screen destination cards now use generated full-card landmark imagery for Kojori's Azeula Fortress and Tbilisi's Liberty Square.
- Android back now behaves more naturally: it returns through visited tabs and reopens the destination picker from Departures instead of immediately closing the app
- Header refresh button now uses the same centered vector icon treatment as the rest of the app chrome
- Start screen now uses a lighter destination-picker layout with landmark cards, direct arrows, and clearer location preference copy
- Russian app copy now uses friendlier wording across the start screen, live departure labels, and Settings
- Destination picker now stays focused on manual direction choices without the extra location action
- Departures now keeps both destination panes mounted, so switching sides no longer waits for the route screen to rebuild
- Direction changes now update visible app state before persisting the remembered direction, making picker switches feel immediate
- Direction and stop-selection bottom sheets now use native Android swipe-down dismissal
- Settings now opens to a compact hub with Commute, Appearance, Widget, Data, and About sections instead of one long flat page
- Hidden service demo now previews both cancelled replacement departures and live demo buses on the Map
- Live-departure chips now use the live color consistently, with timing differences kept in the label
- Boarding stop cards now include a subtle street-map texture behind the controls
- TTC data refreshes now run one request at a time with no artificial delay, and refreshed datasets rest for three hours before their buttons can run again
- Timetable spacing is tighter between the stop card, bus filters, and time-of-day sections
- Data refresh no longer calls individual stop-detail endpoints for stop names, reducing TTC rate-limit pressure
- Direction controls now use a FROM / TO card style and toggle destination directly without opening a sheet
- Direction toggles now animate Kojori and Tbilisi swapping places, with the accent color easing into the next route before the rest of the screen updates
- Map route overlays now wait until the Map tab is active before catching up to direction changes made elsewhere
- Timetable bus filter chips now have more breathing room below the stop card
- Timetable entries now use rounded grouped rows with subtle upcoming-time hints
- Live departure status text now avoids repeating "live" and uses shorter drift labels in compact chips
- Direction pills now adapt their width for localized city names while keeping the swap animation consistent
- Georgian start-screen destination cards now avoid clipping display text
- First-install defaults now explicitly start Tbilisi departures at Elene Akhvlediani Street and Kojori departures at Kojori Center
- Sorbet Static now uses the requested lilac and mint route colors for buses 380 and 316

### Fixed

- Departures tab and next-bus highlights now update to the active palette colors after theme changes
- Map theme now refreshes when switching between light and dark mode instead of keeping the previous Google Maps style
- Start screen now follows the selected light or dark theme instead of always using a light background

### Infra

- Changelog entries now collect under `[UNRELEASED]`; the release script renames that section to the release version automatically
- Release builds now bake fresh TTC static data before prebuild so packaged schedules stay current

## v2026.5.13

### Improved

- Live departures now show the scheduled timetable time as a small secondary hint next to the live-adjusted time
- Hidden maintenance tools now live in one Settings admin section, with saved-data diagnostics kept out of the normal Settings flow
- TTC request logs in Settings now use a compact scrollable panel instead of taking over the page
- Russian Settings copy now uses more natural wording for saved data, update status, admin tools, and TTC logs

## v2026.5.9

### New

- App language support for English, Georgian, and Russian, including a Settings language selector, localized app chrome, Georgian TTC labels where supported, Russian known-stop labels, and localized Android widget text

### Improved

- TTC data sync in Settings now shows per-request progress, wait states, and clearer Russian layout while keeping the TTC-friendly 10-second request pacing
- TTC data sync now shows freshness per dataset, with the summary based on the oldest available offline data instead of the newest single update
- Russian and Georgian coverage now includes Settings data/source/legal rows, widget size labels, theme names, live-status badges, compact countdowns, and fallback stop names from English TTC data
- Destination cards now wait for a completed tap instead of triggering as soon as a finger touches down
- All themes now use the swapped Kojori/Tbilisi destination accent colors consistently
- Start screen location copy now makes it clearer that location is a next-launch preference, not another manual destination choice
- Opening after the destination picker now feels snappier: Departures is prepared behind the picker, heavier tabs wait until after selection, and the launch reveal animation is shorter

### Infra

- Release state is now ignored locally so generated `.release-state.json` files do not block release preflight
- Release APK builds now restart Gradle with stable tool paths so stale daemon environments do not break Expo autolinking

## v2026.4.21

### New

- **Start screen** — first-launch destination picker with hand-drawn landmark illustrations (Azeula fortress ruins for Kojori, Sameba Cathedral for Tbilisi); preloads arrivals so the departures screen lands without a spinner
- **Direction pill** — single header control across Departures, Map, and Timetable; tap to switch direction, enable smart detection, or refresh location. Replaces the ambiguous arrow toggle with an explicit "to <destination>" label
- **Add stop from the picker sheet** — reorder sheet now has an "Add another stop" action, so you can add new stops without needing exactly one already
- **TTC data updates** — Settings now has deliberate one-at-a-time refresh controls for timetables, stops, map lines, and stop names, plus a slow weekly refresh when cached data is stale

### Improved

- Map tab now respects the shared direction instead of resetting on every open
- Smart direction rechecks on every launch and foreground instead of riding a 30-min cache; cache (15 min) only seeds the UI instantly while a fresh fetch runs in parallel
- Settings now has a single **On launch** choice: ask every time, use location, or remember the last direction
- TTC data refresh now shows queued/updating/updated states and uses a shorter 10-second gap between safe refresh requests
- Smart direction auto-skips the start screen when it resolves within ~1.8 s of launch; slow or failed detection still falls back to the manual picker
- Android widget now uses `to Kojori` / `to Tbilisi` wording instead of arrow-based direction labels, matching the app UI

### Fixed

- Direction arrow was ambiguous about which side you were going to — dedicated destination picker removes the guesswork
- Smart direction was inverted — detecting you in Tbilisi set the direction *to* Tbilisi instead of suggesting Kojori. Now suggests the opposite side from your location.
- "Checking location" no longer lingers — location detection now falls back within 2 seconds instead of hanging on the loading state

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
