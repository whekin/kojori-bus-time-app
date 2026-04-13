import { Platform } from 'react-native';

import KojoriWidget from '../../modules/kojori-widget';
import {
  BusLine,
  computeUpcomingDepartures,
  Departure,
  fetchArrivalTimes,
  fetchSchedule,
  fetchStopDetails,
  findStop,
  mergeArrivalsIntoSchedule,
  ROUTES,
  SchedulePeriod,
} from '@/services/ttc';
import {
  readCachedStopName,
  readScheduleCache,
  writeScheduleCache,
  writeStopName,
} from '@/services/ttc-offline';

type WidgetMode = 'kojori' | 'tbilisi';

interface WidgetSyncSettings {
  widgetKojoriStopId: string;
  widgetTbilisiStopId: string;
}

interface WidgetItemPayload {
  bus: BusLine;
  time: string;
  countdown: string;
  live: boolean;
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
  return `${minsUntil} min`;
}

function mapWidgetItems(departures: Departure[]): WidgetItemPayload[] {
  return departures.slice(0, 3).map(dep => ({
    bus: dep.bus,
    time: dep.time,
    countdown: formatCountdown(dep.minsUntil),
    live: Boolean(dep.live),
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

function filterArrivalsForMode(
  mode: WidgetMode,
  arrivals: Awaited<ReturnType<typeof fetchArrivalTimes>>,
) {
  const direction = mode === 'kojori' ? 'toKojori' : 'toTbilisi';
  return arrivals
    .filter(arrival => {
      const route = ROUTES[arrival.shortName as BusLine];
      return Boolean(route) && arrival.patternSuffix === route[direction];
    })
    .sort((a, b) => a.realtimeArrivalMinutes - b.realtimeArrivalMinutes);
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
    const [[schedule380, schedule316], arrivals] = await Promise.all([
      Promise.all([
        loadSchedule(ROUTES['380'].id, ROUTES['380'][direction]),
        loadSchedule(ROUTES['316'].id, ROUTES['316'][direction]),
      ]),
      fetchArrivalTimes(stopId).catch(() => []),
    ]);

    const baseDepartures = computeUpcomingDepartures(schedule380, schedule316, stopId, 180, now);
    const mergedDepartures = mergeArrivalsIntoSchedule(
      baseDepartures,
      filterArrivalsForMode(mode, arrivals),
      now,
      arrivals.length ? now.getTime() : undefined,
    );
    const items = mapWidgetItems(mergedDepartures);

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
      message: items[0].live ? 'Live when available' : 'Schedule data',
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
    buildDirectionPayload('kojori', settings.widgetKojoriStopId, now),
    buildDirectionPayload('tbilisi', settings.widgetTbilisiStopId, now),
  ]);

  const payload: WidgetStatePayload = {
    generatedAt: now.getTime(),
    directions: { kojori, tbilisi },
  };

  await KojoriWidget.syncWidgetState(JSON.stringify(payload));
}
