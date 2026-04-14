# Google Play setup instructions

## 1. Prepare the app

1. Install dependencies with `bun install`.
2. Set `GOOGLE_MAPS_API_KEY_ANDROID` in your environment.
3. Confirm `app.json` uses `com.whekin.kojoribus`.

## 2. Validate the release environment

Run:

```bash
bun run release:android:doctor
```

If the doctor reports missing environment variables or account setup, fix those first.

## 3. Build the production package

Run:

```bash
bun run release:android:build
```

This uses the EAS `production` profile and produces an Android App Bundle for Google Play.

## 4. Submit to Play Console

Run:

```bash
bun run release:android:submit
```

If you prefer manual upload, download the AAB from EAS and upload it in Play Console.

## 5. Fill in Play Console forms

Use the files in this folder for:

- store listing copy
- privacy policy
- terms of service
- Data Safety answers
- content rating guidance
- reviewer access notes

Make sure the privacy policy and terms URLs you enter in Play Console are publicly reachable before submission.

## 6. Common rejection checks

- Privacy policy must be published at a public URL
- Location permission must remain optional
- Store text must not promise perfect real-time accuracy
- Data Safety must match actual app behavior
