import { rect, frame, shade } from '../render/pixel.js';
import { drawText } from '../render/font.js';

// Shared UI pieces for menus: windows, list menus with a cursor, key hints.

export const UI = {
  win: '#0c1638',
  winLine: '#0f1a42',
  border: '#8ab0ff',
  borderDim: '#2a3c7a',
  text: '#ffffff',
  sub: '#a8b8e8',
  dim: '#5a70b0',
  gold: '#ffe04a',
  good: '#7affb0',
  bad: '#ff7a7a',
};

export function drawWindow(ctx, x, y, w, h, opts = {}) {
  rect(ctx, x, y, w, h, opts.fill ?? UI.win);
  if (!opts.flat) for (let yy = y + 2; yy < y + h - 1; yy += 4) rect(ctx, x + 1, yy, w - 2, 1, UI.winLine);
  frame(ctx, x, y, w, h, opts.border ?? UI.border);
  frame(ctx, x + 1, y + 1, w - 2, h - 2, shade(opts.border ?? UI.border, -0.6));
  if (opts.title) {
    rect(ctx, x + 1, y + 1, w - 2, 11, shade(opts.border ?? UI.border, -0.55));
    drawText(ctx, opts.title, x + 5, y + 3, opts.titleColor ?? UI.gold);
  }
}

// items: [{ label, sub?, disabled?, color? }]
export function drawMenu(ctx, items, cursor, x, y, opts = {}) {
  const lh = opts.lineHeight ?? 12;
  const t = opts.t ?? 0;
  items.forEach((it, i) => {
    const yy = y + i * lh;
    const sel = i === cursor;
    if (sel) {
      rect(ctx, x - 2, yy - 2, (opts.width ?? 100) + 4, lh - 1, 'rgba(138,176,255,0.18)');
      drawText(ctx, '>', x - 9 + (t % 30 < 15 ? 0 : 1), yy, UI.gold);
    }
    const color = it.disabled ? UI.dim : (it.color ?? (sel ? UI.gold : UI.text));
    drawText(ctx, it.label, x, yy, color);
    if (it.sub) drawText(ctx, it.sub, x + (opts.width ?? 100), yy, it.disabled ? UI.dim : UI.sub, { align: 'right' });
  });
}

export function drawHints(ctx, text, y = 150) {
  rect(ctx, 0, y - 2, 240, 12, 'rgba(5,7,15,0.85)');
  drawText(ctx, text, 120, y, UI.dim, { align: 'center' });
}

// Menu cursor helper: returns the new index for up/down repeat presses.
export function moveCursor(edges, index, count, wrap = true) {
  if (count <= 0) return 0;
  let i = index;
  if (edges.repeat.up) i--;
  if (edges.repeat.down) i++;
  if (wrap) i = (i + count) % count;
  else i = Math.max(0, Math.min(count - 1, i));
  return i;
}
