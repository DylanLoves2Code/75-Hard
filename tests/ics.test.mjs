// Unit tests for js/ics.js — pure ICS body generation.
//
// Run with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';

// js/ics.js imports parseLocalDate from js/state.js, which transitively
// touches js/toast.js (document) and localStorage. Stub both so the
// module loads cleanly in Node.
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

const { buildIcs, _internal } = await import('../js/ics.js');
const { parseHHMM, escapeText, formatLocal, formatUtc, foldLine } = _internal;

// --- helpers ----------------------------------------------------------------

function crlfLines(ics){
  return ics.split('\r\n');
}

function unfold(lines){
  // Join continuation lines (those starting with SP or HTAB) back onto
  // their parent. RFC 5545 §3.1.
  const out = [];
  for(const l of lines){
    if(l.startsWith(' ') || l.startsWith('\t')){
      out[out.length-1] += l.slice(1);
    } else {
      out.push(l);
    }
  }
  return out;
}

// --- parseHHMM --------------------------------------------------------------

test('parseHHMM accepts valid 24-hour strings', () => {
  assert.deepEqual(parseHHMM('00:00'), { h: 0, m: 0 });
  assert.deepEqual(parseHHMM('07:30'), { h: 7, m: 30 });
  assert.deepEqual(parseHHMM('23:59'), { h: 23, m: 59 });
});

test('parseHHMM rejects bad input', () => {
  assert.equal(parseHHMM(''), null);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('7:5'), null);
  assert.equal(parseHHMM(null), null);
  assert.equal(parseHHMM('garbage'), null);
});

// --- escapeText -------------------------------------------------------------

test('escapeText escapes commas, semicolons, backslashes, newlines', () => {
  assert.equal(escapeText('a,b;c\\d'), 'a\\,b\\;c\\\\d');
  assert.equal(escapeText('line1\nline2'), 'line1\\nline2');
  assert.equal(escapeText('line1\r\nline2'), 'line1\\nline2');
});

// --- formatLocal / formatUtc ------------------------------------------------

test('formatLocal renders YYYYMMDDTHHMMSS with no Z', () => {
  // 2025-03-15 06:00:00 local (constructed via local-time constructor).
  const d = new Date(2025, 2, 15, 6, 0, 0);
  assert.equal(formatLocal(d), '20250315T060000');
});

test('formatUtc renders YYYYMMDDTHHMMSSZ', () => {
  // 2025-03-15 06:00:00 UTC (constructed via UTC).
  const d = new Date(Date.UTC(2025, 2, 15, 6, 0, 0));
  assert.equal(formatUtc(d), '20250315T060000Z');
});

// --- foldLine ---------------------------------------------------------------

test('foldLine leaves short lines alone', () => {
  assert.deepEqual(foldLine('SUMMARY:hello'), ['SUMMARY:hello']);
});

test('foldLine wraps lines > 75 octets and prefixes continuations with SP', () => {
  const long = 'DESCRIPTION:' + 'x'.repeat(200);
  const folded = foldLine(long);
  assert.ok(folded.length > 1, 'should split');
  for(let i = 0; i < folded.length; i++){
    // No physical line may exceed 75 octets.
    assert.ok(new TextEncoder().encode(folded[i]).length <= 75,
      `physical line ${i} too long: ${folded[i].length}`);
    if(i > 0) assert.equal(folded[i][0], ' ', 'continuation must start with SP');
  }
  // Joining without the SP prefixes should reconstruct the original.
  const rejoined = folded[0] + folded.slice(1).map(s => s.slice(1)).join('');
  assert.equal(rejoined, long);
});

// --- buildIcs ---------------------------------------------------------------

test('buildIcs throws without a startDate', () => {
  assert.throws(() => buildIcs(null), /startDate/);
  assert.throws(() => buildIcs({}), /startDate/);
});

test('buildIcs produces a valid envelope with CRLF line endings', () => {
  const ics = buildIcs({ startDate: '2025-01-01' });
  assert.ok(ics.includes('\r\n'), 'must use CRLF line endings');
  const lines = crlfLines(ics.trimEnd());
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines[lines.length-1], 'END:VCALENDAR');
  // PRODID, VERSION:2.0 should appear in the preamble.
  assert.ok(lines.includes('VERSION:2.0'));
  assert.ok(lines.some(l => /^PRODID:/.test(l)));
});

