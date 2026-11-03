import type { SchedulePeriod } from "@/services/ttc";
import { localizedStopName } from "@/i18n/stop-names";
import { translate } from "@/i18n/translations";
import type { ResolvedLanguage } from "@/i18n/languages";
import {
  boardingKey,
  favoriteTitle,
  lookupStopId,
  patternKey,
  tripRouteAccentIndex,
  scheduledDepartures,
  transitTime,
  type Favorite,
} from "./model";

export const FAVORITES_WIDGET_SCHEMA = 3;

export function buildFavoritesWidget(
  favorites: Favorite[],
  schedules: Map<string, SchedulePeriod[]>,
  language: ResolvedLanguage,
  palette: { dark: string[]; light: string[] },
  now = Date.now(),
) {
  const snapshots = favorites.map((favorite) => {
    const periodGroups = favorite.boardings.map((boarding) => ({
      id: boardingKey(boarding),
      routeId: boarding.route.id,
      bus: boarding.route.shortName,
      periods: (schedules.get(patternKey(boarding)) ?? []).map((period) => ({
        fromDay: period.fromDay,
        toDay: period.toDay,
        serviceDates: period.serviceDates,
        minutes: (
          period.stops
            .find((stop) => stop.id === lookupStopId(boarding))
            ?.arrivalTimes.split(",") ?? []
        )
          .filter((value) => /^\s*\d{1,2}:\d{2}\s*$/.test(value))
          .map((time) => {
            const [hours, minutes] = time.trim().split(":").map(Number);
            return hours < 48 && minutes < 60 ? hours * 60 + minutes : -1;
          })
          .filter((minutes) => minutes >= 0),
      })),
    }));
    const items = favorite.boardings
      .flatMap((boarding) =>
        scheduledDepartures(
          boarding,
          schedules.get(patternKey(boarding)) ?? [],
          now,
          now + 7 * 86_400_000,
        ),
      )
      .sort((a, b) => a.epochMs - b.epochMs)
      .slice(0, 32)
      .map((dep) => ({
        key: dep.key,
        routeId: dep.boarding.route.id,
        bus: dep.boarding.route.shortName,
        time: transitTime(dep.epochMs),
        departureEpochMs: dep.epochMs,
      }));
    const stopLabels = (locale: ResolvedLanguage) =>
      [
        ...new Set(
          favorite.boardings.map((b) => localizedStopName(b.stop, locale)),
        ),
      ].join(" · ");
    const title =
      favorite.title ||
      [
        ...new Set(
          favorite.boardings.map((b) =>
            b.pattern.headsign === "Kojori"
              ? translate(language, "cityKojori")
              : b.pattern.headsign === "Tbilisi"
                ? translate(language, "cityTbilisi")
                : b.pattern.headsign,
          ),
        ),
      ].join(" / ") ||
      favoriteTitle(favorite);
    return {
      id: favorite.id,
      title,
      routeNumbers: [
        ...new Set(favorite.boardings.map((b) => b.route.shortName)),
      ].join(" + "),
      stopId: favorite.boardings[0]?.stop.id ?? "",
      stopLabel: stopLabels(language),
      syncedAtEpochMs: now,
      status: items.length ? "ready" : "empty",
      message: translate(language, "widgetNoDepartures"),
      items,
      periodGroups,
      iosStop: {
        id: favorite.id,
        favoriteId: favorite.id,
        stopId: favorite.boardings[0]?.stop.id ?? "",
        direction: `${[...new Set(favorite.boardings.map((b) => b.route.shortName))].join(" + ")} · ${title}`,
        names: {
          en: stopLabels("en"),
          ru: stopLabels("ru"),
          ka: stopLabels("ka"),
        },
        routes: Object.fromEntries(
          periodGroups.map((group) => [group.id, group.periods]),
        ),
        routeNames: Object.fromEntries(
          periodGroups.map((group) => [group.id, group.bus]),
        ),
      },
    };
  });
  const directions = Object.fromEntries(
    snapshots.map(({ iosStop: _, ...snapshot }) => [snapshot.id, snapshot]),
  );
  return {
    schemaVersion: FAVORITES_WIDGET_SCHEMA,
    favoriteOrder: favorites.map((f) => f.id),
    directions,
    palette: {
      dark: { route380: palette.dark[0], route316: palette.dark[1] },
      light: { route380: palette.light[0], route316: palette.light[1] },
    },
    // Native widgets colour by route id; the first trip a route appears in
    // decides, matching how the app colours that trip.
    routeColors: Object.fromEntries(
      favorites
        .flatMap((f) =>
          f.boardings.map((b) => {
            const index = tripRouteAccentIndex(b.route.id, f);
            return [
              b.route.id,
              { dark: palette.dark[index], light: palette.light[index] },
            ] as const;
          }),
        )
        .reverse(),
    ),
    strings: {
      openAppToLoad: translate(language, "widgetOpenLoad"),
      openAppToRefresh: translate(language, "widgetOpenRefresh"),
      noDeparturesSoon: translate(language, "widgetNoDepartures"),
      from: language === "ru" ? "от" : language === "ka" ? "საიდან" : "from",
      today: translate(language, "widgetToday"),
      tomorrow: translate(language, "widgetTomorrow"),
      nextDeparture: translate(language, "homeNextDeparture"),
      lastToday: translate(language, "homeLastDeparture"),
      now: translate(language, "commonNow"),
      inMinutes: translate(language, "timePlusMinutes", {
        minutes: "{minutes}",
      }),
      countdownHours: translate(language, "widgetCountdownHours", {
        hours: "{hours}",
        minutes: "{minutes}",
      }),
      countdownWholeHours: translate(language, "widgetCountdownWholeHours", {
        hours: "{hours}",
      }),
      countdownCompactMinutes: translate(
        language,
        "widgetCountdownCompactMinutes",
        { minutes: "{minutes}" },
      ),
      countdownCompactHours: translate(
        language,
        "widgetCountdownCompactHours",
        { hours: "{hours}", minutes: "{minutes}" },
      ),
      countdownCompactWholeHours: translate(
        language,
        "widgetCountdownCompactWholeHours",
        { hours: "{hours}" },
      ),
      nextFavorite:
        language === "ru"
          ? "Следующее избранное"
          : language === "ka"
            ? "შემდეგი რჩეული"
            : "Next favorite",
    },
    iosSchedule: {
      schemaVersion: 2,
      bakedAt: new Date(now).toISOString(),
      stops: snapshots.map((snapshot) => snapshot.iosStop),
    },
  };
}
