/**
 * maplibre-gl 6 parses tiles in a separate module worker that Metro does not
 * bundle. Copy it into `public/` under a versioned name: Expo serves and
 * exports `public/`, the PWA precaches it with the rest of the client, and
 * the version in the name keeps a browser from pairing a stale worker with a
 * newer main thread. `geo-map.web.tsx` points maplibre at the same path.
 */
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const pkg = await Bun.file('node_modules/maplibre-gl/package.json').json();
const target = resolve('public/maplibre');
const name = `maplibre-gl-worker-${pkg.version}.mjs`;

await mkdir(target, { recursive: true });
for (const file of await readdir(target)) {
  if (file !== name) await rm(resolve(target, file));
}
await copyFile(resolve('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'), resolve(target, name));
console.log(`maplibre worker ready: public/maplibre/${name}`);
