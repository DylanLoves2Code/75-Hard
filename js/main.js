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
  exportIcs, generateAndShowShareLink, updateEngageButtonLabel,
} from './export.js';
import {
  renderArchiveView, restoreFromArchive,
} from './history.js';
import { parseShareFragment, renderSharedView } from './share.js';
import {
  renderPartnersPanel, getPartners, addPartnerFromUrl, removePartner,
} from './partners.js';
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
import {
  shouldOfferLiveHard, beginLiveHardPhase1, programLabel, calcProgramDay,
} from './livehard.js';
import {
  openHealthInfo, closeHealthInfo, pickWeightCsv, onWeightCsvChange,
} from './health.js';
import {
  openWearableInfo, closeWearableInfo, pickSleepCsv, onSleepCsvChange,
} from './wearable.js';

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

  // w6b item 48: Live Hard continuation banner + program-aware tasks.
  renderLiveHardBanner(s);
  renderLiveHardTasks(s, day);
  renderProgramDayLabel(s, day);

  // w5c item 45: partners panel on the Today tab. No-op when the user
  // hasn't added any partners yet (the host element hides itself).
  renderPartnersPanel(document.getElementById('partners-panel'));
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

/**
 * w6b item 48: Render the "BEGIN LIVE HARD PHASE 1" banner if the user
 * qualifies. The banner is mutually exclusive with the day-complete /
 * urgent banners — it shouts on Day 75 specifically.
 *
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function renderLiveHardBanner(s){
  const banner = document.getElementById('livehard-banner');
  if(!banner) return;
  if(shouldOfferLiveHard(s)){
    banner.classList.add('visible');
    banner.style.display = '';
  } else {
    banner.classList.remove('visible');
    banner.style.display = 'none';
  }
}

/**
 * w6b item 48: Update the program-day label ("Day 5 / 30" for Live Hard
 * Phase 1, "Day 75 / 75" for 75 Hard). For '75hard' mode we keep the
 * existing 1..75 numerator; for 'livehard-p1' we display the program-day
 * inside the 30-day phase plus an "// LIVE HARD — PHASE 1" subtitle.
 *
 * @param {import('./state.js').State} s
 * @param {number} day  calendar day (1..75 typically)
 * @returns {void}
 */
export function renderProgramDayLabel(s, day){
  const total = s && s.programTotal ? s.programTotal : TOTAL;
  const ofEl = document.querySelector('#current-day-num + .of75');
  const numEl = document.getElementById('current-day-num');
  if(s && s.programMode === 'livehard-p1'){
    const pDay = calcProgramDay(s);
    if(numEl) numEl.textContent = pDay;
    if(ofEl) ofEl.textContent = '/ ' + total;
    // Append the program label under the date sub-text so it's
    // discoverable without designing a whole new banner row.
    const dateEl = document.getElementById('current-day-date');
    if(dateEl && dateEl.textContent && !dateEl.textContent.includes(programLabel(s))){
      dateEl.textContent = dateEl.textContent + '  //  ' + programLabel(s);
    }
  } else {
    if(numEl) numEl.textContent = day;
    if(ofEl) ofEl.textContent = '/ ' + TOTAL;
  }
}

/**
 * w6b item 48: Render the Live Hard critical-task list + handshake
 * checkbox under the OBJECTIVES section, only in 'livehard-p1' mode.
 * In '75hard' mode the host section is hidden.
 *
 * Critical tasks: 3 free-form inputs persisted to `day.criticalTasks`
 * (string[]) and `day.criticalTasksDone` (boolean[]). The user may
 * leave inputs blank — only non-empty rows are required by isDayComplete.
 *
 * @param {import('./state.js').State} s
 * @param {number} day
 * @returns {void}
 */
