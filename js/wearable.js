/**
 * @file Wearable sleep import — STUB + CSV fallback (item 50).
 *
 * Sister to {@link module:health}. Same reasoning: real Oura / Whoop /
 * Fitbit integration needs per-vendor OAuth 2.0 client setup with
 * working redirect URIs, which the static-only PWA can't host. We
 * surface the implementation plan in an info modal and ship a working
 * manual CSV import as the actual user-facing path.
 *
 * # Why each vendor is "complicated"
 *   - **Oura**: cloud API exists (https://cloud.ouraring.com/v2/docs) and
 *     uses standard OAuth 2.0. Workable for a single-page app via PKCE,
 *     but requires registering a developer app and pinning a redirect.
 *   - **Whoop**: developer portal at https://developer.whoop.com — OAuth
 *     2.0, requires explicit access approval, only sleep summary is
 *     trivially fetched.
 *   - **Fitbit**: https://dev.fitbit.com — OAuth 2.0 + PKCE. Rate-limited
 *     to 150 calls/hour. Web app must whitelist its origin.
 *   - **Apple Watch**: surface only via HealthKit on iOS — requires a
 *     native wrapper.
 *
 * # Working fallback (today)
 *   - {@link parseSleepCsv}: parse a `date,hours_sleep` CSV (Oura
 *     "Sleep Score" export and Whoop CSV exports both contain this
 *     shape after a column trim).
 *   - {@link handleSleepCsv}: bulk-load into `state.metrics[d].sleep`.
 *
 * # Scoped out
 *   - Sleep stages (deep/REM/light), HRV, respiratory rate. Schema has
 *     a single `sleep:number` (hours) slot today.
 *   - Per-vendor parsers — we accept the lowest-common-denominator
 *     two-column CSV. Users massage exports in a spreadsheet first.
 *   - OAuth 2.0 implementations for ANY vendor.
 */

import { getState, saveState, parseLocalDate } from './state.js';
import { showToast } from './toast.js';
import { emit } from './bus.js';

/**
 * Static informational text shown in the wearable OAuth-stub modal.
 * Exported so tests can pin its shape.
 */
export const WEARABLE_OAUTH_INFO = [
  '// WEARABLE SLEEP IMPORT — DEVELOPER NOTE',
  '',
  'Each major wearable platform exposes sleep over OAuth 2.0:',
  '',
  '  - Oura:   https://cloud.ouraring.com/v2/docs (PKCE)',
  '  - Whoop:  https://developer.whoop.com (manual approval)',
  '  - Fitbit: https://dev.fitbit.com (OAuth + PKCE, 150 calls/hr)',
  '  - Apple Watch: HealthKit — native iOS shell required',
  '',
  'To implement: register a developer app per vendor, configure the',
  'redirect URI to match the deploy URL, run the PKCE flow from the',
  'browser, and pull the sleep summary endpoint.',
  '',
  'This static-only build does NOT include per-vendor secrets. Until a',
  'maintainer adds them, the working fallback below is your friend.',
  '',
  '// FALLBACK — MANUAL SLEEP IMPORT',
  '',
  'Export sleep history from your wearable\'s app as a CSV with rows',
  'like:',
  '',
  '  date,hours_sleep',
  '  2025-01-15,7.5',
  '  2025-01-16,6.8',
  '',
  'Then click MANUAL SLEEP IMPORT to bulk-load those nights.',
].join('\n');

/**
 * Display the OAuth info modal. Falls back to `alert()` if the page
 * doesn't expose a dedicated modal slot.
 * @returns {void}
 */
export function openWearableInfo(){
  const overlay = (typeof document !== 'undefined') && document.getElementById('wearable-info-overlay');
  if(!overlay){
    if(typeof alert === 'function') alert(WEARABLE_OAUTH_INFO);
    return;
  }
  const body = document.getElementById('wearable-info-body');
  if(body) body.textContent = WEARABLE_OAUTH_INFO;
  overlay.classList.add('open');
}

/**
 * Close the wearable OAuth info modal.
 * @returns {void}
 */
export function closeWearableInfo(){
  const overlay = (typeof document !== 'undefined') && document.getElementById('wearable-info-overlay');
  if(overlay) overlay.classList.remove('open');
}

/**
 * Trigger the hidden file picker for the sleep CSV import.
 * @returns {void}
 */
export function pickSleepCsv(){
  const input = document.getElementById('wearable-sleep-csv-input');
  if(input) input.click();
}

