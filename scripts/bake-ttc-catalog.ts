import { resolve } from "node:path";
import { TTC_BASE, TTC_API_KEY } from "../src/services/ttc-endpoint";

const response = await fetch(`${TTC_BASE}/v3/routes?locale=en`, {
  headers: { "x-api-key": process.env.TTC_API_KEY ?? TTC_API_KEY },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok)
  throw new Error(`TTC catalog returned HTTP ${response.status}`);
const routes = await response.json();
if (
  !Array.isArray(routes) ||
  !routes.length ||
  routes.some((route) => !route.id || !route.shortName || !route.mode)
) {
  throw new Error(
    "TTC returned an invalid catalog; the saved asset was not changed.",
  );
}
const output =
  process.argv[2] ?? resolve(import.meta.dir, "../assets/ttc-routes.json");
await Bun.write(
  output,
  JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), routes }) +
    "\n",
);
console.log(`Saved ${routes.length} TTC routes to ${output}`);
