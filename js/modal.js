/** @file Day-detail modal opened from grid tiles. */
import { getState, getDateForDay, formatDate, calcCurrentDay } from './state.js';
import { renderTaskList } from './tasks.js';
import { renderAll } from './main.js';

/**
 * Open the day-detail modal for the given day index.
 * @param {number} day
 * @returns {void}
 */
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

/**
 * Backdrop click handler — only closes when the click is on the overlay itself.
 * @param {MouseEvent} e
 * @returns {void}
 */
export function closeModal(e){if(e.target===document.getElementById('modal-overlay'))closeModalDirect();}

/** Force-close the modal and re-render the app. @returns {void} */
export function closeModalDirect(){
  document.getElementById('modal-overlay').classList.remove('open');
  const s=getState();renderAll(s);
}
