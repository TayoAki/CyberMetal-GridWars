import { rect, line, px, shade } from './pixel.js';
import { SCREEN_W, SCREEN_H } from './layout.js';

// Animated cyberspace backdrops, one palette per area. Drawn with primitives every frame.

export const THEMES = {
  boot: { sky: '#0b1a3a', mid: '#13306a', grid: '#2a5cc0', glyph: '#5aa8ff', accent: '#9fe0ff' },
  yards: { sky: '#1a1030', mid: '#3a1a5a', grid: '#7a3ac0', glyph: '#c07aff', accent: '#ffd0ff' },
  coolant: { sky: '#06222a', mid: '#0c4048', grid: '#1a8a90', glyph: '#5ae0d8', accent: '#c0fff8' },
  thermal: { sky: '#2a0c08', mid: '#5a1a0c', grid: '#c04a1a', glyph: '#ff9a4a', accent: '#ffe0a0' },
  foundry: { sky: '#141618', mid: '#2a2e34', grid: '#5a6470', glyph: '#a0aab8', accent: '#e8f0ff' },
  overgrowth: { sky: '#0a1a0c', mid: '#14361a', grid: '#2a7a34', glyph: '#7ad86a', accent: '#d8ffc0' },
  rival: { sky: '#200810', mid: '#4a1020', grid: '#a02040', glyph: '#ff5a7a', accent: '#ffd0d8' },
  void: { sky: '#050308', mid: '#140a20', grid: '#3a1a5a', glyph: '#8a3aff', accent: '#ff3ae0' },
  title: { sky: '#081028', mid: '#10285a', grid: '#1e50b0', glyph: '#4aa0ff', accent: '#a0e8ff' },
};

// Deterministic pseudo-random for decoration placement.
function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = n + (n << 3);
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export function drawBackground(ctx, themeKey, t) {
  const th = THEMES[themeKey] ?? THEMES.boot;
  // Vertical gradient bands.
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    const k = i / (bands - 1);
    rect(ctx, 0, Math.floor((i * SCREEN_H) / bands), SCREEN_W, Math.ceil(SCREEN_H / bands) + 1, shade(th.sky, k * 0.25));
  }
  // Perspective grid floor in the upper area (behind the field).
  const horizon = 58;
  const scroll = (t * 0.35) % 12;
  for (let i = 0; i < 9; i++) {
    const y = horizon - 4 - ((i * 12 + scroll) % 60) * 0.9;
    if (y < 4) continue;
    rect(ctx, 0, Math.round(y), SCREEN_W, 1, i % 3 === 0 ? th.grid : shade(th.grid, -0.35));
  }
  for (let i = -6; i <= 6; i++) {
    const x0 = SCREEN_W / 2 + i * 22;
    line(ctx, x0, horizon, SCREEN_W / 2 + i * 70, 4, shade(th.grid, -0.45));
  }
  // Floating data glyphs drifting upward.
  for (let i = 0; i < 26; i++) {
    const sx = Math.floor(hash(i * 7 + 1) * SCREEN_W);
    const speed = 0.15 + hash(i * 13 + 5) * 0.35;
    const y = SCREEN_H - ((t * speed + hash(i * 3 + 2) * 200) % 200);
    if (y < 0 || y > SCREEN_H) continue;
    const c = hash(i * 17) > 0.7 ? th.accent : th.glyph;
    const kind = Math.floor(hash(i * 5 + 9) * 3);
    if (kind === 0) {
      rect(ctx, sx, y, 2, 2, c);
    } else if (kind === 1) {
      rect(ctx, sx, y, 1, 4, shade(c, -0.3));
      rect(ctx, sx + 2, y + 1, 1, 3, shade(c, -0.3));
    } else {
      px(ctx, sx, y, c);
      px(ctx, sx + 1, y + 1, shade(c, -0.4));
    }
  }
  // Soft horizontal light band.
  rect(ctx, 0, horizon, SCREEN_W, 1, shade(th.accent, -0.5));
}
