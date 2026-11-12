// @ts-expect-error Bun provides the test module at runtime.
import { beforeEach, expect, it, mock } from 'bun:test';

const store = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
    multiGet: async (keys: string[]) => keys.map(key => [key, store.get(key) ?? null]),
  },
}));
const { duePeriods, reportUsage, usagePeriodKeys } = await import('@/services/usage-report');

beforeEach(() => store.clear());

function recorder(status = 204) {
  const bodies: unknown[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { bodies, fetcher };
}
const at = (iso: string) => () => new Date(iso);
const options = { apiUrl: 'https://api.example', platform: 'web' as const, appVersion: '2026.11.13' };

it('uses local calendar days, Monday weeks and months', () => {
  expect(usagePeriodKeys(new Date(2026, 10, 15, 23, 0))).toEqual({ day: '2026-11-15', week: '2026-11-09', month: '2026-11' });
  expect(usagePeriodKeys(new Date(2026, 10, 16, 0, 30))).toEqual({ day: '2026-11-16', week: '2026-11-16', month: '2026-11' });
});

it('reports only the periods that have not been reported', () => {
  const marks = { ...usagePeriodKeys(new Date(2026, 10, 13)), installed: true };
  expect(duePeriods(marks, new Date(2026, 10, 13, 20))).toEqual([]);
  expect(duePeriods(marks, new Date(2026, 10, 14, 8))).toEqual(['day']);
  expect(duePeriods(marks, new Date(2026, 10, 16, 8))).toEqual(['day', 'week']);
  expect(duePeriods({}, new Date(2026, 10, 16))).toEqual(['day', 'week', 'month', 'install']);
});

it('sends one report a day with no identifier, and counts a new install once', async () => {
  const { bodies, fetcher } = recorder();
  await reportUsage({ ...options, fetcher, now: at('2026-11-13T09:00:00') });
  await reportUsage({ ...options, fetcher, now: at('2026-11-13T18:00:00') });
  await reportUsage({ ...options, fetcher, now: at('2026-11-14T09:00:00') });
  expect(bodies).toEqual([
    { version: 1, periods: ['day', 'week', 'month', 'install'], platform: 'web', appVersion: '2026.11.13' },
    { version: 1, periods: ['day'], platform: 'web', appVersion: '2026.11.13' },
  ]);
});

it('does not count someone updating from an older version as a new install', async () => {
  store.set('@kojori_settings_v2', '{}');
  const { bodies, fetcher } = recorder();
  await reportUsage({ ...options, fetcher, now: at('2026-11-13T09:00:00') });
  expect(bodies).toEqual([{ version: 1, periods: ['day', 'week', 'month'], platform: 'web', appVersion: '2026.11.13' }]);
});

it('tries again later when the report fails', async () => {
  const failing = recorder(503);
  await reportUsage({ ...options, fetcher: failing.fetcher, now: at('2026-11-13T09:00:00') });
  const ok = recorder();
  await reportUsage({ ...options, fetcher: ok.fetcher, now: at('2026-11-13T10:00:00') });
  expect(ok.bodies).toHaveLength(1);
});
