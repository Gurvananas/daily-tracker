// "Année": year in pixels — 12 month columns × 31 day rows, one cell per day.

import { h, pct } from '../ui.js';
import { getState, activeMetrics, getMetric, setSetting } from '../store.js';
import { today, rangeDates, daysInMonth, pad, formatDay, MONTH_INITIALS, MONTH_NAMES } from '../dates.js';
import { formatValue, goalMet, isFilled, metricLabel } from '../metrics.js';
import { heatLevel, valueRange, summarize, dayCompletion } from '../stats.js';
import { legendFor, heatLegend } from '../charts.js';
import { rerender } from '../router.js';

const OVERVIEW = '';

function overviewLevel(metrics, entries, date) {
  const r = dayCompletion(metrics, entries, date);
  return r === 0 ? 0 : Math.max(1, Math.ceil(r * 5));
}

/** Longest run of consecutive "success" days inside the list of dates. */
function bestRunIn(dates, ok) {
  let best = 0;
  let run = 0;
  for (const d of dates) {
    run = ok(d) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function renderYear(yearParam) {
  const state = getState();
  const t = today();
  const year = Number(yearParam) || Number(t.slice(0, 4));
  const metrics = activeMetrics();
  const { entries } = state;
  const selectedId = state.settings.yearMetric;
  const metric = selectedId ? getMetric(selectedId) : null;
  const yearDates = rangeDates(`${year}-01-01`, `${year}-12-31`);
  const elapsed = yearDates.filter((d) => d <= t);
  const range = metric ? valueRange(metric, entries, yearDates) : null;

  // --- controls
  const select = h('select', { class: 'select', 'aria-label': 'Métrique affichée' },
    h('option', { value: OVERVIEW }, 'Vue d\'ensemble — assiduité'),
    state.metrics.filter((m) => !m.archived || m.id === selectedId).map((m) => h('option', { value: m.id }, metricLabel(m))));
  select.value = metric ? metric.id : OVERVIEW;
  select.addEventListener('change', () => {
    setSetting('yearMetric', select.value);
    rerender();
  });

  const head = h('header', { class: 'page-head' },
    h('div', { class: 'year-switch' },
      h('a', { class: 'icon-btn', href: `#/year/${year - 1}`, 'aria-label': `Année ${year - 1}` }, '‹'),
      h('h1', null, String(year)),
      h('a', { class: 'icon-btn', href: `#/year/${year + 1}`, 'aria-label': `Année ${year + 1}` }, '›')),
    year !== 2027 ? h('a', { class: 'btn small', href: '#/year/2027' }, 'Voir 2027') : null);

  // --- grid
  const grid = h('div', { class: 'pixels', role: 'grid', 'aria-label': `Année ${year}` });
  grid.append(h('span', { class: 'px-corner', 'aria-hidden': 'true' }));
  MONTH_INITIALS.forEach((m, i) => grid.append(h('span', { class: 'px-month', title: MONTH_NAMES[i], 'aria-hidden': 'true' }, m)));
  for (let day = 1; day <= 31; day += 1) {
    grid.append(h('span', { class: 'px-day', 'aria-hidden': 'true' }, day % 5 === 0 || day === 1 ? String(day) : ''));
    for (let month = 0; month < 12; month += 1) {
      if (day > daysInMonth(year, month)) {
        grid.append(h('span', { class: 'cell na', 'aria-hidden': 'true' }));
        continue;
      }
      const d = `${year}-${pad(month + 1)}-${pad(day)}`;
      const future = d > t;
      let level = 0;
      let tipValue = future ? 'À venir' : 'Pas de donnée';
      let tipLabel = formatDay(d);
      if (!future) {
        if (metric) {
          const v = entries[d]?.[metric.id];
          level = heatLevel(metric, v, range).level;
          if (isFilled(v)) {
            tipValue = formatValue(metric, v);
            if (metric.type === 'text') tipValue = tipValue.length > 60 ? `${tipValue.slice(0, 60)}…` : tipValue;
            const met = goalMet(metric, v);
            if (met !== null) tipLabel += met ? ' · objectif atteint' : ' · objectif manqué';
          }
        } else {
          level = overviewLevel(metrics, entries, d);
          if (level) tipValue = `${pct(dayCompletion(metrics, entries, d))} rempli`;
        }
      }
      const cls = `cell lv${level}${future ? ' future' : ''}${d === t ? ' today' : ''}`;
      grid.append(future
        ? h('span', { class: cls, 'data-tip': tipValue, 'data-tip-label': tipLabel })
        : h('a', { class: cls, href: `#/today/${d}`, 'data-tip': tipValue, 'data-tip-label': tipLabel, 'aria-label': `${tipLabel} : ${tipValue}` }));
    }
  }

  const legend = metric
    ? legendFor(metric)
    : h('div', { class: 'legend' },
      h('span', { class: 'legend-item' }, 'Peu rempli'),
      [1, 2, 3, 4, 5].map((lv) => h('span', { class: `swatch lv${lv}`, 'aria-hidden': 'true' })),
      h('span', { class: 'legend-item' }, 'Tout rempli'));
  const legendExtra = heatLegend([['0 future', 'À venir']]);

  // --- summary
  let summary;
  if (!elapsed.length) {
    summary = h('p', { class: 'muted' }, year === 2027 && t < '2027-01-01'
      ? 'Cette grille se remplira jour après jour à partir du 1er janvier 2027. Un pixel par jour, 365 pixels pour l\'année.'
      : 'Cette année n\'a pas encore commencé.');
  } else if (metric) {
    const sum = summarize(metric, entries, elapsed[0], elapsed[elapsed.length - 1]);
    const figs = [`${sum.filled} jour${sum.filled > 1 ? 's' : ''} renseigné${sum.filled > 1 ? 's' : ''} sur ${elapsed.length}`];
    if (sum.avg !== null) figs.push(`moyenne ${formatValue(metric, sum.avg, { digits: 1 })}`);
    if (metric.sum && sum.sum) figs.push(`total ${formatValue(metric, sum.sum, { digits: 1 })}`);
    if (metric.type === 'boolean' && sum.filled) figs.push(`oui ${pct(sum.yes / sum.filled)} des jours`);
    if (sum.goalRate !== null) figs.push(`objectif atteint ${pct(sum.goalRate)} du temps`);
    summary = h('p', null, figs.join(' · '));
  } else {
    const logged = elapsed.filter((d) => overviewLevel(metrics, entries, d) > 0);
    const best = bestRunIn(elapsed, (d) => overviewLevel(metrics, entries, d) > 0);
    summary = h('p', null, `${logged.length} jour${logged.length > 1 ? 's' : ''} suivi${logged.length > 1 ? 's' : ''} sur ${elapsed.length} · plus longue série ${best} jour${best > 1 ? 's' : ''}`);
  }

  return h('div', { class: 'stack' },
    head,
    h('div', { class: 'filters-row' }, select),
    h('section', { class: 'card year-card' }, grid, h('div', { class: 'legends' }, legend, legendExtra)),
    h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Bilan'), summary));
}
