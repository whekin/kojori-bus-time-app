// @ts-nocheck
import { describe, expect, it } from 'bun:test';

import type { ArrivalTime, Departure, SchedulePeriod } from './ttc';
import {
  computeUpcomingDepartures,
  getDepartureServiceBoundary,
  getLastDepartureToday,
  getNextServiceDeparture,
  injectLiveDelayDemo,
  isFinalDepartureToday,
  mergeArrivalsIntoSchedule,
  resolveTtcLookupStopId,
} from './ttc';

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

function makeArrival(
  bus: '380' | '316',
  realtimeArrivalMinutes: number,
  scheduledArrivalMinutes = realtimeArrivalMinutes,
): ArrivalTime {
  return {
    shortName: bus,
    color: '',
    headsign: '',
    patternSuffix: '',
    vehicleMode: 'BUS',
    realtime: true,
    realtimeArrivalMinutes,
    scheduledArrivalMinutes,
  };
}

function makeSchedule(
  serviceDates: string[],
  stopTimes: Record<string, string>,
): SchedulePeriod[] {
  return [
    {
      fromDay: 'MONDAY',
      toDay: 'SUNDAY',
      serviceDates,
      stops: Object.entries(stopTimes).map(([id, arrivalTimes], index) => ({
        id,
        name: id,
        position: index + 1,
        arrivalTimes,
      })),
    },
  ];
}

describe('resolveTtcLookupStopId', () => {
  it('uses Baratashvili for every TTC lookup when Elene is selected', () => {
    expect(resolveTtcLookupStopId('1:2994')).toBe('1:3932');
    expect(resolveTtcLookupStopId('1:3932')).toBe('1:3932');
  });
});

