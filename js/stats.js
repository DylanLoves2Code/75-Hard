/** @file Stats tab — overview cards plus weekly/weight/sleep bar charts. */
import { TOTAL } from './constants.js';
import { getDayData, isDayComplete, calcCurrentDay, calcStreak, countCompleteDays, getDateForDay, getState } from './state.js';
import { getSettings, lbsToKg } from './settings.js';
import { getMeasurementsDiff } from './measurements.js';
import { buildWellbeingTrend } from './wellbeing.js';
import { getFailureLog } from './failure.js';
import { totalAudiobookMinutes } from './books.js';
import { downloadCard } from './sharecard.js';

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

  const taskKeys=['dietAdherence','w1','w2','read','water','photo'];
  const taskNames=['Diet','WO1','WO2','Read','Water','Photo'];
  let missCount={};taskKeys.forEach(k=>missCount[k]=0);
  for(let d=1;d<=today;d++){
    const dd=getDayData(s,d);
    taskKeys.forEach(k=>{
      // Diet slot: pre-v3 records only have `calorie`. Accept either.
      const done=k==='dietAdherence'?(dd.dietAdherence||dd.calorie):dd[k];
      if(!done)missCount[k]++;
    });
  }
  const mostMissed=taskKeys.reduce((a,b)=>missCount[a]>missCount[b]?a:b);
  const missIdx=taskKeys.indexOf(mostMissed);

  // % of book entries that were nonfiction (v3+). Pre-v3 entries were
  // migrated with `nonfiction:true` so legacy data scores 100%.
  let bookTotal=0,bookNF=0;
  if(s.books){
    for(const k in s.books){
      const b=s.books[k];if(!b)continue;
      bookTotal++;
      if(b.nonfiction!==false)bookNF++;
    }
  }
  const nfPct=bookTotal?Math.round((bookNF/bookTotal)*100):null;

  // v6: total audiobook supplemental listening. Rendered in hours
  // (one decimal). 0 minutes shows as '—' to match other empty cards.
  const audioMin=totalAudiobookMinutes(s);
  const audioHrs=audioMin>0?(Math.round((audioMin/60)*10)/10):null;

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
    <div class="stat-card purple"><div class="stat-card-val">${nfPct===null?'—':nfPct+'%'}</div><div class="stat-card-lbl">Nonfiction Reads</div></div>
    <div class="stat-card" style="border-left-color:var(--purple)"><div class="stat-card-val">${audioHrs===null?'—':audioHrs}</div><div class="stat-card-lbl">Audiobook Hours</div></div>
    <div class="stat-card" style="border-left-color:var(--red);grid-column:1/-1"><div class="stat-card-val" style="font-size:1.2rem;">${taskNames[missIdx]}</div><div class="stat-card-lbl">Most Missed Task (${missCount[mostMissed]} times)</div></div>
  `;

  renderBarChart('completion-chart', buildWeeklyCompletionData(s), '#ff3c00', v=>`${v}%`);
  renderBarChart('weight-chart', buildMetricData(s,'weight'), '#f5c400', v=>`${v}`);
  renderBarChart('sleep-chart', buildMetricData(s,'sleep'), '#d500f9', v=>`${v}h`);

  // v4 deeper-tracking sub-sections.
  renderBodyTransformation(s);
  renderWellbeingTrend(s);
  renderWorkoutBreakdown(s);
  renderFailureLog(s);

  // w5b: 75-day heatmap + day-of-week miss pattern.
  renderHeatmap(s);
  renderMissPattern(s);
  wireShareCardButton(s);
}

/**
 * Render the 75-day "GitHub-style" heatmap into `#heatmap-grid`. A 15-
 * column × 5-row layout puts the whole challenge on one screen on
 * mobile without scrolling. Each tile is a button-promoted div with a
 * `data-tip` tooltip; the same hover-tooltip CSS used by chart bars
 * already covers it.
 *
 * Coloring matches the brief:
 *   - complete day → bright `--accent`
 *   - partial day  → muted yellow
 *   - incomplete   → outline only
 *   - future day   → very dim
 *
 * @param {import('./state.js').State} s
 */
