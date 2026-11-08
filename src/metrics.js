// Metric definitions: types, presets, value formatting and goal evaluation.
// Values are stored as:
//   boolean  → true / false
//   scale    → integer 1..max
//   number   → number
//   count    → integer ≥ 0
//   duration → minutes (number)
//   time     → minutes since midnight (0..1439)
//   text     → string

import { pad } from './dates.js';

export const TYPES = {
  boolean: { label: 'Oui / Non', hint: 'Fait ou pas fait (sport, méditation…)' },
  scale: { label: 'Note', hint: 'Une note de 1 à 5 ou de 1 à 10 (humeur, énergie…)' },
  number: { label: 'Nombre', hint: 'Une valeur libre avec unité (poids, pas, €…)' },
  count: { label: 'Compteur', hint: 'Un compteur avec boutons + / − (verres d\'eau, cafés…)' },
  duration: { label: 'Durée', hint: 'Heures et minutes (sommeil, sport, écrans…)' },
  time: { label: 'Heure', hint: 'Une heure de la journée (coucher, réveil…)' },
  text: { label: 'Texte', hint: 'Une note libre (journal, gratitude…)' },
};

export const NUMERIC_TYPES = new Set(['scale', 'number', 'count', 'duration', 'time']);

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

/** Library of ready-to-use metrics. `key` identifies a preset once added. */
export const PRESETS = [
  { key: 'sleep', name: 'Sommeil', emoji: '😴', category: 'Sommeil', type: 'duration', goal: { op: 'min', value: 450 }, sum: false, recommended: true },
  { key: 'bedtime', name: 'Heure du coucher', emoji: '🛏️', category: 'Sommeil', type: 'time', goal: { op: 'max', value: 23 * 60 } },
  { key: 'wakeup', name: 'Heure du réveil', emoji: '⏰', category: 'Sommeil', type: 'time', goal: { op: 'max', value: 7 * 60 } },
  { key: 'mood', name: 'Humeur', emoji: '😊', category: 'Esprit', type: 'scale', max: 5, recommended: true },
  { key: 'energy', name: 'Énergie', emoji: '⚡', category: 'Esprit', type: 'scale', max: 5, recommended: true },
  { key: 'stress', name: 'Stress', emoji: '😮‍💨', category: 'Esprit', type: 'scale', max: 5, goal: { op: 'max', value: 2 } },
  { key: 'meditation', name: 'Méditation', emoji: '🧘', category: 'Esprit', type: 'duration', goal: { op: 'min', value: 10 }, sum: true },
  { key: 'weight', name: 'Poids', emoji: '⚖️', category: 'Corps', type: 'number', unit: 'kg', step: 0.1 },
  { key: 'steps', name: 'Pas', emoji: '👟', category: 'Corps', type: 'number', unit: 'pas', step: 1, goal: { op: 'min', value: 8000 }, sum: true },
  { key: 'workout', name: 'Sport', emoji: '🏃', category: 'Corps', type: 'boolean', goal: { op: 'eq', value: true }, recommended: true },
  { key: 'activity', name: 'Activité physique', emoji: '🚴', category: 'Corps', type: 'duration', goal: { op: 'min', value: 30 }, sum: true },
  { key: 'water', name: 'Eau', emoji: '💧', category: 'Corps', type: 'count', unit: 'verres', goal: { op: 'min', value: 8 }, sum: true, recommended: true },
  { key: 'veggies', name: 'Fruits & légumes', emoji: '🥗', category: 'Corps', type: 'count', unit: 'portions', goal: { op: 'min', value: 5 }, sum: true },
  { key: 'alcohol', name: 'Alcool', emoji: '🍷', category: 'Habitudes', type: 'count', unit: 'verres', goal: { op: 'max', value: 1 }, sum: true },
  { key: 'coffee', name: 'Café', emoji: '☕', category: 'Habitudes', type: 'count', unit: 'tasses', goal: { op: 'max', value: 3 }, sum: true },
  { key: 'screen', name: 'Temps d\'écran', emoji: '📱', category: 'Habitudes', type: 'duration', goal: { op: 'max', value: 120 }, sum: true },
  { key: 'reading', name: 'Lecture', emoji: '📚', category: 'Habitudes', type: 'number', unit: 'pages', step: 1, goal: { op: 'min', value: 20 }, sum: true, recommended: true },
  { key: 'deepwork', name: 'Travail profond', emoji: '🎯', category: 'Travail', type: 'duration', goal: { op: 'min', value: 120 }, sum: true },
  { key: 'mit', name: 'Priorité du jour accomplie', emoji: '✅', category: 'Travail', type: 'boolean', goal: { op: 'eq', value: true } },
  { key: 'spending', name: 'Dépenses', emoji: '💶', category: 'Finances', type: 'number', unit: '€', step: 0.01, sum: true },
  { key: 'gratitude', name: 'Gratitude', emoji: '🙏', category: 'Journal', type: 'text' },
  { key: 'journal', name: 'Journal', emoji: '📝', category: 'Journal', type: 'text', recommended: true },
];

