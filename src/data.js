// Pure data functions: schema, validation, import/merge and CSV export.

import { isISODate } from './dates.js';
import { createMetric, coerceValue, csvHeader, csvValue, isFilled } from './metrics.js';

export const SCHEMA_VERSION = 1;

export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    metrics: [],
    entries: {},
    settings: { theme: 'auto', lastBackup: null, statsPeriod: '30', yearMetric: '', health: defaultHealth() },
    // Values filled by the Health Connect sync, per day: { '2027-01-01': ['metricId'] }.
    // A value typed by hand is removed from here and is never overwritten by the sync.
    synced: {},
  };
}

export const HEALTH_KEYS = ['steps', 'sleep', 'bedtime', 'wakeup'];

export function defaultHealth() {
  return { map: {}, lastSync: null, lastResult: null };
}

function normalizeHealth(h) {
  const out = defaultHealth();
  if (!h || typeof h !== 'object') return out;
  for (const k of HEALTH_KEYS) {
    const v = h.map?.[k];
    if (typeof v === 'string' && v) out.map[k] = v.slice(0, 40);
  }
  if (typeof h.lastSync === 'string') out.lastSync = h.lastSync;
  if (h.lastResult && typeof h.lastResult === 'object') {
    out.lastResult = { read: Number(h.lastResult.read) || 0, updated: Number(h.lastResult.updated) || 0 };
  }
  return out;
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
    health: normalizeHealth(s.health),
  };
  const synced = {};
  const rawSynced = raw.synced && typeof raw.synced === 'object' ? raw.synced : {};
  for (const [date, ids] of Object.entries(rawSynced)) {
    if (!entries[date] || !Array.isArray(ids)) continue;
    const kept = [...new Set(ids)].filter((id) => id in entries[date]);
    if (kept.length) synced[date] = kept;
  }
  return { version: SCHEMA_VERSION, metrics, entries, settings, synced };
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
  const synced = structuredClone(a.synced);
  for (const [date, day] of Object.entries(b.entries)) {
    entries[date] = { ...(entries[date] || {}), ...day };
    // Imported values replace current ones: their "synced" flag comes from the import.
    const fromImport = new Set(b.synced[date] || []);
    const kept = (synced[date] || []).filter((id) => !(id in day));
    synced[date] = [...kept, ...[...fromImport]];
  }
  return normalizeState({ ...a, metrics, entries, synced });
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
