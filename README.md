# Kojoring Time

A focused TTC transit app built around the routes you actually use. Save a route, its direction and your boarding stop, then check the next departure in one tap.

- Save trips on any TTC bus, metro or cable-car route: one or more routes going the same way, boarded at your saved stops.
- Group interchangeable routes into a single departures feed.
- Keep timetables offline, with live predictions and a map when connected.
- Choose any date in the timetable; reorder, edit and add return trips in Settings.
- Show saved trips in Android and iPhone Home Screen widgets.
- Use English, Georgian or Russian with light/dark themes and app palettes.

The existing Kojori–Tbilisi 380/316 setup is preserved as a starter collection. Existing active and widget stops migrate automatically; other saved stops stay available as quick choices in the editor.

## Screens

- `Departures`: the selected trip — boarding-stop map, next bus, upcoming list. The start screen lists all trips and adds new ones.
- `Map`: geometry, boarding stops and vehicles for the selected trip.
- `Timetable`: the selected trip's calendar and route filters, in Tbilisi time.
- `Settings`: appearance, language, launch, widgets, offline data and app information.

See [the trips architecture and verification guide](docs/favorites-architecture.md) for storage, native widget migration and web hosting requirements.

## Tech

- Expo + React Native
- Bun for package management
- Expo Router
- TanStack Query
- Native Android widget module and iOS WidgetKit extension

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
bun run runtime:check
bun run update:production
bun run release:android:preflight
bun run release:android:doctor
bun run release:android:build
bun run release:android:submit
```

What they do:
- `bun run android`: runs `npx expo run:android` through Expo and installs local build
- `bun run android:clean`: cleans Gradle build artifacts
- `bun run android:apk`: builds debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`
- `bun run android:bundle`: builds release AAB at `android/app/build/outputs/bundle/release/app-release.aab`
- `bun run typecheck`: runs TypeScript without emitting files
- `bun run runtime:check`: blocks OTA updates when native/runtime files changed without a runtime bump
- `bun run update:production`: publishes a production EAS update for JS/assets-only changes
- `bun run release:android:preflight`: runs lint + typecheck before production build
- `bun run release:android:doctor`: checks the EAS release environment
- `bun run release:android:build`: builds the Android production AAB with EAS
- `bun run release:android:submit`: submits the latest production build to Play Console

## Install on iPhone

Requires **iOS 16.4+**. The IPA is unsigned; opening it directly in Files does not
install it. SideStore signs and installs it with your Apple Account. A paid Apple
Developer membership is not required.

