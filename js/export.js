/** @file Export-tab actions: data download and full challenge reset. */
import { TOTAL, STORAGE_KEY, photoKey } from './constants.js';
import { getState } from './state.js';
import { showToast } from './toast.js';
import { stopCountdown } from './countdown.js';
import { stopQuoteRotation } from './quotes.js';
import { resetAnimatedDay } from './confetti.js';
import { getSettings } from './settings.js';

/** Trigger a JSON download of the current saved state. @returns {void} */
export function exportData(){
  const s=getState();if(!s){alert('No data to export.');return;}
  const blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='75hard-backup.json';
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast('Data exported');
}

/** Show the "are you sure?" reset overlay. @returns {void} */
export function confirmReset(){document.getElementById('confirm-overlay').classList.add('open');}
/** Hide the reset-confirm overlay without performing a reset. @returns {void} */
export function cancelReset(){document.getElementById('confirm-overlay').classList.remove('open');}

/**
 * Erase saved state + all photos and return to the setup screen.
 * @returns {void}
 */
export function executeReset(){
  localStorage.removeItem(STORAGE_KEY);
  // The `forgetPhotosOnReset` setting (default true) preserves the
  // legacy behavior. When unchecked, the user keeps their photo blobs
  // — useful if they want to re-import state later or browse history.
  if(getSettings().forgetPhotosOnReset){
    for(let d=1;d<=TOTAL;d++)localStorage.removeItem(photoKey(d));
  }
  document.getElementById('confirm-overlay').classList.remove('open');
  document.getElementById('app').style.display='none';
  document.getElementById('setup-screen').classList.add('active');
  stopCountdown();
  stopQuoteRotation();
  resetAnimatedDay();
}
