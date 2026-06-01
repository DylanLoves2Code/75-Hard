/**
 * @file Tiny pub/sub event bus used to break the upward `renderAll`
 * cycle between feature modules (`tasks`, `water`, `modal`) and the
 * entry point. Feature modules `emit('state:changed', s)` after
 * mutating state; `main.js` subscribes and re-renders.
 *
 * No dependencies, no DOM, no globals.
 */

/** @type {Map<string, Set<Function>>} */
const subs = new Map();

/**
 * Subscribe `handler` to `eventName`. Idempotent — adding the same
 * handler twice still only fires it once per emit.
 * @param {string} eventName
 * @param {Function} handler
 * @returns {void}
 */
export function on(eventName, handler){
  let set = subs.get(eventName);
  if(!set){ set = new Set(); subs.set(eventName, set); }
  set.add(handler);
}

/**
 * Unsubscribe `handler` from `eventName`. No-op if not subscribed.
 * @param {string} eventName
 * @param {Function} handler
 * @returns {void}
 */
export function off(eventName, handler){
  const set = subs.get(eventName);
  if(set) set.delete(handler);
}

/**
 * Fire `eventName`, invoking each subscriber with `args`. Subscriber
 * exceptions are logged and swallowed so one bad handler can't block
 * the others.
 * @param {string} eventName
 * @param {...any} args
 * @returns {void}
 */
export function emit(eventName, ...args){
  const set = subs.get(eventName);
  if(!set) return;
  for(const fn of set){
    try { fn(...args); }
    catch(err){ console.warn('bus handler for "'+eventName+'" threw:', err); }
  }
}
