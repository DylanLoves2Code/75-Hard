import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';

export function renderNoteInput(s,day){
  const note=s.notes&&s.notes[day]||'';
  document.getElementById('notes-input').value=note;
}

export function saveNote(){
  const s=getState();const day=calcCurrentDay();
  if(!s.notes)s.notes={};
  s.notes[day]=document.getElementById('notes-input').value;
  saveState(s);showToast('Note saved');
}
