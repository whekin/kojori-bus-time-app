import { useMemo } from 'react';

import { LANGUAGE_OPTIONS, resolveLanguage, ttcLocaleForLanguage, type AppLanguage, type ResolvedLanguage } from '@/i18n/languages';
import { localizedStopName, localizedStopNames } from '@/i18n/stop-names';
import { translate, type TranslationKey } from '@/i18n/translations';
import { useSettings } from '@/hooks/use-settings';
import type { StopInfo } from '@/services/ttc';

type Params = Record<string, string | number>;

export function useI18n() {
  const { settings, update } = useSettings();
  const resolvedLanguage = resolveLanguage(settings.language);

  return useMemo(() => {
    function t(key: TranslationKey, params?: Params) {
      return translate(resolvedLanguage, key, params);
    }

    function setLanguage(language: AppLanguage) {
      update({ language });
    }

    function getStopName(stopOrId: Pick<StopInfo, 'id' | 'label'> | string, fallback?: string) {
      return localizedStopName(stopOrId, resolvedLanguage, fallback);
    }

    return {
      language: settings.language,
      resolvedLanguage,
      languageOptions: LANGUAGE_OPTIONS,
      t,
      setLanguage,
      localizedStopName: getStopName,
      localizedStopNames: (source?: Record<string, string>) => localizedStopNames(resolvedLanguage, source),
      ttcLocale: ttcLocaleForLanguage(resolvedLanguage),
    };
  }, [resolvedLanguage, settings.language, update]);
}

export { resolveLanguage, ttcLocaleForLanguage };
export type { AppLanguage, ResolvedLanguage, TranslationKey };