describe('mergeArrivalsIntoSchedule', () => {
  it('does not mark skipped earlier scheduled departures as cancelled', () => {
    const departures = [
      makeDeparture('380', 10, '18:00'),
      makeDeparture('380', 40, '18:30'),
    ];

    const result = mergeArrivalsIntoSchedule(departures, [makeArrival('380', 35)], new Date('2026-04-15T17:50:00Z'));

    expect(result.map(dep => dep.status)).toEqual(['scheduled', 'live']);
    expect(result[1].scheduledTime).toBe('18:30');
    expect(result.some(dep => dep.cancelled)).toBe(false);
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

    expect(result.map(dep => dep.status)).toEqual(['live', 'scheduled', 'live']);
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
    expect(result.filter(dep => dep.bus === '316').map(dep => dep.status)).toEqual(['scheduled', 'live']);
  });

  it('drops scheduled-only departures once their minute has started', () => {
    const departures = [
      makeDeparture('380', 0, '17:50'),
      makeDeparture('380', 12, '18:02'),
    ];

    const result = mergeArrivalsIntoSchedule(departures, [], new Date('2026-04-15T17:50:00Z'));

    expect(result).toHaveLength(1);
    expect(result[0].time).toBe('18:02');
    expect(result[0].status).toBe('scheduled');
  });

  it('drops past scheduled-only departures', () => {
    const departures = [
      makeDeparture('380', -1, '17:49'),
      makeDeparture('380', 12, '18:02'),
    ];

    const result = mergeArrivalsIntoSchedule(departures, [], new Date('2026-04-15T17:50:00Z'));

    expect(result).toHaveLength(1);
    expect(result[0].time).toBe('18:02');
  });

  it('drops no-live current-minute scheduled departures at route-start stops', () => {
    const departures = [
      makeDeparture('316', 0, '15:00'),
      makeDeparture('316', 1, '15:01'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [],
      new Date('2026-04-15T15:00:00Z'),
      undefined,
      { stopId: '1:3932' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].time).toBe('15:01');
    expect(result[0].status).toBe('scheduled');
  });

  it('shows delayed live arrivals whose scheduled departure is already in the past', () => {
    const departures = [
      makeDeparture('316', -2, '14:58'),
      makeDeparture('316', 28, '15:28'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 3, -2)],
      new Date('2026-04-15T15:00:00Z'),
    );

    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('15:03');
    expect(result[0].scheduledTime).toBe('14:58');
    expect(result[0].driftMinutes).toBe(5);
  });

  it('keeps a just-passed schedule anchor for a delayed live trip', () => {
    const departures = [
      makeDeparture('316', -1, '22:13'),
      makeDeparture('316', 26, '22:40'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 3, -1)],
      new Date('2026-04-15T22:14:00Z'),
      undefined,
      { stopId: '1:3932' },
    );

    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('22:17');
    expect(result[0].scheduledTime).toBe('22:13');
    expect(result[0].driftMinutes).toBe(4);
    expect(result[1].status).toBe('scheduled');
  });

  it('falls back to hard timetable matching when TTC scheduled ETA does not identify the trip', () => {
    const departures = [
      makeDeparture('316', -1, '22:13'),
      makeDeparture('316', 26, '22:40'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 3, 50)],
      new Date('2026-04-15T22:14:00Z'),
      undefined,
      { stopId: '1:3932' },
    );

    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('22:17');
    expect(result[0].scheduledTime).toBe('22:13');
    expect(result[0].driftMinutes).toBe(4);
    expect(result[1].status).toBe('scheduled');
  });

  it('can attach an early live bus to a hard timetable row', () => {
    const departures = [
      makeDeparture('380', 24, '18:24'),
      makeDeparture('380', 54, '18:54'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('380', 20, 80)],
      new Date('2026-04-15T18:00:00Z'),
    );

    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('18:20');
    expect(result[0].scheduledTime).toBe('18:24');
    expect(result[0].driftMinutes).toBe(-4);
    expect(result[1].status).toBe('scheduled');
  });

  it('adds unmatched live arrivals instead of requiring an active schedule row', () => {
    const result = mergeArrivalsIntoSchedule(
      [],
      [makeArrival('316', 3, -10)],
      new Date('2026-04-15T15:00:00Z'),
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('15:03');
    expect(result[0].scheduledTime).toBeUndefined();
    expect(result[0].driftMinutes).toBeUndefined();
  });

  it('keeps live arrivals but drops stale TTC schedule anchors with absurd drift', () => {
    const result = mergeArrivalsIntoSchedule(
      [],
      [makeArrival('380', 71, -109)],
      new Date(2026, 4, 22, 18, 15),
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('19:26');
    expect(result[0].scheduledTime).toBeUndefined();
    expect(result[0].scheduledMinsUntil).toBeUndefined();
    expect(result[0].driftMinutes).toBeUndefined();
  });

  it('drops absurd drift metadata from matched live arrivals too', () => {
    const departures = [
      makeDeparture('380', -4, '18:11'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('380', 71, -4)],
      new Date(2026, 4, 22, 18, 15),
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('19:26');
    expect(result[0].scheduledTime).toBeUndefined();
    expect(result[0].driftMinutes).toBeUndefined();
  });

  it('suppresses live arrivals that run far later than schedule at early route stops', () => {
    const departures = [
      makeDeparture('316', 1, '15:01'),
      makeDeparture('316', 31, '15:31'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 7, 1)],
      new Date('2026-04-15T15:00:00Z'),
      undefined,
      { stopId: '1:3932' },
    );

    expect(result.map(dep => dep.status)).toEqual(['scheduled', 'scheduled']);
    expect(result.some(dep => dep.live)).toBe(false);
  });

  it('suppresses live arrivals that run far earlier than schedule at early route stops', () => {
    const departures = [
      makeDeparture('316', 8, '15:08'),
      makeDeparture('316', 38, '15:38'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 2, 8)],
      new Date('2026-04-15T15:00:00Z'),
      undefined,
      { stopId: '1:3932' },
    );

    expect(result.map(dep => dep.status)).toEqual(['scheduled', 'scheduled']);
    expect(result[0].minsUntil).toBe(8);
    expect(result.some(dep => dep.live)).toBe(false);
  });

  it('suppresses cached noisy early-stop signals after local countdown adjustment', () => {
    const departures = [
      makeDeparture('316', 1, '15:01'),
      makeDeparture('316', 31, '15:31'),
    ];
    const now = new Date('2026-04-15T15:00:00Z');

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 7, 1)],
      now,
      now.getTime() - 60_000,
      { stopId: '1:4186' },
    );

    expect(result.map(dep => dep.status)).toEqual(['scheduled', 'scheduled']);
    expect(result.some(dep => dep.live)).toBe(false);
  });

  it('keeps live arrivals away from the early route zone', () => {
    const departures = [
      makeDeparture('316', 1, '15:01'),
      makeDeparture('316', 31, '15:31'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 7, 1)],
      new Date('2026-04-15T15:00:00Z'),
      undefined,
      { stopId: '1:3537' },
    );

    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('15:07');
  });

  it('keeps early-stop live arrivals within the schedule tolerance', () => {
    const departures = [
      makeDeparture('316', 10, '15:10'),
      makeDeparture('316', 31, '15:31'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 9, 10)],
      new Date('2026-04-15T15:00:00Z'),
      undefined,
      { stopId: '1:3078' },
    );

    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('15:09');
  });

  it('ignores stale live arrivals instead of counting them down indefinitely', () => {
    const departures = [
      makeDeparture('380', 1, '18:00'),
      makeDeparture('380', 20, '18:19'),
    ];
    const now = new Date('2026-04-15T17:59:00Z');
    const staleUpdatedAt = now.getTime() - 9 * 60_000;

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('380', 10, 9)],
      now,
      staleUpdatedAt,
    );

    expect(result.map(dep => dep.status)).toEqual(['scheduled', 'scheduled']);
    expect(result.some(dep => dep.live)).toBe(false);
  });

  it('drops locally expired live arrivals instead of pinning them at now', () => {
    const departures = [
      makeDeparture('316', 30, '21:52'),
    ];
    const now = new Date('2026-04-15T21:21:00Z');

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('316', 1, 30)],
      now,
      now.getTime() - 60_000,
      { stopId: '1:3932' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('scheduled');
    expect(result[0].minsUntil).toBe(30);
    expect(result.some(dep => dep.live)).toBe(false);
  });

  it('matches delayed live arrivals by TTC scheduled ETA, not nearest live ETA', () => {
    const departures = [
      makeDeparture('380', 1, '18:00'),
      makeDeparture('380', 15, '18:14'),
    ];

    const result = mergeArrivalsIntoSchedule(
      departures,
      [makeArrival('380', 10, 1)],
      new Date('2026-04-15T17:59:00Z'),
    );

    expect(result[0].status).toBe('live');
    expect(result[0].time).toBe('18:09');
    expect(result[0].minsUntil).toBe(10);
    expect(result[0].driftMinutes).toBe(9);
    expect(result[1].status).toBe('scheduled');
  });
});