export function renderHeatmap(s){
  const host = document.getElementById('heatmap-grid');
  if(!host) return;
  host.innerHTML = '';
  const today = calcCurrentDay();
  for(let d = 1; d <= TOTAL; d++){
    const cell = document.createElement('div');
    cell.className = 'hm-cell';
    const complete = isDayComplete(s, d);
    const dd = getDayData(s, d);
    const any = dd.dietAdherence || dd.calorie || dd.w1 || dd.w2 || dd.read || dd.water || dd.photo;
    const future = d > today;
    if(complete) cell.classList.add('complete');
    else if(!future && any) cell.classList.add('partial');
    else if(future) cell.classList.add('future');
    else cell.classList.add('incomplete');
    // Tooltip — same CSS as `.chart-bar:hover::after`.
    const tipParts = [];
    tipParts.push(`Day ${d}`);
    if(future) tipParts.push('future');
    else if(complete) tipParts.push('all 6 tasks done');
    else {
      const done =
        ((dd.dietAdherence||dd.calorie)?1:0) +
        (dd.w1?1:0) + (dd.w2?1:0) +
        (dd.read?1:0) + (dd.water?1:0) + (dd.photo?1:0);
      tipParts.push(`${done}/6 tasks`);
    }
    cell.setAttribute('data-tip', tipParts.join(' — '));
    cell.setAttribute('aria-label', tipParts.join(' — '));
    host.appendChild(cell);
  }
}

/**
 * Render the day-of-week miss-pattern card. Bars show miss percentage
 * per weekday (Mon-Sun); the highest bar is highlighted red. A
 * single-line takeaway is shown only when at least 14 days have
 * elapsed (otherwise the sample is too small to be meaningful).
 *
 * Hides itself when not enough data has accumulated to be useful
 * (< 7 evaluated days).
 *
 * @param {import('./state.js').State} s
 */
function renderMissPattern(s){
  const host = document.getElementById('stats-miss-pattern');
  if(!host) return;
  const today = calcCurrentDay();
  // Need at least a week of past data to bother showing anything.
  if(today < 7){
    host.innerHTML = '';
    return;
  }
  const stats = computeMissPatternByWeekday(s);
  if(!stats || !stats.length){
    host.innerHTML = '';
    return;
  }
  // Locate the worst day. We hide takeaway entirely when meaningful
  // data is too thin (< 2 weeks).
  const meaningful = today >= 14;
  let worst = null;
  for(const row of stats){
    if(row.total === 0) continue;
    if(!worst || row.missPct > worst.missPct) worst = row;
  }
  const bars = stats.map((row, i) => {
    const highlight = (worst && i === stats.indexOf(worst));
    const h = Math.max(2, Math.round(row.missPct * 0.8));
    const color = highlight ? 'var(--red)' : 'var(--accent)';
    const tip = row.total === 0
      ? `${row.label}: no data`
      : `${row.label}: ${row.misses}/${row.total} missed (${row.missPct}%)`;
    return `
      <div class="mp-col">
        <div class="mp-bar" style="height:${h}px;background:${color};" data-tip="${tip}"></div>
        <div class="mp-lbl">${row.short}</div>
      </div>`;
  }).join('');
  const takeaway = (meaningful && worst && worst.missPct > 0)
    ? `<div class="mp-takeaway">// Most often missed on ${worst.label}s (${worst.missPct}% miss rate)</div>`
    : (meaningful ? '<div class="mp-takeaway">// No misses yet — keep it locked in.</div>' : '');
  host.innerHTML = `
    <div class="chart-title">// MISS PATTERN — DAY OF WEEK</div>
    <div class="mp-row">${bars}</div>
    ${takeaway}
  `;
}

