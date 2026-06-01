/**
 * @file Apple Health / Google Fit integration — STUB + CSV fallback (item 49).
 *
 * # Why this is a stub
 *
 * 75 Hard is a static-only PWA hosted from a plain webserver with no
 * backend. Real Google Fit / Apple Health integration requires:
 *
 *   1. An OAuth 2.0 client ID registered at
 *      https://console.cloud.google.com (for Fit) or an Apple Sign In
 *      provider + a HealthKit-aware iOS shell (for Health).
 *   2. A redirect URI matching the deploy URL.
 *   3. The implicit grant or PKCE flow to obtain an access token.
 *   4. Periodic refresh handling.
 *
 * None of that is in scope for the static build — the page doesn't even
 * have a secrets-capable env. {@link openHealthInfo} surfaces the
 * implementation plan to anyone who wants to fork and add it.
 *
 * # Real, working fallback
 *
 * {@link pickWeightCsv} / {@link handleWeightCsv} / {@link parseWeightCsv}
 * implement a manual CSV import of `date,weight_lbs` rows into
 * `state.metrics[day].weight`. Users can export from their Fit/Health
 * app, paste the CSV into a file, and bulk-load weeks of weigh-ins in
 * one step. This is the path the user actually has today.
 *
 * # Scoped out for future waves
 *   - Live OAuth flow (would need a build-time secret).
 *   - Apple HealthKit native wrapper (PWA-only build).
 *   - Sleep stages, heart rate, HRV, steps imports — only weight is
 *     exposed in the schema today. Adding more would mean extending
 *     `state.metrics[day]` and re-running the migrations.
 *   - Two-way sync (writing back to the provider).
 */

import { getState, saveState, parseLocalDate, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';
import { emit } from './bus.js';

/**
 * Static informational text shown in the OAuth-stub modal. Exported so
 * tests can assert it documents the real implementation path rather
 * than just being a placeholder.
 */
export const HEALTH_OAUTH_INFO = [
  '// HEALTH INTEGRATIONS — DEVELOPER NOTE',
  '',
  'Web apps can integrate with Google Fit via the REST API (requires',
  'OAuth 2.0 client setup). To implement:',
  '',
  '  1. Register an OAuth client at https://console.cloud.google.com',
  '  2. Enable the Fitness API on the project.',
  '  3. Configure the redirect URI to match the deploy URL.',
  '  4. Implement the implicit/PKCE flow from the browser.',
  '  5. Call the dataSources/datasets endpoints to pull weight + sleep.',
  '',
  'Apple Health on iOS only exposes HealthKit to native apps and the',
  'official "Health" web is not a public surface — a real Apple',
  'integration needs a native iOS shell around this PWA.',
  '',
  'This static-only build does NOT include any client secret. Until a',
  'maintainer adds one, the working fallback below is your friend.',
  '',
  '// FALLBACK — MANUAL WEIGHT IMPORT',
  '',
  'Export weight history from Google Fit / Apple Health as a CSV with',
  'rows like:',
  '',
  '  date,weight_lbs',
  '  2025-01-15,184.2',
  '  2025-01-16,183.8',
  '',
  'Then click MANUAL WEIGHT IMPORT to bulk-load those weigh-ins.',
].join('\n');

/**
 * Display the OAuth info modal. Falls back to `alert()` if the page
 * doesn't expose a dedicated modal slot (e.g. headless / test).
 *
 * @returns {void}
 */
export function openHealthInfo(){
  const overlay = (typeof document !== 'undefined') && document.getElementById('health-info-overlay');
  if(!overlay){
    if(typeof alert === 'function') alert(HEALTH_OAUTH_INFO);
    return;
  }
  const body = document.getElementById('health-info-body');
  if(body) body.textContent = HEALTH_OAUTH_INFO;
  overlay.classList.add('open');
}

/**
 * Close the OAuth info modal. Safe to call when not open.
 * @returns {void}
 */
export function closeHealthInfo(){
  const overlay = (typeof document !== 'undefined') && document.getElementById('health-info-overlay');
  if(overlay) overlay.classList.remove('open');
}

/**
 * Open the file picker for the CSV import. Real upload work happens in
 * the change handler ({@link handleWeightCsv}).
 * @returns {void}
 */
export function pickWeightCsv(){
  const input = document.getElementById('health-weight-csv-input');
  if(input) input.click();
}

/**
 * Parse a CSV string of `date,weight_lbs` rows into a sorted, deduped
 * list of `{date, weightLbs}` entries.
 *
 * Rules:
 *   - First line MAY be a header (`date,weight_lbs` or any non-numeric
 *     second column). Headers are detected and skipped.
 *   - Empty lines and lines starting with `#` are skipped.
 *   - Whitespace around tokens is trimmed.
 *   - Dates must be ISO-ish "YYYY-MM-DD". Anything else is rejected for
 *     that row (the row is dropped, parsing continues).
 *   - Weights must parse to a finite positive number; non-finite or
 *     non-positive values are rejected for that row.
 *   - On duplicate dates, the LAST occurrence wins (most recent in the
 *     file is treated as authoritative — matches user expectation if
 *     they appended a corrected row).
 *
 * Pure function — no DOM, no localStorage. The {@link handleWeightCsv}
 * wrapper does the side-effecting import on top.
 *
 * @param {string} text
 * @returns {Array<{date:string, weightLbs:number}>} sorted ascending by date.
 */
export function parseWeightCsv(text){
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
    const weightTok = parts[1];
    // Detect + skip header (first row only).
    if(i === 0 && (!isIsoDate(date) || !Number.isFinite(parseFloat(weightTok)))){
      continue;
    }
    if(!isIsoDate(date)) continue;
    const w = parseFloat(weightTok);
    if(!Number.isFinite(w) || w <= 0) continue;
    byDate.set(date, w);
  }
  const out = Array.from(byDate.entries()).map(([date, weightLbs]) => ({ date, weightLbs }));
  out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return out;
}

