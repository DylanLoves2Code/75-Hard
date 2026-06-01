// Unit tests for js/wearable.js — focused on parseSleepCsv since the
// side-effecting handleSleepCsv path needs DOM/File plumbing that
// belongs in manual QA.

import { test } from 'node:test';
import assert from 'node:assert/strict';

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

const { parseSleepCsv, WEARABLE_OAUTH_INFO } = await import('../js/wearable.js');

test('parseSleepCsv: returns [] for empty / non-string input', () => {
  assert.deepEqual(parseSleepCsv(''), []);
  assert.deepEqual(parseSleepCsv('   '), []);
  assert.deepEqual(parseSleepCsv(null), []);
  assert.deepEqual(parseSleepCsv(undefined), []);
  assert.deepEqual(parseSleepCsv({}), []);
});

test('parseSleepCsv: parses a simple two-row CSV', () => {
  const csv = '2025-01-15,7.5\n2025-01-16,6.8\n';
  assert.deepEqual(parseSleepCsv(csv), [
    { date: '2025-01-15', hoursSleep: 7.5 },
    { date: '2025-01-16', hoursSleep: 6.8 },
  ]);
});

test('parseSleepCsv: skips a header row when present', () => {
  const csv = 'date,hours_sleep\n2025-01-15,7.5\n2025-01-16,6.8\n';
  const rows = parseSleepCsv(csv);
  assert.equal(rows.length, 2);
});

test('parseSleepCsv: tolerates CRLF and surrounding whitespace', () => {
  const csv = '  2025-01-15 , 7.5 \r\n2025-01-16,6.8\r\n';
  const rows = parseSleepCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].hoursSleep, 7.5);
});

test('parseSleepCsv: rejects out-of-range hours (<=0 or >24) and non-numerics', () => {
  const csv = [
    'date,hours_sleep',
    '2025-01-15,7.5',
    '2025-01-16,-1',
    '2025-01-17,0',
    '2025-01-18,25',     // exceeds 24
    '2025-01-19,zzz',
    '2025-01-20,8.0',
  ].join('\n');
  const rows = parseSleepCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.date), ['2025-01-15', '2025-01-20']);
});

test('parseSleepCsv: drops rows with malformed dates', () => {
  const csv = [
    '2025-01-15,7.5',
    'yesterday,6.0',
    '01-15-2025,7.0',  // wrong order
    '2025-01-16,8.0',
  ].join('\n');
  const rows = parseSleepCsv(csv);
  assert.equal(rows.length, 2);
});

test('parseSleepCsv: dedupes by date with last-wins', () => {
  const csv = [
    '2025-01-15,6.0',
    '2025-01-15,7.5',  // overrides
    '2025-01-16,8.0',
  ].join('\n');
  const rows = parseSleepCsv(csv);
  assert.equal(rows.find(r => r.date === '2025-01-15').hoursSleep, 7.5);
});

test('parseSleepCsv: skips blank lines and # comments', () => {
  const csv = [
    '# exported from Oura',
    '',
    'date,hours_sleep',
    '2025-01-15,7.5',
    '# manual edit',
    '2025-01-16,6.8',
  ].join('\n');
  const rows = parseSleepCsv(csv);
  assert.equal(rows.length, 2);
});

test('parseSleepCsv: output is sorted ascending by date', () => {
  const csv = [
    '2025-02-01,8.0',
    '2025-01-10,7.5',
    '2025-01-20,6.0',
  ].join('\n');
  const rows = parseSleepCsv(csv);
  assert.deepEqual(rows.map(r => r.date), ['2025-01-10','2025-01-20','2025-02-01']);
});

test('WEARABLE_OAUTH_INFO documents the implementation path', () => {
  assert.match(WEARABLE_OAUTH_INFO, /Oura/);
  assert.match(WEARABLE_OAUTH_INFO, /Whoop/);
  assert.match(WEARABLE_OAUTH_INFO, /Fitbit/);
  assert.match(WEARABLE_OAUTH_INFO, /OAuth 2\.0/);
  assert.match(WEARABLE_OAUTH_INFO, /MANUAL SLEEP IMPORT/);
});
