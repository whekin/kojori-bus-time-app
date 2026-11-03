// @ts-expect-error Bun provides the test module at runtime.
import { describe, expect, it } from "bun:test";
import type { SchedulePeriod } from "@/services/ttc";
import {
  boardingKey,
  nearbyFavorite,
  upstreamVehicleCount,
  mergeTransitArrivals,
  patternKey,
  readFavoritesState,
  reverseTrip,
  serviceDayBounds,
  tripRouteAccentIndex,
  activeBoardings,
  tripStopId,
  tripStops,
  scheduledDepartures,
  transitDate,
  transitTime,
  type Boarding,
} from "./model";
import { migrateLegacyFavorites } from "./legacy";
import { buildFavoritesWidget } from "./widget";
import type { Settings } from "@/hooks/use-settings";

const boarding: Boarding = {
  route: {
    id: "1:R216088",
    shortName: "101",
    longName: "Krtsanisi – Varketili",
    mode: "BUS",
  },
  pattern: { patternSuffix: "1:01", headsign: "Varketili" },
  stop: { id: "1:2949", label: "Krtsanisi Public School" },
};
const weekday: SchedulePeriod = {
  fromDay: "MONDAY",
  toDay: "FRIDAY",
  serviceDates: [],
  stops: [
    { id: "1:2949", name: "School", position: 1, arrivalTimes: "07:00,23:50" },
  ],
};
const weekend: SchedulePeriod = {
  ...weekday,
  fromDay: "SATURDAY",
  toDay: "SUNDAY",
  stops: [{ ...weekday.stops[0], arrivalTimes: "09:00,24:15" }],
};
const palette = {
  dark: ["#111111", "#222222", "#333333", "#444444"],
  light: ["#111111", "#222222", "#333333", "#444444"],
};

