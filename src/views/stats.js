// "Tendances": per-metric summaries and charts over a chosen period.

import { h, pct } from '../ui.js';
import { getState, activeMetrics, setSetting } from '../store.js';
import { today, addDays, rangeDates, formatShortYear, formatDay } from '../dates.js';
import { formatValue, formatGoal, isFilled, NUMERIC_TYPES, metricLabel } from '../metrics.js';
import { summarize, streaks, loggingStreak, dayCompletion } from '../stats.js';
import { seriesChart, dayGrid, legendFor } from '../charts.js';
import { rerender } from '../router.js';

function periodRange(period, t) {
  if (period === 'year') return [`${t.slice(0, 4)}-01-01`, t];
  const n = Number(period) || 30;
  return [addDays(t, -(n - 1)), t];
}

const figure = (label, value, note) => h('div', { class: 'fig' },
  h('span', { class: 'fig-label' }, label),
  h('span', { class: 'fig-value' }, value),
  note ? h('span', { class: 'fig-note' }, note) : null);

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

function metricFigures(metric, sum, st) {
  const figs = [];
  if (metric.type === 'boolean') {
    figs.push(figure('Oui', sum.filled ? pct(sum.yes / sum.filled) : '—', `${sum.yes} / ${plural(sum.filled, 'jour')} renseigné${sum.filled > 1 ? 's' : ''}`));
  } else if (metric.type === 'text') {
    figs.push(figure('Jours écrits', String(sum.filled), `sur ${sum.days}`));
  } else if (sum.filled) {
    figs.push(figure('Moyenne', formatValue(metric, sum.avg, { digits: 1 })));
    if (metric.type === 'time') {
      figs.push(figure('Plus tôt', formatValue(metric, sum.min)), figure('Plus tard', formatValue(metric, sum.max)));
    } else {
      figs.push(figure('Min – max', `${formatValue(metric, sum.min, { digits: 1 })} – ${formatValue(metric, sum.max, { digits: 1 })}`));
    }
    if (metric.sum && sum.sum !== null) figs.push(figure('Total', formatValue(metric, sum.sum, { digits: 1 })));
  } else {
    figs.push(figure('Moyenne', '—', 'aucune donnée'));
  }
  if (sum.goalRate !== null) figs.push(figure('Objectif atteint', pct(sum.goalRate), `${sum.goalOk} / ${plural(sum.goalEval, 'jour')}`));
  if (metric.goal || metric.type === 'boolean' || metric.type === 'text') {
    figs.push(figure('Série', plural(st.current, 'jour'), `record : ${st.best}`));
  }
  figs.push(figure('Renseigné', pct(sum.fillRate), `${sum.filled} / ${sum.days} j`));
  return h('div', { class: 'figs' }, figs);
}

function dataTable(metric, entries, dates) {
  const rows = dates.filter((d) => isFilled(entries[d]?.[metric.id])).reverse();
  const details = h('details', { class: 'table-view' }, h('summary', null, `Voir le tableau (${rows.length})`));
  details.addEventListener('toggle', () => {
    if (!details.open || details.querySelector('table')) return;
    details.append(h('div', { class: 'table-scroll' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Date'), h('th', { scope: 'col' }, metric.name))),
      h('tbody', null, rows.map((d) => h('tr', null,
        h('td', null, h('a', { href: `#/today/${d}` }, formatShortYear(d))),
        h('td', { class: metric.type === 'text' ? 'text-cell' : 'num-cell' }, formatValue(metric, entries[d][metric.id]))))))));
  });
  return details;
}

function metricCard(metric, entries, dates, t) {
  const sum = summarize(metric, entries, dates[0], dates[dates.length - 1]);
  const st = streaks(metric, entries, t);
  const card = h('article', { class: 'card stat-card' },
    h('header', { class: 'sc-head' },
      h('h3', null, metricLabel(metric)),
      metric.goal ? h('span', { class: 'mc-goal' }, formatGoal(metric)) : null),
    metricFigures(metric, sum, st));

  if (NUMERIC_TYPES.has(metric.type)) {
    if (sum.filled) {
      card.append(seriesChart(metric, entries, dates));
      if (dates.length > 90) card.append(h('p', { class: 'chart-note' }, 'Chaque point est la moyenne d\'une semaine.'));
    }
  } else {
    card.append(dayGrid(metric, entries, dates), legendFor(metric));
  }
  if (metric.type === 'text') {
    const recent = dates.filter((d) => isFilled(entries[d]?.[metric.id])).slice(-3).reverse();
    if (recent.length) {
      card.append(h('ul', { class: 'recent' }, recent.map((d) => h('li', null,
        h('a', { href: `#/today/${d}` }, formatDay(d)),
        h('p', null, entries[d][metric.id])))));
    }
  }
  if (sum.filled) card.append(dataTable(metric, entries, dates));
  return card;
}

export function renderStats() {
  const state = getState();
  const t = today();
  const period = state.settings.statsPeriod || '30';
  const [start, end] = periodRange(period, t);
  const dates = rangeDates(start, end);
  const metrics = activeMetrics();
  const { entries } = state;

  const periods = [['7', '7 j'], ['30', '30 j'], ['90', '90 j'], ['365', '1 an'], ['year', t.slice(0, 4)]];
  const filters = h('div', { class: 'seg-group filters', role: 'group', 'aria-label': 'Période' },
    periods.map(([p, label]) => h('button', {
      type: 'button', class: 'seg', 'aria-pressed': String(p === period),
      onclick: () => {
        setSetting('statsPeriod', p);
        rerender();
      },
    }, label)));

  const logged = dates.filter((d) => entries[d] && metrics.some((m) => isFilled(entries[d][m.id]))).length;
  const avgCompletion = dates.reduce((a, d) => a + dayCompletion(metrics, entries, d), 0) / (dates.length || 1);
  const ls = loggingStreak(metrics, entries, t);

  const tiles = h('section', { class: 'tiles' },
    h('div', { class: 'tile' }, h('span', { class: 'fig-label' }, 'Jours suivis'), h('span', { class: 'tile-value' }, String(logged)), h('span', { class: 'fig-note' }, `sur ${dates.length}`)),
    h('div', { class: 'tile' }, h('span', { class: 'fig-label' }, 'Assiduité'), h('span', { class: 'tile-value' }, pct(avgCompletion)), h('span', { class: 'fig-note' }, 'des métriques remplies')),
    h('div', { class: 'tile' }, h('span', { class: 'fig-label' }, 'Série de suivi'), h('span', { class: 'tile-value' }, String(ls.current)), h('span', { class: 'fig-note' }, `record : ${ls.best} j`)));

  const body = metrics.length
    ? metrics.map((m) => metricCard(m, entries, dates, t))
    : [h('p', { class: 'card' }, 'Aucune métrique active. ', h('a', { href: '#/settings' }, 'Va dans les réglages.'))];

  return h('div', { class: 'stack' },
    h('header', { class: 'page-head' },
      h('h1', null, 'Tendances'),
      h('p', { class: 'muted' }, `Du ${formatShortYear(start)} au ${formatShortYear(end)}`)),
    filters, tiles, body);
}
