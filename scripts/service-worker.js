/* Build placeholders are replaced by build-pwa.ts. Never cache API responses. */
/* global __PRECACHE_ASSETS__ */
const CACHE = 'kojoring-shell-__BUILD_ID__';
const ASSETS = __PRECACHE_ASSETS__;
const PAGES = ['/', '/explore', '/timetable', '/settings'];

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
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // No skipWaiting: existing windows retain a coherent build until closed.
    for (const name of await caches.keys()) {
      if (name.startsWith('kojoring-shell-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
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
