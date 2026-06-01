// Unit tests for js/share.js and js/partners.js — w5c social features.
//
// share.js and partners.js are vanilla-JS modules that depend on:
//   - js/constants.js (no globals)
//   - js/state.js     (uses localStorage + document via toast.js)
//   - js/settings.js  (uses localStorage)
//
// We install the same in-memory localStorage + document polyfills used
// by the existing test files so the modules load cleanly under Node.
//
// Run with: node --test tests/share.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- localStorage + DOM polyfill -------------------------------------------
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
  body: { appendChild() {}, removeChild() {} },
  querySelectorAll: () => [],
};

// Import AFTER the polyfills are in place. share/partners trigger
// settings.js + state.js imports under the hood.
const {
  generateShareUrl, encodeShareUrl, decodeShareFragment, parseShareFragment,
  buildSnapshot, _internal: shareInternal,
} = await import('../js/share.js');
const {
  addPartnerFromUrl, removePartner, getPartners, partnerFromShareUrl,
  comparePartners, MAX_PARTNERS,
} = await import('../js/partners.js');
const { defaultState, updateDayData, CURRENT_SCHEMA_VERSION } = await import('../js/state.js');
const { TOTAL, SETTINGS_KEY } = await import('../js/constants.js');

function freshSettings(){
  memStore.delete(SETTINGS_KEY);
}

function markComplete(s, day, opts = {}) {
  updateDayData(s, day, {
    dietAdherence: true, w1: true, w2: true, read: true,
    water: true, photo: true, ...opts,
  });
}

// --- snapshot builder ------------------------------------------------------

test('buildSnapshot: counts complete days, builds 75-char grid, derives streak', () => {
  const s = defaultState('2025-01-01', 'MAVERICK');
  // Days 1, 2, 3 complete; day 4 partial; "today" = day 5 (incomplete).
  markComplete(s, 1);
  markComplete(s, 2);
  markComplete(s, 3);
  updateDayData(s, 4, { dietAdherence: true });
  const snap = buildSnapshot(s, 5);
  assert.equal(snap.magic, '75H1');
  assert.equal(snap.v, CURRENT_SCHEMA_VERSION);
  assert.equal(snap.name, 'MAVERICK');
  assert.equal(snap.day, 5);
  assert.equal(snap.done, 3);
  assert.equal(snap.streak, 0, 'today incomplete => streak 0');
  assert.equal(snap.grid.length, TOTAL);
  assert.equal(snap.grid.slice(0, 5), '11100');
  // Future days are zeroes.
  assert.equal(snap.grid.slice(5), '0'.repeat(TOTAL - 5));
  assert.ok(snap.ts > 0, 'timestamp populated');
});

test('buildSnapshot: streak counts back from current day inclusive', () => {
  const s = defaultState('2025-01-01', 'X');
  markComplete(s, 3);
  markComplete(s, 4);
  markComplete(s, 5);
  const snap = buildSnapshot(s, 5);
  assert.equal(snap.streak, 3, 'days 3-5 are an unbroken 3-day streak');
  assert.equal(snap.done, 3);
});

test('buildSnapshot: never marks future days complete even if state has stale future flags', () => {
  // Belt-and-suspenders: the state could be hand-edited or imported.
  const s = defaultState('2025-01-01', 'X');
  markComplete(s, 50); // far future
  const snap = buildSnapshot(s, 3);
  // grid[49] (day 50) must be 0 because day > snap.day.
  assert.equal(snap.grid.charAt(49), '0');
  assert.equal(snap.done, 0);
});

test('buildSnapshot: clamps day to [1, TOTAL]', () => {
  const s = defaultState('2025-01-01', 'X');
  const low = buildSnapshot(s, -5);
  assert.equal(low.day, 1);
  const high = buildSnapshot(s, 9999);
  assert.equal(high.day, TOTAL);
});

