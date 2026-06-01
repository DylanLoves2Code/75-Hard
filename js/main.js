/**
 * @file Entry point — wires DOM handlers, boots the app, and exposes
 * the top-level {@link renderAll} routine used by other modules.
 */
import { TOTAL, TASKS } from './constants.js';
import {
  getState, saveState, defaultState,
  isDayComplete, calcCurrentDay, calcCurrentWeek,
  calcStreak, countCompleteDays, getDateForDay, formatDate,
  checkStorageUsage, getDayData,
} from './state.js';
import { applyTheme, toggleTheme } from './theme.js';
import { startCountdown } from './countdown.js';
import { startQuoteRotation } from './quotes.js';
import { renderTaskList } from './tasks.js';
import { renderWaterMeter } from './water.js';
import { renderMetricInputs, saveMetrics } from './metrics.js';
import { renderNoteInput, saveNote } from './notes.js';
import { renderMeasurements } from './measurements.js';
import { renderWellbeingInputs } from './wellbeing.js';
import { maybeShowFailurePrompt } from './failure.js';
import { renderGrid } from './grid.js';
import { renderStats } from './stats.js';
import { renderGallery, renderCompare, closeLightbox } from './photos.js';
import { renderBooks, saveBookEntry, wireBooksTab } from './books.js';
import { renderDrinksLog, logDrinks } from './drinks.js';
import { closeModal, closeModalDirect } from './modal.js';
import {
  exportData, confirmReset, cancelReset, executeReset,
  pickImportFile, handleImportFile, executeImport, cancelImport,
  exportPhotosZip, pickPhotoZipFile, handlePhotoZipFile,
  exportIcs,
} from './export.js';
import { on } from './bus.js';
import {
  getSettings, openSettings, closeSettings, applySettingsFromModal,
  refreshNotificationPermissionUi,
} from './settings.js';
import {
  scheduleDailyReminders, requestPermission, testNotification,
} from './notifications.js';
import { renderReport } from './report.js';
import {
  BADGES, getUnlockedBadges, newlyUnlocked, consumeCelebrationFlag,
} from './badges.js';

/**
 * Re-render the entire app shell from the given state. This is the
 * top-level rerender — called once at boot and bound to the
 * `state:changed` bus event so feature modules don't have to import
 * it directly.
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function renderAll(s){
  const day=calcCurrentDay();
  const streak=calcStreak(s);
  const done=countCompleteDays(s);
  const pct=Math.round((done/TOTAL)*100);

  document.getElementById('streak-val').textContent=streak;
  document.getElementById('days-done-val').textContent=done;
  document.getElementById('progress-pct').textContent=pct+'%';
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('current-day-num').textContent=day;
  document.getElementById('current-day-date').textContent='TODAY — '+formatDate(getDateForDay(day)).toUpperCase();

  if(s.name) document.getElementById('header-name-sub').textContent='// '+s.name;

  const week=calcCurrentWeek();
  document.getElementById('current-week-num').textContent=week;
  const existing=s.drinks[week];
  if(existing!==undefined)document.getElementById('drinks-input').value=existing;

  renderTaskList(s,day,'task-list',true);
  renderWaterMeter(s,day);
  renderMetricInputs(s,day);
  renderNoteInput(s,day);
  renderMeasurements(s,day);
  renderWellbeingInputs(s,day);

  const banner=document.getElementById('complete-banner');
  const complete=isDayComplete(s,day);
  complete?banner.classList.add('visible'):banner.classList.remove('visible');
  // w4b: streak-at-risk urgent banner. Shown only when the day is NOT
  // complete and the clock has passed the configured warn-hour.
  renderUrgentBanner(s,day);
  // Soft caveat: 75 Hard requires one outdoor workout/day. Surface a
  // yellow nudge in the complete banner when neither slot was outdoors.
  const caveatEl=document.getElementById('complete-caveat');
  if(caveatEl){
    if(complete){
      const dd=s.days&&s.days[day];
      const outdoor=dd&&(dd.w1outdoor||dd.w2outdoor);
      caveatEl.textContent=outdoor?'':'// REMINDER — 75 Hard requires one outdoor workout per day.';
      caveatEl.style.display=outdoor?'none':'block';
    } else {
      caveatEl.textContent='';
      caveatEl.style.display='none';
    }
  }

  renderDrinksLog(s);
  renderGrid(s);
  renderStats(s);
  renderGallery(s);
  renderBooks(s);

  // w5b: achievement badge strip on Today.
  renderBadgeStrip(s);
}

/**
 * Track the most-recently-rendered unlocked badge ids so we can detect
 * fresh unlocks across rerenders and trigger a one-time celebration
 * animation per session.
 * @type {string[]}
 */
