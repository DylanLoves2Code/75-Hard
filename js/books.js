import { getState, saveState, calcCurrentDay } from './state.js';
import { showToast } from './toast.js';

export function renderBooks(s){
  const today=calcCurrentDay();
  let total=0;
  const log=document.getElementById('book-log');log.innerHTML='';

  const lastEntry=Object.keys(s.books||{}).sort((a,b)=>+b-+a)[0];
  if(lastEntry&&s.books[lastEntry]){
    const last=s.books[lastEntry];
    if(last.title)document.getElementById('book-title-input').value=last.title;
  }

  const entries=Object.keys(s.books||{}).sort((a,b)=>+a-+b);
  entries.forEach(d=>{
    const e=s.books[d];if(!e)return;
    total+=e.pages||0;
    const el=document.createElement('div');
    el.style.cssText='background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--purple);padding:0.6rem 0.75rem;margin-bottom:0.4rem;display:flex;justify-content:space-between;align-items:center;';
    el.innerHTML=`<div><div style="font-family:var(--font-b);font-size:0.8rem;color:var(--text);">${e.title||'(No title)'}</div><div style="font-family:var(--font-m);font-size:0.55rem;color:var(--text3);letter-spacing:0.1em;margin-top:2px;">DAY ${d}</div></div><div style="font-family:var(--font-d);font-size:1.2rem;color:var(--purple);">${e.pages}p</div>`;
    log.appendChild(el);
  });
  document.getElementById('total-pages-read').textContent=total;
}

export function saveBookEntry(){
  const s=getState();const day=calcCurrentDay();
  if(!s.books)s.books={};
  const title=document.getElementById('book-title-input').value.trim();
  const pages=parseInt(document.getElementById('book-pages-input').value)||0;
  s.books[day]={title,pages};
  saveState(s);renderBooks(s);showToast('Book entry saved');
}
