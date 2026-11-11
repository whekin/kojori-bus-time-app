import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker(failInstall = false) {
  const handlers: Record<string, (event: any) => void> = {};
  const deleted: string[] = [];
  const cached: string[] = [];
  const code = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
    .replace('__BUILD_ID__', 'test').replace('__PRECACHE_ASSETS__;', '["/app.js"];');
  runInNewContext(code, {
    URL,
    Request: class { constructor(public url: string) {} },
    self: {
      location: { origin: 'https://app.test' },
      clients: { claim: async () => {} },
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
      keys: async () => ['kojoring-shell-old', 'kojoring-shell-test', 'unrelated-cache'],
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
  return { lifecycle, request, cached, deleted };
}

test('prepares every screen and lazy asset for offline startup', async () => {
  const app = worker();
  await app.lifecycle('install');
  expect(app.cached).toEqual(['/app.js', '/', '/explore', '/timetable', '/settings']);
  expect(await app.request('/timetable/?day=tomorrow', 'navigate')).toBe('cached:/timetable');
  expect(await app.request('/app.js')).toBe('cached:/app.js');
});

test('never intercepts live API data, external maps, mutations or unknown pages', () => {
  const app = worker();
  for (const path of ['/ttc?path=/v2/stops/1/arrival-times', 'https://tile.openstreetmap.org/1.png', '/unknown']) {
    expect(app.request(path, 'navigate')).toBeUndefined();
  }
  expect(app.request('/app.js', 'cors', 'POST')).toBeUndefined();
});

test('failed installation discards its partial cache; activation preserves other apps', async () => {
  const failed = worker(true);
  await expect(failed.lifecycle('install')).rejects.toThrow('network unavailable');
  expect(failed.deleted).toEqual(['kojoring-shell-test']);
  const app = worker();
  await app.lifecycle('activate');
  expect(app.deleted).toEqual(['kojoring-shell-old']);
});
