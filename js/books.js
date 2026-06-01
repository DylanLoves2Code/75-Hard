/** @file Renders and persists the book-reading log on the Books tab. */
import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';
import { emit } from './bus.js';

/**
 * Re-render the book-log list and total-pages counter into the DOM.
 * Also pre-fills the title input with the most recent book.
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function renderBooks(s){
  let total=0;
  const log=document.getElementById('book-log');
  // Tear down any pending delete-confirm document-level listeners
  // before we tear down their host buttons.
  log.querySelectorAll('.btn-row.del').forEach(b=>{
    if(typeof b._cleanup==='function')b._cleanup();
  });
  log.innerHTML='';

  const lastEntry=Object.keys(s.books||{}).sort((a,b)=>+b-+a)[0];
  if(lastEntry&&s.books[lastEntry]){
    const last=s.books[lastEntry];
    if(last.title)document.getElementById('book-title-input').value=last.title;
  }

  const entries=Object.keys(s.books||{}).sort((a,b)=>+a-+b);
  entries.forEach(d=>{
    const e=s.books[d];if(!e)return;
    total+=e.pages||0;
    const row=buildBookRow(d,e);
    log.appendChild(row);
  });
  document.getElementById('total-pages-read').textContent=total;
}

/**
 * Build a single book-log row DOM element with inline edit + delete.
 * @param {string} day  Day index, as the string key used in `s.books`.
 * @param {{title:string,pages:number}} entry
 * @returns {HTMLElement}
 */
function buildBookRow(day,entry){
  const row=document.createElement('div');
  row.className='book-log-row';
  row.dataset.day=day;
  renderBookRowDisplay(row,day,entry);
  return row;
}

/**
 * Populate `row` with the read-only display layout (title, day, pages,
 * EDIT / ✕ actions). Idempotent — used after a cancel or commit.
 */
function renderBookRowDisplay(row,day,entry){
  row.innerHTML='';
  const main=document.createElement('div');
  main.className='book-log-main';
  const titleEl=document.createElement('div');
  titleEl.className='book-log-title';
  titleEl.textContent=entry.title||'(No title)';
  const dayEl=document.createElement('div');
  dayEl.className='book-log-day';
  dayEl.textContent='DAY '+day;
  main.appendChild(titleEl);
  main.appendChild(dayEl);

  const pagesEl=document.createElement('div');
  pagesEl.className='book-log-pages';
  pagesEl.textContent=(entry.pages||0)+'p';

  const actions=document.createElement('div');
  actions.className='book-log-actions';
  const editBtn=document.createElement('button');
  editBtn.type='button';
  editBtn.className='btn-row edit';
  editBtn.textContent='[ EDIT ]';
  editBtn.setAttribute('aria-label','Edit day '+day+' book entry');
  editBtn.addEventListener('click',e=>{e.stopPropagation();startEditRow(row,day,entry);});
  const delBtn=document.createElement('button');
  delBtn.type='button';
  delBtn.className='btn-row del';
  delBtn.textContent='[ ✕ ]';
  delBtn.setAttribute('aria-label','Delete day '+day+' book entry');
  delBtn.addEventListener('click',e=>{e.stopPropagation();startDeleteConfirm(row,day,delBtn);});
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  row.appendChild(main);
  row.appendChild(pagesEl);
  row.appendChild(actions);
}

/**
 * Swap row into edit mode — replaces the title + pages display with two
 * compact inputs. Enter / blur commits; Escape cancels.
 */
