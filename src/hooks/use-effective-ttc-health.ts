import { useScheduleCoverage } from '@/hooks/use-schedule-coverage';
import { useSettings, type TtcHealthDemo } from '@/hooks/use-settings';
import { useTtcHealth, type TtcHealthSnapshot } from '@/hooks/use-ttc-health';
import { serviceDateString } from '@/services/ttc';

export interface EffectiveTtcHealth extends TtcHealthSnapshot {
  /** Last service date the timetable covers, as "YYYY-MM-DD". Null when unknown. */
  scheduleCoverageEnd: string | null;
}

function demoSnapshot(mode: TtcHealthDemo, now: number): TtcHealthSnapshot | null {
  if (mode === 'off') return null;

  if (mode === 'degraded') {
    return {
      status: 'degraded',
      lastSuccessAt: now - 45_000,
      lastFailureAt: now - 8_000,
      consecutiveFailures: 1,
      isRateLimited: false,
    };
  }

  if (mode === 'rate-limited') {
    return {
      status: 'rate-limited',
      lastSuccessAt: now - 3 * 60_000,
      lastFailureAt: now - 12_000,
      consecutiveFailures: 3,
      isRateLimited: true,
    };
  }

  if (mode === 'device-offline') {
    return {
      status: 'device-offline',
      lastSuccessAt: now - 14 * 60_000,
      lastFailureAt: now - 20_000,
      consecutiveFailures: 4,
      isRateLimited: false,
    };
  }

  if (mode === 'schedule-stale') {
    return {
      status: 'schedule-stale',
      lastSuccessAt: null,
      lastFailureAt: now - 25_000,
      consecutiveFailures: 2,
      isRateLimited: false,
    };
  }

  return {
    status: 'offline',
    lastSuccessAt: now - 9 * 60_000,
    lastFailureAt: now - 18_000,
    consecutiveFailures: 4,
    isRateLimited: false,
  };
}

function demoCoverageEnd(now: number) {
  const end = new Date(now);
  end.setDate(end.getDate() - 3);
  return serviceDateString(end);
}

export function useEffectiveTtcHealth(): EffectiveTtcHealth {
  const liveHealth = useTtcHealth();
  const { settings } = useSettings();
  const coverage = useScheduleCoverage();

  const now = Date.now();
  const demo = demoSnapshot(settings.ttcHealthDemo, now);

  if (demo) {
    return {
      ...demo,
      scheduleCoverageEnd: demo.status === 'schedule-stale' ? demoCoverageEnd(now) : coverage.coverageEnd,
    };
  }

  // An expired timetable outranks connection trouble: it is why the screens are
  // empty, and the fix (get back online so fresh schedules download) is the same.
  const status = coverage.coversToday ? liveHealth.status : 'schedule-stale';

  return { ...liveHealth, status, scheduleCoverageEnd: coverage.coverageEnd };
}
