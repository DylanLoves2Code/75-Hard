/**
 * @file Local browser notifications for the four daily check-ins
 * (morning workout, midday water, evening photo, end-of-day tasks).
 *
 * This is a foreground scheduler — we keep an in-memory `setTimeout`
 * per reminder and clear them on settings changes. There is no service
 * worker or background sync: when the tab closes, scheduled timeouts
 * die with it. The next-day schedule will be re-installed when the
 * user re-opens the page.
 *
 * The water-checkin reminder body is computed dynamically at fire time
 * so it reflects the user's current `waterCups` for the day.
 *
 * Permission flow:
 *   getSettings().notificationPermission tracks the last result of
 *   {@link requestPermission} ('default' | 'granted' | 'denied'). The
 *   settings panel uses it to enable/disable the REQUEST PERMISSION
 *   button and to surface a status indicator.
 *
 * Privacy: all reminders fire locally. No data leaves the device.
 */

import { WATER_CUPS } from './constants.js';
import { getSettings, saveSettings } from './settings.js';
import { getState, getDayData, calcCurrentDay } from './state.js';

/** Active timeouts indexed by reminder key. @type {Map<string, number>} */
const timers = new Map();

/** Default reminder times (24-hour HH:MM). */
export const DEFAULT_REMINDER_TIMES = Object.freeze({
  reminderMorningWorkout: '07:00',
  reminderWater:          '12:00',
  reminderPhoto:          '18:00',
  reminderTasksRemaining: '21:00',
});

/**
 * Whether the Notifications API is available in this environment.
 * Tests run in Node where `Notification` is undefined — this guard
 * lets the module import cleanly there.
 * @returns {boolean}
 */
export function isSupported(){
  return typeof globalThis !== 'undefined'
    && typeof globalThis.Notification !== 'undefined';
}

/**
 * Current permission state ('default' | 'granted' | 'denied'). Reads
 * from `Notification.permission` when supported; otherwise returns
 * 'default' to keep the UI inert.
 * @returns {'default'|'granted'|'denied'}
 */
export function getPermission(){
  if(!isSupported()) return 'default';
  return globalThis.Notification.permission || 'default';
}

/**
 * Prompt the user to grant the Notifications permission, then mirror
 * the result into `settings.notificationPermission`.
 *
 * Safe to call multiple times — if the user already granted/denied,
 * `Notification.requestPermission()` resolves immediately with the
 * cached value.
 *
 * @returns {Promise<'default'|'granted'|'denied'>}
 */
export async function requestPermission(){
  if(!isSupported()) return 'default';
  let result;
  try {
    result = await globalThis.Notification.requestPermission();
  } catch(err){
    // Some legacy browsers expose a callback-style API. We don't bother
    // shimming it — modern Chrome/Firefox/Safari all return a Promise.
    console.warn('[notifications] requestPermission failed:', err);
    result = getPermission();
  }
  saveSettings({ notificationPermission: result });
  return result;
}

/**
 * Fire a one-shot notification if the user has granted permission.
 * Silently no-ops otherwise (unsupported environment, denied, or
 * default-and-never-asked).
 *
 * @param {string} title  Notification title (short — shown bold).
 * @param {string} [body] Optional body text.
 * @returns {void}
 */
export function notify(title, body){
  if(!isSupported()) return;
  if(getPermission() !== 'granted') return;
  try {
    new globalThis.Notification(title, { body: body || '' });
  } catch(err){
    console.warn('[notifications] notify failed:', err);
  }
}

/**
 * Parse an "HH:MM" string into a `{h, m}` pair. Returns null when the
 * input doesn't match.
 * @param {string} str
 * @returns {?{h:number,m:number}}
 */
