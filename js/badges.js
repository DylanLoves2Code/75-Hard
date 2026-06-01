/**
 * @file Achievement badges — pure-computed view over the saved state.
 *
 * Each badge declaration is a `{id, title, description, unlockedWhen(state)
 * => boolean}` tuple. Badges are evaluated against the live state on every
 * `state:changed` rerender; the UI strip on the Today tab reflects the
 * current unlock list.
 *
 * Why a separate module: keeps the predicates testable in isolation, and
 * lets new badges be added without touching `main.js` / `tasks.js`.
 *
 * No DOM, no localStorage, no schema changes. Predicates only read from
 * the state object they're handed.
 */

import { TOTAL } from './constants.js';
import { isDayComplete, calcCurrentDay } from './state.js';

/**
 * @typedef {Object} Badge
 * @property {string} id           Stable identifier (used by the
 *                                 "celebrate once" sessionStorage key).
 * @property {string} title        Short uppercase title for the strip.
 * @property {string} description  One-line description shown on hover/tap.
 * @property {(s: import('./state.js').State) => boolean} unlockedWhen
 *                                 Pure predicate.
 */

/**
 * The current day index, clamped to `[1, TOTAL]`. The badge predicates
 * generally want "today's day" but we don't want to call `calcCurrentDay()`
 * inside every predicate — that re-reads state from localStorage which
 * would defeat the point of passing `s` in. Some predicates infer the
 * day index from the state's startDate via `calcCurrentDay()` directly;
 * fine because it cross-checks the same storage layer the renderer
 * already used.
 *
 * @returns {number}
 */
function today() {
  return calcCurrentDay();
}

/**
 * Total pages read across `s.books`. Pure summation; treats missing or
 * non-numeric `pages` fields as 0.
 *
 * @param {import('./state.js').State} s
 * @returns {number}
 */
export function totalPagesRead(s) {
  if (!s || !s.books) return 0;
  let n = 0;
  for (const k in s.books) {
    const b = s.books[k];
    if (!b) continue;
    const p = Number(b.pages);
    if (Number.isFinite(p) && p > 0) n += p;
  }
  return n;
}

/**
 * True when the state contains any 7-day window of consecutively-
 * complete days, anywhere within the first {@link TOTAL} days. Used by
 * the PERFECT_WEEK predicate.
 *
 * @param {import('./state.js').State} s
 * @returns {boolean}
 */
