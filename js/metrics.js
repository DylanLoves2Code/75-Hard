/** @file Daily weight + sleep inputs on the Today tab. */
import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';
import { renderStats } from './stats.js';
import { getSettings, lbsToKg, kgToLbs } from './settings.js';

/**
 * Pre-fill the weight + sleep input fields for the given day.
 *
 * Weight is always STORED in lbs (canonical). When the user has chosen
 * the kg unit, the input is shown in kg (converted on display, converted
 * back on save). The label and placeholder are updated to match.
 *
 * Also drives the empty-state hint under the section title — shown
 * until the user has saved either weight or sleep for today.
 *
 * @param {import('./state.js').State} s
 * @param {number} day
 * @returns {void}
 */
export function renderMetricInputs(s,day){
  const m=s.metrics&&s.metrics[day]||{};
  const settings=getSettings();
  const unit=settings.weightUnit==='kg'?'kg':'lbs';
  const input=document.getElementById('weight-input');

  // Update label + placeholder + min/max to match the chosen unit.
  const labelEl=input.parentElement&&input.parentElement.querySelector('.metric-label');
  if(labelEl)labelEl.textContent=unit==='kg'?'⚖️ Weight (kg)':'⚖️ Weight (lbs)';
  if(unit==='kg'){
    input.placeholder='84';
    input.min='23';input.max='230';
  }else{
    input.placeholder='185';
    input.min='50';input.max='500';
  }

  if(m.weight){
    input.value=unit==='kg'?lbsToKg(m.weight):m.weight;
  } else {
    input.value='';
  }
  if(m.sleep)document.getElementById('sleep-input').value=m.sleep;
  else document.getElementById('sleep-input').value='';

  const isToday=day===calcCurrentDay();
  const hasAny=(m.weight!=null&&m.weight!=='')||(m.sleep!=null&&m.sleep!=='');
  renderMetricsHint(isToday,hasAny);
}

/**
 * Insert / remove the "// LOG WEIGHT + SLEEP DAILY FOR TREND DATA"
 * hint. Shown only on the current day and only until something has
 * been saved.
 * @param {boolean} isToday
 * @param {boolean} hasAny
 */
function renderMetricsHint(isToday,hasAny){
  const wrap=document.getElementById('weight-input');
  if(!wrap)return;
  const section=wrap.closest('.section');
  if(!section)return;
  let hint=section.querySelector('.section-hint[data-hint="metrics"]');
  if(isToday&&!hasAny){
    if(!hint){
      hint=document.createElement('div');
      hint.className='section-hint';
      hint.dataset.hint='metrics';
      hint.textContent='// LOG WEIGHT + SLEEP DAILY FOR TREND DATA';
      const title=section.querySelector('.section-title');
      title.insertAdjacentElement('afterend',hint);
    }
  } else if(hint){
    hint.remove();
  }
}

/**
 * Persist the weight + sleep inputs into today's metrics and refresh stats.
 *
 * The weight input is interpreted in the unit picked in settings; we
 * convert kg back to lbs before storing so internal data is always lbs.
 *
 * @returns {void}
 */
export function saveMetrics(){
  const s=getState();const day=calcCurrentDay();
  if(!s.metrics)s.metrics={};
  const settings=getSettings();
  const rawW=parseFloat(document.getElementById('weight-input').value);
  let w=null;
  if(Number.isFinite(rawW)&&rawW>0){
    w=settings.weightUnit==='kg'?kgToLbs(rawW):rawW;
  }
  const sl=parseFloat(document.getElementById('sleep-input').value)||null;
  s.metrics[day]={weight:w,sleep:sl};
  saveState(s);
  showToast('Metrics saved');
  // Rerender the input row so the empty-state hint disappears once
  // something has been saved.
  renderMetricInputs(s,day);
  renderStats(s);
}
