import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, Fonts, Spacing } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';

const DISMISSED_KEY = 'pwa-install-tip-dismissed';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

// Chrome and Android fire this once per page load, often before the card
// mounts, so it is caught at module level and handed to whoever asks.
let deferredPrompt: InstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    promptListeners.forEach(listener => listener());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    promptListeners.forEach(listener => listener());
  });
}

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

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

/**
 * Install tip on the start screen. Hidden once installed or dismissed; where
 * the browser offers its own install prompt the card gets a real button
 * instead of instructions.
 */
export function PwaInstallCard() {
  const colors = useAppColors();
  const { t } = useI18n();
  const [standalone, setStandalone] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    const update = () => setStandalone(mode.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const promptChanged = () => setCanPrompt(deferredPrompt != null);
    update();
    promptChanged();
    setDismissed(readDismissed());
    mode.addEventListener('change', update);
    promptListeners.add(promptChanged);
    return () => {
      mode.removeEventListener('change', update);
      promptListeners.delete(promptChanged);
    };
  }, []);

  if (standalone || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private mode: the tip simply comes back next visit.
    }
  }

  async function install() {
    const prompt = deferredPrompt;
    if (!prompt) return;
    await prompt.prompt().catch(() => {});
    deferredPrompt = null;
    setCanPrompt(false);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.panel, borderColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: alpha(colors.primary, '1F') }]}>
        <MaterialCommunityIcons name="cellphone-arrow-down" size={20} color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{t('pwaInstallTitle')}</Text>
        {canPrompt ? null : (
          <Text style={[styles.body, { color: colors.textDim }]}>{t('pwaInstallInstructions')}</Text>
        )}
        <Text style={[styles.note, { color: colors.textFaint }]}>{t('pwaInstallNote')}</Text>
        {canPrompt ? (
          <Pressable
            accessibilityRole="button"
            onPress={install}
            style={({ pressed }) => [
              styles.installButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}>
            <Text style={styles.installText}>{t('pwaInstallAction')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('pwaInstallDismiss')}
        onPress={dismiss}
        hitSlop={10}
        style={styles.close}>
        <MaterialCommunityIcons name="close" size={18} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    padding: Spacing.three,
    paddingRight: Spacing.two,
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: Spacing.two,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: Fonts.serif, fontSize: 17, lineHeight: 22 },
  body: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 17 },
  installButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  installText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
