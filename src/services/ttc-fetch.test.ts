// @ts-expect-error Bun provides the test module at runtime.
import { afterEach, expect, it } from "bun:test";

import { getTtcHealthSnapshot } from "@/hooks/use-ttc-health";
import { fetchTtcJson } from "@/services/ttc";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

it("does not count a request the app cancelled as a TTC failure", async () => {
  const controller = new AbortController();
  globalThis.fetch = ((_: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
      );
    })) as typeof fetch;
  const before = getTtcHealthSnapshot().lastFailureAt;
  const request = fetchTtcJson("https://example.test/x", "catalog", controller.signal);
  controller.abort();
  await expect(request).rejects.toThrow("Aborted");
  expect(getTtcHealthSnapshot().lastFailureAt).toBe(before);
});

it("still counts a network error as a TTC failure", async () => {
  globalThis.fetch = (() => Promise.reject(new TypeError("Network request failed"))) as typeof fetch;
  await expect(fetchTtcJson("https://example.test/x", "catalog")).rejects.toThrow();
  expect(getTtcHealthSnapshot().lastFailureAt).not.toBeNull();
});