let lastUnlockedIds = [];

/**
 * Render the achievement-badge strip on the Today tab. Locked badges
 * render grey; unlocked badges render in accent color. Freshly-unlocked
 * badges (first sighting in this session) get a `.celebrate` class
 * that pulses once.
 *
 * @param {import('./state.js').State} s
 */
export function renderBadgeStrip(s){
  const host = document.getElementById('badge-strip');
  if(!host) return;
  const unlocked = getUnlockedBadges(s);
  const unlockedIds = unlocked.map(b => b.id);
  const fresh = newlyUnlocked(lastUnlockedIds, unlockedIds);
  lastUnlockedIds = unlockedIds;
  host.innerHTML = '';
  for(const b of BADGES){
    const isUnlocked = unlockedIds.includes(b.id);
    const el = document.createElement('div');
    el.className = 'badge' + (isUnlocked ? ' unlocked' : ' locked');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', b.title + (isUnlocked ? ' (unlocked)' : ' (locked)'));
    el.setAttribute('title', b.description);
    el.innerHTML = `
      <div class="badge-title">${b.title}</div>
      <div class="badge-desc">${b.description}</div>
    `;
    // Celebration: fire the animation once per session per badge id.
    if(isUnlocked && fresh.includes(b.id) && consumeCelebrationFlag(b.id)){
      el.classList.add('celebrate');
    }
    host.appendChild(el);
  }
}

/**
 * Pretty-format a duration in milliseconds as "Hh Mm" or "Mm" — used by
 * the streak-at-risk banner countdown to midnight.
 * @param {number} ms
 * @returns {string}
 */
function formatToMidnight(ms){
  if(ms <= 0) return '0 minutes';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if(h <= 0) return `${m} minute${m===1?'':'s'}`;
  if(m === 0) return `${h} hour${h===1?'':'s'}`;
  return `${h} hour${h===1?'':'s'} ${m} minute${m===1?'':'s'}`;
}

/**
 * Render (or hide) the red urgent "TASKS REMAINING" banner on Today.
 *
 * Visibility rules:
 *   - hidden when the day is fully complete,
 *   - hidden when the current local hour is < settings.streakWarnHour,
 *   - otherwise visible with a list of incomplete-task chips and the
 *     hours/minutes until midnight.
 *
 * Called from renderAll() and from the 60-second refresh interval so
 * the countdown stays accurate without forcing a full state rerender.
 *
 * @param {import('./state.js').State} s
 * @param {number} day
 * @returns {void}
 */
export function renderUrgentBanner(s, day){
  const banner = document.getElementById('urgent-banner');
  if(!banner) return;
  const day0 = day || calcCurrentDay();
  const settings = getSettings();
  const warnHour = Math.max(0, Math.min(23, parseInt(settings.streakWarnHour, 10) || 0));
  const now = new Date();
  const past = now.getHours() >= warnHour;
  const complete = isDayComplete(s, day0);
  if(complete || !past){
    banner.classList.remove('visible');
    return;
  }
  const dd = getDayData(s, day0);
  const incomplete = [];
  for(const t of TASKS){
    const done = t.key === 'dietAdherence' ? (dd.dietAdherence || dd.calorie) : dd[t.key];
    if(done) continue;
    let labelText = t.label;
    if(t.customLabel) labelText = dd[t.key+'label'] || t.label;
    incomplete.push(labelText);
  }
  if(incomplete.length === 0){
    banner.classList.remove('visible');
    return;
  }
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const remaining = midnight.getTime() - now.getTime();
  const sub = document.getElementById('urgent-sub');
  const chips = document.getElementById('urgent-chips');
  if(sub){
    sub.textContent = `${incomplete.length} task${incomplete.length===1?'':'s'} left. ${formatToMidnight(remaining)} to midnight.`;
  }
  if(chips){
    chips.innerHTML = '';
    for(const name of incomplete){
      const span = document.createElement('span');
      span.className = 'urgent-chip';
      span.textContent = `[ ${name} ]`;
      chips.appendChild(span);
    }
  }
  // Hide the green day-complete banner just in case both ended up
  // visible at once (e.g. a stale class lingering from a prior render).
  const complBanner = document.getElementById('complete-banner');
  if(complBanner) complBanner.classList.remove('visible');
  banner.classList.add('visible');
}

