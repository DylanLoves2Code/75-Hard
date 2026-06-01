// Unit tests for v4 deeper-tracking pure functions:
//   - getMeasurementsDiff (js/measurements.js)
//   - buildWellbeingTrend (js/wellbeing.js)
//   - pickFailureDay / getFailureLog (js/failure.js)
//
// As with tests/state.test.mjs, we install a tiny localStorage polyfill
// before importing the modules since several import state.js, which
// touches localStorage on load.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- localStorage polyfill -------------------------------------------------
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => { memStore.set(k, String(v)); },
  removeItem: (k) => { memStore.delete(k); },
  clear: () => { memStore.clear(); },
};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
};

const { getMeasurementsDiff } = await import('../js/measurements.js');
const { buildWellbeingTrend } = await import('../js/wellbeing.js');
const { pickFailureDay, getFailureLog } = await import('../js/failure.js');
const { defaultState, updateDayData, saveState } = await import('../js/state.js');

// --- getMeasurementsDiff ---------------------------------------------------

test('getMeasurementsDiff: empty state yields []', () => {
  assert.deepEqual(getMeasurementsDiff(null), []);
  assert.deepEqual(getMeasurementsDiff(undefined), []);
  assert.deepEqual(getMeasurementsDiff({}), []);
  assert.deepEqual(getMeasurementsDiff({days:{}}), []);
});

test('getMeasurementsDiff: requires ≥ 2 days per metric — singleton is omitted', () => {
  const s = defaultState('2025-01-01', 'X');
  s.days[1] = { measurements: { waist: 36.0 } };
  // Only one day with waist; nothing else recorded.
  assert.deepEqual(getMeasurementsDiff(s), []);
});

test('getMeasurementsDiff: computes first → last delta per metric, rounded to 0.1', () => {
  const s = defaultState('2025-01-01', 'X');
  s.days[1]  = { measurements: { waist: 36.0, chest: 41.0 } };
  s.days[10] = { measurements: { waist: 34.5 } };
  s.days[20] = { measurements: { waist: 33.5, chest: 42.5, arms: 14.0 } };
  s.days[30] = { measurements: { arms: 14.7 } };
  const diff = getMeasurementsDiff(s);
  // Build a key->row map for easier assertions; result is ordered by FIELDS.
  const byKey = Object.fromEntries(diff.map(d => [d.key, d]));
  assert.equal(Object.keys(byKey).length, 3, 'waist, chest, arms');
  // Waist: 36.0 (D1) -> 33.5 (D20), delta -2.5.
  assert.equal(byKey.waist.firstDay, 1);
  assert.equal(byKey.waist.lastDay, 20);
  assert.equal(byKey.waist.first, 36.0);
  assert.equal(byKey.waist.last, 33.5);
  assert.equal(byKey.waist.delta, -2.5);
  // Chest: 41.0 (D1) -> 42.5 (D20).
  assert.equal(byKey.chest.delta, 1.5);
  // Arms: 14.0 (D20) -> 14.7 (D30), delta +0.7.
  assert.equal(byKey.arms.firstDay, 20);
  assert.equal(byKey.arms.lastDay, 30);
  assert.equal(byKey.arms.delta, 0.7);
});

test('getMeasurementsDiff: skips non-numeric or invalid values', () => {
  const s = defaultState('2025-01-01', 'X');
  s.days[1] = { measurements: { waist: 'oops' } };
  s.days[2] = { measurements: { waist: 35.0 } };
  s.days[3] = { measurements: { waist: 34.0 } };
  const diff = getMeasurementsDiff(s);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].first, 35.0);
  assert.equal(diff[0].last, 34.0);
});

test('getMeasurementsDiff: day keys are sorted numerically (not lexically)', () => {
  // Stringified keys "2" < "10" lexically would scramble the order.
  const s = defaultState('2025-01-01', 'X');
  s.days[2]  = { measurements: { waist: 36.0 } };
  s.days[10] = { measurements: { waist: 34.0 } };
  const diff = getMeasurementsDiff(s);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].firstDay, 2);
  assert.equal(diff[0].lastDay, 10);
  assert.equal(diff[0].delta, -2.0);
});

// --- buildWellbeingTrend ---------------------------------------------------

