import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';
import { renderStats } from './stats.js';

export function renderMetricInputs(s,day){
  const m=s.metrics&&s.metrics[day]||{};
  if(m.weight)document.getElementById('weight-input').value=m.weight;
  else document.getElementById('weight-input').value='';
  if(m.sleep)document.getElementById('sleep-input').value=m.sleep;
  else document.getElementById('sleep-input').value='';
}

export function saveMetrics(){
  const s=getState();const day=calcCurrentDay();
  if(!s.metrics)s.metrics={};
  const w=parseFloat(document.getElementById('weight-input').value)||null;
  const sl=parseFloat(document.getElementById('sleep-input').value)||null;
  s.metrics[day]={weight:w,sleep:sl};
  saveState(s);
  showToast('Metrics saved');
  renderStats(s);
}
