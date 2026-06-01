/** @file Renders and persists the book-reading log on the Books tab. */
import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';
import { emit } from './bus.js';
import { formatDuration } from './timer.js';
import { fireConfetti } from './confetti.js';

/** Reading-pomodoro length in seconds (item 37). */
const POMODORO_SECONDS = 15 * 60;

/** Sub-view selector — null/`'log'` for the book log, `'quotes'` for the vault. */
let booksSubview = 'log';

/**
 * Re-render the book-log list and total-pages counter into the DOM.
 * Also pre-fills the title input with the most recent book.
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function renderBooks(s){
  let total=0;
  const log=document.getElementById('book-log');
  if(!log)return;
  // Tear down any pending delete-confirm document-level listeners
  // before we tear down their host buttons.
  log.querySelectorAll('.btn-row.del').forEach(b=>{
    if(typeof b._cleanup==='function')b._cleanup();
  });
  // Also tear down any open quote-form outside-click listeners.
  log.querySelectorAll('.quote-form').forEach(f=>{
    if(typeof f._cleanup==='function')f._cleanup();
  });
  log.innerHTML='';

  const lastEntry=Object.keys(s.books||{}).sort((a,b)=>+b-+a)[0];
  if(lastEntry&&s.books[lastEntry]){
    const last=s.books[lastEntry];
    if(last.title){
      const titleInput=document.getElementById('book-title-input');
      if(titleInput)titleInput.value=last.title;
    }
  }

  const entries=Object.keys(s.books||{}).sort((a,b)=>+a-+b);
  entries.forEach(d=>{
    const e=s.books[d];if(!e)return;
    total+=e.pages||0;
    const row=buildBookRow(d,e);
    log.appendChild(row);
  });
  const totalEl=document.getElementById('total-pages-read');
  if(totalEl)totalEl.textContent=total;

  // Sub-view toggling: when we're showing the quotes vault, hide the log
  // and render the aggregated list. Re-render on every state:changed.
  syncSubviewVisibility();
  if(booksSubview==='quotes')renderQuotesView(s);
}

/**
 * Build a single book-log row DOM element with inline edit + delete.
 * @param {string} day  Day index, as the string key used in `s.books`.
 * @param {{title:string,pages:number,quotes?:Array<{text:string,page?:number}>}} entry
 * @returns {HTMLElement}
 */
function buildBookRow(day,entry){
  const row=document.createElement('div');
  row.className='book-log-row-wrap';
  row.dataset.day=day;
  const inner=document.createElement('div');
  inner.className='book-log-row';
  row.appendChild(inner);
  renderBookRowDisplay(inner,day,entry);
  // Append any saved quotes below the row.
  const quotes=Array.isArray(entry.quotes)?entry.quotes:[];
  if(quotes.length){
    const list=document.createElement('div');
    list.className='book-log-quotes';
    quotes.forEach((q,idx)=>list.appendChild(buildQuoteLine(day,q,idx)));
    row.appendChild(list);
  }
  return row;
}

/**
 * Populate `row` with the read-only display layout (title, day, pages,
 * EDIT / + QUOTE / ✕ actions). Idempotent — used after a cancel or commit.
 */
