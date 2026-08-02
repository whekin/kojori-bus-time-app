# Product Roadmap

Kojoring Time should stay a focused, glanceable transit app. The next major step is to make that focused experience portable: instead of being permanently tied to Kojori and central Tbilisi, the app should follow the user's favorite everyday journey.

## Next: Configurable favorite journey

Let the user choose two places on the existing `316` / `380` corridor and get the same fast experience the app currently provides for Kojori ↔ Tbilisi.

Example journeys should include:

- Tsavkisi ↔ Tbilisi
- Shindisi ↔ Tbilisi
- Okrokana ↔ Tbilisi
- Kojori ↔ another stop along the corridor

### MVP scope

- Save one favorite journey with two endpoints.
- Treat endpoints as user-facing places, while resolving the correct directional TTC stop/platform IDs underneath.
- Find direct `316` and `380` route patterns that serve both endpoints in the required order.
- Show the relevant buses and departures on the start screen and Departures screen.
- Use the chosen journey in Timetable and Map.
- Keep schedules available offline from baked data.
- Let the Android widget follow the active favorite journey without making network requests.
- Preserve the current Kojori ↔ Tbilisi setup as the default preset and migrate existing settings without losing favorites.

### Delivery phases

#### 1. Journey foundation

- Introduce a `FavoriteJourney` domain model instead of passing `toKojori` / `toTbilisi` throughout the app.
- Add a single journey service that resolves endpoints into valid route patterns, directions, stops, departures, and map data.
- Keep TTC route IDs, pattern suffixes, and platform matching behind this service.
- Handle ambiguous opposite-side platforms by confirming the boarding stop with the user when automatic matching is not reliable.

#### 2. App experience

- Add journey setup and editing in Settings or onboarding.
- Drive the start screen, Departures, Timetable, and Map from the active journey.
- Retain the current fast direction switch for the two legs of the journey.
- Show a clear unsupported state when the selected endpoints do not share a direct supported route.

#### 3. Offline data and widget

- Build the offline cache from the route patterns required by the active journey instead of four fixed Kojori/Tbilisi patterns.
- Generalize widget state and labels so they no longer assume Kojori and Tbilisi.
- Keep widget data schedule-only and synced from the app.

#### 4. Multiple favorite journeys

- Allow several saved journeys, such as home ↔ city and home ↔ work.
- Add a quick journey chooser while keeping one journey active for the widget.

## Later: Broader Tbilisi transit support

After the favorite-journey model is proven on the `316` / `380` corridor, consider supporting other TTC routes that provide a direct trip between two selected stops.

This is a separate expansion, not part of the first MVP. Full citywide trip planning, transfers, and arbitrary multi-route journeys would require a larger routing and data architecture and are not currently planned.

## MVP acceptance criteria

The first milestone is complete when a user can move to Tsavkisi, Shindisi, or Okrokana, select a pair of places on the supported corridor, and receive correct direction-aware departures, timetable, map, and widget information with the same offline-friendly behavior as the current Kojori ↔ Tbilisi experience.
