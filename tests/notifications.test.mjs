// Unit tests for js/notifications.js — covers the exported surface
// (requestPermission, scheduleDailyReminders, cancelScheduled, notify)
// and internal helpers (parseHHMM, water/tasks-remaining body builders).
//
// Run with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';

// --- localStorage + DOM polyfill -------------------------------------------
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => { memStore.set(k, String(v)); },
  removeItem: (k) => { memStore.delete(k); },
  clear: () => { memStore.clear(); },
};
globalThis.document = {
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
};

// --- Notification stub -----------------------------------------------------
// The notifications module guards on `typeof Notification !== 'undefined'`,
// so we install a fake constructor that records every call.
let notifPermission = 'default';
let lastNotification = null;
class FakeNotification {
  constructor(title, opts){
    lastNotification = { title, body: (opts && opts.body) || '' };
  }
  static get permission(){ return notifPermission; }
  static async requestPermission(){ return notifPermission; }
}
globalThis.Notification = FakeNotification;

const notifications = await import('../js/notifications.js');
const {
  isSupported, getPermission, requestPermission, notify, testNotification,
  cancelScheduled, scheduleDailyReminders, DEFAULT_REMINDER_TIMES, _internal,
} = notifications;
const { parseHHMM, waterCheckinBody, tasksRemainingBody, buildReminderPlan } = _internal;
const { SETTINGS_KEY, STORAGE_KEY } = await import('../js/constants.js');

// --- exported surface ------------------------------------------------------

test('module exports the documented surface', () => {
  for(const name of ['requestPermission','scheduleDailyReminders','cancelScheduled','notify','testNotification','getPermission','isSupported']){
    assert.equal(typeof notifications[name], 'function', name + ' is a function');
  }
  assert.equal(typeof DEFAULT_REMINDER_TIMES, 'object');
});

test('DEFAULT_REMINDER_TIMES matches the spec', () => {
  assert.equal(DEFAULT_REMINDER_TIMES.reminderMorningWorkout, '07:00');
  assert.equal(DEFAULT_REMINDER_TIMES.reminderWater,          '12:00');
  assert.equal(DEFAULT_REMINDER_TIMES.reminderPhoto,          '18:00');
  assert.equal(DEFAULT_REMINDER_TIMES.reminderTasksRemaining, '21:00');
});

// --- support / permission --------------------------------------------------

test('isSupported is true when Notification is defined', () => {
  assert.equal(isSupported(), true);
});

test('getPermission reflects Notification.permission', () => {
  notifPermission = 'default';
  assert.equal(getPermission(), 'default');
  notifPermission = 'granted';
  assert.equal(getPermission(), 'granted');
  notifPermission = 'denied';
  assert.equal(getPermission(), 'denied');
});

test('requestPermission persists the result into settings', async () => {
  memStore.clear();
  notifPermission = 'granted';
  const result = await requestPermission();
  assert.equal(result, 'granted');
  const saved = JSON.parse(memStore.get(SETTINGS_KEY));
  assert.equal(saved.notificationPermission, 'granted');
});

// --- notify ----------------------------------------------------------------

test('notify is a no-op when permission != granted', () => {
  notifPermission = 'denied';
  lastNotification = null;
  notify('hello', 'body');
  assert.equal(lastNotification, null);
});

test('notify fires when permission is granted', () => {
  notifPermission = 'granted';
  lastNotification = null;
  notify('hello', 'body');
  assert.deepEqual(lastNotification, { title: 'hello', body: 'body' });
});

test('testNotification calls through to notify with a fixed title', () => {
  notifPermission = 'granted';
  lastNotification = null;
  testNotification();
  assert.ok(lastNotification);
  assert.match(lastNotification.title, /75 Hard/);
});

// --- parseHHMM -------------------------------------------------------------

test('parseHHMM accepts valid 24-hour strings', () => {
  assert.deepEqual(parseHHMM('00:00'), { h: 0, m: 0 });
  assert.deepEqual(parseHHMM('07:00'), { h: 7, m: 0 });
  assert.deepEqual(parseHHMM('23:59'), { h: 23, m: 59 });
});

test('parseHHMM rejects bad input', () => {
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('07:60'), null);
  assert.equal(parseHHMM('xx'), null);
  assert.equal(parseHHMM(null), null);
});

// --- buildReminderPlan -----------------------------------------------------

test('buildReminderPlan returns the four reminders with defaults', () => {
  memStore.clear();
  const plan = buildReminderPlan();
  assert.equal(plan.length, 4);
  assert.deepEqual(plan.map(p => p.key), ['morningWorkout','water','photo','tasksRemaining']);
  // First reminder uses the 07:00 default.
  assert.equal(plan[0].hh, 7);
  assert.equal(plan[0].mm, 0);
});

test('buildReminderPlan honors saved settings', () => {
  memStore.clear();
  memStore.set(SETTINGS_KEY, JSON.stringify({
    reminderMorningWorkout: '05:15',
    reminderWater:          '11:45',
    reminderPhoto:          '19:30',
    reminderTasksRemaining: '22:00',
  }));
  const plan = buildReminderPlan();
  assert.equal(plan[0].hh, 5);  assert.equal(plan[0].mm, 15);
  assert.equal(plan[1].hh, 11); assert.equal(plan[1].mm, 45);
  assert.equal(plan[2].hh, 19); assert.equal(plan[2].mm, 30);
  assert.equal(plan[3].hh, 22); assert.equal(plan[3].mm, 0);
});

