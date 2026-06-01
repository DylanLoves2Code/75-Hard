/**
 * @file Core state model + localStorage persistence + day arithmetic.
 *
 * The "state" is a single JSON object stored at `STORAGE_KEY` in
 * localStorage. Photos are NOT in this object — they live under
 * separate `photo_day_<n>` keys (see `js/constants.js`).
 *
 * State carries an internal `version` field. {@link getState} runs the
 * stored shape through {@link migrate} before returning so callers
 * always see the current schema. New schema versions are added by
 * extending the switch in {@link migrate} and bumping
 * {@link CURRENT_SCHEMA_VERSION}.
 */

import {
  TOTAL, STORAGE_KEY, photoKey,
  STORAGE_QUOTA_BYTES, STORAGE_WARN_THRESHOLD,
} from './constants.js';
import { showToast } from './toast.js';

/**
 * Per-day record. All fields are optional in storage; missing fields
 * are filled in by {@link getDayData} from `DAY_DEFAULTS`.
 *
 * @typedef {Object} DayData
 * @property {boolean} calorie         Legacy "Calorie deficit" field kept for back-compat;
 *                                     v3 introduces {@link DayData.dietAdherence} as the
 *                                     primary "Follow Diet" flag and migrations copy any
 *                                     existing value across to both.
 * @property {boolean} dietAdherence   "Follow Diet" task done (v3+). Either this or `calorie`
 *                                     satisfies {@link isDayComplete}'s diet slot.
 * @property {string}  [dietNote]      Optional free-text "what I ate" note for the day.
 * @property {boolean} w1              "Workout 1" task done.
 * @property {boolean} w2              "Workout 2" task done.
 * @property {boolean} w1outdoor       Whether Workout 1 was outdoors (v3+, defaults false).
 * @property {boolean} w2outdoor       Whether Workout 2 was outdoors (v3+, defaults false).
 * @property {boolean} read            "Read 10 pages" task done.
 * @property {boolean} water           "1 gallon water" task done (true when waterCups >= WATER_CUPS).
 * @property {boolean} photo           "Progress photo" task done.
 * @property {string}  w1label         Custom label for Workout 1.
 * @property {string}  w2label         Custom label for Workout 2.
 * @property {number}  waterCups       Number of 8 oz cups marked filled (0..WATER_CUPS).
 *                                     Older saved states predate this field and merge
 *                                     to 0 via DAY_DEFAULTS.
 */

/**
 * Full saved state — the JSON serialized to localStorage.
 *
 * @typedef {Object} State
 * @property {number} version                         Schema version. See {@link CURRENT_SCHEMA_VERSION}.
 * @property {string} startDate                       ISO "YYYY-MM-DD" start date.
 * @property {string} name                            Display name (uppercase).
 * @property {{name:string,customText:string}} [diet] Chosen diet (v3+). `name` is one of the
 *                                                    fixed options (Paleo/Keto/IIFYM/Whole30/
 *                                                    Carnivore/Vegan) or 'Custom'; when 'Custom',
 *                                                    `customText` carries the user's label.
 * @property {Object<string,DayData>} days            Map of day index (1..75) to DayData.
 * @property {Object<string,number>} drinks           Map of ISO week index (1-based) to drink count.
 * @property {Object<string,{title:string,pages:number,nonfiction:boolean}>} books   Daily book entries.
 *                                                    `nonfiction` is v3+ and defaults to true.
 * @property {Object<string,{weight:?number,sleep:?number}>} metrics  Daily weight/sleep metrics.
 * @property {Object<string,string>} notes            Daily field notes (free text).
 */

const DAY_DEFAULTS=Object.freeze({calorie:false,dietAdherence:false,dietNote:'',w1:false,w2:false,w1outdoor:false,w2outdoor:false,read:false,water:false,photo:false,w1label:'Workout 1',w2label:'Workout 2',waterCups:0});

/**
 * The schema version this build of the app writes. Bumped whenever the
 * shape of stored state changes; {@link migrate} handles upgrades.
 */
export const CURRENT_SCHEMA_VERSION = 3;

/**
 * Parse a "YYYY-MM-DD" string as a Date at LOCAL midnight (not UTC).
 *
 * `new Date("2025-01-15")` is parsed as UTC midnight per ECMAScript, so
 * in any negative-offset timezone it lands on the *previous* local day
 * — which broke day-arithmetic for users west of UTC. Always parse
 * `startDate` through this helper.
 *
 * @param {string} yyyymmdd  An ISO calendar date, e.g. "2025-01-15".
 * @returns {Date}           Local-midnight Date for that calendar day.
 */
