import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetric } from '../src/metrics.js';
import { summarize, streaks, loggingStreak, circularMean, niceTicks, durationTicks, heatLevel, dayCompletion } from '../src/stats.js';

const water = createMetric({ id: 'w', type: 'count', goal: { op: 'min', value: 8 } });
const mood = createMetric({ id: 'm', type: 'scale', max: 5 });
const bed = createMetric({ id: 'b', type: 'time' });

const entries = {
  '2027-01-01': { w: 8, m: 4, b: 23 * 60 + 30 },
  '2027-01-02': { w: 9, m: 2, b: 30 },
  '2027-01-03': { w: 5 },
  '2027-01-04': { w: 10, m: 5 },
  '2027-01-05': { w: 8 },
};

test('summarize numeric metric', () => {
  const s = summarize(water, entries, '2027-01-01', '2027-01-07');
  assert.equal(s.days, 7);
  assert.equal(s.filled, 5);
  assert.equal(s.sum, 40);
  assert.equal(s.avg, 8);
  assert.equal(s.min, 5);
  assert.equal(s.max, 10);
  assert.equal(s.goalOk, 4);
  assert.equal(s.goalRate, 0.8);
});

test('time averages around midnight', () => {
  assert.equal(circularMean([23 * 60 + 30, 30]), 0);
  const s = summarize(bed, entries, '2027-01-01', '2027-01-02');
  assert.equal(s.avg, 0);
  assert.equal(s.min, 23 * 60 + 30);
  assert.equal(s.max, 30);
});

test('streaks: current tolerates an unfilled today, best is the longest run', () => {
  assert.deepEqual(streaks(water, entries, '2027-01-05'), { current: 2, best: 2 });
  assert.deepEqual(streaks(water, entries, '2027-01-06'), { current: 2, best: 2 });
  assert.deepEqual(streaks(water, entries, '2027-01-08'), { current: 0, best: 2 });
  assert.deepEqual(loggingStreak([water, mood], entries, '2027-01-05'), { current: 5, best: 5 });
});

test('day completion', () => {
  assert.equal(dayCompletion([water, mood], entries, '2027-01-03'), 0.5);
  assert.equal(dayCompletion([water, mood], entries, '2027-01-10'), 0);
});

test('ticks are round and cover the range', () => {
  const t = niceTicks(3, 97);
  assert.ok(t[0] <= 3 && t[t.length - 1] >= 97);
  assert.deepEqual(niceTicks(0, 10), [0, 2.5, 5, 7.5, 10]);
  assert.deepEqual(niceTicks(0, 10, 4, { integer: true }), [0, 5, 10]);
  assert.ok(niceTicks(0, 3, 4, { integer: true }).every(Number.isInteger));
  const d = durationTicks(380, 520);
  assert.ok(d[0] <= 380 && d[d.length - 1] >= 520);
  assert.ok(d.every((v) => v % 60 === 0));
});

test('heat levels', () => {
  assert.equal(heatLevel(mood, undefined).level, 0);
  assert.equal(heatLevel(mood, 5).level, 5);
  assert.equal(heatLevel(mood, 1).level, 1);
  assert.deepEqual(heatLevel(water, 9), { level: 4, met: true });
  assert.deepEqual(heatLevel(water, 3), { level: 1, met: false });
});
