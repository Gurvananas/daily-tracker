// Entry point: routing and app bootstrap.

import { setRenderer } from './router.js';
import { reloadFromStorage, getState } from './store.js';
import { applyTheme, registerServiceWorker } from './app-shell.js';
import { installTooltips, hideTip } from './ui.js';
import { renderToday } from './views/today.js';
import { renderStats } from './views/stats.js';
import { renderYear } from './views/year.js';
import { renderSettings } from './views/settings.js';
import { renderEditor } from './views/editor.js';
import { renderLibrary } from './views/library.js';

const routes = [
  { re: /^#\/today(?:\/(\d{4}-\d{2}-\d{2}))?$/, tab: 'today', title: 'Aujourd\'hui', view: (m) => renderToday(m[1]) },
  { re: /^#\/stats$/, tab: 'stats', title: 'Tendances', view: () => renderStats() },
  { re: /^#\/year(?:\/(\d{4}))?$/, tab: 'year', title: 'Année', view: (m) => renderYear(m[1]) },
  { re: /^#\/settings$/, tab: 'settings', title: 'Réglages', view: () => renderSettings() },
  { re: /^#\/library$/, tab: 'settings', title: 'Bibliothèque', view: () => renderLibrary() },
  { re: /^#\/metric\/new$/, tab: 'settings', title: 'Nouvelle métrique', view: () => renderEditor(null) },
  { re: /^#\/metric\/([\w-]+)$/, tab: 'settings', title: 'Modifier la métrique', view: (m) => renderEditor(m[1]) },
];

const viewEl = document.getElementById('view');

function render({ keepScroll = false } = {}) {
  hideTip();
  const hash = location.hash || '#/today';
  let route = null;
  let match = null;
  for (const r of routes) {
    match = hash.match(r.re);
    if (match) {
      route = r;
      break;
    }
  }
  if (!route) {
    location.replace('#/today');
    return;
  }
  const y = window.scrollY;
  try {
    viewEl.replaceChildren(route.view(match));
  } catch (err) {
    console.error(err);
    viewEl.replaceChildren(Object.assign(document.createElement('p'), { className: 'card error', textContent: `Oups, une erreur est survenue : ${err.message}` }));
  }
  const onboarding = !getState().metrics.length;
  document.body.classList.toggle('onboarding', onboarding);
  document.title = `${route.title} · Daily Tracker`;
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, keepScroll ? y : 0);
}

setRenderer(render);
window.addEventListener('hashchange', () => render());
window.addEventListener('storage', (e) => {
  if (e.key && !e.key.startsWith('daily-tracker')) return;
  reloadFromStorage();
  applyTheme();
  render({ keepScroll: true });
});

// When the app comes back to the foreground on a new day, "Aujourd'hui" must follow.
let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = new Date().toDateString();
  if (now !== lastDay) {
    lastDay = now;
    if (/^#\/(today|stats|year)?$/.test(location.hash || '#/today') || location.hash === '') render({ keepScroll: true });
  }
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

applyTheme();
installTooltips();
registerServiceWorker();
render();