function startEditRow(row,day,entry){
  // Tear down any pending delete-confirm on the row before we
  // replace its contents, so the document-level outside-click
  // listener doesn't leak.
  row.querySelectorAll('.btn-row.del').forEach(b=>{
    if(typeof b._cleanup==='function')b._cleanup();
  });
  row.innerHTML='';
  const titleInput=document.createElement('input');
  titleInput.type='text';
  titleInput.className='book-log-edit-title';
  titleInput.value=entry.title||'';
  titleInput.setAttribute('aria-label','Book title for day '+day);

  const pagesInput=document.createElement('input');
  pagesInput.type='number';
  pagesInput.className='book-log-edit-pages';
  pagesInput.min='0';pagesInput.max='9999';
  pagesInput.value=String(entry.pages||0);
  pagesInput.setAttribute('aria-label','Pages for day '+day);

  row.appendChild(titleInput);
  row.appendChild(pagesInput);

  let finished=false;
  const cancel=()=>{
    if(finished)return;finished=true;
    // Repopulate from latest state in case something else mutated it.
    const s=getState();
    const latest=(s.books&&s.books[day])||entry;
    renderBookRowDisplay(row,day,latest);
  };
  const commit=()=>{
    if(finished)return;finished=true;
    const newTitle=titleInput.value.trim();
    const newPages=parseInt(pagesInput.value)||0;
    const s=getState();
    if(!s.books)s.books={};
    s.books[day]={title:newTitle,pages:newPages};
    saveState(s);
    emit('state:changed',s);
    showToast('Book entry updated');
  };

  titleInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();commit();}
    else if(e.key==='Escape'){e.preventDefault();cancel();}
  });
  pagesInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();commit();}
    else if(e.key==='Escape'){e.preventDefault();cancel();}
  });
  // Commit on blur, but only when focus has truly left the row (so
  // tabbing between the two inputs doesn't fire commit).
  const blurHandler=()=>{
    setTimeout(()=>{
      if(finished)return;
      if(!row.contains(document.activeElement))commit();
    },0);
  };
  titleInput.addEventListener('blur',blurHandler);
  pagesInput.addEventListener('blur',blurHandler);

  titleInput.focus();
  titleInput.select();
}

/**
 * Inline delete confirm: the `[ ✕ ]` button morphs into `[ DELETE? ]`.
 * Clicking it again commits the delete; clicking outside the row
 * cancels. Matches the "small inline pattern, no full modal" spec.
 */
function startDeleteConfirm(row,day,delBtn){
  // If already in confirm state, this click is the commit. The
  // outside-click listener that the first click registered is removed
  // from `delBtn` via the `_cleanup` reference we stashed on it.
  if(delBtn.classList.contains('confirm-del')){
    if(typeof delBtn._cleanup==='function')delBtn._cleanup();
    const s=getState();
    if(s.books&&s.books[day]){
      delete s.books[day];
      saveState(s);
      emit('state:changed',s);
      showToast('Book entry deleted');
    }
    return;
  }
  delBtn.classList.add('confirm-del');
  delBtn.textContent='[ DELETE? ]';
  delBtn.setAttribute('aria-label','Confirm delete day '+day);

  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;cleaned=true;
    document.removeEventListener('click',outsideHandler,true);
    delBtn._cleanup=null;
    // Restore button only if it still exists in the DOM (a full
    // rerender may have already replaced the row).
    if(document.body.contains(row)&&row.contains(delBtn)){
      delBtn.classList.remove('confirm-del');
      delBtn.textContent='[ ✕ ]';
      delBtn.setAttribute('aria-label','Delete day '+day+' book entry');
    }
  };
  const outsideHandler=(ev)=>{
    if(row.contains(ev.target))return;
    cleanup();
  };
  delBtn._cleanup=cleanup;
  // Capture phase so we see clicks before they bubble.
  document.addEventListener('click',outsideHandler,true);
}

/**
 * Persist the title/pages inputs into today's book entry, then re-render.
 * @returns {void}
 */
export function saveBookEntry(){
  const s=getState();const day=calcCurrentDay();
  if(!s.books)s.books={};
  const title=document.getElementById('book-title-input').value.trim();
  const pages=parseInt(document.getElementById('book-pages-input').value)||0;
  s.books[day]={title,pages};
  saveState(s);renderBooks(s);showToast('Book entry saved');
}
