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
 * @property {'default'|'granted'|'denied'} notificationPermission  Last result of the Notifications
 *                                            permission prompt (w4b). UI uses this to enable/disable
 *                                            the REQUEST PERMISSION button.
 * @property {boolean} enableReminders         Master toggle for the four daily notifications.
 * @property {string}  reminderMorningWorkout  HH:MM 24-hour. Default 07:00.
 * @property {string}  reminderWater           HH:MM 24-hour. Default 12:00.
 * @property {string}  reminderPhoto           HH:MM 24-hour. Default 18:00.
 * @property {string}  reminderTasksRemaining  HH:MM 24-hour. Default 21:00.
 * @property {number}  streakWarnHour          Hour (0..23) past which an incomplete day shows the
 *                                            red "tasks remaining" urgent banner. Default 21.
 * @property {string}  icsWorkout1Time         HH:MM 24-hour default for Workout 1 in ICS export.
 * @property {string}  icsWorkout2Time         HH:MM 24-hour default for Workout 2 in ICS export.
 */

/** Defaults applied when a key is missing from the stored blob. @type {Settings} */
const DEFAULTS = Object.freeze({
  confetti: true,
  quoteRotationSec: 20,
  weightUnit: 'lbs',
  reducedMotion: 'auto',
  forgetPhotosOnReset: true,
  customQuotes: [],
  // w4b: reminders
  notificationPermission: 'default',
  enableReminders: false,
  reminderMorningWorkout: '07:00',
  reminderWater: '12:00',
  reminderPhoto: '18:00',
  reminderTasksRemaining: '21:00',
  // w4b: streak-at-risk threshold
  streakWarnHour: 21,
  // w4b: ICS export defaults
  icsWorkout1Time: '06:00',
  icsWorkout2Time: '17:00',
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

/** Helper: write to a DOM element if it exists. */
function setIfPresent(id, fn){
  const el = document.getElementById(id);
  if(el) fn(el);
}

/**
 * Reflect the current notification permission state into the settings
 * panel — disables the REQUEST button when granted/denied (the OS will
 * not re-prompt) and updates the inline status indicator.
 * @returns {void}
 */
export function refreshNotificationPermissionUi(){
  const perm = (typeof Notification !== 'undefined' && Notification.permission) || 'default';
  setIfPresent('set-notif-permission-status', el => {
    el.textContent = `// PERMISSION: ${perm.toUpperCase()}`;
    el.dataset.perm = perm;
  });
  setIfPresent('set-notif-request', el => {
    el.disabled = (perm === 'granted' || perm === 'denied');
  });
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
  // w4b: reminders
  setIfPresent('set-enable-reminders', el => { el.checked = !!s.enableReminders; });
  setIfPresent('set-rem-morning',      el => { el.value = s.reminderMorningWorkout; });
  setIfPresent('set-rem-water',        el => { el.value = s.reminderWater; });
  setIfPresent('set-rem-photo',        el => { el.value = s.reminderPhoto; });
  setIfPresent('set-rem-tasks',        el => { el.value = s.reminderTasksRemaining; });
  // w4b: streak warn hour
  setIfPresent('set-streak-warn-hour', el => { el.value = s.streakWarnHour; });
  // w4b: ICS defaults
  setIfPresent('set-ics-w1', el => { el.value = s.icsWorkout1Time; });
  setIfPresent('set-ics-w2', el => { el.value = s.icsWorkout2Time; });
  refreshNotificationPermissionUi();
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

  // w4b: reminders + streak + ICS
  const readHHMM = (id, fallback) => {
    const v = document.getElementById(id);
    if(!v) return fallback;
    const t = String(v.value || '').trim();
    return /^([0-2]?\d):([0-5]\d)$/.test(t) ? t : fallback;
  };
  const enableReminders = !!(document.getElementById('set-enable-reminders') && document.getElementById('set-enable-reminders').checked);
  const reminderMorningWorkout = readHHMM('set-rem-morning', DEFAULTS.reminderMorningWorkout);
  const reminderWater          = readHHMM('set-rem-water',   DEFAULTS.reminderWater);
  const reminderPhoto          = readHHMM('set-rem-photo',   DEFAULTS.reminderPhoto);
  const reminderTasksRemaining = readHHMM('set-rem-tasks',   DEFAULTS.reminderTasksRemaining);
  const swhEl = document.getElementById('set-streak-warn-hour');
  let streakWarnHour = DEFAULTS.streakWarnHour;
  if(swhEl){
    const n = parseInt(swhEl.value, 10);
    if(Number.isFinite(n)) streakWarnHour = Math.max(0, Math.min(23, n));
  }
  const icsWorkout1Time = readHHMM('set-ics-w1', DEFAULTS.icsWorkout1Time);
  const icsWorkout2Time = readHHMM('set-ics-w2', DEFAULTS.icsWorkout2Time);

  saveSettings({
    confetti, quoteRotationSec, weightUnit, reducedMotion, forgetPhotosOnReset, customQuotes,
    enableReminders,
    reminderMorningWorkout, reminderWater, reminderPhoto, reminderTasksRemaining,
    streakWarnHour,
    icsWorkout1Time, icsWorkout2Time,
  });
  closeSettings();
  showToast('Settings saved');
}

/** Convert a weight value from lbs to kg, rounded to 1 decimal. */
export function lbsToKg(v){ return Math.round((v * 0.45359237) * 10) / 10; }
/** Convert a weight value from kg to lbs, rounded to 1 decimal. */
export function kgToLbs(v){ return Math.round((v / 0.45359237) * 10) / 10; }
