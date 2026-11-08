// "Montre connectée" section of the settings (Health Connect on Android).

import { h, toast } from '../ui.js';
import { getState, addMetrics } from '../store.js';
import { PRESETS, metricLabel } from '../metrics.js';
import { formatShortYear } from '../dates.js';
import { isNative, ANDROID_DOWNLOAD_URL } from '../native.js';
import { HEALTH_FIELDS, OFF, resolveMapping, healthStatus, requestHealthAccess, openHealthConnect, syncHealth, setHealthMapping } from '../health.js';
import { rerender } from '../router.js';

const fmtTime = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function syncLabel(health) {
  if (!health.lastSync) return 'Jamais synchronisé';
  const d = new Date(health.lastSync);
  const r = health.lastResult;
  const when = `${formatShortYear(health.lastSync.slice(0, 10))} à ${fmtTime.format(d)}`;
  return r ? `Synchronisé le ${when} · ${r.updated} valeur${r.updated > 1 ? 's' : ''} mise${r.updated > 1 ? 's' : ''} à jour` : `Synchronisé le ${when}`;
}

async function runSync() {
  try {
    const res = await syncHealth({ days: 30 });
    toast(res.skipped ? 'Rien à synchroniser : vérifie l\'accès et les métriques liées' : `${res.updated} valeur${res.updated > 1 ? 's' : ''} mise${res.updated > 1 ? 's' : ''} à jour`);
  } catch (err) {
    toast(`Synchronisation impossible : ${err.message}`);
  }
  rerender();
}

function mappingRow(field, state) {
  const current = resolveMapping(field, state.metrics, state.settings.health.map);
  const candidates = state.metrics.filter((m) => !m.archived && field.types.includes(m.type));
  const preset = PRESETS.find((p) => p.key === field.key);
  const hasPreset = state.metrics.some((m) => m.preset === field.key && !m.archived);

  const select = h('select', { class: 'input', 'aria-label': `Métrique remplie avec : ${field.label}` },
    h('option', { value: OFF }, 'Ne pas remplir'),
    candidates.map((m) => h('option', { value: m.id }, metricLabel(m))));
  select.value = current ? current.id : OFF;
  select.addEventListener('change', () => {
    setHealthMapping(field.key, select.value);
    toast('Enregistré');
  });

  const add = !hasPreset && preset
    ? h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        addMetrics([{ ...preset, preset: preset.key }]);
        setHealthMapping(field.key, '');
        toast(`« ${preset.name} » ajoutée`);
        rerender();
      },
    }, `+ Créer « ${preset.name} »`)
    : null;

  return h('div', { class: 'health-row' },
    h('span', { class: 'field-label' }, `⌚ ${field.label}`),
    h('div', { class: 'health-row-controls' }, select, add));
}

export function healthSection() {
  if (!isNative()) {
    return h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Montre connectée'),
      h('p', null, 'L\'appli Android remplit automatiquement tes pas et ton sommeil depuis ta montre (COROS, ou toute montre qui écrit dans Health Connect).'),
      h('div', { class: 'actions start' }, h('a', { class: 'btn primary', href: ANDROID_DOWNLOAD_URL, target: '_blank', rel: 'noopener' }, 'Télécharger l\'appli Android')),
      h('p', { class: 'field-hint' }, 'Les données de l\'appli Android sont séparées de celles de ce navigateur : exporte une sauvegarde ici, puis importe-la dans l\'appli.'));
  }

  const state = getState();
  const statusLine = h('p', { class: 'muted' }, 'Vérification de Health Connect…');
  const actions = h('div', { class: 'actions start' });
  const section = h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Montre connectée'),
    statusLine,
    actions,
    h('div', { class: 'health-map' },
      h('p', { class: 'field-hint' }, 'Données lues dans Health Connect et métrique remplie avec :'),
      HEALTH_FIELDS.map((f) => mappingRow(f, state))),
    h('p', { class: 'muted small' }, syncLabel(state.settings.health)),
    h('details', { class: 'help' },
      h('summary', null, 'Comment ça marche ?'),
      h('ul', null,
        h('li', null, 'Dans l\'appli COROS : Profil → Réglages → Applications tierces → Health Connect, puis autorise Pas et Sommeil.'),
        h('li', null, 'La synchro se fait à chaque ouverture de l\'appli, sur les 7 derniers jours.'),
        h('li', null, 'Le sommeil (durée, coucher, réveil) est rangé au jour du réveil.'),
        h('li', null, 'Si ton téléphone compte aussi tes pas, mets COROS en premier dans Health Connect → Données et accès → Activité → Pas → Sources des données.'),
        h('li', null, 'Une valeur que tu modifies à la main n\'est plus jamais écrasée. Efface-la pour que la synchro la remplisse à nouveau.'))));

  healthStatus().then((st) => {
    actions.replaceChildren();
    if (st.sdk === 'unavailable' || st.sdk === 'update_required') {
      statusLine.textContent = st.sdk === 'unavailable'
        ? 'Health Connect n\'est pas installé sur ce téléphone.'
        : 'Health Connect doit être mis à jour.';
      actions.append(h('button', { type: 'button', class: 'btn primary', onclick: () => openHealthConnect().catch((e) => toast(e.message)) },
        st.sdk === 'unavailable' ? 'Installer Health Connect' : 'Mettre à jour Health Connect'));
      return;
    }
    if (!st.granted) {
      const missing = [!st.steps && 'pas', !st.sleep && 'sommeil'].filter(Boolean).join(' et ');
      statusLine.textContent = st.steps || st.sleep
        ? `Accès partiel : ${missing} non autorisé${missing.includes(' et ') ? 's' : ''}.`
        : 'Autorise l\'appli à lire tes pas et ton sommeil.';
      actions.append(h('button', {
        type: 'button', class: 'btn primary',
        onclick: async () => {
          try {
            const res = await requestHealthAccess();
            if (res.steps || res.sleep) await runSync();
            else rerender();
          } catch (e) {
            toast(e.message);
          }
        },
      }, 'Autoriser l\'accès'));
    } else {
      statusLine.textContent = '✓ Accès autorisé à tes pas et à ton sommeil.';
    }
    if (st.steps || st.sleep) actions.append(h('button', { type: 'button', class: 'btn', onclick: runSync }, 'Synchroniser maintenant'));
    actions.append(h('button', { type: 'button', class: 'btn', onclick: () => openHealthConnect().catch((e) => toast(e.message)) }, 'Ouvrir Health Connect'));
  }).catch((err) => {
    statusLine.textContent = `Health Connect indisponible : ${err.message}`;
  });
  return section;
}
