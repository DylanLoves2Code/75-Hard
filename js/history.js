/**
 * @file Multi-challenge history (v7+). Archives past challenge runs into
 * a separate localStorage key so the user can restore or delete them
 * later from the Export tab's "Past Attempts" view.
 *
 * The active challenge stays at {@link STORAGE_KEY}. Resetting the
 * active challenge moves it into the {@link STORAGE_KEY_ARCHIVE} list
 * instead of discarding it outright. Photos are NOT copied — the
 * archive entry only carries summary stats — but the user's existing
 * `forgetPhotosOnReset` setting still governs whether the photo blobs
 * for the archived run are wiped on reset.
 *
 * Archive entry shape:
 *   {
 *     startDate: 'YYYY-MM-DD',
 *     name: string,
 *     archivedAt: number (epoch ms),
 *     summary: {
 *       daysComplete: number,
 *       longestStreak: number,
 *       totalPages: number,
 *       finalDay: number,
 *     },
 *     state: State (full schema-versioned state, for restore),
 *   }
 */

import { TOTAL, STORAGE_KEY, STORAGE_KEY_ARCHIVE } from './constants.js';
import { isDayComplete, parseLocalDate } from './state.js';

/**
 * Compute a small summary block for an archived challenge — used both
 * by the Past Attempts list and stashed inside each archive entry so
 * we don't have to recompute it on every render.
 *
 * @param {import('./state.js').State} s
 * @returns {{daysComplete:number,longestStreak:number,totalPages:number,finalDay:number}}
 */
export function summarizeChallenge(s){
  if(!s || typeof s !== 'object'){
    return { daysComplete:0, longestStreak:0, totalPages:0, finalDay:0 };
  }
  let daysComplete = 0;
  let longestStreak = 0;
  let currentStreak = 0;
  let finalDay = 0;
  // isDayComplete reads s.days; defend against malformed/partial states
  // that don't carry the days map.
  const hasDays = s.days && typeof s.days === 'object';
  for(let d=1; d<=TOTAL; d++){
    // We score every day in [1..TOTAL] (not just up to "today") so the
    // summary reflects the full historical run, not the live cursor.
    const has = hasDays && s.days[d];
    if(has) finalDay = Math.max(finalDay, d);
    const complete = hasDays ? isDayComplete(s, d) : false;
    if(complete){
      daysComplete++;
      currentStreak++;
      if(currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }
  let totalPages = 0;
  if(s.books && typeof s.books === 'object'){
    for(const k in s.books){
      const b = s.books[k];
      if(b && typeof b.pages === 'number' && Number.isFinite(b.pages)){
        totalPages += b.pages;
      }
    }
  }
  // If no day data exists at all, finalDay should report the largest
  // index touched (0 if none).
  if(finalDay === 0 && s.days){
    for(const k in s.days){
      const n = parseInt(k, 10);
      if(Number.isFinite(n) && n > finalDay) finalDay = n;
    }
  }
  return { daysComplete, longestStreak, totalPages, finalDay };
}

/**
 * Read the archive list from localStorage. Defensive — bad/missing
 * payloads return an empty array.
 * @returns {Array<{startDate:string,name:string,archivedAt:number,summary:Object,state?:Object}>}
 */
export function getArchive(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ARCHIVE);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed;
  } catch(_e){
    return [];
  }
}

/**
 * Persist the archive list. Internal — callers use {@link archiveCurrent},
 * {@link restoreFromArchive}, or {@link deleteArchiveEntry}.
 * @param {Array} list
 * @returns {void}
 */
function saveArchive(list){
  try {
    localStorage.setItem(STORAGE_KEY_ARCHIVE, JSON.stringify(list));
  } catch(_e){
    // Quota or serializer failure — leave the in-memory list alone.
    console.warn('[history] could not persist archive', _e);
  }
}

/**
 * Move `s` into the archive list and return the new archive (with the
 * fresh entry appended at index 0 so newest-first ordering is natural).
 *
 * `state` is also stashed inside the entry so {@link restoreFromArchive}
 * can bring it back. Photos are NOT stored here — they continue to live
 * under their own localStorage keys and are governed by the
 * `forgetPhotosOnReset` setting at reset time.
 *
 * @param {import('./state.js').State} s
 * @param {{includeState?:boolean}} [options]  Default `{includeState:true}`.
 * @returns {Array} the updated archive list.
 */
export function archiveCurrent(s, options){
  if(!s || typeof s !== 'object') return getArchive();
  const opts = options || {};
  const includeState = opts.includeState !== false;
  const entry = {
    startDate: typeof s.startDate === 'string' ? s.startDate : '',
    name: typeof s.name === 'string' ? s.name : '',
    archivedAt: Date.now(),
    summary: summarizeChallenge(s),
  };
  if(includeState) entry.state = s;
  const list = getArchive();
  list.unshift(entry);
  saveArchive(list);
  return list;
}

/**
 * Restore archive entry `index` into the active slot. The current
 * active state (if any) is first archived so users can flip back. The
 * archive entry is removed from the list on success.
 *
 * If the entry has no `.state` payload (older summary-only entries), we
 * return `false` and leave everything untouched — there's nothing to
 * restore from.
 *
 * @param {number} index  Index into {@link getArchive}.
 * @returns {boolean} `true` on success, `false` otherwise.
 */
