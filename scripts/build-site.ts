/**
 * Builds the static landing site into dist/site: copies site/ and renders the
 * English template (site/index.html) once per language — `/`, `/ka/`, `/ru/` —
 * so every language is a real, indexable page. Text comes from the
 * data-i18n* attributes and scripts/site-strings.ts.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SITE_STRINGS, type SiteLanguage } from './site-strings';

const ORIGIN = 'https://gzaap.whekin.dev';
const LANGUAGES = ['en', 'ka', 'ru'] as const;
type Language = (typeof LANGUAGES)[number];
const pagePath = (lang: Language) => (lang === 'en' ? '/' : `/${lang}/`);

const out = resolve('dist/site');
const template = await readFile(resolve('site/index.html'), 'utf8');

/** Every key the template asks for, so a missing translation fails the build. */
export function templateKeys(html: string): Set<string> {
  return new Set([...html.matchAll(/data-i18n(?:-html|-alt|-content|-label)?="([^"]+)"/g)].map(match => match[1]));
}

function render(lang: Language): string {
  const strings = lang === 'en' ? null : SITE_STRINGS[lang as SiteLanguage];
  const text = (key: string | null) => {
    if (!strings || !key) return null;
    const value = strings[key];
    if (value == null) throw new Error(`Missing ${lang} landing string "${key}"`);
    return value;
  };
  const url = ORIGIN + pagePath(lang);
  return new HTMLRewriter()
    .on('html', { element: el => { el.setAttribute('lang', lang); } })
    .on('[data-i18n]', { element: el => {
      const value = text(el.getAttribute('data-i18n'));
      if (value != null) el.setInnerContent(value);
    } })
    .on('[data-i18n-html]', { element: el => {
      const value = text(el.getAttribute('data-i18n-html'));
      if (value != null) el.setInnerContent(value, { html: true });
    } })
    .on('[data-i18n-alt]', { element: el => {
      const value = text(el.getAttribute('data-i18n-alt'));
      if (value != null) el.setAttribute('alt', value);
    } })
    .on('[data-i18n-content]', { element: el => {
      const value = text(el.getAttribute('data-i18n-content'));
      if (value != null) el.setAttribute('content', value);
    } })
    .on('[data-i18n-label]', { element: el => {
      const value = text(el.getAttribute('data-i18n-label'));
      if (value != null) el.setAttribute('aria-label', value);
    } })
    .on('link[rel="canonical"]', { element: el => { el.setAttribute('href', url); } })
    .on('meta[property="og:url"]', { element: el => { el.setAttribute('content', url); } })
    // App screenshots are taken in each language: /img/screens/<lang>/….
    .on('[data-localize]', { element: el => {
      for (const attr of ['src', 'srcset']) {
        const value = el.getAttribute(attr);
        if (value) el.setAttribute(attr, value.replace('/img/screens/en/', `/img/screens/${lang}/`));
      }
      el.removeAttribute('data-localize');
    } })
    .on('[data-home]', { element: el => { el.setAttribute('href', pagePath(lang)); } })
    .on('[data-lang]', { element: el => {
      if (el.getAttribute('data-lang') === lang) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    } })
    .transform(template);
}

if (import.meta.main) {
  const keys = templateKeys(template);
  for (const lang of ['ka', 'ru'] as const) {
    const missing = [...keys].filter(key => !(key in SITE_STRINGS[lang]));
    const unused = Object.keys(SITE_STRINGS[lang]).filter(key => !keys.has(key));
    if (missing.length || unused.length) {
      throw new Error(`Landing strings out of sync for ${lang}: missing ${missing.join(', ') || 'none'}; unused ${unused.join(', ') || 'none'}`);
    }
  }
  await rm(out, { recursive: true, force: true });
  await cp(resolve('site'), out, { recursive: true });
  for (const lang of LANGUAGES) {
    const dir = resolve(out, '.' + pagePath(lang));
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'index.html'), render(lang));
  }
  console.log(`Landing site ready: ${LANGUAGES.map(pagePath).join(', ')}`);
}
