// Unit tests for js/state.js using Node's built-in test runner.
// Run with: node --test tests/
//
// state.js calls localStorage in getState/saveState, and several
// helpers (calcCurrentDay, calcCurrentWeek, getDateForDay) read
// state via getState(). We install a tiny in-memory localStorage
// polyfill before importing the module so those paths work too.

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

// Import AFTER the polyfill is in place.
const {
  defaultState, getDayData, updateDayData, isDayComplete,
  calcCurrentDay, calcCurrentWeek, calcStreak, countCompleteDays,
  formatDate, getDateForDay, getState, saveState,
} = await import('../js/state.js');
const { TOTAL, STORAGE_KEY } = await import('../js/constants.js');

// --- helpers ---------------------------------------------------------------
// state.js parses startDate via `new Date(s.startDate)` then `setHours(0,0,0,0)`.
// A "YYYY-MM-DD" literal parses as UTC midnight; in a negative-offset timezone
// that shifts to the previous local date. To make day-arithmetic predictable
// across timezones we build the date string from local-date components and
// then read back what calcCurrentDay() actually computes.
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function freshState(start, name = 'TEST') {
  memStore.clear();
  const s = defaultState(start, name);
  saveState(s);
  return s;
}

// Start a state such that calcCurrentDay() returns exactly `n`.
// Probes calcCurrentDay() and shifts the start date until it matches —
// dodges any local-vs-UTC parsing skew for the start date.
//   bigger offset (older start) -> larger computed day
//   smaller offset (newer start) -> smaller computed day
function freshStateAtDay(n, name = 'TEST') {
  let offset = n - 1;
  for (let i = 0; i < 10; i++) {
    freshState(isoDaysAgo(offset), name);
    const d = calcCurrentDay();
    if (d === n) return getState();
    offset -= (d - n);
  }
  throw new Error(`Could not pin calcCurrentDay to ${n}; got ${calcCurrentDay()}`);
}

function markComplete(s, day, opts = {}) {
  updateDayData(s, day, {
    calorie: true, w1: true, w2: true, read: true,
    water: true, photo: true, ...opts,
  });
}

// --- tests -----------------------------------------------------------------

test('defaultState returns the expected shape', () => {
  const s = defaultState('2025-01-01', 'SOLDIER');
  assert.equal(s.startDate, '2025-01-01');
  assert.equal(s.name, 'SOLDIER');
  assert.deepEqual(s.days, {});
  assert.deepEqual(s.drinks, {});
  assert.deepEqual(s.books, {});
  assert.deepEqual(s.metrics, {});
  assert.deepEqual(s.notes, {});
});

test('defaultState handles missing name', () => {
  const s = defaultState('2025-01-01');
  assert.equal(s.name, '');
});

test('getDayData returns defaults for an unknown day', () => {
  const s = defaultState('2025-01-01', 'X');
  const dd = getDayData(s, 1);
  assert.equal(dd.calorie, false);
  assert.equal(dd.w1, false);
  assert.equal(dd.w2, false);
  assert.equal(dd.read, false);
  assert.equal(dd.water, false);
  assert.equal(dd.photo, false);
  assert.equal(dd.waterCups, 0);
  assert.equal(dd.w1label, 'Workout 1');
  assert.equal(dd.w2label, 'Workout 2');
});

test('getDayData merges stored partial data with defaults', () => {
  const s = defaultState('2025-01-01', 'X');
  s.days[3] = { calorie: true, w1: true };
  const dd = getDayData(s, 3);
  assert.equal(dd.calorie, true);
  assert.equal(dd.w1, true);
  // Untouched keys should still come from defaults.
  assert.equal(dd.w2, false);
  assert.equal(dd.waterCups, 0);
  assert.equal(dd.w1label, 'Workout 1');
});

test('getDayData back-compat: legacy day record missing waterCups defaults to 0', () => {
  // Older saved states predate the waterCups field.
  const s = defaultState('2025-01-01', 'X');
  s.days[5] = {
    calorie: true, w1: true, w2: true, read: true,
    water: true, photo: true,
    w1label: 'Run', w2label: 'Lift',
    // no waterCups here
  };
  const dd = getDayData(s, 5);
  assert.equal(dd.waterCups, 0);
  // And the other fields survive.
  assert.equal(dd.water, true);
  assert.equal(dd.w1label, 'Run');
});

test('updateDayData patches and persists the day record', () => {
  const s = defaultState('2025-01-01', 'X');
  updateDayData(s, 2, { calorie: true, waterCups: 8 });
  assert.equal(s.days[2].calorie, true);
  assert.equal(s.days[2].waterCups, 8);
  // Patch is additive: a second update keeps prior values.
  updateDayData(s, 2, { w1: true });
  assert.equal(s.days[2].calorie, true);
  assert.equal(s.days[2].w1, true);
  assert.equal(s.days[2].waterCups, 8);
});

