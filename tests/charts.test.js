import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriesPoints } from '../src/charts.js';
import { createMetric } from '../src/metrics.js';
import { rangeDates } from '../src/dates.js';

test('daily points up to 90 days, weekly averages beyond', () => {
  const m = createMetric({ id: 'x', type: 'number' });
  const dates = rangeDates('2027-01-01', '2027-03-31'); // 90 days
  const entries = Object.fromEntries(dates.map((d, i) => [d, { x: i % 2 ? 10 : 20 }]));
  assert.equal(seriesPoints(m, entries, dates).points.length, 90);

  const year = rangeDates('2027-01-01', '2027-12-31');
  const { points, weekly } = seriesPoints(m, { '2027-12-31': { x: 4 }, '2027-12-30': { x: 6 } }, year);
  assert.ok(weekly);
  assert.equal(points.length, 53);
  const last = points[points.length - 1];
  assert.equal(last.end, '2027-12-31');
  assert.equal(last.start, '2027-12-25');
  assert.equal(last.value, 5);
  assert.equal(last.count, 2);
  assert.equal(points[0].value, null);
});

test('weekly time averages stay continuous around midnight', () => {
  const m = createMetric({ id: 't', type: 'time' });
  const year = rangeDates('2027-01-01', '2027-12-31');
  const { points } = seriesPoints(m, { '2027-12-30': { t: 23 * 60 + 40 }, '2027-12-31': { t: 20 } }, year);
  assert.equal(points[points.length - 1].raw, 0);
});
