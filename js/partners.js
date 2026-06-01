/**
 * @file Accountability-partner snapshots (w5c item 45).
 *
 * Each "partner" is a frozen share-link snapshot the user pasted in.
 * We store up to {@link MAX_PARTNERS} of them in the settings blob
 * (NOT the schema-versioned state) so adding/removing partners stays
 * a settings concern and doesn't trigger a schema migration.
 *
 * Stored shape per partner:
 *
 *   { name, dayN, streak, done, lastUpdated, grid }
 *
 * The `grid` 75-char string is kept so we can render the partner's
 * progress visually later if we want; for now the Today-tab panel
 * shows name + day + streak only.
 *
 * Pure client-side: there's no polling, no backend, no auth. Users
 * "refresh" each other by re-pasting a fresh share URL.
 */

import { TOTAL } from './constants.js';
import { getSettings, saveSettings } from './settings.js';
import { decodeShareFragment } from './share.js';
import { calcStreak, calcCurrentDay, getState } from './state.js';

/** Hard cap on stored partners. Keeps the settings JSON small. */
export const MAX_PARTNERS = 3;

/**
 * @typedef {Object} Partner
 * @property {string} name        Display name from the friend's snapshot (uppercase).
 * @property {number} dayN        Friend's current challenge day (1..TOTAL).
 * @property {number} streak      Friend's streak at snapshot time.
 * @property {number} done        Friend's total complete days at snapshot time.
 * @property {string} grid        75-char "1"/"0" completion grid.
 * @property {number} lastUpdated Unix ms timestamp of the snapshot they shared
 *                                (i.e. snap.ts at the time of generation).
 */

/**
 * Read the partners list from settings, with defensive validation.
 * Always returns an array — never null — so callers can `for..of`
 * without nullchecks.
 * @returns {Partner[]}
 */
export function getPartners(){
  const settings = getSettings();
  const list = Array.isArray(settings.partners) ? settings.partners : [];
  return list
    .filter(p => p && typeof p === 'object'
      && typeof p.name === 'string'
      && typeof p.dayN === 'number'
      && typeof p.streak === 'number'
      && typeof p.done === 'number'
      && typeof p.grid === 'string'
      && p.grid.length === TOTAL)
    .slice(0, MAX_PARTNERS);
}

/**
 * Persist `partners` (or a callback's return value) back to settings.
 * Centralises the saveSettings call so callers can stay terse.
 * @param {Partner[]} next
 * @returns {void}
 */
function setPartners(next){
  saveSettings({ partners: (next || []).slice(0, MAX_PARTNERS) });
}

/**
 * Validate a raw share URL/payload and turn it into a {@link Partner}.
 * Returns `null` if the payload doesn't parse — callers should surface
 * a "this share link isn't valid" toast in that case.
 *
 * @param {string} rawUrl
 * @returns {?Partner}
 */
export function partnerFromShareUrl(rawUrl){
  const snap = decodeShareFragment(rawUrl);
  if(!snap) return null;
  return {
    name: (snap.name || 'SOLDIER').toString().toUpperCase().slice(0, 32),
    dayN: snap.day,
    streak: snap.streak,
    done: snap.done,
    grid: snap.grid,
    lastUpdated: snap.ts || Date.now(),
  };
}

/**
 * Add a partner from a share URL. Validates, deduplicates by name
 * (case-insensitive — re-adding the same name *updates* the partner),
 * and enforces {@link MAX_PARTNERS}.
 *
 * @param {string} rawUrl
 * @returns {{ok:boolean, reason?:string, partner?:Partner}}
 */
export function addPartnerFromUrl(rawUrl){
  const p = partnerFromShareUrl(rawUrl);
  if(!p) return { ok: false, reason: 'Invalid share link' };
  const existing = getPartners();
  // Dedup by case-insensitive name: replace in place to act as a refresh.
  const idx = existing.findIndex(x => x.name.toUpperCase() === p.name.toUpperCase());
  if(idx >= 0){
    existing[idx] = p;
    setPartners(existing);
    return { ok: true, partner: p };
  }
  if(existing.length >= MAX_PARTNERS){
    return { ok: false, reason: `Maximum ${MAX_PARTNERS} partners — remove one first` };
  }
  existing.push(p);
  setPartners(existing);
  return { ok: true, partner: p };
}

/**
 * Remove the partner whose `name` matches (case-insensitive).
 * No-op if not present.
 * @param {string} name
 * @returns {boolean} true if a partner was removed.
 */
export function removePartner(name){
  const before = getPartners();
  const after = before.filter(p => p.name.toUpperCase() !== String(name || '').toUpperCase());
  if(after.length === before.length) return false;
  setPartners(after);
  return true;
}

