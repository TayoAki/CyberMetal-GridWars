// Sprite pack: bosses_a — Voltframe, Feralis, Tidecaller, Pyreclaw, their objects, spells and effects.
// See docs/CONTRACT.md "Sprites". Each registry maps a key to { draw(ctx, obj, x, y, t) }.
//
// Bodies are original pixel art built at load time: poses are skeletons of shaded shapes (ellipses,
// capsules, polygons, lit from the top-left) rasterised into pixel-string grids, then finished with
// hand-placed detail and drawn with sprite() in the house style (cached bitmaps, dark 1px outline).
// Each grid uses palette keys, so per-version palettes are plain key -> colour maps.

import { sprite, rect, px, line, ellipse, disc, ring, poly, shade, mix } from '../pixel.js';
import { floorPoint } from '../layout.js';

const OUTLINE = '#0c0f1c';
const SEP = '#'; // palette key for internal contour lines

// ---------------------------------------------------------------- load-time rasteriser

const LIGHT = (() => {
  const v = [-0.52, -0.64, 0.56];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

// mat: 4 palette keys, highlight -> shadow.
function toneOf(mat, v) {
  if (v >= 0.84) return mat[0];
  if (v >= 0.52) return mat[1];
  if (v >= 0.14) return mat[2];
  return mat[3];
}

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill('.');
  }

  at(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y * this.w + x] : '.';
  }

  put(x, y, ch) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = ch;
  }

  rows() {
    const out = [];
    for (let y = 0; y < this.h; y++) out.push(this.px.slice(y * this.w, (y + 1) * this.w).join(''));
    return out;
  }

  // Paint a shape: normalAt(x, y) returns a unit-ish normal [nx, ny, nz] at a pixel centre inside the
  // shape, or null. o.bias brightens/darkens, o.sep draws a contour onto what lies behind, o.bevel lights
  // the top/left rim and shades the bottom/right rim (machined plates), o.flat picks one tone.
  fill(bbox, normalAt, mat, o = {}) {
    const x0 = Math.max(0, Math.floor(bbox[0]));
    const y0 = Math.max(0, Math.floor(bbox[1]));
    const x1 = Math.min(this.w - 1, Math.ceil(bbox[2]));
    const y1 = Math.min(this.h - 1, Math.ceil(bbox[3]));
    const mine = new Map();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const n = normalAt(x + 0.5, y + 0.5);
        if (!n) continue;
        const v = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2] + (o.bias ?? 0);
        mine.set(y * this.w + x, v);
      }
    }
    const inside = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && mine.has(y * this.w + x);
    if (o.sep) {
      for (const k of mine.keys()) {
        const x = k % this.w;
        const y = (k / this.w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const qx = x + dx;
          const qy = y + dy;
          if (inside(qx, qy)) continue;
          const ch = this.at(qx, qy);
          if (ch !== '.' && ch !== SEP && !(o.sepSkip && o.sepSkip.includes(ch))) this.put(qx, qy, SEP);
        }
      }
    }
    for (const [k, v] of mine) {
      const x = k % this.w;
      const y = (k / this.w) | 0;
      let ch;
      if (o.flat !== undefined) ch = mat[o.flat];
      else ch = toneOf(mat, v);
      if (o.bevel) {
        if (!inside(x, y - 1) || !inside(x - 1, y)) ch = mat[o.bevel === 2 ? 0 : 1];
        else if (!inside(x, y + 1) || !inside(x + 1, y)) ch = mat[3];
      }
      this.px[k] = ch;
    }
    return this;
  }

  ellipse(cx, cy, rx, ry, mat, o) {
    return this.fill([cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1], (x, y) => {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) return null;
      return [nx, ny, Math.sqrt(1 - d)];
    }, mat, o);
  }

  // A limb or tube from (ax, ay) to (bx, by), radius ra -> rb.
  capsule(ax, ay, bx, by, ra, rb, mat, o) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const r = Math.max(ra, rb);
    return this.fill([Math.min(ax, bx) - r - 1, Math.min(ay, by) - r - 1, Math.max(ax, bx) + r + 1, Math.max(ay, by) + r + 1], (x, y) => {
      let t = ((x - ax) * dx + (y - ay) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const rr = ra + (rb - ra) * t;
      const px0 = x - (ax + dx * t);
      const py0 = y - (ay + dy * t);
      const d = Math.hypot(px0, py0);
      if (d > rr) return null;
      const nx = px0 / rr;
      const ny = py0 / rr;
      return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
    }, mat, o);
  }

  // Filled polygon with pillow shading around its bounding-box centre (o.round 0..1 sets how round).
  poly(pts, mat, o = {}) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const hw = Math.max(1, (maxX - minX) / 2);
    const hh = Math.max(1, (maxY - minY) / 2);
    const k = o.round ?? 0.7;
    return this.fill([minX - 1, minY - 1, maxX + 1, maxY + 1], (x, y) => {
      let inPoly = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inPoly = !inPoly;
      }
      if (!inPoly) return null;
      let nx = ((x - cx) / hw) * k;
      let ny = ((y - cy) / hh) * k;
      const d = nx * nx + ny * ny;
      if (d > 0.98) {
        const s = Math.sqrt(0.98 / d);
        nx *= s;
        ny *= s;
      }
      return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
    }, mat, o);
  }

  rect(x, y, w, h, mat, o) {
    return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], mat, o);
  }

  // Detail strokes with an explicit palette key.
  seg(x0, y0, x1, y1, ch) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.put(x0, y0, ch);
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
    return this;
  }

  dots(list, ch) {
    for (const [x, y] of list) this.put(x, y, ch);
    return this;
  }

  // Hand-drawn overlay: rows of palette keys, '.' transparent.
  paste(rows, x, y) {
    for (let j = 0; j < rows.length; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const ch = rows[j][i];
        if (ch !== '.' && ch !== ' ') this.put(x + i, y + j, ch);
      }
    }
    return this;
  }

  // Replace keys inside a rectangle (e.g. light a tube up).
  swap(x0, y0, x1, y1, from, to) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = from.indexOf(this.at(x, y));
        if (i >= 0) this.put(x, y, to[i]);
      }
    }
    return this;
  }
}

// ---------------------------------------------------------------- shared drawing helpers

function lvl(e) {
  const l = e?.level | 0;
  return l >= 1 && l <= 4 ? l : 1;
}

function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

function alpha(ctx, a, fn) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.max(0, Math.min(1, a));
  fn();
  ctx.globalAlpha = prev;
}

// A whole palette mapped to one colour: the Ω glow silhouette.
const glowCache = new Map();
function glowPalette(pal, color) {
  let g = glowCache.get(pal);
  if (!g || g.color !== color) {
    g = { color, pal: {} };
    for (const k of Object.keys(pal)) g.pal[k] = color;
    glowCache.set(pal, g);
  }
  return g.pal;
}