describe("arbitrary favorite routes", () => {
  it("suggests only an unambiguous nearby favorite and never guesses a destination at shared stops", () => {
    const stop = { id: "near", label: "Near", lat: 41.7, lon: 44.8 };
    const first = { id: "one", title: "", boardings: [{ ...boarding, stop }] };
    const second = {
      id: "two",
      title: "",
      boardings: [{ ...boarding, stop: { ...stop, lon: 44.8001 } }],
    };
    expect(nearbyFavorite([first], 41.7, 44.8).status).toBe("available");
    expect(nearbyFavorite([first, second], 41.7, 44.8).status).toBe(
      "ambiguous",
    );
    expect(nearbyFavorite([first], 42.7, 45.8).status).toBe("far");
  });
  for (const count of [0, 1, 2, 12])
    it(`round-trips ${count} favorites without a route-count limit`, () => {
      const favorites = Array.from({ length: count }, (_, i) => ({
        id: `favorite-${i}`,
        title: "",
        boardings: [
          {
            ...boarding,
            route: {
              ...boarding.route,
              id: `route-${i}`,
              shortName: String(100 + i),
            },
          },
        ],
      }));
      const state = {
        version: 2 as const,
        favorites,
        selectedId: favorites.at(-1)?.id ?? null,
      };
      expect(readFavoritesState(JSON.parse(JSON.stringify(state)))).toEqual(
        state,
      );
    });
  it("keeps patterns scoped to routes and validates persisted entries", () => {
    expect(patternKey(boarding)).not.toBe(
      patternKey({ ...boarding, route: { ...boarding.route, id: "another" } }),
    );
    expect(
      readFavoritesState({
        version: 1,
        favorites: [{ id: "bad", title: "", boardings: [{}] }],
        selectedId: "bad",
      })?.favorites,
    ).toEqual([]);
  });
  it("migrates saved stops of each direction into one trip with the active stop selected", () => {
    const state = migrateLegacyFavorites({
      tbilisiFavorites: ["1:2994", "1:3932"],
      kojoriFavorites: ["1:3078"],
      activeTbilisiStopId: "1:3932",
      activeKojoriStopId: "1:3078",
      widgetTbilisiStopId: "1:853",
      widgetKojoriStopId: "1:3078",
      sharedDirection: "toKojori",
    } as Settings);
    expect(state.favorites.map((f) => f.id)).toEqual([
      "legacy:toKojori",
      "legacy:toTbilisi",
    ]);
    const trip = state.favorites[0];
    expect(state.selectedId).toBe("legacy:toKojori");
    expect(tripStops(trip).map((s) => s.id)).toEqual([
      "1:3932",
      "1:2994",
      "1:853",
    ]);
    expect(activeBoardings(trip).map((b) => b.route.shortName)).toEqual([
      "380",
      "316",
    ]);
    expect(readFavoritesState(state)).toEqual(state);
  });
  it("merges version-1 per-stop favorites into trips and keeps the selected stop", () => {
    const stop = (id: string) => ({ id, label: id });
    const at = (id: string, stopId: string) => ({
      id,
      title: "",
      boardings: [
        { ...boarding, stop: stop(stopId) },
        {
          ...boarding,
          route: { ...boarding.route, id: "other" },
          stop: stop(stopId),
        },
      ],
    });
    const state = readFavoritesState({
      version: 1,
      favorites: [
        at("legacy:toKojori:a", "a"),
        at("legacy:toKojori:b", "b"),
        { ...at("named", "c"), title: "Work" },
      ],
      selectedId: "legacy:toKojori:b",
    })!;
    expect(state.version).toBe(2);
    expect(state.favorites.map((f) => f.id)).toEqual([
      "legacy:toKojori",
      "named",
    ]);
    expect(state.selectedId).toBe("legacy:toKojori");
    expect(tripStopId(state.favorites[0])).toBe("b");
    expect(tripStops(state.favorites[0]).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("finds the reverse trip on the same routes", () => {
    const forward = { id: "f", title: "", boardings: [boarding] };
    const back = {
      id: "b",
      title: "",
      boardings: [
        { ...boarding, pattern: { ...boarding.pattern, patternSuffix: "x" } },
      ],
    };
    expect(reverseTrip(forward, [forward, back])?.id).toBe("b");
    expect(reverseTrip(forward, [forward])).toBeUndefined();
  });
});

describe("TTC calendars and live data", () => {
  it("does not invent service on gaps inside the supplied calendar or before its start", () => {
    const period = { ...weekday, serviceDates: ["2026-11-02", "2026-11-04"] };
    for (const date of ["2026-11-01", "2026-11-03"]) {
      const from = Date.parse(`${date}T00:00:00+04:00`);
      expect(
        scheduledDepartures(boarding, [period], from, from + 86_400_000 - 1),
      ).toEqual([]);
    }
  });
  it("preserves Kojori live-vehicle safeguards and ignores vehicles past the boarding stop", () => {
    const legacy: Boarding = {
      ...boarding,
      route: { ...boarding.route, id: "1:R97505", shortName: "380" },
      stop: { id: "1:3932", label: "Baratashvili" },
    };
    const period = {
      ...weekday,
      stops: [
        { id: "1:3932", name: "First", position: 1, arrivalTimes: "10:10" },
        { id: "1:853", name: "Next", position: 2, arrivalTimes: "10:15" },
      ],
    };
    const now = Date.parse("2026-10-29T10:00:00+04:00");
    const scheduled = scheduledDepartures(
      legacy,
      [period],
      now,
      now + 3600_000,
    );
    const arrival = {
      shortName: "380",
      patternSuffix: "1:01",
      vehicleMode: "BUS",
      realtime: true,
      realtimeArrivalMinutes: 10,
      scheduledArrivalMinutes: 10,
      color: "",
      headsign: "",
    };
    expect(
      mergeTransitArrivals(legacy, scheduled, [arrival], now, now, 0).every(
        (dep) => !dep.live,
      ),
    ).toBe(true);
    expect(
      mergeTransitArrivals(legacy, scheduled, [arrival], now, now, 1)[0].live,
    ).toBe(true);
    expect(
      upstreamVehicleCount(
        legacy,
        [period],
        [
          { vehicleId: "before", nextStopId: "1:2994" },
          { vehicleId: "before", nextStopId: "1:3932" },
          { vehicleId: "passed", nextStopId: "1:853" },
        ],
        now,
      ),
    ).toBe(1);
  });
  it("uses Tbilisi service dates even if the device runs in another timezone", () => {
    expect(transitDate(Date.parse("2026-10-30T21:00:00Z"))).toBe("2026-10-31");
    expect(transitTime(Date.parse("2026-10-30T21:00:00Z"))).toBe("01:00");
  });
  it("selects Saturday service after Friday and includes previous-day 24:xx trips", () => {
    const from = Date.parse("2026-10-30T23:40:00+04:00");
    expect(
      scheduledDepartures(
        boarding,
        [weekday, weekend],
        from,
        from + 12 * 3600_000,
      ).map((d) => transitTime(d.epochMs)),
    ).toEqual(["23:50", "09:00"]);
    const monday = Date.parse("2026-11-02T00:05:00+04:00");
    expect(
      scheduledDepartures(
        boarding,
        [weekday, weekend],
        monday,
        monday + 20 * 60_000,
      ).map((d) => transitTime(d.epochMs)),
    ).toEqual(["00:15"]);
  });
  it("prefers explicit service dates and rejects invalid timetable times", () => {
    const date = Date.parse("2026-10-31T08:00:00+04:00");
    const exact = {
      ...weekday,
      serviceDates: ["2026-10-31"],
      stops: [
        { ...weekday.stops[0], arrivalTimes: "10:00,not-a-time,25:99,49:00" },
      ],
    };
    const result = scheduledDepartures(
      boarding,
      [exact, weekend],
      date,
      date + 12 * 3600_000,
    );
    expect(result.map((d) => transitTime(d.epochMs))).toEqual(["10:00"]);
    expect(result[0].confirmed).toBe(true);
  });
  it("matches live predictions only to the chosen route mode and pattern and expires stale predictions", () => {
    const now = Date.parse("2026-10-30T06:50:00+04:00");
    const schedule = scheduledDepartures(
      boarding,
      [weekday],
      now,
      now + 3600_000,
    );
    const arrival = {
      shortName: "101",
      patternSuffix: "1:01",
      vehicleMode: "BUS",
      realtime: true,
      realtimeArrivalMinutes: 12,
      scheduledArrivalMinutes: 10,
      color: "",
      headsign: "",
    };
    expect(
      mergeTransitArrivals(boarding, schedule, [arrival], now, now)[0].live,
    ).toBe(true);
    expect(
      mergeTransitArrivals(
        boarding,
        schedule,
        [{ ...arrival, vehicleMode: "SUBWAY" }],
        now,
        now,
      )[0].live,
    ).toBe(false);
    expect(
      mergeTransitArrivals(
        boarding,
        schedule,
        [{ ...arrival, patternSuffix: "0:01" }],
        now,
        now,
      )[0].live,
    ).toBe(false);
    expect(
      mergeTransitArrivals(boarding, schedule, [arrival], now + 91_000, now)[0]
        .live,
    ).toBe(false);
    const noisy = mergeTransitArrivals(
      boarding,
      [],
      [{ ...arrival, scheduledArrivalMinutes: -60 }],
      now,
      now,
    )[0];
    expect(noisy.scheduledEpochMs).toBe(noisy.epochMs);
    const withSchedule = mergeTransitArrivals(
      boarding,
      schedule,
      [{ ...arrival, scheduledArrivalMinutes: -60 }],
      now,
      now,
    );
    expect(withSchedule).toHaveLength(1);
    expect(withSchedule[0].live).toBe(true);
    expect(withSchedule[0].scheduledEpochMs).toBe(schedule[0].scheduledEpochMs);
  });
});

it("builds arbitrary-route widgets with offline periods, stable favorite IDs, and empty-state support", () => {
  const favorite = {
    id: "favorite-101",
    title: "School",
    boardings: [boarding],
  };
  const snapshot = buildFavoritesWidget(
    [favorite],
    new Map([[patternKey(boarding), [weekday, weekend]]]),
    "ru",
    palette,
    Date.parse("2026-10-30T06:50:00+04:00"),
  );
  expect(snapshot.schemaVersion).toBe(3);
  expect(snapshot.favoriteOrder).toEqual(["favorite-101"]);
  expect(
    snapshot.directions["favorite-101"].periodGroups[0].periods[0].minutes,
  ).toEqual([420, 1430]);
  expect(snapshot.directions["favorite-101"].items[0].bus).toBe("101");
  expect(snapshot.iosSchedule.stops[0].favoriteId).toBe("favorite-101");
  expect(snapshot.iosSchedule.stops[0].routeNames[boardingKey(boarding)]).toBe(
    "101",
  );
  expect(
    buildFavoritesWidget([], new Map(), "en", palette).iosSchedule.stops,
  ).toEqual([]);
});

it("keeps night trips after midnight in the evening's service day", () => {
  const evening = Date.parse("2026-10-29T23:30:00+04:00");
  const night = Date.parse("2026-10-30T01:00:00+04:00");
  const morning = Date.parse("2026-10-30T06:00:00+04:00");
  expect(serviceDayBounds(night)).toEqual(serviceDayBounds(evening));
  expect(serviceDayBounds(morning).start).toBe(
    Date.parse("2026-10-30T04:00:00+04:00"),
  );
});

it("gives each route in a trip its own accent while 380 and 316 keep theirs", () => {
  const route = (id: string) => ({ ...boarding, route: { ...boarding.route, id } });
  const solo = { id: "s", title: "", boardings: [route("1:R1")] };
  expect(tripRouteAccentIndex("1:R1", solo)).toBe(0);
  const mixed = {
    id: "m",
    title: "",
    boardings: [route("1:R97505"), route("1:R1"), route("1:R2")],
  };
  expect(tripRouteAccentIndex("1:R97505", mixed)).toBe(0);
  expect(tripRouteAccentIndex("1:R1", mixed)).toBe(1);
  expect(tripRouteAccentIndex("1:R2", mixed)).toBe(2);
  expect(tripRouteAccentIndex("1:R98445", mixed)).toBe(1);
});
