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

// js/state.js imports js/toast.js, which uses document. Stub it.
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
};

// Import AFTER the polyfill is in place.
const {
  defaultState, getDayData, updateDayData, isDayComplete,
  calcCurrentDay, calcCurrentWeek, calcStreak, countCompleteDays,
  formatDate, getDateForDay, getState, saveState,
  parseLocalDate, migrate, CURRENT_SCHEMA_VERSION,
  getStorageUsageBytes,
} = await import('../js/state.js');
const { TOTAL, STORAGE_KEY, photoKey } = await import('../js/constants.js');

// --- helpers ---------------------------------------------------------------
// startDate is now parsed via parseLocalDate (local-midnight), so
// constructing a date string from local components gives stable arithmetic
// across timezones.
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

// With local-midnight startDate parsing, a startDate of `isoDaysAgo(n-1)`
// puts calcCurrentDay() at exactly `n` regardless of timezone — no
// probing needed.
function freshStateAtDay(n, name = 'TEST') {
  freshState(isoDaysAgo(n - 1), name);
  return getState();
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
  assert.equal(s.version, CURRENT_SCHEMA_VERSION);
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
  // Now that parseLocalDate is used, we can assert absolute local
  // calendar dates too. The offset check is still the contract callers
  // rely on for labeling each day.
  freshState('2025-03-10');
  const d1 = getDateForDay(1);
  const d8 = getDateForDay(8);
  const diff = Math.round((d8 - d1) / 86400000);
  assert.equal(diff, 7);
  const d75 = getDateForDay(75);
  assert.equal(Math.round((d75 - d1) / 86400000), 74);
  // Absolute: day 1 should be March 10, 2025 in local time.
  assert.equal(d1.getFullYear(), 2025);
  assert.equal(d1.getMonth(), 2); // March
  assert.equal(d1.getDate(), 10);
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

// --- timezone-stable day arithmetic ----------------------------------------

test('parseLocalDate yields local midnight, not UTC midnight', () => {
  const d = parseLocalDate('2025-06-15');
  assert.equal(d.getFullYear(), 2025);
  assert.equal(d.getMonth(), 5);
  assert.equal(d.getDate(), 15);
  assert.equal(d.getHours(), 0);
  assert.equal(d.getMinutes(), 0);
});

test('calcCurrentDay returns 1 when startDate is today (local), regardless of TZ', () => {
  // Build today's local date as the YYYY-MM-DD literal stored by the
  // app. With the old UTC-parsing bug, this could return 0 (and clamp
  // to 1, hiding the bug) OR 2 depending on hour/timezone. The fix
  // makes day-1-on-day-1 work everywhere.
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const da = String(today.getDate()).padStart(2, '0');
  freshState(`${y}-${m}-${da}`);
  assert.equal(calcCurrentDay(), 1);
});

test('calcCurrentDay returns 2 when startDate is yesterday (local), regardless of TZ', () => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  freshState(ys);
  assert.equal(calcCurrentDay(), 2);
});

// --- schema versioning + migration -----------------------------------------

test('defaultState writes version = CURRENT_SCHEMA_VERSION', () => {
  const s = defaultState('2025-01-01', 'X');
  assert.equal(s.version, CURRENT_SCHEMA_VERSION);
});

test('migrate stamps version on pre-versioned (undefined) state and marks migrated', () => {
  const raw = { startDate: '2025-01-01', name: 'OLD', days: {}, drinks: {}, books: {}, metrics: {}, notes: {} };
  const { state, migrated } = migrate(raw);
  assert.equal(migrated, true);
  assert.equal(state.version, CURRENT_SCHEMA_VERSION);
  assert.equal(state.startDate, '2025-01-01');
});

test('migrate is a no-op on a current-version state', () => {
  const raw = defaultState('2025-01-01', 'NEW');
  const { migrated, state } = migrate(raw);
  assert.equal(migrated, false);
  assert.equal(state.version, CURRENT_SCHEMA_VERSION);
});

test('migrate handles null/undefined gracefully', () => {
  const { state: a, migrated: m1 } = migrate(null);
  assert.equal(a, null);
  assert.equal(m1, false);
  const { state: b, migrated: m2 } = migrate(undefined);
  assert.equal(b, undefined);
  assert.equal(m2, false);
});

test('getState migrates a pre-versioned saved blob and persists the upgrade', () => {
  memStore.clear();
  // Write a "v1"-style blob directly (no version field).
  const legacy = { startDate: '2025-01-01', name: 'LEGACY', days: {}, drinks: {}, books: {}, metrics: {}, notes: {} };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  const loaded = getState();
  assert.equal(loaded.version, CURRENT_SCHEMA_VERSION);
  // Persisted back?
  const onDisk = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(onDisk.version, CURRENT_SCHEMA_VERSION);
  assert.equal(onDisk.name, 'LEGACY');
});

// --- v3 schema migration ---------------------------------------------------

