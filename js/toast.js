/** @file Small bottom-of-screen toast notification. */

/**
 * Show a transient toast for ~1.8s with the given message.
 * Reuses an existing #toast element if present.
 * @param {string} msg
 * @returns {void}
 */
export function showToast(msg){
  let t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');t.style.cssText='position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border2);color:var(--text2);font-family:var(--font-m);font-size:0.65rem;letter-spacing:0.15em;padding:0.5rem 1.25rem;z-index:400;text-transform:uppercase;transition:opacity 0.3s;';document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._timer);t._timer=setTimeout(()=>{t.style.opacity='0';},1800);
}
