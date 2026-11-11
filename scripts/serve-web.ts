import { createRequestHandler } from 'expo-server/adapter/bun';
import { resolve, sep } from 'node:path';

const client = resolve('dist/client');
const handler = createRequestHandler({ build: resolve('dist/server') });
const server = Bun.serve({
  port: Number(process.env.PORT ?? 8081),
  async fetch(request) {
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('Bad request', { status: 400 }); }
    const path = resolve(client, '.' + pathname);
    if (!path.startsWith(client + sep)) return handler(request);
    const file = Bun.file(path);
    if (await file.exists()) {
      return new Response(file, { headers: {
        'Cache-Control': 'no-cache',
        ...(pathname === '/sw.js' ? { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/' } : {}),
        ...(pathname === '/manifest.webmanifest' ? { 'Content-Type': 'application/manifest+json' } : {}),
      } });
    }
    return handler(request);
  },
});
console.log(`Web app: ${server.url}`);
