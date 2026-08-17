import { describe, expect, it } from 'bun:test';

import { evaluateBakedCoverage } from './check-baked-freshness';

function week(start: string, days = 7) {
  const [year, month, day] = start.split('-').map(Number);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index));
    return date.toISOString().slice(0, 10);
  });
}

function schedules(serviceDates: string[]) {
  return {
    '380_toKojori': [{ serviceDates }],
    '316_toKojori': [{ serviceDates }],
  };
}

describe('evaluateBakedCoverage', () => {
  it('passes when baked data covers today plus the required margin', () => {
    const report = evaluateBakedCoverage(schedules(week('2026-08-15')), '2026-08-15', 3);

    expect(report.ok).toBe(true);
    expect(report.routes.every(route => route.problem === null)).toBe(true);
    expect(report.routes[0].coverageEnd).toBe('2026-08-21');
    expect(report.routes[0].daysAhead).toBe(6);
  });

  it('fails once today falls outside the baked service dates', () => {
    const report = evaluateBakedCoverage(schedules(week('2026-08-02')), '2026-08-15', 3);

    expect(report.ok).toBe(false);
    expect(report.routes[0].coversToday).toBe(false);
    expect(report.routes[0].problem).toContain('not covered');
  });

  it('fails while today is still covered but the tail is too short', () => {
    const report = evaluateBakedCoverage(schedules(week('2026-08-15')), '2026-08-20', 3);

    expect(report.ok).toBe(false);
    expect(report.routes[0].coversToday).toBe(true);
    expect(report.routes[0].daysAhead).toBe(1);
    expect(report.routes[0].problem).toContain('only 1 day(s)');
  });

  it('fails when a single route ran out even though the others are fine', () => {
    const report = evaluateBakedCoverage(
      {
        '380_toKojori': [{ serviceDates: week('2026-08-15') }],
        '316_toKojori': [{ serviceDates: week('2026-08-02') }],
      },
      '2026-08-15',
      3,
    );

    expect(report.ok).toBe(false);
    expect(report.routes.find(route => route.key === '380_toKojori')?.problem).toBeNull();
    expect(report.routes.find(route => route.key === '316_toKojori')?.problem).toContain('not covered');
  });

  it('fails on empty or missing schedule data', () => {
    expect(evaluateBakedCoverage({}, '2026-08-15', 3).ok).toBe(false);
    expect(evaluateBakedCoverage({ '380_toKojori': [{ serviceDates: [] }] }, '2026-08-15', 3).ok).toBe(false);
  });

  it('accepts data spread across several schedule periods', () => {
    const report = evaluateBakedCoverage(
      {
        '380_toKojori': [
          { serviceDates: week('2026-08-15', 3) },
          { serviceDates: week('2026-08-18', 4) },
        ],
      },
      '2026-08-16',
      3,
    );

    expect(report.ok).toBe(true);
    expect(report.routes[0].coverageEnd).toBe('2026-08-21');
  });
});