export function parseLocalDate(yyyymmdd){
  const [y,m,d]=yyyymmdd.split('-').map(Number);
  return new Date(y,m-1,d);
}

/**
 * Ordered chain of step migrations. Each entry advances state from
 * one version to the next. New migrations are appended.
 *
 * To register `migration_3` (v2 -> v3): push
 * `{from:2,to:3,run:(s)=>{ ...mutate s in place...; s.version=3; }}`.
 *
 * @type {Array<{from:(number|undefined),to:number,run:(s:Object)=>void}>}
 */
const MIGRATIONS=[
  {
    from:undefined,to:2,
    run:(s)=>{
      // Pre-versioned shape. Stamp version + add any new fields with
      // safe defaults. (No new top-level fields needed at v2.)
      s.version=2;
    },
  },
  {
    from:1,to:2,
    run:(s)=>{
      // Same shape as undefined -> 2 (the original release never wrote
      // an explicit version: 1, but accept it for safety).
      s.version=2;
    },
  },
  {
    from:2,to:3,
    run:(s)=>{
      // v3: 75 Hard rule fidelity pass.
      //   - Adds top-level `s.diet` ({name, customText}) populated at
      //     setup. Pre-v3 users have no diet picked, so we seed a safe
      //     'Custom' / 'Unknown' default they can correct later.
      //   - Renames the per-day "calorie" slot to "dietAdherence". The
      //     legacy key is preserved alongside the new one so old grids
      //     keep rendering the historical check, and isDayComplete will
      //     accept either field.
      //   - Adds optional per-day `dietNote` (string, empty by default).
      //   - Adds per-day `w1outdoor` / `w2outdoor` booleans (false by
      //     default) used to surface the "one outdoor workout" caveat.
      //   - Adds `nonfiction:true` to every existing book entry so
      //     historical reads default to the rules-compliant variety.
      if(!s.diet){
        s.diet={name:'Custom',customText:'Unknown'};
      }
      if(s.days&&typeof s.days==='object'){
        for(const k in s.days){
          const dd=s.days[k];
          if(!dd||typeof dd!=='object')continue;
          // Copy the legacy `calorie` value into `dietAdherence` if the
          // new field is absent. Keep `calorie` itself so reads against
          // older code paths still show the historical tick.
          if(dd.dietAdherence===undefined){
            dd.dietAdherence=dd.calorie===true;
          }
          if(dd.dietNote===undefined)dd.dietNote='';
          if(dd.w1outdoor===undefined)dd.w1outdoor=false;
          if(dd.w2outdoor===undefined)dd.w2outdoor=false;
        }
      }
      if(s.books&&typeof s.books==='object'){
        for(const k in s.books){
          const b=s.books[k];
          if(!b||typeof b!=='object')continue;
          if(b.nonfiction===undefined)b.nonfiction=true;
        }
      }
      s.version=3;
    },
  },
];

/**
 * Upgrade a stored state object to {@link CURRENT_SCHEMA_VERSION} by
 * walking the {@link MIGRATIONS} chain. A state at version N walks
 * every step up to current.
 *
 * @param {Object} state  Raw state from localStorage (any prior shape).
 * @returns {{state: State, migrated: boolean}}  Upgraded state and
 *   whether any migration step ran (caller should persist if true).
 */
export function migrate(state){
  if(!state)return{state,migrated:false};
  let migrated=false;
  // Walk migrations until we reach CURRENT_SCHEMA_VERSION or run out.
  // Guarded with a step limit to defend against accidental cycles.
  for(let i=0;i<MIGRATIONS.length+1;i++){
    if(state.version===CURRENT_SCHEMA_VERSION)break;
    const step=MIGRATIONS.find(m=>m.from===state.version);
    if(!step){
      if(state.version!==undefined&&state.version>CURRENT_SCHEMA_VERSION){
        // Downgrade scenario — leave untouched.
        console.warn('[migrate] state.version=',state.version,'> current=',CURRENT_SCHEMA_VERSION);
      }
      break;
    }
    console.info('[migrate] state',step.from,'->',step.to);
    step.run(state);
    migrated=true;
  }
  return{state,migrated};
}

/**
 * Load the saved state from localStorage, running any pending
 * migrations. The migrated shape is persisted back if it changed.
 * @returns {?State} parsed state, or `null` if nothing has been saved yet.
 */
export function getState(){
  const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
  if(!raw)return null;
  const{state,migrated}=migrate(raw);
  if(migrated)saveState(state);
  return state;
}