// Draw a body frame anchored at the feet, mirrored when facing left. `ox` shifts it along its facing.
function body(ctx, rows, pal, x, y, flip, o = {}) {
  const dx = flip ? -(o.ox ?? 0) : o.ox ?? 0;
  if (o.glow) {
    const gp = glowPalette(pal, o.glow);
    const a = o.glowAlpha ?? 0.5;
    alpha(ctx, a, () => {
      for (const [gx, gy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) sprite(ctx, rows, gp, x + dx + gx, y + gy + (o.oy ?? 0), { anchor: 'feet', flip, outline: o.glow });
    });
  }
  sprite(ctx, rows, pal, x + dx, y + (o.oy ?? 0), { anchor: 'feet', flip, outline: OUTLINE, alpha: o.alpha });
}

// Mirror an x offset (authored facing right) for the body's facing.
function fx(x, flip, dx) {
  return flip ? x - dx : x + dx;
}

// Small four-point spark.
function spark(ctx, x, y, r, c, core = '#ffffff') {
  rect(ctx, x - r, y, r * 2 + 1, 1, c);
  rect(ctx, x, y - r, 1, r * 2 + 1, c);
  px(ctx, x, y, core);
}

// A jagged lightning segment between two points (deterministic jitter from `seed`).
function bolt(ctx, x0, y0, x1, y1, seed, c, steps = 6, jit = 4) {
  let px0 = x0;
  let py0 = y0;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const j = i === steps ? 0 : (hash(seed * 31 + i) - 0.5) * 2 * jit;
    const nx = x0 + (x1 - x0) * k + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? j : 0);
    const ny = y0 + (y1 - y0) * k + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? 0 : j);
    line(ctx, px0, py0, nx, ny, c);
    px0 = nx;
    py0 = ny;
  }
}

// =================================================================== VOLTFRAME

// Keys: A-E chassis (light->darkest), F G H neon (hot, main, deep), I J lens (white, glow),
// K L M porcelain insulators, N O cord, P Q trim, # contour.
const VOLT_PAL = [
  { A: '#c2c8da', B: '#8e94aa', C: '#62667c', D: '#41445a', E: '#272a3a', F: '#fffbe0', G: '#ffe23a', H: '#c98a12', I: '#ffffff', J: '#fff3a8', K: '#f6f7fb', L: '#c6cad8', M: '#8a8ea6', N: '#55576a', O: '#2a2b38', P: '#cfd3de', Q: '#8b90a4', '#': OUTLINE },
  { A: '#ffffff', B: '#e2e4ea', C: '#b6b9c6', D: '#7c8094', E: '#4c5064', F: '#fbffe0', G: '#d8f03a', H: '#8aa018', I: '#ffffff', J: '#f4ffb8', K: '#f6f7fb', L: '#c6cad8', M: '#8a8ea6', N: '#5c6070', O: '#30333f', P: '#a8acbc', Q: '#6c7084', '#': OUTLINE },
  { A: '#ffb8a8', B: '#e0604e', C: '#a8343a', D: '#6e1c28', E: '#43101a', F: '#fff4d0', G: '#ffbe2e', H: '#c8700e', I: '#ffffff', J: '#ffe2a0', K: '#f6f0e8', L: '#d0c4b8', M: '#9a8a7e', N: '#58403e', O: '#2c1c1e', P: '#e8d8c8', Q: '#a89080', '#': OUTLINE },
  { A: '#6e6290', B: '#463e64', C: '#2e2846', D: '#1e1a30', E: '#120f20', F: '#fff0ff', G: '#c88aff', H: '#7a3ad0', I: '#ffffff', J: '#f0d8ff', K: '#d8d0ec', L: '#a69cc4', M: '#6c6290', N: '#3a3050', O: '#1c1630', P: '#b6a8d8', Q: '#6e5e98', '#': OUTLINE },
];
const VOLT_GLOW = '#b45cff';
const VOLT_NEON = ['#ffe23a', '#d8f03a', '#ffbe2e', '#c88aff'];

const VM = { chassis: 'ABCD', far: 'BCDE', neon: 'FFGH', lens: 'IIJG', porc: 'KKLM', cord: 'NNOO', trim: 'PPQQ', dark: 'CDEE' };
const VW = 36;
const VH = 50;

// Lens centre in frame coordinates for a pose (for glow overlays).
function voltLens(p) {
  return [23.4 + (p.headX ?? 0) + (p.lean ?? 0), 7 + (p.headY ?? 0) + (p.bob ?? 0)];
}

