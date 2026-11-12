import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Anonymous usage counting. Once per local day, week and month (and once after
 * install) the app tells the Gzaap API "a device used Gzaap", with only the
 * platform and app version. There is no device or user id, so the server can
 * only keep totals. The dates of the last report stay on the device.
 */
export type UsagePeriod = 'day' | 'week' | 'month' | 'install';
export type UsageMarks = { day?: string; week?: string; month?: string; installed?: boolean };

const MARKS_KEY = '@gzaap_usage_marks_v1';
/** Present for anyone who used the app before counting existed. */
const EXISTING_USER_KEYS = ['@kojori_settings_v2', '@ttc_query_log_v1', '@ttc_stop_names_v2'];

const pad = (value: number) => String(value).padStart(2, '0');
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Keys for the current local day, week (from Monday) and month. */
export function usagePeriodKeys(now: Date) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return { day: localDate(now), week: localDate(monday), month: localDate(now).slice(0, 7) };
}

/** The periods this device has not reported yet. */
export function duePeriods(marks: UsageMarks, now: Date): UsagePeriod[] {
  const keys = usagePeriodKeys(now);
  const due: UsagePeriod[] = [];
  if (marks.day !== keys.day) due.push('day');
  if (marks.week !== keys.week) due.push('week');
  if (marks.month !== keys.month) due.push('month');
  if (!marks.installed) due.push('install');
  return due;
}

async function readMarks(): Promise<UsageMarks> {
  const raw = await AsyncStorage.getItem(MARKS_KEY);
  if (raw) {
    try { return JSON.parse(raw) as UsageMarks; } catch { /* rewrite below */ }
  }
  // Someone updating from a version without counting is not a new install.
  const existing = await AsyncStorage.multiGet(EXISTING_USER_KEYS);
  return { installed: existing.some(([, value]) => value != null) };
}

let running: Promise<void> | null = null;

/** Sends at most one report for whatever periods are due. Failures retry on the next call. */
export function reportUsage(options: {
  apiUrl: string;
  platform: 'android' | 'ios' | 'web';
  appVersion: string;
  now?: () => Date;
  fetcher?: typeof fetch;
}): Promise<void> {
  running ??= (async () => {
    const now = options.now?.() ?? new Date();
    const marks = await readMarks();
    const periods = duePeriods(marks, now);
    if (!periods.length) return;
    const response = await (options.fetcher ?? fetch)(`${options.apiUrl}/v1/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, periods, platform: options.platform, appVersion: options.appVersion }),
    });
    if (!response.ok) return;
    await AsyncStorage.setItem(MARKS_KEY, JSON.stringify({ ...usagePeriodKeys(now), installed: true }));
  })()
    .catch(() => { /* offline or blocked: try again next time */ })
    .finally(() => { running = null; });
  return running;
}
