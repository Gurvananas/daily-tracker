// Hand-rolled SVG charts: single-series line / column charts and day grids.
// One metric per chart → one color (accent), no legend box; the card title names it.

import { h, s, showTip, hideTip } from './ui.js';
import { formatShort, formatMonth, formatDay, weekdayMon } from './dates.js';
import { niceTicks, durationTicks, unwrapTime, circularMean, heatLevel, valueRange } from './stats.js';
import { formatAxis, formatValue, isFilled, goalMet } from './metrics.js';

/** Redraw `draw(width)` into container whenever its width changes. */
export function mountResponsive(container, draw) {
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    if (!container.isConnected) {
      ro.disconnect();
      return;
    }
    const w = Math.floor(container.clientWidth);
    if (w > 0 && w !== lastW) {
      lastW = w;
      container.replaceChildren(draw(w));
    }
  });
  ro.observe(container);
  return container;
}

export function usesColumns(metric, n) {
  const additive = metric.type === 'count' || metric.type === 'duration' || (metric.type === 'number' && metric.sum);
  return additive && n <= 45;
}

function xTicks(dates, pw, weekly) {
  const n = dates.length;
  const maxLabels = Math.max(2, Math.floor(pw / 64));
  if (n > 62 || weekly) {
    const idx = [];
    dates.forEach((d, i) => i > 0 && d.slice(0, 7) !== dates[i - 1].slice(0, 7) && idx.push(i));
    const k = Math.ceil(idx.length / maxLabels);
    return { idx: idx.filter((_, j) => j % k === 0), fmt: formatMonth };
  }
  const step = Math.max(1, Math.ceil(n / maxLabels));
  const idx = [];
  for (let i = n - 1; i >= 0; i -= step) idx.unshift(i);
  return { idx, fmt: formatShort };
}

function barPath(cx, w, yTop, yBase) {
  const r = Math.min(4, w / 2, Math.abs(yBase - yTop));
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  return `M${x0},${yBase}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x1 - r}Q${x1},${yTop} ${x1},${yTop + r}V${yBase}Z`;
}

/** Line (or column) chart of one metric over the given dates. */
export function seriesChart(metric, entries, dates) {
  const wrap = h('div', { class: 'chart' });
  return mountResponsive(wrap, (w) => drawSeries(metric, entries, dates, w));
}

/**
 * Points to plot: one per day up to 90 days, otherwise one weekly average per
 * 7-day bucket (ending on the last date) so a whole year stays readable.
 */
export function seriesPoints(metric, entries, dates) {
  const weekly = dates.length > 90;
  const size = weekly ? 7 : 1;
  const groups = [];
  for (let end = dates.length; end > 0; end -= size) groups.unshift(dates.slice(Math.max(0, end - size), end));
  const all = dates.map((d) => entries[d]?.[metric.id]).filter(isFilled).map(Number);
  const center = metric.type === 'time' && all.length ? circularMean(all) : null;
  const points = groups.map((g) => {
    const nums = g.map((d) => entries[d]?.[metric.id]).filter(isFilled).map(Number);
    let value = null;
    let raw;
    if (!weekly) {
      raw = entries[g[0]]?.[metric.id];
      if (nums.length) value = center !== null ? unwrapTime(nums[0], center) : nums[0];
    } else if (nums.length) {
      if (center !== null) {
        const m = circularMean(nums);
        raw = m;
        value = unwrapTime(m, center);
      } else {
        value = nums.reduce((a, b) => a + b, 0) / nums.length;
        raw = value;
      }
    }
    return { start: g[0], end: g[g.length - 1], value, raw, count: nums.length };
  });
  return { points, weekly, center };
}

