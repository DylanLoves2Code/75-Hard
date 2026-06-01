/** @file Daily weight + sleep inputs on the Today tab. */
import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';
import { renderStats } from './stats.js';

/**
 * Pre-fill the weight + sleep input fields for the given day.
 * Also drives the empty-state hint under the section title — shown
 * until the user has saved either weight or sleep for today.
 * @param {import('./state.js').State} s
 * @param {number} day
 * @returns {void}
 */
export function renderMetricInputs(s,day){
  const m=s.metrics&&s.metrics[day]||{};
  if(m.weight)document.getElementById('weight-input').value=m.weight;
  else document.getElementById('weight-input').value='';
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
 * @returns {void}
 */
export function saveMetrics(){
  const s=getState();const day=calcCurrentDay();
  if(!s.metrics)s.metrics={};
  const w=parseFloat(document.getElementById('weight-input').value)||null;
  const sl=parseFloat(document.getElementById('sleep-input').value)||null;
  s.metrics[day]={weight:w,sleep:sl};
  saveState(s);
  showToast('Metrics saved');
  // Rerender the input row so the empty-state hint disappears once
  // something has been saved.
  renderMetricInputs(s,day);
  renderStats(s);
}
