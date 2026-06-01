/**
 * @file iCalendar (.ics) export for the two daily workouts.
 *
 * Produces an RFC 5545-compliant calendar with two events per day for
 * the full 75-day challenge (150 events total) so users can import the
 * schedule into Apple Calendar / Google Calendar / Outlook.
 *
 * The generator is pure (no DOM, no localStorage) — `buildIcs(state, opts)`
 * takes a state object and returns a string. The Export tab wires the
 * download in {@link module:js/export}.
 *
 * Implementation notes:
 *   - Events use *local floating time* (no `TZID`, no `Z`). 75 Hard
 *     workouts are clock-time anchors per the user's locale; we don't
 *     try to attach a VTIMEZONE block.
 *   - Lines are folded at 75 octets per RFC 5545 §3.1 (continuation
 *     lines start with a single SP) and joined with CRLF.
 *   - UIDs are deterministic so re-importing replaces existing events
 *     rather than creating duplicates: `75hard-<startDate>-d<N>-w<1|2>@local`.
 *   - `TEXT` field values escape `\`, `;`, `,`, and newlines per §3.3.11.
 */

import { TOTAL } from './constants.js';
import { parseLocalDate } from './state.js';

/** Default workout times when settings don't specify. */
const DEFAULT_WORKOUT_TIMES = Object.freeze({
  icsWorkout1Time: '06:00',
  icsWorkout2Time: '17:00',
});

const WORKOUT_DURATION_MIN = 45;

/**
 * Parse "HH:MM" into `{h,m}` or null on invalid input.
 * @param {string} s
 * @returns {?{h:number,m:number}}
 */
function parseHHMM(s){
  if(typeof s !== 'string') return null;
  const m = /^([0-2]?\d):([0-5]\d)$/.exec(s.trim());
  if(!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if(h < 0 || h > 23) return null;
  return { h, m: min };
}

/**
 * Escape an ICS TEXT field value per RFC 5545 §3.3.11.
 * @param {string} v
 * @returns {string}
 */
function escapeText(v){
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Render a Date as a *floating* local date-time per the DATE-TIME basic
 * format: `YYYYMMDDTHHMMSS` (no `Z`, no offset).
 * @param {Date} d
 * @returns {string}
 */
function formatLocal(d){
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}` +
         `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Render a Date as a UTC date-time (`YYYYMMDDTHHMMSSZ`) for DTSTAMP.
 * @param {Date} d
 * @returns {string}
 */
function formatUtc(d){
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Fold a single content line to 75 octets per RFC 5545 §3.1. Returns
 * an array of physical lines — caller joins with CRLF.
 *
 * We fold by byte length (UTF-8) rather than character length since
 * the spec is octet-counted, but for the ASCII summaries this app
 * produces those values are identical.
 *
 * @param {string} line
 * @returns {string[]}
 */
function foldLine(line){
  const MAX = 75;
  const bytes = new TextEncoder().encode(line);
  if(bytes.length <= MAX) return [line];
  const out = [];
  let i = 0;
  // First physical line: up to 75 octets.
  // Continuation lines: leading SP + up to 74 octets.
  let cap = MAX;
  while(i < bytes.length){
    let end = Math.min(i + cap, bytes.length);
    // Avoid splitting in the middle of a UTF-8 continuation byte.
    while(end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
    const chunk = new TextDecoder().decode(bytes.subarray(i, end));
    out.push(out.length === 0 ? chunk : ' ' + chunk);
    i = end;
    cap = MAX - 1; // continuation lines reserve one octet for the leading SP
  }
  return out;
}

/**
 * Build the multi-line ICS body. Returns a single string with CRLF
 * line endings, ready to be served as `text/calendar`.
 *
 * @param {import('./state.js').State} state  Saved state with `startDate`.
 * @param {Object} [opts]
 * @param {string} [opts.workout1Time='06:00']  HH:MM 24-hour start for Workout 1.
 * @param {string} [opts.workout2Time='17:00']  HH:MM 24-hour start for Workout 2.
 * @param {Date}   [opts.now]                   Override for "now" — tests only.
 * @returns {string}  Multi-line ICS document (CRLF-joined).
 */
export function buildIcs(state, opts){
  if(!state || typeof state.startDate !== 'string'){
    throw new Error('buildIcs: state.startDate is required');
  }
  const o = opts || {};
  const w1 = parseHHMM(o.workout1Time) || parseHHMM(DEFAULT_WORKOUT_TIMES.icsWorkout1Time);
  const w2 = parseHHMM(o.workout2Time) || parseHHMM(DEFAULT_WORKOUT_TIMES.icsWorkout2Time);
  const start = parseLocalDate(state.startDate);
  const dtstamp = formatUtc(o.now instanceof Date ? o.now : new Date());

  const lines = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//75 Hard Tracker//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');

  const desc = escapeText('Daily 75 Hard workout. One of the two must be outdoors.');

  for(let d = 1; d <= TOTAL; d++){
    const day = new Date(start);
    day.setDate(day.getDate() + d - 1);

    for(const slot of [
      { n: 1, h: w1.h, m: w1.m, label: 'Workout 1' },
      { n: 2, h: w2.h, m: w2.m, label: 'Workout 2' },
    ]){
      const begin = new Date(day);
      begin.setHours(slot.h, slot.m, 0, 0);
      const end = new Date(begin);
      end.setMinutes(end.getMinutes() + WORKOUT_DURATION_MIN);

      const uid = `75hard-${state.startDate}-d${d}-w${slot.n}@local`;
      const summary = escapeText(`75 Hard — ${slot.label}`);

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART:${formatLocal(begin)}`);
      lines.push(`DTEND:${formatLocal(end)}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(`DESCRIPTION:${desc}`);
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');

  // Fold every content line to 75 octets, then join with CRLF.
  const folded = [];
  for(const l of lines){
    for(const piece of foldLine(l)) folded.push(piece);
  }
  // RFC 5545: a final CRLF after END:VCALENDAR is allowed; many parsers
  // are pickier without it. We end the file with a trailing CRLF.
  return folded.join('\r\n') + '\r\n';
}

// Test-only exports.
export const _internal = { parseHHMM, escapeText, formatLocal, formatUtc, foldLine };
