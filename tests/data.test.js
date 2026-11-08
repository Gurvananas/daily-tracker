import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, mergeStates, toCSV, emptyState } from '../src/data.js';

const base = {
  metrics: [
    { id: 'a', name: 'Sommeil', type: 'duration' },
    { id: 'b', name: 'Humeur, "jour"', type: 'scale', max: 5 },
    { id: 'c', name: 'Sport', type: 'boolean' },
  ],
  entries: {
    '2027-01-02': { a: 450, b: 4, c: true },
    '2027-01-01': { a: 420, b: 9, zz: 3 },
    'not-a-date': { a: 1 },
  },
};

test('normalizeState drops invalid data', () => {
  const s = normalizeState(base);
  assert.deepEqual(Object.keys(s.entries).sort(), ['2027-01-01', '2027-01-02']);
  assert.deepEqual(s.entries['2027-01-01'], { a: 420 }); // b out of range, zz unknown
  assert.equal(s.settings.theme, 'auto');
  assert.deepEqual(normalizeState(null), emptyState());
});

test('mergeStates keeps both sides, incoming wins on conflicts', () => {
  const current = normalizeState(base);
  const incoming = {
    metrics: [{ id: 'a', name: 'Sommeil', type: 'duration' }, { id: 'd', name: 'Eau', type: 'count' }],
    entries: { '2027-01-02': { a: 480 }, '2027-01-03': { d: 6 } },
  };
  const m = mergeStates(current, incoming);
  assert.deepEqual(m.metrics.map((x) => x.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(m.entries['2027-01-02'], { a: 480, b: 4, c: true });
  assert.deepEqual(m.entries['2027-01-03'], { d: 6 });
});

test('CSV export escapes and orders rows', () => {
  const csv = toCSV(base).trim().split('\r\n');
  assert.equal(csv[0], 'date,Sommeil (min),"Humeur, ""jour"" (/5)",Sport');
  assert.equal(csv[1], '2027-01-01,420,,');
  assert.equal(csv[2], '2027-01-02,450,4,1');
});