test('buildWellbeingTrend: returns empty when no wellbeing data', () => {
  // calcCurrentDay() with no saved state returns 1 — so the loop runs once
  // and finds nothing. Result is [].
  memStore.clear();
  const s = defaultState('2025-01-01', 'X');
  assert.deepEqual(buildWellbeingTrend(s, 'mood'), []);
});

test('buildWellbeingTrend: 7-day rolling average per dimension', () => {
  // Pin the challenge to day 5 by writing state with startDate 4 days ago.
  memStore.clear();
  const today = new Date();
  today.setDate(today.getDate() - 4); // start 4 days ago -> day 5
  const ds = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const s = defaultState(ds, 'X');
  saveState(s);
  // mood: 3, 4, _, 5, 5 -> rolling averages
  updateDayData(s, 1, { wellbeing: { mood: 3, energy: null, discipline: null } });
  updateDayData(s, 2, { wellbeing: { mood: 4, energy: null, discipline: null } });
  updateDayData(s, 4, { wellbeing: { mood: 5, energy: null, discipline: null } });
  updateDayData(s, 5, { wellbeing: { mood: 5, energy: null, discipline: null } });
  saveState(s);
  const series = buildWellbeingTrend(s, 'mood');
  // Day 1: avg of {3} = 3.0
  // Day 2: avg of {3,4} = 3.5
  // Day 3: avg of {3,4} = 3.5 (window 1..3 — day 3 has no data, still counted in window)
  // Day 4: avg of {3,4,5} = 4.0
  // Day 5: avg of {3,4,5,5} = 4.25 -> rounded 4.3
  assert.equal(series.length, 5);
  assert.deepEqual(series.map(p => p.value), [3.0, 3.5, 3.5, 4.0, 4.3]);
});

// --- pickFailureDay --------------------------------------------------------

test('pickFailureDay: returns null at day 1 or earlier', () => {
  const s = defaultState('2025-01-01', 'X');
  assert.equal(pickFailureDay(s, 1), null);
  assert.equal(pickFailureDay(s, 0), null);
});

test('pickFailureDay: returns null when prior day was complete', () => {
  const s = defaultState('2025-01-01', 'X');
  updateDayData(s, 1, {
    dietAdherence: true, w1: true, w2: true, read: true, water: true, photo: true,
  });
  assert.equal(pickFailureDay(s, 2), null);
});

test('pickFailureDay: returns prior day when incomplete and never asked', () => {
  const s = defaultState('2025-01-01', 'X');
  updateDayData(s, 1, { dietAdherence: true }); // not complete
  // failureReason defaults to null (via DAY_DEFAULTS merge in getDayData).
  assert.equal(pickFailureDay(s, 2), 1);
});

test('pickFailureDay: returns null when prior day already has reason recorded', () => {
  const s = defaultState('2025-01-01', 'X');
  updateDayData(s, 1, { dietAdherence: true, failureReason: 'traveled' });
  assert.equal(pickFailureDay(s, 2), null);
});

test('pickFailureDay: returns null when prior day was previously skipped', () => {
  const s = defaultState('2025-01-01', 'X');
  // Skipped = empty string, persists so we don't ask again.
  updateDayData(s, 1, { dietAdherence: true, failureReason: '' });
  assert.equal(pickFailureDay(s, 2), null);
});

// --- getFailureLog ---------------------------------------------------------

test('getFailureLog: empty / null / no failures yields []', () => {
  assert.deepEqual(getFailureLog(null), []);
  assert.deepEqual(getFailureLog({}), []);
  assert.deepEqual(getFailureLog({days: {}}), []);
  const s = defaultState('2025-01-01', 'X');
  assert.deepEqual(getFailureLog(s), []);
});

test('getFailureLog: lists only days with non-empty reasons, ascending', () => {
  const s = defaultState('2025-01-01', 'X');
  updateDayData(s, 10, { failureReason: 'traveled, missed reading' });
  updateDayData(s, 3,  { failureReason: 'sick' });
  updateDayData(s, 7,  { failureReason: '' }); // skipped, excluded
  updateDayData(s, 5,  { failureReason: null }); // never asked, excluded
  const log = getFailureLog(s);
  assert.deepEqual(log, [
    { day: 3,  reason: 'sick' },
    { day: 10, reason: 'traveled, missed reading' },
  ]);
});
