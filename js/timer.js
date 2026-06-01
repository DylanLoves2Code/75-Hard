/**
 * @file Tiny duration-formatting helpers shared by the workout-timer
 * button in {@link module:js/tasks} and any future timing display.
 *
 * No DOM, no state — these are pure functions so they're easy to test
 * and cheap to import everywhere.
 */

/**
 * Format a non-negative number of seconds as `MM:SS` (or `H:MM:SS`
 * once the elapsed time crosses an hour).
 *
 * Examples:
 *   formatDuration(0)     -> "00:00"
 *   formatDuration(75)    -> "01:15"
 *   formatDuration(3725)  -> "1:02:05"
 *
 * @param {number} seconds  Elapsed seconds. NaN / negative coerce to 0.
 * @returns {string}        Human-readable elapsed string.
 */
export function formatDuration(seconds){
  let s = Math.floor(Number(seconds) || 0);
  if(s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  if(h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}
