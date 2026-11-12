// @ts-expect-error Bun provides the test module at runtime.
import { afterEach, expect, it, mock } from "bun:test";
import { GET } from "@/app/ttc+api";
import { resetTtcProxyState } from "@/services/ttc-proxy-cache";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetTtcProxyState();
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
    authenticated = Boolean(new Headers(init?.headers).get("x-api-key"));
    return Response.json({ error: "limited" }, { status: 520 });
  }) as typeof fetch;
  const path = "/v3/routes/1%3AR216088?locale=en";
  const response = await GET(
    new Request(`http://localhost/ttc?path=${encodeURIComponent(path)}`),
  );
  expect(destination).toBe(`https://transit.ttc.com.ge/pis-gateway/api${path}`);
  expect(authenticated).toBe(true);
  expect(response.status).toBe(520);
  expect(await response.json()).toEqual({ error: "limited" });
});