function renderBookRowDisplay(row,day,entry){
  row.innerHTML='';
  const main=document.createElement('div');
  main.className='book-log-main';
  const titleEl=document.createElement('div');
  titleEl.className='book-log-title';
  // Books default to nonfiction (rules-compliant); a `false` here means
  // the user explicitly opted into fiction. Surface a small grey badge
  // so they can spot non-rules entries in the log without alarm.
  if(entry.nonfiction===false){
    const badge=document.createElement('span');
    badge.className='book-log-badge fiction';
    badge.textContent='FICTION';
    titleEl.appendChild(document.createTextNode((entry.title||'(No title)')+' '));
    titleEl.appendChild(badge);
  } else {
    titleEl.textContent=entry.title||'(No title)';
  }
  const dayEl=document.createElement('div');
  dayEl.className='book-log-day';
  let dayLine='DAY '+day;
  if(entry.audiobookMinutes>0)dayLine+=' • '+entry.audiobookMinutes+'m AUDIO';
  dayEl.textContent=dayLine;
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
  const quoteBtn=document.createElement('button');
  quoteBtn.type='button';
  quoteBtn.className='btn-row quote';
  quoteBtn.textContent='[ + QUOTE ]';
  quoteBtn.setAttribute('aria-label','Add a quote for day '+day);
  quoteBtn.addEventListener('click',e=>{e.stopPropagation();openQuoteForm(row,day);});
  const delBtn=document.createElement('button');
  delBtn.type='button';
  delBtn.className='btn-row del';
  delBtn.textContent='[ ✕ ]';
  delBtn.setAttribute('aria-label','Delete day '+day+' book entry');
  delBtn.addEventListener('click',e=>{e.stopPropagation();startDeleteConfirm(row,day,delBtn);});
  actions.appendChild(editBtn);
  actions.appendChild(quoteBtn);
  actions.appendChild(delBtn);

  row.appendChild(main);
  row.appendChild(pagesEl);
  row.appendChild(actions);
}

/**
 * Build a single saved-quote display line shown below a book row.
 * Includes a small ✕ to delete that quote.
 * @param {string} day
 * @param {{text:string,page?:number}} quote
 * @param {number} idx  Position within the row's quotes array.
 * @returns {HTMLElement}
 */
function buildQuoteLine(day,quote,idx){
  const line=document.createElement('div');
  line.className='book-log-quote';
  const txt=document.createElement('span');
  txt.className='book-log-quote-text';
  txt.textContent='"'+(quote.text||'')+'"';
  line.appendChild(txt);
  if(quote.page!==undefined&&quote.page!==null&&quote.page!==''){
    const page=document.createElement('span');
    page.className='book-log-quote-page';
    page.textContent=' — p.'+quote.page;
    line.appendChild(page);
  }
  const delQ=document.createElement('button');
  delQ.type='button';
  delQ.className='btn-row quote-del';
  delQ.textContent='[ ✕ ]';
  delQ.setAttribute('aria-label','Delete quote '+(idx+1)+' for day '+day);
  delQ.addEventListener('click',e=>{e.stopPropagation();deleteQuote(day,idx);});
  line.appendChild(delQ);
  return line;
}

/**
 * Reveal an inline quote-entry form anchored below the row's
 * action bar (textarea + optional page number + SAVE/CANCEL).
 * Outside click cancels; Escape cancels; Enter on the page input commits.
 */
function openQuoteForm(row,day){
  // Clean up any other open form first so only one is visible at a time.
  document.querySelectorAll('.quote-form').forEach(f=>{
    if(typeof f._cleanup==='function')f._cleanup();
  });
  // If a form is already open under this row, close it (toggle).
  const wrap=row.parentElement;
  const existing=wrap.querySelector(':scope > .quote-form');
  if(existing){
    if(typeof existing._cleanup==='function')existing._cleanup();
    return;
  }
  const form=document.createElement('div');
  form.className='quote-form';
  const ta=document.createElement('textarea');
  ta.className='quote-form-text';
  ta.placeholder='Paste a passage or quote...';
  ta.setAttribute('aria-label','Quote text for day '+day);
  const pageInput=document.createElement('input');
  pageInput.type='number';
  pageInput.className='quote-form-page';
  pageInput.min='0';pageInput.max='99999';
  pageInput.placeholder='page #';
  pageInput.setAttribute('aria-label','Optional page number');
  const saveBtn=document.createElement('button');
  saveBtn.type='button';
  saveBtn.className='btn-row quote-save';
  saveBtn.textContent='[ SAVE ]';
  const cancelBtn=document.createElement('button');
  cancelBtn.type='button';
  cancelBtn.className='btn-row quote-cancel';
  cancelBtn.textContent='[ CANCEL ]';
  const actions=document.createElement('div');
  actions.className='quote-form-actions';
  actions.appendChild(pageInput);
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(ta);
  form.appendChild(actions);

  let finished=false;
  const cleanup=()=>{
    if(finished)return;finished=true;
    document.removeEventListener('click',outsideHandler,true);
    if(form.parentNode)form.parentNode.removeChild(form);
    form._cleanup=null;
  };
  const outsideHandler=(ev)=>{
    if(form.contains(ev.target))return;
    cleanup();
  };
  form._cleanup=cleanup;

  const commit=()=>{
    const text=ta.value.trim();
    if(!text){cleanup();return;}
    const pageRaw=pageInput.value.trim();
    const page=pageRaw===''?undefined:Math.max(0,parseInt(pageRaw,10)||0);
    addQuote(day,text,page);
    cleanup();
  };
  saveBtn.addEventListener('click',commit);
  cancelBtn.addEventListener('click',cleanup);
  ta.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();cleanup();}
  });
  pageInput.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();commit();}
    else if(e.key==='Escape'){e.preventDefault();cleanup();}
  });

  wrap.appendChild(form);
  document.addEventListener('click',outsideHandler,true);
  ta.focus();
}

