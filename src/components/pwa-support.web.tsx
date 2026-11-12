import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useAppColors } from '@/hooks/use-app-colors';
import { useI18n } from '@/hooks/use-i18n';
import { webPath } from '@/utils/web-base';

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
    void navigator.serviceWorker.register(webPath('/sw.js'), { scope: webPath('/'), updateViaCache: 'none' })
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
 * Install tip on the start screen: one slim row that stays out of the way.
 * Where the browser offers its own prompt the row carries an Install button;
 * elsewhere (Safari) tapping it unfolds the Add to Home Screen steps.
 * Hidden once installed or dismissed.
 */
export function PwaInstallCard() {
  const colors = useAppColors();
  const { t } = useI18n();
  const [standalone, setStandalone] = useState(true);
  const [dismissed, setDismissed] = useState(true);
  const [canPrompt, setCanPrompt] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={canPrompt ? undefined : { expanded }}
          onPress={canPrompt ? install : () => setExpanded(value => !value)}
          style={styles.main}>
          <MaterialCommunityIcons name="cellphone-arrow-down" size={18} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t('pwaInstallTitle')}
          </Text>
          {canPrompt ? (
            <View style={[styles.installButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.installText}>{t('pwaInstallAction')}</Text>
            </View>
          ) : (
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textDim}
            />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pwaInstallDismiss')}
          onPress={dismiss}
          hitSlop={10}
          style={styles.close}>
          <MaterialCommunityIcons name="close" size={16} color={colors.textFaint} />
        </Pressable>
      </View>
      {expanded && !canPrompt ? (
        <View style={styles.details}>
          <Text style={[styles.body, { color: colors.textDim }]}>{t('pwaInstallInstructions')}</Text>
          <Text style={[styles.note, { color: colors.textFaint }]}>{t('pwaInstallNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  main: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flexShrink: 1, fontSize: 14, fontWeight: '700' },
  details: { gap: 4, paddingRight: Spacing.two, paddingBottom: Spacing.three },
  body: { fontSize: 13, lineHeight: 19 },
  note: { fontSize: 12, lineHeight: 17 },
  installButton: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  installText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
