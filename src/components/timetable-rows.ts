import type { SchedulePeriod } from "@/services/ttc";
import {
  patternKey,
  periodForDate,
  scheduledDepartures,
  serviceMidnight,
  type Boarding,
  type TransitDeparture,
} from "@/transit/model";

const DAY_MS = 86_400_000;

export type PeriodsByPattern = Record<string, SchedulePeriod[] | undefined>;

export type TimetableRow = TransitDeparture & {
  /** Minutes since the selected date's midnight, Tbilisi time. */
  minsFromMidnight: number;
};

export type DayPart = "morning" | "afternoon" | "evening";

/** Departures on one calendar date at the active stop, all routes merged. */
export function timetableRows(
  boardings: Boarding[],
  periods: PeriodsByPattern,
  date: string,
  routeId: string | null = null,
): TimetableRow[] {
  const from = serviceMidnight(date);
  return boardings
    .filter((b) => !routeId || b.route.id === routeId)
    .flatMap((b) =>
      scheduledDepartures(b, periods[patternKey(b)] ?? [], from, from + DAY_MS - 1),
    )
    .map((dep) => ({
      ...dep,
      minsFromMidnight: Math.round((dep.epochMs - from) / 60_000),
    }))
    .sort(
      (a, b) =>
        a.epochMs - b.epochMs ||
        a.boarding.route.shortName.localeCompare(b.boarding.route.shortName),
    );
}

export function dayPart(minsFromMidnight: number): DayPart {
  if (minsFromMidnight < 720) return "morning";
  if (minsFromMidnight < 1020) return "afternoon";
  return "evening";
}

export function groupByDayPart(rows: TimetableRow[]) {
  const sections: { part: DayPart; data: TimetableRow[] }[] = [];
  for (const row of rows) {
    const part = dayPart(row.minsFromMidnight);
    const last = sections[sections.length - 1];
    if (last?.part === part) last.data.push(row);
    else sections.push({ part, data: [row] });
  }
  return sections;
}

/**
 * Whether TTC confirmed the date's timetable for every boarding that runs
 * that day. `null` when no boarding has a timetable for the date at all.
 */
export function dayConfirmation(
  boardings: Boarding[],
  periods: PeriodsByPattern,
  date: string,
): "confirmed" | "weekly" | null {
  const found = boardings
    .map((b) => periods[patternKey(b)])
    .filter((p): p is SchedulePeriod[] => Boolean(p?.length))
    .map((p) => periodForDate(p, date))
    .filter((result) => result.period);
  if (!found.length) return null;
  return found.every((result) => result.confirmed) ? "confirmed" : "weekly";
}

/** Distinct routes boardable at the active stop, in trip order. */
export function boardingRoutes(boardings: Boarding[]) {
  return boardings
    .map((b) => b.route)
    .filter((route, i, all) => all.findIndex((r) => r.id === route.id) === i);
}

export function dateLocale(language: string) {
  return language === "ka" ? "ka-GE" : language === "ru" ? "ru-RU" : "en-GB";
}
