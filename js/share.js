/**
 * @file Read-only shareable progress links (w5c item 44).
 *
 * A "share link" is the current app URL with a `#share=<payload>` fragment.
 * The payload is a base64-encoded JSON blob carrying a stripped-down
 * snapshot of the user's state:
 *
 *   - display name
 *   - current day (1..75)
 *   - streak length
 *   - days complete total
 *   - per-day completion booleans (1 byte each in the JSON)
 *   - schema version + a small generation timestamp
 *
 * Deliberately omitted (privacy):
 *
 *   - photos / photo blobs
 *   - field notes / diet notes / failure reasons
 *   - book titles, drinks counts, custom quotes
 *   - weight / sleep / measurements / wellbeing
 *   - custom workout labels
 *   - the original startDate (we share `dayN` instead, so the
 *     recipient cannot back-derive when the challenge began)
 *
 * The payload is hash-fragment only — fragments are never sent to a
 * server by user agents, which keeps the share self-contained even if
 * the page is later hosted somewhere with analytics.
 *
 * This module also owns the "shared view" renderer: when boot detects
 * a `#share=` fragment, `renderSharedView` populates a host element
 * with a read-only snapshot screen (name + day banner + 75-tile grid
 * + summary stats + back button). The renderer is intentionally
 * dependency-light: it does NOT touch the user's own state, only the
 * snapshot passed in.
 */

import { TOTAL } from './constants.js';
import { CURRENT_SCHEMA_VERSION } from './state.js';

/** Magic prefix that identifies a v1 share payload after base64 decode. */
const SHARE_MAGIC = '75H1';

/**
 * @typedef {Object} ShareSnapshot
 * @property {string} magic     Always {@link SHARE_MAGIC} ("75H1").
 * @property {number} v         Schema version of the source state.
 * @property {string} name      Display name (uppercase, may be empty).
 * @property {number} day       Current challenge day (1..TOTAL).
 * @property {number} streak    Length of the consecutive-complete streak.
 * @property {number} done      Total complete days so far.
 * @property {string} grid      75-char string of "1"/"0" flags — one per day,
 *                              "1" = isDayComplete. Cheap to encode/decode.
 * @property {number} ts        Unix millis when the snapshot was generated.
 */

/**
 * URL-safe base64: standard base64 with `+` -> `-`, `/` -> `_`, and no
 * `=` padding. Used so the fragment doesn't need to be URL-encoded.
 * @param {string} bin  Binary string (one char per byte).
 * @returns {string}
 */
