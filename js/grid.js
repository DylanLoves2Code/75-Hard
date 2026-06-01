/** @file 75-tile grid view of the entire challenge on the Grid tab. */
import { TOTAL } from './constants.js';
import { getDayData, isDayComplete, calcCurrentDay } from './state.js';
import { openModal } from './modal.js';

/**
 * Render all 75 day tiles, wiring click/keyboard activation on past
 * and current days to open the day-detail modal.
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function renderGrid(s){
  const grid=document.getElementById('day-grid');grid.innerHTML='';
  const today=calcCurrentDay();
  for(let d=1;d<=TOTAL;d++){
    const complete=isDayComplete(s,d);
    const dd=getDayData(s,d);
    // dietAdherence (v3) or legacy calorie satisfy the "any progress" tile.
    const any=dd.dietAdherence||dd.calorie||dd.w1||dd.w2||dd.read||dd.water||dd.photo;
    const future=d>today;const isToday=d===today;
    // Future tiles are non-interactive — keep them as <div>.
    // Past/current tiles open a modal — promote to a real <button>.
    const tile=document.createElement(future?'div':'button');
    if(!future)tile.type='button';
    tile.className='day-tile';
    if(complete)tile.classList.add('complete');
    else if(!future&&any)tile.classList.add('partial');
    if(future)tile.classList.add('future');
    if(isToday)tile.classList.add('today');
    const emoji=complete?'✅':(!future&&any?'🟡':'⬜');
    tile.innerHTML=`<span class="tile-num">${d}</span><span class="tile-emoji">${emoji}</span>`;
    if(!future){
      const status=complete?'complete':(any?'partial':'incomplete');
      tile.setAttribute('aria-label',`Day ${d}, ${status}`);
      tile.addEventListener('click',()=>openModal(d));
    }
    grid.appendChild(tile);
  }
}
