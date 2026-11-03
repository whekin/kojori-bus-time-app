# Experimental Gzaap departure cards

Default is TTC. To opt into the backend, set EXPO_PUBLIC_GZAAP_ARRIVALS=gzaap before starting/building Expo. Optional EXPO_PUBLIC_GZAAP_API_URL defaults to https://gzaap-api.whekin.dev. Restart Metro with cache clear after changing the environment. Do not enable in production builds before shadow/parity checks and collector verification.

Only favorite departure cards change source. Map positions and existing position evidence queries remain direct TTC. Backend mode sends boarding, up to 32 local timetable candidates and a fresh upstream-vehicle count. This context is request-local, not trusted stored telemetry. The server uses its own cached TTC observations and ported mobile rules. Unsupported stops, stale observations, timeout and server failure fall back to the local timetable without making direct arrival requests. Source query caches are isolated.

The server currently collects only configured stop IDs. Route-specific lookup of 1:2994 to 1:3932 remains limited to 380/316. Set the backend allowlist accordingly. Timetable collection, telemetry ingestion and automatic source switching are not part of this change.

Migrated server rules are generated with bun scripts/sync-mobile-rules.ts in the backend checkout. Run with --check to detect drift. Keep mobile safeguards during the experimental rollout.
