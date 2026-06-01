import { TOTAL } from './constants.js';
import { getDayData, isDayComplete, calcCurrentDay } from './state.js';
import { openModal } from './modal.js';

export function renderGrid(s){
  const grid=document.getElementById('day-grid');grid.innerHTML='';
  const today=calcCurrentDay();
  for(let d=1;d<=TOTAL;d++){
    const tile=document.createElement('div');
    const complete=isDayComplete(s,d);
    const dd=getDayData(s,d);
    const any=dd.calorie||dd.w1||dd.w2||dd.read||dd.water||dd.photo;
    const future=d>today;const isToday=d===today;
    tile.className='day-tile';
    if(complete)tile.classList.add('complete');
    else if(!future&&any)tile.classList.add('partial');
    if(future)tile.classList.add('future');
    if(isToday)tile.classList.add('today');
    const emoji=complete?'✅':(!future&&any?'🟡':'⬜');
    tile.innerHTML=`<span class="tile-num">${d}</span><span class="tile-emoji">${emoji}</span>`;
    if(!future)tile.addEventListener('click',()=>openModal(d));
    grid.appendChild(tile);
  }
}