/** Build a full metric object from partial data (preset or form). */
export function createMetric(data = {}) {
  const type = TYPES[data.type] ? data.type : 'number';
  const m = {
    id: data.id || uid(),
    name: String(data.name || 'Nouvelle métrique').trim().slice(0, 60),
    emoji: String(data.emoji || '').trim().slice(0, 8),
    category: String(data.category || '').trim().slice(0, 30),
    type,
    unit: type === 'number' || type === 'count' ? String(data.unit || '').trim().slice(0, 15) : '',
    max: type === 'scale' ? (Number(data.max) === 10 ? 10 : 5) : undefined,
    step: type === 'number' ? (Number(data.step) > 0 ? Number(data.step) : 1) : undefined,
    goal: normalizeGoal(type, data.goal),
    sum: data.sum ?? (type === 'count' || type === 'duration'),
    archived: Boolean(data.archived),
  };
  if (data.preset || data.key) m.preset = data.preset || data.key;
  if (type !== 'number' && type !== 'count' && type !== 'duration') m.sum = false;
  for (const k of Object.keys(m)) if (m[k] === undefined) delete m[k];
  return m;
}

export function normalizeGoal(type, goal) {
  if (!goal || typeof goal !== 'object') return null;
  if (type === 'text') return null;
  if (type === 'boolean') {
    return typeof goal.value === 'boolean' ? { op: 'eq', value: goal.value } : null;
  }
  if (goal.op !== 'min' && goal.op !== 'max') return null;
  const value = Number(goal.value);
  if (!Number.isFinite(value)) return null;
  return { op: goal.op, value };
}

export function isFilled(v) {
  return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v));
}

/** Signed circular difference a - b on a 24h clock, in (-720, 720]. */
export function clockDiff(a, b) {
  let d = (((a - b) % 1440) + 1440) % 1440;
  if (d > 720) d -= 1440;
  return d;
}

/** true / false if the metric has a goal and a value, otherwise null. */
export function goalMet(metric, v) {
  const g = metric.goal;
  if (!g || !isFilled(v)) return null;
  if (metric.type === 'boolean') return v === g.value;
  if (metric.type === 'time') {
    const d = clockDiff(v, g.value);
    return g.op === 'max' ? d <= 0 : d >= 0;
  }
  return g.op === 'min' ? v >= g.value : v <= g.value;
}

/** Was the day a "success" for this metric (used for streaks)? */
export function isSuccess(metric, v) {
  if (!isFilled(v)) return false;
  const g = goalMet(metric, v);
  if (g !== null) return g;
  if (metric.type === 'boolean') return v === true;
  return true;
}

// ---------- formatting ----------

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export const formatNumber = (n, digits = 2) => (digits === 1 ? nf1 : nf).format(n);

export function formatDuration(min) {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  // Non-breaking spaces keep "7 h 30" on one line.
  if (h === 0) return `${m}\u00a0min`;
  if (m === 0) return `${h}\u00a0h`;
  return `${h}\u00a0h\u00a0${pad(m)}`;
}

export function formatTime(min) {
  const t = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** Human readable value (used in cards, tooltips, tables). */
export function formatValue(metric, v, { digits = 2 } = {}) {
  if (!isFilled(v)) return '—';
  switch (metric.type) {
    case 'boolean': return v ? 'Oui' : 'Non';
    case 'scale': return `${formatNumber(v, digits)}/${metric.max || 5}`;
    case 'duration': return formatDuration(v);
    case 'time': return formatTime(v);
    case 'text': return String(v);
    default: return metric.unit ? `${formatNumber(v, digits)}\u00a0${metric.unit}` : formatNumber(v, digits);
  }
}

/** Short axis label (no unit for numbers, compact for big values). */
export function formatAxis(metric, v) {
  if (metric.type === 'duration') {
    const h = v / 60;
    return Number.isInteger(h) ? `${h}\u00a0h` : formatDuration(v);
  }
  if (metric.type === 'time') return formatTime(v);
  if (Math.abs(v) >= 10000) return `${formatNumber(v / 1000, 1)}\u00a0k`;
  return formatNumber(v, 2);
}

export function formatGoal(metric) {
  const g = metric.goal;
  if (!g) return '';
  if (metric.type === 'boolean') return g.value ? 'Objectif : oui' : 'Objectif : non';
  if (metric.type === 'time') return g.op === 'max' ? `Objectif : avant ${formatTime(g.value)}` : `Objectif : après ${formatTime(g.value)}`;
  const val = formatValue(metric, g.value);
  return g.op === 'min' ? `Objectif : ≥ ${val}` : `Objectif : ≤ ${val}`;
}

export function metricLabel(metric) {
  return metric.emoji ? `${metric.emoji} ${metric.name}` : metric.name;
}

/** Value written in CSV / spreadsheet friendly form. */
export function csvValue(metric, v) {
  if (!isFilled(v)) return '';
  switch (metric.type) {
    case 'boolean': return v ? '1' : '0';
    case 'time': return formatTime(v);
    case 'text': return String(v);
    default: return String(v);
  }
}

export function csvHeader(metric) {
  if (metric.type === 'duration') return `${metric.name} (min)`;
  if (metric.unit) return `${metric.name} (${metric.unit})`;
  if (metric.type === 'scale') return `${metric.name} (/${metric.max || 5})`;
  return metric.name;
}

/** Coerce a raw imported value to the metric's type, or undefined if invalid. */
export function coerceValue(metric, v) {
  if (!isFilled(v)) return undefined;
  switch (metric.type) {
    case 'boolean': return typeof v === 'boolean' ? v : undefined;
    case 'text': return typeof v === 'string' ? v.slice(0, 5000) : undefined;
    case 'time': {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n < 1440 ? Math.round(n) : undefined;
    }
    case 'scale': {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 && n <= (metric.max || 5) ? Math.round(n) : undefined;
    }
    case 'count': {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
    }
    default: {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
  }
}