// pose: { bob, lean, headX, headY, lit, dim, armF/armB: [shoulder, elbow, hand], legF/legB: [hip, knee, ankle] }
function buildVolt(p) {
  const g = new Grid(VW, VH);
  const by = p.bob ?? 0;
  const lx = p.lean ?? 0;
  const U = (x, y) => [x + lx, y + by];

  // Power cord: from the small of the back to a plug on the floor behind.
  const cord = [[15.5 + lx, 31 + by], [12, 33.5], [10.5, 38], [9.5, 43], [7.2, 46.4], [4.6, 47.8]];
  for (let i = 0; i < cord.length - 1; i++) g.capsule(cord[i][0], cord[i][1], cord[i + 1][0], cord[i + 1][1], 0.8, 0.8, VM.cord);
  g.rect(1.4, 46.4, 2.8, 2.6, VM.trim, { bevel: 1 });
  g.dots([[0, 47], [0, 48]], 'P');

  // Far arm (behind the body).
  const [bs, be, bh] = p.armB;
  g.capsule(...U(...bs), ...U(...be), 1.0, 1.0, VM.far);
  g.capsule(...U(...be), ...U(...bh), 1.25, 1.0, VM.far);
  g.ellipse(...U(...bh), 1.2, 1.5, VM.dark);

  // Legs: long and thin, far one darker.
  const [, bk, ba] = p.legB;
  g.capsule(...p.legB[0], ...bk, 1.45, 1.2, VM.far);
  g.capsule(...bk, ...ba, 1.15, 0.95, VM.far);
  g.poly([[ba[0] - 2, ba[1] - 0.2], [ba[0] + 1.6, ba[1] - 0.2], [ba[0] + 3.6, ba[1] + 2], [ba[0] + 3.6, ba[1] + 2.7], [ba[0] - 2, ba[1] + 2.7]], VM.dark, { round: 0.3 });
  g.ellipse(bk[0], bk[1], 1.3, 1.3, VM.dark);
  g.put(bk[0] + 1, bk[1], 'H');
  // Pelvis.
  g.ellipse(...U(18, 31.4), 3.7, 2.3, VM.chassis);
  const [, fk, fa] = p.legF;
  g.capsule(...p.legF[0], ...fk, 1.5, 1.25, VM.chassis, { sep: true });
  g.capsule(...fk, ...fa, 1.2, 1.0, VM.chassis, { sep: true });
  g.poly([[fa[0] - 1.6, fa[1] - 0.2], [fa[0] + 1.6, fa[1] - 0.2], [fa[0] + 4.2, fa[1] + 2], [fa[0] + 4.2, fa[1] + 2.7], [fa[0] - 1.6, fa[1] + 2.7]], VM.chassis, { round: 0.3, sep: true });
  g.seg(fa[0] + 1, fa[1] + 1, fa[0] + 3, fa[1] + 2, 'G');
  g.ellipse(fk[0] + 0.2, fk[1], 1.5, 1.4, VM.porc, { sep: true });
  g.put(fk[0] + 1.2, fk[1], 'G');
  // neon stripes down the thigh and shin
  g.seg(p.legF[0][0] + 1, p.legF[0][1] + 1.5, fk[0] + 1, fk[1] - 2, 'G');
  g.seg(fk[0] + 1, fk[1] + 2, fa[0] + 0.6, fa[1] - 1.5, 'G');

  // Far shoulder cap, torso, collar.
  g.ellipse(...U(13.6, 19.6), 2.4, 2.2, VM.far);
  g.poly([U(13.4, 18.4), U(22.6, 18.4), U(21.6, 23), U(20.2, 29.2), U(15.8, 29.2), U(14.4, 23)], VM.chassis, { round: 0.55, bevel: 1 });
  g.rect(...U(15.6, 17), 4.8, 1.8, VM.dark, { bevel: 1 });
  // chest core + neon spine + ribs
  g.ellipse(...U(18.3, 22), 1.9, 1.9, 'GGHH');
  g.ellipse(...U(18.0, 21.6), 0.9, 0.9, 'FFFF');
  g.seg(...U(18, 24.2), ...U(18, 29), 'G');
  g.seg(...U(15.4, 20), ...U(16.3, 24.5), 'H');
  g.seg(...U(21.1, 20), ...U(20.2, 24.5), 'H');
  // belt
  g.rect(...U(15.2, 28.4), 5.8, 1.6, VM.trim, { bevel: 1 });

  // Neck pole with insulator discs.
  const hx = (p.headX ?? 0) + lx;
  const hy = (p.headY ?? 0) + by;
  g.capsule(18 + (hx - lx) * 0.5 + lx, 11 + hy, ...U(18, 17.4), 0.9, 0.9, VM.dark);
  g.ellipse(18 + (hx - lx) * 0.3 + lx, 13.6 + by + (hy - by) * 0.6, 2.3, 0.8, VM.porc);
  g.ellipse(...U(18, 15.8), 1.9, 0.75, VM.porc);

  // Head: a stage spotlight barrel with barn doors flaring around the lens.
  g.capsule(13.6 + hx, 7 + hy, 20.6 + hx, 7 + hy, 4.3, 4.3, VM.chassis);
  g.seg(10.6 + hx, 4 + hy, 10.6 + hx, 10 + hy, 'D');
  g.seg(12.4 + hx, 3 + hy, 12.4 + hx, 11 + hy, 'D');
  g.seg(14 + hx, 3.5 + hy, 20 + hx, 3.5 + hy, p.lit ? 'F' : 'G');
  g.seg(14 + hx, 10.5 + hy, 20 + hx, 10.5 + hy, 'H');
  for (const vx of [15.4, 17, 18.6]) g.seg(vx + hx, 5.6 + hy, vx + hx, 8.4 + hy, 'D');
  // barn doors (upper and lower flaps flaring forward)
  g.poly([[20.4 + hx, 2.6 + hy], [22.4 + hx, 1.4 + hy], [26.2 + hx, -0.2 + hy], [26.2 + hx, 0.9 + hy], [22.6 + hx, 3.2 + hy]], VM.trim, { round: 0.2, sep: true });
  g.poly([[20.4 + hx, 11.4 + hy], [22.6 + hx, 10.8 + hy], [26.2 + hx, 13.1 + hy], [26.2 + hx, 14.2 + hy], [22.4 + hx, 12.6 + hy]], VM.trim, { round: 0.2, sep: true });
  g.ellipse(22.6 + hx, 7 + hy, 2.0, 4.9, VM.trim, { sep: true });
  g.ellipse(23.3 + hx, 7 + hy, 1.35, 3.8, p.dim ? 'JGGH' : p.lit ? 'IIIJ' : VM.lens);
  if (!p.dim) g.dots([[23 + hx, 5 + hy], [23 + hx, 6 + hy]], 'I');

  // Near shoulder cap (neon rim) and near arm with a neon stripe.
  g.ellipse(...U(22.8, 19.8), 2.6, 2.3, VM.chassis, { sep: true });
  g.seg(...U(20.8, 21.6), ...U(24.6, 21.2), 'G');
  const [fs, fe, fh] = p.armF;
  g.capsule(...U(...fs), ...U(...fe), 1.1, 1.1, VM.chassis, { sep: true });
  g.capsule(...U(...fe), ...U(...fh), 1.35, 1.05, VM.chassis, { sep: true });
  {
    const [ex, ey] = U(...fe);
    const [wx, wy] = U(...fh);
    g.seg(ex + (wx - ex) * 0.25, ey + (wy - ey) * 0.25, ex + (wx - ex) * 0.7, ey + (wy - ey) * 0.7, 'G');
  }
  g.ellipse(...U(...fh), 1.3, 1.5, VM.dark, { sep: true });
  const [hx2, hy2] = U(...fh);
  const [ex2, ey2] = U(...fe);
  const d = Math.hypot(hx2 - ex2, hy2 - ey2) || 1;
  g.put(hx2 + ((hx2 - ex2) / d) * 1.6, hy2 + ((hy2 - ey2) / d) * 1.6, p.lit ? 'F' : 'G');
  return g.rows();
}

const VL = { F: [[19.6, 32], [20.4, 39], [20, 46.3]], B: [[16.6, 32], [16, 39], [16, 46.3]] };
const VLB = { F: [[19.6, 32.5], [21.2, 39.4], [20.4, 46.3]], B: [[16.6, 32.5], [15.2, 39.4], [15.6, 46.3]] }; // knees bent
const VA = {
  idleF: [[22.8, 20.2], [24.6, 27.2], [23.8, 33.8]],
  idleB: [[13.6, 20], [11.8, 27], [12.6, 33.5]],
};

const VOLT_POSES = {
  idle: { armF: VA.idleF, armB: VA.idleB, legF: VL.F, legB: VL.B },
  idle2: { bob: 1, armF: [[22.8, 20.2], [24.8, 27.3], [24.2, 33.8]], armB: [[13.6, 20], [11.6, 27.1], [12.2, 33.4]], legF: VL.F, legB: VL.B },
  charge: { bob: 1, armF: [[22.8, 20.2], [26.6, 16.4], [25.8, 10.4]], armB: [[13.6, 20], [9.8, 16.2], [10.6, 10.2]], legF: VLB.F, legB: VLB.B },
  cast: { lit: true, armF: [[22.8, 20.2], [27.4, 18.4], [31.6, 15.6]], armB: [[13.6, 20], [12.4, 13.4], [12.8, 7.2]], legF: VL.F, legB: VL.B },
  flashcharge: { bob: 2, headY: 1, dim: true, armF: [[22.8, 20.2], [21.6, 25.6], [17.2, 22.8]], armB: [[13.6, 20], [15.2, 26.2], [19.6, 23.4]], legF: VLB.F, legB: VLB.B },
  flash: { lit: true, headY: -1, armF: [[22.8, 20.2], [27.6, 17.6], [32.2, 14.6]], armB: [[13.6, 20], [9.0, 17.4], [4.6, 14.4]], legF: [[19.6, 32], [21.4, 39], [22, 46.3]], legB: [[16.6, 32], [15, 39], [14, 46.3]] },
  hurt: { lean: -2, dim: true, headX: -1, armF: [[22.8, 20.2], [26.6, 24.4], [29.4, 29.6]], armB: [[13.6, 20], [10.2, 16.8], [8.0, 12.4]], legF: VL.F, legB: VL.B },
};
const VOLT_FRAMES = {};
for (const [k, pose] of Object.entries(VOLT_POSES)) VOLT_FRAMES[k] = buildVolt(pose);

// Frame point (authored facing right) -> screen point for a body drawn with its feet at (x, y).
function framePt(x, y, w, h, flip, px0, py0) {
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h);
  return [flip ? left + (w - 1 - px0) : left + px0, top + py0];
}

