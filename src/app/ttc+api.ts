import { TTC_BASE, TTC_API_KEY } from "@/services/ttc-endpoint";

/** Same-origin read access for the web app. This is not an arbitrary URL proxy. */
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(parsed, {
      headers: { "x-api-key": process.env.TTC_API_KEY ?? TTC_API_KEY },
      signal: controller.signal,
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "TTC is unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
