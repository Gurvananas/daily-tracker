// Preset picker, used for onboarding and to add metrics from the library later.

import { h, toast } from '../ui.js';
import { PRESETS, TYPES, formatGoal } from '../metrics.js';
import { getState, addMetrics } from '../store.js';
import { navigate } from '../router.js';

function presetPicker({ presets, preselect, submitLabel, onSubmit }) {
  const chosen = new Set(preselect);
  const form = h('form', { class: 'picker' });
  const submit = h('button', { class: 'btn primary block', type: 'submit' });
  const updateSubmit = () => {
    submit.textContent = submitLabel(chosen.size);
    submit.disabled = chosen.size === 0;
  };

  const categories = [...new Set(presets.map((p) => p.category))];
  for (const cat of categories) {
    const group = h('fieldset', { class: 'picker-group' }, h('legend', null, cat));
    for (const p of presets.filter((x) => x.category === cat)) {
      const input = h('input', { type: 'checkbox', checked: chosen.has(p.key), value: p.key });
      input.addEventListener('change', () => {
        if (input.checked) chosen.add(p.key);
        else chosen.delete(p.key);
        updateSubmit();
      });
      group.append(h('label', { class: 'pick' },
        input,
        h('span', { class: 'pick-emoji', 'aria-hidden': 'true' }, p.emoji),
        h('span', { class: 'pick-text' },
          h('strong', null, p.name),
          h('small', null, [TYPES[p.type].label, formatGoal(p)].filter(Boolean).join(' · ')))));
    }
    form.append(group);
  }
  form.append(h('div', { class: 'sticky-actions' }, submit));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit(presets.filter((p) => chosen.has(p.key)));
  });
  updateSubmit();
  return form;
}

export function renderOnboarding() {
  return h('div', { class: 'stack' },
    h('section', { class: 'hero' },
      h('h1', null, 'Bienvenue 👋'),
      h('p', null, 'Choisis ce que tu veux suivre chaque jour. Commence petit : 5 à 8 métriques que tu rempliras vraiment. Tu pourras en créer d\'autres, les modifier ou les retirer à tout moment.'),
      h('p', { class: 'muted' }, 'Tes données restent sur cet appareil. ', h('a', { href: '#/settings' }, 'Importer une sauvegarde'))),
    presetPicker({
      presets: PRESETS,
      preselect: PRESETS.filter((p) => p.recommended).map((p) => p.key),
      submitLabel: (n) => (n ? `Commencer avec ${n} métrique${n > 1 ? 's' : ''}` : 'Choisis au moins une métrique'),
      onSubmit: (list) => {
        addMetrics(list.map((p) => ({ ...p, preset: p.key })));
        navigate('#/today');
      },
    }));
}

export function renderLibrary() {
  const used = new Set(getState().metrics.map((m) => m.preset).filter(Boolean));
  const available = PRESETS.filter((p) => !used.has(p.key));
  const head = h('header', { class: 'page-head' },
    h('a', { class: 'back', href: '#/settings' }, '‹ Réglages'),
    h('h1', null, 'Bibliothèque'),
    h('p', { class: 'muted' }, 'Des métriques prêtes à l\'emploi. Tu peux ajuster leur objectif ensuite.'));
  if (!available.length) {
    return h('div', { class: 'stack' }, head, h('p', { class: 'card' }, 'Tu as déjà ajouté toutes les métriques de la bibliothèque. ', h('a', { href: '#/metric/new' }, 'Créer la tienne')));
  }
  return h('div', { class: 'stack' }, head, presetPicker({
    presets: available,
    preselect: [],
    submitLabel: (n) => (n ? `Ajouter ${n} métrique${n > 1 ? 's' : ''}` : 'Sélectionne des métriques'),
    onSubmit: (list) => {
      addMetrics(list.map((p) => ({ ...p, preset: p.key })));
      toast(`${list.length} métrique${list.length > 1 ? 's' : ''} ajoutée${list.length > 1 ? 's' : ''}`);
      navigate('#/settings');
    },
  }));
}
