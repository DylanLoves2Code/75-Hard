import { TOTAL } from './constants.js';
import {
  getState, saveState, defaultState,
  isDayComplete, calcCurrentDay, calcCurrentWeek,
  calcStreak, countCompleteDays, getDateForDay, formatDate,
} from './state.js';
import { applyTheme, toggleTheme } from './theme.js';
import { startCountdown } from './countdown.js';
import { startQuoteRotation } from './quotes.js';
import { renderTaskList } from './tasks.js';
import { renderWaterMeter } from './water.js';
import { renderMetricInputs, saveMetrics } from './metrics.js';
import { renderNoteInput, saveNote } from './notes.js';
import { renderGrid } from './grid.js';
import { renderStats } from './stats.js';
import { renderGallery, renderCompare, closeLightbox } from './photos.js';
import { renderBooks, saveBookEntry } from './books.js';
import { renderDrinksLog, logDrinks } from './drinks.js';
import { closeModal, closeModalDirect } from './modal.js';
import { exportData, confirmReset, cancelReset, executeReset } from './export.js';

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

  const banner=document.getElementById('complete-banner');
  isDayComplete(s,day)?banner.classList.add('visible'):banner.classList.remove('visible');

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
  const s=defaultState(val,name);
  saveState(s);
  document.getElementById('setup-screen').classList.remove('active');
  document.getElementById('app').style.display='block';
  applyTheme();
  renderAll(s);
  startCountdown(s);
  startQuoteRotation(s);
}

function boot(){
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
    renderAll(s);
    startCountdown(s);
    startQuoteRotation(s);
  }
}

function wireStaticHandlers(){
  document.querySelector('#setup-screen .btn-primary').addEventListener('click',initChallenge);
  document.getElementById('theme-btn').addEventListener('click',toggleTheme);

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

  document.querySelector('#tab-export .btn-export').addEventListener('click',exportData);
  document.querySelector('#tab-export .btn-reset-full').addEventListener('click',confirmReset);

  document.getElementById('modal-overlay').addEventListener('click',closeModal);
  document.querySelector('#modal-content .modal-close').addEventListener('click',closeModalDirect);

  document.getElementById('lightbox').addEventListener('click',closeLightbox);
  document.querySelector('#lightbox .lightbox-close').addEventListener('click',closeLightbox);

  document.querySelector('#confirm-overlay .btn-danger').addEventListener('click',executeReset);
  document.querySelector('#confirm-overlay .btn-cancel').addEventListener('click',cancelReset);
}

wireStaticHandlers();
boot();

// PWA: register service worker on http/https only (skip file:// for local dev).
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed:', err));
  });
}
