import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

// Must match the `experiments.baseUrl` the export ran with (see web:build).
const base = (process.env.GZAAP_WEB_BASE_URL ?? '').replace(/\/+$/, '');
const client = resolve('dist/client');
const server = resolve('dist/server');
async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)]))).flat().sort();
}
const assets = (await files(client)).filter(file => !file.endsWith('.map') && !file.endsWith('/sw.js'));
const template = await readFile('scripts/service-worker.js', 'utf8');
const hash = createHash('sha256').update(template).update(base);
// Server output changes also invalidate the cached HTML documents.
for (const file of [...assets, ...await files(server)]) {
  hash.update(relative(resolve('dist'), file)).update(await readFile(file));
}
const worker = template.replace('__BUILD_ID__', hash.digest('hex').slice(0, 20))
  .replace('const BASE = __BASE__;', `const BASE = ${JSON.stringify(base)};`)
  .replace('const ASSETS = __PRECACHE_ASSETS__;', `const ASSETS = ${JSON.stringify(assets.map(file => `${base}/${relative(client, file)}`))};`);
await writeFile(resolve(client, 'sw.js'), worker);
console.log(`PWA ready under ${base || '/'}: ${assets.length} assets plus four app pages.`);