export function renderLiveHardTasks(s, day){
  const host = document.getElementById('livehard-tasks');
  if(!host) return;
  if(!s || s.programMode !== 'livehard-p1'){
    host.style.display = 'none';
    host.innerHTML = '';
    return;
  }
  host.style.display = '';
  const dd = getDayData(s, day);
  const tasks = Array.isArray(dd.criticalTasks) ? dd.criticalTasks.slice() : [];
  const done = Array.isArray(dd.criticalTasksDone) ? dd.criticalTasksDone.slice() : [];
  // Pad to 3 visible rows so the user always sees the canonical Live
  // Hard target without having to add rows themselves.
  while(tasks.length < 3){ tasks.push(''); done.push(false); }

  host.innerHTML = `
    <div class="section-title">// LIVE HARD — CRITICAL TASKS</div>
    <div class="section-hint">// 3-5 daily must-do items. Leave blank to skip a slot.</div>
    <div id="livehard-critical-list"></div>
    <label class="livehard-handshake">
      <input type="checkbox" id="livehard-handshake-input" ${dd.handshake?'checked':''}>
      <span>🤝 Handshake / call with someone today</span>
    </label>
  `;
  const list = host.querySelector('#livehard-critical-list');
  tasks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'livehard-critical-row';
    row.innerHTML = `
      <input type="checkbox" class="livehard-critical-done" data-i="${i}" ${done[i]?'checked':''}>
      <input type="text" class="livehard-critical-text" data-i="${i}" placeholder="// CRITICAL TASK ${i+1}" value="${(t||'').replace(/"/g,'&quot;')}">
    `;
    list.appendChild(row);
  });

  const save = () => {
    const s2 = getState();
    if(!s2) return;
    const dd2 = getDayData(s2, day);
    const next = { ...dd2 };
    const texts = Array.from(host.querySelectorAll('.livehard-critical-text')).map(i => i.value);
    const checks = Array.from(host.querySelectorAll('.livehard-critical-done')).map(i => i.checked);
    next.criticalTasks = texts;
    next.criticalTasksDone = checks;
    next.handshake = !!host.querySelector('#livehard-handshake-input').checked;
    s2.days[day] = next;
    saveState(s2);
  };
  host.querySelectorAll('.livehard-critical-text').forEach(i => {
    i.addEventListener('blur', save);
  });
  host.querySelectorAll('.livehard-critical-done').forEach(i => {
    i.addEventListener('change', () => { save(); /* recompute completion */ const s2=getState(); if(s2) renderAll(s2); });
  });
  const hs = host.querySelector('#livehard-handshake-input');
  if(hs) hs.addEventListener('change', () => { save(); const s2=getState(); if(s2) renderAll(s2); });
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
  if(id==='export'){renderArchiveList();}
}

/**
 * Read the five prep checkboxes from the setup screen into a plain
 * object matching `state.prep`. Missing inputs default to `false`.
 * @returns {{dietReady:boolean,workoutsScheduled:boolean,bookReady:boolean,photoLocation:boolean,backupOutdoor:boolean}}
 */
function collectSetupPrep(){
  const read = id => !!(document.getElementById(id) && document.getElementById(id).checked);
  return {
    dietReady:         read('setup-prep-diet'),
    workoutsScheduled: read('setup-prep-workouts'),
    bookReady:         read('setup-prep-book'),
    photoLocation:     read('setup-prep-photo'),
    backupOutdoor:     read('setup-prep-backup'),
  };
}

