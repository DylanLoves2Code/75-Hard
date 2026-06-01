/** @file Task list rendering, label editing, and photo upload. */
import { TASKS, photoKey } from './constants.js';
import { getState, saveState, savePhoto, getDayData, updateDayData, calcCurrentDay } from './state.js';
import { checkCompletionAnimation } from './confetti.js';
import { renderGrid } from './grid.js';
import { renderGallery, openLightbox } from './photos.js';
import { emit } from './bus.js';
import { formatDuration } from './timer.js';

/**
 * Per-workout-slot timer running state. Keyed by `${day}:${slot}` where
 * slot is 'w1' or 'w2'. In-memory only — lost on reload by design (see
 * the w4b spec: "running state is in-memory only").
 *
 * Each entry: `{ startedAt: number /* epoch ms *\/, intervalId: number,
 * baseline: number /* seconds accumulated prior to this run *\/ }`.
 * @type {Map<string, {startedAt:number,intervalId:number,baseline:number}>}
 */
const activeTimers = new Map();
const timerKey = (day, slot) => `${day}:${slot}`;

/**
 * Current elapsed seconds for a (day, slot). If the timer is running,
 * includes the in-flight wall-clock delta on top of the saved/baseline
 * value; otherwise returns the persisted `dd[slot+'duration']`.
 * @param {number} day
 * @param {'w1'|'w2'} slot
 * @returns {number}
 */
function currentElapsed(day, slot){
  const k = timerKey(day, slot);
  const t = activeTimers.get(k);
  if(t){
    return t.baseline + Math.floor((Date.now() - t.startedAt) / 1000);
  }
  const s = getState();
  if(!s) return 0;
  const dd = getDayData(s, day);
  return Math.max(0, parseInt(dd[slot+'duration'], 10) || 0);
}

/**
 * Repaint the `[ ⏱ MM:SS ]` button label without re-rendering the row.
 * Called by the active interval once per second.
 * @param {HTMLButtonElement} btn
 * @param {number} day
 * @param {'w1'|'w2'} slot
 */
function repaintTimerButton(btn, day, slot){
  const running = activeTimers.has(timerKey(day, slot));
  const elapsed = currentElapsed(day, slot);
  btn.classList.toggle('running', running);
  btn.setAttribute('aria-pressed', running ? 'true' : 'false');
  btn.textContent = `[ ⏱ ${formatDuration(elapsed)} ]`;
}

/**
 * Click handler for the workout-timer button. Toggles the in-memory
 * stopwatch and, on stop, persists the accumulated `wNduration` seconds
 * into state.
 * @param {HTMLButtonElement} btn
 * @param {number} day
 * @param {'w1'|'w2'} slot
 */
function toggleTimer(btn, day, slot){
  const k = timerKey(day, slot);
  const running = activeTimers.has(k);
  if(running){
    const t = activeTimers.get(k);
    clearInterval(t.intervalId);
    activeTimers.delete(k);
    const elapsed = t.baseline + Math.floor((Date.now() - t.startedAt) / 1000);
    const s = getState();
    if(s){
      updateDayData(s, day, { [slot+'duration']: elapsed });
      saveState(s);
    }
    repaintTimerButton(btn, day, slot);
  } else {
    const baseline = currentElapsed(day, slot);
    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      // The button may have been re-rendered off-screen between ticks
      // (e.g. by an unrelated state:changed). Detect that and just stop
      // updating — the next render will pick up the new label.
      if(!btn.isConnected){
        clearInterval(intervalId);
        return;
      }
      repaintTimerButton(btn, day, slot);
    }, 1000);
    activeTimers.set(k, { startedAt, intervalId, baseline });
    repaintTimerButton(btn, day, slot);
  }
}

/** v4: dropdown options for the per-workout type + location selects. */
const WORKOUT_TYPES = ['Lift','Run','Swim','Bike','Yoga','HIIT','Walk','Sport','Other'];
const WORKOUT_LOCATIONS = ['Gym','Home','Outdoor','Park','Road','Other'];

/**
 * Build the inner `<option>` markup for a `<select>`, with the current
 * value pre-selected and a leading "—" empty option.
 * @param {string[]} options
 * @param {string} current
 * @returns {string}
 */
