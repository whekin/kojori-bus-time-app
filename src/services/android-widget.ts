import { Platform } from 'react-native';

import {
  ArrivalTime,
  BusLine,
  computeUpcomingDepartures,
  Departure,
  fetchArrivalTimes,
  fetchSchedule,
  fetchStopDetails,
  findStop,
  mergeArrivalsIntoSchedule,
  ROUTES,
  SchedulePeriod
} from '@/services/ttc';
import {
  readCachedStopName,
  readScheduleCache,
  writeScheduleCache,
  writeStopName,
} from '@/services/ttc-offline';
import KojoriWidget from '../../modules/kojori-widget';

type WidgetMode = 'kojori' | 'tbilisi';

interface WidgetSyncSettings {
  activeKojoriStopId: string;
  activeTbilisiStopId: string;
}

interface WidgetItemPayload {
  bus: BusLine;
  time: string;
  countdown: string;
  live?: boolean;
}

interface WidgetDirectionPayload {
  mode: WidgetMode;
  title: string;
  stopId: string;
  stopLabel: string;
  status: 'ready' | 'empty' | 'error';
  message: string;
  items: WidgetItemPayload[];
}

interface WidgetStatePayload {
  generatedAt: number;
  directions: Record<WidgetMode, WidgetDirectionPayload>;
}

function formatCountdown(minsUntil: number) {
  if (minsUntil < 1) return 'now';
  if (minsUntil < 60) return `${minsUntil} min`;
  const h = Math.floor(minsUntil / 60);
  const m = minsUntil % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function mapWidgetItems(departures: Departure[]): WidgetItemPayload[] {
  // Show more departures (up to 20 minutes ahead)
  return departures
    .filter(dep => dep.minsUntil <= 20)
    .slice(0, 6)
    .map(dep => ({
      bus: dep.bus,
      time: dep.time,
      countdown: formatCountdown(dep.minsUntil),
      live: dep.live,
    }));
}

async function loadSchedule(routeId: string, patternSuffix: string): Promise<SchedulePeriod[] | undefined> {
  const cached = await readScheduleCache(routeId, patternSuffix, true);
  if (cached) return cached;

  const fresh = await fetchSchedule(routeId, patternSuffix);
  await writeScheduleCache(routeId, patternSuffix, fresh);
  return fresh;
}

async function loadStopLabel(stopId: string) {
  const cached = await readCachedStopName(stopId, true);
  if (cached) return cached;

  try {
    const details = await fetchStopDetails(stopId);
    await writeStopName(details.id, details.name);
    return details.name;
  } catch {
    const fallback = findStop(stopId)?.label;
    return fallback ?? `Stop #${stopId.split(':')[1] ?? stopId}`;
  }
}



async function loadArrivals(stopId: string, direction: 'toKojori' | 'toTbilisi'): Promise<ArrivalTime[]> {
  try {
    const arrivals = await fetchArrivalTimes(stopId);
    const buses: BusLine[] = ['380', '316'];
    return arrivals
      .filter(a => {
        if (!(buses as string[]).includes(a.shortName)) return false;
        const expected = ROUTES[a.shortName as BusLine][direction];
        return a.patternSuffix === expected;
      })
      .sort((a, b) => a.realtimeArrivalMinutes - b.realtimeArrivalMinutes);
  } catch {
    return [];
  }
}

async function buildDirectionPayload(
  mode: WidgetMode,
  stopId: string,
  now: Date,
): Promise<WidgetDirectionPayload> {
  const title = mode === 'kojori' ? '→ Kojori' : '→ Tbilisi';
  const direction = mode === 'kojori' ? 'toKojori' : 'toTbilisi';
  const stopLabel = await loadStopLabel(stopId);

  try {
    const [schedule380, schedule316, arrivals] = await Promise.all([
      loadSchedule(ROUTES['380'].id, ROUTES['380'][direction]),
      loadSchedule(ROUTES['316'].id, ROUTES['316'][direction]),
      loadArrivals(stopId, direction),
    ]);

    const rawDepartures = computeUpcomingDepartures(schedule380, schedule316, stopId, 180, now);
    const departures = mergeArrivalsIntoSchedule(rawDepartures, arrivals, now, now.getTime());
    const items = mapWidgetItems(departures);

    if (items.length === 0) {
      return {
        mode,
        title,
        stopId,
        stopLabel,
        status: 'empty',
        message: 'No departures soon',
        items: [],
      };
    }

    return {
      mode,
      title,
      stopId,
      stopLabel,
      status: 'ready',
      message: 'Schedule data',
      items,
    };
  } catch {
    return {
      mode,
      title,
      stopId,
      stopLabel,
      status: 'error',
      message: 'Open app to refresh',
      items: [],
    };
  }
}

export async function syncAndroidWidgetState(settings: WidgetSyncSettings) {
  if (Platform.OS !== 'android' || !KojoriWidget) return;

  const now = new Date();
  const [kojori, tbilisi] = await Promise.all([
    buildDirectionPayload('kojori', settings.activeKojoriStopId, now),
    buildDirectionPayload('tbilisi', settings.activeTbilisiStopId, now),
  ]);

  const payload: WidgetStatePayload = {
    generatedAt: now.getTime(),
    directions: { kojori, tbilisi },
  };

  await KojoriWidget.syncWidgetState(JSON.stringify(payload));
}
