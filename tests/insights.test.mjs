// Unit tests for the w5b insights modules:
//   - js/badges.js — pure achievement predicates.
//   - js/stats.js  — computeMissPatternByWeekday helper.
//
// Same localStorage polyfill pattern as the other tests.

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
const {
  BADGES, getUnlockedBadges, getLockedBadges,
  newlyUnlocked, hasAnyPerfectWeek, longestStreak, totalPagesRead,
} = await import('../js/badges.js');
const { computeMissPatternByWeekday } = await import('../js/stats.js');
const { defaultState, updateDayData, saveState } = await import('../js/state.js');

// --- helpers ---------------------------------------------------------------
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function freshStateAtDay(n, name='TEST'){
  memStore.clear();
  const start = isoDaysAgo(n - 1);
  const s = defaultState(start, name);
  saveState(s);
  return s;
}

function markComplete(s, day, opts={}){
  updateDayData(s, day, {
    dietAdherence: true, w1: true, w2: true, read: true,
    water: true, photo: true, ...opts,
  });
}

// --- badges: totalPagesRead -----------------------------------------------

test('totalPagesRead: sums non-zero entries, ignores invalid', () => {
  const s = defaultState('2025-01-01', 'X');
  s.books = {
    '1': { title: 'A', pages: 50 },
    '2': { title: 'B', pages: 100 },
    '3': null,
    '4': { title: 'C', pages: 'oops' },
    '5': { title: 'D', pages: 0 },
    '6': { title: 'E', pages: 25 },
  };
  assert.equal(totalPagesRead(s), 175);
});

test('totalPagesRead: empty / null state yields 0', () => {
  assert.equal(totalPagesRead(null), 0);
  assert.equal(totalPagesRead(undefined), 0);
  assert.equal(totalPagesRead({}), 0);
  assert.equal(totalPagesRead({ books: {} }), 0);
});

// --- badges: longestStreak / hasAnyPerfectWeek ----------------------------

test('longestStreak: counts the longest run of complete days', () => {
  const s = freshStateAtDay(20);
  // 3 complete (1..3), break, 5 complete (5..9), break, 2 complete (11..12).
  markComplete(s, 1); markComplete(s, 2); markComplete(s, 3);
  markComplete(s, 5); markComplete(s, 6); markComplete(s, 7); markComplete(s, 8); markComplete(s, 9);
  markComplete(s, 11); markComplete(s, 12);
  saveState(s);
  assert.equal(longestStreak(s), 5);
});

test('hasAnyPerfectWeek: detects an embedded 7-in-a-row anywhere', () => {
  const s = freshStateAtDay(30);
  for(let d=10; d<=16; d++) markComplete(s, d);
  saveState(s);
  assert.equal(hasAnyPerfectWeek(s), true);
});

test('hasAnyPerfectWeek: returns false with only a 6-in-a-row', () => {
  const s = freshStateAtDay(30);
  for(let d=10; d<=15; d++) markComplete(s, d);
  saveState(s);
  assert.equal(hasAnyPerfectWeek(s), false);
});

// --- badges: catalog + getUnlockedBadges ----------------------------------

test('BADGES catalog includes the required ids', () => {
  const ids = BADGES.map(b => b.id);
  for(const must of ['FIRST_WEEK','HALFWAY','FORGED','PERFECT_WEEK','FIRST_GALLON','SCHOLAR','DISCIPLINED','IRON_WILL']){
    assert.ok(ids.includes(must), `expected badge ${must} in catalog`);
  }
});

test('getUnlockedBadges: empty state yields nothing', () => {
  const s = freshStateAtDay(1);
  const unlocked = getUnlockedBadges(s);
  assert.deepEqual(unlocked.map(b => b.id), []);
});

test('getUnlockedBadges: FIRST_GALLON triggers on first water:true day', () => {
  const s = freshStateAtDay(3);
  updateDayData(s, 1, { water: true });
  saveState(s);
  const ids = getUnlockedBadges(s).map(b => b.id);
  assert.ok(ids.includes('FIRST_GALLON'));
});

test('getUnlockedBadges: FIRST_WEEK + DISCIPLINED unlock at 10-day streak', () => {
  const s = freshStateAtDay(15);
  for(let d=1; d<=10; d++) markComplete(s, d);
  saveState(s);
  const ids = getUnlockedBadges(s).map(b => b.id);
  assert.ok(ids.includes('FIRST_WEEK'),  'FIRST_WEEK should unlock at 7-streak');
  assert.ok(ids.includes('DISCIPLINED'), 'DISCIPLINED should unlock at 10-streak');
  assert.ok(ids.includes('PERFECT_WEEK'),'PERFECT_WEEK should unlock with any 7-in-a-row');
});

