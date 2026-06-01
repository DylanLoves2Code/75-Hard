import { getState, saveState, calcCurrentWeek } from './state.js';
import { showToast } from './toast.js';

export function renderDrinksLog(s){
  const c=document.getElementById('drinks-log');c.innerHTML='';
  const weeks=Object.keys(s.drinks).sort((a,b)=>+a-+b);
  if(!weeks.length)return;
  weeks.forEach(w=>{
    const count=s.drinks[w];const over=count>15;
    const el=document.createElement('div');
    el.className='drink-entry'+(over?' warning':'');
    el.innerHTML=`<span class="drink-week">WK ${String(w).padStart(2,'0')}</span><span class="drink-count${over?' over':''}">${count} drinks${over?' ⚠':''}</span>`;
    c.appendChild(el);
  });
}

export function logDrinks(){
  const val=parseInt(document.getElementById('drinks-input').value)||0;
  const week=calcCurrentWeek();
  const s=getState();s.drinks[week]=Math.max(0,Math.min(50,val));
  saveState(s);renderDrinksLog(s);showToast('Week '+week+' logged');
}
