// "Aujourd'hui": fill in every active metric for a given day.

import { h } from '../ui.js';
import { getState, activeMetrics, getValue, setValue } from '../store.js';
import { today, addDays, formatDay, dayOfYear, daysInYear, diffDays } from '../dates.js';
import { formatGoal, goalMet, isFilled, parseTime, formatTime } from '../metrics.js';
import { loggingStreak } from '../stats.js';
import { renderOnboarding } from './library.js';
import { navigate } from '../router.js';

const TARGET_YEAR = 2027;

const parseNum = (s) => {
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null; // null = invalid input
};

function yearBanner(t) {
  const y = Number(t.slice(0, 4));
  if (y < TARGET_YEAR) {
    const left = diffDays(t, `${TARGET_YEAR}-01-01`);
    return h('section', { class: 'banner' },
      h('div', { class: 'banner-figure' }, `J-${left}`),
      h('div', null,
        h('strong', null, `avant ${TARGET_YEAR}`),
        h('p', null, 'Profite de ces semaines pour roder tes métriques : garde celles que tu remplis vraiment, ajuste les objectifs. Le 1er janvier, tu seras prêt.')));
  }
  const d = dayOfYear(t);
  const total = daysInYear(y);
  return h('section', { class: 'banner' },
    h('div', { class: 'banner-figure' }, `${Math.round((d / total) * 100)} %`),
    h('div', { class: 'grow' },
      h('strong', null, `${y} · jour ${d} sur ${total}`),
      h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': d, 'aria-label': `Avancement de l'année ${y}` },
        h('span', { style: { width: `${(d / total) * 100}%` } }))));
}

function backupReminder() {
  const { lastBackup } = getState().settings;
  const hasData = Object.keys(getState().entries).length >= 7;
  if (!hasData) return null;
  const age = lastBackup ? diffDays(lastBackup.slice(0, 10), today()) : Infinity;
  if (age < 30) return null;
  return h('a', { class: 'notice', href: '#/settings' },
    '💾 ', lastBackup ? `Dernière sauvegarde il y a ${age} jours.` : 'Aucune sauvegarde pour l\'instant.',
    ' Tes données ne sont que sur cet appareil : exporte-les.');
}

// ---------- controls ----------

function segButtons(options, current, onPick, cls = '') {
  const group = h('div', { class: `seg-group ${cls}`, role: 'group' });
  const buttons = options.map(([value, label, aria]) => {
    const b = h('button', { type: 'button', class: 'seg', 'aria-pressed': String(current === value), 'aria-label': aria || null }, label);
    b.addEventListener('click', () => {
      const next = current === value ? undefined : value; // click again to clear
      current = next;
      for (const [i, btn] of buttons.entries()) btn.setAttribute('aria-pressed', String(options[i][0] === next));
      onPick(next);
    });
    return b;
  });
  group.append(...buttons);
  return group;
}

function numberField({ value, unit, label, onValue, inputmode = 'decimal', width = '' }) {
  const input = h('input', {
    type: 'text', inputmode, autocomplete: 'off', class: `num ${width}`, 'aria-label': label,
    value: isFilled(value) ? String(value).replace('.', ',') : '', placeholder: '—',
  });
  input.addEventListener('input', () => {
    const n = parseNum(input.value);
    input.classList.toggle('invalid', n === null);
    if (n !== null) onValue(n);
  });
  return h('label', { class: 'num-field' }, input, unit ? h('span', { class: 'unit' }, unit) : null);
}

function controlFor(metric, value, save) {
  switch (metric.type) {
    case 'boolean':
      return segButtons([[true, 'Oui'], [false, 'Non']], value, save, 'yesno');
    case 'scale': {
      const max = metric.max || 5;
      const opts = Array.from({ length: max }, (_, i) => [i + 1, String(i + 1), `${i + 1} sur ${max}`]);
      return segButtons(opts, value, save, `scale scale-${max}`);
    }
    case 'count': {
      let cur = value;
      const field = numberField({ value, unit: metric.unit, label: metric.name, inputmode: 'numeric', width: 'narrow', onValue: (n) => { cur = n === undefined ? undefined : Math.max(0, Math.round(n)); save(cur); } });
      const input = field.querySelector('input');
      const bump = (d) => {
        cur = Math.max(0, (isFilled(cur) ? cur : 0) + d);
        input.value = String(cur);
        input.classList.remove('invalid');
        save(cur);
      };
      return h('div', { class: 'counter' },
        h('button', { type: 'button', class: 'round', 'aria-label': 'Moins un', onclick: () => bump(-1) }, '−'),
        field,
        h('button', { type: 'button', class: 'round', 'aria-label': 'Plus un', onclick: () => bump(1) }, '+'));
    }
    case 'number':
      return numberField({ value, unit: metric.unit, label: metric.name, onValue: save });
    case 'duration': {
      const hh = isFilled(value) ? Math.floor(value / 60) : '';
      const mm = isFilled(value) ? Math.round(value % 60) : '';
      const hIn = h('input', { type: 'text', inputmode: 'numeric', class: 'num narrow', 'aria-label': `${metric.name} : heures`, value: String(hh), placeholder: '0' });
      const mIn = h('input', { type: 'text', inputmode: 'numeric', class: 'num narrow', 'aria-label': `${metric.name} : minutes`, value: String(mm), placeholder: '00' });
      const onInput = () => {
        const a = parseNum(hIn.value);
        const b = parseNum(mIn.value);
        hIn.classList.toggle('invalid', a === null || a < 0);
        mIn.classList.toggle('invalid', b === null || b < 0);
        if (a === null || b === null || a < 0 || b < 0) return;
        if (a === undefined && b === undefined) save(undefined);
        else save(Math.round((a || 0) * 60 + (b || 0)));
      };
      hIn.addEventListener('input', onInput);
      mIn.addEventListener('input', onInput);
      return h('div', { class: 'duration' },
        h('label', { class: 'num-field' }, hIn, h('span', { class: 'unit' }, 'h')),
        h('label', { class: 'num-field' }, mIn, h('span', { class: 'unit' }, 'min')));
    }
    case 'time': {
      const input = h('input', { type: 'time', class: 'time', 'aria-label': metric.name, value: isFilled(value) ? formatTime(value) : '' });
      input.addEventListener('input', () => save(input.value ? parseTime(input.value) ?? undefined : undefined));
      return input;
    }
    case 'text': {
      const ta = h('textarea', { rows: 3, 'aria-label': metric.name, placeholder: 'Écris quelques mots…' }, isFilled(value) ? value : '');
      const grow = () => {
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight + 2}px`;
      };
      ta.addEventListener('input', () => {
        grow();
        save(ta.value.trim() ? ta.value : undefined);
      });
      requestAnimationFrame(grow);
      return ta;
    }
    default:
      return h('p', null, 'Type inconnu');
  }
}

