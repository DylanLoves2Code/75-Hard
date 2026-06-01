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
 * @type {TaskDef[]}
 */
export const TASKS = [
  {key:'calorie',label:'Calorie Deficit',icon:'🔥',single:true},
  {key:'w1',label:'Workout 1',icon:'💪',single:true,customLabel:true},
  {key:'w2',label:'Workout 2',icon:'🏋️',single:true,customLabel:true},
  {key:'read',label:'Read 10 Pages',icon:'📖',single:true},
  {key:'water',label:'1 Gallon Water',icon:'💧',single:true},
  {key:'photo',label:'Progress Photo',icon:'📸',single:false},
];