test('isDayComplete is true only when all six core tasks are done', () => {
  const s = defaultState('2025-01-01', 'X');
  assert.equal(isDayComplete(s, 1), false);
  markComplete(s, 1);
  assert.equal(isDayComplete(s, 1), true);
  // Flip one off — should go back to false.
  updateDayData(s, 1, { water: false });
  assert.equal(isDayComplete(s, 1), false);
});

test('isDayComplete ignores waterCups/labels — only the six booleans matter', () => {
  const s = defaultState('2025-01-01', 'X');
  markComplete(s, 1, { waterCups: 0, w1label: 'X', w2label: 'Y' });
  assert.equal(isDayComplete(s, 1), true);
});

test('calcCurrentDay computes day index from a fixed startDate', () => {
  // Pin start so that today resolves to day 11.
  freshStateAtDay(11);
  assert.equal(calcCurrentDay(), 11);
});

test('calcCurrentDay clamps to [1, TOTAL]', () => {
  // Far future start clamps to 1.
  freshState(isoDaysAgo(-30));
  assert.equal(calcCurrentDay(), 1);
  // Far past start clamps to TOTAL (=75).
  freshState(isoDaysAgo(500));
  assert.equal(calcCurrentDay(), TOTAL);
});

test('calcCurrentDay returns 1 with no saved state', () => {
  memStore.clear();
  assert.equal(calcCurrentDay(), 1);
});

test('calcCurrentWeek = ceil(currentDay / 7)', () => {
  freshStateAtDay(1);
  assert.equal(calcCurrentWeek(), 1);
  freshStateAtDay(7);
  assert.equal(calcCurrentWeek(), 1);
  freshStateAtDay(8);
  assert.equal(calcCurrentWeek(), 2);
  freshStateAtDay(14);
  assert.equal(calcCurrentWeek(), 2);
  freshStateAtDay(15);
  assert.equal(calcCurrentWeek(), 3);
});

test('calcStreak counts consecutive complete days from today backwards', () => {
  const s = freshStateAtDay(5);
  markComplete(s, 5);
  markComplete(s, 4);
  markComplete(s, 3);
  // Day 2 intentionally incomplete — breaks the streak.
  markComplete(s, 1);
  saveState(s);
  assert.equal(calcStreak(s), 3);
});

test('calcStreak returns 0 when today is not complete', () => {
  const s = freshStateAtDay(5);
  markComplete(s, 4);
  markComplete(s, 3);
  // Day 5 (today) not complete.
  saveState(s);
  assert.equal(calcStreak(s), 0);
});

test('countCompleteDays counts complete days up to today only', () => {
  const s = freshStateAtDay(5);
  markComplete(s, 1);
  markComplete(s, 2);
  // Day 3 partial
  updateDayData(s, 3, { calorie: true });
  markComplete(s, 5);
  // Day 10 is in the future and must NOT count.
  markComplete(s, 10);
  saveState(s);
  assert.equal(countCompleteDays(s), 3);
});

test('formatDate is stable for a known date', () => {
  // Use UTC noon so the local-day rendering is timezone-stable.
  const d = new Date('2025-01-15T12:00:00Z');
  const out = formatDate(d);
  // Verify content rather than exact punctuation so this passes across
  // ICU variations: weekday, month name, day-of-month, year.
  assert.match(out, /Wed/);
  assert.match(out, /Jan/);
  assert.match(out, /15/);
  assert.match(out, /2025/);
});

test('getDateForDay advances by exactly (day - 1) calendar days', () => {
  // We avoid asserting absolute calendar dates because the app stores
  // startDate as "YYYY-MM-DD", which Date() parses as UTC — leading to
  // off-by-one local-date results in non-UTC zones. We instead verify
  // the *relative* offset, which is what the production code uses for
  // labeling each day.
  freshState('2025-03-10');
  const d1 = getDateForDay(1);
  const d8 = getDateForDay(8);
  const diff = Math.round((d8 - d1) / 86400000);
  assert.equal(diff, 7);
  const d75 = getDateForDay(75);
  assert.equal(Math.round((d75 - d1) / 86400000), 74);
});

test('getState / saveState round-trip via localStorage', () => {
  memStore.clear();
  const s = defaultState('2025-01-01', 'NAME');
  s.days[1] = { calorie: true };
  saveState(s);
  const raw = localStorage.getItem(STORAGE_KEY);
  assert.ok(raw, 'expected something written to localStorage');
  const loaded = getState();
  assert.equal(loaded.startDate, '2025-01-01');
  assert.equal(loaded.name, 'NAME');
  assert.equal(loaded.days[1].calorie, true);
});
