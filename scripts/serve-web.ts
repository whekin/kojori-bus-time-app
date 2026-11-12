import { createRequestHandler } from 'expo-server/adapter/bun';
import { resolve, sep } from 'node:path';

// The app is exported with `experiments.baseUrl` = BASE, so its own routes and
// files are addressed without the prefix inside dist/. The landing page in
// dist/site owns everything else.
const BASE = '/app';
const client = resolve('dist/client');
const site = resolve('dist/site');
const handler = createRequestHandler({ build: resolve('dist/server') });

// Where the app lived before it moved under BASE; old links and bookmarks.
const LEGACY_APP_PAGES = new Set(['/explore', '/timetable', '/settings']);

function staticFile(root: string, pathname: string) {
  if (pathname.endsWith('/')) return null;
  const path = resolve(root, '.' + pathname);
  return path === root || path.startsWith(root + sep) ? Bun.file(path) : null;
}

async function serveFile(root: string, pathname: string, headers: Record<string, string> = {}) {
  const file = staticFile(root, pathname);
  if (!file || !(await file.exists())) return null;
  return new Response(file, { headers: { 'Cache-Control': 'no-cache', ...headers } });
}

function forwardToApp(request: Request, url: URL, pathname: string) {
  url.pathname = pathname;
  return handler(new Request(url, request));
}

async function serveSite(pathname: string) {
  // `/privacy` and `/privacy/` both serve site/privacy/index.html.
  const page = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  return await serveFile(site, page)
    ?? (pathname.includes('.') ? null : await serveFile(site, `${pathname}/index.html`))
    ?? await serveFile(site, '/404.html').then(response => response && new Response(response.body, {
      status: 404, headers: response.headers,
    }))
    ?? new Response('Not found', { status: 404 });
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 8081),
  async fetch(request) {
    const url = new URL(request.url);
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return new Response('Bad request', { status: 400 }); }

    if (pathname === BASE || pathname.startsWith(BASE + '/')) {
      const inner = pathname.slice(BASE.length) || '/';
      if (inner === '/sw.js') {
        return await serveFile(client, inner, { 'Content-Type': 'application/javascript' }) ?? handler(request);
      }
      if (inner === '/manifest.webmanifest') {
        return await serveFile(client, inner, { 'Content-Type': 'application/manifest+json' }) ?? handler(request);
      }
      return await serveFile(client, inner) ?? forwardToApp(request, url, url.pathname.slice(BASE.length) || '/');
    }

    // Web builds cached before the move still call the proxy at the root.
    if (pathname === '/ttc') return forwardToApp(request, url, '/ttc');
    if (LEGACY_APP_PAGES.has(pathname.replace(/\/$/, ''))) {
      return Response.redirect(new URL(`${BASE}${pathname.replace(/\/$/, '')}${url.search}`, url), 301);
    }
    if (pathname === '/sw.js') {
      // Replaces the worker that used to serve the app at `/` (see site/sw.js).
      return await serveFile(site, pathname, { 'Content-Type': 'application/javascript' })
        ?? new Response('Not found', { status: 404 });
    }
    return serveSite(pathname);
  },
});
console.log(`Web app: ${server.url}`);
