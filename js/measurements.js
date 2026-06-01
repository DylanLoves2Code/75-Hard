/**
 * @file Body measurements (waist/chest/hips/arms/thighs/neck) — a
 * v4 deeper-tracking addition. Weight alone misses recomposition, so
 * the Today tab exposes a collapsible "BODY MEASUREMENTS" block, and
 * the Stats tab shows the first → latest delta per metric.
 *
 * All values are stored in inches and are optional per day. Only the
 * fields the user actually entered are persisted to `s.days[d].measurements`.
 */
import { getState, saveState, getDayData, updateDayData, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';
import { emit } from './bus.js';

/** Ordered list of measurement field keys + display labels. */
const FIELDS = [
  {key:'waist',  label:'Waist'},
  {key:'chest',  label:'Chest'},
  {key:'hips',   label:'Hips'},
  {key:'arms',   label:'Arms'},
  {key:'thighs', label:'Thighs'},
  {key:'neck',   label:'Neck'},
];

/** Whether the measurement block is currently folded open. UI-only state. */
let expanded = false;

/**
 * Render (or re-render) the "BODY MEASUREMENTS" section into the Today
 * tab. The section is collapsible — folded by default — so it doesn't
 * crowd vertical space on days the user doesn't log measurements.
 *
 * @param {import('./state.js').State} s
 * @param {number} day  The day index to render inputs for.
 * @returns {void}
 */
export function renderMeasurements(s, day){
  const wrap = document.getElementById('measurements-section');
  if(!wrap) return;
  const dd = getDayData(s, day);
  const m = (dd.measurements && typeof dd.measurements === 'object') ? dd.measurements : {};
  const isFuture = day > calcCurrentDay();
  const inputs = FIELDS.map(f => {
    const v = m[f.key];
    const val = (v===null||v===undefined||v==='') ? '' : String(v);
    return `
      <div class="measurement-input-wrap">
        <span class="measurement-label">${f.label} (in)</span>
        <input type="number" class="measurement-input" data-mkey="${f.key}"
               min="0" max="200" step="0.1" value="${val}"
               ${isFuture?'disabled':''} aria-label="${f.label} in inches">
      </div>`;
  }).join('');
  wrap.innerHTML = `
    <button type="button" class="measurements-toggle" id="measurements-toggle"
            aria-expanded="${expanded?'true':'false'}" aria-controls="measurements-body">
      <span class="measurements-title">BODY MEASUREMENTS</span>
      <span class="measurements-chevron">${expanded?'[ - ]':'[ + ]'}</span>
    </button>
    <div class="measurements-body" id="measurements-body" style="${expanded?'':'display:none;'}">
      <div class="measurement-grid">${inputs}</div>
      <button type="button" class="btn-sm" id="measurements-save"
              ${isFuture?'disabled':''}>SAVE MEASUREMENTS</button>
    </div>
  `;
  const toggle = wrap.querySelector('#measurements-toggle');
  if(toggle){
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      const body = wrap.querySelector('#measurements-body');
      if(body) body.style.display = expanded ? '' : 'none';
      toggle.setAttribute('aria-expanded', expanded?'true':'false');
      const chev = toggle.querySelector('.measurements-chevron');
      if(chev) chev.textContent = expanded ? '[ - ]' : '[ + ]';
    });
  }
  const saveBtn = wrap.querySelector('#measurements-save');
  if(saveBtn && !isFuture){
    saveBtn.addEventListener('click', saveMeasurements);
  }
}

/**
 * Persist whatever's currently in the measurement inputs into today's
 * `s.days[day].measurements`. Only fields the user actually filled in
 * are written — blank inputs are dropped (so prior values may also be
 * dropped if cleared; this matches the user's intent).
 * @returns {void}
 */
export function saveMeasurements(){
  const s = getState();
  if(!s) return;
  const day = calcCurrentDay();
  const wrap = document.getElementById('measurements-section');
  if(!wrap) return;
  const next = {};
  FIELDS.forEach(f => {
    const el = wrap.querySelector(`input[data-mkey="${f.key}"]`);
    if(!el) return;
    const raw = el.value;
    if(raw === '' || raw === null) return;
    const n = parseFloat(raw);
    if(!Number.isFinite(n) || n <= 0) return;
    // Round to one decimal place — measurement precision is roughly
    // 1/8 inch with a tape, no point storing 12 sig figs.
    next[f.key] = Math.round(n * 10) / 10;
  });
  updateDayData(s, day, {measurements: next});
  saveState(s);
  showToast('Measurements saved');
  emit('state:stats', s);
}

/**
 * Compute per-metric body-transformation diffs across the challenge.
 *
 * For each measurement key, finds the earliest day that has the metric
 * recorded and the latest day that has it recorded. Returns the pair
 * plus a signed delta. Metrics with fewer than 2 days of data are
 * omitted from the output entirely.
 *
 * Pure function — does not read globals, does not call the bus. Easy
 * to unit-test in isolation.
 *
 * @param {import('./state.js').State} s
 * @returns {Array<{key:string,label:string,firstDay:number,lastDay:number,first:number,last:number,delta:number}>}
 *          One entry per metric, ordered by FIELDS. Empty array if no
 *          measurements have been entered or no metric has ≥ 2 days.
 */
export function getMeasurementsDiff(s){
  if(!s || !s.days) return [];
  const out = [];
  for(const f of FIELDS){
    const points = [];
    // Numeric day keys; sort ascending to find earliest/latest cleanly.
    const keys = Object.keys(s.days).map(Number).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);
    for(const d of keys){
      const dd = s.days[d];
      if(!dd || !dd.measurements) continue;
      const v = dd.measurements[f.key];
      if(v===null || v===undefined || v==='') continue;
      const n = Number(v);
      if(!Number.isFinite(n)) continue;
      points.push({day:d, val:n});
    }
    if(points.length < 2) continue;
    const first = points[0];
    const last = points[points.length-1];
    const delta = Math.round((last.val - first.val) * 10) / 10;
    out.push({
      key: f.key, label: f.label,
      firstDay: first.day, lastDay: last.day,
      first: first.val, last: last.val,
      delta,
    });
  }
  return out;
}