/**
 * Parse a CSV string of `date,hours_sleep` rows into a sorted, deduped
 * list of `{date, hoursSleep}` entries.
 *
 * Rules mirror {@link module:health.parseWeightCsv}:
 *   - First line MAY be a header — detected and skipped.
 *   - Blank lines and `#`-comments are skipped.
 *   - Dates must be ISO "YYYY-MM-DD".
 *   - Hours must parse to finite, > 0, <= 24.
 *   - On duplicate dates, the last occurrence wins.
 *
 * Pure function — no DOM, no localStorage. Testable in isolation.
 *
 * @param {string} text
 * @returns {Array<{date:string, hoursSleep:number}>} ascending by date.
 */
export function parseSleepCsv(text){
  if(typeof text !== 'string' || !text.trim()) return [];
  const rows = text.split(/\r?\n/);
  /** @type {Map<string, number>} */
  const byDate = new Map();
  for(let i=0;i<rows.length;i++){
    const raw = rows[i];
    if(!raw) continue;
    const line = raw.trim();
    if(!line || line.startsWith('#')) continue;
    const parts = line.split(',').map(p => p.trim());
    if(parts.length < 2) continue;
    const date = parts[0];
    const hoursTok = parts[1];
    if(i === 0 && (!isIsoDate(date) || !Number.isFinite(parseFloat(hoursTok)))){
      continue;
    }
    if(!isIsoDate(date)) continue;
    const h = parseFloat(hoursTok);
    if(!Number.isFinite(h) || h <= 0 || h > 24) continue;
    byDate.set(date, h);
  }
  const out = Array.from(byDate.entries()).map(([date, hoursSleep]) => ({ date, hoursSleep }));
  out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return out;
}

/**
 * Strict ISO-date validator. Identical to the one in js/health.js — small
 * enough to duplicate rather than pull a shared helper across two stub
 * modules that have no other coupling.
 * @param {string} s
 * @returns {boolean}
 */
function isIsoDate(s){
  if(typeof s !== 'string') return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split('-').map(Number);
  if(m < 1 || m > 12) return false;
  if(d < 1 || d > 31) return false;
  const dt = new Date(y, m-1, d);
  return dt.getFullYear()===y && dt.getMonth()===m-1 && dt.getDate()===d;
}

/**
 * Map a YYYY-MM-DD date to the day index relative to the challenge's
 * startDate. Caps at 365 so Live Hard windows are also valid.
 * @param {import('./state.js').State} s
 * @param {string} dateIso
 * @returns {?number}
 */
function dateIsoToDay(s, dateIso){
  if(!s || !s.startDate) return null;
  const start = parseLocalDate(s.startDate);
  const d = parseLocalDate(dateIso);
  const diff = Math.floor((d - start)/86400000) + 1;
  if(diff < 1 || diff > 365) return null;
  return diff;
}

/**
 * Bulk-import sleep rows from a CSV File. Existing sleep values are
 * OVERWRITTEN. Weight values on the same day, if any, are preserved.
 *
 * @param {File} file
 * @returns {Promise<{imported:number, skipped:number}>}
 */
export function handleSleepCsv(file){
  return new Promise((resolve) => {
    if(!file){ resolve({imported:0, skipped:0}); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || '');
      const rows = parseSleepCsv(text);
      const s = getState();
      if(!s){ resolve({imported:0, skipped:rows.length}); return; }
      if(!s.metrics) s.metrics = {};
      let imported = 0, skipped = 0;
      for(const { date, hoursSleep } of rows){
        const day = dateIsoToDay(s, date);
        if(day == null){ skipped++; continue; }
        const prev = s.metrics[day] || {};
        s.metrics[day] = { weight: prev.weight != null ? prev.weight : null, sleep: hoursSleep };
        imported++;
      }
      saveState(s);
      showToast(`Imported ${imported} sleep row${imported===1?'':'s'}`);
      emit('state:changed', s);
      resolve({imported, skipped});
    };
    reader.onerror = () => {
      showToast('Could not read CSV');
      resolve({imported:0, skipped:0});
    };
    reader.readAsText(file);
  });
}

/**
 * Hidden file <input> change handler. Wired by main.js once at boot.
 * @param {Event} e
 * @returns {void}
 */
export function onSleepCsvChange(e){
  const file = e && e.target && e.target.files && e.target.files[0];
  if(!file) return;
  handleSleepCsv(file).finally(() => {
    if(e.target) e.target.value = '';
  });
}
