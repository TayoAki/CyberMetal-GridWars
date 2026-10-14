// Shared helpers for the core art pack (player, objects, spells, effects, chip art).
import { rect, px, line, ellipse, disc, ring, poly, shade, mix } from '../pixel.js';
import { floorPoint } from '../layout.js';

export const OUTLINE = '#0c0f1c';

// Element ramps: [core, light, mid, dark] — effects tint with these.
export const ELEMENT_RAMP = Object.freeze({
  null: ['#ffffff', '#e2ecff', '#9fb4f0', '#5466b0'],
  fire: ['#fff6c8', '#ffd23f', '#ff7a1f', '#c42e18'],
  aqua: ['#effcff', '#8fe2ff', '#3a9cff', '#1f4fc0'],
  elec: ['#ffffff', '#fff27a', '#ffcf1f', '#b07410'],
  wood: ['#f0ffd8', '#acf27a', '#3fbe3a', '#1c742a'],
});

export function ramp(element) {
  return ELEMENT_RAMP[element] ?? ELEMENT_RAMP.null;
}

// Deterministic hash of a few numbers -> [0, 1). Effects use it instead of Math.random so frames are stable.
export function hash(...ns) {
  let h = 0x2545f491;
  for (const n of ns) {
    h = Math.imul(h ^ (Math.round(n * 977) | 0), 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca77);
    h ^= h >>> 13;
  }
  return (h >>> 0) / 4294967296;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function withAlpha(ctx, a, fn) {
  if (a <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, a);
  fn();
  ctx.globalAlpha = prev;
}

// Screen offset from panel (c0, r0) to panel (c1, r1); works for fractional coordinates.
export function cellDelta(c0, r0, c1, r1) {
  const a = floorPoint(c0, r0);
  const b = floorPoint(c1, r1);
  return { dx: b.x - a.x, dy: b.y - a.y };
}

// x of the end of a shot that travels from fx.col to fx.toCol, relative to x.
export function shotEndX(fx, x) {
  if (fx.toCol === undefined || fx.toCol === null) return x + (fx.dir ?? 1) * 240;
  return x + cellDelta(fx.col ?? 0, fx.row ?? 0, fx.toCol, fx.row ?? 0).dx;
}

// ---------------------------------------------------------------- layered pixel-string composition

// Build one sprite from layered pixel-string parts. Each layer is { rows, x, y, contour }: (x, y) is the
// layer's top-left in the canvas. Where a layer lies over earlier art, a 1px contour ('k') is stamped
// around it so overlapping limbs stay readable after the single outer outline. Results are cached by key
// (the cache key must identify the layers), and the same array is returned so sprite() can cache bitmaps.
const composeCache = new Map();
export function compose(key, w, h, layers) {
  let out = composeCache.get(key);
  if (out) return out;
  const grid = Array.from({ length: h }, () => new Array(w).fill('.'));
  for (const L of layers) {
    if (!L || !L.rows) continue;
    const rows = L.rows;
    const ox = L.x | 0;
    const oy = L.y | 0;
    const solid = (cx, cy) => {
      const r = rows[cy];
      if (!r) return false;
      const ch = r[cx];
      return ch !== undefined && ch !== '.' && ch !== ' ';
    };
    let maxW = 0;
    for (const r of rows) maxW = Math.max(maxW, r.length);
    if (L.contour !== false) {
      for (let cy = -1; cy <= rows.length; cy++) {
        for (let cx = -1; cx <= maxW; cx++) {
          if (solid(cx, cy)) continue;
          if (!(solid(cx - 1, cy) || solid(cx + 1, cy) || solid(cx, cy - 1) || solid(cx, cy + 1))) continue;
          const gx = ox + cx;
          const gy = oy + cy;
          if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
          if (grid[gy][gx] !== '.') grid[gy][gx] = 'k';
        }
      }
    }
    for (let cy = 0; cy < rows.length; cy++) {
      const r = rows[cy];
      for (let cx = 0; cx < r.length; cx++) {
        if (!solid(cx, cy)) continue;
        const gx = ox + cx;
        const gy = oy + cy;
        if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
        grid[gy][gx] = r[cx];
      }
    }
  }
  out = Object.freeze(grid.map((r) => r.join('')));
  composeCache.set(key, out);
  return out;
}

// Pad ragged rows to equal length (authoring convenience) — cached per array.
const padCache = new WeakMap();
export function padRows(rows) {
  let out = padCache.get(rows);
  if (out) return out;
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  out = Object.freeze(rows.map((r) => r.padEnd(w, '.')));
  padCache.set(rows, out);
  return out;
}

// A palette that paints every key one colour (silhouettes, glows).
const SOLID_KEYS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*+=-~^';
const solidCache = new Map();
export function solidPalette(color) {
  let p = solidCache.get(color);
  if (!p) {
    p = {};
    for (const ch of SOLID_KEYS) p[ch] = color;
    p = Object.freeze(p);
    solidCache.set(color, p);
  }
  return p;
}

// ---------------------------------------------------------------- small drawing helpers

// 4- or 8-point sparkle.
export function sparkle(ctx, x, y, r, color, core = '#ffffff', diag = false) {
  x = Math.round(x);
  y = Math.round(y);
  if (r <= 0) {
    px(ctx, x, y, core);
    return;
  }
  rect(ctx, x - r, y, r * 2 + 1, 1, color);
  rect(ctx, x, y - r, 1, r * 2 + 1, color);
  if (diag && r > 1) {
    const d = Math.max(1, r - 2);
    for (let i = 1; i <= d; i++) {
      px(ctx, x - i, y - i, color);
      px(ctx, x + i, y - i, color);
      px(ctx, x - i, y + i, color);
      px(ctx, x + i, y + i, color);
    }
  }
  px(ctx, x, y, core);
}

// A lightning bolt from (x0, y0) to (x1, y1) with `n` jagged segments; seed picks the jag pattern.
export function bolt(ctx, x0, y0, x1, y1, n, jag, color, seed = 0, core = null) {
  let px0 = x0;
  let py0 = y0;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const off = i === n ? 0 : (hash(seed, i) * 2 - 1) * jag;
    const qx = x0 + dx * k + nx * off;
    const qy = y0 + dy * k + ny * off;
    line(ctx, px0, py0, qx, qy, color);
    if (core) line(ctx, px0, py0 + 1, qx, qy + 1, core);
    px0 = qx;
    py0 = qy;
  }
}

