// Unit tests for js/history.js — multi-challenge archive flow (v7+).
//
// The history module is browser-targeted (reads/writes localStorage)
// but otherwise pure: no fetch, no DOM beyond renderArchiveView (which
// we don't exercise here). We install the same in-memory localStorage
// polyfill the state tests use.

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

// state.js -> toast.js -> document. Stub the minimum DOM surface.
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  querySelectorAll: () => ({ forEach() {} }),
  body: { appendChild() {} },
};

const { defaultState, saveState, updateDayData, getState } = await import('../js/state.js');
const { STORAGE_KEY, STORAGE_KEY_ARCHIVE } = await import('../js/constants.js');
const {
  archiveCurrent, getArchive, restoreFromArchive, deleteArchiveEntry,
  summarizeChallenge,
} = await import('../js/history.js');

function freshActive(start = '2025-01-01', name = 'TEST'){
  memStore.clear();
  const s = defaultState(start, name);
  saveState(s);
  return s;
}

// --- summarizeChallenge ---------------------------------------------------

test('summarizeChallenge: empty state returns zeros', () => {
  const s = defaultState('2025-01-01', 'X');
  const sum = summarizeChallenge(s);
  assert.deepEqual(sum, { daysComplete: 0, longestStreak: 0, totalPages: 0, finalDay: 0 });
});

test('summarizeChallenge: counts days complete, longest streak, total pages, final day', () => {
  const s = defaultState('2025-01-01', 'X');
  // Days 1, 2, 3 complete; day 4 skipped; days 5, 6 complete; day 7 partial.
  for(const d of [1,2,3]) updateDayData(s, d, {
    dietAdherence:true,w1:true,w2:true,read:true,water:true,photo:true,
  });
  for(const d of [5,6]) updateDayData(s, d, {
    dietAdherence:true,w1:true,w2:true,read:true,water:true,photo:true,
  });
  updateDayData(s, 7, { dietAdherence: true });  // partial — touches day 7
  s.books['1'] = { title: 'A', pages: 30 };
  s.books['5'] = { title: 'B', pages: 12 };
  const sum = summarizeChallenge(s);
  assert.equal(sum.daysComplete, 5);
  assert.equal(sum.longestStreak, 3, '1..3 is a 3-day streak');
  assert.equal(sum.totalPages, 42);
  assert.equal(sum.finalDay, 7, 'largest day index touched');
});

test('summarizeChallenge: defensive on null/garbage', () => {
  const sum = summarizeChallenge(null);
  assert.deepEqual(sum, { daysComplete: 0, longestStreak: 0, totalPages: 0, finalDay: 0 });
  const sum2 = summarizeChallenge({});
  assert.equal(sum2.daysComplete, 0);
});

// --- archiveCurrent --------------------------------------------------------

test('archiveCurrent: moves active state into the archive, newest-first', () => {
  freshActive();
  const s = getState();
  s.name = 'FIRST';
  saveState(s);
  archiveCurrent(s);
  const list = getArchive();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'FIRST');
  assert.equal(list[0].startDate, '2025-01-01');
  assert.ok(list[0].archivedAt > 0);
  assert.ok(list[0].state, 'state should be stashed for restore');
  // A second archive prepends.
  const s2 = defaultState('2025-04-01', 'SECOND');
  archiveCurrent(s2);
  const list2 = getArchive();
  assert.equal(list2.length, 2);
  assert.equal(list2[0].name, 'SECOND', 'newest first');
  assert.equal(list2[1].name, 'FIRST');
});

test('archiveCurrent: summary block reflects the archived state', () => {
  memStore.clear();
  const s = defaultState('2025-01-01', 'STATSY');
  updateDayData(s, 1, { dietAdherence:true,w1:true,w2:true,read:true,water:true,photo:true });
  s.books['1'] = { title: 'X', pages: 50 };
  archiveCurrent(s);
  const list = getArchive();
  assert.equal(list[0].summary.daysComplete, 1);
  assert.equal(list[0].summary.longestStreak, 1);
  assert.equal(list[0].summary.totalPages, 50);
  assert.equal(list[0].summary.finalDay, 1);
});