function drawVolt(ctx, e, x, y, t) {
  const L = lvl(e);
  const pal = VOLT_PAL[L - 1];
  const neon = VOLT_NEON[L - 1];
  const flip = (e.facing ?? -1) < 0;
  const anim = e.anim ?? 'idle';
  const at = e.animT ?? 0;
  let key = 'idle';
  if (anim === 'idle' || anim === 'move' || anim === 'land') key = (t >> 4) % 2 ? 'idle2' : 'idle';
  else if (VOLT_FRAMES[anim]) key = anim;
  else if (anim === 'summon') key = 'flash';
  else if (anim === 'warp') key = 'idle';
  const pose = VOLT_POSES[key];
  const frame = VOLT_FRAMES[key];
  const glow = L === 4 ? { glow: VOLT_GLOW, glowAlpha: 0.4 + 0.2 * Math.sin(t / 6) } : {};
  const [lx, ly] = framePt(x, y, VW, VH, flip, ...voltLens(pose));
  const dir = flip ? -1 : 1;

  if (anim === 'warp') {
    // Dissolving into a teleport: flicker with an arc running through the body.
    body(ctx, frame, pal, x, y, flip, { ...glow, alpha: at % 4 < 2 ? 0.85 : 0.4 });
    bolt(ctx, x, y - 48, x, y - 2, at * 7 + 3, neon, 7, 3);
    spark(ctx, x + ((at * 5) % 9) - 4, y - 20 - ((at * 7) % 20), 2, neon);
    return;
  }
  if (key === 'flash') rays(ctx, lx, ly, anim === 'summon' ? 10 : 6 + Math.min(10, at), at, '#fff6b0', '#ffffff', 10);
  body(ctx, frame, pal, x, y, flip, glow);

  if (anim === 'charge') {
    // Crackling hands.
    for (const hand of [pose.armF[2], pose.armB[2]]) {
      const [hx, hy] = framePt(x, y, VW, VH, flip, hand[0], hand[1] + (pose.bob ?? 0));
      if ((at + hand[0]) % 6 < 4) bolt(ctx, hx, hy - 1, hx + ((at * 3) % 5) - 2, hy - 7, at + hand[0], neon, 3, 2);
      spark(ctx, hx, hy - 1, at % 4 < 2 ? 2 : 1, neon);
    }
  } else if (anim === 'cast') {
    const hand = pose.armF[2];
    const [hx, hy] = framePt(x, y, VW, VH, flip, hand[0], hand[1]);
    spark(ctx, hx + dir, hy - 1, at % 4 < 2 ? 3 : 2, neon);
    const up = pose.armB[2];
    const [ux, uy] = framePt(x, y, VW, VH, flip, up[0], up[1]);
    bolt(ctx, ux, uy - 1, ux + (at % 3) - 1, uy - 12, at * 3 + 1, neon, 3, 2);
  } else if (anim === 'flashcharge') {
    // The lamp heats up: a growing, flickering ring of light around the lens.
    const k = Math.min(1, at / 46);
    const r = 2 + Math.round(7 * k);
    if (at % 4 < 3) ring(ctx, lx, ly, r, k > 0.7 ? '#ffffff' : '#fff2a0');
    if (k > 0.35) ring(ctx, lx, ly, Math.max(1, r - 3), neon);
    disc(ctx, lx, ly, 1 + Math.round(k * 2), '#ffffff');
    if (at % 8 < 4) spark(ctx, lx + dir * (r + 2), ly - (at % 5) + 2, 1, neon);
  } else if (key === 'idle' || key === 'idle2') {
    // The lens hums; now and then it flickers like a tired tube.
    if (hash((t >> 2) + 17) > 0.08) {
      px(ctx, lx + dir * 2, ly - 1, '#fff6c0');
      px(ctx, lx + dir * 2, ly + 1, '#fff6c0');
      px(ctx, lx + dir * 3, ly, '#fffbe8');
    }
  }
}

// Light rays from a point: `n` spokes of length r, turning slowly with `t`.
function rays(ctx, x, y, r, t, c, core, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t / 20;
    const len = r * (i % 2 ? 0.65 : 1);
    line(ctx, x + Math.cos(a) * 3, y + Math.sin(a) * 3, x + Math.cos(a) * len, y + Math.sin(a) * len, c);
  }
  disc(ctx, x, y, 3, c);
  disc(ctx, x, y, 2, core);
}

// =================================================================== FERALIS

// Keys: A-E armour (light->darkest), F G H mane/circuit glow (hot, main, deep), I J eyes (core, glow),
// K L M claws (shine, steel, dark), N O hide/joints (light, dark), P Q belly plates, # contour.
const FERAL_PAL = [
  { A: '#c6ccd6', B: '#8e96a6', C: '#5e6576', D: '#3c4150', E: '#24272f', F: '#d8ffe8', G: '#3ae88a', H: '#14a05a', I: '#ffffff', J: '#6affb0', K: '#ffffff', L: '#c8d0dc', M: '#7a8496', N: '#4a4650', O: '#2a2630', P: '#d8c8a8', Q: '#9a8a6a', '#': OUTLINE },
  { A: '#ffe8b0', B: '#e0b468', C: '#b07c3c', D: '#7a4e24', E: '#4a2c14', F: '#ffe0d0', G: '#ff4a3a', H: '#b81c24', I: '#ffffff', J: '#ff8a6a', K: '#ffffff', L: '#d8d0c8', M: '#8a7c70', N: '#5a4234', O: '#34241a', P: '#f0e6d0', Q: '#b4a488', '#': OUTLINE },
  { A: '#ffffff', B: '#d4e2f0', C: '#9cb0c8', D: '#64788e', E: '#3a4a5c', F: '#ffe0f8', G: '#ff4ad8', H: '#b01c9a', I: '#ffffff', J: '#ff9af0', K: '#ffffff', L: '#d0dcec', M: '#7a8aa0', N: '#4e5a6c', O: '#2c3442', P: '#bfe4ff', Q: '#7aa8cc', '#': OUTLINE },
  { A: '#6a5a88', B: '#433a5c', C: '#2c2640', D: '#1c182c', E: '#100c1c', F: '#f8e0ff', G: '#b05aff', H: '#6a24c0', I: '#ffffff', J: '#d8a0ff', K: '#f0e8ff', L: '#a898c8', M: '#5e5280', N: '#2e2440', O: '#18122a', P: '#5a4e78', Q: '#3a3054', '#': OUTLINE },
];
const FERAL_GLOW = '#a050ff';
const FERAL_ACCENT = ['#3ae88a', '#ff4a3a', '#ff4ad8', '#b05aff'];
const FM = { armor: 'ABCD', far: 'BCDE', mane: 'FGGH', claw: 'KLLM', clawFar: 'LLMM', hide: 'NNOO', belly: 'PPQQ', dark: 'CDEE' };
const FW = 44;
const FH = 40;

