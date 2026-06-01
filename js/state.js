/**
 * @file Core state model + localStorage persistence + day arithmetic.
 *
 * The "state" is a single JSON object stored at `STORAGE_KEY` in
 * localStorage. Photos are NOT in this object — they live under
 * separate `photo_day_<n>` keys (see `js/constants.js`).
 */

import { TOTAL, STORAGE_KEY } from './constants.js';

/**
 * Per-day record. All fields are optional in storage; missing fields
 * are filled in by {@link getDayData} from `DAY_DEFAULTS`.
 *
 * @typedef {Object} DayData
 * @property {boolean} calorie    "Calorie deficit" task done.
 * @property {boolean} w1         "Workout 1" task done.
 * @property {boolean} w2         "Workout 2" task done.
 * @property {boolean} read       "Read 10 pages" task done.
 * @property {boolean} water      "1 gallon water" task done (true when waterCups >= WATER_CUPS).
 * @property {boolean} photo      "Progress photo" task done.
 * @property {string}  w1label    Custom label for Workout 1.
 * @property {string}  w2label    Custom label for Workout 2.
 * @property {number}  waterCups  Number of 8 oz cups marked filled (0..WATER_CUPS).
 *                                Older saved states predate this field and merge
 *                                to 0 via DAY_DEFAULTS.
 */

/**
 * Full saved state — the JSON serialized to localStorage.
 *
 * @typedef {Object} State
 * @property {string} startDate                       ISO "YYYY-MM-DD" start date.
 * @property {string} name                            Display name (uppercase).
 * @property {Object<string,DayData>} days            Map of day index (1..75) to DayData.
 * @property {Object<string,number>} drinks           Map of ISO week index (1-based) to drink count.
 * @property {Object<string,{title:string,pages:number}>} books   Daily book entries.
 * @property {Object<string,{weight:?number,sleep:?number}>} metrics  Daily weight/sleep metrics.
 * @property {Object<string,string>} notes            Daily field notes (free text).
 */

const DAY_DEFAULTS=Object.freeze({calorie:false,w1:false,w2:false,read:false,water:false,photo:false,w1label:'Workout 1',w2label:'Workout 2',waterCups:0});

/**
 * Load the saved state from localStorage.
 * @returns {?State} parsed state, or `null` if nothing has been saved yet.
 */
export function getState(){return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}

/**
 * Persist `s` to localStorage as JSON.
 * @param {State} s
 * @returns {void}
 */
export function saveState(s){localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}

/**
 * Build a fresh empty state for a new challenge run.
 * @param {string} start  ISO "YYYY-MM-DD" start date.
 * @param {string} [name] Optional display name.
 * @returns {State}
 */
export function defaultState(start,name){
  return {startDate:start,name:name||'',days:{},drinks:{},books:{},metrics:{},notes:{}};
}

/**
 * Read a day's record merged with defaults (so callers always see a
 * fully populated DayData, including back-compat for `waterCups`).
 * @param {State} s
 * @param {number} d  Day index (1..75).
 * @returns {DayData}
 */
export function getDayData(s,d){
  return s.days[d]?{...DAY_DEFAULTS,...s.days[d]}:{...DAY_DEFAULTS};
}

/**
 * Patch a day's record in place (additive — unspecified fields are kept).
 * @param {State} s
 * @param {number} d  Day index.
 * @param {Partial<DayData>} patch  Fields to update.
 * @returns {DayData} the updated record.
 */
export function updateDayData(s,d,patch){
  s.days[d]={...getDayData(s,d),...patch};
  return s.days[d];
}

/**
 * True iff all six core tasks for day `d` are marked done.
 * @param {State} s
 * @param {number} d
 * @returns {boolean}
 */
export function isDayComplete(s,d){
  const dd=getDayData(s,d);
  return dd.calorie&&dd.w1&&dd.w2&&dd.read&&dd.water&&dd.photo;
}

/**
 * Compute the current challenge day from the saved startDate.
 * Returns 1 if nothing is saved yet, and is clamped to `[1, TOTAL]`.
 * @returns {number} day index in `[1, TOTAL]`.
 */
export function calcCurrentDay(){
  const s=getState();if(!s)return 1;
  const today=new Date();today.setHours(0,0,0,0);
  const start=new Date(s.startDate);start.setHours(0,0,0,0);
  const diff=Math.floor((today-start)/86400000)+1;
  return Math.max(1,Math.min(diff,TOTAL));
}

/**
 * Current week of the challenge, computed from {@link calcCurrentDay}.
 * @returns {number} `ceil(currentDay / 7)`.
 */
export function calcCurrentWeek(){return Math.ceil(calcCurrentDay()/7);}

/**
 * Convert a day index to a JS Date representing that calendar day.
 * Requires saved state (uses startDate from localStorage).
 * @param {number} d  Day index (1..75).
 * @returns {Date}
 */
export function getDateForDay(d){
  const s=getState();
  const start=new Date(s.startDate);start.setHours(0,0,0,0);
  const date=new Date(start);date.setDate(date.getDate()+d-1);
  return date;
}

/**
 * Locale-formatted human date label, e.g. "Wed, Jan 15, 2025".
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date){return date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});}

/**
 * Length of the consecutive-complete-days streak ending at today
 * (inclusive). Walks backwards from `calcCurrentDay()` and stops at
 * the first incomplete day.
 * @param {State} s
 * @returns {number}
 */
export function calcStreak(s){
  let streak=0;const today=calcCurrentDay();
  for(let d=today;d>=1;d--){if(isDayComplete(s,d))streak++;else break;}
  return streak;
}

/**
 * Total number of complete days from day 1 up to (and including) today.
 * Future days are not counted.
 * @param {State} s
 * @returns {number}
 */
export function countCompleteDays(s){
  let n=0;const today=calcCurrentDay();
  for(let d=1;d<=today;d++){if(isDayComplete(s,d))n++;}
  return n;
}
