import { TTC_BASE, TTC_API_KEY } from "@/services/ttc-endpoint";
import {
  TTC_ERROR_TTL_MS,
  TTC_RATE_LIMITED_TTL_MS,
  clientAddress,
  ttcCacheTtlMs,
  ttcProxyState,
  type CachedTtcResponse,
} from "@/services/ttc-proxy-cache";

/**
 * Same-origin read access to TTC for the web app and the landing page. This is
 * not an arbitrary URL proxy: only the public reads the app makes are allowed.
 * Answers are shared between clients for a short time and upstream requests
 * are rate-limited (see src/services/ttc-proxy-cache.ts), so the number of
 * visitors does not decide how hard we hit TTC.
 */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(`${TTC_BASE}${path}`);
  } catch {
    return Response.json({ error: "Invalid TTC path" }, { status: 400 });
  }
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(
      parsed.pathname.slice(new URL(TTC_BASE).pathname.length),
    );
  } catch {
    return Response.json({ error: "Invalid TTC path" }, { status: 400 });
  }
  const route =
    /^\/v3\/routes(?:\/[A-Za-z0-9:_-]+(?:\/(?:schedule|stops-of-patterns|polylines|positions))?)?$/;
  const arrivals = /^\/v2\/stops\/[A-Za-z0-9:_-]+\/(?:arrival-times|routes)$/;
  const allowedParams = new Set([
    "locale",
    "modes",
    "patternSuffix",
    "patternSuffixes",
    "ignoreScheduledArrivalTimes",
  ]);
  if (
    !path.startsWith("/") ||
    parsed.origin !== new URL(TTC_BASE).origin ||
    parsed.hash ||
    (!route.test(decodedPath) && !arrivals.test(decodedPath)) ||
    [...parsed.searchParams.keys()].some((key) => !allowedParams.has(key))
  ) {
    return Response.json({ error: "Unsupported TTC request" }, { status: 400 });
  }

  const state = ttcProxyState;
  const client = clientAddress(request.headers);
  const busy = state.clientRequests.hit(client);
  if (busy) return tooMany(busy, 429);

  const key = parsed.href;
  const cached = state.cache.peek(key);
  if (cached) return reply(cached.response, cached.remainingMs, "HIT");

  // Someone else is already asking TTC the same thing: wait for that answer.
  const pending = state.cache.pending(key);
  if (pending) return reply(await pending, ttlFor(decodedPath, await pending), "SHARED");

  const cooldown = state.cooldown.remainingSeconds();
  if (cooldown) return tooMany(cooldown, 429);

  const clientWait = state.clientUpstream.hit(client);
  if (clientWait) return tooMany(clientWait, 429);
  const serverWait = state.upstream.hit("all");
  if (serverWait) return tooMany(serverWait, 503);

  const response = await state.cache.load(
    key,
    () => fetchUpstream(parsed),
    (result) => ttlFor(decodedPath, result),
  );
  return reply(response, ttlFor(decodedPath, response), "MISS");
}

function ttlFor(apiPath: string, response: CachedTtcResponse) {
  if (response.status >= 200 && response.status < 300) return ttcCacheTtlMs(apiPath);
  // 520 is an upstream failure, not proof of rate limiting.
  if (response.status === 520 || response.status === 429) return TTC_RATE_LIMITED_TTL_MS;
  return TTC_ERROR_TTL_MS;
}

async function fetchUpstream(url: URL): Promise<CachedTtcResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(url, {
      headers: { "x-api-key": process.env.TTC_API_KEY ?? TTC_API_KEY },
      signal: controller.signal,
    });
    // Observe headers immediately: a slow body must not delay the shared pause.
    ttcProxyState.cooldown.observe(upstream.status, upstream.headers.get("retry-after"));
    return {
      status: upstream.status,
      contentType: upstream.headers.get("content-type") ?? "application/json",
      body: await upstream.arrayBuffer(),
    };
  } catch {
    return {
      status: 502,
      contentType: "application/json",
      body: new TextEncoder().encode(JSON.stringify({ error: "TTC is unavailable" })).buffer as ArrayBuffer,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function reply(response: CachedTtcResponse, freshMs: number, cache: string) {
  const ok = response.status >= 200 && response.status < 300;
  return new Response(response.body.slice(0), {
    status: response.status,
    headers: {
      "Content-Type": response.contentType,
      // Browsers may reuse a fresh answer for as long as we would.
      "Cache-Control": ok ? `public, max-age=${Math.max(0, Math.floor(freshMs / 1000))}` : "no-store",
      "X-Cache": cache,
      ...(response.status === 429 ? { "Retry-After": String(Math.max(1, ttcProxyState.cooldown.remainingSeconds())) } : {}),
    },
  });
}

function tooMany(retryAfterSeconds: number, status: 429 | 503) {
  return Response.json(
    { error: "Too many TTC requests, try again shortly" },
    {
      status,
      headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" },
    },
  );
}
