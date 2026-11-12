# Data Safety form notes

Use these answers in the Google Play Console Data Safety form.

## Data collected

**App activity → App interactions**, for **Analytics** only:

- At most once a day the app reports that it was used, with the platform and app version, so the developer can see total daily, weekly and monthly use.
- Collected: yes. Shared with third parties: no. Linked to the user: no (no identifier is sent; the server keeps only totals and does not store the IP address).
- Optional: yes, users can turn it off in Settings → About → Privacy.
- Encrypted in transit: yes (HTTPS).

Nothing else leaves the device for the developer. The app:
- does not require sign-in
- does not send crash reports or advertising IDs
- does not upload user location, contacts, photos, or files

## Device permissions used

- **Location**: optional, used only on-device for map display and direction detection

## Data sharing

- Shared with third parties for advertising: **No**
- Shared with third parties for analytics: **No**
- Shared with third parties for account creation: **No**

## Security

- Network requests use HTTPS
- TTC API requests do not include personal identifiers
- No personal data is stored on the developer’s servers; only anonymous usage totals

## Reviewer note

If Google asks about location usage, explain that location is optional and used only for on-device features. The core bus timetable functionality works without granting location access.
