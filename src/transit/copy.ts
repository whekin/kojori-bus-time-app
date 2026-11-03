import { useI18n } from "@/hooks/use-i18n";
import { transitCopy, type TransitCopyKey } from "./copy-values";

export function useTransitCopy() {
  const { resolvedLanguage } = useI18n();
  const values = transitCopy[resolvedLanguage];
  return (key: TransitCopyKey, params: Record<string, number | string> = {}) =>
    values[key].replace(/\{(\w+)\}/g, (_, name) =>
      String(params[name] ?? `{${name}}`),
    );
}
