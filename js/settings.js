/**
 * @file User-customizable app settings — small panel in the header.
 *
 * Settings live in localStorage under {@link SETTINGS_KEY} and are
 * always loaded through {@link getSettings}, which merges the stored
 * blob over the {@link DEFAULTS} so unknown/missing keys never crash
 * the consumers. Modifications go through {@link saveSettings}, which
 * shallow-merges a patch and emits a `settings:changed` bus event.
 *
 * Consumers:
 *   - js/confetti.js  reads `confetti` + `reducedMotion`
 *   - js/quotes.js    reads `quoteRotationSec` + `customQuotes`
 *   - js/metrics.js   reads `weightUnit` (presentation only)
 *   - js/stats.js     reads `weightUnit` (presentation only)
 *   - js/main.js      subscribes to `settings:changed` for full rerender
 */

import { SETTINGS_KEY } from './constants.js';
import { emit } from './bus.js';
import { showToast } from './toast.js';

/**
 * @typedef {Object} Settings
 * @property {boolean} confetti                Fire confetti on day-complete.
 * @property {number}  quoteRotationSec        Seconds between quote rotations; 0 disables.
 * @property {'lbs'|'kg'} weightUnit           Display unit for weight (canonical storage is always lbs).
 * @property {'auto'|'on'|'off'} reducedMotion 'auto' = honor the media query; 'on'/'off' force.
 * @property {boolean} forgetPhotosOnReset     Whether RESET also wipes the photo blobs.
 * @property {Array<{q:string,a:string}>} customQuotes  Extra user-supplied quotes appended to the pool.
 */

/** Defaults applied when a key is missing from the stored blob. @type {Settings} */
const DEFAULTS = Object.freeze({
  confetti: true,
  quoteRotationSec: 20,
  weightUnit: 'lbs',
  reducedMotion: 'auto',
  forgetPhotosOnReset: true,
  customQuotes: [],
});

/**
 * Load the saved settings, merged over {@link DEFAULTS}. Always returns
 * a fully-populated object — callers never have to null-check.
 * @returns {Settings}
 */
export function getSettings(){
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); }
  catch(_e){ raw = null; }
  if(!raw || typeof raw !== 'object') return { ...DEFAULTS };
  // Defensive: customQuotes must be an array of {q,a} strings.
  const cq = Array.isArray(raw.customQuotes)
    ? raw.customQuotes.filter(x => x && typeof x.q === 'string').map(x => ({ q: String(x.q), a: String(x.a || '') }))
    : DEFAULTS.customQuotes;
  return { ...DEFAULTS, ...raw, customQuotes: cq };
}

/**
 * Shallow-merge `patch` over current settings, persist, and emit
 * `settings:changed` with the new {@link Settings} object.
 * @param {Partial<Settings>} patch
 * @returns {Settings} the merged settings object that was persisted.
 */
export function saveSettings(patch){
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); }
  catch(_e){ /* quota — silently fall back to in-memory only */ }
  emit('settings:changed', next);
  return next;
}

/**
 * Whether visual animations (confetti, slide-ins) should be suppressed
 * — combines the `reducedMotion` setting with the browser media query.
 * @returns {boolean}
 */