// pose: { bob, lean, head: [x, y], tilt (head pitch: -1 up .. 1 down), jaw (0..3 open), armF/armB: [shoulder, elbow, wrist],
//         clawF/clawB: claw direction [dx, dy], hindF/hindB: [hip, knee, ankle], tail: [[x,y]...], body: [cx, cy] }
function buildFeral(p) {
  const g = new Grid(FW, FH);
  const by = p.bob ?? 0;
  const lx = p.lean ?? 0;
  const U = (x, y) => [x + lx, y + by];
  const [bx, byy] = p.body ?? [20, 22];

  // Tail: segmented cable with a spiked tip.
  const tail = p.tail ?? [[12, 21], [7, 19], [4, 15], [3, 10]];
  for (let i = 0; i < tail.length - 1; i++) {
    const r0 = 1.8 - i * 0.35;
    g.capsule(tail[i][0] + (i === 0 ? lx : 0), tail[i][1] + (i === 0 ? by : 0), tail[i + 1][0], tail[i + 1][1], r0, r0 - 0.35, i % 2 ? FM.dark : FM.far);
  }
  const tip = tail[tail.length - 1];
  const pre = tail[tail.length - 2];
  const tdx = tip[0] - pre[0];
  const tdy = tip[1] - pre[1];
  const tl = Math.hypot(tdx, tdy) || 1;
  g.capsule(tip[0], tip[1], tip[0] + (tdx / tl) * 3, tip[1] + (tdy / tl) * 3, 1.1, 0.3, FM.mane);

  // Far limbs (behind the body).
  const claws = (w, dir, mat, o) => {
    const [dx, dy] = dir;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    // three claws fanned around `dir`
    for (const [spread, len] of [[-0.5, 5.2], [0, 6.6], [0.5, 5.2]]) {
      const cx = ux * Math.cos(spread) - uy * Math.sin(spread);
      const cy = ux * Math.sin(spread) + uy * Math.cos(spread);
      const sx = w[0] + cx * 2.4;
      const sy = w[1] + cy * 2.4;
      // a slight hook: the tip bends toward +y
      g.capsule(sx, sy, sx + cx * len * 0.6, sy + cy * len * 0.6, 1.05, 0.7, mat, o);
      g.capsule(sx + cx * len * 0.6, sy + cy * len * 0.6, sx + cx * len + cy * 0.6, sy + cy * len - cx * 0.6 + 0.6, 0.7, 0.25, mat, o);
    }
  };
  const [abS, abE, abW] = p.armB;
  const [hbH, hbK, hbA] = p.hindB;
  g.capsule(...hbH, ...hbK, 3.0, 2.0, FM.far);
  g.capsule(...hbK, ...hbA, 1.8, 1.4, FM.dark);
  g.poly([[hbA[0] - 2, hbA[1] - 0.5], [hbA[0] + 2.5, hbA[1] - 0.5], [hbA[0] + 4.5, hbA[1] + 2.8], [hbA[0] - 2.5, hbA[1] + 2.8]], FM.dark, { round: 0.3 });
  g.capsule(...U(...abS), ...U(...abE), 2.3, 2.0, FM.far);
  g.capsule(...U(...abE), ...U(...abW), 2.1, 1.9, FM.far);
  claws(U(...abW), p.clawB ?? [1, 1], FM.clawFar);
  g.ellipse(...U(...abW), 2.9, 2.4, FM.dark);

  // Body: haunch, hunched back, chest.
  g.ellipse(...U(bx - 5, byy + 4), 5.2, 4.6, FM.armor);
  g.ellipse(...U(bx - 1, byy - 1), 8.0, 6.2, FM.armor);
  g.ellipse(...U(bx + 5, byy + 2), 5.0, 5.0, FM.armor);
  g.poly([U(bx + 1, byy + 3), U(bx + 9, byy + 1), U(bx + 9, byy + 6), U(bx + 2, byy + 7)], FM.belly, { round: 0.5 });
  // circuit lines along the flank
  g.seg(...U(bx - 8, byy + 1), ...U(bx - 4, byy - 1), 'H');
  g.seg(...U(bx - 4, byy - 1), ...U(bx + 1, byy - 1), 'G');

  // Near hind leg.
  const [hfH, hfK, hfA] = p.hindF;
  g.ellipse(hfH[0] + lx * 0.5, hfH[1], 4.6, 4.2, FM.armor, { sep: true });
  g.capsule(...hfK, ...hfA, 2.0, 1.5, FM.armor, { sep: true });
  g.capsule(hfH[0] + lx * 0.5, hfH[1], ...hfK, 2.6, 2.0, FM.armor);
  g.poly([[hfA[0] - 2, hfA[1] - 0.5], [hfA[0] + 3, hfA[1] - 0.5], [hfA[0] + 5.5, hfA[1] + 2.8], [hfA[0] - 2.5, hfA[1] + 2.8]], FM.armor, { round: 0.3, sep: true });
  g.dots([[hfA[0] + 5, hfA[1] + 2], [hfA[0] + 3, hfA[1] + 2]], 'K');
  g.seg(hfH[0] - 2 + lx * 0.5, hfH[1] - 1, hfH[0] + 1.5 + lx * 0.5, hfH[1] - 2.5, 'G');

  // Head: a heavy wolfish helm, ears swept back, thick muzzle and jaw.
  const [hx0, hy0] = p.head ?? [30, 13];
  const hx = hx0 + lx;
  const hy = hy0 + by;
  const tilt = p.tilt ?? 0; // + down / - up (muzzle direction)
  const jaw = p.jaw ?? 0;
  // mane spikes sweeping back from the crown
  const mane = p.mane ?? [[[hx - 2, hy - 3], [hx - 11, hy - 6]], [[hx - 3, hy], [hx - 13, hy - 1]], [[hx - 4, hy + 3], [hx - 12, hy + 5]], [[hx - 6, hy + 6], [hx - 12, hy + 10]]];
  for (const [[ax, ay], [tx, ty]] of mane) g.capsule(ax, ay, tx, ty, 2.1, 0.4, FM.mane);
  // back-swept ears
  g.poly([[hx - 2.5, hy - 3], [hx - 9.5, hy - 7.5], [hx - 5, hy - 0.5]], FM.dark, { round: 0.3 });
  g.ellipse(hx - 0.5, hy, 5.3, 4.7, FM.armor);
  g.poly([[hx - 1, hy - 3.8], [hx - 7.5, hy - 8.8], [hx - 3.5, hy - 2]], FM.armor, { round: 0.3, sep: true });
  g.put(hx - 6, hy - 7.5, 'G');
  // muzzle (upper) and jaw (lower), pitched by tilt, opened by jaw
  const mx = hx + 2.5;
  const my = hy - 0.5 + tilt * 1.5;
  g.poly([[mx - 2, my - 3], [mx + 4, my - 2 + tilt], [mx + 7.5, my - 0.2 + tilt * 1.6], [mx + 7.5, my + 1.8 + tilt * 1.6], [mx - 2, my + 2.4]], FM.armor, { round: 0.5, sep: true });
  g.poly([[mx - 2, my + 2.4 + jaw * 0.3], [mx + 6, my + 2.6 + tilt * 1.6 + jaw], [mx + 5, my + 4.4 + tilt * 1.3 + jaw], [mx - 2, my + 4.8 + jaw * 0.5]], FM.dark, { round: 0.3, sep: true });
  if (jaw > 0.5) {
    g.seg(mx - 1, my + 2.6 + jaw * 0.3, mx + 5, my + 2.8 + tilt * 1.6 + jaw * 0.7, 'O');
    g.put(mx + 1.5, my + 2.4 + jaw * 0.4, 'K');
    g.put(mx + 4.5, my + 2.6 + tilt * 1.5 + jaw * 0.6, 'K');
  }
  g.put(mx + 7.4, my + 0.2 + tilt * 1.6, 'O'); // nose
  // brow ridge and a burning eye slit
  g.seg(hx - 0.5, hy - 2.6 + tilt * 0.6, hx + 3.5, hy - 2 + tilt, 'D');
  g.seg(hx + 0.5, hy - 1.4 + tilt * 0.8, hx + 3, hy - 0.9 + tilt * 1.2, 'J');
  g.put(hx + 2, hy - 1.2 + tilt, p.eyeHot ? 'I' : 'J');
  if (p.eyeHot) g.put(hx + 3.2, hy - 1.6 + tilt, 'J');
  // collar ring
  g.seg(hx - 4.5, hy + 4, hx - 1, hy + 5, 'H');

  // Near arm with its claw gauntlet.
  const [afS, afE, afW] = p.armF;
  g.ellipse(...U(afS[0], afS[1]), 3.4, 3.2, FM.armor, { sep: true });
  g.capsule(...U(...afS), ...U(...afE), 2.6, 2.2, FM.armor, { sep: true });
  g.capsule(...U(...afE), ...U(...afW), 2.3, 2.1, FM.armor, { sep: true });
  g.seg(...U(afS[0] - 1, afS[1] - 1), ...U(afS[0] + 2, afS[1] - 2), 'G');
  claws(U(...afW), p.clawF ?? [1, 1], FM.claw, { sep: true });
  g.ellipse(...U(...afW), 3.3, 2.7, FM.armor, { sep: true });
  return g.rows();
}

