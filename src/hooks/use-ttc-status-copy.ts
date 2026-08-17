import { useEffectiveTtcHealth } from '@/hooks/use-effective-ttc-health';
import { useI18n } from '@/hooks/use-i18n';
import type { TtcHealthStatus } from '@/hooks/use-ttc-health';
import type { ResolvedLanguage } from '@/i18n/languages';

export interface TtcStatusCopy {
  status: TtcHealthStatus;
  /** Short status name, e.g. "TTC not reachable". */
  label: string;
  /** Same label plus how long ago TTC last answered, when that adds anything. */
  labelWithAge: string;
  detail: string;
  meta: string;
  /** True for states that block data outright, so callers can pick the error accent. */
  isSevere: boolean;
}

function dateLocale(language: ResolvedLanguage) {
  return language === 'ru' ? 'ru-RU' : language === 'ka' ? 'ka-GE' : 'en-GB';
}

function formatServiceDay(serviceDate: string, language: ResolvedLanguage) {
  const [year, month, day] = serviceDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(dateLocale(language), {
    day: '2-digit',
    month: 'short',
  });
}

/** Shared wording for the status banner and the status top bar. Null while healthy. */
export function useTtcStatusCopy(): TtcStatusCopy | null {
  const { t, formatRelativeDuration, resolvedLanguage } = useI18n();
  const { status, lastSuccessAt, scheduleCoverageEnd } = useEffectiveTtcHealth();

  if (status === 'healthy') return null;

  const isScheduleStale = status === 'schedule-stale';
  const isOffline = status === 'offline';
  const isDeviceOffline = status === 'device-offline';
  const isRateLimited = status === 'rate-limited';

  const label = isScheduleStale
    ? t('ttcScheduleStale')
    : isRateLimited
      ? t('ttcRateLimited')
      : isDeviceOffline
        ? t('ttcDeviceOffline')
        : isOffline
          ? t('ttcOffline')
          : t('ttcUnstable');

  const detail = isScheduleStale
    ? t('ttcScheduleStaleDetail')
    : isRateLimited
      ? t('ttcRateDetail')
      : isDeviceOffline
        ? t('ttcDeviceOfflineDetail')
        : isOffline
          ? t('ttcOfflineDetail')
          : t('ttcUnstableDetail');

  // A "last update" age describes the connection, not the timetable window.
  const timeAgo = !isScheduleStale && lastSuccessAt
    ? (() => {
        const mins = Math.floor((Date.now() - lastSuccessAt) / 60000);
        if (mins < 1) return t('ttcJustNow');
        if (mins < 60) return formatRelativeDuration('past', 'minute', mins);
        const hours = Math.floor(mins / 60);
        return formatRelativeDuration('past', 'hour', hours);
      })()
    : null;

  const meta = isScheduleStale
    ? scheduleCoverageEnd
      ? t('ttcScheduleStaleUntil', { date: formatServiceDay(scheduleCoverageEnd, resolvedLanguage) })
      : t('ttcScheduleStaleUnknown')
    : lastSuccessAt
      ? t('ttcLastUpdate', {
          time: new Date(lastSuccessAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        })
      : t('ttcNoResponse');

  return {
    status,
    label,
    labelWithAge: timeAgo ? `${label} · ${timeAgo}` : label,
    detail,
    meta,
    // Stale is a warning, not an outage: the timetable still renders, it is just old.
    isSevere: isOffline || isRateLimited || isDeviceOffline,
  };
}
