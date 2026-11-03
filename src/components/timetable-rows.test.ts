// @ts-expect-error Bun provides the test module at runtime.
import { describe, expect, it } from "bun:test";
import type { SchedulePeriod } from "@/services/ttc";
import { patternKey, transitTime, type Boarding } from "@/transit/model";
import {
  boardingRoutes,
  dayConfirmation,
  groupByDayPart,
  timetableRows,
} from "./timetable-rows";

const stop = { id: "1:100", label: "Square" };
const a: Boarding = {
  route: { id: "1:RA", shortName: "10", longName: "A", mode: "BUS" },
  pattern: { patternSuffix: "0:01", headsign: "North" },
  stop,
};
const b: Boarding = {
  route: { id: "1:RB", shortName: "20", longName: "B", mode: "BUS" },
  pattern: { patternSuffix: "1:01", headsign: "North" },
  stop,
};
const week = (times: string, dates: string[] = []): SchedulePeriod[] => [
  {
    fromDay: "MONDAY",
    toDay: "SUNDAY",
    serviceDates: dates,
    stops: [{ id: "1:100", name: "Square", position: 1, arrivalTimes: times }],
  } as SchedulePeriod,
];

describe("timetable rows", () => {
  it("merges routes in time order within one calendar date", () => {
    const periods = {
      [patternKey(a)]: week("07:10,13:00,24:20"),
      [patternKey(b)]: week("06:50,18:30"),
    };
    const rows = timetableRows([a, b], periods, "2026-10-29");
    expect(rows.map((r) => `${r.boarding.route.shortName} ${transitTime(r.epochMs)}`)).toEqual([
      // Previous day's 24:20 trip leaves at 00:20 on this date.
      "10 00:20",
      "20 06:50",
      "10 07:10",
      "10 13:00",
      "20 18:30",
    ]);
    expect(rows[0].minsFromMidnight).toBe(20);
    expect(timetableRows([a, b], periods, "2026-10-29", "1:RB")).toHaveLength(2);
  });

  it("groups rows into morning, afternoon and evening", () => {
    const rows = timetableRows([a], { [patternKey(a)]: week("06:00,11:59,12:00,17:00") }, "2026-10-29");
    expect(groupByDayPart(rows).map((s) => [s.part, s.data.length])).toEqual([
      ["morning", 2],
      ["afternoon", 1],
      ["evening", 1],
    ]);
  });

  it("reports confirmation only when every running route is confirmed", () => {
    const confirmed = week("08:00", ["2026-10-29"]);
    const weekly = week("08:00");
    expect(dayConfirmation([a], { [patternKey(a)]: confirmed }, "2026-10-29")).toBe("confirmed");
    expect(
      dayConfirmation([a, b], { [patternKey(a)]: confirmed, [patternKey(b)]: weekly }, "2026-10-29"),
    ).toBe("weekly");
    // After the confirmed calendar ends, the weekly pattern takes over.
    expect(dayConfirmation([a], { [patternKey(a)]: confirmed }, "2026-11-05")).toBe("weekly");
    expect(dayConfirmation([a], {}, "2026-10-29")).toBeNull();
  });

  it("lists each route once", () => {
    expect(boardingRoutes([a, b, { ...a, stop: { id: "x", label: "X" } }]).map((r) => r.id)).toEqual([
      "1:RA",
      "1:RB",
    ]);
  });
});
