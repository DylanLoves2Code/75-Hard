/**
 * @file Entry point — wires DOM handlers, boots the app, and exposes
 * the top-level {@link renderAll} routine used by other modules.
 */
import { TOTAL } from './constants.js';
import {
  getState, saveState, defaultState,
  isDayComplete, calcCurrentDay, calcCurrentWeek,
  calcStreak, countCompleteDays, getDateForDay, formatDate,
  checkStorageUsage,
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
import { renderBooks, saveBookEntry } from './books.js';
import { renderDrinksLog, logDrinks } from './drinks.js';
import { closeModal, closeModalDirect } from './modal.js';
import {
  exportData, confirmReset, cancelReset, executeReset,
  pickImportFile, handleImportFile, executeImport, cancelImport,
  exportPhotosZip, pickPhotoZipFile, handlePhotoZipFile,
} from './export.js';
import { on } from './bus.js';
import {
  getSettings, openSettings, closeSettings, applySettingsFromModal,
} from './settings.js';
import { renderReport } from './report.js';

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

  document.querySelectorAll('.app-tabs .tab-btn').forEach(btn=>{
    const id=btn.dataset.tab;
    btn.addEventListener('click',()=>switchTab(id,btn));
  });

  document.querySelector('#tab-today .btn-sm').addEventListener('click',saveMetrics);
  document.querySelector('#tab-today .btn-save-note').addEventListener('click',saveNote);

  document.getElementById('compare-a').addEventListener('change',renderCompare);
  document.getElementById('compare-b').addEventListener('change',renderCompare);

  document.querySelector('#tab-books .btn-sm').addEventListener('click',saveBookEntry);
  document.querySelector('#tab-drinks .btn-log').addEventListener('click',logDrinks);

  document.getElementById('btn-export-data').addEventListener('click',exportData);
  document.getElementById('btn-import-data').addEventListener('click',pickImportFile);
  document.getElementById('btn-export-photos').addEventListener('click',exportPhotosZip);
  document.getElementById('btn-import-photos').addEventListener('click',pickPhotoZipFile);
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
