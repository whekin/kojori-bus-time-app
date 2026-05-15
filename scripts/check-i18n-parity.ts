import { translations } from '../src/i18n/translations';

type Locale = keyof typeof translations;

const baseLocale: Locale = 'en';
const locales = Object.keys(translations) as Locale[];
const baseKeys = Object.keys(translations[baseLocale]).sort();
const errors: string[] = [];

function placeholderNames(value: string) {
  return [...value.matchAll(/\{(\w+)\}/g)]
    .map(match => match[1])
    .sort();
}

function describeList(values: string[]) {
  return values.length > 0 ? values.join(', ') : 'none';
}

for (const locale of locales) {
  const localeKeys = Object.keys(translations[locale]).sort();
  const baseKeySet = new Set(baseKeys);
  const localeKeySet = new Set(localeKeys);
  const missing = baseKeys.filter(key => !localeKeySet.has(key));
  const extra = localeKeys.filter(key => !baseKeySet.has(key));

  if (missing.length > 0) {
    errors.push(`${locale}: missing keys: ${describeList(missing)}`);
  }

  if (extra.length > 0) {
    errors.push(`${locale}: extra keys: ${describeList(extra)}`);
  }

  for (const key of baseKeys) {
    const baseValue = translations[baseLocale][key as keyof typeof translations.en];
    const localeValue = translations[locale][key as keyof typeof translations.en];
    if (!localeValue) continue;

    const basePlaceholders = placeholderNames(baseValue).join('|');
    const localePlaceholders = placeholderNames(localeValue).join('|');
    if (basePlaceholders !== localePlaceholders) {
      errors.push(
        `${locale}.${key}: placeholders differ (en: ${basePlaceholders || 'none'}, ${locale}: ${localePlaceholders || 'none'})`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`i18n parity failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`i18n parity OK: ${locales.join(', ')} share ${baseKeys.length} keys and matching placeholders.`);
