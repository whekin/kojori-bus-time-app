// @ts-expect-error Bun provides the test module at runtime.
import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { GET } from "@/app/ttc+api";
const originalFetch = globalThis.fetch;
const originalToken = process.env.GZAAP_GATEWAY_TOKEN;
beforeEach(() => { process.env.GZAAP_GATEWAY_TOKEN = "test-gateway-token"; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.GZAAP_GATEWAY_TOKEN;
  else process.env.GZAAP_GATEWAY_TOKEN = originalToken;
});

it("rejects arbitrary destinations, unlisted TTC endpoints and unexpected query parameters", async () => {
  const fetcher = mock(async () => Response.json({}));
  globalThis.fetch = fetcher as typeof fetch;
  for (const path of [
    "https://example.com/",
    "/v3/users",
    "/v3/routes?token=private",
    "/v3/routes/../../admin",
    "//evil.example/v3/routes",
  ]) {
    const response = await GET(
      new Request(`http://localhost/ttc?path=${encodeURIComponent(path)}`),
    );
    expect(response.status).toBe(400);
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it("forwards only a public TTC read with server authentication and preserves upstream errors", async () => {
  let destination = "";
  let authenticated = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    destination = String(input);
    authenticated = new Headers(init?.headers).get("Authorization") === "Bearer test-gateway-token";
    return Response.json({ error: "limited" }, { status: 520 });
  }) as typeof fetch;
  const path = "/v3/routes/1%3AR216088?locale=en";
  const response = await GET(
    new Request(`http://localhost/ttc?path=${encodeURIComponent(path)}`),
  );
  expect(new URL(destination).origin).toBe("https://gzaap-api.whekin.dev");
  expect(new URL(destination).pathname).toBe("/internal/ttc");
  expect(new URL(destination).searchParams.get("path")).toBe(path);
  expect(authenticated).toBe(true);
  expect(response.status).toBe(520);
  expect(await response.json()).toEqual({ error: "limited" });
});

it("never falls back to direct TTC without gateway credentials", async () => {
  delete process.env.GZAAP_GATEWAY_TOKEN;
  const fetcher = mock(async () => Response.json({}));
  globalThis.fetch = fetcher as typeof fetch;
  const response = await GET(new Request("http://localhost/ttc?path=/v3/routes"));
  expect(response.status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
it("preserves the shared cooldown without retrying or caching it", async () => {
  const fetcher = mock(async () => Response.json({error:"ttc_budget_paused"},{status:429,headers:{"Retry-After":"900"}}));
  globalThis.fetch = fetcher as typeof fetch;
  const response = await GET(new Request("http://localhost/ttc?path=/v3/routes"));
  expect(response.status).toBe(429);expect(response.headers.get("retry-after")).toBe("900");
  expect(response.headers.get("cache-control")).toBe("no-store");expect(fetcher).toHaveBeenCalledTimes(1);
});
