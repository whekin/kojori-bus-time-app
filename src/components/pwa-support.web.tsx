import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Fonts, Spacing } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';

export function PwaSupport() {
  useEffect(() => {
    if (__DEV__ || !('serviceWorker' in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(value => { registration = value; })
      .catch(error => console.warn('Offline app setup failed', error));
    const check = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  return null;
}

export function PwaInstallCard() {
  const colors = useAppColors();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    const update = () => setVisible(!mode.matches &&
      !(navigator as Navigator & { standalone?: boolean }).standalone);
    update();
    mode.addEventListener('change', update);
    return () => mode.removeEventListener('change', update);
  }, []);
  if (!visible) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('pwaInstallTitle')}</Text>
      <Text style={[styles.copy, { color: colors.textDim }]}>{t('pwaInstallInstructions')}</Text>
      <Text style={[styles.copy, { color: colors.textDim }]}>{t('pwaInstallNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, gap: Spacing.two, borderWidth: 1, borderRadius: 18, marginBottom: Spacing.four },
  title: { fontFamily: Fonts.serif, fontSize: 21 },
  copy: { fontSize: 14, lineHeight: 21 },
});
