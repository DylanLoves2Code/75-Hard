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
 * @property {Object}  [measurements]  v4+ optional body measurements (in inches). Any of
 *                                     `waist`, `chest`, `hips`, `arms`, `thighs`, `neck`
 *                                     may be set when the user logged that metric. Missing
 *                                     fields mean "not entered for this day".
 * @property {{mood:?number,energy:?number,discipline:?number}} [wellbeing]
 *                                     v4+ 1-5 self-ratings. `null` means "not entered".
 * @property {string}  [w1type]        v4+ workout-1 type (e.g. "Lift", "Run"). Empty = unset.
 * @property {string}  [w1location]    v4+ workout-1 location (e.g. "Gym", "Outdoor"). Empty = unset.
 *                                     When set to 'Outdoor', also implies `w1outdoor:true`.
 * @property {string}  [w2type]        v4+ workout-2 type. Empty = unset.
 * @property {string}  [w2location]    v4+ workout-2 location. Empty = unset.
 * @property {?string} [failureReason] v4+ user-entered reason for an incomplete day, captured
 *                                     by the morning failure-log prompt. `null` = never asked,
 *                                     `''` = asked + skipped, non-empty string = logged.
 * @property {number}  [w1duration]    v5+ Workout 1 timed duration in seconds. 0 = never timed.
 *                                     Persisted by the inline stopwatch on the Today tab;
 *                                     independent of the `w1` "done" toggle.
 * @property {number}  [w2duration]    v5+ Workout 2 timed duration in seconds. 0 = never timed.
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
 * @property {Object<string,{title:string,pages:number,nonfiction:boolean,quotes:Array<{text:string,page?:number}>,audiobookMinutes:number}>} books
 *                                                    Daily book entries.
 *                                                    `nonfiction` is v3+ and defaults to true.
 *                                                    `quotes` is v6+ (highlights & quotes vault).
 *                                                    `audiobookMinutes` is v6+ (audiobook supplement,
 *                                                    not counted toward the 10-page rule).
 * @property {Object<string,{weight:?number,sleep:?number}>} metrics  Daily weight/sleep metrics.
 * @property {Object<string,string>} notes            Daily field notes (free text).
 * @property {'75hard'|'livehard-p1'} [programMode]   v7+ which program the user is currently
 *                                                    running. Defaults to '75hard'. After the
 *                                                    user opts in to Live Hard Phase 1 on
 *                                                    completion of Day 75, this flips to
 *                                                    'livehard-p1'. Future phases will use
 *                                                    'livehard-p2', 'livehard-p3', etc.
 * @property {number} [programDay]                    v7+ 1-based day index WITHIN the current
 *                                                    program. For 75hard this is always equal to
 *                                                    {@link calcCurrentDay}. For livehard-p1 this
 *                                                    resets to 1 when the user opts in and
 *                                                    advances 1..30.
 * @property {number} [programTotal]                  v7+ total length of the current program.
 *                                                    75 for '75hard', 30 for 'livehard-p1', etc.
 * @property {string} [programStartDate]              v7+ ISO start date of the current program
 *                                                    phase (used to compute programDay from
 *                                                    wall-clock). For '75hard' this is the
 *                                                    original `startDate`; for 'livehard-p1' this
 *                                                    is the date the user opted in.
 */

const DAY_DEFAULTS=Object.freeze({
  calorie:false,dietAdherence:false,dietNote:'',
  w1:false,w2:false,w1outdoor:false,w2outdoor:false,
  read:false,water:false,photo:false,
  w1label:'Workout 1',w2label:'Workout 2',waterCups:0,
  // v4+ deeper-tracking fields. Defaults are intentionally "empty"
  // representations (not null) so the UI never blows up on read.
  measurements:Object.freeze({}),
  wellbeing:Object.freeze({mood:null,energy:null,discipline:null}),
  w1type:'',w1location:'',w2type:'',w2location:'',
  failureReason:null,
  // v5+ workout-timer durations (seconds). 0 = never timed.
  w1duration:0,w2duration:0,
  // v7+ Live Hard fields. The original six tasks continue to gate
  // {@link isDayComplete} for '75hard'; in 'livehard-p1' the handshake
  // boolean + the criticalTasksDone[] are also required (see
  // isDayComplete). These default to "not done" so a pre-livehard day
  // record always reads as incomplete on those extra slots.
  handshake:false,
  criticalTasks:Object.freeze([]),
  criticalTasksDone:Object.freeze([]),
});

/**
 * The schema version this build of the app writes. Bumped whenever the
 * shape of stored state changes; {@link migrate} handles upgrades.
 */
