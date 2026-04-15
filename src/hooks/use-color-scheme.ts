import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';

export function useColorScheme() {
  return useRNColorScheme() ?? Appearance.getColorScheme() ?? 'light';
}
