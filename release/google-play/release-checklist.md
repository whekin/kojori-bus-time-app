# Production release checklist

## Before build

- [ ] Set `GOOGLE_MAPS_API_KEY_ANDROID`
- [ ] Verify `app.json` package name is correct
- [ ] Confirm privacy policy and terms text are current
- [ ] Confirm privacy policy and terms URLs are public
- [ ] Increment version if this is a store update

## Build

- [ ] Run `bun run release:android:doctor`
- [ ] Run `bun run release:android:build`
- [ ] Download the generated AAB

## Play Console

- [ ] Create or open the app listing
- [ ] Upload the AAB
- [ ] Add store listing text
- [ ] Add screenshots and feature graphic
- [ ] Add privacy policy URL
- [ ] Add terms of service URL
- [ ] Complete Data Safety
- [ ] Complete content rating
- [ ] Set production release notes

## Reviewer readiness

- [ ] App launches without login
- [ ] App works with location denied
- [ ] Map and departures screens load
- [ ] Offline timetable still works