describe('injectLiveDelayDemo', () => {
  it('injects one delayed live departure without creating cancellations', () => {
    const departures = [
      makeDeparture('380', 6, '18:00'),
      makeDeparture('380', 21, '18:15'),
    ];

    const result = injectLiveDelayDemo(departures, new Date('2026-04-15T17:54:00Z'));

    expect(result.some(dep => dep.status === 'cancelled')).toBe(false);
    expect(result.some(dep => dep.cancelled)).toBe(false);
    expect(result[0].status).toBe('live');
    expect(result[0].scheduledTime).toBe('18:00');
    expect(result[0].minsUntil).toBe(17);
  });
});

describe('service boundary helpers', () => {
  it('finds the last departure today while the next departure is not final yet', () => {
    const schedule380 = makeSchedule(['2026-04-15'], { '1:stop': '20:00,22:00' });
    const schedule316 = makeSchedule(['2026-04-15'], { '1:stop': '21:00' });
    const now = new Date(2026, 3, 15, 19, 30);
    const nextDeparture = makeDeparture('380', 30, '20:00');

    const finalDeparture = getLastDepartureToday(schedule380, schedule316, '1:stop', now);

    expect(finalDeparture?.bus).toBe('380');
    expect(finalDeparture?.time).toBe('22:00');
    expect(isFinalDepartureToday(nextDeparture, schedule380, schedule316, '1:stop', now)).toBe(false);
  });

  it('detects when the next departure is the final bus today', () => {
    const schedule380 = makeSchedule(['2026-04-15'], { '1:stop': '20:00' });
    const schedule316 = makeSchedule(['2026-04-15'], { '1:stop': '21:00' });
    const now = new Date(2026, 3, 15, 20, 30);
    const nextDeparture = makeDeparture('316', 30, '21:00');

    const boundary = getDepartureServiceBoundary(schedule380, schedule316, '1:stop', nextDeparture, now);

    expect(boundary.nextDepartureIsFinal).toBe(true);
    expect(boundary.serviceEndedToday).toBe(false);
    expect(boundary.finalDepartureToday?.time).toBe('21:00');
  });

  it('finds the next service after service ends today', () => {
    const schedule380 = makeSchedule(['2026-04-15', '2026-04-16'], { '1:stop': '20:00,22:00' });
    const schedule316 = makeSchedule(['2026-04-16'], { '1:stop': '08:30' });
    const now = new Date(2026, 3, 15, 22, 30);

    const boundary = getDepartureServiceBoundary(schedule380, schedule316, '1:stop', undefined, now);

    expect(boundary.hasServiceToday).toBe(true);
    expect(boundary.serviceEndedToday).toBe(true);
    expect(boundary.nextServiceDeparture?.date).toBe('2026-04-16');
    expect(boundary.nextServiceDeparture?.time).toBe('08:30');
  });

  it('finds the next available service when there is no service today', () => {
    const schedule380 = makeSchedule(['2026-04-17'], { '1:stop': '09:15' });
    const schedule316 = makeSchedule(['2026-04-18'], { '1:stop': '08:00' });
    const now = new Date(2026, 3, 15, 10, 0);

    const nextService = getNextServiceDeparture(schedule380, schedule316, '1:stop', now);

    expect(nextService?.date).toBe('2026-04-17');
    expect(nextService?.daysUntil).toBe(2);
    expect(nextService?.time).toBe('09:15');
  });

  it('uses the TTC lookup proxy stop for service-boundary checks', () => {
    const schedule380 = makeSchedule(['2026-04-15'], { '1:3932': '07:11,21:52' });
    const now = new Date(2026, 3, 15, 21, 0);
    const nextDeparture = makeDeparture('380', 52, '21:52');

    const boundary = getDepartureServiceBoundary(schedule380, undefined, '1:2994', nextDeparture, now);

    expect(boundary.hasServiceToday).toBe(true);
    expect(boundary.finalDepartureToday?.time).toBe('21:52');
    expect(boundary.nextDepartureIsFinal).toBe(true);
  });
});

