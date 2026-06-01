/** @file Light/dark theme persistence and toggling. */
import { THEME_KEY } from './constants.js';

/** Apply the persisted theme to the document body. @returns {void} */
export function applyTheme(){
  const dark=localStorage.getItem(THEME_KEY)!=='light';
  document.body.classList.toggle('light-mode',!dark);
  document.getElementById('theme-btn').textContent=dark?'☀️':'🌑';
}

/** Flip between light and dark and persist the choice. @returns {void} */
export function toggleTheme(){
  const isDark=!document.body.classList.contains('light-mode');
  localStorage.setItem(THEME_KEY,isDark?'light':'dark');
  applyTheme();
}
