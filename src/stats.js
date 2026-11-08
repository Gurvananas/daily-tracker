// Pure statistics helpers — no DOM, easy to test.

import { addDays, diffDays, rangeDates } from './dates.js';
import { isFilled, goalMet, isSuccess, clockDiff, NUMERIC_TYPES } from './metrics.js';

export const valueOf = (entries, date, metric) => entries[date]?.[metric.id];

/** Circular mean of times (minutes since midnight). */
export function circularMean(mins) {
  if (!mins.length) return null;
  let x = 0;
  let y = 0;
  for (const m of mins) {
    const a = (m / 1440) * 2 * Math.PI;
    x += Math.cos(a);
    y += Math.sin(a);
  }
  const a = Math.atan2(y / mins.length, x / mins.length);
  return Math.round((((a / (2 * Math.PI)) * 1440) % 1440 + 1440) % 1440);
}

/** Express a clock time relative to a center so values around midnight stay contiguous. */
export const unwrapTime = (v, center) => center + clockDiff(v, center);

/** Summary of a metric over [start, end]. */
export function summarize(metric, entries, start, end) {
  const dates = rangeDates(start, end);
  const vals = [];
  let goalEval = 0;
  let goalOk = 0;
  let yes = 0;
  for (const d of dates) {
    const v = valueOf(entries, d, metric);
    if (!isFilled(v)) continue;
    vals.push(v);
    const g = goalMet(metric, v);
    if (g !== null) {
      goalEval += 1;
      if (g) goalOk += 1;
    }
    if (v === true) yes += 1;
  }
  const res = {
    days: dates.length,
    filled: vals.length,
    fillRate: dates.length ? vals.length / dates.length : 0,
    goalEval,
    goalOk,
    goalRate: goalEval ? goalOk / goalEval : null,
    yes,
    avg: null,
    min: null,
    max: null,
    sum: null,
  };
  if (NUMERIC_TYPES.has(metric.type) && vals.length) {
    let nums = vals.map(Number);
    if (metric.type === 'time') {
      const center = circularMean(nums);
      nums = nums.map((v) => unwrapTime(v, center));
    }
    const total = nums.reduce((a, b) => a + b, 0);
    const wrap = (v) => (metric.type === 'time' ? ((Math.round(v) % 1440) + 1440) % 1440 : v);
    res.avg = wrap(total / nums.length);
    res.min = wrap(Math.min(...nums));
    res.max = wrap(Math.max(...nums));
    res.sum = metric.type === 'time' ? null : total;
  }
  return res;
}

/** Count consecutive days ending at `today` (or yesterday if today isn't a success yet). */
function currentRun(isOk, today) {
  let d = isOk(today) ? today : addDays(today, -1);
  let n = 0;
  while (isOk(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

function bestRun(sortedDates) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sortedDates) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** Current & best streak of "success" days for a metric. */
export function streaks(metric, entries, today) {
  const isOk = (d) => isSuccess(metric, valueOf(entries, d, metric));
  const okDates = Object.keys(entries).filter((d) => d <= today && isOk(d)).sort();
  return { current: currentRun(isOk, today), best: bestRun(okDates) };
}

/** Streak of days where at least one metric was logged. */
export function loggingStreak(metrics, entries, today) {
  const ids = new Set(metrics.map((m) => m.id));
  const isOk = (d) => {
    const day = entries[d];
    if (!day) return false;
    return Object.keys(day).some((id) => ids.has(id) && isFilled(day[id]));
  };
  const okDates = Object.keys(entries).filter((d) => d <= today && isOk(d)).sort();
  return { current: currentRun(isOk, today), best: bestRun(okDates) };
}

/** Share of the given metrics filled on a date (0..1). */
export function dayCompletion(metrics, entries, date) {
  if (!metrics.length) return 0;
  const day = entries[date] || {};
  const filled = metrics.filter((m) => isFilled(day[m.id])).length;
  return filled / metrics.length;
}

/** Nice round ticks covering [min, max]. */
export function niceTicks(min, max, count = 4, { integer = false } = {}) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 && !integer ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.5; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
    if (ticks.length > 20) break;
  }
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1e6) / 1e6);
  return ticks;
}

/** Ticks for durations (minutes) aligned on hours or half hours when possible. */
export function durationTicks(min, max, count = 4) {
  const span = Math.max(max - min, 1);
  const steps = [5, 10, 15, 30, 60, 120, 180, 240, 360, 720];
  const step = steps.find((s) => span / s <= count) || 1440;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v < max + step; v += step) ticks.push(v);
  if (ticks.length < 2) ticks.push(start + step);
  return ticks;
}

/**
 * Level 0..5 used by heatmaps: 0 = no data, 1..5 = intensity.
 * Returns { level, met } where `met` is the goal result (or null).
 */
export function heatLevel(metric, v, range) {
  if (!isFilled(v)) return { level: 0, met: null };
  const met = goalMet(metric, v);
  if (metric.type === 'boolean') return { level: v ? 4 : 1, met };
  if (metric.type === 'text') return { level: 4, met };
  if (metric.type === 'scale') {
    const max = metric.max || 5;
    return { level: Math.max(1, Math.min(5, Math.ceil((v / max) * 5))), met };
  }
  if (met !== null) return { level: met ? 4 : 1, met };
  if (!range || range.max === range.min) return { level: 3, met };
  let x = v;
  let lo = range.min;
  let hi = range.max;
  if (metric.type === 'time' && range.center != null) {
    x = unwrapTime(v, range.center);
    lo = unwrapTime(range.min, range.center);
    hi = unwrapTime(range.max, range.center);
  }
  const t = (x - lo) / (hi - lo);
  return { level: Math.max(1, Math.min(5, 1 + Math.floor(t * 4.999))), met };
}

/** Range (min/max) of a metric's values over a list of dates, for heat scaling. */
export function valueRange(metric, entries, dates) {
  const vals = dates.map((d) => valueOf(entries, d, metric)).filter(isFilled).map(Number);
  if (!vals.length) return null;
  if (metric.type === 'time') {
    const center = circularMean(vals);
    const un = vals.map((v) => unwrapTime(v, center));
    const wrap = (v) => ((v % 1440) + 1440) % 1440;
    return { min: wrap(Math.min(...un)), max: wrap(Math.max(...un)), center };
  }
  return { min: Math.min(...vals), max: Math.max(...vals) };
}
