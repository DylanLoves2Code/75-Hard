/**
 * @file Day-75 print report — a static, single-page printable view
 * rendered into `#report-view` when the user lands on `?report=1`.
 *
 * The report intentionally has no live interactivity (no tabs, no
 * tile click-handlers, no quote rotation) — its only job is to be a
 * Cmd+P-friendly artifact that captures the entire 75-day attempt:
 * a compact grid, headline stats, one-line week summaries from field
 * notes, and a thumbnail strip of every progress photo.
 *
 * Storage stays in lbs even when the user picked kg, so we convert
 * for display only (see js/settings.js).
 */

import { TOTAL, TASKS, photoKey } from './constants.js';
import {
  getDayData, isDayComplete, calcCurrentDay, calcStreak,
  countCompleteDays, getDateForDay, formatDate,
} from './state.js';
import { getSettings, lbsToKg } from './settings.js';

/**
 * Build and inject the entire report DOM into `#report-view`.
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function renderReport(s){
  const root=document.getElementById('report-view');
  if(!root)return;
  const today=calcCurrentDay();
  const done=countCompleteDays(s);
  const streak=calcStreak(s);
  const startD=getDateForDay(1);
  const endD=getDateForDay(TOTAL);
  const name=s.name||'SOLDIER';

  const unit=getSettings().weightUnit==='kg'?'kg':'lbs';

  // Aggregate weight/sleep + page totals + most-missed task.
  let wSum=0,wN=0,sSum=0,sN=0,pageTotal=0;
  for(let d=1;d<=today;d++){
    const m=s.metrics&&s.metrics[d];
    if(m){if(m.weight){wSum+=m.weight;wN++;}if(m.sleep){sSum+=m.sleep;sN++;}}
  }
  Object.keys(s.books||{}).forEach(k=>{pageTotal+=(s.books[k]&&s.books[k].pages)||0;});

  const avgWLbs=wN?wSum/wN:null;
  const avgW=avgWLbs===null?'—':(unit==='kg'?lbsToKg(avgWLbs).toFixed(1):(Math.round(avgWLbs*10)/10).toFixed(1));
  const avgS=sN?(Math.round((sSum/sN)*10)/10).toFixed(1):'—';

  const taskKeys=TASKS.map(t=>t.key);
  const taskNames={dietAdherence:'Diet',calorie:'Diet',w1:'WO1',w2:'WO2',read:'Read',water:'Water',photo:'Photo'};
  const miss={};taskKeys.forEach(k=>miss[k]=0);
  for(let d=1;d<=today;d++){
    const dd=getDayData(s,d);
    taskKeys.forEach(k=>{
      // Diet slot accepts the legacy `calorie` field as well.
      const done=k==='dietAdherence'?(dd.dietAdherence||dd.calorie):dd[k];
      if(!done)miss[k]++;
    });
  }
  const mostMissedKey=taskKeys.reduce((a,b)=>miss[a]>=miss[b]?a:b);
  const mostMissed=`${taskNames[mostMissedKey]} (${miss[mostMissedKey]})`;

  // Grid tiles for all 75 days.
  let tilesHtml='';
  for(let d=1;d<=TOTAL;d++){
    const complete=isDayComplete(s,d);
    const dd=getDayData(s,d);
    const any=dd.dietAdherence||dd.calorie||dd.w1||dd.w2||dd.read||dd.water||dd.photo;
    let cls='report-tile';
    if(complete)cls+=' complete';
    else if(any&&d<=today)cls+=' partial';
    tilesHtml+=`<div class="${cls}">${d}</div>`;
  }

  // 1-line summary per week of the field notes — first 60 chars of the
  // longest (or first existing) note in the week.
  const weeks=Math.ceil(TOTAL/7);
  const weekNotes=[];
  for(let w=1;w<=weeks;w++){
    let pick='';
    for(let d=(w-1)*7+1;d<=Math.min(w*7,TOTAL);d++){
      const note=s.notes&&s.notes[d];
      if(note&&note.trim()){
        const trimmed=note.trim().replace(/\s+/g,' ');
        if(trimmed.length>pick.length)pick=trimmed;
      }
    }
    if(pick){
      const snip=pick.length>60?pick.slice(0,60)+'…':pick;
      weekNotes.push(`<div class="report-note"><span class="wk">W${w}</span>${escapeHtml(snip)}</div>`);
    }
  }
  const notesHtml=weekNotes.length?weekNotes.join(''):'<div class="report-empty">No field notes recorded.</div>';

  // Photo strip — small thumbnails of every photo in order.
  let photoHtml='';let photoCount=0;
  for(let d=1;d<=TOTAL;d++){
    const p=localStorage.getItem(photoKey(d));
    if(p){
      photoCount++;
      photoHtml+=`<div class="report-photo"><img src="${p}" alt="Day ${d}"><div class="lbl">D${d}</div></div>`;
    }
  }
  const photoStrip=photoCount?`<div class="report-photo-strip">${photoHtml}</div>`:'<div class="report-empty">No progress photos uploaded.</div>';

  root.innerHTML=`
    <div class="report-toolbar">
      <button type="button" class="btn-back" id="report-back">[ BACK ]</button>
      <button type="button" class="btn-print" id="report-print">[ PRINT ]</button>
    </div>
    <div class="report-title">75 HARD — Day ${today} of ${TOTAL} — ${escapeHtml(name)}</div>
    <div class="report-subtitle">${formatDate(startD)} → ${formatDate(endD)}</div>

    <div class="report-section">
      <div class="report-section-title">COMPLETION GRID</div>
      <div class="report-grid">${tilesHtml}</div>
    </div>

    <div class="report-section">
      <div class="report-section-title">SUMMARY</div>
      <div class="report-stats">
        <div class="report-stat"><div class="v">${streak}</div><div class="l">Current Streak</div></div>
        <div class="report-stat"><div class="v">${done}</div><div class="l">Days Complete</div></div>
        <div class="report-stat"><div class="v">${Math.round((done/TOTAL)*100)}%</div><div class="l">Progress</div></div>
        <div class="report-stat"><div class="v">${avgW}</div><div class="l">Avg Weight (${unit})</div></div>
        <div class="report-stat"><div class="v">${avgS}</div><div class="l">Avg Sleep (hrs)</div></div>
        <div class="report-stat"><div class="v">${pageTotal}</div><div class="l">Total Pages Read</div></div>
        <div class="report-stat" style="grid-column:1/-1"><div class="v" style="font-size:1.1rem;">${mostMissed}</div><div class="l">Most Missed Task</div></div>
      </div>
    </div>

    <div class="report-section">
      <div class="report-section-title">FIELD NOTES // WEEKLY HIGHLIGHTS</div>
      <div class="report-notes">${notesHtml}</div>
    </div>

    <div class="report-section">
      <div class="report-section-title">PROGRESS PHOTOS</div>
      ${photoStrip}
    </div>
  `;

  document.getElementById('report-back').addEventListener('click',()=>{
    // Strip ?report and reload into the normal app.
    window.location.search='';
  });
  document.getElementById('report-print').addEventListener('click',()=>{
    window.print();
  });
}

/**
 * Minimal HTML escape for the bits of state we interpolate as text.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  })[c]);
}
