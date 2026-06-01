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
  const meter=document.getElementById('water-meter');
  meter.innerHTML='';
  const maxH=60;
  for(let i=0;i<WATER_CUPS;i++){
    const bar=document.createElement('div');
    bar.className='water-cup'+(i<cups?' filled':'');
    bar.style.height=((i+1)/WATER_CUPS*maxH)+'px';
    bar.title=(i+1)*8+' oz';
    bar.setAttribute('role','button');
    bar.setAttribute('aria-label',`8 oz cup ${i+1}`);
    bar.setAttribute('aria-pressed',i<cups?'true':'false');
    if(!isFuture){
      bar.setAttribute('tabindex','0');
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
      bar.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){
          e.preventDefault();
          activate();
        }
      });
    }
    meter.appendChild(bar);
  }
  document.getElementById('water-oz-total').textContent=cups*8;
}
