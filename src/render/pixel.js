// Pixel-exact drawing on the 240x160 buffer. Everything snaps to integer pixels and is drawn with
// fillRect (or cached bitmaps), so scaled-up output stays crisp. Colours are CSS strings.

export function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

export function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function frame(ctx, x, y, w, h, color) {
  rect(ctx, x, y, w, 1, color);
  rect(ctx, x, y + h - 1, w, 1, color);
  rect(ctx, x, y, 1, h, color);
  rect(ctx, x + w - 1, y, 1, h, color);
}

export function hline(ctx, x0, x1, y, color) {
  const a = Math.round(Math.min(x0, x1));
  const b = Math.round(Math.max(x0, x1));
  rect(ctx, a, y, b - a + 1, 1, color);
}

export function vline(ctx, x, y0, y1, color) {
  const a = Math.round(Math.min(y0, y1));
  const b = Math.round(Math.max(y0, y1));
  rect(ctx, x, a, 1, b - a + 1, color);
}

// Bresenham line.
export function line(ctx, x0, y0, x1, y1, color) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Filled ellipse/disc with pixel-exact rows.
export function ellipse(ctx, cx, cy, rx, ry, color) {
  if (rx <= 0 || ry <= 0) return;
  ctx.fillStyle = color;
  cx = Math.round(cx);
  cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

export function disc(ctx, cx, cy, r, color) {
  ellipse(ctx, cx, cy, r, r, color);
}

// Circle outline (midpoint).
export function ring(ctx, cx, cy, r, color) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  r = Math.round(r);
  ctx.fillStyle = color;
  let x = r;
  let y = 0;
  let err = 1 - r;
  while (x >= y) {
    for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) ctx.fillRect(cx + a, cy + b, 1, 1);
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
}

// Filled polygon via scanlines. points: [[x, y], ...]
export function poly(ctx, points, color) {
  if (points.length < 3) return;
  ctx.fillStyle = color;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.round(xs[i]);
      const b = Math.round(xs[i + 1]);
      if (b >= a) ctx.fillRect(a, y, b - a + 1, 1);
    }
  }
}

// ---------------------------------------------------------------- colour helpers

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// amount > 0 lightens toward white, < 0 darkens toward black.
export function shade(hex, amount) {
  const [r, g, b] = hexToRgb(hex);
  if (amount >= 0) return rgbToHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
  return rgbToHex([r * (1 + amount), g * (1 + amount), b * (1 + amount)]);
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

// ---------------------------------------------------------------- pixel-string sprites

// A pixel-string sprite is an array of equal-length strings; each char is a palette key and '.' (or ' ')
// is transparent. Rendered bitmaps are cached per (rows, palette, flip, outline) so drawing is one
// drawImage call.
//
//   sprite(ctx, ROWS, { a: '#fff', b: '#08f' }, x, y, { flip: true, outline: '#102030', anchor: 'feet' })
//
// anchor 'topleft' (default): (x, y) is the top-left corner.
// anchor 'feet': (x, y) is the bottom-centre (where the feet touch the floor).

const spriteCache = new Map();
let paletteIds = new WeakMap();
let nextPaletteId = 1;
let rowIds = new WeakMap();
let nextRowId = 1;

function idOf(map, obj, counter) {
  let id = map.get(obj);
  if (!id) {
    id = counter();
    map.set(obj, id);
  }
  return id;
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function spriteSize(rows) {
  return { w: rows[0]?.length ?? 0, h: rows.length };
}

export function spriteBitmap(rows, palette, flip = false, outline = null) {
  const rid = idOf(rowIds, rows, () => nextRowId++);
  const pid = idOf(paletteIds, palette, () => nextPaletteId++);
  const key = `${rid}:${pid}:${flip ? 1 : 0}:${outline ?? ''}`;
  let bmp = spriteCache.get(key);
  if (bmp) return bmp;
  const pad = outline ? 1 : 0;
  const w = rows[0].length + pad * 2;
  const h = rows.length + pad * 2;
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  const at = (x, y) => {
    const row = rows[y];
    if (!row) return '.';
    const ch = row[flip ? row.length - 1 - x : x];
    return ch ?? '.';
  };
  const solid = (x, y) => {
    const ch = at(x, y);
    return ch !== '.' && ch !== ' ' && ch !== undefined && palette[ch] !== undefined;
  };
  if (outline) {
    g.fillStyle = outline;
    for (let y = -1; y <= rows.length; y++) {
      for (let x = -1; x <= rows[0].length; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) g.fillRect(x + pad, y + pad, 1, 1);
      }
    }
  }
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[0].length; x++) {
      const ch = at(x, y);
      const c = palette[ch];
      if (ch === '.' || ch === ' ' || !c) continue;
      g.fillStyle = c;
      g.fillRect(x + pad, y + pad, 1, 1);
    }
  }
  bmp = { canvas, w, h, pad };
  spriteCache.set(key, bmp);
  return bmp;
}

export function sprite(ctx, rows, palette, x, y, opts = {}) {
  const bmp = spriteBitmap(rows, palette, !!opts.flip, opts.outline ?? null);
  let dx = Math.round(x) - bmp.pad;
  let dy = Math.round(y) - bmp.pad;
  if (opts.anchor === 'feet') {
    dx = Math.round(x - rows[0].length / 2) - bmp.pad;
    dy = Math.round(y - rows.length) - bmp.pad;
  } else if (opts.anchor === 'center') {
    dx = Math.round(x - rows[0].length / 2) - bmp.pad;
    dy = Math.round(y - rows.length / 2) - bmp.pad;
  }
  if (opts.alpha !== undefined && opts.alpha < 1) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * opts.alpha;
    ctx.drawImage(bmp.canvas, dx, dy);
    ctx.globalAlpha = a;
  } else ctx.drawImage(bmp.canvas, dx, dy);
}

// Swap palette entries (e.g. per-level recolours) without re-authoring rows. Cached per (base, overrides).
const recolorCache = new Map();
export function recolor(palette, overrides) {
  const key = JSON.stringify([idOf(paletteIds, palette, () => nextPaletteId++), overrides]);
  let p = recolorCache.get(key);
  if (!p) {
    p = Object.freeze({ ...palette, ...overrides });
    recolorCache.set(key, p);
  }
  return p;
}

// Draw with a horizontal mirror around x = cx when facing < 0 (for primitive-drawn sprites).
export function mirrored(ctx, cx, facing, fn) {
  if (facing >= 0) return fn();
  ctx.save();
  ctx.translate(Math.round(cx) * 2 + 1, 0);
  ctx.scale(-1, 1);
  fn();
  ctx.restore();
}

// Flash/tint: draw `fn` into a temp buffer and fill it with `color` (white hit-flash, red damage, etc.).
let tintCanvas = null;
export function tinted(ctx, color, alpha, fn, bounds = { x: 0, y: 0, w: 240, h: 160 }) {
  if (!tintCanvas) tintCanvas = makeCanvas(240, 160);
  const g = tintCanvas.getContext('2d');
  g.clearRect(0, 0, 240, 160);
  fn(g);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, 240, 160);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(tintCanvas, bounds.x, bounds.y, bounds.w, bounds.h, bounds.x, bounds.y, bounds.w, bounds.h);
}

export function clearCaches() {
  spriteCache.clear();
  recolorCache.clear();
  paletteIds = new WeakMap();
  rowIds = new WeakMap();
}