/**
 * Persist `s` to localStorage as JSON. On quota exhaustion, surfaces a
 * toast warning and swallows the error (callers continue running with
 * stale-on-disk state rather than crashing).
 * @param {State} s
 * @returns {void}
 */
export function saveState(s){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify(s));
  }catch(err){
    if(isQuotaError(err)){
      showToast('Storage almost full. Export your data and reset older photos.');
    }else{
      throw err;
    }
  }
}

/**
 * Persist a photo's data URL at `photoKey(day)`. Separate from
 * {@link saveState} because photos are large and quota failures are
 * far more likely here. Behaviour on quota: same toast warning.
 * @param {number} day  Day index (1..TOTAL).
 * @param {string} dataUrl  Image data URL (typically downscaled JPEG).
 * @returns {boolean} `true` on success, `false` if quota was exhausted.
 */
export function savePhoto(day,dataUrl){
  try{
    localStorage.setItem(photoKey(day),dataUrl);
    return true;
  }catch(err){
    if(isQuotaError(err)){
      showToast('Storage almost full. Export your data and reset older photos.');
      return false;
    }
    throw err;
  }
}

/**
 * Whether an exception thrown by `localStorage.setItem` represents a
 * quota-exhaustion failure. Handles Safari's legacy DOMException name
 * (`QUOTA_EXCEEDED_ERR`, code 22) and modern Chrome/Firefox/Safari
 * (`QuotaExceededError`).
 * @param {unknown} err
 * @returns {boolean}
 */
function isQuotaError(err){
  if(!err)return false;
  if(err.name==='QuotaExceededError')return true;
  if(err.name==='NS_ERROR_DOM_QUOTA_REACHED')return true; // Firefox
  if(typeof err.code==='number'&&err.code===22)return true;
  return false;
}

/**
 * Rough total bytes used by the app in localStorage: the main state
 * JSON plus every existing photo blob. Used at boot to warn the user
 * before they hit the hard {@link STORAGE_QUOTA_BYTES} ceiling.
 * @returns {number} byte count (UTF-16 char length, not encoded size).
 */
export function getStorageUsageBytes(){
  const raw=localStorage.getItem(STORAGE_KEY);
  let total=raw?raw.length:0;
  for(let d=1;d<=TOTAL;d++){
    const p=localStorage.getItem(photoKey(d));
    if(p)total+=p.length;
  }
  return total;
}

/**
 * At boot, surface a soft toast if storage usage is above
 * {@link STORAGE_WARN_THRESHOLD} of {@link STORAGE_QUOTA_BYTES}.
 * @returns {void}
 */
export function checkStorageUsage(){
  const used=getStorageUsageBytes();
  const ratio=used/STORAGE_QUOTA_BYTES;
  if(ratio>=STORAGE_WARN_THRESHOLD){
    const pct=Math.round(ratio*100);
    showToast(`Storage at ${pct}% — consider exporting`);
  }
}

/**
 * Build a fresh empty state for a new challenge run.
 * @param {string} start  ISO "YYYY-MM-DD" start date.
 * @param {string} [name] Optional display name.
 * @param {{name:string,customText:string}} [diet] Optional diet selection.
 *   Defaults to `{name:'Custom',customText:''}` so {@link migrate} from
 *   pre-v3 states and the fresh setup path share the same shape.
 * @returns {State}
 */
export function defaultState(start,name,diet){
  return {
    version:CURRENT_SCHEMA_VERSION,
    startDate:start,
    name:name||'',
    diet:diet||{name:'Custom',customText:''},
    days:{},drinks:{},books:{},metrics:{},notes:{},
  };
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
 *
 * v3 renamed "calorie" to "dietAdherence". To stay back-compatible with
 * older day records (and with imported pre-v3 backups that have only the
 * legacy field), the diet slot is satisfied by either flag.
 * @param {State} s
 * @param {number} d
 * @returns {boolean}
 */
export function isDayComplete(s,d){
  const dd=getDayData(s,d);
  const diet=dd.dietAdherence||dd.calorie;
  return !!(diet&&dd.w1&&dd.w2&&dd.read&&dd.water&&dd.photo);
}

/**
 * Compute the current challenge day from the saved startDate.
 * Returns 1 if nothing is saved yet, and is clamped to `[1, TOTAL]`.
 * @returns {number} day index in `[1, TOTAL]`.
 */
export function calcCurrentDay(){
  const s=getState();if(!s)return 1;
  const today=new Date();today.setHours(0,0,0,0);
  const start=parseLocalDate(s.startDate);
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
  const start=parseLocalDate(s.startDate);
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