function statusFor(metric, v) {
  if (!isFilled(v)) return null;
  const met = goalMet(metric, v);
  if (met === true) return h('span', { class: 'status good' }, '✓ Objectif atteint');
  if (met === false) return h('span', { class: 'status miss' }, '○ Pas atteint');
  return h('span', { class: 'status done' }, '✓ Noté');
}

function metricCard(metric, date, onChange) {
  const statusHost = h('div', { class: 'mc-status' }, statusFor(metric, getValue(date, metric.id)));
  const save = (v) => {
    setValue(date, metric.id, v);
    statusHost.replaceChildren(statusFor(metric, v) || '');
    card.classList.toggle('filled', isFilled(v));
    onChange();
  };
  const card = h('article', { class: `card metric-card type-${metric.type}`, 'data-id': metric.id },
    h('header', { class: 'mc-head' },
      metric.emoji ? h('span', { class: 'mc-emoji', 'aria-hidden': 'true' }, metric.emoji) : null,
      h('div', { class: 'mc-title' },
        h('h3', null, metric.name),
        metric.goal ? h('span', { class: 'mc-goal' }, formatGoal(metric)) : null),
      statusHost),
    controlFor(metric, getValue(date, metric.id), save));
  card.classList.toggle('filled', isFilled(getValue(date, metric.id)));
  return card;
}

export function renderToday(dateParam) {
  if (!getState().metrics.length) return renderOnboarding();
  const t = today();
  const date = dateParam && dateParam <= t ? dateParam : t;
  const metrics = activeMetrics();
  const isToday = date === t;

  const progressText = h('span');
  const meter = h('span');
  const streakText = h('span', { class: 'streak' });
  const refreshSummary = () => {
    const day = getState().entries[date] || {};
    const filled = metrics.filter((m) => isFilled(day[m.id])).length;
    progressText.textContent = `${filled}/${metrics.length} renseignée${filled > 1 ? 's' : ''}`;
    meter.style.width = `${metrics.length ? (filled / metrics.length) * 100 : 0}%`;
    const st = loggingStreak(metrics, getState().entries, t);
    streakText.textContent = st.current ? `🔥 ${st.current} jour${st.current > 1 ? 's' : ''} de suite` : '';
  };

  const jump = h('input', { type: 'date', class: 'date-jump', max: t, value: date, 'aria-label': 'Aller à une date' });
  jump.addEventListener('change', () => jump.value && navigate(`#/today/${jump.value}`));

  const nav = h('section', { class: 'day-nav' },
    h('a', { class: 'icon-btn', href: `#/today/${addDays(date, -1)}`, 'aria-label': 'Jour précédent' }, '‹'),
    h('div', { class: 'day-title' },
      h('h1', null, isToday ? 'Aujourd\'hui' : formatDay(date)),
      h('span', { class: 'muted' }, isToday ? formatDay(date) : `${date.slice(0, 4)} · jour ${dayOfYear(date)}`)),
    isToday
      ? h('span', { class: 'icon-btn disabled', 'aria-hidden': 'true' }, '›')
      : h('a', { class: 'icon-btn', href: `#/today/${addDays(date, 1)}`, 'aria-label': 'Jour suivant' }, '›'));

  const tools = h('div', { class: 'day-tools' },
    jump,
    isToday ? null : h('a', { class: 'btn small', href: '#/today' }, 'Revenir à aujourd\'hui'));

  const summary = h('section', { class: 'summary' },
    h('div', { class: 'summary-row' }, progressText, streakText),
    h('div', { class: 'meter', 'aria-hidden': 'true' }, meter));

  const list = h('div', { class: 'metric-list' });
  if (!metrics.length) {
    list.append(h('p', { class: 'card' }, 'Aucune métrique active. ', h('a', { href: '#/settings' }, 'Ajoutes-en dans les réglages.')));
  }
  const categories = [...new Set(metrics.map((m) => m.category || ''))];
  for (const cat of categories) {
    const group = h('section', { class: 'group' }, cat ? h('h2', { class: 'group-title' }, cat) : null);
    for (const m of metrics.filter((x) => (x.category || '') === cat)) group.append(metricCard(m, date, refreshSummary));
    list.append(group);
  }

  refreshSummary();
  return h('div', { class: 'stack' },
    nav, tools,
    isToday ? yearBanner(t) : null,
    isToday ? backupReminder() : null,
    summary, list,
    h('p', { class: 'muted center small' }, 'Tout est enregistré automatiquement.'));
}

