import { THEME_KEY } from './constants.js';

export function applyTheme(){
  const dark=localStorage.getItem(THEME_KEY)!=='light';
  document.body.classList.toggle('light-mode',!dark);
  document.getElementById('theme-btn').textContent=dark?'☀️':'🌑';
}

export function toggleTheme(){
  const isDark=!document.body.classList.contains('light-mode');
  localStorage.setItem(THEME_KEY,isDark?'light':'dark');
  applyTheme();
}
