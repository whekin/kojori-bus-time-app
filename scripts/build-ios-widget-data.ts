import { BAKED_AT, BAKED_SCHEDULES } from '../assets/ttc-baked';
import { CURATED_STOP_IDS } from '../src/constants/curated-stops';
import { localizedStopName } from '../src/i18n/stop-names';

// A widget owns its offline data and configuration. No App Group is needed,
// so SideStore's bundle/group-ID rewriting cannot disconnect it from its data.
export function buildWidgetData() {
  const stops = Object.entries(CURATED_STOP_IDS).flatMap(([direction, ids]) => ids.map(stopId => {
    // TTC omits the bridge stop; it uses the same schedule proxy as the app.
    const lookupId = stopId === '1:2994' ? '1:3932' : stopId;
    const routes = Object.fromEntries(['380', '316'].map(bus => {
      const key = `${bus}_${direction}` as keyof typeof BAKED_SCHEDULES;
      return [bus, BAKED_SCHEDULES[key].map(period => ({
        fromDay: period.fromDay,
        toDay: period.toDay,
        serviceDates: [...period.serviceDates],
        minutes: (period.stops.find(stop => stop.id === lookupId)?.arrivalTimes ?? '')
          .split(',').filter(Boolean).map(time => {
            const [hours, minutes] = time.split(':').map(Number);
            return hours * 60 + minutes;
          }).filter(Number.isFinite).sort((a, b) => a - b),
      }))];
    }));
    return {
      id: `${direction}:${stopId}`,
      stopId,
      direction,
      names: Object.fromEntries(['en', 'ka', 'ru'].map(language =>
        [language, localizedStopName(stopId, language as 'en' | 'ka' | 'ru')])),
      routes,
    };
  }));
  return { schemaVersion: 1, bakedAt: BAKED_AT, stops };
}

if (import.meta.main) {
  const destination = process.argv[2];
  if (!destination) throw new Error('Usage: bun scripts/build-ios-widget-data.ts <output.json>');
  await Bun.write(destination, JSON.stringify(buildWidgetData()));
}
