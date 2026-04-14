# Kojori Bus

Kojori Bus is a small, focused transit app for one very specific problem: getting between Tbilisi and Kojori without guessing when the next bus is actually coming.

It gives you one fast place to check:
- next departures for routes `380` and `316`
- direction-aware stop selection
- offline-friendly timetable data
- live map view
- Android home-screen widget
- fun app themes and route color palettes

This app is built for quick everyday use. Open it, see the next bus, move on.

## Why it exists

Generic transit apps are noisy. They try to solve every city and every route.

Kojori Bus is different:
- it focuses on Kojori <-> Tbilisi trips
- it keeps the main screen simple and glanceable
- it works well even when network is bad
- it lets you keep favorite stops and a widget on your home screen

## Screens

- `Departures`: fastest way to see what is coming next
- `Map`: live route view for both buses
- `Timetable`: schedule-first view by stop
- `Settings`: favorites, widget defaults, map options, color palette

## Tech

- Expo + React Native
- Bun for package management
- Expo Router
- TanStack Query
- Android widget module

## Quick start

Install dependencies:

```bash
bun install
```

Start dev server:

```bash
bun run dev
```

Build and install Android app locally:

```bash
bun run android
```

Because this project includes native Android widget code, JS reload alone is not enough for widget changes. Rebuild the app when you touch widget Kotlin/XML.

## Useful commands

```bash
bun run dev
bun run android
bun run android:clean
bun run android:apk
bun run android:bundle
bun run ios
bun run web
bun run typecheck
```

What they do:
- `bun run android`: runs `npx expo run:android` through Expo and installs local build
- `bun run android:clean`: cleans Gradle build artifacts
- `bun run android:apk`: builds debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`
- `bun run android:bundle`: builds release AAB at `android/app/build/outputs/bundle/release/app-release.aab`
- `bun run typecheck`: runs TypeScript without emitting files

## Widget testing

If you are working on widget code:

1. Run `bun run android`
2. Add the Kojori widget to your Android home screen
3. Open the app once so widget state syncs
4. Change direction / stop / palette in settings and check widget updates

Current widget design goals:
- no TTC fetches from widget sync path
- schedule-only snapshot
- should follow app palette

## Project structure

```text
src/app/                 Main screens
src/components/          Shared UI
src/hooks/               App state and data hooks
src/services/            TTC, offline cache, widget sync
modules/kojori-widget/   Native Android widget module
assets/                  Baked TTC data + images
```

## Notes

- Offline and baked data matter a lot in this app. They keep the experience usable even when TTC is slow or rate-limited.
- Widget and palette work depend on native rebuilds for full verification.

## License

Private project.
