// Application state persisted in localStorage (data never leaves the device).

import { emptyState, normalizeState, mergeStates, exportPayload, toCSV } from './data.js';
import { createMetric, isFilled } from './metrics.js';

const KEY = 'daily-tracker:v1';
const listeners = new Set();

function readStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeState(JSON.parse(raw)) : emptyState();
  } catch (err) {
    console.error('Lecture des données impossible', err);
    return emptyState();
  }
}

let state = readStorage();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error(err);
    alert('Impossible d\'enregistrer : stockage du navigateur plein ou bloqué. Exporte tes données depuis les Réglages.');
  }
  for (const fn of listeners) fn(state);
}

export const getState = () => state;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** Reload when another tab changed the data. */
export function reloadFromStorage() {
  state = readStorage();
  for (const fn of listeners) fn(state);
}

export const activeMetrics = () => state.metrics.filter((m) => !m.archived);
export const getMetric = (id) => state.metrics.find((m) => m.id === id);
export const getValue = (date, id) => state.entries[date]?.[id];

function applyValue(entries, synced, date, id, value, fromSync) {
  const day = { ...(entries[date] || {}) };
  if (isFilled(value)) day[id] = value;
  else delete day[id];
  if (Object.keys(day).length) entries[date] = day;
  else delete entries[date];
  const flags = new Set(synced[date] || []);
  if (fromSync && isFilled(value)) flags.add(id);
  else flags.delete(id);
  if (flags.size) synced[date] = [...flags];
  else delete synced[date];
}

/** Value typed by hand (it will no longer be overwritten by the Health Connect sync). */
export function setValue(date, id, value) {
  const entries = { ...state.entries };
  const synced = { ...state.synced };
  applyValue(entries, synced, date, id, value, false);
  state = { ...state, entries, synced };
  persist();
}

/** Values coming from Health Connect: [{ date, id, value }], saved in one go. */
export function setSyncedValues(updates) {
  if (!updates.length) return;
  const entries = { ...state.entries };
  const synced = { ...state.synced };
  for (const u of updates) applyValue(entries, synced, u.date, u.id, u.value, true);
  state = { ...state, entries, synced };
  persist();
}

export const isSyncedValue = (date, id) => Boolean(state.synced[date]?.includes(id));

export function addMetrics(list) {
  const metrics = [...state.metrics, ...list.map(createMetric)];
  state = { ...state, metrics };
  persist();
}

export function updateMetric(id, data) {
  state = {
    ...state,
    metrics: state.metrics.map((m) => (m.id === id ? createMetric({ ...m, ...data, id }) : m)),
  };
  persist();
}

export function moveMetric(id, delta) {
  const metrics = [...state.metrics];
  const i = metrics.findIndex((m) => m.id === id);
  if (i < 0) return;
  // Skip over metrics of the other list (archived vs active) so the move is visible.
  let j = i + delta;
  while (j >= 0 && j < metrics.length && Boolean(metrics[j].archived) !== Boolean(metrics[i].archived)) j += delta;
  if (j < 0 || j >= metrics.length) return;
  [metrics[i], metrics[j]] = [metrics[j], metrics[i]];
  state = { ...state, metrics };
  persist();
}

export function deleteMetric(id) {
  const entries = {};
  for (const [date, day] of Object.entries(state.entries)) {
    const { [id]: _removed, ...rest } = day;
    if (Object.keys(rest).length) entries[date] = rest;
  }
  state = normalizeState({ ...state, metrics: state.metrics.filter((m) => m.id !== id), entries });
  persist();
}

export function countValues(id) {
  return Object.values(state.entries).filter((day) => isFilled(day[id])).length;
}

export function setSetting(key, value) {
  state = { ...state, settings: { ...state.settings, [key]: value } };
  persist();
}

export function exportJSON() {
  return JSON.stringify(exportPayload(state), null, 2);
}

export const exportCSV = () => toCSV(state);

export function importJSON(text, mode = 'merge') {
  const incoming = JSON.parse(text);
  if (!incoming || !Array.isArray(incoming.metrics)) throw new Error('Fichier non reconnu');
  const settings = state.settings;
  state = mode === 'replace' ? normalizeState(incoming) : mergeStates(state, incoming);
  state.settings = { ...state.settings, theme: settings.theme, lastBackup: settings.lastBackup };
  persist();
}

export function resetAll() {
  state = emptyState();
  persist();
}
