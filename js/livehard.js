/**
 * @file Live Hard 365-day continuation — Phase 1 MVP (item 48).
 *
 * "Live Hard" is Andy Frisella's follow-on program after 75 Hard. It runs in
 * multiple phases over the rest of the calendar year and layers more
 * discipline tasks on top of the original six. This module implements ONLY
 * Phase 1 (30 additional days) at MVP fidelity.
 *
 * # Scoped MVP (THIS wave)
 *   - After Day 75 with at least {@link LIVEHARD_QUALIFY_THRESHOLD} of the
 *     75 days complete, render a one-time banner inviting the user into
 *     Phase 1.
 *   - On opt-in: bump `state.programMode` from `'75hard'` to
 *     `'livehard-p1'`, reset `state.programDay` to 1, set
 *     `state.programTotal` to 30, stamp `state.programStartDate` to
 *     today, and {@link saveState}.
 *   - Phase 1 layers:
 *       * a daily handshake/call boolean (`day.handshake`)
 *       * a daily critical-task list (`day.criticalTasks: string[]`,
 *         `day.criticalTasksDone: boolean[]`) — UI surfaces 3 inputs;
 *         we store whatever the user enters (1..N).
 *       * 4 stretching sessions / week — surfaced as a soft weekly nudge,
 *         not gated by {@link isDayComplete}.
 *       * the original six 75 Hard rules carry over unchanged.
 *
 * # Explicitly scoped out — TODO for future waves
 *   - **Phase 2** (60 days): adds a 3-mile walk OR run task, plus the
 *     reading rule shifts to a non-fiction self-improvement book.
 *   - **Phase 3** (90 days): adds genuine compliment / no complaining
 *     tracking, an extra accountability call.
 *   - **Phase 4** (90+ days, "the rest of the year"): maintain everything.
 *   - **Full 365-day arc**: rolling a single state object across all four
 *     phases — currently we only model the 75->P1 hop. Subsequent hops
 *     will need analogous `livehard-p2`/`-p3`/`-p4` migrations and
 *     `isDayComplete` extensions.
 *   - **Phase transition gating**: real program says you must complete
 *     EVERY day of the previous phase to advance. We only check 50%+
 *     of 75 Hard at MVP — easing into it for users who broke streak
 *     once. Tighten before shipping Phase 2.
 *   - **Stretching weekly aggregate**: not yet tracked. Will need its
 *     own field (e.g. per-day `stretched:boolean`) + a weekly counter.
 *
 * No external dependencies, no new auth flows.
 */

import { getState, saveState, calcCurrentDay, isDayComplete, parseLocalDate, countCompleteDays } from './state.js';
import { emit } from './bus.js';
import { showToast } from './toast.js';

/**
 * Fraction of the 75 days that must be complete on Day 75 before we
 * offer Live Hard. 0.5 = "you did at least half". Real program requires
 * 100%, but this MVP eases the threshold so casual users see the
 * progression path (see scope note above).
 */
export const LIVEHARD_QUALIFY_THRESHOLD = 0.5;

/** Total days in Live Hard Phase 1. */
export const LIVEHARD_P1_TOTAL = 30;

/**
 * Whether the user is currently eligible to begin Live Hard Phase 1.
 * Returns true iff:
 *   - currently in '75hard' mode, AND
 *   - {@link calcCurrentDay} has reached 75, AND
 *   - completion rate is at or above {@link LIVEHARD_QUALIFY_THRESHOLD}.
 *
 * Note this does NOT check whether Day 75 itself is "done" — the banner
 * appears on the 75th day regardless of that day's six-task state, so
 * the user gets the opt-in invitation even if they're still finishing
 * Day 75's photo.
 *
 * @param {import('./state.js').State} s
 * @returns {boolean}
 */
export function shouldOfferLiveHard(s){
  if(!s)return false;
  if(s.programMode!=='75hard')return false;
  const day = calcCurrentDay();
  if(day<75)return false;
  const complete = countCompleteDays(s);
  return (complete/75) >= LIVEHARD_QUALIFY_THRESHOLD;
}

/**
 * Build a YYYY-MM-DD string for today in local time. Mirrors the format
 * used by `startDate`.
 * @returns {string}
 */
function todayIso(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}

/**
 * Opt-in transition from 75 Hard -> Live Hard Phase 1. Mutates state in
 * place, persists, and emits `state:changed`. No-op if the user is not
 * eligible (defends against double-clicks / stale UI).
 *
 * @returns {boolean} true if the transition happened.
 */
export function beginLiveHardPhase1(){
  const s = getState();
  if(!s) return false;
  if(!shouldOfferLiveHard(s)) return false;
  s.programMode = 'livehard-p1';
  s.programTotal = LIVEHARD_P1_TOTAL;
  s.programDay = 1;
  s.programStartDate = todayIso();
  saveState(s);
  showToast('Live Hard Phase 1 engaged — 30 days');
  emit('state:changed', s);
  return true;
}

/**
 * Current day index INSIDE the active program phase (1..programTotal).
 *
 * For '75hard' mode this equals {@link calcCurrentDay} (1..75) — the
 * original day arithmetic is unchanged. For 'livehard-p1' mode this is
 * computed from `programStartDate` and clamps to `[1, programTotal]`.
 *
 * @param {import('./state.js').State} s
 * @returns {number}
 */
export function calcProgramDay(s){
  if(!s) return 1;
  const total = s.programTotal || 75;
  if(s.programMode==='75hard'){
    return Math.max(1, Math.min(calcCurrentDay(), total));
  }
  const startIso = s.programStartDate || s.startDate;
  if(!startIso) return 1;
  const today = new Date(); today.setHours(0,0,0,0);
  const start = parseLocalDate(startIso);
  const diff = Math.floor((today - start)/86400000) + 1;
  return Math.max(1, Math.min(diff, total));
}

/**
 * Human-friendly label for the current program. Used by the banner +
 * Today-tab header.
 * @param {import('./state.js').State} s
 * @returns {string}
 */
export function programLabel(s){
  if(!s || s.programMode==='75hard') return '75 HARD';
  if(s.programMode==='livehard-p1') return 'LIVE HARD — PHASE 1';
  return 'LIVE HARD';
}

/**
 * Whether the current day in the active program is complete. Thin
 * wrapper over {@link isDayComplete} that uses the program-day rather
 * than the calendar-day index. In '75hard' mode they're equivalent.
 * @param {import('./state.js').State} s
 * @returns {boolean}
 */
export function isProgramDayComplete(s){
  if(!s) return false;
  if(s.programMode==='75hard'){
    return isDayComplete(s, calcCurrentDay());
  }
  // Live Hard phases key off the calendar day but use program-day for
  // display. The day record itself is still indexed by calendar day so
  // we look up by calcCurrentDay() — Live Hard re-uses the same
  // days[] map (1..75 originals plus new entries 76..104 for P1).
  return isDayComplete(s, calcCurrentDay());
}
