import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_FIELDS, OFF, resolveMapping, planUpdates } from '../src/health.js';
import { createMetric } from '../src/metrics.js';
import { normalizeState, mergeStates } from '../src/data.js';

const steps = createMetric({ id: 's', preset: 'steps', type: 'number', unit: 'pas' });
const sleep = createMetric({ id: 'z', preset: 'sleep', type: 'duration' });
const bed = createMetric({ id: 'b', preset: 'bedtime', type: 'time' });
const myWalk = createMetric({ id: 'w', type: 'count', name: 'Marche' });
const field = (k) => HEALTH_FIELDS.find((f) => f.key === k);

test('mapping: preset by default, explicit choice, off, incompatible type', () => {
  const metrics = [steps, sleep, bed, myWalk];
  assert.equal(resolveMapping(field('steps'), metrics, {}).id, 's');
  assert.equal(resolveMapping(field('steps'), metrics, { steps: 'w' }).id, 'w');
  assert.equal(resolveMapping(field('steps'), metrics, { steps: OFF }), null);
  assert.equal(resolveMapping(field('sleep'), metrics, { sleep: 'b' }), null); // time ≠ duration
  assert.equal(resolveMapping(field('wakeup'), metrics, {}), null);
  const archived = createMetric({ ...steps, archived: true });
  assert.equal(resolveMapping(field('steps'), [archived], {}), null);
});

test('planUpdates fills empty and synced values, never manual ones', () => {
  const mappings = [
    { field: field('steps'), metric: steps },
    { field: field('sleep'), metric: sleep },
    { field: field('bedtime'), metric: bed },
    { field: field('wakeup'), metric: null },
  ];
  const values = { '2027-01-01': { s: 5000, z: 400 }, '2027-01-02': { s: 1200 } };
  const synced = { '2027-01-01': ['s'] }; // 01-01 steps came from a sync, sleep was typed by hand
  const days = [
    { date: '2027-01-01', steps: 8123, sleepMinutes: 455.4, bedtime: 1395, wakeup: 430 },
    { date: '2027-01-02', steps: 3000 },
    { date: '2027-01-03', sleepMinutes: 0 },
  ];
  const updates = planUpdates(days, mappings, {
    getValue: (d, id) => values[d]?.[id],
    isSynced: (d, id) => Boolean(synced[d]?.includes(id)),
  });
  assert.deepEqual(updates, [
    { date: '2027-01-01', id: 's', value: 8123 },
    { date: '2027-01-01', id: 'b', value: 1395 },
  ]);
});

test('planUpdates skips unchanged values', () => {
  const updates = planUpdates([{ date: '2027-01-01', steps: 5000 }], [{ field: field('steps'), metric: steps }], {
    getValue: () => 5000,
    isSynced: () => true,
  });
  assert.deepEqual(updates, []);
});

test('synced flags survive normalization and imports', () => {
  const base = { metrics: [steps, sleep], entries: { '2027-01-01': { s: 10, z: 400 } }, synced: { '2027-01-01': ['s', 'zz'], '2027-01-05': ['s'] } };
  const n = normalizeState(base);
  assert.deepEqual(n.synced, { '2027-01-01': ['s'] });
  assert.deepEqual(n.settings.health, { map: {}, lastSync: null, lastResult: null });
  const merged = mergeStates(n, { metrics: [steps], entries: { '2027-01-01': { s: 99 } } });
  assert.deepEqual(merged.entries['2027-01-01'], { s: 99, z: 400 });
  assert.deepEqual(merged.synced, {}); // imported value replaced the synced one
});
