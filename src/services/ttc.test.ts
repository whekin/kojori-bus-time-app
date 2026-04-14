// @ts-nocheck
import { describe, expect, it } from 'bun:test';

import type { ArrivalTime, Departure } from './ttc';
import { injectCancelledDemo, mergeArrivalsIntoSchedule } from './ttc';

function makeDeparture(bus: '380' | '316', minsUntil: number, time: string): Departure {
  return {
    key: `${bus}-${time}`,
    bus,
    time,
    minsUntil,
    status: 'scheduled',
    scheduledTime: time,
  };
}

function makeArrival(bus: '380' | '316', realtimeArrivalMinutes: number): ArrivalTime {
  return {
    shortName: bus,
    color: '',
    headsign: '',
    patternSuffix: '',
    vehicleMode: 'BUS',
    realtime: true,
    realtimeArrivalMinutes,
    scheduledArrivalMinutes: realtimeArrivalMinutes,
  };
}

describe('mergeArrivalsIntoSchedule', () => {
  it('marks skipped earlier scheduled departure as cancelled when live snaps to later departure', () => {
    const departures = [
      makeDeparture('380', 10, '18:00'),
      makeDeparture('380', 40, '18:30'),
    ];

    const result = mergeArrivalsIntoSchedule(departures, [makeArrival('380', 35)], new Date('2026-04-15T17:50:00Z'));

    expect(result.map(dep => dep.status)).toEqual(['cancelled', 'live']);
    expect(result[1].scheduledTime).toBe('18:30');
    expect(result[1].replacedCancelledDeparture?.time).toBe('18:00');
  });

  it('keeps schedule unchanged when no realtime arrivals exist for route', () => {
    const departures = [
      makeDeparture('380', 10, '18:00'),
      makeDeparture('380', 40, '18:30'),
    ];

    const result = mergeArrivalsIntoSchedule(departures, [], new Date('2026-04-15T17:50:00Z'));

    expect(result.map(dep => dep.status)).toEqual(['scheduled', 'scheduled']);
    expect(result.some(dep => dep.cancelled)).toBe(false);
  });

  it('matches multiple live arrivals one-to-one in time order', () => {
    const departures = [
      makeDeparture('380', 10, '18:00'),
      makeDeparture('380', 25, '18:15'),
      makeDeparture('380', 40, '18:30'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('380', 11), makeArrival('380', 41)],
      new Date('2026-04-15T17:50:00Z'),
    );

    expect(result.map(dep => dep.status)).toEqual(['live', 'cancelled', 'live']);
    expect(result[0].scheduledTime).toBe('18:00');
    expect(result[2].scheduledTime).toBe('18:30');
  });

  it('isolates matching per route', () => {
    const departures = [
      makeDeparture('380', 10, '18:00'),
      makeDeparture('316', 12, '18:02'),
      makeDeparture('316', 32, '18:22'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 30)],
      new Date('2026-04-15T17:50:00Z'),
    );

    expect(result.find(dep => dep.bus === '380')?.status).toBe('scheduled');
    expect(result.filter(dep => dep.bus === '316').map(dep => dep.status)).toEqual(['cancelled', 'live']);
  });

  it('drops already-past scheduled departures', () => {
    const departures = [
      makeDeparture('380', -1, '17:49'),
      makeDeparture('380', 12, '18:02'),
    ];

    const result = mergeArrivalsIntoSchedule(departures, [], new Date('2026-04-15T17:50:00Z'));

    expect(result).toHaveLength(1);
    expect(result[0].time).toBe('18:02');
  });
});

describe('injectCancelledDemo', () => {
  it('injects one cancelled/live pair for first eligible scheduled departure', () => {
    const departures = [
      makeDeparture('380', 6, '18:00'),
      makeDeparture('380', 21, '18:15'),
    ];

    const result = injectCancelledDemo(departures, new Date('2026-04-15T17:54:00Z'));

    expect(result[0].status).toBe('cancelled');
    expect(result[1].status).toBe('live');
    expect(result[1].replacedCancelledDeparture?.time).toBe('18:00');
  });
});
