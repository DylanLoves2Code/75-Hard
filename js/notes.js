/** @file Free-form daily field-notes input on the Today tab. */
import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';

/**
 * Populate the notes textarea with the saved note for `day`.
 * @param {import('./state.js').State} s
 * @param {number} day
 * @returns {void}
 */
export function renderNoteInput(s,day){
  const note=s.notes&&s.notes[day]||'';
  document.getElementById('notes-input').value=note;
}

/** Persist the notes textarea contents into today's note. @returns {void} */
export function saveNote(){
  const s=getState();const day=calcCurrentDay();
  if(!s.notes)s.notes={};
  s.notes[day]=document.getElementById('notes-input').value;
  saveState(s);showToast('Note saved');
}