function initChallenge(){
  const val=document.getElementById('start-date-input').value;
  if(!val){alert('Please select a start date.');return;}
  const name=document.getElementById('setup-name-input').value.trim().toUpperCase()||'SOLDIER';
  const dietSelect=document.getElementById('setup-diet-select');
  const dietCustom=document.getElementById('setup-diet-custom');
  const dietName=dietSelect?dietSelect.value:'Custom';
  const customText=dietName==='Custom'?(dietCustom?dietCustom.value.trim():''):'';
  const prep=collectSetupPrep();
  const s=defaultState(val,name,{name:dietName,customText},prep);
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

  // w5c item 44: shared-view mode. When the URL carries a `#share=...`
  // fragment we render a frozen friend snapshot and hide the normal
  // app shell. Setup screen is also hidden so first-time visitors who
  // open a share link don't have to onboard before seeing the snapshot.
  const sharedSnap = parseShareFragment();
  if(sharedSnap){
    applyTheme();
    applyReducedMotionClass();
    document.body.classList.add('shared-view-mode');
    const setup = document.getElementById('setup-screen');
    if(setup) setup.classList.remove('active');
    const appEl = document.getElementById('app');
    if(appEl) appEl.style.display = 'none';
    renderSharedView(sharedSnap, document.getElementById('shared-view-host'));
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

/**
 * Render the partners list inside the Settings modal — small rows with
 * a [REMOVE] button next to each. Called when the modal opens and
 * after every add/remove so the UI stays in sync without a global
 * rerender. The Today-tab panel still uses its own renderer.
 * @returns {void}
 */
function renderSettingsPartnersList(){
  const host=document.getElementById('set-partners-list');
  if(!host)return;
  const partners=getPartners();
  if(!partners.length){
    host.innerHTML='<div class="partners-empty">// NO PARTNERS YET</div>';
    return;
  }
  host.innerHTML=partners.map(p=>{
    const updated=p.lastUpdated?new Date(p.lastUpdated).toISOString().slice(0,10):'—';
    const safeName=String(p.name).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
    return `<div class="partners-settings-row" data-name="${safeName}">`+
      `<div class="partners-settings-main">`+
        `<div class="partners-settings-name">${safeName}</div>`+
        `<div class="partners-settings-meta">// DAY ${p.dayN} — STREAK ${p.streak} — SNAPSHOT ${updated}</div>`+
      `</div>`+
      `<button type="button" class="btn-row partner-remove-btn" data-name="${safeName}">REMOVE</button>`+
    `</div>`;
  }).join('');
  host.querySelectorAll('.partner-remove-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      removePartner(btn.dataset.name||'');
      renderSettingsPartnersList();
      const status=document.getElementById('set-partners-status');
      if(status)status.textContent='// REMOVED '+btn.dataset.name;
    });
  });
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
  // v7 item 46: prep checkboxes drive the ENGAGE button's label so the
  // user sees an "X of 5 READY" nudge as they tick boxes.
  document.querySelectorAll('.setup-prep-check').forEach(box => {
    box.addEventListener('change', updateEngageButtonLabel);
  });
  updateEngageButtonLabel();
  document.getElementById('theme-btn').addEventListener('click',toggleTheme);

  // Settings panel — header gear icon opens it; modal has save/cancel/close.
  // Also refresh the partners list on open so removals/adds done in a
  // prior session show up.
  document.getElementById('settings-btn').addEventListener('click',()=>{
    openSettings();
    renderSettingsPartnersList();
    const status=document.getElementById('set-partners-status');
    if(status)status.textContent='';
  });
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
  // w5c item 44: share-link button on Export tab.
  const shareBtn=document.getElementById('btn-share-link');
  if(shareBtn)shareBtn.addEventListener('click',generateAndShowShareLink);
  // w5c item 45: partner add/remove inside the Settings modal.
  const addPartnerBtn=document.getElementById('set-partner-add');
  if(addPartnerBtn){
    addPartnerBtn.addEventListener('click',()=>{
      const input=document.getElementById('set-partner-url');
      const status=document.getElementById('set-partners-status');
      if(!input)return;
      const result=addPartnerFromUrl(input.value);
      if(!result.ok){
        if(status)status.textContent='// '+(result.reason||'INVALID');
        return;
      }
      input.value='';
      if(status)status.textContent='// ADDED '+result.partner.name;
      renderSettingsPartnersList();
    });
  }
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

  // v7 item 47: restore-from-archive confirm overlay.
  const restoreConfirmBtn=document.getElementById('btn-restore-confirm');
  const restoreCancelBtn=document.getElementById('btn-restore-cancel');
  if(restoreConfirmBtn){
    restoreConfirmBtn.addEventListener('click',()=>{
      const idx=parseInt(restoreConfirmBtn.dataset.idx,10);
      const overlay=document.getElementById('restore-overlay');
      if(overlay)overlay.classList.remove('open');
      if(!Number.isInteger(idx)){return;}
      const ok=restoreFromArchive(idx);
      if(!ok){
        showRestoreToast('Restore failed: archive entry missing state');
        renderArchiveList();
        return;
      }
      const s=getState();
      if(!s)return;
      document.getElementById('setup-screen').classList.remove('active');
      document.getElementById('app').style.display='block';
      applyTheme();
      applyReducedMotionClass();
      renderAll(s);
      startCountdown(s);
      startQuoteRotation(s);
      renderArchiveList();
      showRestoreToast('Past attempt restored');
    });
  }
  if(restoreCancelBtn){
    restoreCancelBtn.addEventListener('click',()=>{
      const overlay=document.getElementById('restore-overlay');
      if(overlay)overlay.classList.remove('open');
    });
  }

  // w6b item 48: Live Hard opt-in banner.
  const lhBtn = document.getElementById('livehard-begin-btn');
  if(lhBtn){
    lhBtn.addEventListener('click', () => { beginLiveHardPhase1(); });
  }

  // w6b item 49: Health integration buttons inside Settings.
  const healthInfoBtn = document.getElementById('set-health-info');
  if(healthInfoBtn) healthInfoBtn.addEventListener('click', openHealthInfo);
  const healthInfoClose = document.getElementById('health-info-close');
  if(healthInfoClose) healthInfoClose.addEventListener('click', closeHealthInfo);
  const healthInfoOverlay = document.getElementById('health-info-overlay');
  if(healthInfoOverlay){
    healthInfoOverlay.addEventListener('click', e => {
      if(e.target === healthInfoOverlay) closeHealthInfo();
    });
  }
  const healthCsvBtn = document.getElementById('set-health-csv');
  if(healthCsvBtn) healthCsvBtn.addEventListener('click', pickWeightCsv);
  const healthCsvInput = document.getElementById('health-weight-csv-input');
  if(healthCsvInput) healthCsvInput.addEventListener('change', onWeightCsvChange);

  // w6b item 50: Wearable sleep integration buttons inside Settings.
  const wearableInfoBtn = document.getElementById('set-wearable-info');
  if(wearableInfoBtn) wearableInfoBtn.addEventListener('click', openWearableInfo);
  const wearableInfoClose = document.getElementById('wearable-info-close');
  if(wearableInfoClose) wearableInfoClose.addEventListener('click', closeWearableInfo);
  const wearableInfoOverlay = document.getElementById('wearable-info-overlay');
  if(wearableInfoOverlay){
    wearableInfoOverlay.addEventListener('click', e => {
      if(e.target === wearableInfoOverlay) closeWearableInfo();
    });
  }
  const wearableCsvBtn = document.getElementById('set-wearable-csv');
  if(wearableCsvBtn) wearableCsvBtn.addEventListener('click', pickSleepCsv);
  const wearableCsvInput = document.getElementById('wearable-sleep-csv-input');
  if(wearableCsvInput) wearableCsvInput.addEventListener('change', onSleepCsvChange);
}

/**
 * Lightweight toast shim that proxies the standard toast module.
 * @param {string} msg
 */
function showRestoreToast(msg){
  import('./toast.js').then(m => m.showToast(msg)).catch(()=>{});
}

/**
 * Render the Past Attempts list and wire its RESTORE hook to open the
 * restore-confirm overlay.
 * @returns {void}
 */
function renderArchiveList(){
  renderArchiveView({
    onRequestRestore: (idx, entry) => {
      const overlay = document.getElementById('restore-overlay');
      const body = document.getElementById('restore-confirm-body');
      const confirmBtn = document.getElementById('btn-restore-confirm');
      if(confirmBtn) confirmBtn.dataset.idx = String(idx);
      if(body){
        const name = entry && entry.name ? entry.name : '— UNNAMED —';
        const start = entry && entry.startDate ? entry.startDate : '';
        body.innerHTML = `Restoring "<strong>${name.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c])}</strong>" (started ${start}). ` +
          `Your current challenge will be archived first so you can flip back later.`;
      }
      if(overlay) overlay.classList.add('open');
    },
    onAfterDelete: () => { /* no-op */ },
  });
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
