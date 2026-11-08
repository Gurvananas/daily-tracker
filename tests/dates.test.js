import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, rangeDates, dayOfYear, daysInYear, isISODate, weekdayMon } from '../src/dates.js';

test('addDays crosses months, years and DST changes', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
  assert.equal(addDays('2027-03-28', 1), '2027-03-29'); // EU DST switch
  assert.equal(addDays('2027-10-31', 1), '2027-11-01');
});

test('diffDays and rangeDates', () => {
  assert.equal(diffDays('2026-11-08', '2027-01-01'), 54);
  assert.equal(rangeDates('2027-01-01', '2027-12-31').length, 365);
  assert.equal(rangeDates('2028-01-01', '2028-12-31').length, 366);
  assert.deepEqual(rangeDates('2027-01-02', '2027-01-01'), []);
});

test('dayOfYear, daysInYear, weekday', () => {
  assert.equal(dayOfYear('2027-01-01'), 1);
  assert.equal(dayOfYear('2027-12-31'), 365);
  assert.equal(daysInYear(2027), 365);
  assert.equal(weekdayMon('2027-01-01'), 4); // Friday
});

test('isISODate rejects invalid dates', () => {
  assert.ok(isISODate('2027-02-28'));
  assert.ok(!isISODate('2027-02-29'));
  assert.ok(!isISODate('2027-1-01'));
  assert.ok(!isISODate(null));
});