export const CURRENT_SCHEMA_VERSION = 7;

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
  {
    from:3,to:4,
    run:(s)=>{
      // v4: deeper tracking pass.
      //   - Adds per-day `measurements` ({waist,chest,hips,arms,thighs,neck})
      //     stored only for fields the user actually entered. Defaults to {}.
      //   - Adds per-day `wellbeing` ({mood,energy,discipline}), each 1-5 or
      //     null. All null means "not logged".
      //   - Adds per-day workout type/location strings:
      //     `w1type`, `w1location`, `w2type`, `w2location`. Empty string
      //     means "not chosen yet". `location === 'Outdoor'` implies the
      //     existing v3 `w?outdoor` flag.
      //   - Adds per-day `failureReason` (string|null). `null` = the user
      //     was never asked yet for that day; `''` = asked + skipped;
      //     non-empty = logged. Lets the boot-time prompt remember its
      //     "don't ask twice" state.
      if(s.days&&typeof s.days==='object'){
        for(const k in s.days){
          const dd=s.days[k];
          if(!dd||typeof dd!=='object')continue;
          if(dd.measurements===undefined)dd.measurements={};
          if(dd.wellbeing===undefined)dd.wellbeing={mood:null,energy:null,discipline:null};
          if(dd.w1type===undefined)dd.w1type='';
          if(dd.w1location===undefined)dd.w1location='';
          if(dd.w2type===undefined)dd.w2type='';
          if(dd.w2location===undefined)dd.w2location='';
          if(dd.failureReason===undefined)dd.failureReason=null;
        }
      }
      s.version=4;
    },
  },
  {
    from:4,to:5,
    run:(s)=>{
      // v5: workout-timer durations.
      //   - Adds per-day `w1duration` and `w2duration` (seconds). 0 = never
      //     timed. The stopwatch lives on the Today tab next to each
      //     customLabel workout row; the timer's running state is in-memory
      //     only, but the elapsed total is persisted here when the user
      //     stops the clock.
      if(s.days&&typeof s.days==='object'){
        for(const k in s.days){
          const dd=s.days[k];
          if(!dd||typeof dd!=='object')continue;
          if(dd.w1duration===undefined)dd.w1duration=0;
          if(dd.w2duration===undefined)dd.w2duration=0;
        }
      }
      s.version=5;
    },
  },
  {
    from:5,to:6,
    run:(s)=>{
      // v6: reading-depth fields on each book entry.
      //   - Adds `quotes:Array<{text,page?}>` (default []) for the
      //     highlights & quotes vault. Pre-v6 entries have no quotes.
      //   - Adds `audiobookMinutes:number` (default 0) so the user can
      //     log audio supplemental listening. Independent of the
      //     page-count rule — pages still drive `read` completion.
      if(s.books&&typeof s.books==='object'){
        for(const k in s.books){
          const b=s.books[k];
          if(!b||typeof b!=='object')continue;
          if(b.quotes===undefined)b.quotes=[];
          if(b.audiobookMinutes===undefined)b.audiobookMinutes=0;
        }
      }
      s.version=6;
    },
  },
  {
    from:6,to:7,
    run:(s)=>{
      // v7: Live Hard 365-day continuation MVP.
      //   - Adds top-level `programMode` ('75hard'|'livehard-p1'),
      //     `programDay` (1..programTotal), `programTotal` (75|30|...),
      //     and `programStartDate` (ISO date). All default to keeping
      //     existing users on the original 75 Hard track with no
      //     behavior change. The Live Hard banner is only offered after
      //     Day 75 hits the 50%+ completion threshold — see
      //     js/livehard.js for the gating logic.
      //   - Adds per-day `handshake:false`, `criticalTasks:[]`, and
      //     `criticalTasksDone:[]`. These fields are inert in '75hard'
      //     mode (isDayComplete ignores them) and become required in
      //     'livehard-p1'.
      if(s.programMode===undefined)s.programMode='75hard';
      if(s.programTotal===undefined)s.programTotal=75;
      if(s.programStartDate===undefined)s.programStartDate=s.startDate;
      // programDay is computed lazily by calcProgramDay; we don't need
      // to persist a stale value at migration time. Stamp it for forward
      // compatibility — recomputed every render.
      if(s.programDay===undefined)s.programDay=1;
      if(s.days&&typeof s.days==='object'){
        for(const k in s.days){
          const dd=s.days[k];
          if(!dd||typeof dd!=='object')continue;
          if(dd.handshake===undefined)dd.handshake=false;
          if(!Array.isArray(dd.criticalTasks))dd.criticalTasks=[];
          if(!Array.isArray(dd.criticalTasksDone))dd.criticalTasksDone=[];
        }
      }
      s.version=7;
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
    // v7+ Live Hard continuation. New users start on the original 75
    // Hard track; the Live Hard banner appears on Day 75 if the user
    // qualifies — see js/livehard.js.
    programMode:'75hard',
    programDay:1,
    programTotal:75,
    programStartDate:start,
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
 * True iff every required task for day `d` is marked done.
 *
 * v3 renamed "calorie" to "dietAdherence". To stay back-compatible with
 * older day records (and with imported pre-v3 backups that have only the
 * legacy field), the diet slot is satisfied by either flag.
 *
 * v7 adds programMode awareness. In '75hard' mode (the default for all
 * existing users), only the original six tasks are required. In
 * 'livehard-p1' the day also requires:
 *   - `handshake === true` (logged a handshake/call with someone), and
 *   - at least one critical task defined and every defined one done.
 *
 * Live Hard adds a "4 stretching sessions per week" rule. That is a
 * weekly aggregate, not a daily slot, so it's intentionally NOT in
 * isDayComplete — surfaced separately by the UI as a weekly nudge.
 * @param {State} s
 * @param {number} d
 * @returns {boolean}
 */
export function isDayComplete(s,d){
  const dd=getDayData(s,d);
  const diet=dd.dietAdherence||dd.calorie;
  const core=!!(diet&&dd.w1&&dd.w2&&dd.read&&dd.water&&dd.photo);
  if(!core)return false;
  // Live Hard Phase 1 adds two more required slots.
  if(s&&s.programMode==='livehard-p1'){
    if(!dd.handshake)return false;
    const list=Array.isArray(dd.criticalTasks)?dd.criticalTasks:[];
    const done=Array.isArray(dd.criticalTasksDone)?dd.criticalTasksDone:[];
    // Must have defined at least one critical task and finished every
    // one that was defined.
    const defined=list.filter(t=>typeof t==='string'&&t.trim().length>0);
    if(defined.length===0)return false;
    for(let i=0;i<list.length;i++){
      if(typeof list[i]==='string'&&list[i].trim().length>0){
        if(!done[i])return false;
      }
    }
  }
  return true;
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