/**
 * Strict ISO-date check: "YYYY-MM-DD" AND a real calendar date. Guards
 * against shapes like "2025-13-40" that pass the surface regex but
 * aren't real days. Also rejects feb-29 on non-leap years.
 * @param {string} s
 * @returns {boolean}
 */
function isIsoDate(s){
  if(typeof s !== 'string') return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split('-').map(Number);
  if(m < 1 || m > 12) return false;
  if(d < 1 || d > 31) return false;
  // Construct as local date and verify round-trip.
  const dt = new Date(y, m-1, d);
  return dt.getFullYear()===y && dt.getMonth()===m-1 && dt.getDate()===d;
}

/**
 * Map a YYYY-MM-DD date to the day index relative to the challenge's
 * startDate. Returns `null` if the row falls outside [1, TOTAL_MAX].
 * TOTAL_MAX is intentionally permissive (365) to allow Live Hard
 * imports too.
 *
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
 * Bulk-import weight rows from a CSV File. Reads the file, parses with
 * {@link parseWeightCsv}, and writes each row into
 * `state.metrics[day].weight`. Days that don't yet have a metrics record
 * are created. Existing weights are OVERWRITTEN — the CSV is treated as
 * authoritative.
 *
 * Sleep values on the same day, if any, are preserved.
 *
 * @param {File} file
 * @returns {Promise<{imported:number, skipped:number}>}
 */
export function handleWeightCsv(file){
  return new Promise((resolve) => {
    if(!file){ resolve({imported:0, skipped:0}); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target.result || '');
      const rows = parseWeightCsv(text);
      const s = getState();
      if(!s){ resolve({imported:0, skipped:rows.length}); return; }
      if(!s.metrics) s.metrics = {};
      let imported = 0, skipped = 0;
      for(const { date, weightLbs } of rows){
        const day = dateIsoToDay(s, date);
        if(day == null){ skipped++; continue; }
        const prev = s.metrics[day] || {};
        s.metrics[day] = { weight: weightLbs, sleep: prev.sleep != null ? prev.sleep : null };
        imported++;
      }
      saveState(s);
      showToast(`Imported ${imported} weight row${imported===1?'':'s'}`);
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
export function onWeightCsvChange(e){
  const file = e && e.target && e.target.files && e.target.files[0];
  if(!file) return;
  handleWeightCsv(file).finally(() => {
    // Reset so the same file can be picked again.
    if(e.target) e.target.value = '';
  });
}

// `calcCurrentDay` is imported only for parity with other modules' shape
// in case a future feature uses it (e.g. "skip future days"). Reference
// it so the eslint no-unused-vars rule doesn't bark.
void calcCurrentDay;
