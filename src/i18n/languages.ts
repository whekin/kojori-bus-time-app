import { getLocales } from 'expo-localization';

export type AppLanguage = 'system' | 'en' | 'ka' | 'ru';
export type ResolvedLanguage = Exclude<AppLanguage, 'system'>;

export const SUPPORTED_LANGUAGES: ResolvedLanguage[] = ['en', 'ka', 'ru'];

export const LANGUAGE_OPTIONS: { value: AppLanguage; label: string; caption: string }[] = [
  { value: 'system', label: 'System', caption: 'Follow device language' },
  { value: 'en', label: 'English', caption: 'English' },
  { value: 'ka', label: 'ქართული', caption: 'Georgian' },
  { value: 'ru', label: 'Русский', caption: 'Russian' },
];

function normalizeLanguageCode(value: string | null | undefined): ResolvedLanguage | null {
  const code = value?.split(/[-_]/)[0]?.toLowerCase();
  if (code === 'ka' || code === 'ru' || code === 'en') return code;
  return null;
}

export function getDeviceLanguage(): ResolvedLanguage {
  const locales = getLocales();
  for (const locale of locales) {
    const resolved = normalizeLanguageCode(locale.languageCode ?? locale.languageTag);
    if (resolved) return resolved;
  }
  return 'en';
}

export function resolveLanguage(language: AppLanguage): ResolvedLanguage {
  if (language === 'system') return getDeviceLanguage();
  return language;
}

export function ttcLocaleForLanguage(language: ResolvedLanguage): 'en' | 'ka' {
  return language === 'ka' ? 'ka' : 'en';
}
