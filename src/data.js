// Pure data functions: schema, validation, import/merge and CSV export.

import { isISODate } from './dates.js';
import { createMetric, coerceValue, csvHeader, csvValue, isFilled } from './metrics.js';

export const SCHEMA_VERSION = 1;

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    metrics: [],
    entries: {},
    settings: { theme: 'auto', lastBackup: null, statsPeriod: '30', yearMetric: '' },
  };
}

/** Validate & clean any (possibly hand-edited or older) state object. */
export function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const seen = new Set();
  const metrics = [];
  for (const m of Array.isArray(raw.metrics) ? raw.metrics : []) {
    if (!m || typeof m !== 'object') continue;
    const metric = createMetric(m);
    if (seen.has(metric.id)) continue;
    seen.add(metric.id);
    metrics.push(metric);
  }
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const entries = {};
  const rawEntries = raw.entries && typeof raw.entries === 'object' ? raw.entries : {};
  for (const [date, day] of Object.entries(rawEntries)) {
    if (!isISODate(date) || !day || typeof day !== 'object') continue;
    const clean = {};
    for (const [id, v] of Object.entries(day)) {
      const metric = byId.get(id);
      if (!metric) continue;
      const cv = coerceValue(metric, v);
      if (cv !== undefined) clean[id] = cv;
    }
    if (Object.keys(clean).length) entries[date] = clean;
  }
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const settings = {
    ...base.settings,
    theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',
    lastBackup: typeof s.lastBackup === 'string' ? s.lastBackup : null,
    statsPeriod: typeof s.statsPeriod === 'string' ? s.statsPeriod : base.settings.statsPeriod,
    yearMetric: typeof s.yearMetric === 'string' ? s.yearMetric : '',
  };
  return { version: SCHEMA_VERSION, metrics, entries, settings };
}

/**
 * Merge an imported state into the current one.
 * Metrics are matched by id; imported values win for the same day & metric.
 */
export function mergeStates(current, incoming) {
  const a = normalizeState(current);
  const b = normalizeState(incoming);
  const metrics = [...a.metrics];
  const ids = new Set(metrics.map((m) => m.id));
  for (const m of b.metrics) if (!ids.has(m.id)) metrics.push(m);
  const entries = structuredClone(a.entries);
  for (const [date, day] of Object.entries(b.entries)) {
    entries[date] = { ...(entries[date] || {}), ...day };
  }
  return normalizeState({ ...a, metrics, entries });
}

export function exportPayload(state) {
  return {
    app: 'daily-tracker',
    exportedAt: new Date().toISOString(),
    ...normalizeState(state),
  };
}

const csvCell = (s) => (/[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** One row per logged day, one column per metric (archived ones included). */
export function toCSV(state) {
  const { metrics, entries } = normalizeState(state);
  const header = ['date', ...metrics.map(csvHeader)];
  const lines = [header.map(csvCell).join(',')];
  for (const date of Object.keys(entries).sort()) {
    const day = entries[date];
    if (!metrics.some((m) => isFilled(day[m.id]))) continue;
    lines.push([date, ...metrics.map((m) => csvValue(m, day[m.id]))].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