1. Set up SideStore using its [official guide](https://docs.sidestore.io/docs/installation/install), starting with the linked prerequisites. Complete the first SideStore refresh before importing apps.
2. On your iPhone, open [Kojoring Time releases](https://github.com/whekin/kojori-bus-time-app/releases/latest). Under **Assets**, download `kojoring-time-vYYYY.M.D-sidestore.ipa` to Files. If only the APK is listed, the [iOS build](https://github.com/whekin/kojori-bus-time-app/actions/workflows/ios-sidestore.yml) may still be running; failed checks prevent IPA publication.
3. Connect the VPN required by your SideStore setup. In SideStore, open **My Apps**, tap **+**, and choose the downloaded IPA. **Keep app extensions** when asked, so the Home Screen widget is installed.
4. If iOS requests developer trust, follow the prompt under **Settings → General → VPN & Device Management**. If launch requires Developer Mode, enable it under **Settings → Privacy & Security → Developer Mode**, restart, and confirm on the phone.
5. Open Kojoring Time once. On iOS 17+, add it from the Home Screen widget gallery; long-press the widget and choose **Edit Widget** to select its stop and routes.

With a free Apple Account, refresh Kojoring Time and SideStore before their
seven-day signing period expires. Check the expiry counters in SideStore rather
than relying solely on background refresh. See the [SideStore FAQ](https://docs.sidestore.io/docs/faq)
for signing limits and troubleshooting. A widget extension uses an additional App ID.

To update, download the newer IPA and import it into SideStore over the existing
app using the same Apple Account. Keep the installed app to preserve its settings.
These IPAs use embedded JavaScript with Expo OTA updates disabled, so app changes
and new offline timetable data require a newer IPA. Refreshing a signature only
renews installation validity; it does not download a new app version.

The widget uses its bundled offline timetable, Tbilisi time, and the device
language (English, Georgian, or Russian). Its stop/route settings are independent
of the app's Android widget preferences. Available sizes are small, medium,
large, and full-page portrait on iOS 27+. iOS does not offer a tall half-width
Home Screen widget size. Liquid Glass navigation uses the system appearance on
iOS 26+; older supported versions use the standard tab bar.

Each release includes an adjacent `.ipa.sha256` file. On a Mac, download both
files into the same folder and verify the IPA with:

```bash
shasum -a 256 -c kojoring-time-vYYYY.M.D-sidestore.ipa.sha256
```

## Publishing releases

`bun run release` creates today's date-based release (or use
`bun run release 2026.10.27` for an explicit date). Commit user-facing notes under
`## [UNRELEASED]` in `CHANGELOG.md` first.

The existing Android pipeline bakes and checks TTC data, stamps both platforms'
versions, builds the APK, pushes the release commit/tag, and publishes the GitHub
release. It then dispatches **iOS IPA (SideStore)** on that exact tag and publishes
the Android production EAS update. iOS builds run asynchronously on GitHub's macOS
runner; the local script finishing means the iOS build was queued, not that its
IPA has passed validation.

The iOS workflow builds unsigned arm64 Release apps for device and simulator,
checks lint, TypeScript, Bun tests and the native offline schedule, then runs the
Maestro interface flow. Only after both jobs succeed does it upload
`kojoring-time-vYYYY.M.D-sidestore.ipa` and `.ipa.sha256` to that existing release.
The IPA includes its JavaScript bundle and WidgetKit extension. A guard rejects
publication if a re-release moved the tag while the build was running. No Apple
signing certificates, Apple Account credentials, Expo login, or added repository
secrets are needed by iOS CI; release uploads use the job's GitHub token.

**One-time setup:** merge this workflow and the release script into the default
branch before using `bun release`. GitHub requires a dispatchable workflow on the
default branch; release preflight checks that it exists. Your local `gh` login
must have repository write/Actions access, alongside the existing Android release
and EAS setup. If preflight or a later phase fails, resume the same release with
`bun run release YYYY.M.D --continue`.

If today's tag already exists, the script performs a re-release: it increments
the build suffix, replaces the tag/APK/notes, and queues iOS again. The existing
IPA is replaced only after the new build passes, so until then it remains the
previous build of that date. Prefer a new date version for ordinary releases.

For a failed iOS run, use **Re-run failed jobs** in GitHub Actions. To rebuild and
attach an IPA independently of Android, dispatch on the matching existing tag:

```bash
gh workflow run ios-sidestore.yml --ref v2026.10.27 -f release_tag=v2026.10.27
gh run list --workflow ios-sidestore.yml --event workflow_dispatch
```

A nonempty `release_tag` must match both the selected Git tag and stamped app
version. The release must already exist. Leaving the input empty creates preview
artifacts without uploading anything to Releases. Pushes to `main` and the
experimental iOS branch also run preview checks. Those temporary artifacts expire
after seven days; release assets remain attached to the release.

CI uploads `sidestore-ipa`, `ios-simulator` (an arm64 `.app` ZIP for Apple Silicon),
`ios-ui-checks` (screenshots and results), and build logs. Extract the simulator ZIP
and install with `xcrun simctl install booted <path-to-app>`. The workflow uses
Xcode 27.1 and generates the ignored native project from Expo config. A real-device
installation check is still useful before announcing a release.

## Updates

Android EAS Updates use the manual runtime in `app.json` (`kojori-native-7`) instead of the date-based app version. This lets JS-only fixes update compatible Android installs automatically. SideStore IPAs deliberately keep OTA updates disabled.

Only bump `expo.runtimeVersion` when native compatibility changes, such as Expo SDK or React Native upgrades, native dependency changes, config plugin changes, Android widget Kotlin/XML changes, permissions, icons, splash screen, or other native app config. The runtime guard checks these files before releases and manual EAS updates.

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
- Google Play release files live in `release/google-play/`.

## License

Private project.
