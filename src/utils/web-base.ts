/**
 * Path prefix of the web app. Production web builds live under `/app` (the
 * landing page owns `/`, see `site/`); dev servers and native builds use none.
 * Expo inlines `EXPO_BASE_URL` from `experiments.baseUrl` at build time.
 */
export const WEB_BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');

export function webPath(path: string): string {
  return `${WEB_BASE}${path}`;
}