function parseHHMM(str){
  if(typeof str !== 'string') return null;
  const m = /^([0-2]?\d):([0-5]\d)$/.exec(str.trim());
  if(!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if(h < 0 || h > 23) return null;
  return { h, m: min };
}

/**
 * Build the four reminder entries from the current settings, in the
 * order they should fire across the day. Each entry carries:
 *   - key:   stable identifier ('morningWorkout' | 'water' | 'photo' | 'tasksRemaining')
 *   - hh:    24-hour hour (0..23)
 *   - mm:    minute (0..59)
 *   - title: notification title
 *   - body:  function returning the notification body at fire time
 *
 * @returns {Array<{key:string,hh:number,mm:number,title:string,body:()=>string}>}
 */
function buildReminderPlan(){
  const s = getSettings();
  const out = [];
  const push = (key, settingKey, title, body) => {
    const t = parseHHMM(s[settingKey] || DEFAULT_REMINDER_TIMES[settingKey]);
    if(!t) return;
    out.push({ key, hh: t.h, mm: t.m, title, body });
  };
  push('morningWorkout', 'reminderMorningWorkout', 'Workout 1',
    () => 'Time to move. Get the first workout in.');
  push('water', 'reminderWater', 'Hydration check',
    () => waterCheckinBody());
  push('photo', 'reminderPhoto', 'Progress photo',
    () => 'Lock in today\'s progress photo before the day slips away.');
  push('tasksRemaining', 'reminderTasksRemaining', 'Tasks remaining',
    () => tasksRemainingBody());
  return out;
}

/**
 * Compute the "you're at X oz / Y. Halfway there." body for the water
 * check-in reminder, based on today's current cup count.
 * @returns {string}
 */
function waterCheckinBody(){
  let oz = 0;
  let total = WATER_CUPS * 8;
  try {
    const s = getState();
    if(s){
      const day = calcCurrentDay();
      const dd = getDayData(s, day);
      oz = (dd.waterCups || 0) * 8;
    }
  } catch(_e){
    // No state yet (setup screen) — fall through to default 0 / 128.
  }
  const pct = oz / total;
  let tail = '';
  if(oz === 0)              tail = 'Haven\'t started yet.';
  else if(pct < 0.5)        tail = 'Keep going.';
  else if(pct < 1 && oz < total/2 + 8) tail = 'Halfway there.';
  else if(pct < 1)          tail = 'Almost there.';
  else                      tail = 'Gallon down. Nice.';
  return `You're at ${oz} oz / ${total}. ${tail}`;
}

/**
 * Build the "N tasks left" body for the end-of-day reminder.
 * @returns {string}
 */
function tasksRemainingBody(){
  try {
    const s = getState();
    if(!s) return 'Wrap up your tasks before midnight.';
    const day = calcCurrentDay();
    const dd = getDayData(s, day);
    const checks = [
      !!(dd.dietAdherence || dd.calorie),
      !!dd.w1, !!dd.w2, !!dd.read, !!dd.water, !!dd.photo,
    ];
    const left = checks.filter(x => !x).length;
    if(left === 0) return 'All six tasks done. Discipline.';
    return `${left} task${left===1?'':'s'} left. Finish before midnight.`;
  } catch(_e){
    return 'Wrap up your tasks before midnight.';
  }
}

/**
 * Cancel all scheduled reminder timeouts. Idempotent.
 * @returns {void}
 */
export function cancelScheduled(){
  for(const id of timers.values()) clearTimeout(id);
  timers.clear();
}

/**
 * Schedule the day's enabled reminders as in-memory `setTimeout`s.
 *
 * Notes / limitations (kept here so consumers don't have to chase the
 * caveats):
 *   - This is a *foreground* scheduler. Timeouts live in the page's
 *     JS heap; closing the tab cancels everything. The next-day
 *     schedule kicks in at the next boot — there is no service worker
 *     pushing notifications while the app is closed.
 *   - Reminders never schedule past today's local midnight. If a
 *     configured time has already passed today, that slot is skipped.
 *   - Repeated calls cancel any prior schedule before re-installing,
 *     so it's safe to call from a `settings:changed` handler.
 *
 * @returns {Array<{key:string,fireAt:Date}>}  Schedule that was installed
 *   (mostly useful for tests/debug — the page itself ignores the return).
 */
export function scheduleDailyReminders(){
  cancelScheduled();
  if(!isSupported()) return [];
  const s = getSettings();
  if(!s.enableReminders) return [];
  if(getPermission() !== 'granted') return [];

  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const installed = [];
  for(const r of buildReminderPlan()){
    const fire = new Date(now);
    fire.setHours(r.hh, r.mm, 0, 0);
    if(fire.getTime() <= now.getTime()) continue;     // already past
    if(fire.getTime() >= midnight.getTime()) continue; // crossed day
    const delay = fire.getTime() - now.getTime();
    const id = setTimeout(() => {
      timers.delete(r.key);
      let body = '';
      try { body = r.body(); } catch(_e){ body = ''; }
      notify(r.title, body);
    }, delay);
    timers.set(r.key, id);
    installed.push({ key: r.key, fireAt: fire });
  }
  return installed;
}

/**
 * Send a "test notification" — used by the settings panel to confirm
 * the permission grant actually works.
 * @returns {void}
 */
export function testNotification(){
  notify('75 Hard reminder', 'Notifications are working. Stay disciplined.');
}

// Internal helpers exported for tests only.
export const _internal = { parseHHMM, buildReminderPlan, waterCheckinBody, tasksRemainingBody };
