import { getState, getDateForDay, formatDate, calcCurrentDay } from './state.js';
import { renderTaskList } from './tasks.js';
import { renderAll } from './main.js';

export function openModal(day){
  const s=getState();
  const date=getDateForDay(day);
  document.getElementById('modal-title').textContent='DAY '+day;
  document.getElementById('modal-date').textContent=formatDate(date).toUpperCase();
  renderTaskList(s,day,'modal-task-list',day===calcCurrentDay());
  const note=s.notes&&s.notes[day]||'';
  document.getElementById('modal-note-wrap').style.display=note?'block':'none';
  document.getElementById('modal-note-text').textContent=note;
  document.getElementById('modal-overlay').classList.add('open');
}

export function closeModal(e){if(e.target===document.getElementById('modal-overlay'))closeModalDirect();}

export function closeModalDirect(){
  document.getElementById('modal-overlay').classList.remove('open');
  const s=getState();renderAll(s);
}
