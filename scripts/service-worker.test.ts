import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker(failInstall = false, existingCaches = ['gzaap-app-old', 'gzaap-app-test', 'unrelated-cache']) {
  const handlers: Record<string, (event: any) => void> = {};
  const deleted: string[] = [];
  const cached: string[] = [];
  const reloaded: string[] = [];
  let skippedWaiting = false;
  const code = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
    .replace('__BUILD_ID__', 'test').replace('__BASE__;', '"/app";')
    .replace('__PRECACHE_ASSETS__;', '["/app/app.js"];');
  runInNewContext(code, {
    URL,
    Request: class { constructor(public url: string) {} },
    self: {
      location: { origin: 'https://app.test' },
      skipWaiting: async () => { skippedWaiting = true; },
      clients: {
        claim: async () => {},
        matchAll: async () => [
          { url: 'https://app.test/app/explore', navigate: async (url: string) => { reloaded.push(url); } },
        ],
      },
      addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
    },
    caches: {
      open: async () => ({
        addAll: async (requests: { url: string }[]) => {
          if (failInstall) throw new Error('network unavailable');
          cached.push(...requests.map(request => request.url));
        },
        match: async (url: string) => `cached:${url}`,
      }),
      keys: async () => existingCaches,
      delete: async (name: string) => { deleted.push(name); },
    },
    fetch: () => { throw new Error('offline'); },
  });
  async function lifecycle(name: string) {
    let result: Promise<void> | undefined;
    handlers[name]({ waitUntil: (promise: Promise<void>) => { result = promise; } });
    await result;
  }
  function request(path: string, mode = 'cors', method = 'GET') {
    let result: Promise<string> | undefined;
    handlers.fetch({ request: { url: new URL(path, 'https://app.test').href, mode, method },
      respondWith: (promise: Promise<string>) => { result = promise; } });
    return result;
  }
  return { lifecycle, request, cached, deleted, reloaded, skipped: () => skippedWaiting };
}

test('prepares every screen and lazy asset for offline startup', async () => {
  const app = worker();
  await app.lifecycle('install');
  expect(app.cached).toEqual(['/app/app.js', '/app', '/app/explore', '/app/timetable', '/app/settings']);
  expect(await app.request('/app/', 'navigate')).toBe('cached:/app');
  expect(await app.request('/app/timetable/?day=tomorrow', 'navigate')).toBe('cached:/app/timetable');
  expect(await app.request('/app/app.js')).toBe('cached:/app/app.js');
});

test('never intercepts live API data, external maps, mutations or unknown pages', () => {
  const app = worker();
  for (const path of ['/app/ttc?path=/v2/stops/1/arrival-times', 'https://tile.openstreetmap.org/1.png', '/app/unknown', '/', '/privacy']) {
    expect(app.request(path, 'navigate')).toBeUndefined();
  }
  expect(app.request('/app/app.js', 'cors', 'POST')).toBeUndefined();
});

test('failed installation discards its partial cache; activation preserves other apps', async () => {
  const failed = worker(true);
  await expect(failed.lifecycle('install')).rejects.toThrow('network unavailable');
  expect(failed.deleted).toEqual(['gzaap-app-test']);
  const app = worker();
  await app.lifecycle('activate');
  expect(app.deleted).toEqual(['gzaap-app-old']);
});

test('activation also clears the caches of the old worker that served the app at /', async () => {
  const app = worker(false, ['kojoring-shell-123', 'gzaap-app-test', 'unrelated-cache']);
  await app.lifecycle('activate');
  expect(app.deleted).toEqual(['kojoring-shell-123']);
});

test('a new build takes over once cached and reloads windows still on the old one', async () => {
  const app = worker();
  await app.lifecycle('install');
  expect(app.skipped()).toBe(true);
  await app.lifecycle('activate');
  // Reloads start only once activation has settled.
  expect(app.reloaded).toEqual([]);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(app.reloaded).toEqual(['https://app.test/app/explore']);
});

test('a failed install never takes over; a first install reloads nothing', async () => {
  const failed = worker(true);
  await expect(failed.lifecycle('install')).rejects.toThrow('network unavailable');
  expect(failed.skipped()).toBe(false);
  const first = worker(false, ['gzaap-app-test']);
  await first.lifecycle('activate');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(first.reloaded).toEqual([]);
});

test('the root worker retires the old app worker and reloads its windows from the network', async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const deleted: string[] = [];
  const reloaded: string[] = [];
  let unregistered = false;
  let skippedWaiting = false;
  runInNewContext(readFileSync(new URL('../site/sw.js', import.meta.url), 'utf8'), {
    self: {
      skipWaiting: () => { skippedWaiting = true; },
      registration: { unregister: async () => { unregistered = true; return true; } },
      clients: { matchAll: async () => [{ url: 'https://app.test/', navigate: async (url: string) => { reloaded.push(url); } }] },
      addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
    },
    caches: {
      keys: async () => ['kojoring-shell-old', 'gzaap-app-current', 'unrelated-cache'],
      delete: async (name: string) => { deleted.push(name); },
    },
  });
  expect(handlers.fetch).toBeUndefined();
  handlers.install({});
  expect(skippedWaiting).toBe(true);
  let activation: Promise<void> | undefined;
  handlers.activate({ waitUntil: (promise: Promise<void>) => { activation = promise; } });
  await activation;
  expect(deleted).toEqual(['kojoring-shell-old']);
  expect(unregistered).toBe(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(reloaded).toEqual(['https://app.test/']);
});