/** Interval handle for the 60-second urgent-banner re-evaluation. */
let urgentTimerId = null;

/**
 * Start the urgent-banner refresh loop. Ticks every 60s — fine-grained
 * enough that the "X minutes to midnight" text stays current, cheap
 * enough not to bother with the existing countdown's 1Hz interval.
 * @returns {void}
 */
function startUrgentTimer(){
  if(urgentTimerId) clearInterval(urgentTimerId);
  urgentTimerId = setInterval(() => {
    const s = getState();
    if(!s) return;
    renderUrgentBanner(s, calcCurrentDay());
  }, 60000);
}

function switchTab(id,btn){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.remove('active');
    b.setAttribute('aria-selected','false');
  });
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  btn.setAttribute('aria-selected','true');
  if(id==='stats'){const s=getState();renderStats(s);}
  if(id==='gallery'){const s=getState();renderGallery(s);}
}

function initChallenge(){
  const val=document.getElementById('start-date-input').value;
  if(!val){alert('Please select a start date.');return;}
  const name=document.getElementById('setup-name-input').value.trim().toUpperCase()||'SOLDIER';
  const dietSelect=document.getElementById('setup-diet-select');
  const dietCustom=document.getElementById('setup-diet-custom');
  const dietName=dietSelect?dietSelect.value:'Custom';
  const customText=dietName==='Custom'?(dietCustom?dietCustom.value.trim():''):'';
  const s=defaultState(val,name,{name:dietName,customText});
  saveState(s);
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('app').style.display='block';
  applyTheme();
  renderAll(s);
  startCountdown(s);
  startQuoteRotation(s);
}

/**
 * Apply the "force reduced motion" body class based on the current
 * settings choice. Called at boot and whenever settings change.
 * @returns {void}
 */
function applyReducedMotionClass(){
  const mode=getSettings().reducedMotion;
  document.body.classList.toggle('force-reduced-motion',mode==='on');
}

function boot(){
  // Day 75 print-report mode: ?report=1 bypasses the normal app shell
  // entirely. We still need state to render the report, so the setup
  // path is unreachable here (no data -> redirect back to normal app).
  const params=new URLSearchParams(window.location.search);
  if(params.get('report')==='1'){
    const s=getState();
    if(!s){
      window.location.search='';
      return;
    }
    applyTheme();
    applyReducedMotionClass();
    document.body.classList.add('report-mode');
    renderReport(s);
    return;
  }

  const s=getState();
  if(!s){
    const today=new Date();
    document.getElementById('start-date-input').value=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    document.getElementById('setup-screen').classList.add('active');
    document.getElementById('app').style.display='none';
  } else {
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('app').style.display='block';
    applyTheme();
    applyReducedMotionClass();
    renderAll(s);
    startCountdown(s);
    startQuoteRotation(s);
    checkStorageUsage();
    // v4: one-time end-of-day failure-log prompt for yesterday, if incomplete.
    maybeShowFailurePrompt(s);
    // w4b: install the day's reminder timeouts (no-op if disabled or
    // permission not granted), and start the 60s urgent-banner refresh.
    scheduleDailyReminders();
    startUrgentTimer();
  }
}