export function hasAnyPerfectWeek(s) {
  if (!s) return false;
  for (let start = 1; start + 6 <= TOTAL; start++) {
    let ok = true;
    for (let d = start; d < start + 7; d++) {
      if (!isDayComplete(s, d)) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Longest streak of consecutively-complete days anywhere in the state
 * (not necessarily ending today — that's `calcStreak()`). Used by the
 * DISCIPLINED and IRON_WILL predicates.
 *
 * @param {import('./state.js').State} s
 * @returns {number}
 */
export function longestStreak(s) {
  if (!s) return 0;
  let best = 0;
  let cur = 0;
  for (let d = 1; d <= TOTAL; d++) {
    if (isDayComplete(s, d)) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

/**
 * Count of complete days from day 1 through `upTo` inclusive. Pure
 * helper for FORGED.
 *
 * @param {import('./state.js').State} s
 * @param {number} upTo
 * @returns {number}
 */
function completeDaysUpTo(s, upTo) {
  let n = 0;
  for (let d = 1; d <= upTo; d++) if (isDayComplete(s, d)) n++;
  return n;
}

/**
 * Badge catalog. Order is the display order in the strip.
 * @type {Badge[]}
 */
export const BADGES = [
  {
    id: 'FIRST_WEEK',
    title: 'FIRST WEEK',
    description: '7 complete days in a row',
    unlockedWhen: (s) => {
      // Any 7-in-a-row window anywhere is enough. We don't require it to
      // be the *first* seven, just to celebrate the first time a 7-streak
      // ever occurred.
      if (!s) return false;
      let cur = 0;
      for (let d = 1; d <= TOTAL; d++) {
        if (isDayComplete(s, d)) {
          cur++;
          if (cur >= 7) return true;
        } else {
          cur = 0;
        }
      }
      return false;
    },
  },
  {
    id: 'FIRST_GALLON',
    title: 'FIRST GALLON',
    description: 'Hit your first full gallon of water',
    unlockedWhen: (s) => {
      if (!s || !s.days) return false;
      for (const k in s.days) {
        const dd = s.days[k];
        if (dd && dd.water === true) return true;
      }
      return false;
    },
  },
  {
    id: 'DISCIPLINED',
    title: 'DISCIPLINED',
    description: '10-day streak',
    unlockedWhen: (s) => longestStreak(s) >= 10,
  },
  {
    id: 'HALFWAY',
    title: 'HALFWAY',
    description: 'Reached Day 37/38 with at least one complete day',
    unlockedWhen: (s) => {
      if (!s) return false;
      const d = today();
      if (d < 37) return false;
      // At least one complete day so far.
      for (let i = 1; i <= d; i++) if (isDayComplete(s, i)) return true;
      return false;
    },
  },
  {
    id: 'SCHOLAR',
    title: 'SCHOLAR',
    description: '750 cumulative pages (75 × 10)',
    unlockedWhen: (s) => totalPagesRead(s) >= 750,
  },
  {
    id: 'IRON_WILL',
    title: 'IRON WILL',
    description: '30-day streak',
    unlockedWhen: (s) => longestStreak(s) >= 30,
  },
  {
    id: 'PERFECT_WEEK',
    title: 'PERFECT WEEK',
    description: 'Any 7-day window of all-complete days',
    unlockedWhen: hasAnyPerfectWeek,
  },
  {
    id: 'FORGED',
    title: 'FORGED',
    description: 'Day 75 reached with 70+ complete days',
    unlockedWhen: (s) => {
      if (!s) return false;
      if (today() < TOTAL) return false;
      // "Perfect or near-perfect" — generous: 70/75 or more.
      return completeDaysUpTo(s, TOTAL) >= 70;
    },
  },
];

/**
 * Evaluate every badge against `s` and return the unlocked ones in the
 * order declared in {@link BADGES}.
 *
 * @param {import('./state.js').State} s
 * @returns {Badge[]}
 */
export function getUnlockedBadges(s) {
  if (!s) return [];
  return BADGES.filter(b => {
    try { return !!b.unlockedWhen(s); }
    catch (_e) { return false; }
  });
}

/**
 * Inverse of {@link getUnlockedBadges} — the currently-locked badges in
 * declared order. Convenience for the UI strip.
 *
 * @param {import('./state.js').State} s
 * @returns {Badge[]}
 */
export function getLockedBadges(s) {
  const unlocked = new Set(getUnlockedBadges(s).map(b => b.id));
  return BADGES.filter(b => !unlocked.has(b.id));
}

/**
 * Compare two arrays of unlocked-badge IDs (most-recent vs. previous
 * render) and return the IDs that just unlocked. Used by the UI to fire
 * a one-time celebration animation per session.
 *
 * @param {string[]} prev
 * @param {string[]} next
 * @returns {string[]}
 */
export function newlyUnlocked(prev, next) {
  const had = new Set(prev || []);
  return (next || []).filter(id => !had.has(id));
}

/**
 * Optional helper used by the Today-tab strip. Reads + writes a
 * sessionStorage flag so we only ever play the celebration animation
 * the first time each badge unlocks in a session. Safe in environments
 * without `sessionStorage` (returns true unconditionally there).
 *
 * @param {string} id  Badge id.
 * @returns {boolean} `true` iff this is the first time we've seen it
 *                   unlock during the current session.
 */
export function consumeCelebrationFlag(id) {
  try {
    const key = '75hard_badge_seen_' + id;
    if (typeof sessionStorage === 'undefined') return true;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch (_e) {
    return true;
  }
}
