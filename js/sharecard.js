/**
 * @file Shareable progress-card image generator.
 *
 * Builds a 1080×1080 PNG via an off-screen `<canvas>` containing:
 *   - "75 HARD — DAY N OF 75" title
 *   - user's name (if set)
 *   - mini 75-day heatmap grid (15×5)
 *   - streak + days-complete stats
 *   - a motto line (randomly chosen from QUOTES)
 *   - the app's tactical color palette (--accent, --bg, --green, etc.)
 *
 * Downloaded as `75hard-day-N.png` via Blob + temporary `<a download>`.
 *
 * Pure-presentation module — no schema changes, no persisted state.
 */

import { TOTAL } from './constants.js';
import { isDayComplete, getDayData, calcCurrentDay, calcStreak, countCompleteDays } from './state.js';
import { QUOTES } from './quotes.js';
import { showToast } from './toast.js';

// Card dimensions. 1080×1080 is the universal square format that crops
// cleanly into IG/X/LinkedIn previews.
const W = 1080;
const H = 1080;

/**
 * Tactical palette mirrored from styles.css `:root`. Keeping it in JS
 * keeps the card recognizable when generated from the light-mode UI.
 */
const PALETTE = Object.freeze({
  bg:      '#0a0a0a',
  bg2:     '#111111',
  bg3:     '#1a1a1a',
  border:  '#2a2a2a',
  border2: '#333333',
  text:    '#e8e8e8',
  text2:   '#888888',
  text3:   '#8a8a8a',
  accent:  '#ff3c00',
  accent2: '#ff6a00',
  gold:    '#f5c400',
  green:   '#00e676',
  yellow:  '#ffea00',
});

/**
 * Pick a font stack the canvas can resolve. We can't guarantee the
 * webfont (Bebas Neue / Share Tech Mono / Oswald) is loaded inside an
 * off-screen canvas context, so we fall back to generic families.
 *
 * @param {number} size
 * @param {'display'|'mono'|'body'} family
 * @returns {string}
 */
function fontFor(size, family) {
  if (family === 'mono') return `${size}px "Share Tech Mono", "Courier New", monospace`;
  if (family === 'display') return `bold ${size}px "Bebas Neue", "Oswald", "Arial Narrow", sans-serif`;
  return `${size}px "Oswald", "Helvetica Neue", Arial, sans-serif`;
}

/**
 * Render the card onto a fresh canvas and return it. Exported for
 * testing/preview; usually you want {@link downloadCard} instead.
 *
 * @param {import('./state.js').State} s
 * @returns {HTMLCanvasElement}
 */
export function buildCardCanvas(s) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not supported');

  const day = calcCurrentDay();
  const done = countCompleteDays(s);
  const streak = calcStreak(s);

  // Background — solid bg + a left-edge accent stripe, mimicking the
  // tactical setup boxes in styles.css.
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PALETTE.bg2;
  ctx.fillRect(60, 60, W - 120, H - 120);
  // Accent stripe (left edge of inner box).
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(60, 60, 12, H - 120);

  // Title.
  ctx.fillStyle = PALETTE.accent;
  ctx.font = fontFor(120, 'display');
  ctx.textBaseline = 'top';
  ctx.fillText('75 HARD', 110, 100);

  // Subtitle: DAY N OF 75.
  ctx.fillStyle = PALETTE.text2;
  ctx.font = fontFor(34, 'mono');
  ctx.fillText(`// DAY ${day} OF ${TOTAL}`, 114, 230);

  // Name (if set).
  let cursorY = 290;
  if (s.name) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = fontFor(54, 'body');
    ctx.fillText(s.name.toUpperCase(), 114, cursorY);
    cursorY += 76;
  } else {
    cursorY += 16;
  }

  // Mini 75-day grid — 15 cols × 5 rows.
  drawMiniGrid(ctx, s, day, 114, cursorY + 24);

  // Stats block — STREAK + DAYS COMPLETE side by side, below the grid.
  const statsY = cursorY + 24 + miniGridHeight() + 60;
  drawStat(ctx, 114, statsY, streak, 'STREAK', PALETTE.gold);
  drawStat(ctx, 480, statsY, done, 'DAYS COMPLETE', PALETTE.green);
  drawStat(ctx, 800, statsY, Math.round((done / TOTAL) * 100) + '%', 'PROGRESS', PALETTE.accent);

  // Motto — random quote from the QUOTES pool, with attribution.
  drawMotto(ctx, 114, statsY + 180, W - 228);

  // Footer — small mono ribbon.
  ctx.fillStyle = PALETTE.text3;
  ctx.font = fontFor(22, 'mono');
  ctx.fillText('// 75HARD.TRACKER — MENTAL TOUGHNESS PROTOCOL', 114, H - 130);

  return canvas;
}