function wireStaticHandlers(){
  document.querySelector('#setup-screen .btn-primary').addEventListener('click',initChallenge);
  // Setup-screen diet select: reveal the custom text input only when needed.
  const dietSelect=document.getElementById('setup-diet-select');
  const dietCustom=document.getElementById('setup-diet-custom');
  if(dietSelect&&dietCustom){
    dietSelect.addEventListener('change',()=>{
      dietCustom.style.display=dietSelect.value==='Custom'?'block':'none';
    });
  }
  document.getElementById('theme-btn').addEventListener('click',toggleTheme);

  // Settings panel — header gear icon opens it; modal has save/cancel/close.
  document.getElementById('settings-btn').addEventListener('click',openSettings);
  document.getElementById('settings-close').addEventListener('click',closeSettings);
  document.getElementById('settings-cancel-btn').addEventListener('click',closeSettings);
  document.getElementById('settings-save').addEventListener('click',applySettingsFromModal);
  document.getElementById('settings-overlay').addEventListener('click',e=>{
    if(e.target===document.getElementById('settings-overlay'))closeSettings();
  });
  // w4b: notification permission + test buttons inside the settings modal.
  const notifReq=document.getElementById('set-notif-request');
  if(notifReq){
    notifReq.addEventListener('click',()=>{
      requestPermission().then(()=>{
        refreshNotificationPermissionUi();
        scheduleDailyReminders();
      });
    });
  }
  const notifTest=document.getElementById('set-notif-test');
  if(notifTest)notifTest.addEventListener('click',testNotification);

  document.querySelectorAll('.app-tabs .tab-btn').forEach(btn=>{
    const id=btn.dataset.tab;
    btn.addEventListener('click',()=>switchTab(id,btn));
  });

  document.querySelector('#tab-today .btn-sm').addEventListener('click',saveMetrics);
  document.querySelector('#tab-today .btn-save-note').addEventListener('click',saveNote);

  document.getElementById('compare-a').addEventListener('change',renderCompare);
  document.getElementById('compare-b').addEventListener('change',renderCompare);

  document.querySelector('#tab-books .btn-sm').addEventListener('click',saveBookEntry);
  // Reading pomodoro + quotes-vault link bar (item 37/38).
  wireBooksTab();
  document.querySelector('#tab-drinks .btn-log').addEventListener('click',logDrinks);

  document.getElementById('btn-export-data').addEventListener('click',exportData);
  document.getElementById('btn-import-data').addEventListener('click',pickImportFile);
  document.getElementById('btn-export-photos').addEventListener('click',exportPhotosZip);
  document.getElementById('btn-import-photos').addEventListener('click',pickPhotoZipFile);
  const icsBtn=document.getElementById('btn-export-ics');
  if(icsBtn)icsBtn.addEventListener('click',exportIcs);
  document.getElementById('import-file-input').addEventListener('change',handleImportFile);
  document.getElementById('import-zip-input').addEventListener('change',handlePhotoZipFile);
  document.querySelector('#tab-export .btn-reset-full').addEventListener('click',confirmReset);
  document.getElementById('btn-print-report').addEventListener('click',()=>{
    window.location.search='?report=1';
  });

  document.getElementById('btn-import-confirm').addEventListener('click',executeImport);
  document.getElementById('btn-import-cancel').addEventListener('click',cancelImport);

  document.getElementById('modal-overlay').addEventListener('click',closeModal);
  document.querySelector('#modal-content .modal-close').addEventListener('click',closeModalDirect);

  document.getElementById('lightbox').addEventListener('click',closeLightbox);
  document.querySelector('#lightbox .lightbox-close').addEventListener('click',closeLightbox);

  document.querySelector('#confirm-overlay .btn-danger').addEventListener('click',executeReset);
  document.querySelector('#confirm-overlay .btn-cancel').addEventListener('click',cancelReset);
}

/**
 * Wire bus subscriptions. Feature modules `emit()` after saving state;
 * `main.js` owns the corresponding rerenders. Keeps downstream modules
 * free of any `import { renderAll } from './main.js'` cycle.
 * @returns {void}
 */
function wireBus(){
  // Catch-all: full rerender. Mirrors the legacy `renderAll(s2)` calls.
  on('state:changed', renderAll);

  // Narrower buckets — opt-in for sites that know they only touched
  // one slice of the UI. Today-only redraws (no grid/stats/gallery).
  on('state:today', s => {
    const day = calcCurrentDay();
    renderTaskList(s, day, 'task-list', true);
    renderWaterMeter(s, day);
    renderMetricInputs(s, day);
    renderNoteInput(s, day);
    renderMeasurements(s, day);
    renderWellbeingInputs(s, day);
  });
  on('state:grid', renderGrid);
  on('state:stats', renderStats);
  on('state:gallery', renderGallery);
  on('state:drinks', renderDrinksLog);

  // Settings changes ripple into Today (unit-aware inputs) + Stats
  // (unit-aware avg/chart) + the reduced-motion body class. The quote
  // rotation re-subscribes to this event in startQuoteRotation.
  on('settings:changed', () => {
    applyReducedMotionClass();
    // w4b: reminder + warn-hour settings — re-install the day's reminder
    // schedule and refresh the urgent banner. Safe to call when disabled.
    scheduleDailyReminders();
    const s = getState();
    if(s) renderAll(s);
  });
}

wireStaticHandlers();
wireBus();
boot();

// PWA: register service worker on http/https only (skip file:// for local dev).
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}