/**
 * Pure helper: compute the day-of-week miss distribution from the
 * saved state. Returns one row per weekday (Monday first, Sunday last).
 *
 * For each elapsed day `d` in `[1, currentDay]`, classify it as a miss
 * if {@link isDayComplete} is false. Bucket misses + totals by the
 * weekday derived from the day's calendar date (via the state's
 * `startDate`).
 *
 * @param {import('./state.js').State} s
 * @returns {Array<{key:number,label:string,short:string,misses:number,total:number,missPct:number}>}
 *   Empty `[]` if `s` lacks a startDate.
 */
export function computeMissPatternByWeekday(s){
  if(!s || !s.startDate) return [];
  const today = calcCurrentDay();
  // Monday-first ordering: keys 1..6 then 0 (Sunday).
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  const LABELS = {
    0: ['Sunday',    'SUN'],
    1: ['Monday',    'MON'],
    2: ['Tuesday',   'TUE'],
    3: ['Wednesday', 'WED'],
    4: ['Thursday',  'THU'],
    5: ['Friday',    'FRI'],
    6: ['Saturday',  'SAT'],
  };
  const buckets = new Map();
  for(const k of ORDER) buckets.set(k, {misses: 0, total: 0});
  for(let d = 1; d <= today; d++){
    // We only score days that have actually passed (so today, if
    // incomplete, still counts — the day's not over but the rule is
    // "incomplete-day-of-the-prior-N-days"; we treat today the same).
    const date = getDateForDay(d);
    const wd = date.getDay();
    const bucket = buckets.get(wd);
    if(!bucket) continue;
    bucket.total++;
    if(!isDayComplete(s, d)) bucket.misses++;
  }
  return ORDER.map(k => {
    const b = buckets.get(k);
    const missPct = b.total > 0 ? Math.round((b.misses / b.total) * 100) : 0;
    return {
      key: k,
      label: LABELS[k][0],
      short: LABELS[k][1],
      misses: b.misses,
      total: b.total,
      missPct,
    };
  });
}

/**
 * Wire the GENERATE CARD button. Idempotent — replaces the listener on
 * each rerender so it always points at the latest state snapshot. We
 * re-fetch state at click time anyway, so the closure capture isn't
 * load-bearing.
 *
 * @param {import('./state.js').State} _s  Unused; we re-fetch via getState().
 */
function wireShareCardButton(_s){
  const btn = document.getElementById('btn-generate-card');
  if(!btn) return;
  if(btn._wired) return;
  btn._wired = true;
  btn.addEventListener('click', () => {
    const live = getState();
    if(!live) return;
    downloadCard(live);
  });
}

/**
 * Render the BODY TRANSFORMATION card on the Stats tab. Shows
 * first → last measurement delta per metric. Hides itself entirely
 * when no metric has ≥ 2 logged days.
 * @param {import('./state.js').State} s
 */
function renderBodyTransformation(s){
  const host = document.getElementById('stats-body-transform');
  if(!host) return;
  const diff = getMeasurementsDiff(s);
  if(!diff.length){
    host.innerHTML = '';
    return;
  }
  const fmt = (n) => (n > 0 ? '+' + n : '' + n);
  const rows = diff.map(d => {
    const cls = d.delta < 0 ? 'good' : (d.delta > 0 ? 'up' : 'flat');
    return `
      <div class="bt-row">
        <span class="bt-label">${d.label}</span>
        <span class="bt-vals">${d.first.toFixed(1)} → ${d.last.toFixed(1)}</span>
        <span class="bt-delta ${cls}">${fmt(d.delta)} in</span>
      </div>`;
  }).join('');
  host.innerHTML = `
    <div class="chart-title">// BODY TRANSFORMATION</div>
    <div class="bt-list">${rows}</div>
  `;
}

/**
 * Render the 7-day rolling-average wellbeing mini-chart trio.
 * Hides itself when no day has wellbeing data.
 * @param {import('./state.js').State} s
 */
