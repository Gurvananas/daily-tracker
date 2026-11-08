// "Réglages": manage metrics, backups, appearance.

import { h, toast, download } from '../ui.js';
import { getState, moveMetric, updateMetric, setSetting, exportJSON, exportCSV, importJSON, resetAll } from '../store.js';
import { TYPES, formatGoal, metricLabel } from '../metrics.js';
import { today, diffDays, formatShortYear } from '../dates.js';
import { rerender, navigate } from '../router.js';
import { applyTheme, installState } from '../app-shell.js';
import { isNative, shareFile } from '../native.js';
import { healthSection } from './health-settings.js';

function metricRow(m, i, list) {
  const desc = [TYPES[m.type].label, m.category, formatGoal(m)].filter(Boolean).join(' · ');
  return h('li', { class: 'metric-row' },
    h('a', { class: 'mr-main', href: `#/metric/${m.id}` },
      h('strong', null, metricLabel(m)),
      h('small', null, desc)),
    h('div', { class: 'mr-actions' },
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Monter ${m.name}`, disabled: i === 0, onclick: () => { moveMetric(m.id, -1); rerender(); } }, '↑'),
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': `Descendre ${m.name}`, disabled: i === list.length - 1, onclick: () => { moveMetric(m.id, 1); rerender(); } }, '↓')));
}

/** Browser: download the file. Android app: open the share sheet (Drive, e-mail, Fichiers…). */
async function saveExport(filename, content, type) {
  if (!isNative()) {
    download(filename, content, type);
    return true;
  }
  try {
    await shareFile(filename, content, 'Sauvegarde Daily Tracker');
    return true;
  } catch (err) {
    if (!/cancel/i.test(err.message || '')) toast(`Export impossible : ${err.message}`);
    return false;
  }
}

function backupSection() {
  const { settings, entries } = getState();
  const days = Object.keys(entries).length;
  const last = settings.lastBackup;
  const age = last ? diffDays(last.slice(0, 10), today()) : null;
  const stamp = () => setSetting('lastBackup', new Date().toISOString());

  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  let mode = 'merge';
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (mode === 'replace' && !confirm('Remplacer toutes tes données actuelles par celles du fichier ?')) return;
      importJSON(text, mode);
      toast('Import réussi');
      rerender();
    } catch (err) {
      console.error(err);
      alert(`Import impossible : ${err.message}`);
    } finally {
      file.value = '';
    }
  });
  const pick = (m) => () => {
    mode = m;
    file.click();
  };

  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Sauvegarde'),
    h('p', null, isNative()
      ? 'Tes données sont enregistrées uniquement dans cette appli, sur ce téléphone. Exporte une sauvegarde régulièrement (par exemple chaque mois) et range-la dans ton cloud.'
      : 'Tes données sont enregistrées uniquement dans ce navigateur, sur cet appareil. Exporte une sauvegarde régulièrement (par exemple chaque mois) et range-la dans ton cloud.'),
    h('p', { class: 'muted' }, `${days} jour${days > 1 ? 's' : ''} de données · dernière sauvegarde : `,
      last ? `${formatShortYear(last.slice(0, 10))} (il y a ${age} j)` : 'jamais'),
    h('div', { class: 'actions start' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => saveExport(`daily-tracker-${today()}.json`, exportJSON(), 'application/json').then((ok) => { if (ok) { stamp(); rerender(); } }) }, 'Exporter (JSON)'),
      h('button', { type: 'button', class: 'btn', onclick: () => saveExport(`daily-tracker-${today()}.csv`, `﻿${exportCSV()}`, 'text/csv;charset=utf-8') }, 'Exporter pour tableur (CSV)')),
    h('div', { class: 'actions start' },
      h('button', { type: 'button', class: 'btn', onclick: pick('merge') }, 'Importer et fusionner…'),
      h('button', { type: 'button', class: 'btn', onclick: pick('replace') }, 'Importer et remplacer…'),
      file),
    h('p', { class: 'field-hint' }, 'Le JSON est le format de sauvegarde complet (à réimporter ici). Le CSV s\'ouvre dans Excel, Numbers ou Google Sheets pour tes propres analyses.'));
}

function storageSection() {
  const status = h('span', { class: 'muted' }, '…');
  const btn = h('button', { type: 'button', class: 'btn small hidden' }, 'Protéger mes données');
  const usage = h('span', { class: 'muted' });
  (async () => {
    if (!navigator.storage?.persisted) {
      status.textContent = 'Non pris en charge par ce navigateur.';
      return;
    }
    const persisted = await navigator.storage.persisted();
    status.textContent = persisted ? '✓ Stockage protégé contre l\'effacement automatique.' : 'Le navigateur peut effacer ces données s\'il manque de place.';
    btn.classList.toggle('hidden', persisted);
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      if (est.usage != null) usage.textContent = ` Espace utilisé : ${(est.usage / 1024).toFixed(0)} Ko.`;
    }
  })();
  btn.addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    toast(ok ? 'Stockage protégé' : 'Le navigateur a refusé (installe l\'app pour l\'obtenir)');
    rerender();
  });

  const install = installState();
  let installBlock;
  if (install.installed) installBlock = h('p', null, '✓ Application installée.');
  else if (install.prompt) {
    installBlock = h('button', { type: 'button', class: 'btn primary', onclick: async () => { await install.prompt(); rerender(); } }, 'Installer l\'application');
  } else if (install.ios) {
    installBlock = h('p', null, 'Sur iPhone : touche ', h('strong', null, 'Partager'), ' puis ', h('strong', null, 'Sur l\'écran d\'accueil'), '. L\'app s\'ouvrira en plein écran et tes données seront mieux protégées.');
  } else {
    installBlock = h('p', null, 'Dans le menu de ton navigateur, choisis « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».');
  }

  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Installer sur ton téléphone'),
    installBlock,
    h('p', null, status, usage),
    btn);
}

export function renderSettings() {
  const state = getState();
  const active = state.metrics.filter((m) => !m.archived);
  const archived = state.metrics.filter((m) => m.archived);

  const theme = h('select', { class: 'input' },
    h('option', { value: 'auto' }, 'Automatique (comme le système)'),
    h('option', { value: 'light' }, 'Clair'),
    h('option', { value: 'dark' }, 'Sombre'));
  theme.value = state.settings.theme;
  theme.addEventListener('change', () => {
    setSetting('theme', theme.value);
    applyTheme();
  });

  // Reorder works on the full list so archived metrics keep their place.
  const activeRows = active.map((m, i) => metricRow(m, i, active));

  return h('div', { class: 'stack' },
    h('header', { class: 'page-head' }, h('h1', null, 'Réglages')),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, `Mes métriques (${active.length})`),
      active.length ? h('ul', { class: 'metric-rows' }, activeRows) : h('p', { class: 'muted' }, 'Aucune métrique active.'),
      h('div', { class: 'actions start' },
        h('a', { class: 'btn primary', href: '#/metric/new' }, '+ Créer une métrique'),
        h('a', { class: 'btn', href: '#/library' }, 'Ajouter depuis la bibliothèque')),
      archived.length ? h('details', { class: 'archived' },
        h('summary', null, `Archivées (${archived.length})`),
        h('ul', { class: 'metric-rows' }, archived.map((m) => h('li', { class: 'metric-row' },
          h('a', { class: 'mr-main', href: `#/metric/${m.id}` }, h('strong', null, metricLabel(m)), h('small', null, TYPES[m.type].label)),
          h('button', { type: 'button', class: 'btn small', onclick: () => { updateMetric(m.id, { archived: false }); toast('Métrique réactivée'); rerender(); } }, 'Réactiver'))))) : null),
    healthSection(),
    backupSection(),
    isNative() ? null : storageSection(),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Apparence'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Thème'), theme)),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Zone sensible'),
      h('p', { class: 'muted' }, 'Efface toutes les métriques et toutes les valeurs de cet appareil.'),
      h('button', {
        type: 'button', class: 'btn danger',
        onclick: () => {
          if (!confirm('Tout effacer ? Exporte d\'abord une sauvegarde si tu veux garder tes données.')) return;
          if (!confirm('Vraiment tout effacer ? Cette action est irréversible.')) return;
          resetAll();
          toast('Données effacées');
          navigate('#/today');
        },
      }, 'Tout effacer')),
    h('p', { class: 'muted center small' }, 'Daily Tracker · prêt pour 2027 🎆'));
}