function drawSeries(metric, entries, dates, width) {
  const { points, weekly, center } = seriesPoints(metric, entries, dates);
  const n = points.length;
  const raw = points.map((p) => p.raw);
  const vals = points.map((p) => p.value);
  const labelDates = points.map((p) => p.end);
  const columns = usesColumns(metric, n) && !weekly;
  let goalV = metric.goal && metric.type !== 'boolean' ? Number(metric.goal.value) : null;
  if (goalV !== null && center !== null) goalV = unwrapTime(goalV, center);

  const pts = vals.filter((v) => v !== null);
  if (goalV !== null) pts.push(goalV);
  let lo = pts.length ? Math.min(...pts) : 0;
  let hi = pts.length ? Math.max(...pts) : 1;
  if (columns) lo = Math.min(0, lo);

  let ticks;
  if (metric.type === 'scale') ticks = metric.max === 10 ? [1, 4, 7, 10] : [1, 2, 3, 4, 5];
  else if (metric.type === 'duration' || metric.type === 'time') ticks = durationTicks(lo, hi);
  else ticks = niceTicks(lo, hi, 4, { integer: metric.type === 'count' || (metric.type === 'number' && (metric.step ?? 1) >= 1) });
  if (columns && ticks[0] > 0) ticks.unshift(0);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];

  const H = 188;
  const top = 12;
  const bottom = 26;
  const hasGoal = goalV !== null;
  const right = hasGoal ? 58 : 10; // room for the "objectif" direct label
  const labels = ticks.map((t) => formatAxis(metric, t));
  const left = Math.ceil(Math.max(...labels.map((l) => l.length)) * 6.8 + 12);
  const pw = Math.max(40, width - left - right);
  const ph = H - top - bottom;
  const y = (v) => top + ph - ((v - y0) / (y1 - y0 || 1)) * ph;
  const band = pw / n;
  const x = columns
    ? (i) => left + band * i + band / 2
    : (i) => (n === 1 ? left + pw / 2 : left + (i / (n - 1)) * pw);

  const svg = s('svg', {
    class: 'chart-svg',
    width,
    height: H,
    viewBox: `0 0 ${width} ${H}`,
    role: 'img',
    tabindex: 0,
    'aria-label': `Évolution de ${metric.name} sur ${dates.length} jours${weekly ? ' (moyennes hebdomadaires)' : ''}. Flèches gauche/droite pour parcourir.`,
  });

  // grid + y labels
  ticks.forEach((t, k) => {
    svg.append(s('line', { class: k === 0 && columns ? 'axis' : 'grid', x1: left, x2: left + pw, y1: y(t), y2: y(t) }));
    svg.append(s('text', { class: 'tick', x: left - 8, y: y(t) + 4, 'text-anchor': 'end' }, labels[k]));
  });

  // x labels
  const xt = xTicks(labelDates, pw, weekly);
  for (const i of xt.idx) {
    const cx = x(i);
    const anchor = cx - 26 < left - 6 ? 'start' : cx + 26 > width ? 'end' : 'middle';
    svg.append(s('text', { class: 'tick', x: anchor === 'start' ? Math.max(cx - 4, left - 6) : cx, y: H - 8, 'text-anchor': anchor }, xt.fmt(labelDates[i])));
  }

  // goal reference
  if (hasGoal && goalV >= y0 && goalV <= y1) {
    const gy = y(goalV);
    svg.append(s('line', { class: 'goal', x1: left, x2: left + pw + 4, y1: gy, y2: gy }));
    svg.append(s('text', { class: 'goal-label', x: left + pw + 8, y: gy + 4, 'text-anchor': 'start' }, 'objectif'));
  }

  // marks
  if (columns) {
    const bw = Math.max(1.5, Math.min(24, band - 2));
    vals.forEach((v, i) => {
      if (v === null || v === y0) return;
      svg.append(s('path', { class: 'bar', d: barPath(x(i), bw, y(v), y(y0)) }));
    });
  } else {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    if (d) svg.append(s('path', { class: 'line', d }));
    vals.forEach((v, i) => {
      if (v === null) return;
      const isolated = (i === 0 || vals[i - 1] === null) && (i === n - 1 || vals[i + 1] === null);
      if (n <= 31 || isolated) svg.append(s('circle', { class: 'dot', cx: x(i), cy: y(v), r: 4 }));
    });
  }

  // hover / focus layer
  const cross = s('line', { class: 'crosshair', x1: 0, x2: 0, y1: top, y2: top + ph, visibility: 'hidden' });
  const hot = s('circle', { class: 'dot hot', r: 5, cx: 0, cy: 0, visibility: 'hidden' });
  const overlay = s('rect', { x: left, y: 0, width: pw, height: top + ph, fill: 'transparent' });
  svg.append(cross, hot, overlay);

  let idx = -1;
  const lastFilled = () => {
    for (let i = n - 1; i >= 0; i -= 1) if (vals[i] !== null) return i;
    return n - 1;
  };
  const show = (i) => {
    idx = Math.max(0, Math.min(n - 1, i));
    const cx = x(idx);
    cross.setAttribute('x1', cx);
    cross.setAttribute('x2', cx);
    cross.setAttribute('visibility', 'visible');
    const v = vals[idx];
    if (v !== null) {
      hot.setAttribute('cx', cx);
      hot.setAttribute('cy', y(v));
      hot.setAttribute('visibility', 'visible');
    } else hot.setAttribute('visibility', 'hidden');
    const r = svg.getBoundingClientRect();
    const py = r.top + (v !== null ? y(v) : top + ph / 2);
    const p = points[idx];
    let label;
    if (weekly) {
      label = `Moyenne du ${formatShort(p.start)} au ${formatShort(p.end)} (${p.count} j)`;
    } else {
      const met = goalMet(metric, raw[idx]);
      label = formatDay(p.end) + (met === null ? '' : met ? ' · objectif atteint' : ' · objectif manqué');
    }
    showTip({ left: r.left + cx, top: py - 6, width: 0, height: 12, bottom: py + 6 },
      isFilled(raw[idx]) ? formatValue(metric, raw[idx], { digits: 1 }) : 'Pas de donnée', label);
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    hot.setAttribute('visibility', 'hidden');
    hideTip();
  };
  const fromPointer = (e) => {
    const lx = e.clientX - svg.getBoundingClientRect().left;
    show(columns ? Math.floor((lx - left) / band) : Math.round(((lx - left) / pw) * (n - 1)));
  };
  svg.addEventListener('pointermove', fromPointer);
  svg.addEventListener('pointerdown', fromPointer);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => show(idx >= 0 ? idx : lastFilled()));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(n - 1);
    else return;
    e.preventDefault();
  });
  return svg;
}

