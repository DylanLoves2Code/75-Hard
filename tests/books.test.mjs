// Unit tests for v6 reading-depth helpers in js/books.js:
//   - addQuote / deleteQuote — quote storage on a per-book-entry basis
//   - collectQuotesByBook   — aggregation for the quotes-vault sub-tab
//   - totalAudiobookMinutes — totals for the Stats card
//
// books.js imports state.js (localStorage) plus toast/timer/confetti.
// We install a tiny DOM + localStorage polyfill so the module loads
// cleanly under node:test, the same pattern used by tests/state.test.mjs.

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
// DOM stub — books.js touches a handful of elements when rendering, but
// the helpers we test (addQuote / collectQuotesByBook / total*) only
// read/write state. getElementById returns null so the DOM-side calls
// are no-ops.
globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
  }),
  addEventListener() {}, removeEventListener() {},
  body: { contains: () => false, appendChild() {} },
};

const { defaultState, saveState, getState } = await import('../js/state.js');
const { addQuote, deleteQuote, collectQuotesByBook, totalAudiobookMinutes } = await import('../js/books.js');

// --- helpers ---------------------------------------------------------------

function freshStateWithBook(day, fields = {}) {
  memStore.clear();
  const s = defaultState('2025-01-01', 'TEST');
  s.books[day] = {
    title: 'Test Book', pages: 10, nonfiction: true,
    quotes: [], audiobookMinutes: 0, ...fields,
  };
  saveState(s);
  return s;
}

// --- addQuote / deleteQuote ------------------------------------------------

test('addQuote appends a quote with text + optional page to the day entry', () => {
  freshStateWithBook(3);
  addQuote('3', 'Discipline equals freedom.', 42);
  const s = getState();
  assert.equal(s.books[3].quotes.length, 1);
  assert.equal(s.books[3].quotes[0].text, 'Discipline equals freedom.');
  assert.equal(s.books[3].quotes[0].page, 42);
});

test('addQuote stores a quote without a page when none is given', () => {
  freshStateWithBook(5);
  addQuote('5', 'Memento mori.', undefined);
  const s = getState();
  assert.equal(s.books[5].quotes.length, 1);
  assert.equal(s.books[5].quotes[0].text, 'Memento mori.');
  assert.equal(s.books[5].quotes[0].page, undefined);
});

test('addQuote is a no-op when the day has no logged book entry', () => {
  memStore.clear();
  const s = defaultState('2025-01-01', 'TEST');
  saveState(s);
  addQuote('9', 'Floating quote', 1);
  const after = getState();
  assert.equal(after.books['9'], undefined, 'no book entry should be conjured');
});

test('deleteQuote removes the quote at the given index', () => {
  freshStateWithBook(2, {
    quotes: [
      { text: 'A', page: 1 },
      { text: 'B', page: 2 },
      { text: 'C', page: 3 },
    ],
  });
  deleteQuote('2', 1);
  const s = getState();
  assert.equal(s.books[2].quotes.length, 2);
  assert.equal(s.books[2].quotes[0].text, 'A');
  assert.equal(s.books[2].quotes[1].text, 'C');
});

test('deleteQuote is a no-op for an out-of-range index', () => {
  freshStateWithBook(2, { quotes: [{ text: 'only', page: 1 }] });
  deleteQuote('2', 9);
  const s = getState();
  assert.equal(s.books[2].quotes.length, 1);
  assert.equal(s.books[2].quotes[0].text, 'only');
});

// --- collectQuotesByBook ---------------------------------------------------

test('collectQuotesByBook returns [] when no books or no quotes exist', () => {
  assert.deepEqual(collectQuotesByBook(null), []);
  assert.deepEqual(collectQuotesByBook(undefined), []);
  assert.deepEqual(collectQuotesByBook({}), []);
  const s = defaultState('2025-01-01', 'X');
  assert.deepEqual(collectQuotesByBook(s), []);
  s.books[1] = { title: 'No quotes here', pages: 10, quotes: [], audiobookMinutes: 0 };
  assert.deepEqual(collectQuotesByBook(s), []);
});

test('collectQuotesByBook groups quotes from multiple days under the same title', () => {
  const s = defaultState('2025-01-01', 'X');
  s.books[1] = { title: 'Meditations', pages: 10, quotes: [{ text: 'Q1', page: 4 }] };
  s.books[3] = { title: 'Meditations', pages: 20, quotes: [{ text: 'Q2' }] };
  s.books[5] = { title: 'Atomic Habits', pages: 15, quotes: [{ text: 'AH-1', page: 8 }] };
  const out = collectQuotesByBook(s);
  // Two groups: Meditations (2 entries) + Atomic Habits (1 entry).
  assert.equal(out.length, 2);
  const med = out.find(g => g.title === 'Meditations');
  const ah  = out.find(g => g.title === 'Atomic Habits');
  assert.ok(med, 'Meditations group present');
  assert.ok(ah, 'Atomic Habits group present');
  assert.equal(med.entries.length, 2);
  assert.equal(med.entries[0].text, 'Q1');
  assert.equal(med.entries[0].page, 4);
  assert.equal(med.entries[1].text, 'Q2');
  assert.equal(med.entries[1].page, undefined);
  assert.equal(ah.entries.length, 1);
  assert.equal(ah.entries[0].text, 'AH-1');
});

test('collectQuotesByBook merges titles case-insensitively', () => {
  const s = defaultState('2025-01-01', 'X');
  s.books[1] = { title: 'Atomic Habits', pages: 10, quotes: [{ text: 'cap' }] };
  s.books[2] = { title: 'atomic habits', pages: 5,  quotes: [{ text: 'lower' }] };
  const out = collectQuotesByBook(s);
  assert.equal(out.length, 1);
  assert.equal(out[0].entries.length, 2);
});

test('collectQuotesByBook skips empty/whitespace-only quote text', () => {
  const s = defaultState('2025-01-01', 'X');
  s.books[1] = { title: 'X', pages: 1, quotes: [
    { text: '   ', page: 1 },
    { text: 'real', page: 2 },
    { text: '', page: 3 },
    null,
  ] };
  const out = collectQuotesByBook(s);
  assert.equal(out.length, 1);
  assert.equal(out[0].entries.length, 1);
  assert.equal(out[0].entries[0].text, 'real');
});

// --- totalAudiobookMinutes -------------------------------------------------

test('totalAudiobookMinutes sums across all book entries', () => {
  const s = defaultState('2025-01-01', 'X');
  s.books[1] = { title: 'A', pages: 1, audiobookMinutes: 30 };
  s.books[2] = { title: 'B', pages: 1, audiobookMinutes: 45 };
  s.books[3] = { title: 'C', pages: 1, audiobookMinutes: 0 };
  assert.equal(totalAudiobookMinutes(s), 75);
});

test('totalAudiobookMinutes returns 0 for empty / null state', () => {
  assert.equal(totalAudiobookMinutes(null), 0);
  assert.equal(totalAudiobookMinutes(undefined), 0);
  const s = defaultState('2025-01-01', 'X');
  assert.equal(totalAudiobookMinutes(s), 0);
});

test('totalAudiobookMinutes tolerates missing / non-numeric audiobookMinutes', () => {
  const s = defaultState('2025-01-01', 'X');
  s.books[1] = { title: 'A', pages: 1 }; // no audiobookMinutes field
  s.books[2] = { title: 'B', pages: 1, audiobookMinutes: 'bad' };
  s.books[3] = { title: 'C', pages: 1, audiobookMinutes: 12 };
  assert.equal(totalAudiobookMinutes(s), 12);
});