const FERAL_POSES = {
  idle: {
    armF: [[26, 19], [28.5, 26], [31, 33]], clawF: [1, 0.6], armB: [[21.5, 19], [23, 26], [25.5, 33.5]], clawB: [1, 0.5],
    hindF: [[14, 28], [11.5, 32], [13.5, 36.2]], hindB: [[17.5, 28], [16.5, 32.5], [18, 36.2]],
  },
  idle2: {
    bob: 1, head: [30, 14], armF: [[26, 19], [28.5, 26], [31, 33]], clawF: [1, 0.6], armB: [[21.5, 19], [23, 26], [25.5, 33.5]], clawB: [1, 0.5],
    hindF: [[14, 28], [11.5, 32], [13.5, 36.2]], hindB: [[17.5, 28], [16.5, 32.5], [18, 36.2]], tail: [[12, 21], [7, 20], [3.5, 17], [2, 12]],
  },
  move: {
    lean: 2, bob: -1, head: [32, 12], tilt: -0.3, armF: [[27, 18], [32, 22], [37, 25]], clawF: [1, 0.2], armB: [[22, 18], [27, 22], [32, 26]], clawB: [1, 0.3],
    hindF: [[13, 27], [8, 30], [6, 34]], hindB: [[16.5, 27], [12, 31], [10, 34.5]], tail: [[12, 20], [6, 20], [2, 21], [-1, 20]],
  },
  crouch: {
    bob: 3, head: [31, 16], tilt: 0.5, eyeHot: true, jaw: 1, armF: [[25, 19], [20, 21], [15.5, 17]], clawF: [-0.5, -1], armB: [[21, 19], [25, 25], [29, 31.5]], clawB: [1, 0.8],
    hindF: [[14, 28], [10.5, 31.5], [13, 36.2]], hindB: [[17.5, 28], [15.5, 32.5], [18, 36.2]], tail: [[12, 21], [7, 22], [3, 20], [1, 16]],
  },
  rake: {
    lean: 3, bob: 1, head: [31, 14], tilt: 0.3, jaw: 2, eyeHot: true, armF: [[26, 19], [32, 24], [37, 30]], clawF: [0.9, 1], armB: [[21.5, 19], [20, 25], [17, 29]], clawB: [-0.4, 1],
    hindF: [[14, 28], [10.5, 31.5], [11, 36.2]], hindB: [[17.5, 28], [17, 32.5], [20, 36.2]], tail: [[12, 21], [6, 22], [2, 25], [0, 29]],
  },
  pounce: {
    lean: 3, bob: 0, body: [20, 21], head: [33, 15], tilt: 0, jaw: 2.5, eyeHot: true, armF: [[27, 19], [33, 21], [39, 23]], clawF: [1, 0.15], armB: [[22, 20], [28, 23], [34, 25]], clawB: [1, 0.25],
    hindF: [[13, 27], [7, 28], [2, 30]], hindB: [[16, 27], [10, 30], [5, 33]], tail: [[11, 20], [5, 18], [1, 17], [-2, 16]],
    mane: [[[31, 12], [20, 10]], [[30, 15], [18, 14]], [[29, 18], [19, 19]], [[27, 20], [19, 23]]],
  },
  land: {
    bob: 4, head: [31, 16], tilt: 0.8, armF: [[26, 20], [29, 27], [33, 34]], clawF: [1, 0.4], armB: [[21.5, 20], [24, 27], [27.5, 34]], clawB: [1, 0.3],
    hindF: [[14, 29], [10, 32], [13, 36.2]], hindB: [[17.5, 29], [15, 33], [18, 36.2]], tail: [[12, 22], [7, 23], [3, 22], [1, 19]],
  },
  howl: {
    bob: 0, head: [28, 10], tilt: -1.4, jaw: 3, eyeHot: true, armF: [[26, 19], [28, 26], [30, 33]], clawF: [1, 0.7], armB: [[21.5, 19], [22.5, 26], [24.5, 33.5]], clawB: [1, 0.5],
    hindF: [[14, 28], [11.5, 32], [13.5, 36.2]], hindB: [[17.5, 28], [16.5, 32.5], [18, 36.2]], tail: [[12, 21], [7, 17], [5, 12], [5, 7]],
    mane: [[[25, 7], [15, 4]], [[24, 10], [13, 9]], [[23, 13], [13, 14]], [[22, 16], [14, 19]]],
  },
  hurt: {
    lean: -2, bob: -1, head: [28, 12], tilt: -0.8, jaw: 2, armF: [[25, 19], [29, 22], [33, 20]], clawF: [0.6, -1], armB: [[21, 19], [19, 25], [21, 31]], clawB: [1, 0.5],
    hindF: [[14, 28], [11.5, 32], [13.5, 36.2]], hindB: [[17.5, 28], [16.5, 32.5], [18, 36.2]], tail: [[12, 21], [7, 17], [5, 12], [6, 8]],
  },
};
const FERAL_FRAMES = {};
for (const [k, pose] of Object.entries(FERAL_POSES)) FERAL_FRAMES[k] = buildFeral(pose);

function drawFeral(ctx, e, x, y, t) {
  const L = lvl(e);
  const pal = FERAL_PAL[L - 1];
  const flip = (e.facing ?? -1) < 0;
  const anim = e.anim ?? 'idle';
  const at = e.animT ?? 0;
  let key = anim;
  if (anim === 'idle') key = (t >> 3) % 4 === 3 ? 'idle2' : (t >> 3) % 4 === 1 ? 'idle2' : 'idle';
  else if (anim === 'summon') key = 'rake';
  else if (!FERAL_FRAMES[anim]) key = 'idle';
  const frame = FERAL_FRAMES[key];
  const glow = L === 4 ? { glow: FERAL_GLOW, glowAlpha: 0.4 + 0.2 * Math.sin(t / 5) } : {};
  const acc = FERAL_ACCENT[L - 1];
  const dir = flip ? -1 : 1;
  body(ctx, frame, pal, x, y, flip, glow);
  if (key === 'crouch' && at % 6 < 3) {
    // Eyes flare during the wind-up.
    const [ex, ey] = framePt(x, y, FW, FH, flip, 32.5, 13.4 + 3);
    spark(ctx, ex + dir, ey, 2, acc);
  } else if (key === 'rake' && at < 10) {
    // Claw swipe trail.
    for (let i = 0; i < 3; i++) {
      const [sx, sy] = framePt(x, y, FW, FH, flip, 34 + i * 2, 22 + i * 3);
      line(ctx, sx, sy, sx + dir * 6, sy + 8, i === 1 ? '#ffffff' : acc);
    }
  }
}

