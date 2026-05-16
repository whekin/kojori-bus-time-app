import { useSettings, type TtcHealthDemo } from '@/hooks/use-settings';
import { useTtcHealth, type TtcHealthSnapshot } from '@/hooks/use-ttc-health';

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

  return {
    status: 'offline',
    lastSuccessAt: now - 9 * 60_000,
    lastFailureAt: now - 18_000,
    consecutiveFailures: 4,
    isRateLimited: false,
  };
}

export function useEffectiveTtcHealth() {
  const liveHealth = useTtcHealth();
  const { settings } = useSettings();

  return demoSnapshot(settings.ttcHealthDemo, Date.now()) ?? liveHealth;
}