test('buildSnapshot: accepts legacy `calorie` day records (pre-v3)', () => {
  const s = defaultState('2025-01-01', 'OLD');
  // Pre-v3 day record only has `calorie`; dayComplete must accept it.
  s.days[1] = { calorie: true, w1: true, w2: true, read: true, water: true, photo: true };
  const snap = buildSnapshot(s, 1);
  assert.equal(snap.grid.charAt(0), '1');
  assert.equal(snap.done, 1);
  assert.equal(snap.streak, 1);
});

// --- encode/decode round-trip ----------------------------------------------

test('encode + decode round-trip preserves snapshot fields', () => {
  const snap = {
    magic: '75H1', v: CURRENT_SCHEMA_VERSION, name: 'ALPHA',
    day: 12, streak: 7, done: 9,
    grid: '1'.repeat(9) + '0'.repeat(TOTAL - 9),
    ts: 1700000000000,
  };
  const url = encodeShareUrl(snap, 'https://example.test/app');
  assert.match(url, /#share=/);
  const parsed = decodeShareFragment(url);
  assert.ok(parsed);
  assert.equal(parsed.magic, '75H1');
  assert.equal(parsed.name, 'ALPHA');
  assert.equal(parsed.day, snap.day);
  assert.equal(parsed.streak, snap.streak);
  assert.equal(parsed.done, snap.done);
  assert.equal(parsed.grid, snap.grid);
  assert.equal(parsed.ts, snap.ts);
});

test('encode strips existing #fragment and ?query from baseUrl', () => {
  const snap = buildSnapshot(defaultState('2025-01-01', 'A'), 1);
  const url = encodeShareUrl(snap, 'https://x.test/page?z=1#existing');
  // No leftover existing query or fragment, just the new #share=.
  assert.ok(url.startsWith('https://x.test/page#share='));
  assert.equal(url.indexOf('?'), -1);
});

test('encode supports unicode names (em-dash, accents) via UTF-8 base64', () => {
  // btoa() alone would throw on a non-Latin-1 character; the share
  // module must round-trip through TextEncoder/TextDecoder to handle
  // arbitrary UTF-8 names.
  const snap = {
    magic: '75H1', v: CURRENT_SCHEMA_VERSION, name: 'JOSÉ — 力',
    day: 1, streak: 0, done: 0,
    grid: '0'.repeat(TOTAL),
    ts: 123,
  };
  const url = encodeShareUrl(snap, 'http://x/');
  const parsed = decodeShareFragment(url);
  assert.ok(parsed);
  assert.equal(parsed.name, 'JOSÉ — 力');
});

test('decode accepts bare payload, "#share=..." fragment, or full URL', () => {
  const snap = buildSnapshot(defaultState('2025-01-01', 'B'), 4);
  const url = encodeShareUrl(snap, 'https://x.test/p');
  const fragOnly = url.slice(url.indexOf('#'));
  const bare = url.slice(url.indexOf('#share=') + '#share='.length);
  assert.ok(decodeShareFragment(url));
  assert.ok(decodeShareFragment(fragOnly));
  assert.ok(decodeShareFragment(bare));
});

test('decode rejects malformed inputs (returns null, no throw)', () => {
  assert.equal(decodeShareFragment(''), null);
  assert.equal(decodeShareFragment(null), null);
  assert.equal(decodeShareFragment(undefined), null);
  assert.equal(decodeShareFragment('#share='), null);
  assert.equal(decodeShareFragment('#share=!!!not-base64!!!'), null);
  // Valid base64 of non-JSON.
  const notJson = shareInternal.b64UrlEncode('hello world');
  assert.equal(decodeShareFragment('#share=' + notJson), null);
  // Valid JSON but missing magic.
  const wrongShape = shareInternal.b64UrlEncode(JSON.stringify({ foo: 1 }));
  assert.equal(decodeShareFragment('#share=' + wrongShape), null);
});

test('decode rejects out-of-range day/streak/done and bad grid', () => {
  const enc = (obj) => '#share=' + shareInternal.b64UrlEncode(JSON.stringify(obj));
  const base = { magic: '75H1', v: 5, name: 'X', streak: 0, done: 0, grid: '0'.repeat(TOTAL), ts: 0 };
  // Day too big
  assert.equal(decodeShareFragment(enc({ ...base, day: 100 })), null);
  // Day too small
  assert.equal(decodeShareFragment(enc({ ...base, day: 0 })), null);
  // Grid wrong length
  assert.equal(decodeShareFragment(enc({ ...base, day: 1, grid: '01' })), null);
  // Grid wrong chars
  assert.equal(decodeShareFragment(enc({ ...base, day: 1, grid: '2'.repeat(TOTAL) })), null);
  // done out of range
  assert.equal(decodeShareFragment(enc({ ...base, day: 1, done: -1 })), null);
});

test('decode preserves snapshot ts even when "0"', () => {
  // ts === 0 is allowed (old/no timestamp) — must not be coerced to undefined.
  const snap = {
    magic: '75H1', v: 5, name: 'Z', day: 1, streak: 0, done: 0,
    grid: '0'.repeat(TOTAL), ts: 0,
  };
  const url = encodeShareUrl(snap, 'http://x/');
  const parsed = decodeShareFragment(url);
  assert.equal(parsed.ts, 0);
});

test('parseShareFragment reads from globalThis.location.hash', () => {
  const snap = buildSnapshot(defaultState('2025-01-01', 'LOC'), 2);
  const url = encodeShareUrl(snap, 'http://x.test/');
  // Stub a minimal location for this test.
  const origLoc = globalThis.location;
  globalThis.location = { hash: url.slice(url.indexOf('#')) };
  try {
    const parsed = parseShareFragment();
    assert.ok(parsed);
    assert.equal(parsed.day, snap.day);
    assert.equal(parsed.name, 'LOC');
  } finally {
    globalThis.location = origLoc;
  }
});

test('parseShareFragment returns null when no hash is present', () => {
  const origLoc = globalThis.location;
  globalThis.location = { hash: '' };
  try {
    assert.equal(parseShareFragment(), null);
  } finally {
    globalThis.location = origLoc;
  }
});

// --- generateShareUrl convenience ------------------------------------------

test('generateShareUrl: end-to-end shape (defaults to current location)', () => {
  const s = defaultState('2025-01-01', 'OMEGA');
  markComplete(s, 1);
  const url = generateShareUrl(s, 1, 'http://example/');
  const parsed = decodeShareFragment(url);
  assert.ok(parsed);
  assert.equal(parsed.name, 'OMEGA');
  assert.equal(parsed.day, 1);
  assert.equal(parsed.grid.charAt(0), '1');
});

// --- partners --------------------------------------------------------------

test('partnerFromShareUrl: returns a normalized Partner record', () => {
  freshSettings();
  const s = defaultState('2025-01-01', 'FRIEND');
  markComplete(s, 1);
  markComplete(s, 2);
  const url = generateShareUrl(s, 2, 'http://x/');
  const p = partnerFromShareUrl(url);
  assert.ok(p);
  assert.equal(p.name, 'FRIEND');
  assert.equal(p.dayN, 2);
  assert.equal(p.streak, 2);
  assert.equal(p.done, 2);
  assert.equal(p.grid.length, TOTAL);
  assert.ok(p.lastUpdated > 0);
});

test('partnerFromShareUrl: returns null on invalid input', () => {
  assert.equal(partnerFromShareUrl(''), null);
  assert.equal(partnerFromShareUrl('not a url'), null);
  assert.equal(partnerFromShareUrl('#share=invalid'), null);
});

test('addPartnerFromUrl: persists, dedups (case-insensitive), enforces MAX_PARTNERS', () => {
  freshSettings();
  // Helper: build a share URL for a fictional friend at a given day.
  const makeUrl = (name, day) => {
    const s = defaultState('2025-01-01', name);
    for(let d = 1; d <= day; d++) markComplete(s, d);
    return generateShareUrl(s, day, 'http://x/');
  };
  // Add three distinct partners.
  assert.equal(addPartnerFromUrl(makeUrl('ALICE', 3)).ok, true);
  assert.equal(addPartnerFromUrl(makeUrl('BOB',   5)).ok, true);
  assert.equal(addPartnerFromUrl(makeUrl('CAROL', 1)).ok, true);
  assert.equal(getPartners().length, MAX_PARTNERS);
  // Adding a 4th distinct partner fails.
  const overflow = addPartnerFromUrl(makeUrl('DAVE', 2));
  assert.equal(overflow.ok, false);
  assert.match(overflow.reason || '', /Maximum/);
  // Re-adding an existing name UPDATES in place (refresh-by-resharing).
  const fresh = addPartnerFromUrl(makeUrl('alice', 7));
  assert.equal(fresh.ok, true);
  const list = getPartners();
  assert.equal(list.length, MAX_PARTNERS);
  const alice = list.find(p => p.name.toUpperCase() === 'ALICE');
  assert.ok(alice);
  assert.equal(alice.dayN, 7, 'refresh updated day to latest snapshot');
});

test('removePartner: removes by case-insensitive name; no-op otherwise', () => {
  freshSettings();
  const s = defaultState('2025-01-01', 'X');
  const url = generateShareUrl(s, 1, 'http://x/');
  addPartnerFromUrl(url);
  assert.equal(getPartners().length, 1);
  assert.equal(removePartner('x'), true);
  assert.equal(getPartners().length, 0);
  // No-op on a name that isn't stored.
  assert.equal(removePartner('NOPE'), false);
});

test('addPartnerFromUrl: rejects invalid URLs without polluting the partners list', () => {
  freshSettings();
  const result = addPartnerFromUrl('not a share url');
  assert.equal(result.ok, false);
  assert.match(result.reason || '', /Invalid/);
  assert.equal(getPartners().length, 0);
});

test('comparePartners: classifies streak deltas as lead/tie/behind', () => {
  const partners = [
    { name: 'A', dayN: 5, streak: 10, done: 10, grid: '0'.repeat(TOTAL), lastUpdated: 1 },
    { name: 'B', dayN: 5, streak: 3,  done: 3,  grid: '0'.repeat(TOTAL), lastUpdated: 1 },
    { name: 'C', dayN: 5, streak: 5,  done: 5,  grid: '0'.repeat(TOTAL), lastUpdated: 1 },
  ];
  const out = comparePartners(partners, 5);
  assert.equal(out[0].status, 'lead');    // 10 > 5
  assert.equal(out[0].deltaStreak, 5);
  assert.equal(out[1].status, 'behind');  // 3 < 5
  assert.equal(out[1].deltaStreak, -2);
  assert.equal(out[2].status, 'tie');     // 5 == 5
  assert.equal(out[2].deltaStreak, 0);
});

test('comparePartners: empty/null input yields empty array', () => {
  assert.deepEqual(comparePartners([], 0), []);
  assert.deepEqual(comparePartners(null, 5), []);
});

test('getPartners: filters out malformed entries', () => {
  freshSettings();
  // Directly poke the settings blob with a mix of valid + bad entries
  // to ensure the validator drops the junk.
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    partners: [
      { name: 'GOOD', dayN: 5, streak: 1, done: 1, grid: '0'.repeat(TOTAL), lastUpdated: 100 },
      { name: 'BAD_GRID', dayN: 5, streak: 1, done: 1, grid: '01', lastUpdated: 100 },
      { name: 'NO_DAY', streak: 1, done: 1, grid: '0'.repeat(TOTAL), lastUpdated: 100 },
      null,
      'not an object',
    ],
  }));
  const list = getPartners();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'GOOD');
});