// =================================================================== TIDECALLER

// Keys: A-E helmet metal (light->darkest), F G H water glow (foam, aqua, deep), I J visor glass (light, dark),
// K L M N robe (light->dark), O P hem trim (light, mid), Q R staff (light, dark), S T coral (light, deep),
// U V W diving suit (light, mid, dark), # contour.
const TIDE_PAL = [
  { A: '#fff2b0', B: '#f0c050', C: '#c08a28', D: '#83561a', E: '#4e3010', F: '#e8ffff', G: '#4ad8ff', H: '#1a8ad0', I: '#9af0ff', J: '#0e3a5a', K: '#4a6ad8', L: '#2c46a8', M: '#1c2e78', N: '#111c4c', O: '#bff4ff', P: '#5ac8e8', Q: '#e8d0a0', R: '#a07a48', S: '#ffb0a0', T: '#e05a6a', U: '#5a6a80', V: '#3c4a5e', W: '#252f40', '#': OUTLINE },
  { A: '#ffe0c8', B: '#f0946a', C: '#c0603e', D: '#843a24', E: '#4e2014', F: '#e8fff8', G: '#3af0d0', H: '#14a890', I: '#a0ffec', J: '#0a3a3a', K: '#2aa8a8', L: '#167a80', M: '#0e5058', N: '#083038', O: '#d0fff0', P: '#6ae8c8', Q: '#e8d8b0', R: '#9a7a50', S: '#ffd0a0', T: '#e8804a', U: '#5a7070', V: '#3a5050', W: '#223434', '#': OUTLINE },
  { A: '#ffffff', B: '#d0dae8', C: '#98a6bc', D: '#5e6a80', E: '#363e50', F: '#f0fff8', G: '#6affb8', H: '#20b878', I: '#c0ffe0', J: '#0a3a2e', K: '#3a7ae0', L: '#2050b0', M: '#163478', N: '#0c1e4a', O: '#d8fff0', P: '#7ae8c0', Q: '#e0e8f0', R: '#8090a8', S: '#c8f0ff', T: '#6aa8e0', U: '#5a6880', V: '#3a4660', W: '#222a40', '#': OUTLINE },
  { A: '#a898c8', B: '#6a5a90', C: '#463a66', D: '#2c2444', E: '#18122a', F: '#f8e8ff', G: '#c070ff', H: '#7a30c8', I: '#e0b0ff', J: '#1a0a30', K: '#4a3070', L: '#321e52', M: '#22143a', N: '#140a24', O: '#e8c8ff', P: '#a060e0', Q: '#8a7aa8', R: '#4a3a68', S: '#e080ff', T: '#9a30c0', U: '#3a3050', V: '#262038', W: '#161024', '#': OUTLINE },
];
const TIDE_GLOW = '#a058ff';
const TIDE_WATER = ['#4ad8ff', '#3af0d0', '#6affb8', '#c070ff'];
const TM = { metal: 'ABCD', metalDark: 'BCDE', water: 'FGGH', glass: 'IJJJ', robe: 'KLMN', trim: 'OOPP', staff: 'QQRR', coral: 'SSTT', suit: 'UVVW', boot: 'CDEE' };
const TW = 40;
const TH = 46;

// pose: { bob, lean, hem (sway), head: [dx, dy], staff: [[x0,y0],[x1,y1]] (butt, head), armF/armB: [shoulder, elbow, hand] }
function buildTide(p) {
  const g = new Grid(TW, TH);
  const by = p.bob ?? 0;
  const lx = p.lean ?? 0;
  const hem = p.hem ?? 0;
  const U = (x, y) => [x + lx, y + by];
  const [hdx, hdy] = p.head ?? [0, 0];
  const H = (x, y) => [x + lx + hdx, y + by + hdy];

  // Far arm (behind).
  const [bs, be, bh] = p.armB;
  g.capsule(...U(...bs), ...U(...be), 2.3, 2.1, TM.suit);
  g.capsule(...U(...be), ...U(...bh), 2.1, 1.8, TM.suit);
  g.ellipse(...U(...bh), 2.0, 2.0, TM.metalDark);

  // Air tank on the back, hose to the helmet.
  g.capsule(...U(11, 14.5), ...U(11, 24.5), 2.7, 2.7, TM.metalDark);
  g.seg(...U(9.5, 15), ...U(9.5, 24), 'E');
  g.capsule(...U(11.5, 14), ...H(13, 10.5), 1.1, 1.1, TM.suit);

  // Robe, flaring to a scalloped hem.
  g.poly([U(13.5, 21), U(26.5, 21), [28.5 + lx * 0.6 + hem * 0.5, 32], [31 + hem, 43.2], [9 + hem, 43.2], [11 + lx * 0.6 + hem * 0.5, 32]], TM.robe, { round: 0.55 });
  for (let x = 10; x <= 30; x += 3) g.ellipse(x + hem + 0.5, 43.2, 1.5, 1.1, TM.trim);
  g.seg(...U(20.5, 24), 21.5 + hem * 0.8, 42, 'N');
  g.seg(...U(23.5, 25), 26 + hem * 0.9, 41, 'K');
  // wave sigil on the robe
  g.dots([[16 + hem * 0.6, 36], [17 + hem * 0.6, 35], [18 + hem * 0.6, 36], [19 + hem * 0.6, 35]], 'P');
  // boots under the hem
  g.ellipse(15 + hem * 0.4, 44.6, 3.0, 1.5, TM.boot);
  g.ellipse(24.5 + hem * 0.4, 44.6, 3.3, 1.5, TM.boot);

  // Breastplate (corselet), a shade darker than the helmet, rivets along its rim.
  g.poly([U(11, 18), U(28, 18), U(29.2, 23), U(9.8, 23)], TM.metalDark, { round: 0.4, bevel: 1 });
  g.dots([U(12, 21.6), U(15, 22.2), U(18, 22.4), U(21, 22.4), U(24, 22.2), U(27, 21.6)], 'E');

  // Helmet: a big brass sphere, porthole forward, a fin crest and a valve on top.
  g.poly([H(12.5, 5.5), H(15.5, 0.6), H(21, 1.2), H(19.5, 4.5)], TM.water, { round: 0.4 });
  g.ellipse(...H(19.5, 10.5), 7.6, 7.6, TM.metal);
  g.capsule(...H(20, 3.2), ...H(20, 2), 1.3, 1.3, TM.metalDark);
  g.dots([H(14, 8), H(13.2, 11), H(14, 14)], 'D');
  g.ellipse(...H(24.2, 11), 3.9, 3.9, TM.metalDark, { sep: true });
  g.ellipse(...H(24.6, 11), 2.8, 2.8, TM.glass);
  g.dots([H(21.2, 8), H(21.2, 14), H(27.6, 8), H(27.6, 14)], 'A');
  // the face inside: one glowing eye, a glint on the glass
  g.dots([H(25.6, 10.6), H(26.4, 10.6)], p.eyeHot ? 'F' : 'G');
  g.put(...H(23.2, 9.2), 'I');
  g.put(...H(23.6, 9.8), 'I');
  // rubber collar seal between helmet and corselet
  g.ellipse(...U(19.5, 17.8), 7.2, 1.5, TM.suit);
  g.seg(...U(13, 18), ...U(26, 18), 'W');

  // Staff (held in the near hand): shaft, coral crown, water orb.
  const [[s0x, s0y], [s1x, s1y]] = p.staff;
  const S0 = U(s0x, s0y);
  const S1 = U(s1x, s1y);
  g.capsule(...S0, ...S1, 0.9, 0.9, TM.staff);
  const sdx = S1[0] - S0[0];
  const sdy = S1[1] - S0[1];
  const sl = Math.hypot(sdx, sdy) || 1;
  const ux = sdx / sl;
  const uy = sdy / sl;
  for (const a of [-0.9, 0.9]) {
    const cx = ux * Math.cos(a) - uy * Math.sin(a);
    const cy = ux * Math.sin(a) + uy * Math.cos(a);
    g.capsule(S1[0] - ux * 2, S1[1] - uy * 2, S1[0] + cx * 3.2, S1[1] + cy * 3.2, 0.9, 0.5, TM.coral);
  }
  g.ellipse(S1[0] + ux * 1.2, S1[1] + uy * 1.2, 2.2, 2.2, TM.water);
  g.put(S1[0] + ux * 1.2 - 0.6, S1[1] + uy * 1.2 - 0.8, 'F');

  // Near arm: puffy sleeve, brass glove gripping the staff.
  const [fs, fe, fh] = p.armF;
  g.ellipse(...U(fs[0], fs[1]), 3.0, 2.8, TM.suit, { sep: true });
  g.capsule(...U(...fs), ...U(...fe), 2.4, 2.2, TM.suit, { sep: true });
  g.capsule(...U(...fe), ...U(...fh), 2.2, 1.9, TM.suit, { sep: true });
  g.ellipse(...U(...fh), 2.2, 2.1, TM.metal, { sep: true });
  g.seg(...U(fe[0] - 1, fe[1] + 1), ...U(fe[0] + 1, fe[1] + 1.5), 'P');
  return g.rows();
}