export function restoreFromArchive(index){
  const list = getArchive();
  if(!Number.isInteger(index) || index < 0 || index >= list.length) return false;
  const entry = list[index];
  if(!entry || !entry.state || typeof entry.state !== 'object') return false;
  // Snapshot the entry's identifying fields BEFORE mutating the archive
  // — archiveCurrent below also writes a new entry with its own
  // archivedAt (which could collide if called in the same millisecond),
  // so we need a stable composite key to locate the right row later.
  const entryKey = {
    archivedAt: entry.archivedAt,
    startDate: entry.startDate,
    name: entry.name,
  };
  // Archive the current active state first (if present) so the
  // restore is reversible.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const current = JSON.parse(raw);
      if(current && typeof current === 'object'){
        archiveCurrent(current);
      }
    }
  } catch(_e){ /* ignore: no current state */ }
  // Refresh the list — archiving the current state mutated it. The
  // entry's index typically shifted by one because we unshift()ed the
  // current state at position 0. Locate by the composite key; if the
  // archivedAt collided with the freshly-prepended current entry, the
  // startDate+name disambiguator keeps us on the right row.
  const refreshed = getArchive();
  let newIndex = refreshed.findIndex(e =>
    e && e.archivedAt === entryKey.archivedAt
      && e.startDate === entryKey.startDate
      && e.name === entryKey.name);
  if(newIndex < 0){
    // Defensive fallback — shift original index by one if we prepended.
    newIndex = (refreshed.length === list.length + 1) ? index + 1 : index;
  }
  // Write the archived state back to the active slot.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry.state));
  } catch(_e){
    console.warn('[history] could not write restored state', _e);
    return false;
  }
  // Remove the restored entry from the archive.
  refreshed.splice(newIndex, 1);
  saveArchive(refreshed);
  return true;
}

/**
 * Remove archive entry `index` from the list. No-op for out-of-range.
 * @param {number} index
 * @returns {boolean} `true` if a row was removed.
 */
export function deleteArchiveEntry(index){
  const list = getArchive();
  if(!Number.isInteger(index) || index < 0 || index >= list.length) return false;
  list.splice(index, 1);
  saveArchive(list);
  return true;
}

/**
 * HTML-escape a user-supplied string for safe interpolation into innerHTML.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * Format an archive entry's date range — "startDate → endDate" where
 * `endDate` is `startDate + finalDay days` if known, otherwise just the
 * start date.
 *
 * @param {{startDate:string,summary:{finalDay:number}}} entry
 * @returns {string}
 */
function formatRange(entry){
  const start = entry && entry.startDate;
  if(!start) return '—';
  const finalDay = entry && entry.summary && entry.summary.finalDay
    ? entry.summary.finalDay : 0;
  if(!finalDay) return start;
  try {
    const d = parseLocalDate(start);
    d.setDate(d.getDate() + finalDay - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const da = String(d.getDate()).padStart(2,'0');
    return `${start} → ${y}-${m}-${da}`;
  } catch(_e){
    return start;
  }
}

/**
 * Render the Past Attempts list into `#archive-list`. Called whenever
 * the Export tab is opened or after an archive mutation. Wires the
 * RESTORE and DELETE buttons directly here so the parent module stays
 * thin.
 *
 * The actual restore step requires confirmation, so RESTORE only opens
 * the confirm overlay — the OK handler in main.js performs the swap.
 *
 * @param {{onRequestRestore?:(index:number,entry:Object)=>void, onAfterDelete?:()=>void}} [hooks]
 * @returns {void}
 */
export function renderArchiveView(hooks){
  const host = document.getElementById('archive-list');
  if(!host) return;
  const list = getArchive();
  if(!list.length){
    host.innerHTML = '<div class="archive-empty">// NO PAST ATTEMPTS YET</div>';
    return;
  }
  host.innerHTML = list.map((e, i) => {
    const sum = e && e.summary ? e.summary : { daysComplete:0, longestStreak:0, totalPages:0, finalDay:0 };
    const restoreDisabled = !(e && e.state) ? 'disabled title="No state stored"' : '';
    return `
      <div class="archive-row" data-idx="${i}">
        <div class="archive-row-head">
          <div class="archive-row-name">${escapeHtml(e.name || '— UNNAMED —')}</div>
          <div class="archive-row-range">// ${escapeHtml(formatRange(e))}</div>
        </div>
        <div class="archive-row-stats">
          <span><strong>${sum.daysComplete}</strong> days complete</span>
          <span><strong>${sum.longestStreak}</strong> longest streak</span>
          <span><strong>${sum.totalPages}</strong> pages</span>
          <span>final day <strong>${sum.finalDay}</strong></span>
        </div>
        <div class="archive-row-actions">
          <button type="button" class="btn-sm archive-restore-btn" data-idx="${i}" ${restoreDisabled}>RESTORE</button>
          <button type="button" class="btn-row archive-delete-btn" data-idx="${i}">DELETE FROM ARCHIVE</button>
        </div>
      </div>`;
  }).join('');

  host.querySelectorAll('.archive-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const fresh = getArchive();
      const entry = fresh[idx];
      if(!entry) return;
      if(hooks && typeof hooks.onRequestRestore === 'function'){
        hooks.onRequestRestore(idx, entry);
      }
    });
  });
  host.querySelectorAll('.archive-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if(deleteArchiveEntry(idx)){
        renderArchiveView(hooks);
        if(hooks && typeof hooks.onAfterDelete === 'function') hooks.onAfterDelete();
      }
    });
  });
}