function selectOptions(options, current){
  const cur = current || '';
  const empty = `<option value=""${cur===''?' selected':''}>—</option>`;
  const opts = options.map(o => `<option value="${o}"${o===cur?' selected':''}>${o}</option>`).join('');
  return empty + opts;
}

/**
 * Resolve the user-facing diet name from state.diet. 'Custom' falls back
 * to the user's free-text label, or '' if neither is set.
 * @param {import('./state.js').State} s
 * @returns {string}
 */
function resolveDietName(s){
  const d=s&&s.diet;
  if(!d||!d.name)return '';
  if(d.name==='Custom')return (d.customText||'').trim();
  return d.name;
}

/**
 * Render the six-task list into `containerId` for a given day.
 * @param {import('./state.js').State} s
 * @param {number} day
 * @param {string} containerId   DOM id to render into (e.g. "task-list" or "modal-task-list").
 * @param {boolean} isToday      Whether the list represents the current day (enables full interactivity).
 * @returns {void}
 */
export function renderTaskList(s,day,containerId,isToday){
  const container=document.getElementById(containerId);
  const dd=getDayData(s,day);
  const isFuture=day>calcCurrentDay();
  container.innerHTML='';

  TASKS.forEach(t=>{
    // dietAdherence (v3+) accepts the legacy `calorie` value for back-compat.
    const done=t.key==='dietAdherence'?(dd.dietAdherence||dd.calorie):dd[t.key];
    if(t.single){
      let labelText=t.label;
      if(t.customLabel){
        labelText=dd[t.key+'label']||t.label;
      }
      // Diet slot: append the user's chosen diet name in parens.
      if(t.key==='dietAdherence'){
        const dietName=resolveDietName(s);
        if(dietName)labelText=`${labelText} (${dietName})`;
      }
      const showEdit=t.customLabel&&isToday&&!isFuture;
      const showOutdoor=t.customLabel&&!isFuture; // w1/w2 outdoor toggle
      // v4: workout-type + location selects, only on the w1/w2 rows.
      const showSelects=t.customLabel&&!isFuture;
      // w4b: workout-1/2 stopwatch button. Today-only — past days don't
      // get a live timer (the value is read-only via the saved duration).
      const showTimer=t.customLabel&&isToday&&!isFuture;
      const durationKey=t.key+'duration';
      const savedDuration=showTimer?Math.max(0,parseInt(dd[durationKey],10)||0):0;
      // Rows that host an interactive EDIT/OUTDOOR/SELECT child must remain a div
      // (nested <button> inside <button> is invalid HTML, and a <select>
      // would also break the row click target). Otherwise promote to a
      // real <button> for native a11y semantics.
      const useButton=!(showEdit||showOutdoor||showSelects||showTimer);
      const el=document.createElement(useButton?'button':'div');
      if(useButton)el.type='button';
      el.className='task-item'+(done?' done':'')+(showSelects?' task-item-workout':'');
      const outdoorKey=t.key+'outdoor';
      const outdoorOn=showOutdoor?!!dd[outdoorKey]:false;
      const typeKey=t.key+'type';
      const locKey=t.key+'location';
      const curType=showSelects?(dd[typeKey]||''):'';
      const curLoc=showSelects?(dd[locKey]||''):'';
      el.innerHTML=`
        <div class="task-row-main">
          <div class="task-check"><svg class="task-check-icon" width="12" height="10" viewBox="0 0 12 10"><path d="M1 5L4.5 8.5L11 1.5" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg></div>
          <span class="task-icon">${t.icon}</span>
          <span class="task-label">${labelText}</span>
          ${showOutdoor?`<button type="button" class="btn-outdoor-toggle${outdoorOn?' on':''}" aria-label="Toggle outdoor for ${labelText}" aria-pressed="${outdoorOn?'true':'false'}">[ OUTDOOR ]</button>`:''}
          ${showEdit?`<button type="button" class="btn-edit-label" aria-label="Rename ${t.label}">[ EDIT ]</button>`:''}
          ${showTimer?`<button type="button" class="btn-workout-timer" aria-label="Workout timer for ${labelText}" aria-pressed="false" data-tkey="${t.key}">[ ⏱ ${formatDuration(savedDuration)} ]</button>`:''}
        </div>
        ${showSelects?`
        <div class="task-row-selects">
          <select class="task-select task-select-type" data-tkey="${typeKey}"
                  aria-label="${labelText} type">${selectOptions(WORKOUT_TYPES,curType)}</select>
          <select class="task-select task-select-loc" data-tkey="${locKey}" data-outdoor-key="${outdoorKey}"
                  aria-label="${labelText} location">${selectOptions(WORKOUT_LOCATIONS,curLoc)}</select>
        </div>`:''}
      `;
      el.setAttribute('aria-pressed',done?'true':'false');
      el.setAttribute('aria-label',labelText);
      if(!useButton){
        // Fallback ARIA shim path (rows with a nested EDIT/OUTDOOR button).
        el.setAttribute('role','button');
      }
      if(!isFuture){
        if(!useButton)el.setAttribute('tabindex','0');
        const activate=()=>{
          if(el.classList.contains('editing'))return;
          const s2=getState();
          const d2=getDayData(s2,day);
          // Diet slot writes the v3 key; legacy `calorie` is preserved.
          if(t.key==='dietAdherence'){
            const next=!(d2.dietAdherence||d2.calorie);
            updateDayData(s2,day,{dietAdherence:next});
          } else {
            updateDayData(s2,day,{[t.key]:!d2[t.key]});
          }
          saveState(s2);
          if(isToday){checkCompletionAnimation(s2,day);emit('state:changed',s2);}
          else{renderTaskList(s2,day,containerId,false);renderGrid(s2);}
        };
        el.addEventListener('click',e=>{
          if(e.target.closest('.btn-edit-label'))return;
          if(e.target.closest('.btn-outdoor-toggle'))return;
          if(e.target.closest('.task-label-input'))return;
          // v4: type + location selects must not toggle the task.
          if(e.target.closest('.task-select'))return;
          if(e.target.closest('.task-row-selects'))return;
          // w4b: stopwatch button must not toggle the task.
          if(e.target.closest('.btn-workout-timer'))return;
          activate();
        });
        if(!useButton){
          // Native <button> handles Enter/Space natively; the shim path
          // still needs an explicit keydown bridge.
          el.addEventListener('keydown',e=>{
            if(e.target!==el)return;
            if(e.key==='Enter'||e.key===' '){
              e.preventDefault();
              activate();
            }
          });
        }
        if(showEdit){
          const editBtn=el.querySelector('.btn-edit-label');
          editBtn.addEventListener('click',e=>{
            e.stopPropagation();
            startEditLabel(el,t,day,containerId,isToday);
          });
        }
        if(showOutdoor){
          const outBtn=el.querySelector('.btn-outdoor-toggle');
          outBtn.addEventListener('click',e=>{
            e.stopPropagation();
            const s2=getState();
            const d2=getDayData(s2,day);
            updateDayData(s2,day,{[outdoorKey]:!d2[outdoorKey]});
            saveState(s2);
            if(isToday){emit('state:changed',s2);}
            else{renderTaskList(s2,day,containerId,false);renderGrid(s2);}
          });
        }
        if(showTimer){
          const timerBtn=el.querySelector('.btn-workout-timer');
          if(timerBtn){
            const slot=timerBtn.dataset.tkey;
            // If a timer was already running for this (day, slot) before
            // a rerender, re-attach the live tick to the new button.
            const k=timerKey(day,slot);
            if(activeTimers.has(k)){
              const t=activeTimers.get(k);
              clearInterval(t.intervalId);
              t.intervalId=setInterval(()=>{
                if(!timerBtn.isConnected){clearInterval(t.intervalId);return;}
                repaintTimerButton(timerBtn,day,slot);
              },1000);
              repaintTimerButton(timerBtn,day,slot);
            }
            timerBtn.addEventListener('click',e=>{
              e.stopPropagation();
              toggleTimer(timerBtn,day,slot);
            });
          }
        }
        if(showSelects){
          el.querySelectorAll('.task-select').forEach(sel=>{
            // Stop click/change from bubbling to the row activator.
            sel.addEventListener('click',e=>e.stopPropagation());
            sel.addEventListener('change',e=>{
              e.stopPropagation();
              const s2=getState();
              const fieldKey=sel.dataset.tkey;
              const patch={[fieldKey]:sel.value};
              // location === 'Outdoor' implies the existing v3 outdoor
              // flag. Linking these makes Stats' outdoor counts honest
              // without forcing the user to toggle two controls.
              const outKey=sel.dataset.outdoorKey;
              if(outKey){
                if(sel.value==='Outdoor')patch[outKey]=true;
              }
              updateDayData(s2,day,patch);
              saveState(s2);
              if(isToday){emit('state:changed',s2);}
              else{renderTaskList(s2,day,containerId,false);renderGrid(s2);}
            });
          });
        }
      } else {
        if(useButton)el.disabled=true;
        el.style.opacity='0.4';el.style.cursor='default';
      }
      container.appendChild(el);

      // Inline diet-note input lives just under the dietAdherence row on Today.
      if(t.key==='dietAdherence'&&isToday&&!isFuture){
        const noteWrap=document.createElement('div');
        noteWrap.className='diet-note-wrap';
        const noteInput=document.createElement('input');
        noteInput.type='text';
        noteInput.className='diet-note-input';
        noteInput.placeholder='Note what you ate (optional)';
        noteInput.setAttribute('aria-label','Diet note for today');
        noteInput.value=dd.dietNote||'';
        noteInput.addEventListener('click',e=>e.stopPropagation());
        noteInput.addEventListener('blur',()=>{
          const s2=getState();
          const d2=getDayData(s2,day);
          const val=noteInput.value;
          if((d2.dietNote||'')===val)return;
          updateDayData(s2,day,{dietNote:val});
          saveState(s2);
        });
        noteWrap.appendChild(noteInput);
        container.appendChild(noteWrap);
      }
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
      if(isToday){emit('state:changed',s2);}
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

/**
 * Downscale a data-URL image to a JPEG sized so the longer edge is at
 * most `maxEdge` pixels, preserving aspect ratio.
 *
 * Used to shrink raw camera photos (typically 3–5 MB on modern phones)
 * before stashing in localStorage. A 1024-edge JPEG at q=0.85 lands
 * around 100–200 KB for typical progress shots.
 *
 * @param {string} dataUrl  Source data URL (any image MIME the browser decodes).
 * @param {number} [maxEdge=1024]  Max length of the longer image edge.
 * @param {number} [quality=0.85]  JPEG quality in [0,1] passed to toDataURL.
 * @returns {Promise<string>}  A `data:image/jpeg;base64,...` URL.
 */
export function downscaleImage(dataUrl,maxEdge=1024,quality=0.85){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const w=img.naturalWidth||img.width;
      const h=img.naturalHeight||img.height;
      const longest=Math.max(w,h);
      const scale=longest>maxEdge?maxEdge/longest:1;
      const tw=Math.max(1,Math.round(w*scale));
      const th=Math.max(1,Math.round(h*scale));
      const canvas=document.createElement('canvas');
      canvas.width=tw;canvas.height=th;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,tw,th);
      try{
        resolve(canvas.toDataURL('image/jpeg',quality));
      }catch(err){
        reject(err);
      }
    };
    img.onerror=()=>reject(new Error('Image decode failed'));
    img.src=dataUrl;
  });
}