// --- waterCheckinBody ------------------------------------------------------

test('waterCheckinBody reports 0 oz when there is no state', () => {
  memStore.clear();
  const body = waterCheckinBody();
  assert.match(body, /0 oz \/ 128/);
});

test('waterCheckinBody computes today\'s progress from state', () => {
  // Day 1 is "today" when startDate is today.
  memStore.clear();
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,'0');
  const d = String(today.getDate()).padStart(2,'0');
  const startDate = `${y}-${m}-${d}`;
  memStore.set(STORAGE_KEY, JSON.stringify({
    version: 5,
    startDate, name: 'X',
    diet: { name: 'Custom', customText: '' },
    days: { 1: { waterCups: 8 } },
    drinks: {}, books: {}, metrics: {}, notes: {},
  }));
  const body = waterCheckinBody();
  // 8 cups * 8 = 64 oz. Spec example: "You're at 64 oz / 128. Halfway there."
  assert.match(body, /64 oz \/ 128/);
  assert.match(body, /Halfway there/);
});

// --- tasksRemainingBody ----------------------------------------------------

test('tasksRemainingBody summarizes the count of incomplete tasks', () => {
  memStore.clear();
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,'0');
  const d = String(today.getDate()).padStart(2,'0');
  const startDate = `${y}-${m}-${d}`;
  memStore.set(STORAGE_KEY, JSON.stringify({
    version: 5,
    startDate, name: 'X',
    diet: { name: 'Custom', customText: '' },
    days: { 1: { dietAdherence: true, w1: true, w2: true, read: false, water: false, photo: false } },
    drinks: {}, books: {}, metrics: {}, notes: {},
  }));
  const body = tasksRemainingBody();
  // 3 incomplete (read, water, photo).
  assert.match(body, /3 tasks left/);
});

test('tasksRemainingBody reports done state when everything is checked', () => {
  memStore.clear();
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,'0');
  const d = String(today.getDate()).padStart(2,'0');
  const startDate = `${y}-${m}-${d}`;
  memStore.set(STORAGE_KEY, JSON.stringify({
    version: 5,
    startDate, name: 'X',
    diet: { name: 'Custom', customText: '' },
    days: { 1: { dietAdherence: true, w1: true, w2: true, read: true, water: true, photo: true } },
    drinks: {}, books: {}, metrics: {}, notes: {},
  }));
  const body = tasksRemainingBody();
  assert.match(body, /All six tasks done/);
});

// --- scheduleDailyReminders + cancelScheduled ------------------------------

test('scheduleDailyReminders is a no-op when reminders are disabled', () => {
  memStore.clear();
  memStore.set(SETTINGS_KEY, JSON.stringify({ enableReminders: false }));
  notifPermission = 'granted';
  const installed = scheduleDailyReminders();
  assert.equal(installed.length, 0);
});

test('scheduleDailyReminders is a no-op without permission', () => {
  memStore.clear();
  memStore.set(SETTINGS_KEY, JSON.stringify({ enableReminders: true }));
  notifPermission = 'default';
  const installed = scheduleDailyReminders();
  assert.equal(installed.length, 0);
});

test('scheduleDailyReminders skips times that have passed today', () => {
  // With all four reminders set to 00:00, every fire time is in the past
  // (or exactly now) — none should install.
  memStore.clear();
  memStore.set(SETTINGS_KEY, JSON.stringify({
    enableReminders: true,
    reminderMorningWorkout: '00:00',
    reminderWater:          '00:00',
    reminderPhoto:          '00:00',
    reminderTasksRemaining: '00:00',
  }));
  notifPermission = 'granted';
  const installed = scheduleDailyReminders();
  assert.equal(installed.length, 0);
  cancelScheduled();
});

test('scheduleDailyReminders installs reminders for upcoming times', () => {
  // Set all four reminders to a minute that's at least 2 minutes in the
  // future from "now" so the schedule reliably installs across the clock.
  memStore.clear();
  // Compute "now + 2 minutes" rounded to the next whole minute.
  const t = new Date();
  t.setMinutes(t.getMinutes() + 2, 0, 0);
  // We can't pass arbitrary HH:MM > 23:59 — clamp to a value we know is
  // in the future. If now is 23:58+ this could wrap to tomorrow which
  // the spec excludes, so guard the test on that edge case.
  if(t.getDate() !== new Date().getDate()){
    // Skip: we're inside the last 2 minutes of the day — nothing to install.
    return;
  }
  const hh = String(t.getHours()).padStart(2,'0');
  const mm = String(t.getMinutes()).padStart(2,'0');
  const future = `${hh}:${mm}`;
  memStore.set(SETTINGS_KEY, JSON.stringify({
    enableReminders: true,
    reminderMorningWorkout: future,
    reminderWater:          future,
    reminderPhoto:          future,
    reminderTasksRemaining: future,
  }));
  notifPermission = 'granted';
  const installed = scheduleDailyReminders();
  assert.equal(installed.length, 4);
  // All entries point to a Date past "now".
  const now = Date.now();
  for(const e of installed){
    assert.ok(e.fireAt instanceof Date);
    assert.ok(e.fireAt.getTime() > now);
  }
  cancelScheduled();
});

test('cancelScheduled is idempotent and safe with no active timers', () => {
  cancelScheduled();
  cancelScheduled(); // double-call must not throw
  assert.ok(true);
});