const TIDE_POSES = {
  idle: { staff: [[31, 44], [31, 7]], armF: [[26, 20], [29.5, 25.5], [31, 30]], armB: [[13, 20], [10.5, 26], [11.5, 31]] },
  idle2: { bob: 1, hem: 0.6, staff: [[31, 44], [31, 7]], armF: [[26, 20], [29.5, 25.5], [31, 30]], armB: [[13, 20], [10.3, 26.2], [11, 31.2]] },
  move: { lean: 1, hem: -2, staff: [[29, 42], [33, 8]], armF: [[26, 20], [29.5, 25], [31, 28.5]], armB: [[13, 20], [10, 25], [9, 30]] },
  aim: { lean: 1, head: [1, 1], eyeHot: true, staff: [[21, 27.5], [37, 23.5]], armF: [[26, 20], [27.5, 26], [31, 25]], armB: [[13, 20], [17, 25], [23, 27]] },
  shoot: { lean: -1, head: [0, 0], eyeHot: true, staff: [[23, 26.5], [39, 22.5]], armF: [[26, 20], [29, 25], [33, 24]], armB: [[13, 20], [17, 24.5], [24, 26]] },
  call: { hem: 1, head: [0, -1], eyeHot: true, staff: [[29.5, 30], [29.5, 1.5]], armF: [[26, 20], [29, 15.5], [29.5, 13]], armB: [[13, 20], [9, 14.5], [7.5, 10]] },
  tide: { hem: 1.5, head: [0, -1], eyeHot: true, staff: [[33, 44], [33, 6]], armF: [[26, 20], [31, 16], [33, 18]], armB: [[13, 20], [8, 14], [5, 9]] },
  hurt: { lean: -2, hem: 1.5, head: [-1, 0], staff: [[33, 44], [27, 8]], armF: [[26, 20], [30, 22], [31, 26]], armB: [[13, 20], [9, 17], [7, 13]] },
};
const TIDE_FRAMES = {};
for (const [k, pose] of Object.entries(TIDE_POSES)) TIDE_FRAMES[k] = buildTide(pose);

function drawTide(ctx, e, x, y, t) {
  const L = lvl(e);
  const pal = TIDE_PAL[L - 1];
  const flip = (e.facing ?? -1) < 0;
  const anim = e.anim ?? 'idle';
  const at = e.animT ?? 0;
  let key = anim;
  if (anim === 'idle') key = (t >> 4) % 2 ? 'idle2' : 'idle';
  else if (anim === 'summon') key = 'shoot';
  else if (!TIDE_FRAMES[anim]) key = 'idle';
  const pose = TIDE_POSES[key];
  const glow = L === 4 ? { glow: TIDE_GLOW, glowAlpha: 0.4 + 0.2 * Math.sin(t / 7) } : {};
  const water = TIDE_WATER[L - 1];
  const dir = flip ? -1 : 1;
  body(ctx, TIDE_FRAMES[key], pal, x, y, flip, glow);
  // The staff orb.
  const [ox, oy] = (() => {
    const [[a0, b0], [a1, b1]] = pose.staff;
    const l = Math.hypot(a1 - a0, b1 - b0) || 1;
    return framePt(x, y, TW, TH, flip, a1 + (pose.lean ?? 0) + ((a1 - a0) / l) * 1.2, b1 + (pose.bob ?? 0) + ((b1 - b0) / l) * 1.2);
  })();
  if (key === 'idle' || key === 'idle2' || key === 'move') {
    // Bubbles drift up from the helmet valve.
    for (let i = 0; i < 2; i++) {
      const ph = (t + i * 23) % 46;
      const [bx, by] = framePt(x, y, TW, TH, flip, 20 + (pose.lean ?? 0), 1 + (pose.bob ?? 0));
      if (ph < 30) ring(ctx, bx + Math.round(Math.sin((t + i * 9) / 5) * 2), by - Math.round(ph / 2), ph < 12 ? 1 : 2, '#c8f4ff');
    }
  } else if (key === 'aim') {
    // Drawing water into the orb.
    const k = Math.min(1, at / 24);
    ring(ctx, ox, oy, Math.max(2, Math.round(7 - 5 * k)), at % 4 < 2 ? '#ffffff' : water);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + at / 3;
      px(ctx, Math.round(ox + Math.cos(a) * (8 - 6 * k)), Math.round(oy + Math.sin(a) * (8 - 6 * k)), '#e8ffff');
    }
  } else if (key === 'shoot') {
    if (at % 6 < 4) disc(ctx, ox + dir, oy, 3, '#e8ffff');
    ring(ctx, ox + dir * 2, oy, 4 + (at % 4), water);
  } else if (key === 'call' || key === 'tide') {
    // A swirl of water around the raised staff / body.
    const cx = key === 'call' ? ox : x;
    const cy = key === 'call' ? oy : y - 24;
    const R = key === 'call' ? 6 : 16;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + at / 6;
      const r = R + Math.sin(at / 4 + i) * 2;
      rect(ctx, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * (key === 'tide' ? 0.45 : 1)), 2, 2, i % 2 ? water : '#e8ffff');
    }
  }
}

// =================================================================== registries

export const ENTITY_SPRITES = {
  voltframe: { draw: drawVolt },
  feralis: { draw: drawFeral },
  tidecaller: { draw: drawTide },
};

export const SPELL_SPRITES = {};

export const FX_SPRITES = {};

// Exposed for the dev contact sheet and tests.
export const _frames = { voltframe: VOLT_FRAMES, feralis: FERAL_FRAMES, tidecaller: TIDE_FRAMES };
