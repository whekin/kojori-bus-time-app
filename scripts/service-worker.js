/* Build placeholders are replaced by build-pwa.ts. Never cache API responses. */
/* global __PRECACHE_ASSETS__, __BASE__ */
const CACHE = 'gzaap-app-__BUILD_ID__';
const BASE = __BASE__;
const ASSETS = __PRECACHE_ASSETS__;
// Document keys are normalized without a trailing slash: `/app/` → `/app`.
const PAGES = ['', '/explore', '/timetable', '/settings'].map(page => BASE + page || '/');
// Caches from this worker's earlier builds, and from the old root-scoped
// worker that served the app at `/` before it moved under BASE.
const OWNED_CACHES = ['gzaap-app-', 'kojoring-shell-'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Include lazy chunks, fonts and documents, not just the first screen.
      await cache.addAll([...ASSETS, ...PAGES].map(url => new Request(url, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    // Take over as soon as the new build is fully cached. Waiting for every
    // window to close meant a Home Screen app, which iOS rarely terminates,
    // could stay on an old build for days.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  const activation = (async () => {
    let replacedBuild = false;
    for (const name of await caches.keys()) {
      if (OWNED_CACHES.some(prefix => name.startsWith(prefix)) && name !== CACHE) {
        await caches.delete(name);
        replacedBuild = true;
      }
    }
    await self.clients.claim();
    return replacedBuild;
  })();
  event.waitUntil(activation);
  // Open windows still run the previous build's scripts, whose lazy chunks
  // are gone from the new cache and the server, so they reload onto this
  // build; trips and settings live in storage. This must run after
  // activation settles: fetches wait for an activating worker, so a reload
  // awaited inside waitUntil would deadlock the page on "Loading".
  // A first install has nothing stale to replace and leaves the page alone.
  void activation.then(async replacedBuild => {
    if (!replacedBuild) return;
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      client.navigate(client.url).catch(() => {});
    }
  });
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  const isPage = request.mode === 'navigate' && PAGES.includes(pathname);
  if (!isPage && !ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(isPage ? pathname : url.pathname)) ?? fetch(request);
  })());
});
