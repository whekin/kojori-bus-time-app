import Constants from 'expo-constants';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useSettings } from '@/hooks/use-settings';
import { reportUsage } from '@/services/usage-report';
import { gzaapApiUrl } from '@/transit/backend';

const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
const appVersion = Constants.expoConfig?.version ?? 'unknown';

/** Anonymous usage count (see src/services/usage-report.ts); off when the user turns it off. */
export function UsageReporter() {
  const { settings, isLoaded } = useSettings();
  const enabled = isLoaded && settings.shareUsageCount;

  useEffect(() => {
    if (!enabled) return;
    const report = () => { void reportUsage({ apiUrl: gzaapApiUrl, platform, appVersion }); };
    report();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') report();
    });
    return () => subscription.remove();
  }, [enabled]);

  return null;
}
