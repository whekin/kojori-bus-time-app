// @ts-nocheck
import { expect, it } from 'bun:test';
import { BAKED_SCHEDULES } from '../assets/ttc-baked';
import { buildWidgetData } from './build-ios-widget-data';

it('ships both directions, localized stop names, and actual offline departure minutes', () => {
  const data = buildWidgetData();
  expect(data.stops.filter(stop => stop.direction === 'toKojori')).toHaveLength(4);
  expect(data.stops.filter(stop => stop.direction === 'toTbilisi')).toHaveLength(6);
  for (const stop of data.stops) {
    expect(Object.keys(stop.names)).toEqual(['en', 'ka', 'ru']);
    expect(Object.values(stop.routes).some(periods => periods.some(period => period.minutes.length))).toBe(true);
  }
});

it('uses the same bridge-stop fallback as the app, never an empty schedule', () => {
  const bridge = buildWidgetData().stops.find(stop => stop.stopId === '1:2994');
  const source = BAKED_SCHEDULES['380_toKojori'][0].stops.find(stop => stop.id === '1:3932');
  expect(bridge.routes['380'][0].minutes).toEqual(source.arrivalTimes.split(',').map(time => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }));
});
