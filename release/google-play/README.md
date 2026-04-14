# Kojori Bus Google Play production package

This folder collects the files needed to prepare, build, and submit the Android production release for Google Play.

## Included files

- `store-listing.md` — title, short description, long description, and store copy
- `data-safety.md` — Play Console Data Safety answers
- `content-rating.md` — questionnaire notes for the age rating form
- `app-access.md` — reviewer access notes
- `privacy-policy.md` — publishable privacy policy text
- `terms-of-service.md` — publishable terms text
- `release-checklist.md` — production submission checklist
- `setup.md` — end-to-end Play Console setup steps

## Build flow

1. Configure environment variables, especially `GOOGLE_MAPS_API_KEY_ANDROID`.
2. Run `bun run release:android:doctor`.
3. Build the production AAB with `bun run release:android:build`.
4. Submit with `bun run release:android:submit`.

## Notes

- The app is intended for the `production` EAS build profile.
- Location is optional and only used for on-device map/direction features.
- No analytics, ads, or user accounts are included.
