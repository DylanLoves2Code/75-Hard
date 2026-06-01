/**
 * @file End-of-day failure log — v4. When the user opens the app and
 * the previous day was incomplete and we haven't already asked about
 * it, show an inline banner at the top of the Today tab requesting a
 * one-line reason ("traveled", "got sick", "no excuse").
 *
 * Storage: `s.days[d].failureReason`
 *   `null`            — never asked yet for this day
 *   `''` (empty str)  — asked + skipped, don't ask again
 *   non-empty string  — logged reason
 */
import { getState, saveState, getDayData, updateDayData, calcCurrentDay, isDayComplete } from './state.js';
import { showToast } from './toast.js';
import { emit } from './bus.js';

/**
 * Decide which prior day (if any) should be surfaced in the failure
 * prompt. Pure helper; pulled out for testing and clarity.
 *
 * @param {import('./state.js').State} s
 * @param {number} currentDay
 * @returns {number|null} The day number to ask about, or null if none.
 */
export function pickFailureDay(s, currentDay){
  if(!s || !s.days) return null;
  if(currentDay <= 1) return null;
  const prev = currentDay - 1;
  if(isDayComplete(s, prev)) return null;
  const dd = getDayData(s, prev);
  // null = never asked; '' = previously skipped; non-empty = logged.
  // Only ask when we've never asked yet.
  if(dd.failureReason !== null && dd.failureReason !== undefined) return null;
  return prev;
}

/**
 * Show the inline failure-log banner at the top of the Today tab if
 * applicable. Idempotent — calling twice does not stack banners.
 *
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function maybeShowFailurePrompt(s){
  const host = document.getElementById('failure-prompt-host');
  if(!host) return;
  // Always clear the host first so changing-state re-renders behave.
  host.innerHTML = '';
  const day = pickFailureDay(s, calcCurrentDay());
  if(day === null) return;

  const banner = document.createElement('div');
  banner.className = 'failure-prompt';
  banner.setAttribute('role','region');
  banner.setAttribute('aria-label','Yesterday was incomplete');
  banner.innerHTML = `
    <div class="failure-prompt-head">
      <div class="failure-prompt-title">// DAY ${day} WAS INCOMPLETE</div>
      <div class="failure-prompt-sub">One-line reason? Turns failure into data.</div>
    </div>
    <div class="failure-prompt-row">
      <input type="text" class="failure-prompt-input" id="failure-prompt-input"
             maxlength="120" placeholder="e.g. traveled, missed reading"
             aria-label="Failure reason for day ${day}">
      <button type="button" class="failure-prompt-skip" id="failure-prompt-skip">[ SKIP ]</button>
      <button type="button" class="failure-prompt-log" id="failure-prompt-log">[ LOG ]</button>
    </div>
  `;
  host.appendChild(banner);

  const input = banner.querySelector('#failure-prompt-input');
  const skipBtn = banner.querySelector('#failure-prompt-skip');
  const logBtn = banner.querySelector('#failure-prompt-log');

  const finish = (reason) => {
    const s2 = getState();
    if(!s2) return;
    updateDayData(s2, day, {failureReason: reason});
    saveState(s2);
    host.innerHTML = '';
    if(reason) showToast('Reason logged');
    emit('state:stats', s2);
  };
  skipBtn.addEventListener('click', () => finish(''));
  logBtn.addEventListener('click', () => {
    const raw = (input.value || '').trim();
    // Empty + LOG behaves like SKIP — both mean "stop asking".
    finish(raw);
  });
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); logBtn.click(); }
    else if(e.key === 'Escape'){ e.preventDefault(); skipBtn.click(); }
  });
}

/**
 * Build the list of recorded failure-log entries for the Stats tab.
 * Pure helper — pulled out for testing.
 *
 * @param {import('./state.js').State} s
 * @returns {Array<{day:number,reason:string}>}
 *          Sorted ascending by day. Skipped/null reasons are excluded.
 */
export function getFailureLog(s){
  if(!s || !s.days) return [];
  const out = [];
  const keys = Object.keys(s.days).map(Number).filter(n => Number.isFinite(n)).sort((a,b)=>a-b);
  for(const d of keys){
    const dd = s.days[d];
    if(!dd) continue;
    const r = dd.failureReason;
    if(typeof r !== 'string') continue;
    if(r.trim() === '') continue;
    out.push({day:d, reason:r});
  }
  return out;
}
