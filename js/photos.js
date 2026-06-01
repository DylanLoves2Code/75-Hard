import { photoKey } from './constants.js';
import { calcCurrentDay } from './state.js';

export function renderGallery(s){
  const grid=document.getElementById('gallery-grid');grid.innerHTML='';
  const today=calcCurrentDay();
  let hasAny=false;
  const selectA=document.getElementById('compare-a');
  const selectB=document.getElementById('compare-b');
  const prevA=selectA.value,prevB=selectB.value;
  selectA.innerHTML='<option value="">Day A</option>';
  selectB.innerHTML='<option value="">Day B</option>';

  for(let d=1;d<=today;d++){
    const photo=localStorage.getItem(photoKey(d));
    if(photo){
      hasAny=true;
      const item=document.createElement('div');
      item.className='gallery-item';
      item.innerHTML=`<img src="${photo}" alt="Day ${d}"><div class="gallery-day">DAY ${d}</div>`;
      item.addEventListener('click',()=>openLightbox(photoKey(d)));
      grid.appendChild(item);
      selectA.innerHTML+=`<option value="${d}">Day ${d}</option>`;
      selectB.innerHTML+=`<option value="${d}">Day ${d}</option>`;
    }
  }
  if(!hasAny)grid.innerHTML='<div class="gallery-empty">// No photos uploaded yet —<br>upload progress photos daily</div>';
  selectA.value=prevA;selectB.value=prevB;
  renderCompare();
}

export function renderCompare(){
  const a=document.getElementById('compare-a').value;
  const b=document.getElementById('compare-b').value;
  const wrap=document.getElementById('compare-wrap');
  const slotHtml=(d)=>{
    if(!d)return`<div class="compare-slot"><div class="compare-empty">Select a day</div></div>`;
    const photo=localStorage.getItem(photoKey(d));
    if(!photo)return`<div class="compare-slot"><div class="compare-empty">No photo</div></div>`;
    return`<div class="compare-slot"><img src="${photo}" alt="Day ${d}"><div class="compare-label">DAY ${d}</div></div>`;
  };
  wrap.innerHTML=slotHtml(a)+slotHtml(b);
}

export function openLightbox(key){
  const photo=localStorage.getItem(key);if(!photo)return;
  document.getElementById('lightbox-img').src=photo;
  document.getElementById('lightbox').classList.add('open');
}

export function closeLightbox(){document.getElementById('lightbox').classList.remove('open');}