/**
 * Append a quote to the day's book entry. Emits `state:changed` so
 * the log + quotes vault refresh.
 * @param {string} day
 * @param {string} text
 * @param {number|undefined} page
 */
export function addQuote(day,text,page){
  const s=getState();
  if(!s.books)s.books={};
  const entry=s.books[day];
  if(!entry){
    showToast('Log a book entry first');
    return;
  }
  if(!Array.isArray(entry.quotes))entry.quotes=[];
  const q={text};
  if(page!==undefined&&!Number.isNaN(page))q.page=page;
  entry.quotes.push(q);
  saveState(s);
  emit('state:changed',s);
  showToast('Quote saved');
}

/**
 * Remove a quote at index `idx` from the day's quotes array.
 * @param {string} day
 * @param {number} idx
 */
export function deleteQuote(day,idx){
  const s=getState();
  const entry=s.books&&s.books[day];
  if(!entry||!Array.isArray(entry.quotes))return;
  if(idx<0||idx>=entry.quotes.length)return;
  entry.quotes.splice(idx,1);
  saveState(s);
  emit('state:changed',s);
  showToast('Quote removed');
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

  // Nonfiction toggle (v3+): preserves the existing flag for old entries.
  const nfWrap=document.createElement('label');
  nfWrap.className='book-log-edit-nf';
  const nfInput=document.createElement('input');
  nfInput.type='checkbox';
  nfInput.checked=entry.nonfiction!==false;
  nfInput.setAttribute('aria-label','Nonfiction for day '+day);
  const nfText=document.createElement('span');
  nfText.textContent='NF';
  nfWrap.appendChild(nfInput);
  nfWrap.appendChild(nfText);

  row.appendChild(titleInput);
  row.appendChild(pagesInput);
  row.appendChild(nfWrap);

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
    const prev=s.books[day]||{};
    s.books[day]={
      ...prev,
      title:newTitle,
      pages:newPages,
      nonfiction:nfInput.checked,
      // Preserve v6 fields if present.
      quotes:Array.isArray(prev.quotes)?prev.quotes:[],
      audiobookMinutes:typeof prev.audiobookMinutes==='number'?prev.audiobookMinutes:0,
    };
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
  nfInput.addEventListener('blur',blurHandler);
  nfInput.addEventListener('click',e=>e.stopPropagation());

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
 *
 * v3 added a `nonfiction` checkbox (default true) so users can flag the
 * rare fiction entry; we preserve the existing value if present.
 * v6 added an `audiobookMinutes` input — separate field, supplemental
 * to (not counted toward) the 10-page rule.
 * @returns {void}
 */
export function saveBookEntry(){
  const s=getState();const day=calcCurrentDay();
  if(!s.books)s.books={};
  const title=document.getElementById('book-title-input').value.trim();
  const pages=parseInt(document.getElementById('book-pages-input').value)||0;
  const nfEl=document.getElementById('book-nonfiction-input');
  // Defaults to true: 75 Hard requires nonfiction self-improvement reading.
  const nonfiction=nfEl?nfEl.checked:true;
  const audioEl=document.getElementById('book-audio-input');
  const audiobookMinutes=audioEl?(parseInt(audioEl.value,10)||0):0;
  // Preserve any quotes already saved for the day.
  const prev=s.books[day]||{};
  s.books[day]={
    title,pages,nonfiction,
    quotes:Array.isArray(prev.quotes)?prev.quotes:[],
    audiobookMinutes,
  };
  saveState(s);renderBooks(s);showToast('Book entry saved');
}

// ---- POMODORO (item 37) ----------------------------------------------------

let pomodoroId=null;
let pomodoroEndsAt=0;

/**
 * Start (or restart) the 15-minute reading-pomodoro countdown. Idempotent
 * — repeated clicks while running are ignored.
 * @returns {void}
 */
export function startPomodoro(){
  if(pomodoroId)return;
  pomodoroEndsAt=Date.now()+POMODORO_SECONDS*1000;
  const startBtn=document.getElementById('pomodoro-start');
  const stopBtn=document.getElementById('pomodoro-stop');
  if(startBtn)startBtn.hidden=true;
  if(stopBtn)stopBtn.hidden=false;
  tickPomodoro();
  pomodoroId=setInterval(tickPomodoro,500);
}

/**
 * Update the MM:SS display from the saved `pomodoroEndsAt`. When the
 * countdown reaches zero, fires the celebration confetti + toast and
 * stops the timer.
 * @returns {void}
 */
function tickPomodoro(){
  const remaining=Math.max(0,Math.round((pomodoroEndsAt-Date.now())/1000));
  const display=document.getElementById('pomodoro-time');
  if(display)display.textContent=formatDuration(remaining);
  if(remaining<=0){
    stopPomodoroInternal(true);
  }
}

/**
 * Manually stop the pomodoro before it finishes. No toast, no confetti.
 * @returns {void}
 */
export function stopPomodoro(){
  stopPomodoroInternal(false);
}

function stopPomodoroInternal(completed){
  if(pomodoroId){clearInterval(pomodoroId);pomodoroId=null;}
  const startBtn=document.getElementById('pomodoro-start');
  const stopBtn=document.getElementById('pomodoro-stop');
  if(startBtn)startBtn.hidden=false;
  if(stopBtn)stopBtn.hidden=true;
  const display=document.getElementById('pomodoro-time');
  if(display)display.textContent=formatDuration(POMODORO_SECONDS);
  if(completed){
    fireConfetti();
    showToast('Session complete — log your pages.');
  }
}

// ---- QUOTES VAULT (item 38) ------------------------------------------------

/**
 * Switch the Books tab into the aggregated quotes-vault view.
 * @returns {void}
 */
export function showQuotesView(){
  booksSubview='quotes';
  const s=getState();
  if(s)renderQuotesView(s);
  syncSubviewVisibility();
}

/**
 * Restore the book-log view (default).
 * @returns {void}
 */
export function showBookLogView(){
  booksSubview='log';
  syncSubviewVisibility();
}

/**
 * Toggle visibility of the log vs. quotes-vault subviews + the small
 * link bar at the top of the tab.
 */
function syncSubviewVisibility(){
  const log=document.getElementById('book-log');
  const vault=document.getElementById('quotes-view');
  const toQuotes=document.getElementById('books-view-quotes');
  const toLog=document.getElementById('books-view-log');
  if(!log||!vault)return;
  if(booksSubview==='quotes'){
    log.hidden=true;
    vault.hidden=false;
    if(toQuotes)toQuotes.hidden=true;
    if(toLog)toLog.hidden=false;
  } else {
    log.hidden=false;
    vault.hidden=true;
    if(toQuotes)toQuotes.hidden=false;
    if(toLog)toLog.hidden=true;
  }
}

/**
 * Build the aggregated quotes-vault DOM grouped by book title.
 * @param {import('./state.js').State} s
 */
function renderQuotesView(s){
  const host=document.getElementById('quotes-view');
  if(!host)return;
  host.innerHTML='';
  const groups=collectQuotesByBook(s);
  if(!groups.length){
    const empty=document.createElement('div');
    empty.className='quotes-empty';
    empty.textContent='// NO QUOTES SAVED YET — add one from a book log row.';
    host.appendChild(empty);
    return;
  }
  groups.forEach(g=>{
    const sec=document.createElement('div');
    sec.className='quotes-group';
    const h=document.createElement('div');
    h.className='quotes-group-title';
    h.textContent=g.title;
    sec.appendChild(h);
    g.entries.forEach(({text,page})=>{
      const line=document.createElement('div');
      line.className='quotes-group-line';
      let s2='"'+text+'" — '+g.title;
      if(page!==undefined&&page!==null&&page!=='')s2+=', p.'+page;
      line.textContent=s2;
      sec.appendChild(line);
    });
    host.appendChild(sec);
  });
}

/**
 * Aggregate quotes across all book entries, grouped by the latest title
 * for each book key. Returns ordered list keyed by title (case-insensitive
 * dedupe — entries logged under "Atomic Habits" and "atomic habits" merge).
 *
 * Exported for the unit tests so the aggregation logic is verifiable
 * without touching the DOM.
 *
 * @param {import('./state.js').State} s
 * @returns {Array<{title:string,entries:Array<{text:string,page?:number}>}>}
 */
export function collectQuotesByBook(s){
  const map=new Map();
  if(!s||!s.books)return [];
  const days=Object.keys(s.books).sort((a,b)=>+a-+b);
  days.forEach(d=>{
    const b=s.books[d];
    if(!b||!Array.isArray(b.quotes)||!b.quotes.length)return;
    const title=(b.title||'(No title)').trim()||'(No title)';
    const key=title.toLowerCase();
    let bucket=map.get(key);
    if(!bucket){
      bucket={title,entries:[]};
      map.set(key,bucket);
    }
    b.quotes.forEach(q=>{
      if(!q||typeof q.text!=='string'||!q.text.trim())return;
      bucket.entries.push({text:q.text,page:q.page});
    });
  });
  return [...map.values()].filter(g=>g.entries.length>0);
}

/**
 * Wire the pomodoro + quotes-vault subtab handlers. Called once at boot
 * from main.js.
 * @returns {void}
 */
export function wireBooksTab(){
  const startBtn=document.getElementById('pomodoro-start');
  const stopBtn=document.getElementById('pomodoro-stop');
  if(startBtn)startBtn.addEventListener('click',startPomodoro);
  if(stopBtn)stopBtn.addEventListener('click',stopPomodoro);
  const toQuotes=document.getElementById('books-view-quotes');
  if(toQuotes)toQuotes.addEventListener('click',e=>{e.preventDefault();showQuotesView();});
  const toLog=document.getElementById('books-view-log');
  if(toLog)toLog.addEventListener('click',e=>{e.preventDefault();showBookLogView();});
  // Initialize the time display.
  const display=document.getElementById('pomodoro-time');
  if(display)display.textContent=formatDuration(POMODORO_SECONDS);
}

// ---- AUDIOBOOK MINUTES (item 39) ------------------------------------------

/**
 * Total audiobook minutes across all logged book entries.
 * Used by the Stats tab to display "AUDIOBOOK HOURS".
 * @param {import('./state.js').State} s
 * @returns {number}
 */
export function totalAudiobookMinutes(s){
  if(!s||!s.books)return 0;
  let n=0;
  for(const k in s.books){
    const b=s.books[k];
    if(!b)continue;
    const m=Number(b.audiobookMinutes);
    if(Number.isFinite(m)&&m>0)n+=m;
  }
  return n;
}
