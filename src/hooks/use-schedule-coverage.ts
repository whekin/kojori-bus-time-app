import { useSchedule } from '@/hooks/use-schedule';
import { combinedScheduleCoverage, ROUTES, type ScheduleCoverage } from '@/services/ttc';

/**
 * Coverage of the schedules actually in play (live, cached, or bundled). Once these
 * age out, every stop resolves zero departures, so the status surface can say so.
 */
export function useScheduleCoverage(): ScheduleCoverage {
  const toKojori380 = useSchedule(ROUTES['380'].id, ROUTES['380'].toKojori);
  const toKojori316 = useSchedule(ROUTES['316'].id, ROUTES['316'].toKojori);
  const toTbilisi380 = useSchedule(ROUTES['380'].id, ROUTES['380'].toTbilisi);
  const toTbilisi316 = useSchedule(ROUTES['316'].id, ROUTES['316'].toTbilisi);

  return combinedScheduleCoverage([
    toKojori380.data,
    toKojori316.data,
    toTbilisi380.data,
    toTbilisi316.data,
  ]);
}
