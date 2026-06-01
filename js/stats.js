/** @file Stats tab — overview cards plus weekly/weight/sleep bar charts. */
import { TOTAL } from './constants.js';
import { getDayData, isDayComplete, calcCurrentDay, calcStreak, countCompleteDays } from './state.js';
import { getSettings, lbsToKg } from './settings.js';

/**
 * Render the stats overview cards and bar charts from saved state.
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function renderStats(s){
  const today=calcCurrentDay();
  const done=countCompleteDays(s);
  const streak=calcStreak(s);
  const pct=Math.round((done/TOTAL)*100);

  const taskKeys=['calorie','w1','w2','read','water','photo'];
  const taskNames=['Calorie','WO1','WO2','Read','Water','Photo'];
  let missCount={};taskKeys.forEach(k=>missCount[k]=0);
  for(let d=1;d<=today;d++){
    const dd=getDayData(s,d);
    taskKeys.forEach(k=>{if(!dd[k])missCount[k]++;});
  }
  const mostMissed=taskKeys.reduce((a,b)=>missCount[a]>missCount[b]?a:b);
  const missIdx=taskKeys.indexOf(mostMissed);

  let weights=[],sleeps=[];
  for(let d=1;d<=today;d++){
    const m=s.metrics&&s.metrics[d];
    if(m){if(m.weight)weights.push(m.weight);if(m.sleep)sleeps.push(m.sleep);}
  }
  const avgWLbs=weights.length?weights.reduce((a,b)=>a+b,0)/weights.length:null;
  const avgS=sleeps.length?Math.round(sleeps.reduce((a,b)=>a+b,0)/sleeps.length*10)/10:null;

  // Presentation-only conversion: stored values stay in lbs.
  const unit=getSettings().weightUnit==='kg'?'kg':'lbs';
  const avgW=avgWLbs===null?null:(unit==='kg'?lbsToKg(avgWLbs):Math.round(avgWLbs*10)/10);
  const weightLabel=unit==='kg'?'Avg Weight (kg)':'Avg Weight (lbs)';
  const weightChartTitle=unit==='kg'?'// WEIGHT TREND (kg)':'// WEIGHT TREND (lbs)';
  const weightChartTitleEl=document.querySelector('#tab-stats .chart-wrap:nth-of-type(2) .chart-title');
  if(weightChartTitleEl)weightChartTitleEl.textContent=weightChartTitle;

  const grid=document.getElementById('stats-grid');
  grid.innerHTML=`
    <div class="stat-card"><div class="stat-card-val">${streak}</div><div class="stat-card-lbl">Current Streak</div></div>
    <div class="stat-card green"><div class="stat-card-val">${done}</div><div class="stat-card-lbl">Days Complete</div></div>
    <div class="stat-card gold"><div class="stat-card-val">${pct}%</div><div class="stat-card-lbl">Progress</div></div>
    <div class="stat-card blue"><div class="stat-card-val">${today}</div><div class="stat-card-lbl">Days In</div></div>
    <div class="stat-card purple"><div class="stat-card-val">${avgW||'—'}</div><div class="stat-card-lbl">${weightLabel}</div></div>
    <div class="stat-card" style="border-left-color:var(--blue)"><div class="stat-card-val">${avgS||'—'}</div><div class="stat-card-lbl">Avg Sleep (hrs)</div></div>
    <div class="stat-card" style="border-left-color:var(--red);grid-column:1/-1"><div class="stat-card-val" style="font-size:1.2rem;">${taskNames[missIdx]}</div><div class="stat-card-lbl">Most Missed Task (${missCount[mostMissed]} times)</div></div>
  `;

  renderBarChart('completion-chart', buildWeeklyCompletionData(s), '#ff3c00', v=>`${v}%`);
  renderBarChart('weight-chart', buildMetricData(s,'weight'), '#f5c400', v=>`${v}`);
  renderBarChart('sleep-chart', buildMetricData(s,'sleep'), '#d500f9', v=>`${v}h`);
}

/**
 * Build `[{label, value}]` series for the weekly-completion chart.
 * @param {import('./state.js').State} s
 * @returns {{label:string,value:number}[]}
 */
export function buildWeeklyCompletionData(s){
  const today=calcCurrentDay();
  const weeks=Math.ceil(today/7);
  const data=[];
  for(let w=1;w<=weeks;w++){
    let complete=0,total=0;
    for(let d=(w-1)*7+1;d<=Math.min(w*7,today);d++){total++;if(isDayComplete(s,d))complete++;}
    data.push({label:'W'+w,value:total>0?Math.round(complete/total*100):0});
  }
  return data;
}

/**
 * Build series for a single metric ("weight" or "sleep") across days.
 * @param {import('./state.js').State} s
 * @param {'weight'|'sleep'} key
 * @returns {{label:string,value:number}[]}
 */
export function buildMetricData(s,key){
  const today=calcCurrentDay();const data=[];
  const toKg=key==='weight'&&getSettings().weightUnit==='kg';
  for(let d=1;d<=today;d++){
    const m=s.metrics&&s.metrics[d];
    if(m&&m[key]){
      const v=toKg?lbsToKg(m[key]):m[key];
      data.push({label:'D'+d,value:v});
    }
  }
  return data;
}

/**
 * Render a simple bar chart into `containerId`.
 * @param {string} containerId
 * @param {{label:string,value:number}[]} data
 * @param {string} color  CSS color for the bars.
 * @param {(v:number)=>string} tipFn  Tooltip formatter.
 * @returns {void}
 */
export function renderBarChart(containerId,data,color,tipFn){
  const c=document.getElementById(containerId);c.innerHTML='';
  if(!data.length){c.innerHTML='<div style="font-family:var(--font-m);font-size:0.6rem;color:var(--text3);letter-spacing:0.1em;">No data yet</div>';return;}
  const max=Math.max(...data.map(d=>d.value),1);
  data.forEach(d=>{
    const bar=document.createElement('div');
    bar.className='chart-bar';
    const h=Math.max(2,Math.round((d.value/max)*80));
    bar.style.height=h+'px';
    bar.style.background=color;
    bar.style.opacity='0.7';
    bar.setAttribute('data-tip',d.label+': '+tipFn(d.value));
    c.appendChild(bar);
  });
}