function renderWellbeingTrend(s){
  const host = document.getElementById('stats-wellbeing');
  if(!host) return;
  const series = [
    {key:'mood',       label:'MOOD',       color:'#f5c400'},
    {key:'energy',     label:'ENERGY',     color:'#00e676'},
    {key:'discipline', label:'DISCIPLINE', color:'#ff3c00'},
  ].map(d => ({...d, data: buildWellbeingTrend(s, d.key)}));
  const anyData = series.some(d => d.data.length > 0);
  if(!anyData){
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `
    <div class="chart-title">// WELLBEING TREND — 7-DAY ROLLING AVG (1-5)</div>
    <div class="wb-trend-grid">
      ${series.map(s2 => `
        <div class="wb-trend-col">
          <div class="wb-trend-label" style="color:${s2.color}">${s2.label}</div>
          <div class="chart-bars wb-trend-bars" id="wb-trend-${s2.key}"></div>
        </div>`).join('')}
    </div>
  `;
  series.forEach(d => {
    renderBarChartFixed('wb-trend-'+d.key, d.data, d.color, v => v.toFixed(1), 5);
  });
}

/**
 * Render the WORKOUT BREAKDOWN card — top 3 most-frequent
 * type+location combinations across the challenge. Each w1 and w2
 * slot per day counts as one workout. Workouts with both type and
 * location blank are ignored.
 * @param {import('./state.js').State} s
 */
function renderWorkoutBreakdown(s){
  const host = document.getElementById('stats-workout-breakdown');
  if(!host) return;
  const counts = new Map();
  const today = calcCurrentDay();
  for(let d = 1; d <= today; d++){
    const dd = getDayData(s, d);
    for(const slot of [1,2]){
      const t = (dd['w'+slot+'type']||'').trim();
      const l = (dd['w'+slot+'location']||'').trim();
      if(!t && !l) continue;
      const key = (t||'?') + ' @ ' + (l||'?');
      counts.set(key, (counts.get(key)||0) + 1);
    }
  }
  if(counts.size === 0){
    host.innerHTML = '';
    return;
  }
  const top = [...counts.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, 3);
  const rows = top.map(([k,n]) =>
    `<div class="wb-row"><span class="bt-label">${k}</span><span class="bt-delta">${n}</span></div>`,
  ).join('');
  host.innerHTML = `
    <div class="chart-title">// WORKOUT BREAKDOWN — TOP 3</div>
    <div class="bt-list">${rows}</div>
  `;
}

/**
 * Render the FAILURE LOG section — every day with a recorded reason.
 * Hides itself when empty.
 * @param {import('./state.js').State} s
 */
function renderFailureLog(s){
  const host = document.getElementById('stats-failure-log');
  if(!host) return;
  const entries = getFailureLog(s);
  if(!entries.length){
    host.innerHTML = '';
    return;
  }
  const rows = entries.map(e =>
    `<div class="fl-row"><span class="fl-day">Day ${e.day}</span><span class="fl-reason">— ${escapeHtml(e.reason)}</span></div>`,
  ).join('');
  host.innerHTML = `
    <div class="chart-title">// FAILURE LOG</div>
    <div class="fl-list">${rows}</div>
  `;
}

/**
 * Light HTML escape for user-entered text rendered into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str){
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * Bar-chart variant that uses a fixed maximum (rather than the data
 * max) so e.g. wellbeing trends always render on a stable 1-5 axis.
 * @param {string} containerId
 * @param {{label:string,value:number}[]} data
 * @param {string} color
 * @param {(v:number)=>string} tipFn
 * @param {number} max
 */
function renderBarChartFixed(containerId,data,color,tipFn,max){
  const c=document.getElementById(containerId);if(!c)return;c.innerHTML='';
  if(!data.length){c.innerHTML='<div style="font-family:var(--font-m);font-size:0.55rem;color:var(--text3);letter-spacing:0.1em;">No data yet</div>';return;}
  const cap=Math.max(max,1);
  data.forEach(d=>{
    const bar=document.createElement('div');
    bar.className='chart-bar';
    const h=Math.max(2,Math.round((Math.min(d.value,cap)/cap)*60));
    bar.style.height=h+'px';
    bar.style.background=color;
    bar.style.opacity='0.7';
    bar.setAttribute('data-tip',d.label+': '+tipFn(d.value));
    c.appendChild(bar);
  });
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