describe('computeUpcomingDepartures', () => {
  it('does not keep current-minute scheduled departures at route-start stops', () => {
    const schedule316 = makeSchedule(['2026-04-15'], { '1:3932': '15:00,15:01,15:10' });

    const result = computeUpcomingDepartures(
      undefined,
      schedule316,
      '1:3932',
      60,
      new Date(2026, 3, 15, 15, 0),
    );

    expect(result.map(dep => dep.time)).toEqual(['15:01', '15:10']);
  });

  it('can include recent past departures as live matching anchors', () => {
    const schedule316 = makeSchedule(['2026-04-15'], { '1:3932': '14:59,15:00,15:01,15:10' });

    const result = computeUpcomingDepartures(
      undefined,
      schedule316,
      '1:3932',
      60,
      new Date(2026, 3, 15, 15, 0),
      { includeRecentPast: true },
    );

    expect(result.map(dep => dep.time)).toEqual(['14:59', '15:00', '15:01', '15:10']);
  });

  it('does not keep current-minute or past scheduled departures away from route-start stops', () => {
    const schedule316 = makeSchedule(['2026-04-15'], { '1:2139': '14:58,15:00,15:10' });

    const result = computeUpcomingDepartures(
      undefined,
      schedule316,
      '1:2139',
      60,
      new Date(2026, 3, 15, 15, 0),
    );

    expect(result.map(dep => dep.time)).toEqual(['15:10']);
  });
});
