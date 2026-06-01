import { TASKS, photoKey } from './constants.js';
import { getState, saveState, getDayData, updateDayData, calcCurrentDay } from './state.js';
import { checkCompletionAnimation } from './confetti.js';
import { renderGrid } from './grid.js';
import { renderGallery, openLightbox } from './photos.js';
import { renderAll } from './main.js';

export function renderTaskList(s,day,containerId,isToday){
  const container=document.getElementById(containerId);
  const dd=getDayData(s,day);
  const isFuture=day>calcCurrentDay();
  container.innerHTML='';

  TASKS.forEach(t=>{
    const done=dd[t.key];
    if(t.single){
      const el=document.createElement('div');
      el.className='task-item'+(done?' done':'');
      let labelText=t.label;
      if(t.customLabel){
        labelText=dd[t.key+'label']||t.label;
      }
      const showEdit=t.customLabel&&isToday&&!isFuture;
      el.innerHTML=`
        <div class="task-check"><svg class="task-check-icon" width="12" height="10" viewBox="0 0 12 10"><path d="M1 5L4.5 8.5L11 1.5" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg></div>
        <span class="task-icon">${t.icon}</span>
        <span class="task-label">${labelText}</span>
        ${showEdit?`<button type="button" class="btn-edit-label" aria-label="Rename ${t.label}">[ EDIT ]</button>`:''}
      `;
      if(!isFuture){
        el.addEventListener('click',e=>{
          if(el.classList.contains('editing'))return;
          if(e.target.closest('.btn-edit-label'))return;
          if(e.target.closest('.task-label-input'))return;
          const s2=getState();
          const d2=getDayData(s2,day);
          updateDayData(s2,day,{[t.key]:!d2[t.key]});
          saveState(s2);
          if(isToday){checkCompletionAnimation(s2,day);renderAll(s2);}
          else{renderTaskList(s2,day,containerId,false);renderGrid(s2);}
        });
        if(showEdit){
          const editBtn=el.querySelector('.btn-edit-label');
          editBtn.addEventListener('click',e=>{
            e.stopPropagation();
            startEditLabel(el,t,day,containerId,isToday);
          });
        }
      } else {el.style.opacity='0.4';el.style.cursor='default';}
      container.appendChild(el);
    } else {
      const pKey=photoKey(day);
      const photoData=localStorage.getItem(pKey);
      const el=document.createElement('div');
      el.className='task-item photo-task'+(done?' done':'');
      el.innerHTML=`
        <div class="photo-task-header">
          <div class="task-check"><svg class="task-check-icon" width="12" height="10" viewBox="0 0 12 10"><path d="M1 5L4.5 8.5L11 1.5" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg></div>
          <span class="task-icon">${t.icon}</span>
          <span class="task-label">${t.label}</span>
        </div>
        <div class="photo-preview${photoData?' visible':''}">
          ${photoData?`<img src="${photoData}" alt="Progress photo" data-photo-key="${pKey}">`:''}</div>
        ${!isFuture?`<label class="photo-upload-btn" for="file-${day}-${containerId}">${done?'[ REPLACE ]':'[ UPLOAD ]'}</label>
        <input type="file" id="file-${day}-${containerId}" accept="image/*" data-day="${day}" data-container="${containerId}" data-istoday="${isToday}">`:''}`
      ;
      container.appendChild(el);
      const previewImg=el.querySelector('.photo-preview img');
      if(previewImg){
        previewImg.addEventListener('click',()=>openLightbox(previewImg.dataset.photoKey));
      }
      if(!isFuture){
        el.querySelector('input[type="file"]').addEventListener('change',handlePhotoUpload);
      }
    }
  });
}

function startEditLabel(el,t,day,containerId,isToday){
  if(el.classList.contains('editing'))return;
  el.classList.add('editing');
  const labelSpan=el.querySelector('.task-label');
  const editBtn=el.querySelector('.btn-edit-label');
  const original=labelSpan.textContent;
  const input=document.createElement('input');
  input.type='text';
  input.className='task-label-input';
  input.value=original;
  input.setAttribute('aria-label','Rename '+t.label);
  labelSpan.replaceWith(input);
  if(editBtn)editBtn.style.display='none';
  input.focus();
  input.select();
  let finished=false;
  const cancel=()=>{
    if(finished)return;finished=true;
    const span=document.createElement('span');
    span.className='task-label';
    span.textContent=original;
    input.replaceWith(span);
    el.classList.remove('editing');
    if(editBtn)editBtn.style.display='';
  };
  const commit=()=>{
    if(finished)return;finished=true;
    const newName=input.value.trim();
    el.classList.remove('editing');
    if(newName&&newName!==original){
      const s2=getState();
      updateDayData(s2,day,{[t.key+'label']:newName});
      saveState(s2);
      if(isToday){renderAll(s2);}
      else{renderTaskList(s2,day,containerId,false);}
    } else {
      const span=document.createElement('span');
      span.className='task-label';
      span.textContent=original;
      input.replaceWith(span);
      if(editBtn)editBtn.style.display='';
    }
  };
  input.addEventListener('click',e=>e.stopPropagation());
  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();commit();}
    else if(e.key==='Escape'){e.preventDefault();cancel();}
  });
  input.addEventListener('blur',commit);
}

export function handlePhotoUpload(e){
  const file=e.target.files[0];if(!file)return;
  const day=parseInt(e.target.dataset.day);
  const containerId=e.target.dataset.container;
  const isToday=e.target.dataset.istoday==='true';
  const reader=new FileReader();
  reader.onload=ev=>{
    localStorage.setItem(photoKey(day),ev.target.result);
    const s=getState();updateDayData(s,day,{photo:true});saveState(s);
    if(isToday){checkCompletionAnimation(s,day);renderAll(s);}
    else{renderTaskList(s,day,containerId,false);renderGrid(s);renderGallery(s);}
  };
  reader.readAsDataURL(file);
}
