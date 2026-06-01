/** @file Tappable 16-cup hydration meter on the Today tab. */
import { WATER_CUPS } from './constants.js';
import { getState, saveState, getDayData, updateDayData, calcCurrentDay } from './state.js';
import { checkCompletionAnimation } from './confetti.js';
import { emit } from './bus.js';

/**
 * Render the 16-cup water meter for the given day. Clicking cup `i`
 * either fills up to that cup or clears it if already filled.
 * @param {import('./state.js').State} s
 * @param {number} day
 * @returns {void}
 */
export function renderWaterMeter(s,day){
  const dd=getDayData(s,day);
  const cups=dd.waterCups||0;
  const isFuture=day>calcCurrentDay();
  const isToday=day===calcCurrentDay();
  const meter=document.getElementById('water-meter');
  meter.innerHTML='';
  const maxH=60;
  for(let i=0;i<WATER_CUPS;i++){
    const bar=document.createElement('button');
    bar.type='button';
    bar.className='water-cup'+(i<cups?' filled':'');
    bar.style.height=((i+1)/WATER_CUPS*maxH)+'px';
    bar.title=(i+1)*8+' oz';
    bar.setAttribute('aria-label',`8 oz cup ${i+1}`);
    bar.setAttribute('aria-pressed',i<cups?'true':'false');
    if(!isFuture){
      const activate=()=>{
        const s2=getState();
        const d2=getDayData(s2,day);
        const newCups=(i<d2.waterCups)?i:(i+1);
        updateDayData(s2,day,{waterCups:newCups,water:newCups>=WATER_CUPS});
        saveState(s2);
        if(day===calcCurrentDay()){checkCompletionAnimation(s2,day);emit('state:changed',s2);}
        else{renderWaterMeter(s2,day);emit('state:grid',s2);}
      };
      bar.addEventListener('click',activate);
    } else {
      bar.disabled=true;
    }
    meter.appendChild(bar);
  }
  document.getElementById('water-oz-total').textContent=cups*8;

  // Empty-state hint + quick-add buttons live on the Today tab only,
  // and the hint vanishes the moment the user logs anything.
  renderHydrationHint(isToday,cups);
  renderWaterQuickAdd(day,isToday,cups);
}

/**
 * Insert / remove the "// TAP A CUP TO LOG WATER ..." hint under the
 * hydration section title. Only shown on the current day, and only when
 * no cups have been filled yet.
 * @param {boolean} isToday
 * @param {number} cups
 */
function renderHydrationHint(isToday,cups){
  const meter=document.getElementById('water-meter');
  const section=meter.closest('.section');
  if(!section)return;
  let hint=section.querySelector('.section-hint[data-hint="hydration"]');
  if(isToday&&cups===0){
    if(!hint){
      hint=document.createElement('div');
      hint.className='section-hint';
      hint.dataset.hint='hydration';
      hint.textContent='// TAP A CUP TO LOG WATER — 16 CUPS = 1 GALLON';
      const title=section.querySelector('.section-title');
      title.insertAdjacentElement('afterend',hint);
    }
  } else if(hint){
    hint.remove();
  }
}

/**
 * Render the three +8 / +16 / +24 oz quick-add buttons immediately
 * below the water-label-row. Caps total cups at WATER_CUPS.
 * @param {number} day
 * @param {boolean} isToday
 * @param {number} cups
 */
function renderWaterQuickAdd(day,isToday,cups){
  const meter=document.getElementById('water-meter');
  const section=meter.closest('.section');
  if(!section)return;
  let row=section.querySelector('.water-quickadd');
  if(!isToday){
    // Quick-add is a Today-only convenience. On past/future renders we
    // just clear the row if it was ever placed.
    if(row)row.remove();
    return;
  }
  if(!row){
    row=document.createElement('div');
    row.className='water-quickadd';
    [8,16,24].forEach(oz=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='btn-quick';
      b.dataset.oz=String(oz);
      b.textContent='+ '+oz+' OZ';
      b.setAttribute('aria-label','Add '+oz+' ounces of water');
      b.addEventListener('click',()=>addOunces(day,oz));
      row.appendChild(b);
    });
    // Place after the water-label-row inside the same section.
    const labelRow=section.querySelector('.water-label-row');
    if(labelRow){
      labelRow.insertAdjacentElement('afterend',row);
    } else {
      section.appendChild(row);
    }
  }
  // Disable buttons that would have no effect (already at cap).
  const atCap=cups>=WATER_CUPS;
  row.querySelectorAll('.btn-quick').forEach(b=>{b.disabled=atCap;});
}

/**
 * Add `oz` ounces to the day's water log (1 cup = 8 oz). Caps the
 * resulting cup count at WATER_CUPS so we never overflow.
 * @param {number} day
 * @param {number} oz
 */
function addOunces(day,oz){
  const s=getState();
  const dd=getDayData(s,day);
  const current=dd.waterCups||0;
  const add=Math.floor(oz/8);
  const newCups=Math.min(WATER_CUPS,current+add);
  if(newCups===current)return;
  updateDayData(s,day,{waterCups:newCups,water:newCups>=WATER_CUPS});
  saveState(s);
  checkCompletionAnimation(s,day);
  emit('state:changed',s);
}