/**
 * <input type="file"> change handler that reads the chosen image,
 * downscales it (see {@link downscaleImage}), stores the downscaled
 * data URL under `photoKey(day)`, and marks the day's photo task
 * complete. If localStorage rejects the write (quota), the photo task
 * is NOT marked done.
 * @param {Event} e
 * @returns {void}
 */
export function handlePhotoUpload(e){
  const file=e.target.files[0];if(!file)return;
  const day=parseInt(e.target.dataset.day);
  const containerId=e.target.dataset.container;
  const isToday=e.target.dataset.istoday==='true';
  const reader=new FileReader();
  reader.onload=ev=>{
    downscaleImage(ev.target.result).then(small=>{
      if(!savePhoto(day,small))return;
      const s=getState();updateDayData(s,day,{photo:true});saveState(s);
      if(isToday){checkCompletionAnimation(s,day);emit('state:changed',s);}
      else{renderTaskList(s,day,containerId,false);renderGrid(s);renderGallery(s);}
    }).catch(err=>{
      console.warn('Photo downscale failed; storing raw image.',err);
      if(!savePhoto(day,ev.target.result))return;
      const s=getState();updateDayData(s,day,{photo:true});saveState(s);
      if(isToday){checkCompletionAnimation(s,day);emit('state:changed',s);}
      else{renderTaskList(s,day,containerId,false);renderGrid(s);renderGallery(s);}
    });
  };
  reader.readAsDataURL(file);
}
