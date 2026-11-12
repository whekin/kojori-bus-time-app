// Landing page behaviour: language choice, platform hint, install prompt.
// Each language is its own static page (/, /ka/, /ru/) built by
// scripts/build-site.ts.
(() => {
  // Remember the switcher choice; the inline script in <head> reads it.
  const STORAGE_KEY = 'gzaap-landing-lang';
  for (const link of document.querySelectorAll('[data-lang]')) {
    link.addEventListener('click', () => {
      try { localStorage.setItem(STORAGE_KEY, link.dataset.lang); } catch { /* storage blocked */ }
    });
  }

  // Outline the install option that matches this device.
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const platform = isIos ? 'ios' : /Android/.test(ua) ? 'android' : 'web';
  document.querySelector(`[data-platform="${platform}"]`)?.classList.add('suggested');

  // Chrome and Edge offer the app's install prompt here too (same manifest).
  const installButton = document.getElementById('install');
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt().catch(() => {});
    deferredPrompt = null;
    installButton.hidden = true;
  });
  addEventListener('appinstalled', () => { installButton.hidden = true; });

  const header = document.getElementById('top');
  const onScroll = () => header.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
