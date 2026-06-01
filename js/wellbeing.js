/**
 * @file Wellbeing self-ratings (mood / energy / discipline) — three
 * 1-5 sliders on the Today tab. Stored as `s.days[d].wellbeing` with
 * each rating either an integer 1..5 or `null` (not logged yet).
 *
 * Sliders auto-save on `change` (no separate save button) so the
 * 30-second-log promise from the design holds.
 */
import { getState, saveState, getDayData, updateDayData, calcCurrentDay } from './state.js';
import { emit } from './bus.js';

/** Ordered list of wellbeing fields. */
const FIELDS = [
  {key:'mood',       label:'Mood',       color:'var(--gold)'},
  {key:'energy',     label:'Energy',     color:'var(--green)'},
  {key:'discipline', label:'Discipline', color:'var(--accent)'},
];

/**
 * Render (or re-render) the wellbeing slider block into the Today tab.
 * Each slider is independent — moving one persists immediately on
 * the `change` event.
 *
 * @param {import('./state.js').State} s
 * @param {number} day
 * @returns {void}
 */
export function renderWellbeingInputs(s, day){
  const wrap = document.getElementById('wellbeing-section');
  if(!wrap) return;
  const dd = getDayData(s, day);
  const wb = (dd.wellbeing && typeof dd.wellbeing === 'object') ? dd.wellbeing : {};
  const isFuture = day > calcCurrentDay();

  const rows = FIELDS.map(f => {
    const raw = wb[f.key];
    const val = (raw===null||raw===undefined) ? '' : String(raw);
    const display = val === '' ? '—' : val;
    return `
      <div class="wb-row">
        <label class="wb-label" for="wb-${f.key}">
          <span>${f.label}</span>
          <span class="wb-val" data-wb-val="${f.key}" style="color:${f.color}">${display}</span>
        </label>
        <input type="range" id="wb-${f.key}" class="wb-slider" data-wbkey="${f.key}"
               min="1" max="5" step="1"
               value="${val===''?'3':val}"
               data-empty="${val===''?'1':'0'}"
               ${isFuture?'disabled':''}
               aria-label="${f.label} rating, 1 to 5">
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="section-title">WELLBEING</div>
    <div class="wb-grid">${rows}</div>
    <div class="wb-hint">// 1 = LOW, 5 = HIGH — TAP TO RATE</div>
  `;

  if(isFuture) return;
  wrap.querySelectorAll('.wb-slider').forEach(sl => {
    sl.addEventListener('input', () => {
      const k = sl.dataset.wbkey;
      const valEl = wrap.querySelector(`[data-wb-val="${k}"]`);
      if(valEl) valEl.textContent = sl.value;
      sl.dataset.empty = '0';
    });
    sl.addEventListener('change', () => saveWellbeing());
  });
}

/**
 * Persist the current slider positions into today's `wellbeing`.
 *
 * A slider that the user has never moved (data-empty="1") writes
 * `null` for that field so the Stats average doesn't get poisoned
 * by a sneaky "3 from the default position".
 * @returns {void}
 */
export function saveWellbeing(){
  const s = getState();
  if(!s) return;
  const day = calcCurrentDay();
  const wrap = document.getElementById('wellbeing-section');
  if(!wrap) return;
  const next = {mood:null, energy:null, discipline:null};
  wrap.querySelectorAll('.wb-slider').forEach(sl => {
    const k = sl.dataset.wbkey;
    if(sl.dataset.empty === '1') return;
    const n = parseInt(sl.value, 10);
    if(Number.isFinite(n) && n>=1 && n<=5) next[k] = n;
  });
  updateDayData(s, day, {wellbeing: next});
  saveState(s);
  emit('state:stats', s);
}

/**
 * Build a 7-day rolling-average series across the challenge for one
 * wellbeing dimension. Pure helper — used by the Stats tab.
 *
 * @param {import('./state.js').State} s
 * @param {'mood'|'energy'|'discipline'} key
 * @returns {{label:string,value:number}[]} day-indexed series of averages.
 */
export function buildWellbeingTrend(s, key){
  const today = calcCurrentDay();
  const data = [];
  if(!s || !s.days) return data;
  for(let d=1; d<=today; d++){
    let sum = 0, n = 0;
    for(let k=Math.max(1, d-6); k<=d; k++){
      const dd = s.days[k];
      const v = dd && dd.wellbeing && dd.wellbeing[key];
      if(Number.isFinite(v)){ sum += v; n++; }
    }
    if(n>0) data.push({label:'D'+d, value: Math.round((sum/n) * 10) / 10});
  }
  return data;
}
