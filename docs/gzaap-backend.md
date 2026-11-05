# Experimental Gzaap departure cards

Default is TTC. To opt into the backend, set EXPO_PUBLIC_GZAAP_ARRIVALS=gzaap before starting/building Expo. Optional EXPO_PUBLIC_GZAAP_API_URL defaults to https://gzaap-api.whekin.dev. Restart Metro with cache clear after changing the environment. Do not enable in production builds before shadow/parity checks and collector verification.

Only favorite departure cards change source. Map positions and existing position evidence queries remain direct TTC. Backend mode sends boarding, up to 32 local timetable candidates and a fresh upstream-vehicle count. This context is request-local, not trusted stored telemetry. The server uses its own cached TTC observations and ported mobile rules. Unsupported stops, stale observations, timeout and server failure fall back to the local timetable without making direct arrival requests. Source query caches are isolated.

The server currently collects only configured stop IDs. Route-specific lookup of 1:2994 to 1:3932 remains limited to 380/316. Set the backend allowlist accordingly. Timetable collection, telemetry ingestion and automatic source switching are not part of this change.

Migrated server rules are generated with bun scripts/sync-mobile-rules.ts in the backend checkout. Run with --check to detect drift. Keep mobile safeguards during the experimental rollout.

## Position observations in test builds

Set EXPO_PUBLIC_GZAAP_OBSERVATIONS=true to opt in. This is independent of EXPO_PUBLIC_GZAAP_ARRIVALS: leave the arrivals source at TTC while testing history collection. Only successful, existing TTC position responses for 380/316 are sent. No extra TTC requests are introduced. Uploads are best-effort, limited to once per pattern per 30 seconds, one in flight, with five-second timeout and failure cooldown. No offline backlog or immediate retries. User/device location, user identity and installation IDs are not included. Disable the flag and rebuild/restart Metro to opt out.

Server endpoint: POST /v1/observations/positions, version 1, routeId, pattern, ageMs and up to 50 positions. Backend must set CLIENT_OBSERVATIONS_ENABLED=true. Reports remain in separate untrusted storage, deduplicated in approximate ten-second buckets and never used alone to declare that a bus has passed. Raw reports are retained for 30 days. Public beta ingestion has a shared 120-batches/minute quota across replicas; 429 pauses uploads. This quota does not authenticate clients.

The passed-early card is not enabled by this flag. It requires server-side route matching and confident trip attribution first.

Build an Android test APK: `bun scripts/build-observations-preview.ts [output.apk]`. It enables observations, leaves arrivals on TTC, and temporarily disables native OTA updates so a downloaded update cannot replace the embedded experiment. The generated manifest is restored after building. Requires the existing Android native project and SDK; APK is arm64 and uses the project's local test signing configuration. Does not publish a release or OTA update.

Verified 2026-11-03: backend CI and 48 PostgreSQL-backed tests passed; mobile 177 tests, typecheck and i18n passed, lint had no errors (56 existing warnings). The standalone arm64 APK was installed on Pixel_9_Pro, Departures and Map opened successfully, and fresh client rows for both 380 and 316 appeared in production storage. APK manifest confirmed OTA disabled; generated source manifest was restored.

## Passed-early cards

EXPO_PUBLIC_GZAAP_PASSED_EARLY=true enables the experimental card independently of the arrivals source. The Android preview script enables it, leaves arrivals on TTC, disables OTA and explicitly disables the development demo. Only an exact route/direction/stop/timetable-slot match can hide a departure. Invalid, expired, withdrawn or failed decisions leave ordinary departures visible. Card expiry uses a local deadline timer, independent of the polling interval. A changed local timetable invalidates a server decision rather than hiding a different bus.

The server requires independent downstream evidence and resolution of competing timetable trips. Weekly fallback is allowed with a last-known-weekly label; an explicit gap inside the supplied calendar is still respected. Lack of a card does not prove the bus has not passed. Origin/terminal departures without before/after route evidence are not inferred by this policy.

Native development visual harness: EXPO_PUBLIC_GZAAP_PASSED_DEMO=true with a development client. It clearly labels synthetic data and checks the real card renderer/deadline helper. The branch is guarded by __DEV__; release builds cannot show it.

Verified 2026-11-04: 181 mobile tests, 72 PostgreSQL-backed server tests, typecheck, translation parity (317 keys), lint without errors. Emulator showed the card and its expiry at the displayed scheduled minute. Final APK has OTA disabled and no development preview, opens ordinary Departures, and was installed on S25 with data preserved.

Final row binding uses the local scheduled row key, handling floating-point ETA conversion without removing unanchored live rows. The final card APK including the binding refinement was installed and opened on S25 with data preserved.

## Large-run beta controls

`EXPO_PUBLIC_GZAAP_PASSED_PATTERNS` optionally limits cards to comma-separated `routeId/pattern` keys. Empty means all covered starter directions. The build script pins all four explicitly. This is independent of position uploads and the ordinary TTC arrivals source. Own ETA remains backend shadow-only; this beta does not fetch or display it.

`src/transit/gzaap-contract.ts` is generated from the backend wire contract. From the backend checkout, run `bun scripts/sync-contract.ts --check` to verify parity or omit `--check` to regenerate.

The local preview build writes a `.apk.json` sidecar containing source revision, working-copy status, APK SHA-256, architecture, OTA state and explicit flags. Rebuild with the flags off to revert the beta, preserving app data. No Play Store release or OTA publication is part of this run.

## Own ETA preview (off by default)

`EXPO_PUBLIC_GZAAP_ETA_PREVIEW=true` opts into a separate experimental arrival-range block for covered 380/316 boardings. It requires the ordinary arrivals source to stay `ttc`. `EXPO_PUBLIC_GZAAP_ETA_PATTERNS` can restrict directions. Serving also requires the independent server `ETA_PREVIEW_ENABLED` control; both controls remain off for the preparation release, including the standard Android beta builder.

The preview never binds vehicle estimates to timetable rows, removes TTC departures or changes widget data. Missing, malformed, stale, expired, unsupported or failed responses fall back to the ordinary TTC UI. The default build makes no ETA requests. No operations-panel or Coolify credentials are sent to this public endpoint.

`EXPO_PUBLIC_GZAAP_ETA_DEMO=true` is a development-only synthetic visual fixture for range/fallback/expiry checks. It makes no network requests and is guarded by `__DEV__`. The Android builder explicitly disables it and own ETA while preserving observations/passed-early beta flags.
