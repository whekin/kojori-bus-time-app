import { Platform } from 'react-native';

import { BAKED_SCHEDULES, BAKED_STOP_NAMES } from '@/assets/ttc-baked';
import { getAppColors, type AppPaletteId } from '@/constants/theme';
import { resolveLanguage, type AppLanguage } from '@/i18n/languages';
import { localizedStopName } from '@/i18n/stop-names';
import { translate } from '@/i18n/translations';
import {
  BusLine,
  extractStopTimes,
  findStop,
  formatTime,
  parseTimeToMins,
  resolveTtcLookupStopId,
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
  language: AppLanguage;
}

interface WidgetItemPayload {
  bus: BusLine;
  time: string;
  departureEpochMs: number;
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

interface WidgetAccentColors {
  route380: string;
  route316: string;
}

// Bump whenever the payload shape changes in a way old widget code (or new
// widget code reading an old payload) must not silently misrender. The widget
// treats any other version as "no data" and asks to open the app.
export const WIDGET_STATE_SCHEMA_VERSION = 2;

interface WidgetStatePayload {
  schemaVersion: number;
  // Route accents per color scheme; the widget picks the variant matching the
  // device theme at render time. Base widget colors are native day/night resources.
  palette: {
    dark: WidgetAccentColors;
    light: WidgetAccentColors;
  };
  strings: {
    openAppToLoad: string;
    openAppToRefresh: string;
    noDeparturesSoon: string;
    toKojori: string;
    toTbilisi: string;
    from: string;
    inMinutes: string;
    now: string;
  };
  directions: Record<WidgetMode, WidgetDirectionPayload>;
}

// Schedules are baked/cached, so sync a whole week of departures — the widget
// keeps showing real times even if the app is not opened for days. The widget
// list itself caps how many rows it renders.
const WIDGET_FUTURE_DAYS = 7;
const WIDGET_MAX_ITEMS = 400;
const LATE_DEPARTURE_GRACE_MS = 5 * 60_000;

function formatLocalServiceDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildWidgetItems(
  stopId: string,
  schedule380: SchedulePeriod[] | undefined,
  schedule316: SchedulePeriod[] | undefined,
  now: Date,
): WidgetItemPayload[] {
  const lookupStopId = resolveTtcLookupStopId(stopId);
  const nowMs = now.getTime();
  const baseDate = new Date(now);
  baseDate.setHours(0, 0, 0, 0);
  const items: WidgetItemPayload[] = [];

  const entries: [BusLine, SchedulePeriod[] | undefined][] = [
    ['380', schedule380],
    ['316', schedule316],
  ];

  for (const [bus, schedule] of entries) {
    if (!schedule?.length) continue;

    for (let dayOffset = 0; dayOffset < WIDGET_FUTURE_DAYS; dayOffset += 1) {
      const serviceDate = new Date(baseDate);
      serviceDate.setDate(baseDate.getDate() + dayOffset);
      const period =
        schedule.find(candidate => candidate.serviceDates.includes(formatLocalServiceDate(serviceDate)))
        ?? schedule[0];
      if (!period) continue;

      const stopTimes = extractStopTimes(period, lookupStopId);
      for (const stopTime of stopTimes) {
        const mins = parseTimeToMins(stopTime);
        if (!Number.isFinite(mins)) continue;

        const departure = new Date(serviceDate);
        departure.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
        const departureEpochMs = departure.getTime();
        if (departureEpochMs < nowMs - LATE_DEPARTURE_GRACE_MS) continue;

        items.push({
          bus,
          time: formatTime(mins),
          departureEpochMs,
        });
      }
    }
  }

  return items
    .sort((left, right) => left.departureEpochMs - right.departureEpochMs)
    .slice(0, WIDGET_MAX_ITEMS);
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

async function loadStopLabel(stopId: string, language: ReturnType<typeof resolveLanguage>) {
  const cached = await readCachedStopName(stopId, true);
  if (cached) return localizedStopName({ id: stopId, label: cached }, language);

  const baked = BAKED_STOP_NAMES[stopId];
  if (baked) return localizedStopName({ id: stopId, label: baked }, language);

  const fallback = findStop(stopId)?.label;
  return localizedStopName(stopId, language, fallback);
}

async function buildDirectionPayload(
  mode: WidgetMode,
  stopId: string,
  now: Date,
  language: ReturnType<typeof resolveLanguage>,
): Promise<WidgetDirectionPayload> {
  const direction = mode === 'kojori' ? 'toKojori' : 'toTbilisi';
  const stopLabel = await loadStopLabel(stopId, language);
  const syncedAtEpochMs = now.getTime();

  try {
    const [schedule380, schedule316] = await Promise.all([
      loadSchedule(ROUTES['380'].id, ROUTES['380'][direction]),
      loadSchedule(ROUTES['316'].id, ROUTES['316'][direction]),
    ]);

    const items = buildWidgetItems(stopId, schedule380, schedule316, now);

    if (items.length === 0) {
      return {
        mode,
        stopId,
        stopLabel,
        syncedAtEpochMs,
        status: 'empty',
        message: translate(language, 'widgetNoDepartures'),
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
      message: translate(language, 'widgetOpenRefresh'),
      items: [],
    };
  }
}

export async function syncAndroidWidgetState(settings: WidgetSyncSettings) {
  if (Platform.OS !== 'android' || !KojoriWidget) return;

  const now = new Date();
  const language = resolveLanguage(settings.language);
  const darkColors = getAppColors(settings.paletteId, 'dark');
  const lightColors = getAppColors(settings.paletteId, 'light');
  const [kojori, tbilisi] = await Promise.all([
    buildDirectionPayload('kojori', settings.activeTbilisiStopId, now, language),
    buildDirectionPayload('tbilisi', settings.activeKojoriStopId, now, language),
  ]);

  const payload: WidgetStatePayload = {
    schemaVersion: WIDGET_STATE_SCHEMA_VERSION,
    palette: {
      dark: { route380: darkColors.route380, route316: darkColors.route316 },
      light: { route380: lightColors.route380, route316: lightColors.route316 },
    },
    strings: {
      openAppToLoad: translate(language, 'widgetOpenLoad'),
      openAppToRefresh: translate(language, 'widgetOpenRefresh'),
      noDeparturesSoon: translate(language, 'widgetNoDepartures'),
      toKojori: translate(language, 'widgetToKojori'),
      toTbilisi: translate(language, 'widgetToTbilisi'),
      from: language === 'en' ? 'from' : language === 'ka' ? 'საიდან' : 'от',
      // Passing the placeholder as its own value returns the raw template
      // ("in {minutes} mins") so the widget can substitute per row natively.
      inMinutes: translate(language, 'timePlusMinutes', { minutes: '{minutes}' }),
      now: translate(language, 'commonNow'),
    },
    directions: { kojori, tbilisi },
  };

  await KojoriWidget.syncWidgetState(JSON.stringify(payload));
}
