// @ts-expect-error Bun provides the test module at runtime.
import { afterEach, expect, it, mock } from 'bun:test';
import { GET } from '@/app/ttc+api';
import {
  MinuteRateLimiter,
  TTC_PROXY_LIMITS,
  TtcProxyCache,
  clientAddress,
  resetTtcProxyState,
  ttcCacheTtlMs,
} from '@/services/ttc-proxy-cache';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetTtcProxyState();
});

const arrivals = (stop: string) => `/v2/stops/${encodeURIComponent(stop)}/arrival-times?locale=en&ignoreScheduledArrivalTimes=false`;
const call = (path: string, ip = '203.0.113.7') =>
  GET(new Request(`http://localhost/ttc?path=${encodeURIComponent(path)}`, { headers: { 'x-forwarded-for': ip } }));

it('answers repeated reads from the cache and asks TTC again for a different read', async () => {
  const fetcher = mock(async () => Response.json([{ shortName: '380' }]));
  globalThis.fetch = fetcher as unknown as typeof fetch;

  const first = await call(arrivals('1:3932'));
  const second = await call(arrivals('1:3932'), '198.51.100.1');
  expect(first.headers.get('x-cache')).toBe('MISS');
  expect(second.headers.get('x-cache')).toBe('HIT');
  expect(await second.json()).toEqual([{ shortName: '380' }]);
  expect(second.headers.get('cache-control')).toMatch(/^public, max-age=1[0-5]$/);
  expect(fetcher).toHaveBeenCalledTimes(1);

  await call(arrivals('1:2856'));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('sends one upstream request for many concurrent identical reads', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetcher = mock(async () => { await gate; return Response.json({ ok: true }); });
  globalThis.fetch = fetcher as unknown as typeof fetch;

  const responses = Array.from({ length: 20 }, (_, i) => call(arrivals('1:3932'), `192.0.2.${i}`));
  release();
  const settled = await Promise.all(responses);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(settled.every(response => response.status === 200)).toBe(true);
});

it('keeps a TTC rate-limit answer briefly instead of retrying it for every client', async () => {
  const fetcher = mock(async () => Response.json({ error: 'limited' }, { status: 520 }));
  globalThis.fetch = fetcher as unknown as typeof fetch;

  expect((await call(arrivals('1:3932'))).status).toBe(520);
  const again = await call(arrivals('1:3932'));
  expect(again.status).toBe(520);
  expect(again.headers.get('cache-control')).toBe('no-store');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('caps upstream requests per client without blocking other clients', async () => {
  const fetcher = mock(async () => Response.json([]));
  globalThis.fetch = fetcher as unknown as typeof fetch;

  for (let i = 0; i < TTC_PROXY_LIMITS.clientUpstreamPerMinute; i++) {
    expect((await call(arrivals(`1:${i}`))).status).toBe(200);
  }
  const blocked = await call(arrivals('1:99999'));
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  // Cached answers still work for the same client, and other clients are unaffected.
  expect((await call(arrivals('1:0'))).status).toBe(200);
  expect((await call(arrivals('1:99999'), '198.51.100.9')).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(TTC_PROXY_LIMITS.clientUpstreamPerMinute + 1);
});

it('expires entries after their TTL and evicts the oldest past the size limit', async () => {
  let now = 0;
  const cache = new TtcProxyCache({ maxEntries: 2, maxBytes: 1024, now: () => now });
  const body = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
  const load = (text: string) => async () => ({ status: 200, contentType: 'application/json', body: body(text) });

  await cache.load('a', load('a'), () => 1000);
  expect(cache.peek('a')?.remainingMs).toBe(1000);
  now = 1000;
  expect(cache.peek('a')).toBeNull();

  await cache.load('b', load('b'), () => 5000);
  await cache.load('c', load('c'), () => 5000);
  await cache.load('d', load('d'), () => 5000);
  expect(cache.peek('b')).toBeNull();
  expect(cache.size).toBe(2);
});

it('counts requests in one-minute windows', () => {
  let now = 0;
  const limiter = new MinuteRateLimiter(2, () => now);
  expect(limiter.hit('x')).toBe(0);
  expect(limiter.hit('x')).toBe(0);
  expect(limiter.hit('x')).toBe(60);
  expect(limiter.hit('y')).toBe(0);
  now = 60_000;
  expect(limiter.hit('x')).toBe(0);
});

it('reuses each kind of TTC data for less time than the app waits between refreshes', () => {
  expect(ttcCacheTtlMs('/v3/routes/1:R97505/positions')).toBeLessThan(5_000);
  expect(ttcCacheTtlMs('/v2/stops/1:3932/arrival-times')).toBeLessThan(30_000);
  expect(ttcCacheTtlMs('/v3/routes/1:R97505/schedule')).toBe(60 * 60_000);
  expect(ttcCacheTtlMs('/v3/routes/1:R97505/polylines')).toBe(6 * 60 * 60_000);
});

it('takes the client address the reverse proxy appended, not one the client sent', () => {
  expect(clientAddress(new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }))).toBe('203.0.113.7');
  expect(clientAddress(new Headers({ 'x-real-ip': '203.0.113.8' }))).toBe('203.0.113.8');
  expect(clientAddress(new Headers())).toBe('unknown');
});
