// Unit tests for js/health.js — focused on parseWeightCsv since the
// side-effecting handleWeightCsv path is best covered by manual QA + the
// existing state.test plumbing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// js/state.js (a transitive import) reaches for localStorage + document.
// Stub them before importing.
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

const { parseWeightCsv, HEALTH_OAUTH_INFO } = await import('../js/health.js');

test('parseWeightCsv: returns [] for empty / whitespace / non-string input', () => {
  assert.deepEqual(parseWeightCsv(''), []);
  assert.deepEqual(parseWeightCsv('   \n  \n'), []);
  assert.deepEqual(parseWeightCsv(null), []);
  assert.deepEqual(parseWeightCsv(undefined), []);
  assert.deepEqual(parseWeightCsv(42), []);
});

test('parseWeightCsv: parses a simple two-row CSV', () => {
  const csv = '2025-01-15,184.2\n2025-01-16,183.8\n';
  assert.deepEqual(parseWeightCsv(csv), [
    { date: '2025-01-15', weightLbs: 184.2 },
    { date: '2025-01-16', weightLbs: 183.8 },
  ]);
});

test('parseWeightCsv: skips a header row when present', () => {
  const csv = 'date,weight_lbs\n2025-01-15,184.2\n2025-01-16,183.8\n';
  const rows = parseWeightCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2025-01-15');
  assert.equal(rows[0].weightLbs, 184.2);
});

test('parseWeightCsv: tolerates CRLF line endings and surrounding whitespace', () => {
  const csv = '  2025-01-15 , 184.2 \r\n2025-01-16,183.8\r\n';
  const rows = parseWeightCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].weightLbs, 184.2);
});

test('parseWeightCsv: drops malformed rows (bad date / non-numeric / negative)', () => {
  const csv = [
    'date,weight_lbs',
    '2025-01-15,184.2',
    'not-a-date,180',
    '2025-13-40,180',          // invalid month/day pattern fails the regex
    '2025-01-17,not-a-number',
    '2025-01-18,-50',
    '2025-01-19,0',
    '2025-01-20,182.0',
  ].join('\n');
  const rows = parseWeightCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.date), ['2025-01-15', '2025-01-20']);
});

test('parseWeightCsv: dedupes by date with last-wins', () => {
  const csv = [
    '2025-01-15,184.2',
    '2025-01-15,185.0',  // overrides the first
    '2025-01-16,183.0',
  ].join('\n');
  const rows = parseWeightCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.date === '2025-01-15').weightLbs, 185.0);
});

test('parseWeightCsv: skips blank lines and #-comments', () => {
  const csv = [
    '# exported from Google Fit',
    '',
    'date,weight_lbs',
    '2025-01-15,184.2',
    '',
    '# manual correction below',
    '2025-01-16,183.8',
  ].join('\n');
  const rows = parseWeightCsv(csv);
  assert.equal(rows.length, 2);
});

test('parseWeightCsv: output is sorted ascending by date even when input is not', () => {
  const csv = [
    '2025-02-01,180',
    '2025-01-10,184',
    '2025-01-20,182',
  ].join('\n');
  const rows = parseWeightCsv(csv);
  assert.deepEqual(rows.map(r => r.date), ['2025-01-10','2025-01-20','2025-02-01']);
});

test('HEALTH_OAUTH_INFO documents the implementation path', () => {
  // Asserts the stub modal text actually has the OAuth instructions a
  // contributor needs, not just a placeholder string.
  assert.match(HEALTH_OAUTH_INFO, /OAuth 2\.0/);
  assert.match(HEALTH_OAUTH_INFO, /console\.cloud\.google\.com/);
  assert.match(HEALTH_OAUTH_INFO, /MANUAL WEIGHT IMPORT/);
});