function b64UrlEncode(bin){
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Inverse of {@link b64UrlEncode}: restore `+`/`/` and pad `=`s back
 * up to a multiple of 4 before calling `atob`.
 * @param {string} s
 * @returns {string} binary string
 */
function b64UrlDecode(s){
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while(t.length % 4) t += '=';
  return atob(t);
}

/**
 * Encode a UTF-8 string to a base64url payload via TextEncoder. The
 * intermediate binary-string step is required because `btoa` rejects
 * any code unit > 0xFF (e.g. an em-dash in the user's name).
 * @param {string} str
 * @returns {string} base64url
 */
function strToB64Url(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for(let i = 0; i < bytes.length; i += CHUNK){
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return b64UrlEncode(bin);
}

/**
 * Inverse of {@link strToB64Url}. Returns `null` if the input isn't
 * valid base64url, since this runs against untrusted URL fragments.
 * @param {string} b64
 * @returns {?string}
 */
function b64UrlToStr(b64){
  try{
    const bin = b64UrlDecode(b64);
    const bytes = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }catch(_e){
    return null;
  }
}

/**
 * Mirror of {@link import('./state.js').isDayComplete}, but operating
 * on a raw day record (so we don't drag the state module's defaults
 * merge into the snapshot path). Diet slot accepts either the v3
 * `dietAdherence` flag or the legacy `calorie` flag.
 * @param {?Object} dd
 * @returns {boolean}
 */
function dayComplete(dd){
  if(!dd) return false;
  const diet = dd.dietAdherence || dd.calorie;
  return !!(diet && dd.w1 && dd.w2 && dd.read && dd.water && dd.photo);
}

/**
 * Build the {@link ShareSnapshot} from the caller's full state. Caller
 * also passes `currentDay` so we don't have to re-read state — keeps
 * this function pure for testing.
 *
 * @param {import('./state.js').State} s
 * @param {number} currentDay  Today, 1..TOTAL.
 * @returns {ShareSnapshot}
 */
export function buildSnapshot(s, currentDay){
  const day = Math.max(1, Math.min(TOTAL, currentDay | 0));
  // Build 75-char grid string. Future days are always "0" — we never
  // mark a day complete before it's the user's "today".
  let grid = '';
  let done = 0;
  let streak = 0;
  // Walk backwards from today to count streak; walk forwards once to
  // build grid + done count.
  for(let d = 1; d <= TOTAL; d++){
    const dd = s.days ? s.days[d] : null;
    const c = (d <= day) && dayComplete(dd);
    grid += c ? '1' : '0';
    if(c) done++;
  }
  for(let d = day; d >= 1; d--){
    if(grid.charAt(d - 1) === '1') streak++; else break;
  }
  return {
    magic: SHARE_MAGIC,
    v: CURRENT_SCHEMA_VERSION,
    name: (s.name || '').toString().slice(0, 32),
    day,
    streak,
    done,
    grid,
    ts: Date.now(),
  };
}

/**
 * Encode a snapshot into the `#share=...` URL fragment. Returns the
 * full URL (origin + path + fragment) so the caller can copy or share
 * it directly. Strips any existing `?query` or `#hash` from the input
 * base URL so re-sharing from a shared page produces a clean link.
 *
 * @param {ShareSnapshot} snap
 * @param {string} [baseUrl]  Optional URL to attach the fragment to;
 *                            defaults to the current `location.href`.
 * @returns {string}
 */
export function encodeShareUrl(snap, baseUrl){
  const payload = strToB64Url(JSON.stringify(snap));
  let base = baseUrl;
  if(!base && typeof location !== 'undefined') base = location.href;
  if(!base) base = '';
  // Strip ? and # so we share a clean snapshot URL.
  const qIdx = base.indexOf('?');
  const hIdx = base.indexOf('#');
  let cut = base.length;
  if(qIdx >= 0) cut = Math.min(cut, qIdx);
  if(hIdx >= 0) cut = Math.min(cut, hIdx);
  return base.slice(0, cut) + '#share=' + payload;
}

/**
 * Generate a share URL from the user's current state — the all-in-one
 * helper used by `js/export.js`.
 *
 * @param {import('./state.js').State} s
 * @param {number} currentDay
 * @param {string} [baseUrl]
 * @returns {string}
 */
export function generateShareUrl(s, currentDay, baseUrl){
  return encodeShareUrl(buildSnapshot(s, currentDay), baseUrl);
}

/**
 * Decode a `#share=<payload>` fragment (or a raw payload string) into
 * a {@link ShareSnapshot}. Returns `null` on any validation failure —
 * malformed base64, malformed JSON, missing/wrong magic, or fields out
 * of the documented range.
 *
 * Safe to call against untrusted input.
 *
 * @param {string} input  Either a URL, a fragment "#share=...", or just
 *                        the bare base64url payload.
 * @returns {?ShareSnapshot}
 */
export function decodeShareFragment(input){
  if(!input || typeof input !== 'string') return null;
  // Accept full URLs, "#share=...", or the bare base64 payload.
  let payload = input;
  const hashIdx = payload.indexOf('#share=');
  if(hashIdx >= 0) payload = payload.slice(hashIdx + '#share='.length);
  else if(payload.startsWith('share=')) payload = payload.slice('share='.length);
  // Strip any further `&` or `#` separators after the payload.
  const amp = payload.indexOf('&');
  if(amp >= 0) payload = payload.slice(0, amp);
  if(!payload) return null;
  const json = b64UrlToStr(payload);
  if(!json) return null;
  let obj;
  try{ obj = JSON.parse(json); }
  catch(_e){ return null; }
  if(!obj || typeof obj !== 'object') return null;
  if(obj.magic !== SHARE_MAGIC) return null;
  if(typeof obj.name !== 'string') return null;
  if(typeof obj.day !== 'number' || obj.day < 1 || obj.day > TOTAL) return null;
  if(typeof obj.streak !== 'number' || obj.streak < 0 || obj.streak > TOTAL) return null;
  if(typeof obj.done !== 'number' || obj.done < 0 || obj.done > TOTAL) return null;
  if(typeof obj.grid !== 'string' || obj.grid.length !== TOTAL) return null;
  if(!/^[01]+$/.test(obj.grid)) return null;
  // Defensive clamps — accept the snapshot even when the source had a
  // future schema version, we just won't understand any new fields.
  const v = typeof obj.v === 'number' ? obj.v : CURRENT_SCHEMA_VERSION;
  const ts = typeof obj.ts === 'number' ? obj.ts : 0;
  return {
    magic: SHARE_MAGIC, v,
    name: obj.name.slice(0, 64),
    day: obj.day | 0,
    streak: obj.streak | 0,
    done: obj.done | 0,
    grid: obj.grid,
    ts,
  };
}

/**
 * Read the current `location.hash` and decode it if it carries a
 * share payload. Returns `null` when there is no fragment or it's
 * unparseable.
 * @returns {?ShareSnapshot}
 */
export function parseShareFragment(){
  if(typeof location === 'undefined' || !location.hash) return null;
  return decodeShareFragment(location.hash);
}

/**
 * Cheap HTML escape — used by the read-only renderer to project the
 * shared name (and any future free-text we add) into innerHTML safely.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a read-only snapshot view into `container`. Builds:
 *   - a header with the friend's name + day + back button
 *   - summary stat pills (streak, days done, progress %)
 *   - a 75-tile grid using the same visual treatment as the main grid
 *
 * The back button calls `onBack()` if provided, otherwise it strips
 * the `#share=...` fragment and reloads.
 *
 * @param {ShareSnapshot} snap
 * @param {Element} container
 * @param {{onBack?:Function}} [opts]
 * @returns {void}
 */
export function renderSharedView(snap, container, opts){
  if(!container || !snap) return;
  const name = (snap.name && snap.name.trim()) || 'SOLDIER';
  const pct = Math.round((snap.done / TOTAL) * 100);

  let tiles = '';
  for(let d = 1; d <= TOTAL; d++){
    const c = snap.grid.charAt(d - 1) === '1';
    const future = d > snap.day;
    const isToday = d === snap.day;
    const cls = ['day-tile'];
    if(c) cls.push('complete');
    if(future) cls.push('future');
    if(isToday) cls.push('today');
    const emoji = c ? '✅' : (future ? '⬜' : '🟡');
    tiles += `<div class="${cls.join(' ')}"><span class="tile-num">${d}</span><span class="tile-emoji">${emoji}</span></div>`;
  }

  const ageHint = snap.ts ? `// SNAPSHOT FROM ${new Date(snap.ts).toISOString().slice(0,10)}` : '';

  container.innerHTML = `
    <div class="shared-view">
      <div class="shared-header">
        <div class="shared-title">VIEWING ${escapeHtml(name)}'S 75 HARD</div>
        <div class="shared-sub">// DAY ${snap.day} OF ${TOTAL} ${ageHint ? '— ' + ageHint : ''}</div>
        <button type="button" class="shared-back btn-sm" id="shared-back-btn">[ BACK TO MY TRACKER ]</button>
      </div>
      <div class="shared-stats">
        <div class="stat-card"><div class="stat-card-val">${snap.streak}</div><div class="stat-card-lbl">Current Streak</div></div>
        <div class="stat-card green"><div class="stat-card-val">${snap.done}</div><div class="stat-card-lbl">Days Complete</div></div>
        <div class="stat-card gold"><div class="stat-card-val">${pct}%</div><div class="stat-card-lbl">Progress</div></div>
        <div class="stat-card blue"><div class="stat-card-val">${snap.day}</div><div class="stat-card-lbl">Days In</div></div>
      </div>
      <div class="section">
        <div class="section-title">MISSION OVERVIEW</div>
        <div class="day-grid">${tiles}</div>
      </div>
    </div>
  `;

  const backBtn = container.querySelector('#shared-back-btn');
  if(backBtn){
    backBtn.addEventListener('click', () => {
      if(opts && typeof opts.onBack === 'function'){
        opts.onBack();
        return;
      }
      if(typeof location !== 'undefined'){
        // Strip the fragment and reload into the normal app.
        const clean = location.href.replace(/#.*$/, '');
        location.href = clean;
      }
    });
  }
}

/**
 * Test-only escape hatch — pull the internal helpers out for direct
 * unit-testing without exposing them as a public surface.
 */
export const _internal = {
  b64UrlEncode, b64UrlDecode, strToB64Url, b64UrlToStr,
  dayComplete, escapeHtml, SHARE_MAGIC,
};
