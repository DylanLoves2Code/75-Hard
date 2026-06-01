/**
 * @file Shared constants for the 75 Hard tracker.
 */

/** Total challenge length, in days. */
export const TOTAL = 75;

/** Number of 8 oz cups required to complete the daily water task (1 gallon = 16 cups). */
export const WATER_CUPS = 16;

/** localStorage key for the main saved state JSON. */
export const STORAGE_KEY = '75hard_v2';

/** localStorage key for the light/dark theme preference. */
export const THEME_KEY = '75hard_theme';

/** localStorage key for user-customizable app settings (see js/settings.js). */
export const SETTINGS_KEY = '75hard_settings';

/**
 * Conservative localStorage quota (bytes). Real browser quotas vary
 * (Safari/iOS Safari ~5 MB per origin; desktop browsers often ~10 MB),
 * so we pick the smallest realistic ceiling and warn against it.
 */
export const STORAGE_QUOTA_BYTES = 5_000_000;

/**
 * Fraction of {@link STORAGE_QUOTA_BYTES} at which we surface a soft
 * "consider exporting" warning at boot.
 */
export const STORAGE_WARN_THRESHOLD = 0.8;

/**
 * localStorage key for a given day's progress photo (data URL).
 * Photos are stored OUTSIDE the main state to keep export size small.
 * @param {number} d  Day index (1..TOTAL).
 * @returns {string}  e.g. `"photo_day_5"`.
 */
export const photoKey = d => 'photo_day_' + d;

/**
 * @typedef {Object} TaskDef
 * @property {string} key          Field name on {@link DayData}.
 * @property {string} label        Default display label.
 * @property {string} icon         Emoji icon.
 * @property {boolean} single      True for single-toggle tasks; false for photo task.
 * @property {boolean} [customLabel] True if the user may rename this task's label.
 */

/**
 * Ordered list of the six daily objectives.
 *
 * Slot 0 holds the diet-adherence task. v3 renamed it from `calorie`
 * (vague "calorie deficit") to `dietAdherence` ("Follow Diet"). The
 * historical key is still accepted by {@link isDayComplete} for
 * back-compat with pre-v3 day records.
 * @type {TaskDef[]}
 */
export const TASKS = [
  {key:'dietAdherence',label:'Follow Diet',icon:'🔥',single:true},
  {key:'w1',label:'Workout 1',icon:'💪',single:true,customLabel:true},
  {key:'w2',label:'Workout 2',icon:'🏋️',single:true,customLabel:true},
  {key:'read',label:'Read 10 Pages',icon:'📖',single:true},
  {key:'water',label:'1 Gallon Water',icon:'💧',single:true},
  {key:'photo',label:'Progress Photo',icon:'📸',single:false},
];

/**
 * Extra tasks layered on TOP of {@link TASKS} when the user enters Live
 * Hard Phase 1 (v7+). These are surfaced by js/tasks.js by concat'ing
 * TASKS with this list whenever `state.programMode === 'livehard-p1'`.
 *
 * The critical-task list is itself a small inner UI — the boolean here
 * is a coarse "I logged my list" flag. js/livehard.js / the Today tab
 * own the actual per-row inputs.
 *
 * Future phases (Phase 2/3/4) will append further constants here (e.g.
 * `LIVEHARD_P2_TASKS`).
 * @type {TaskDef[]}
 */
export const LIVEHARD_P1_TASKS = [
  {key:'handshake',label:'Handshake / Call',icon:'🤝',single:true},
  {key:'criticalTaskList',label:'Critical Task List',icon:'📋',single:true},
];
