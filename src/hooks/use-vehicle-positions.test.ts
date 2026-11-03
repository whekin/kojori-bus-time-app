// @ts-expect-error Bun provides the test module at runtime; it is not an app dependency.
import { afterEach, expect, it } from 'bun:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';

import { combineVehiclePositions, vehiclePositionsQueryOptions } from './use-vehicle-positions';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

it('keeps fresh positions for one route when another route fails, then recovers independently', async () => {
  const client = new QueryClient();
  const route380 = vehiclePositionsQueryOptions('380', 'toKojori', true);
  const route316 = vehiclePositionsQueryOptions('316', 'toKojori', true);
  let failing = true;
  globalThis.fetch = (async input => {
    if (String(input).includes('1:R98445') && failing) return new Response('unavailable', { status: 520 });
    return Response.json({ '0:01': [
      { vehicleId: 'bus', lat: 41.7, lon: 44.8, heading: 0, nextStopId: 'stop' },
      { vehicleId: 'bus', lat: 41.7, lon: 44.8, heading: 0, nextStopId: 'stop' },
      { vehicleId: 'invalid', lat: 0, lon: 0, heading: 0, nextStopId: 'stop' },
    ] });
  }) as typeof fetch;

  const results = await Promise.allSettled([client.fetchQuery(route380), client.fetchQuery(route316)]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(client.getQueryData(route380.queryKey)?.map(position => position.bus)).toEqual(['380']);
  expect(client.getQueryState(route316.queryKey)?.status).toBe('error');

  failing = false;
  await client.fetchQuery(route316);
  expect(client.getQueryData(route316.queryKey)?.map(position => position.bus)).toEqual(['316']);
  expect(client.getQueryData(route380.queryKey)?.map(position => position.bus)).toEqual(['380']);

  // A refetch failure retains React Query's cached data. It must not be used
  // as fresh vehicle evidence or prevent the other fleet being displayed.
  failing = true;
  await client.fetchQuery({ ...route316, staleTime: 0 }).catch(() => { });
  const combined = combineVehiclePositions([
    new QueryObserver(client, route380).getCurrentResult(),
    new QueryObserver(client, route316).getCurrentResult(),
  ]);
  expect(combined.data.map(position => position.bus)).toEqual(['380']);
  client.clear();
});
