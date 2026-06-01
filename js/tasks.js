import { TASKS, photoKey } from './constants.js';
import { getState, saveState, getDayData, calcCurrentDay } from './state.js';
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
      el.innerHTML=`
        <div class="task-check"><svg class="task-check-icon" width="12" height="10" viewBox="0 0 12 10"><path d="M1 5L4.5 8.5L11 1.5" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg></div>
        <span class="task-icon">${t.icon}</span>
        <span class="task-label">${labelText}</span>
      `;
      el.setAttribute('role','button');
      el.setAttribute('aria-pressed',done?'true':'false');
      el.setAttribute('aria-label',labelText);
      if(!isFuture){
        el.setAttribute('tabindex','0');
        const activate=()=>{
          const s2=getState();
          const d2=getDayData(s2,day);
          d2[t.key]=!d2[t.key];
          saveState(s2);
          if(isToday){checkCompletionAnimation(s2,day);renderAll(s2);}
          else{renderTaskList(s2,day,containerId,false);renderGrid(s2);}
        };
        el.addEventListener('click',activate);
        el.addEventListener('keydown',e=>{
          if(e.key==='Enter'||e.key===' '){
            e.preventDefault();
            activate();
          }
        });
        if(t.customLabel&&isToday){
          el.addEventListener('contextmenu',e=>{
            e.preventDefault();
            const newName=prompt('Rename this workout:',dd[t.key+'label']||t.label);
            if(newName){
              const s2=getState();getDayData(s2,day)[t.key+'label']=newName.trim();
              saveState(s2);renderAll(s2);
            }
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

export function handlePhotoUpload(e){
  const file=e.target.files[0];if(!file)return;
  const day=parseInt(e.target.dataset.day);
  const containerId=e.target.dataset.container;
  const isToday=e.target.dataset.istoday==='true';
  const reader=new FileReader();
  reader.onload=ev=>{
    localStorage.setItem(photoKey(day),ev.target.result);
    const s=getState();getDayData(s,day).photo=true;saveState(s);
    if(isToday){checkCompletionAnimation(s,day);renderAll(s);}
    else{renderTaskList(s,day,containerId,false);renderGrid(s);renderGallery(s);}
  };
  reader.readAsDataURL(file);
}
