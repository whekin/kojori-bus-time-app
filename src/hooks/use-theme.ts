/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, resolveAppThemeMode } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSettings } from '@/hooks/use-settings';

export function useTheme() {
  const scheme = useColorScheme();
  const { settings } = useSettings();
  const theme = resolveAppThemeMode(settings.themeMode, scheme);

  return Colors[theme];
}