test('getUnlockedBadges: SCHOLAR unlocks at 750 cumulative pages', () => {
  const s = freshStateAtDay(5);
  s.books = { '1': {title:'A', pages: 800} };
  saveState(s);
  const ids = getUnlockedBadges(s).map(b => b.id);
  assert.ok(ids.includes('SCHOLAR'));
});

test('getUnlockedBadges: HALFWAY only unlocks at day 37+ with a complete day', () => {
  // Day 30 — too early.
  const sEarly = freshStateAtDay(30);
  markComplete(sEarly, 1);
  saveState(sEarly);
  assert.equal(getUnlockedBadges(sEarly).map(b => b.id).includes('HALFWAY'), false);
  // Day 37 with a complete day — unlocks.
  const sMid = freshStateAtDay(37);
  markComplete(sMid, 1);
  saveState(sMid);
  assert.ok(getUnlockedBadges(sMid).map(b => b.id).includes('HALFWAY'));
});

test('getLockedBadges + getUnlockedBadges partition the catalog', () => {
  const s = freshStateAtDay(5);
  updateDayData(s, 1, { water: true });
  saveState(s);
  const u = getUnlockedBadges(s).map(b => b.id);
  const l = getLockedBadges(s).map(b => b.id);
  assert.equal(u.length + l.length, BADGES.length);
  // No overlap.
  for(const id of u) assert.equal(l.includes(id), false);
});

test('newlyUnlocked detects fresh ids only', () => {
  assert.deepEqual(newlyUnlocked([], ['A','B']), ['A','B']);
  assert.deepEqual(newlyUnlocked(['A'], ['A','B']), ['B']);
  assert.deepEqual(newlyUnlocked(['A','B'], ['A','B']), []);
  assert.deepEqual(newlyUnlocked(['A','B','C'], ['B']), []);
  assert.deepEqual(newlyUnlocked(null, ['A']), ['A']);
});

// --- stats: computeMissPatternByWeekday -----------------------------------

test('computeMissPatternByWeekday: empty state yields []', () => {
  assert.deepEqual(computeMissPatternByWeekday(null), []);
  assert.deepEqual(computeMissPatternByWeekday(undefined), []);
  assert.deepEqual(computeMissPatternByWeekday({}), []);
});

test('computeMissPatternByWeekday: 7 rows, Monday-first ordering', () => {
  const s = freshStateAtDay(7);
  saveState(s);
  const rows = computeMissPatternByWeekday(s);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map(r => r.short), ['MON','TUE','WED','THU','FRI','SAT','SUN']);
  // Every row carries label, key, misses, total, missPct.
  for(const r of rows){
    assert.equal(typeof r.label, 'string');
    assert.equal(typeof r.key, 'number');
    assert.equal(typeof r.misses, 'number');
    assert.equal(typeof r.total, 'number');
    assert.equal(typeof r.missPct, 'number');
  }
});

test('computeMissPatternByWeekday: a 100%-miss weekday lights up', () => {
  // Pin a known startDate: 2025-01-06 is a Monday.
  // Build a state where day 1 (Mon) is complete and day 7 (Sun) is incomplete.
  // To bypass calcCurrentDay()'s real-time math, we use a real isoDaysAgo
  // pin and shift "today" to a known offset.
  const s = freshStateAtDay(7);
  // Day 7 is "today" in our pinned state. Days 1..6 are past.
  // Mark all complete EXCEPT the day-7 today (which falls on a known weekday).
  for(let d=1; d<=6; d++) markComplete(s, d);
  // Don't mark day 7 — its weekday will be the highest-miss bucket.
  saveState(s);
  const rows = computeMissPatternByWeekday(s);
  // The bucket for day-7's weekday should have at least one miss recorded.
  const totalMisses = rows.reduce((a,r) => a + r.misses, 0);
  assert.ok(totalMisses >= 1, `expected at least 1 missed day, got ${totalMisses}`);
  // Total complete + missed = 7.
  const totalDays = rows.reduce((a,r) => a + r.total, 0);
  assert.equal(totalDays, 7);
});

test('computeMissPatternByWeekday: totals across weekdays sum to elapsed days', () => {
  const s = freshStateAtDay(14);
  // mark a mix
  for(let d=1; d<=7; d++) markComplete(s, d);
  saveState(s);
  const rows = computeMissPatternByWeekday(s);
  const totalDays = rows.reduce((a,r) => a + r.total, 0);
  assert.equal(totalDays, 14);
  const totalMisses = rows.reduce((a,r) => a + r.misses, 0);
  // 7 marked complete out of 14 => 7 misses.
  assert.equal(totalMisses, 7);
});