test('archiveCurrent: with {includeState:false} stores summary only', () => {
  memStore.clear();
  const s = defaultState('2025-01-01', 'LIGHT');
  archiveCurrent(s, { includeState: false });
  const list = getArchive();
  assert.equal(list.length, 1);
  assert.equal(list[0].state, undefined, 'no state stashed when includeState:false');
  assert.ok(list[0].summary, 'summary always present');
});

// --- getArchive ------------------------------------------------------------

test('getArchive: empty/missing key returns []', () => {
  memStore.clear();
  assert.deepEqual(getArchive(), []);
});

test('getArchive: tolerates garbage payload', () => {
  memStore.clear();
  localStorage.setItem(STORAGE_KEY_ARCHIVE, 'not json');
  assert.deepEqual(getArchive(), []);
  localStorage.setItem(STORAGE_KEY_ARCHIVE, JSON.stringify({not:'an array'}));
  assert.deepEqual(getArchive(), []);
});

// --- restoreFromArchive ----------------------------------------------------

test('restoreFromArchive: writes the entry back to STORAGE_KEY and removes it from archive', () => {
  memStore.clear();
  // Build a "past" state, archive it.
  const past = defaultState('2024-06-01', 'PAST');
  past.days[5] = { dietAdherence:true,w1:true,w2:true,read:true,water:true,photo:true };
  archiveCurrent(past);
  // Sanity: no active state yet.
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  // Restore.
  const ok = restoreFromArchive(0);
  assert.equal(ok, true);
  // Active state was written back.
  const active = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(active.name, 'PAST');
  assert.equal(active.startDate, '2024-06-01');
  assert.equal(active.days[5].dietAdherence, true);
  // Entry removed from archive.
  assert.equal(getArchive().length, 0);
});

test('restoreFromArchive: archives the currently-active challenge first', () => {
  memStore.clear();
  // Pre-stage: active = "CURRENT", archive has "PAST".
  const past = defaultState('2024-06-01', 'PAST');
  archiveCurrent(past);
  const current = defaultState('2025-01-01', 'CURRENT');
  saveState(current);
  // Now restore PAST — the current run should land in the archive.
  const ok = restoreFromArchive(0);
  assert.equal(ok, true);
  const active = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.equal(active.name, 'PAST');
  const list = getArchive();
  assert.equal(list.length, 1, 'CURRENT was archived in PAST\'s place');
  assert.equal(list[0].name, 'CURRENT');
});

test('restoreFromArchive: returns false for out-of-range index', () => {
  memStore.clear();
  assert.equal(restoreFromArchive(0), false);
  assert.equal(restoreFromArchive(-1), false);
  assert.equal(restoreFromArchive(5), false);
});

test('restoreFromArchive: returns false when the entry has no .state payload', () => {
  memStore.clear();
  const past = defaultState('2024-06-01', 'PAST');
  archiveCurrent(past, { includeState: false });
  assert.equal(restoreFromArchive(0), false);
  // Archive untouched.
  assert.equal(getArchive().length, 1);
});

// --- deleteArchiveEntry ----------------------------------------------------

test('deleteArchiveEntry: removes by index and is no-op out of range', () => {
  memStore.clear();
  archiveCurrent(defaultState('2024-06-01', 'A'));
  archiveCurrent(defaultState('2024-09-01', 'B'));
  assert.equal(getArchive().length, 2);
  assert.equal(deleteArchiveEntry(0), true);
  const list = getArchive();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'A', 'newest-first ordering preserved after delete');
  // Out of range.
  assert.equal(deleteArchiveEntry(5), false);
  assert.equal(deleteArchiveEntry(-1), false);
  assert.equal(getArchive().length, 1);
});

// --- end-to-end: archive → reset path leaves active empty ------------------

test('archive flow: archiving + clearing STORAGE_KEY leaves active null and archive populated', () => {
  memStore.clear();
  const s = defaultState('2025-01-01', 'E2E');
  saveState(s);
  archiveCurrent(s);
  localStorage.removeItem(STORAGE_KEY);
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
  const list = getArchive();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'E2E');
});