export function reducedMotionActive(){
  const s = getSettings();
  if(s.reducedMotion === 'on') return true;
  if(s.reducedMotion === 'off') return false;
  if(typeof window !== 'undefined' && window.matchMedia){
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

/**
 * Parse the raw textarea contents into a list of `{q,a}` quotes.
 * One quote per non-empty line. The separator is em-dash (—) or `--`;
 * if neither is present, the whole line is the quote and `a` is blank.
 * Surrounding quote marks and whitespace are trimmed.
 * @param {string} text  Multi-line input from the textarea.
 * @returns {Array<{q:string,a:string}>}
 */
export function parseCustomQuotes(text){
  if(!text || typeof text !== 'string') return [];
  return text.split(/\r?\n/).map(line => {
    const t = line.trim();
    if(!t) return null;
    // Split on the FIRST em-dash or "--" (left side = quote, right = attribution).
    let q = t, a = '';
    const emIdx = t.indexOf('—');
    const ddIdx = t.indexOf('--');
    let splitIdx = -1;
    if(emIdx !== -1 && ddIdx !== -1) splitIdx = Math.min(emIdx, ddIdx);
    else if(emIdx !== -1) splitIdx = emIdx;
    else if(ddIdx !== -1) splitIdx = ddIdx;
    if(splitIdx !== -1){
      q = t.slice(0, splitIdx).trim();
      a = t.slice(splitIdx).replace(/^—|^--/, '').trim();
    }
    // Strip surrounding quote characters from the quote portion
    // (straight + curly double, straight + curly single).
    q = q.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
    if(!q) return null;
    // Re-prefix attribution with em-dash for display consistency with built-ins.
    const aOut = a ? (a.startsWith('—') ? a : '— ' + a) : '';
    return { q, a: aOut };
  }).filter(Boolean);
}

/**
 * Serialize the stored custom-quote list back into the textarea format
 * (`"quote" — author` per line). Used to re-populate the textarea when
 * the modal opens.
 * @param {Array<{q:string,a:string}>} list
 * @returns {string}
 */
export function serializeCustomQuotes(list){
  if(!Array.isArray(list)) return '';
  return list.map(({q, a}) => {
    const attr = (a || '').replace(/^—\s*/, '').trim();
    return attr ? `"${q}" — ${attr}` : `"${q}"`;
  }).join('\n');
}

/**
 * Show the settings modal, pre-filled from the current saved values.
 * @returns {void}
 */
export function openSettings(){
  const overlay = document.getElementById('settings-overlay');
  if(!overlay) return;
  const s = getSettings();
  document.getElementById('set-confetti').checked = !!s.confetti;
  document.getElementById('set-quote-sec').value = s.quoteRotationSec;
  document.getElementById('set-weight-unit').value = s.weightUnit;
  document.getElementById('set-reduced-motion').value = s.reducedMotion;
  document.getElementById('set-forget-photos').checked = !!s.forgetPhotosOnReset;
  document.getElementById('set-custom-quotes').value = serializeCustomQuotes(s.customQuotes);
  overlay.classList.add('open');
}

/** Hide the settings modal without saving. @returns {void} */
export function closeSettings(){
  const overlay = document.getElementById('settings-overlay');
  if(overlay) overlay.classList.remove('open');
}

/**
 * Read current modal inputs, validate, persist, close, and toast.
 * @returns {void}
 */
export function applySettingsFromModal(){
  const confetti = document.getElementById('set-confetti').checked;
  const rawSec = parseInt(document.getElementById('set-quote-sec').value, 10);
  const quoteRotationSec = Number.isFinite(rawSec)
    ? Math.max(0, Math.min(300, rawSec))
    : DEFAULTS.quoteRotationSec;
  const weightUnit = document.getElementById('set-weight-unit').value === 'kg' ? 'kg' : 'lbs';
  const rmVal = document.getElementById('set-reduced-motion').value;
  const reducedMotion = (rmVal === 'on' || rmVal === 'off') ? rmVal : 'auto';
  const forgetPhotosOnReset = document.getElementById('set-forget-photos').checked;
  const customQuotes = parseCustomQuotes(document.getElementById('set-custom-quotes').value);
  saveSettings({ confetti, quoteRotationSec, weightUnit, reducedMotion, forgetPhotosOnReset, customQuotes });
  closeSettings();
  showToast('Settings saved');
}

/** Convert a weight value from lbs to kg, rounded to 1 decimal. */
export function lbsToKg(v){ return Math.round((v * 0.45359237) * 10) / 10; }
/** Convert a weight value from kg to lbs, rounded to 1 decimal. */
export function kgToLbs(v){ return Math.round((v / 0.45359237) * 10) / 10; }
