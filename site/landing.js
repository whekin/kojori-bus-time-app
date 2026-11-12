// Landing page behaviour: language choice, the live departure board, the
// view tabs, the install picker and scroll reveals. Each language is its own
// static page (/, /ka/, /ru/) built by scripts/build-site.ts; text that this
// script shows comes from hidden [data-msg] elements so it is translated too.
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lang = document.documentElement.lang || 'en';

  // Remember the switcher choice; the inline script in <head> reads it.
  for (const link of $$('[data-lang]')) {
    link.addEventListener('click', () => {
      try { localStorage.setItem('gzaap-landing-lang', link.dataset.lang); } catch { /* storage blocked */ }
    });
  }

  const header = $('#top');
  const onScroll = () => header.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // SMIL ignores prefers-reduced-motion, so stop the bus on the route here.
  if (reducedMotion) $('.route')?.pauseAnimations?.();

  /* ---------- Live departure board ---------- */
  // Mirrors the app's Departures screen (src/app/index.tsx): a NEXT card with
  // the countdown, then a LATER list. Labels match the app's translations.
  const board = $('#board');
  if (board) {
    const msg = (key, values = {}) => ($(`[data-msg="${key}"]`, board)?.textContent ?? key)
      .replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
    // Same stops and patterns as the app's default Tbilisi ⇄ Kojori trip.
    const TRIPS = {
      kojori: { stop: '1:3932', patterns: { 380: '0:01', 316: '1:01' }, from: 'tbilisi', to: 'kojori', stopName: 'stopTbilisi' },
      tbilisi: { stop: '1:2856', patterns: { 380: '1:01', 316: '0:01' }, from: 'kojori', to: 'tbilisi', stopName: 'stopKojori' },
    };
    const REFRESH_MS = 30_000;
    const cache = {};
    const nextSlot = $('#next');
    const laterBlock = $('#later-block');
    const later = $('#later');
    const chip = $('.dir-chip', board);
    const timeFormat = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { hour: '2-digit', minute: '2-digit', hour12: false });
    const plural = new Intl.PluralRules(lang);
    const clockAt = minutes => timeFormat.format(new Date(Date.now() + minutes * 60_000));
    const relative = minutes => {
      if (minutes < 1) return msg('now');
      const form = plural.select(minutes);
      return msg(['one', 'few', 'many'].includes(form) ? `in-${form}` : 'in-other', { count: minutes });
    };
    let dir = 'kojori';

    const el = (tag, className, ...children) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      node.append(...children);
      return node;
    };
    const pill = (label, small) => el('span', small ? 'pill small' : 'pill', el('i'), label);
    const calendarIcon = () => {
      const span = el('span');
      span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="15" height="15" rx="2"/><path d="M3 10h15M8 3v4M13 3v4"/><circle cx="18" cy="17" r="4" fill="var(--surface)"/><path d="M18 15.5V17l1 1"/></svg>';
      return span.firstChild;
    };

    function note(text) {
      nextSlot.replaceChildren(el('div', 'next-card note', text));
      laterBlock.hidden = true;
    }

    function nextCard(dep) {
      const head = el('div', 'next-head',
        el('span', 'route-badge', dep.route),
        el('span', 'next-copy', el('b', '', msg('nextDeparture')), el('small', '', msg('route'))));
      if (dep.live) head.append(pill(msg('liveSignal')));
      const label = relative(dep.min);
      let hero, meta;
      if (dep.live) {
        // "In 20 mins" with the number in the route color, as in the app.
        const text = label.charAt(0).toLocaleUpperCase(lang) + label.slice(1);
        const match = text.match(/\d+/);
        hero = el('p', 'next-hero');
        if (match) hero.append(text.slice(0, match.index), el('em', '', match[0]), text.slice(match.index + match[0].length));
        else hero.append(text);
        meta = el('p', 'next-meta');
        if (dep.scheduled != null) {
          meta.append(el('span', '', msg('scheduledAt', { time: clockAt(dep.scheduled) })));
          const drift = dep.min - dep.scheduled;
          if (Math.abs(drift) <= 30) {
            meta.append(el('span', 'drift', drift > 0 ? msg('late', { minutes: drift }) : drift < 0 ? msg('early', { minutes: -drift }) : msg('onTime')));
          }
        }
      } else {
        hero = el('p', 'next-hero time', clockAt(dep.min));
        meta = el('p', 'next-meta', calendarIcon(), el('span', '', msg('scheduled')), el('span', 'dot', '•'), el('b', '', label));
      }
      return el('div', `next-card r${dep.route}`, el('div', 'next-body', head, hero, meta));
    }

    function render(animate) {
      const entry = cache[dir];
      if (!entry) return;
      board.classList.toggle('offline', Boolean(entry.error));
      board.classList.toggle('settled', !animate);
      if (entry.error) { note(msg('error')); return; }
      const elapsed = Math.floor((Date.now() - entry.at) / 60_000);
      const rows = entry.list
        .map(dep => ({
          ...dep,
          min: Math.max(0, dep.min - elapsed),
          scheduled: dep.scheduled == null ? null : dep.scheduled - elapsed,
        }))
        .slice(0, 3);
      if (!rows.length) { note(msg('empty')); return; }
      nextSlot.replaceChildren(nextCard(rows[0]));
      later.replaceChildren(...rows.slice(1).map(dep => {
        const meta = el('span', 'row-meta');
        if (dep.live) meta.append(pill(msg('live'), true));
        meta.append(el('span', '', relative(dep.min)));
        return el('li', `r${dep.route}`, el('span', 'bus-tag', dep.route), el('span', 'row-time', clockAt(dep.min)), meta);
      }));
      laterBlock.hidden = rows.length < 2;
    }

    async function load(target) {
      const trip = TRIPS[target];
      const path = `/v2/stops/${trip.stop}/arrival-times?locale=en&ignoreScheduledArrivalTimes=false`;
      try {
        const response = await fetch(`/app/ttc?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        const list = (Array.isArray(data) ? data : [])
          .filter(item => trip.patterns[item.shortName] === item.patternSuffix)
          .map(item => {
            const live = Boolean(item.realtime) && Number.isFinite(item.realtimeArrivalMinutes);
            const scheduled = Number.isFinite(item.scheduledArrivalMinutes) ? item.scheduledArrivalMinutes : null;
            return { route: item.shortName, live, scheduled: live ? scheduled : null, min: live ? item.realtimeArrivalMinutes : scheduled };
          })
          .filter(item => Number.isFinite(item.min) && item.min >= 0 && item.min <= 120)
          .sort((a, b) => a.min - b.min);
        cache[target] = { at: Date.now(), list };
      } catch {
        cache[target] = { at: Date.now(), error: true };
      }
      if (target === dir) render(true);
    }

    function showTrip(animate) {
      const trip = TRIPS[dir];
      board.dataset.dir = dir;
      $('#trip-from').textContent = msg(trip.from);
      $('#trip-to').textContent = msg(trip.to);
      $('#trip-stop').textContent = msg(trip.stopName);
      $('#trip-code').textContent = `#${trip.stop.split(':')[1]}`;
      if (animate && !reducedMotion) {
        chip.classList.remove('swap');
        void chip.offsetWidth;
        chip.classList.add('swap');
      }
      const entry = cache[dir];
      if (entry && Date.now() - entry.at < REFRESH_MS) render(true);
      else load(dir);
    }

    $('#flip').addEventListener('click', () => {
      dir = dir === 'kojori' ? 'tbilisi' : 'kojori';
      showTrip(true);
    });
    setInterval(() => {
      if (document.hidden) return;
      const entry = cache[dir];
      if (!entry || Date.now() - entry.at >= REFRESH_MS) load(dir);
      else render(false);
    }, 15_000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && cache[dir] && Date.now() - cache[dir].at >= REFRESH_MS) load(dir);
    });
    showTrip(false);
    // Warm the way back so the flip is instant.
    setTimeout(() => { if (!cache.tbilisi) load('tbilisi'); }, 1500);
  }

  /* ---------- Tabs (shared by the views and the install picker) ---------- */
  function tablist(list, onSelect) {
    const tabs = $$('[role="tab"]', list);
    const select = (tab, focus) => {
      for (const other of tabs) {
        const on = other === tab;
        other.setAttribute('aria-selected', String(on));
        other.tabIndex = on ? 0 : -1;
      }
      if (focus) tab.focus();
      onSelect(tab);
    };
    list.addEventListener('keydown', event => {
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
      if (!step) return;
      event.preventDefault();
      select(tabs[(index + step + tabs.length) % tabs.length], true);
    });
    for (const tab of tabs) tab.addEventListener('click', () => select(tab, false));
    return { tabs, select };
  }

  /* ---------- One trip, three views ---------- */
  const views = $('.views');
  if (views) {
    const screen = $('#screen');
    const caption = $('#view-caption');
    const VIEW_MS = 6000;
    views.style.setProperty('--view-time', `${VIEW_MS}ms`);
    let auto = 0;
    const { tabs, select } = tablist($('.tabs', views), tab => {
      for (const picture of $$('picture', screen)) picture.classList.toggle('on', picture.dataset.screen === tab.dataset.view);
      screen.setAttribute('aria-labelledby', tab.id);
      caption.textContent = $('.tab-text span', tab)?.textContent ?? '';
    });
    const stop = () => { clearInterval(auto); auto = 0; views.classList.remove('playing'); };
    const play = () => {
      if (reducedMotion || auto) return;
      views.classList.add('playing');
      auto = setInterval(() => {
        const current = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
        select(tabs[(current + 1) % tabs.length], false);
      }, VIEW_MS);
    };
    caption.textContent = $('.tab[aria-selected="true"] .tab-text span', views)?.textContent ?? '';
    // Cycle while the section is on screen, until someone picks a view.
    let touched = false;
    for (const tab of tabs) {
      tab.addEventListener('click', () => { touched = true; stop(); });
      tab.addEventListener('focus', () => { touched = true; stop(); });
    }
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !touched) play();
      else stop();
    }, { threshold: 0.45 }).observe(views);

    // A slight tilt that follows the pointer.
    if (!reducedMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      screen.addEventListener('pointermove', event => {
        const box = screen.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        screen.style.setProperty('--ry', `${x * 10}deg`);
        screen.style.setProperty('--rx', `${y * -8}deg`);
      });
      screen.addEventListener('pointerleave', () => {
        screen.style.removeProperty('--ry');
        screen.style.removeProperty('--rx');
      });
    }
  }

  /* ---------- Install picker ---------- */
  const seg = $('.seg');
  if (seg) {
    const { tabs, select } = tablist(seg, tab => {
      for (const panel of $$('.panel')) panel.classList.toggle('on', panel.id === tab.getAttribute('aria-controls'));
    });
    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const platform = isIos ? 'ios' : /Android/.test(ua) ? 'android' : 'web';
    select(tabs.find(tab => tab.dataset.platform === platform) ?? tabs[0], false);
  }

  // Chrome and Edge offer the app's install prompt here too (same manifest).
  const installButton = $('#install');
  let deferredPrompt = null;
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });
  installButton?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt().catch(() => {});
    deferredPrompt = null;
    installButton.hidden = true;
  });
  addEventListener('appinstalled', () => { installButton.hidden = true; });

  /* ---------- Reveal on scroll ---------- */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reducedMotion) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('seen');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    for (const node of reveals) observer.observe(node);
  } else {
    for (const node of reveals) node.classList.add('seen');
  }
})();