/**
 * Build a small comparison record per partner against the current
 * user's own streak. Used by the Today-tab panel to color-code each
 * partner (green if their streak >= mine, red if shorter).
 *
 * `myStreak` is passed in (not read off state directly) so the helper
 * is straightforward to test.
 *
 * @param {Partner[]} partners
 * @param {number} myStreak
 * @returns {Array<{partner:Partner, deltaStreak:number, status:'lead'|'tie'|'behind'}>}
 */
export function comparePartners(partners, myStreak){
  return (partners || []).map(p => {
    const delta = p.streak - myStreak;
    let status;
    if(delta > 0) status = 'lead';
    else if(delta < 0) status = 'behind';
    else status = 'tie';
    return { partner: p, deltaStreak: delta, status };
  });
}

/**
 * Render the "// PARTNERS" panel on the Today tab. No-op when there
 * are no partners stored (the host element is hidden).
 *
 * @param {Element} host  Container `<div id="partners-panel">` from index.html.
 * @returns {void}
 */
export function renderPartnersPanel(host){
  if(!host) return;
  const partners = getPartners();
  if(!partners.length){
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }
  const s = getState();
  const myStreak = s ? calcStreak(s) : 0;
  const myDay = calcCurrentDay();
  const compared = comparePartners(partners, myStreak);

  const rows = compared.map(({partner, status}) => {
    const aheadBehind = status === 'lead'
      ? `+${partner.streak - myStreak} ahead`
      : status === 'behind'
        ? `${myStreak - partner.streak} behind`
        : 'tied';
    const dayDiff = partner.dayN - myDay;
    const dayLabel = dayDiff === 0 ? 'same day' : (dayDiff > 0 ? `+${dayDiff}d` : `${dayDiff}d`);
    return `
      <div class="partner-row partner-${status}">
        <div class="partner-main">
          <div class="partner-name">${escapeHtml(partner.name)}</div>
          <div class="partner-meta">// DAY ${partner.dayN} — STREAK ${partner.streak} (${aheadBehind}, ${dayLabel})</div>
        </div>
        <button type="button" class="btn-row partner-refresh" data-partner="${escapeHtml(partner.name)}">REFRESH</button>
      </div>
    `;
  }).join('');

  host.innerHTML = `
    <div class="section partners-section">
      <div class="section-title">// PARTNERS</div>
      <div class="partners-list">${rows}</div>
      <div class="partners-refresh-row" id="partners-refresh-row" style="display:none;">
        <input type="text" class="partners-input" id="partners-refresh-input" placeholder="Paste fresh share URL...">
        <button type="button" class="btn-sm" id="partners-refresh-submit">UPDATE</button>
        <button type="button" class="btn-row" id="partners-refresh-cancel">CANCEL</button>
      </div>
      <div class="partners-status" id="partners-status"></div>
    </div>
  `;
  host.style.display = 'block';

  // Per-row REFRESH buttons open the input prefilled with the partner name target.
  host.querySelectorAll('.partner-refresh').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = host.querySelector('#partners-refresh-row');
      const input = host.querySelector('#partners-refresh-input');
      const status = host.querySelector('#partners-status');
      if(row) row.style.display = 'flex';
      if(input){
        input.value = '';
        input.dataset.target = btn.dataset.partner || '';
        input.focus();
      }
      if(status) status.textContent = `// PASTE A FRESH SHARE URL FOR ${btn.dataset.partner || ''}`;
    });
  });
  const cancel = host.querySelector('#partners-refresh-cancel');
  if(cancel){
    cancel.addEventListener('click', () => {
      const row = host.querySelector('#partners-refresh-row');
      const status = host.querySelector('#partners-status');
      if(row) row.style.display = 'none';
      if(status) status.textContent = '';
    });
  }
  const submit = host.querySelector('#partners-refresh-submit');
  if(submit){
    submit.addEventListener('click', () => {
      const input = host.querySelector('#partners-refresh-input');
      const status = host.querySelector('#partners-status');
      if(!input) return;
      const result = addPartnerFromUrl(input.value);
      if(!result.ok){
        if(status) status.textContent = '// ' + (result.reason || 'INVALID');
        return;
      }
      // Re-render (saveSettings fired 'settings:changed' which the main
      // module subscribes to — main.js calls renderPartnersPanel from
      // renderAll, so this self-heals on the next tick. We still close
      // the input here for snappier feedback.)
      const row = host.querySelector('#partners-refresh-row');
      if(row) row.style.display = 'none';
      renderPartnersPanel(host);
    });
  }
}

/**
 * Same as the share module's helper but copied locally so we don't
 * have to widen `share.js`'s public surface.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Test-only escape hatch — see share.js for the same pattern. */
export const _internal = { escapeHtml, setPartners };
