// @ts-expect-error Bun provides the test module at runtime.
import { expect, test } from 'bun:test';
import { backendRows, decodeBackendDepartures, fetchBackendDepartures } from './backend';
import type { Boarding } from './model';
const boarding: Boarding = { route: { id: 'r', shortName: '101', longName: '', mode: 'BUS' }, pattern: { patternSuffix: '0', headsign: '' }, stop: { id: 's', label: '' } };
const scheduled = [{ key: 's', boarding, epochMs: 200000, scheduledEpochMs: 200000, live: false, confirmed: true }];
test('source age includes transport delay and is not reset by fetching cached data', () => {
 const data = decodeBackendDepartures({ version: 1, state: 'available', serverTime: 50000, observedAt: 10000, validUntil: 100000, rows: [] }, boarding, 100000, 102000);
 expect(data.observedAt).toBe(60000); expect(data.expiresAt).toBe(150000);
 expect(backendRows(data, false, scheduled, 150001)).toEqual(scheduled);
 expect(backendRows(data, true, scheduled, 110000)).toEqual(scheduled);
});
test('malformed backend rows are rejected', () => {
 expect(() => decodeBackendDepartures({ version: 1, state: 'available', serverTime: 0, observedAt: 0, validUntil: 100, rows: [{ epochMs: 'tomorrow' }] }, boarding, 0, 0)).toThrow();
});
test('backend error does not fall back to a TTC request', async () => {
 const original = globalThis.fetch; const calls: string[] = [];
 globalThis.fetch = (async (url: string | URL | Request) => { calls.push(String(url)); return new Response('', { status: 503 }); }) as typeof fetch;
 try { await expect(fetchBackendDepartures(boarding, scheduled, { count: 0, observedAt: 0 })).rejects.toThrow('503'); }
 finally { globalThis.fetch = original; }
 expect(calls.length).toBe(1); expect(calls[0]).toContain('/v1/departures');
});
