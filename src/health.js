// Health Connect sync (Android app only): steps and sleep written by the COROS app.

import { getState, setSetting, setSyncedValues, isSyncedValue, getValue } from './store.js';
import { today, addDays, rangeDates } from './dates.js';
import { isFilled } from './metrics.js';
import { isNative, native } from './native.js';

/** What Health Connect provides, and which metric types can receive it. */
export const HEALTH_FIELDS = [
  { key: 'steps', label: 'Pas', types: ['number', 'count'], read: (d) => d.steps },
  { key: 'sleep', label: 'Durée de sommeil', types: ['duration'], read: (d) => d.sleepMinutes },
  { key: 'bedtime', label: 'Heure du coucher', types: ['time'], read: (d) => d.bedtime },
  { key: 'wakeup', label: 'Heure du réveil', types: ['time'], read: (d) => d.wakeup },
];

export const OFF = 'off';

/** Metric receiving a health field: explicit choice, or the matching preset by default. */
export function resolveMapping(field, metrics, map = {}) {
  const choice = map[field.key];
  if (choice === OFF) return null;
  const usable = (m) => m && !m.archived && field.types.includes(m.type);
  if (choice) {
    const m = metrics.find((x) => x.id === choice);
    return usable(m) ? m : null;
  }
  return metrics.find((m) => usable(m) && m.preset === field.key) || null;
}

export function healthMappings(state = getState()) {
  return HEALTH_FIELDS.map((field) => ({ field, metric: resolveMapping(field, state.metrics, state.settings.health.map) }));
}

export function healthMetricIds(state = getState()) {
  return new Set(healthMappings(state).filter((x) => x.metric).map((x) => x.metric.id));
}

/**
 * Values to write for the days read from Health Connect. A value is written when
 * the day is empty for that metric, or when it was itself filled by a previous sync
 * (never over a value typed by hand).
 */
export function planUpdates(days, mappings, { getValue: get, isSynced }) {
  const updates = [];
  for (const day of days) {
    for (const { field, metric } of mappings) {
      if (!metric) continue;
      let v = field.read(day);
      if (v === undefined || v === null || !Number.isFinite(Number(v))) continue;
      v = Math.round(Number(v));
      if (field.key === 'sleep' && v <= 0) continue;
      const current = get(day.date, metric.id);
      if (isFilled(current) && !isSynced(day.date, metric.id)) continue;
      if (current === v) continue;
      updates.push({ date: day.date, id: metric.id, value: v });
    }
  }
  return updates;
}

export async function healthStatus() {
  if (!isNative()) return { sdk: 'web', granted: false, steps: false, sleep: false };
  return native('HealthSync', 'status');
}

export const requestHealthAccess = () => native('HealthSync', 'requestAccess');
export const openHealthConnect = () => native('HealthSync', 'openHealthConnect');

let running = null;

/** Read the last `days` days and fill the mapped metrics. Returns { read, updated }. */
export function syncHealth({ days } = {}) {
  if (!isNative()) return Promise.resolve({ read: 0, updated: 0, skipped: true });
  if (running) return running;
  running = (async () => {
    const state = getState();
    const mappings = healthMappings(state);
    if (!mappings.some((x) => x.metric)) return { read: 0, updated: 0, skipped: true };
    const status = await healthStatus();
    if (!status.granted && !status.steps && !status.sleep) return { read: 0, updated: 0, skipped: true };
    const t = today();
    // First sync: Health Connect gives access to the last 30 days. Afterwards a week is enough
    // (the watch can sync late, and yesterday's steps keep changing until midnight).
    const n = days || (state.settings.health.lastSync ? 7 : 30);
    const dates = rangeDates(addDays(t, -(n - 1)), t);
    const res = await native('HealthSync', 'readDays', { dates });
    const updates = planUpdates(res.days || [], mappings, { getValue, isSynced: isSyncedValue });
    setSyncedValues(updates);
    const result = { read: dates.length, updated: updates.length };
    setSetting('health', { ...getState().settings.health, lastSync: new Date().toISOString(), lastResult: result });
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Sync at most every few minutes (app start, app back in the foreground). */
export async function autoSync() {
  const last = getState().settings.health.lastSync;
  if (last && Date.now() - new Date(last).getTime() < 3 * 60 * 1000) return null;
  try {
    return await syncHealth();
  } catch (err) {
    console.warn('Synchronisation Health Connect impossible', err);
    return null;
  }
}

export function setHealthMapping(key, value) {
  const health = getState().settings.health;
  setSetting('health', { ...health, map: { ...health.map, [key]: value } });
}

