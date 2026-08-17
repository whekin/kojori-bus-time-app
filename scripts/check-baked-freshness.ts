#!/usr/bin/env bun
/**
 * Fails when the bundled TTC data in assets/ttc-baked.ts is about to run out of
 * service days. Each baked schedule only carries ~a week of serviceDates; past
 * that, getUpcomingServiceDepartures returns nothing and the app looks broken on
 * a device with no network cache.
 *
 * Run: bun scripts/check-baked-freshness.ts [--min-days=3] [--today=YYYY-MM-DD]
 */

export interface BakedPeriodLike {
  serviceDates: string[];
}

export interface RouteCoverage {
  key: string;
  coversToday: boolean;
  coverageEnd: string | null;
  /** Whole days of service left after today, 0 when coverage ends today. */
  daysAhead: number;
  problem: string | null;
}

export interface CoverageReport {
  ok: boolean;
  today: string;
  minDaysAhead: number;
  routes: RouteCoverage[];
}

export const DEFAULT_MIN_DAYS_AHEAD = 3;

function toUtcMs(serviceDate: string) {
  const [year, month, day] = serviceDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(from: string, to: string) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function formatToday(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function evaluateBakedCoverage(
  schedules: Record<string, BakedPeriodLike[]>,
  today = formatToday(),
  minDaysAhead = DEFAULT_MIN_DAYS_AHEAD,
): CoverageReport {
  const routes = Object.entries(schedules).map<RouteCoverage>(([key, periods]) => {
    const serviceDates = periods.flatMap(period => period.serviceDates ?? []);
    const coverageEnd = serviceDates.length
      ? serviceDates.reduce((latest, date) => (date > latest ? date : latest))
      : null;
    const coversToday = serviceDates.includes(today);
    const daysAhead = coverageEnd ? Math.max(0, daysBetween(today, coverageEnd)) : 0;

    let problem: string | null = null;
    if (!coverageEnd) {
      problem = 'no serviceDates baked';
    } else if (!coversToday) {
      problem = `today (${today}) is not covered; baked data ends ${coverageEnd}`;
    } else if (daysAhead < minDaysAhead) {
      problem = `only ${daysAhead} day(s) of service left (ends ${coverageEnd}), need ${minDaysAhead}`;
    }

    return { key, coversToday, coverageEnd, daysAhead, problem };
  });

  const hasRoutes = routes.length > 0;
  return {
    ok: hasRoutes && routes.every(route => route.problem === null),
    today,
    minDaysAhead,
    routes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const minDaysArg = args.find(arg => arg.startsWith('--min-days='))?.split('=')[1];
  const todayArg = args.find(arg => arg.startsWith('--today='))?.split('=')[1];
  const minDaysAhead = minDaysArg ? Number(minDaysArg) : DEFAULT_MIN_DAYS_AHEAD;

  if (!Number.isInteger(minDaysAhead) || minDaysAhead < 0) {
    console.error(`Invalid --min-days value: ${minDaysArg}`);
    process.exit(1);
  }

  const { BAKED_AT, BAKED_SCHEDULES } = await import('../assets/ttc-baked');
  const schedules = BAKED_SCHEDULES as unknown as Record<string, BakedPeriodLike[]>;
  const report = evaluateBakedCoverage(schedules, todayArg || formatToday(), minDaysAhead);

  console.log(`Baked TTC data (baked ${BAKED_AT}), checked against ${report.today}:`);
  for (const route of report.routes) {
    const state = route.problem ? `✗ ${route.problem}` : `✓ ${route.daysAhead} day(s) left (ends ${route.coverageEnd})`;
    console.log(`  ${route.key.padEnd(16)} ${state}`);
  }

  if (report.routes.length === 0) {
    console.error('\nNo baked schedules found in assets/ttc-baked.ts.');
    console.error('Re-bake with: bun scripts/bake-ttc.ts');
    process.exit(1);
  }

  if (!report.ok) {
    console.error(
      `\nBundled timetable is too old to ship: it must cover today and at least ${report.minDaysAhead} more day(s).`,
    );
    console.error('Re-bake with: bun scripts/bake-ttc.ts');
    process.exit(1);
  }

  console.log(`\nBaked TTC data is fresh ✓ (covers today plus ≥ ${report.minDaysAhead} day(s))`);
}

if (import.meta.main) {
  await main();
}
