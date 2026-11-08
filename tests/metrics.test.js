import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetric, goalMet, isSuccess, formatValue, formatGoal, clockDiff, coerceValue, PRESETS, parseTime } from '../src/metrics.js';

test('every preset builds a valid metric', () => {
  const keys = new Set();
  for (const p of PRESETS) {
    const m = createMetric(p);
    assert.equal(m.type, p.type, p.key);
    assert.equal(m.preset, p.key);
    assert.ok(!keys.has(p.key), `duplicate preset ${p.key}`);
    keys.add(p.key);
  }
});

test('goals: min / max / boolean', () => {
  const sleep = createMetric({ type: 'duration', goal: { op: 'min', value: 450 } });
  assert.equal(goalMet(sleep, 480), true);
  assert.equal(goalMet(sleep, 420), false);
  assert.equal(goalMet(sleep, undefined), null);
  const alcohol = createMetric({ type: 'count', goal: { op: 'max', value: 1 } });
  assert.equal(goalMet(alcohol, 0), true);
  assert.equal(goalMet(alcohol, 2), false);
  const smoke = createMetric({ type: 'boolean', goal: { op: 'eq', value: false } });
  assert.equal(goalMet(smoke, false), true);
  assert.equal(isSuccess(smoke, true), false);
});

test('time goals wrap around midnight', () => {
  const bed = createMetric({ type: 'time', goal: { op: 'max', value: 23 * 60 + 30 } });
  assert.equal(goalMet(bed, 23 * 60), true); // 23:00 before 23:30
  assert.equal(goalMet(bed, 30), false); // 00:30 is after 23:30
  const wake = createMetric({ type: 'time', goal: { op: 'max', value: 6 * 60 + 30 } });
  assert.equal(goalMet(wake, 4 * 60 + 30), true);
  assert.equal(clockDiff(30, 1410), 60);
  assert.equal(clockDiff(1410, 30), -60);
});

test('success without goal', () => {
  assert.equal(isSuccess(createMetric({ type: 'boolean' }), true), true);
  assert.equal(isSuccess(createMetric({ type: 'boolean' }), false), false);
  assert.equal(isSuccess(createMetric({ type: 'number' }), 0), true);
  assert.equal(isSuccess(createMetric({ type: 'text' }), ''), false);
});

test('formatting', () => {
  assert.equal(formatValue(createMetric({ type: 'duration' }), 450), '7\u00a0h\u00a030');
  assert.equal(formatValue(createMetric({ type: 'duration' }), 45), '45\u00a0min');
  assert.equal(formatValue(createMetric({ type: 'time' }), 1395), '23:15');
  assert.equal(formatValue(createMetric({ type: 'scale', max: 10 }), 7), '7/10');
  assert.equal(formatValue(createMetric({ type: 'number', unit: 'kg' }), 72.5), '72,5\u00a0kg');
  assert.equal(formatValue(createMetric({ type: 'boolean' }), false), 'Non');
  assert.equal(formatGoal(createMetric({ type: 'time', goal: { op: 'max', value: 1380 } })), 'Objectif : avant 23:00');
  assert.equal(parseTime('7:05'), 425);
  assert.equal(parseTime('24:00'), null);
});

test('coerceValue rejects values of the wrong type', () => {
  assert.equal(coerceValue(createMetric({ type: 'scale', max: 5 }), 7), undefined);
  assert.equal(coerceValue(createMetric({ type: 'boolean' }), 'yes'), undefined);
  assert.equal(coerceValue(createMetric({ type: 'count' }), -1), undefined);
  assert.equal(coerceValue(createMetric({ type: 'number' }), '72.4'), 72.4);
});
