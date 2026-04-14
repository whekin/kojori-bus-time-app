import { Platform } from 'react-native';

import { BAKED_SCHEDULES, BAKED_STOP_NAMES } from '@/assets/ttc-baked';
import { getAppColors, type AppPaletteId } from '@/constants/theme';
import {
  BusLine,
  computeUpcomingDepartures,
  Departure,
  findStop,
  ROUTES,
  SchedulePeriod
} from '@/services/ttc';
import {
  readCachedStopName,
  readScheduleCache,
} from '@/services/ttc-offline';
import KojoriWidget from '../../modules/kojori-widget';

type WidgetMode = 'kojori' | 'tbilisi';

interface WidgetSyncSettings {
  activeKojoriStopId: string;
  activeTbilisiStopId: string;
  paletteId: AppPaletteId;
}

interface WidgetItemPayload {
  bus: BusLine;
  time: string;
  minsUntilAtSync: number;
}

interface WidgetDirectionPayload {
  mode: WidgetMode;
  stopId: string;
  stopLabel: string;
  syncedAtEpochMs: number;
  status: 'ready' | 'empty' | 'error';
  message: string;
  items: WidgetItemPayload[];
}

interface WidgetStatePayload {
  palette: {
    text: string;
    textDim: string;
    textFaint: string;
    primary: string;
    route380: string;
    route316: string;
  };
  directions: Record<WidgetMode, WidgetDirectionPayload>;
}

function mapWidgetItems(departures: Departure[]): WidgetItemPayload[] {
  return departures
    .filter(dep => dep.minsUntil >= 0)
    .map(dep => ({
      bus: dep.bus,
      time: dep.time,
      minsUntilAtSync: dep.minsUntil,
    }));
}

async function loadSchedule(routeId: string, patternSuffix: string): Promise<SchedulePeriod[] | undefined> {
  const cached = await readScheduleCache(routeId, patternSuffix, true);
  if (cached) return cached;

  const bakedKey = (() => {
    if (routeId === ROUTES['380'].id && patternSuffix === ROUTES['380'].toKojori) return '380_toKojori';
    if (routeId === ROUTES['380'].id && patternSuffix === ROUTES['380'].toTbilisi) return '380_toTbilisi';
    if (routeId === ROUTES['316'].id && patternSuffix === ROUTES['316'].toKojori) return '316_toKojori';
    if (routeId === ROUTES['316'].id && patternSuffix === ROUTES['316'].toTbilisi) return '316_toTbilisi';
    return null;
  })();

  return bakedKey ? JSON.parse(JSON.stringify(BAKED_SCHEDULES[bakedKey])) as SchedulePeriod[] : undefined;
}

async function loadStopLabel(stopId: string) {
  const cached = await readCachedStopName(stopId, true);
  if (cached) return cached;

  const baked = BAKED_STOP_NAMES[stopId];
  if (baked) return baked;

  const fallback = findStop(stopId)?.label;
  return fallback ?? `Stop #${stopId.split(':')[1] ?? stopId}`;
}

async function buildDirectionPayload(
  mode: WidgetMode,
  stopId: string,
  now: Date,
): Promise<WidgetDirectionPayload> {
  const direction = mode === 'kojori' ? 'toKojori' : 'toTbilisi';
  const stopLabel = await loadStopLabel(stopId);
  const syncedAtEpochMs = now.getTime();

  try {
    const [schedule380, schedule316] = await Promise.all([
      loadSchedule(ROUTES['380'].id, ROUTES['380'][direction]),
      loadSchedule(ROUTES['316'].id, ROUTES['316'][direction]),
    ]);

    const rawDepartures = computeUpcomingDepartures(schedule380, schedule316, stopId, 24 * 60, now);
    const items = mapWidgetItems(rawDepartures);

    if (items.length === 0) {
      return {
        mode,
        stopId,
        stopLabel,
        syncedAtEpochMs,
        status: 'empty',
        message: 'No departures soon',
        items: [],
      };
    }

    return {
      mode,
      stopId,
      stopLabel,
      syncedAtEpochMs,
      status: 'ready',
      message: '',
      items,
    };
  } catch {
    return {
      mode,
      stopId,
      stopLabel,
      syncedAtEpochMs,
      status: 'error',
      message: 'Open app to refresh',
      items: [],
    };
  }
}

export async function syncAndroidWidgetState(settings: WidgetSyncSettings) {
  if (Platform.OS !== 'android' || !KojoriWidget) return;

  const now = new Date();
  const palette = getAppColors(settings.paletteId);
  const [kojori, tbilisi] = await Promise.all([
    buildDirectionPayload('kojori', settings.activeTbilisiStopId, now),
    buildDirectionPayload('tbilisi', settings.activeKojoriStopId, now),
  ]);

  const payload: WidgetStatePayload = {
    palette: {
      text: palette.text,
      textDim: palette.textDim,
      textFaint: palette.textFaint,
      primary: palette.primary,
      route380: palette.route380,
      route316: palette.route316,
    },
    directions: { kojori, tbilisi },
  };

  await KojoriWidget.syncWidgetState(JSON.stringify(payload));
}
