// Unit tests for js/export.js — focused on the pure helpers:
// CRC32, base64<->bytes round-trip, STORE-only ZIP encode/decode, and
// the diff summarizer used by the import-confirm modal.
//
// Run with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- localStorage + DOM polyfill -------------------------------------------
// export.js (transitively) imports state.js + toast.js + countdown.js +
// quotes.js + confetti.js + bus.js. We stub just enough to let it load
// in Node without touching the network.
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

const { _internal } = await import('../js/export.js');
const { crc32, dataUrlToBytes, bytesToJpegDataUrl, buildZip, parseZip, summarizeState } = _internal;

// --- crc32 -----------------------------------------------------------------

test('crc32 matches known IEEE 802.3 test vectors', () => {
  // "" -> 0; "a" -> 0xe8b7be43; "123456789" -> 0xcbf43926
  assert.equal(crc32(new Uint8Array(0)), 0);
  const a = new TextEncoder().encode('a');
  assert.equal(crc32(a), 0xe8b7be43);
  const nine = new TextEncoder().encode('123456789');
  assert.equal(crc32(nine), 0xcbf43926);
});

// --- base64 round-trip -----------------------------------------------------

test('dataUrlToBytes / bytesToJpegDataUrl round-trip preserves bytes', () => {
  const bytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9]);
  const url = bytesToJpegDataUrl(bytes);
  assert.match(url, /^data:image\/jpeg;base64,/);
  const back = dataUrlToBytes(url);
  assert.equal(back.length, bytes.length);
  for (let i = 0; i < bytes.length; i++) assert.equal(back[i], bytes[i]);
});

// --- ZIP encode / decode round-trip ----------------------------------------

test('buildZip produces a parseable archive (round-trip)', () => {
  const enc = new TextEncoder();
  const entries = [
    { name: 'photo_day_1.jpg', data: enc.encode('FAKE-JPEG-BYTES-FOR-DAY-1') },
    { name: 'photo_day_7.jpg', data: new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9, 0x00, 0x01, 0x02, 0x03]) },
    { name: 'photo_day_75.jpg', data: enc.encode('end-of-challenge') },
  ];
  const zip = buildZip(entries);
  // Local file header signature at offset 0.
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  // EOCD signature appears in the last 22 bytes.
  assert.equal(v.getUint32(zip.length - 22, true), 0x06054b50);

  const parsed = parseZip(zip);
  assert.equal(parsed.length, entries.length);
  for (let i = 0; i < entries.length; i++) {
    assert.equal(parsed[i].name, entries[i].name);
    assert.equal(parsed[i].data.length, entries[i].data.length);
    for (let j = 0; j < entries[i].data.length; j++) {
      assert.equal(parsed[i].data[j], entries[i].data[j]);
    }
  }
});

test('buildZip handles an empty archive', () => {
  const zip = buildZip([]);
  // Just an EOCD record (22 bytes).
  assert.equal(zip.length, 22);
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(v.getUint32(0, true), 0x06054b50);
  assert.equal(v.getUint16(8, true), 0);  // entries on this disk
  assert.equal(v.getUint16(10, true), 0); // total entries
  const parsed = parseZip(zip);
  assert.equal(parsed.length, 0);
});

test('parseZip skips non-STORE entries with a warning', () => {
  // Hand-craft a single-entry archive with method = 8 (DEFLATE).
  // The parser should drop the entry rather than crash.
  const name = new TextEncoder().encode('x.bin');
  const data = new Uint8Array([1, 2, 3, 4]);
  const lfh = new Uint8Array(30 + name.length + data.length);
  const v = new DataView(lfh.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(8, 8, true); // DEFLATE
  v.setUint32(18, data.length, true);
  v.setUint32(22, data.length, true);
  v.setUint16(26, name.length, true);
  lfh.set(name, 30);
  lfh.set(data, 30 + name.length);

  // Silence the expected console.warn.
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    const parsed = parseZip(lfh);
    assert.equal(parsed.length, 0);
  } finally {
    console.warn = origWarn;
  }
});

test('CRC32 in archive matches the bytes inside each entry', () => {
  // Verify that the CRC we wrote into each LFH matches a fresh CRC of
  // the data — proves the encoder didn't fall out of sync.
  const entries = [
    { name: 'a.jpg', data: new TextEncoder().encode('hello world') },
    { name: 'b.jpg', data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) },
  ];
  const zip = buildZip(entries);
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let p = 0;
  for (const e of entries) {
    assert.equal(v.getUint32(p, true), 0x04034b50);
    const storedCrc = v.getUint32(p + 14, true);
    assert.equal(storedCrc, crc32(e.data));
    const compSize = v.getUint32(p + 18, true);
    const nameLen = v.getUint16(p + 26, true);
    const extraLen = v.getUint16(p + 28, true);
    p = p + 30 + nameLen + extraLen + compSize;
  }
});

// --- summarizeState (import-confirm diff) ----------------------------------

test('summarizeState counts complete days, photo refs, books, drinks weeks', () => {
  const s = {
    startDate: '2025-01-01',
    days: {
      1: { calorie: true, w1: true, w2: true, read: true, water: true, photo: true },
      2: { calorie: true, w1: true, w2: true, read: true, water: false, photo: true },
      3: { photo: true },
      4: {},
    },
    books: { 1: { title: 'A', pages: 10 }, 3: { title: 'B', pages: 20 } },
    drinks: { 1: 2, 2: 0 },
  };
  const sum = summarizeState(s);
  // Day 1 is fully complete; day 2 misses water; day 3 only has photo; day 4 empty.
  assert.equal(sum.days, 1);
  // Photo refs = days where `photo:true` (1, 2, 3).
  assert.equal(sum.photoRefs, 3);
  assert.equal(sum.books, 2);
  assert.equal(sum.drinks, 2);
});

test('summarizeState handles null/missing fields', () => {
  assert.deepEqual(summarizeState(null), { days: 0, photoRefs: 0, books: 0, drinks: 0 });
  assert.deepEqual(summarizeState({ startDate: '2025-01-01' }),
    { days: 0, photoRefs: 0, books: 0, drinks: 0 });
});
