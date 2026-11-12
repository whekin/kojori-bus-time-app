/*
 * Retires the service worker that served the app at `/` before it moved to
 * `/app` (the landing page now owns `/`). Browsers that still run the old
 * worker fetch this file on their next update check: it clears the old
 * caches, unregisters itself and reloads open windows from the network.
 * The app's own worker lives at /app/sw.js.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  const cleanup = (async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('kojoring-shell-')) await caches.delete(name);
    }
    await self.registration.unregister();
  })();
  event.waitUntil(cleanup);
  // Reload after activation settles; awaiting it inside waitUntil deadlocks.
  void cleanup.then(async () => {
    for (const client of await self.clients.matchAll({ type: 'window' })) {
      client.navigate(client.url).catch(() => {});
    }
  });
});
