/**
 * Shared cache and rate limits for the web proxy (src/app/ttc+api.ts).
 *
 * Every browser on the web app and the landing page reaches TTC through one
 * server, one IP and one API key, and can encounter TTC failures or rate limits. Identical
 * reads are answered from memory for a short time, concurrent identical reads
 * share one upstream request, and upstream requests are capped per client and
 * overall. Native apps call TTC directly and never pass through here.
 */

export type CachedTtcResponse = {
  status: number;
  contentType: string;
  body: ArrayBuffer;
};

/** How long a TTC answer may be reused, by endpoint. Shorter than the app's own refresh. */
export function ttcCacheTtlMs(apiPath: string): number {
  if (/\/positions$/.test(apiPath)) return 4_000; // map refreshes every 5 s
  if (/\/arrival-times$/.test(apiPath)) return 15_000; // departures refresh every 30 s
  if (/\/schedule$/.test(apiPath)) return 60 * 60_000;
  return 6 * 60 * 60_000; // routes, stops, polylines: static for the day
}

/** Failures are cached briefly so an outage or a 520 is not retried by every client at once. */
export const TTC_ERROR_TTL_MS = 5_000;
export const TTC_RATE_LIMITED_TTL_MS = 15_000;

/** One process-wide pause across all TTC URLs. Successful in-flight requests
 * cannot cancel a pause raised by another request. Cache hits remain usable. */
export class TtcProxyCooldown {
  private until = 0;
  constructor(private readonly now: () => number = Date.now) {}

  observe(status: number, retryAfter: string | null) {
    if (status !== 429) return;
    const now = this.now();
    const raw = retryAfter?.trim() ?? '';
    const maximum = 100 * 366 * 86_400_000;
    let delay = 60_000;
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      delay = Math.min(maximum, Number(raw) * 1000);
    } else if (/[a-z]/i.test(raw)) {
      const date = Date.parse(raw);
      if (Number.isFinite(date)) delay = Math.min(maximum, Math.max(0, date - now));
    }
    this.until = Math.max(this.until, now + Math.max(60_000, delay));
  }

  remainingSeconds() {
    return Math.max(0, Math.ceil((this.until - this.now()) / 1000));
  }
}

type Entry = CachedTtcResponse & { expiresAt: number };

export class TtcProxyCache {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<CachedTtcResponse>>();
  private bytes = 0;

  constructor(
    private readonly options: { maxEntries: number; maxBytes: number; now?: () => number },
  ) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  /** A fresh entry and how many ms it stays fresh, or null. */
  peek(key: string): { response: CachedTtcResponse; remainingMs: number } | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const remainingMs = entry.expiresAt - this.now();
    if (remainingMs <= 0) {
      this.remove(key);
      return null;
    }
    return { response: entry, remainingMs };
  }

  /** The request already on its way upstream for this key, if any. */
  pending(key: string): Promise<CachedTtcResponse> | undefined {
    return this.inflight.get(key);
  }

  /** Runs `load` once for concurrent callers and stores the result for `ttlFor(result)` ms. */
  load(
    key: string,
    load: () => Promise<CachedTtcResponse>,
    ttlFor: (response: CachedTtcResponse) => number,
  ): Promise<CachedTtcResponse> {
    const running = this.inflight.get(key);
    if (running) return running;
    const promise = load()
      .then(response => {
        this.store(key, response, ttlFor(response));
        return response;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private store(key: string, response: CachedTtcResponse, ttlMs: number) {
    if (ttlMs <= 0 || response.body.byteLength > this.options.maxBytes / 4) return;
    this.remove(key);
    this.entries.set(key, { ...response, expiresAt: this.now() + ttlMs });
    this.bytes += response.body.byteLength;
    // Map keeps insertion order, so the first keys are the oldest writes.
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.options.maxEntries && this.bytes <= this.options.maxBytes) break;
      this.remove(oldest);
    }
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.body.byteLength;
    this.entries.delete(key);
  }

  get size() {
    return this.entries.size;
  }
}

/** Fixed one-minute windows per key: cheap, and good enough to stop a runaway client. */
export class MinuteRateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one request; returns the seconds to wait when over the limit, else 0. */
  hit(key: string): number {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.start >= 60_000) {
      if (this.windows.size > 10_000) this.prune(now);
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;
    return window.count > this.limit ? Math.max(1, Math.ceil((window.start + 60_000 - now) / 1000)) : 0;
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) {
      if (now - window.start >= 60_000) this.windows.delete(key);
    }
  }
}

/**
 * The client address as seen by our reverse proxy. The proxy appends the
 * address it accepted the connection from, so the last X-Forwarded-For entry
 * is the one a client cannot forge.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  const last = forwarded?.split(',').map(part => part.trim()).filter(Boolean).pop();
  return last || headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Limits for one server process. Generous for people, tight enough for scripts. */
export const TTC_PROXY_LIMITS = {
  /** Any request, cached or not, per client address. */
  clientRequestsPerMinute: 600,
  /** Requests that reach TTC, per client address. */
  clientUpstreamPerMinute: 120,
  /** Requests that reach TTC, from this server in total. */
  upstreamPerMinute: 1200,
};

function createState() {
  return {
    cooldown: new TtcProxyCooldown(),
    cache: new TtcProxyCache({ maxEntries: 2000, maxBytes: 64 * 1024 * 1024 }),
    clientRequests: new MinuteRateLimiter(TTC_PROXY_LIMITS.clientRequestsPerMinute),
    clientUpstream: new MinuteRateLimiter(TTC_PROXY_LIMITS.clientUpstreamPerMinute),
    upstream: new MinuteRateLimiter(TTC_PROXY_LIMITS.upstreamPerMinute),
  };
}

/** Process-wide proxy state; module scope survives between requests on the server. */
export let ttcProxyState = createState();

/** Tests only: start from an empty cache and fresh limits. */
export function resetTtcProxyState() {
  ttcProxyState = createState();
}
