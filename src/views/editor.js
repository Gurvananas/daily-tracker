// Create / edit a metric.

import { h, toast } from '../ui.js';
import { getState, getMetric, addMetrics, updateMetric, deleteMetric, countValues } from '../store.js';
import { TYPES, createMetric, formatTime, parseTime } from '../metrics.js';
import { navigate } from '../router.js';

const field = (label, control, hint) => h('label', { class: 'field' },
  h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);

const numIn = (value, attrs = {}) => h('input', { type: 'text', inputmode: 'decimal', class: 'input', value: value ?? '', ...attrs });
const toNum = (s) => {
  const n = Number(String(s).trim().replace(',', '.'));
  return String(s).trim() !== '' && Number.isFinite(n) ? n : null;
};

export function renderEditor(id) {
  const existing = id ? getMetric(id) : null;
  if (id && !existing) {
    return h('div', { class: 'stack' }, h('p', { class: 'card' }, 'Métrique introuvable. ', h('a', { href: '#/settings' }, 'Retour aux réglages')));
  }
  const draft = existing ? structuredClone(existing) : createMetric({ name: '', type: 'boolean' });
  const used = existing ? countValues(existing.id) : 0;
  const categories = [...new Set(getState().metrics.map((m) => m.category).filter(Boolean))];

  const root = h('div', { class: 'stack' });
  const form = h('form', { class: 'card form', novalidate: true });

  const name = h('input', { class: 'input', required: true, maxlength: 60, value: draft.name, placeholder: 'ex. Sommeil, Méditation…' });
  const emoji = h('input', { class: 'input emoji-in', maxlength: 8, value: draft.emoji, placeholder: '🙂', 'aria-label': 'Emoji' });
  const category = h('input', { class: 'input', list: 'cat-list', maxlength: 30, value: draft.category, placeholder: 'ex. Corps, Esprit…' });
  const catList = h('datalist', { id: 'cat-list' }, categories.map((c) => h('option', { value: c })));
  const type = h('select', { class: 'input', disabled: used > 0 },
    Object.entries(TYPES).map(([k, t]) => h('option', { value: k }, t.label)));
  type.value = draft.type;

  const typeBox = h('div', { class: 'type-fields' });
  const goalBox = h('div', { class: 'goal-fields' });
  const errors = h('p', { class: 'error', role: 'alert' });

  // Type-dependent fields are rebuilt when the type changes.
  let readTypeFields = () => ({});
  let readGoal = () => null;

  function buildTypeFields() {
    const tp = type.value;
    typeBox.replaceChildren();
    goalBox.replaceChildren();
    readTypeFields = () => ({});
    readGoal = () => null;
    const sumDefault = draft.type === tp && existing ? draft.sum : tp !== 'number';

    if (tp === 'number' || tp === 'count') {
      const unit = h('input', { class: 'input', maxlength: 15, value: draft.unit || '', placeholder: tp === 'count' ? 'ex. verres' : 'ex. kg, pas, €' });
      const parts = [field('Unité', unit)];
      let step;
      if (tp === 'number') {
        step = numIn(draft.step ?? 1);
        parts.push(field('Précision', step, 'ex. 1, 0,1 ou 0,01'));
      }
      const sum = h('input', { type: 'checkbox', checked: sumDefault });
      parts.push(h('label', { class: 'check' }, sum, 'Afficher le total cumulé dans les tendances'));
      typeBox.append(h('div', { class: 'row' }, parts.slice(0, 2)), parts[2] || null);
      readTypeFields = () => ({ unit: unit.value, step: step ? toNum(step.value) || 1 : undefined, sum: sum.checked });
    } else if (tp === 'scale') {
      const max = h('select', { class: 'input' }, h('option', { value: '5' }, 'de 1 à 5'), h('option', { value: '10' }, 'de 1 à 10'));
      max.value = String(draft.max || 5);
      typeBox.append(field('Échelle', max));
      readTypeFields = () => ({ max: Number(max.value) });
    } else if (tp === 'duration') {
      const sum = h('input', { type: 'checkbox', checked: sumDefault });
      typeBox.append(h('label', { class: 'check' }, sum, 'Afficher le total cumulé dans les tendances'));
      readTypeFields = () => ({ sum: sum.checked });
    }

    if (tp === 'text') return;
    const g = draft.type === tp ? draft.goal : null;
    if (tp === 'boolean') {
      const sel = h('select', { class: 'input' },
        h('option', { value: '' }, 'Pas d\'objectif'),
        h('option', { value: 'yes' }, 'Répondre « Oui » (une bonne habitude)'),
        h('option', { value: 'no' }, 'Répondre « Non » (une habitude à éviter)'));
      sel.value = g ? (g.value ? 'yes' : 'no') : '';
      goalBox.append(field('Objectif', sel));
      readGoal = () => (sel.value ? { op: 'eq', value: sel.value === 'yes' } : null);
      return;
    }
    const op = h('select', { class: 'input' },
      h('option', { value: '' }, 'Pas d\'objectif'),
      h('option', { value: 'min' }, tp === 'time' ? 'Au plus tôt (après)' : 'Au moins'),
      h('option', { value: 'max' }, tp === 'time' ? 'Au plus tard (avant)' : 'Au plus'));
    op.value = g?.op || '';
    let valueControl;
    let readValue;
    if (tp === 'duration') {
      const hh = numIn(g ? Math.floor(g.value / 60) : '', { inputmode: 'numeric', 'aria-label': 'Heures', class: 'input narrow' });
      const mm = numIn(g ? g.value % 60 : '', { inputmode: 'numeric', 'aria-label': 'Minutes', class: 'input narrow' });
      valueControl = h('div', { class: 'inline' }, hh, h('span', null, 'h'), mm, h('span', null, 'min'));
      readValue = () => {
        const a = toNum(hh.value || '0');
        const b = toNum(mm.value || '0');
        return a === null || b === null ? null : a * 60 + b;
      };
    } else if (tp === 'time') {
      const tm = h('input', { type: 'time', class: 'input', value: g ? formatTime(g.value) : '', 'aria-label': 'Heure' });
      valueControl = tm;
      readValue = () => parseTime(tm.value);
    } else {
      const num = numIn(g ? String(g.value).replace('.', ',') : '', { 'aria-label': 'Valeur cible' });
      valueControl = num;
      readValue = () => toNum(num.value);
    }
    const valueWrap = h('div', { class: 'goal-value' }, valueControl);
    const sync = () => valueWrap.classList.toggle('hidden', !op.value);
    op.addEventListener('change', sync);
    sync();
    goalBox.append(h('div', { class: 'row' }, field('Objectif', op), h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Valeur'), valueWrap)));
    readGoal = () => {
      if (!op.value) return null;
      const v = readValue();
      if (v === null) throw new Error('Indique la valeur de l\'objectif.');
      return { op: op.value, value: v };
    };
  }

  type.addEventListener('change', () => {
    draft.goal = null;
    buildTypeFields();
  });
  buildTypeFields();

  form.append(
    h('div', { class: 'row' }, field('Nom', name), field('Emoji', emoji)),
    field('Catégorie', category, 'Pour regrouper tes métriques sur l\'écran du jour'),
    catList,
    field('Type', type, used > 0 ? `Le type ne peut plus changer : ${used} valeur${used > 1 ? 's' : ''} déjà saisie${used > 1 ? 's' : ''}. Crée une nouvelle métrique si besoin.` : TYPES[type.value].hint),
    typeBox,
    goalBox,
    errors,
    h('div', { class: 'actions' },
      h('a', { class: 'btn', href: '#/settings' }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'submit' }, existing ? 'Enregistrer' : 'Créer la métrique')));

  type.addEventListener('change', () => {
    const hint = type.closest('.field').querySelector('.field-hint');
    if (hint && !used) hint.textContent = TYPES[type.value].hint;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errors.textContent = '';
    if (!name.value.trim()) {
      errors.textContent = 'Donne un nom à ta métrique.';
      name.focus();
      return;
    }
    let goal;
    try {
      goal = readGoal();
    } catch (err) {
      errors.textContent = err.message;
      return;
    }
    const data = { name: name.value, emoji: emoji.value, category: category.value, type: type.value, goal, ...readTypeFields() };
    if (existing) {
      updateMetric(existing.id, data);
      toast('Métrique enregistrée');
    } else {
      addMetrics([data]);
      toast('Métrique créée');
    }
    navigate('#/settings');
  });

  root.append(
    h('header', { class: 'page-head' },
      h('a', { class: 'back', href: '#/settings' }, '‹ Réglages'),
      h('h1', null, existing ? 'Modifier la métrique' : 'Nouvelle métrique')),
    form);

  if (existing) {
    const archive = h('button', { type: 'button', class: 'btn' }, existing.archived ? 'Réactiver' : 'Archiver');
    archive.addEventListener('click', () => {
      updateMetric(existing.id, { archived: !existing.archived });
      toast(existing.archived ? 'Métrique réactivée' : 'Métrique archivée — son historique est conservé');
      navigate('#/settings');
    });
    const del = h('button', { type: 'button', class: 'btn danger' }, 'Supprimer');
    del.addEventListener('click', () => {
      const msg = used
        ? `Supprimer « ${existing.name} » et ses ${used} valeur${used > 1 ? 's' : ''} ? C'est irréversible. (Astuce : « Archiver » la masque sans rien perdre.)`
        : `Supprimer « ${existing.name} » ?`;
      if (!confirm(msg)) return;
      deleteMetric(existing.id);
      toast('Métrique supprimée');
      navigate('#/settings');
    });
    root.append(h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Archiver ou supprimer'),
      h('p', { class: 'muted' }, 'Archiver masque la métrique de l\'écran du jour et des tendances, sans effacer son historique.'),
      h('div', { class: 'actions start' }, archive, del)));
  }
  return root;
}