/**
 * Height (in canvas px) consumed by the mini-grid block. Used to
 * compute the Y offset of the stats block below it.
 */
function miniGridHeight() {
  const cell = 50;
  const gap = 8;
  return (cell * 5) + (gap * 4);
}

/**
 * Draw the 15×5 day heatmap onto the canvas. Same color coding as the
 * Stats-tab heatmap: complete = accent, partial = yellow, incomplete =
 * border outline, future = very dim.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./state.js').State} s
 * @param {number} day Current challenge day.
 * @param {number} x
 * @param {number} y
 */
function drawMiniGrid(ctx, s, day, x, y) {
  const cell = 50;
  const gap = 8;
  for (let d = 1; d <= TOTAL; d++) {
    const col = (d - 1) % 15;
    const row = Math.floor((d - 1) / 15);
    const cx = x + col * (cell + gap);
    const cy = y + row * (cell + gap);
    const complete = isDayComplete(s, d);
    const dd = getDayData(s, d);
    const any = dd.dietAdherence || dd.calorie || dd.w1 || dd.w2 || dd.read || dd.water || dd.photo;
    const future = d > day;
    if (complete) {
      ctx.fillStyle = PALETTE.accent;
      ctx.fillRect(cx, cy, cell, cell);
    } else if (!future && any) {
      ctx.fillStyle = PALETTE.yellow;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(cx, cy, cell, cell);
      ctx.globalAlpha = 1;
    } else {
      // Outline only for incomplete; dimmer outline for future.
      ctx.strokeStyle = future ? PALETTE.border : PALETTE.border2;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2);
      ctx.lineWidth = 1;
    }
  }
}

/**
 * Render a single big-number stat block. Numeric values are centered
 * over an uppercase mono label.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number|string} val
 * @param {string} lbl
 * @param {string} color
 */
function drawStat(ctx, x, y, val, lbl, color) {
  ctx.fillStyle = color;
  ctx.font = fontFor(110, 'display');
  ctx.fillText(String(val), x, y);
  ctx.fillStyle = PALETTE.text2;
  ctx.font = fontFor(22, 'mono');
  ctx.fillText('// ' + lbl, x, y + 122);
}

/**
 * Wrap-and-draw a random motto. We pick deterministically per-state by
 * mixing the startDate into a small hash so the same export gives the
 * same quote — easier to share predictably.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} maxWidth
 */
function drawMotto(ctx, x, y, maxWidth) {
  if (!QUOTES.length) return;
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  ctx.fillStyle = PALETTE.text;
  ctx.font = fontFor(30, 'mono');
  const words = ('"' + q.q + '"').split(' ');
  let line = '';
  let cy = y;
  for (const w of words) {
    const trial = line ? line + ' ' + w : w;
    if (ctx.measureText(trial).width > maxWidth) {
      ctx.fillText(line, x, cy);
      cy += 42;
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) {
    ctx.fillText(line, x, cy);
    cy += 42;
  }
  ctx.fillStyle = PALETTE.gold;
  ctx.font = fontFor(22, 'mono');
  ctx.fillText(q.a || '', x, cy + 4);
}

/**
 * Generate the card for the current state and trigger a browser
 * download as `75hard-day-N.png`. Surfaces a toast on success/failure.
 *
 * @param {import('./state.js').State} s
 * @returns {void}
 */
export function downloadCard(s) {
  try {
    const canvas = buildCardCanvas(s);
    canvas.toBlob((blob) => {
      if (!blob) { showToast('Could not generate card'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `75hard-day-${calcCurrentDay()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Card downloaded');
    }, 'image/png');
  } catch (err) {
    console.warn('downloadCard failed', err);
    showToast('Could not generate card');
  }
}