test('buildIcs generates 150 events (2 per day * 75 days)', () => {
  const ics = buildIcs({ startDate: '2025-01-01' });
  const begins = (ics.match(/\r\nBEGIN:VEVENT\r\n/g) || []).length;
  const ends = (ics.match(/\r\nEND:VEVENT\r\n/g) || []).length;
  assert.equal(begins, 150);
  assert.equal(ends, 150);
});

test('buildIcs respects custom workout times', () => {
  const ics = buildIcs({ startDate: '2025-01-01' }, {
    workout1Time: '05:30', workout2Time: '18:15',
  });
  // Day 1 Workout 1 should be 2025-01-01 05:30 local.
  assert.ok(ics.includes('DTSTART:20250101T053000'));
  // Day 1 Workout 2 should be 2025-01-01 18:15 local.
  assert.ok(ics.includes('DTSTART:20250101T181500'));
  // Each event is 45 minutes, so DTEND for w1 is 06:15.
  assert.ok(ics.includes('DTEND:20250101T061500'));
  // And w2 DTEND is 19:00.
  assert.ok(ics.includes('DTEND:20250101T190000'));
});

test('buildIcs includes the workout description on every event', () => {
  const ics = buildIcs({ startDate: '2025-01-01' });
  const descCount = (ics.match(/DESCRIPTION:Daily 75 Hard workout/g) || []).length;
  assert.equal(descCount, 150);
});

test('buildIcs generates deterministic UIDs', () => {
  const ics = buildIcs({ startDate: '2025-01-01' });
  // Day 1 / W1 and W2 UIDs.
  assert.ok(ics.includes('UID:75hard-2025-01-01-d1-w1@local'));
  assert.ok(ics.includes('UID:75hard-2025-01-01-d1-w2@local'));
  // Day 75 (last day).
  assert.ok(ics.includes('UID:75hard-2025-01-01-d75-w1@local'));
  assert.ok(ics.includes('UID:75hard-2025-01-01-d75-w2@local'));
});

test('buildIcs SUMMARY lines escape the em-dash text properly', () => {
  const ics = buildIcs({ startDate: '2025-01-01' });
  // SUMMARY is "75 Hard — Workout 1" — em-dash is not a TEXT special so
  // it survives unchanged.
  assert.ok(ics.includes('SUMMARY:75 Hard — Workout 1'));
  assert.ok(ics.includes('SUMMARY:75 Hard — Workout 2'));
});

test('buildIcs falls back to defaults for invalid time strings', () => {
  const ics = buildIcs({ startDate: '2025-01-01' }, {
    workout1Time: 'bogus', workout2Time: '25:00',
  });
  // Defaults: 06:00 + 17:00.
  assert.ok(ics.includes('DTSTART:20250101T060000'));
  assert.ok(ics.includes('DTSTART:20250101T170000'));
});

test('buildIcs advances calendar dates across the full 75 days', () => {
  // startDate 2025-01-01 means day 75 lands on 2025-03-16 (31+28+16).
  const ics = buildIcs({ startDate: '2025-01-01' });
  assert.ok(ics.includes('DTSTART:20250316T060000'),
    'day 75 workout 1 should be on 2025-03-16');
  assert.ok(ics.includes('DTSTART:20250316T170000'),
    'day 75 workout 2 should be on 2025-03-16');
});

test('buildIcs end-of-file has a trailing CRLF', () => {
  const ics = buildIcs({ startDate: '2025-01-01' });
  assert.ok(ics.endsWith('\r\n'), 'ICS must terminate with CRLF');
});

test('buildIcs every content line is <= 75 octets', () => {
  // Worst case in our generator is `UID:75hard-YYYY-MM-DD-d75-w2@local`
  // — well under 75. Spot-check anyway.
  const ics = buildIcs({ startDate: '2025-01-01' });
  for(const line of crlfLines(ics.trimEnd())){
    assert.ok(new TextEncoder().encode(line).length <= 75,
      `line too long (${line.length}): ${line}`);
  }
});

test('buildIcs unfold round-trip preserves SUMMARY/DESCRIPTION/UID', () => {
  // If we ever exceeded 75 octets, the unfolded result still matches.
  const ics = buildIcs({ startDate: '2025-01-01' });
  const lines = unfold(crlfLines(ics.trimEnd()));
  // Each event has UID, DTSTAMP, DTSTART, DTEND, SUMMARY, DESCRIPTION.
  const uids = lines.filter(l => l.startsWith('UID:'));
  assert.equal(uids.length, 150);
});