// Flame tongue: a teardrop that flickers. (x, y) = base centre, h = height, w = half width.
export function flameTongue(ctx, x, y, w, h, t, seed, cols) {
  const [c0, c1, c2, c3] = cols;
  const sway = Math.round(Math.sin((t + seed * 7) / 3) * Math.min(2, w / 2));
  const tipX = x + sway;
  const outer = [
    [x - w, y],
    [x - w, y - h * 0.35],
    [tipX - Math.max(1, w * 0.4), y - h * 0.75],
    [tipX, y - h],
    [tipX + Math.max(1, w * 0.4), y - h * 0.7],
    [x + w, y - h * 0.3],
    [x + w, y],
  ];
  poly(ctx, outer, c3);
  const w2 = Math.max(1, w - 1);
  const h2 = h * 0.82;
  poly(ctx, [[x - w2, y], [x - w2, y - h2 * 0.35], [tipX, y - h2], [x + w2, y - h2 * 0.35], [x + w2, y]], c2);
  const w3 = Math.max(1, Math.round(w * 0.55));
  const h3 = h * 0.55;
  poly(ctx, [[x - w3, y], [x - w3, y - h3 * 0.4], [x + Math.round(sway / 2), y - h3], [x + w3, y - h3 * 0.4], [x + w3, y]], c1);
  if (w >= 3) rect(ctx, x - 1, y - Math.round(h * 0.25), 2, Math.round(h * 0.2), c0);
}

// Dithered disc (checkerboard) for soft smoke.
export function ditherDisc(ctx, cx, cy, r, color, phase = 0) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.round(r);
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(r * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((r + 0.5) * (r + 0.5)))));
    for (let dx = -w; dx <= w; dx++) if (((dx + dy + phase) & 1) === 0) ctx.fillRect(cx + dx, cy + dy, 1, 1);
  }
}

// Ellipse outline with pixel-exact points.
export function ellipseRing(ctx, cx, cy, rx, ry, color, from = 0, to = Math.PI * 2) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  if (rx <= 0 || ry <= 0) return;
  const steps = Math.max(16, Math.ceil(Math.PI * 2 * Math.max(rx, ry) * 1.6 * ((to - from) / (Math.PI * 2))));
  ctx.fillStyle = color;
  let lx = null;
  let ly = null;
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const x = Math.round(cx + Math.cos(a) * rx);
    const y = Math.round(cy + Math.sin(a) * ry);
    if (x === lx && y === ly) continue;
    ctx.fillRect(x, y, 1, 1);
    lx = x;
    ly = y;
  }
}

// A crescent between two elliptic arcs sharing their ends (used for sword arcs and waves).
// The crescent bulges toward `dir` horizontally; (cx, cy) is the chord centre.
export function crescent(ctx, cx, cy, rxOut, rxIn, ry, dir, color, from = -Math.PI / 2, to = Math.PI / 2) {
  const pts = [];
  const n = Math.max(8, Math.round(ry));
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * rxOut * dir, cy + Math.sin(a) * ry]);
  }
  for (let i = n; i >= 0; i--) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + Math.cos(a) * rxIn * dir, cy + Math.sin(a) * ry]);
  }
  poly(ctx, pts, color);
}

// A tapered streak (thick in the middle) from (x0, y0) to (x1, y1).
export function streak(ctx, x0, y0, x1, y1, w, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w;
  const ny = (dx / len) * w;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  poly(ctx, [[x0, y0], [mx + nx, my + ny], [x1, y1], [mx - nx, my - ny]], color);
}

export { rect, px, line, ellipse, disc, ring, poly, shade, mix };