/** Grid of day cells (strip for ≤ 31 days, week columns beyond). Each cell links to its day. */
export function dayGrid(metric, entries, dates) {
  const range = metric ? valueRange(metric, entries, dates) : null;
  const n = dates.length;
  let grid;
  if (n <= 31) {
    grid = h('div', { class: 'daystrip', style: { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, maxWidth: `${n * 30}px` } });
  } else {
    const offset = weekdayMon(dates[0]);
    const cols = Math.ceil((offset + n) / 7);
    grid = h('div', { class: 'daygrid', style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 18}px` } });
    for (let i = 0; i < offset; i += 1) grid.append(h('span', { class: 'cell pad', 'aria-hidden': 'true' }));
  }
  for (const d of dates) {
    const v = entries[d]?.[metric.id];
    const { level } = heatLevel(metric, v, range);
    let tipText = isFilled(v) ? formatValue(metric, v) : 'Pas de donnée';
    if (metric.type === 'text' && isFilled(v)) tipText = tipText.length > 60 ? `${tipText.slice(0, 60)}…` : tipText;
    grid.append(h('a', {
      class: `cell lv${level}`,
      href: `#/today/${d}`,
      'data-tip': tipText,
      'data-tip-label': formatDay(d),
      'aria-label': `${formatDay(d)} : ${tipText}`,
    }));
  }
  return grid;
}

/** Legend row of swatches: [[level, label], …] */
export function heatLegend(items) {
  return h('div', { class: 'legend' }, items.map(([lv, label]) =>
    h('span', { class: 'legend-item' }, h('span', { class: `swatch lv${lv}`, 'aria-hidden': 'true' }), label)));
}

export function legendFor(metric) {
  if (metric.type === 'boolean') return heatLegend([[4, 'Oui'], [1, 'Non'], [0, 'Pas de donnée']]);
  if (metric.type === 'text') return heatLegend([[4, 'Écrit'], [0, 'Rien']]);
  if (metric.goal && metric.type !== 'scale') return heatLegend([[4, 'Objectif atteint'], [1, 'Manqué'], [0, 'Pas de donnée']]);
  return h('div', { class: 'legend' },
    h('span', { class: 'legend-item' }, 'Moins'),
    [1, 2, 3, 4, 5].map((lv) => h('span', { class: `swatch lv${lv}`, 'aria-hidden': 'true' })),
    h('span', { class: 'legend-item' }, 'Plus'),
    h('span', { class: 'legend-item' }, h('span', { class: 'swatch lv0', 'aria-hidden': 'true' }), 'Pas de donnée'));
}