test('v3: migrate copies legacy `calorie` into `dietAdherence` and defaults outdoor flags', () => {
  // Pre-v3 day record only has `calorie`; expect dietAdherence to mirror
  // it, w1outdoor/w2outdoor to default to false, and the legacy field
  // to remain untouched so older code paths still see a tick.
  const raw = {
    version: 2,
    startDate: '2025-01-01',
    name: 'OLD',
    days: {
      1: { calorie: true, w1: true, w2: true, read: true, water: true, photo: true },
      2: { calorie: false, w1: true },
    },
    drinks: {}, books: {}, metrics: {}, notes: {},
  };
  const { state, migrated } = migrate(raw);
  assert.equal(migrated, true);
  assert.equal(state.version, CURRENT_SCHEMA_VERSION);
  assert.equal(state.days[1].dietAdherence, true);
  assert.equal(state.days[1].calorie, true, 'legacy calorie preserved');
  assert.equal(state.days[1].w1outdoor, false);
  assert.equal(state.days[1].w2outdoor, false);
  assert.equal(state.days[2].dietAdherence, false);
  assert.equal(state.days[2].w1outdoor, false);
  assert.equal(state.days[2].w2outdoor, false);
});

test('v3: migrate seeds a safe default diet when none was set', () => {
  const raw = {
    version: 2,
    startDate: '2025-01-01',
    name: 'OLD',
    days: {}, drinks: {}, books: {}, metrics: {}, notes: {},
  };
  const { state } = migrate(raw);
  assert.equal(state.diet.name, 'Custom');
  assert.equal(state.diet.customText, 'Unknown');
});

test('v3: migrate preserves an existing diet selection on a partial v2 blob', () => {
  // If a future re-import contains a state already at v3 shape, we leave
  // it alone. (The migrate chain is a no-op once at CURRENT.)
  const raw = {
    version: 2,
    startDate: '2025-01-01',
    name: 'X',
    diet: { name: 'Paleo', customText: '' },
    days: {}, drinks: {}, books: {}, metrics: {}, notes: {},
  };
  const { state } = migrate(raw);
  assert.equal(state.version, CURRENT_SCHEMA_VERSION);
  assert.equal(state.diet.name, 'Paleo');
});

test('v3: migrate defaults existing book entries to nonfiction:true', () => {
  const raw = {
    version: 2,
    startDate: '2025-01-01',
    name: 'X',
    days: {},
    drinks: {},
    books: {
      1: { title: 'Atomic Habits', pages: 30 },
      4: { title: 'War & Peace', pages: 50, nonfiction: false },
      9: { title: 'Cant Hurt Me', pages: 15, nonfiction: true },
    },
    metrics: {}, notes: {},
  };
  const { state } = migrate(raw);
  assert.equal(state.books[1].nonfiction, true, 'missing flag defaults true');
  assert.equal(state.books[4].nonfiction, false, 'explicit fiction preserved');
  assert.equal(state.books[9].nonfiction, true);
});

test('v3: migrate is idempotent — already-v3 state passes through unchanged', () => {
  const raw = {
    version: 3,
    startDate: '2025-01-01',
    name: 'X',
    diet: { name: 'Keto', customText: '' },
    days: { 1: { dietAdherence: true, w1outdoor: true } },
    drinks: {}, books: {}, metrics: {}, notes: {},
  };
  const { state, migrated } = migrate(raw);
  assert.equal(migrated, false);
  assert.equal(state.diet.name, 'Keto');
  assert.equal(state.days[1].w1outdoor, true);
});

test('v3: migrate walks undefined -> 3 (pre-versioned legacy state)', () => {
  // Pre-versioned states (no `version` key) walk through the entire
  // chain: undefined -> 2 -> 3.
  const raw = {
    startDate: '2025-01-01',
    name: 'LEGACY',
    days: { 5: { calorie: true } },
    drinks: {}, books: {}, metrics: {}, notes: {},
  };
  const { state, migrated } = migrate(raw);
  assert.equal(migrated, true);
  assert.equal(state.version, CURRENT_SCHEMA_VERSION);
  assert.equal(state.days[5].dietAdherence, true);
  assert.equal(state.days[5].w1outdoor, false);
  assert.equal(state.diet.name, 'Custom');
});

test('v3: isDayComplete accepts either dietAdherence or legacy calorie', () => {
  const s = defaultState('2025-01-01', 'X');
  // dietAdherence-driven completion (v3-native day record).
  updateDayData(s, 1, {
    dietAdherence: true, w1: true, w2: true, read: true, water: true, photo: true,
  });
  assert.equal(isDayComplete(s, 1), true);
  // Legacy-only `calorie` should also satisfy the diet slot.
  updateDayData(s, 2, {
    calorie: true, w1: true, w2: true, read: true, water: true, photo: true,
  });
  assert.equal(isDayComplete(s, 2), true);
  // Neither => not complete.
  updateDayData(s, 3, {
    dietAdherence: false, calorie: false, w1: true, w2: true, read: true, water: true, photo: true,
  });
  assert.equal(isDayComplete(s, 3), false);
});

// --- storage usage ---------------------------------------------------------

test('getStorageUsageBytes counts state JSON and photo blobs', () => {
  memStore.clear();
  const s = defaultState('2025-01-01', 'X');
  saveState(s);
  const baseline = getStorageUsageBytes();
  assert.ok(baseline > 0, 'expected non-zero baseline');
  // Add a fake photo and confirm usage increases.
  const fakePhoto = 'data:image/jpeg;base64,' + 'A'.repeat(10000);
  localStorage.setItem(photoKey(3), fakePhoto);
  const after = getStorageUsageBytes();
  assert.ok(after >= baseline + fakePhoto.length, 'photo bytes should be counted');
});
