// Sprite pack: bosses_b — Ironclad, Sabre, ZeroDay, Briarix (+ the Thorn Bud) and their spells/effects.
// See docs/CONTRACT.md "Sprites". Bodies are pixel-string sprites (drawn with sprite(), dark outline,
// 3-4 shades per material, light from the top-left), authored facing RIGHT. They are sculpted once at load:
// shapes are rasterised into masks, shaded per volume with a top-left light, and hand-drawn details are
// stamped on top. Effects use the pixel primitives.

import { sprite, recolor, rect, px, line, ellipse, disc, ring, poly, mix } from '../pixel.js';
import { floorPoint } from '../layout.js';

const OUT = '#0c0f1c';

// ---------------------------------------------------------------- sculpting helpers (load time only)

class Mask {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8Array(w * h);
  }
  has(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] === 1;
  }
  set(x, y, v = 1) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = v;
  }
  // Shapes use continuous coordinates: pixel (x, y) is in when its centre (x+.5, y+.5) is inside.
  ellipse(cx, cy, rx, ry, v = 1) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, v);
      }
    }
    return this;
  }
  rect(x0, y0, w, h, r = 0, v = 1) {
    for (let y = Math.floor(y0); y < y0 + h; y++) {
      for (let x = Math.floor(x0); x < x0 + w; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        const kx = cx < x0 + r ? x0 + r : cx > x0 + w - r ? x0 + w - r : cx;
        const ky = cy < y0 + r ? y0 + r : cy > y0 + h - r ? y0 + h - r : cy;
        if ((cx - kx) ** 2 + (cy - ky) ** 2 <= r * r + 0.01) this.set(x, y, v);
      }
    }
    return this;
  }
  poly(pts, v = 1) {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [, y] of pts) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let y = Math.floor(y0); y <= y1; y++) {
      const sy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.floor(xs[i]); x < xs[i + 1]; x++) if (x + 0.5 >= xs[i] && x + 0.5 <= xs[i + 1]) this.set(x, y, v);
      }
    }
    return this;
  }
  // A thick segment whose radius goes from r0 to r1 (limbs, pistons, blades).
  capsule(x0, y0, x1, y1, r0, r1 = r0, v = 1) {
    const minX = Math.floor(Math.min(x0, x1) - Math.max(r0, r1) - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + Math.max(r0, r1) + 1);
    const minY = Math.floor(Math.min(y0, y1) - Math.max(r0, r1) - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + Math.max(r0, r1) + 1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px0 = x + 0.5;
        const py0 = y + 0.5;
        let t = ((px0 - x0) * dx + (py0 - y0) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        const r = r0 + (r1 - r0) * t;
        if ((px0 - (x0 + dx * t)) ** 2 + (py0 - (y0 + dy * t)) ** 2 <= r * r) this.set(x, y, v);
      }
    }
    return this;
  }
  cut(m) {
    for (let i = 0; i < this.d.length; i++) if (m.d[i]) this.d[i] = 0;
    return this;
  }
  and(m) {
    for (let i = 0; i < this.d.length; i++) if (!m.d[i]) this.d[i] = 0;
    return this;
  }
  add(m) {
    for (let i = 0; i < this.d.length; i++) if (m.d[i]) this.d[i] = 1;
    return this;
  }
  shift(dx, dy) {
    const out = new Mask(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) out.set(x + dx, y + dy);
    return out;
  }
}

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.c = Array.from({ length: h }, () => new Array(w).fill('.'));
  }
  mask() {
    return new Mask(this.w, this.h);
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.c[y][x] : '.';
  }
  set(x, y, ch) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.c[y][x] = ch;
  }
  // Fill a mask with a light->dark ramp. Each pixel's tone comes from how far the volume extends toward
  // and away from the light, so every part reads as a rounded volume lit from the top-left.
  shade(m, ramp, opts = {}) {
    let [lx, ly] = opts.light ?? [-0.55, -1];
    const n = Math.hypot(lx, ly);
    lx /= n;
    ly /= n;
    const k = ramp.length;
    const cuts = opts.cuts ?? (k === 4 ? [0.2, 0.48, 0.76] : k === 3 ? [0.3, 0.68] : k === 5 ? [0.14, 0.34, 0.58, 0.8] : [0.5]);
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (!m.has(x, y)) continue;
        let a = 0;
        while (a < 120 && m.has(x + 0.5 + lx * (a + 1) * 0.5, y + 0.5 + ly * (a + 1) * 0.5)) a++;
        let b = 0;
        while (b < 120 && m.has(x + 0.5 - lx * (b + 1) * 0.5, y + 0.5 - ly * (b + 1) * 0.5)) b++;
        const t = (a + 0.5) / (a + b + 1);
        let i = 0;
        while (i < cuts.length && t >= cuts[i]) i++;
        this.c[y][x] = ramp[Math.min(i + (opts.bias ?? 0), k - 1)];
      }
    }
    return this;
  }
  fill(m, ch) {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) this.c[y][x] = ch;
    return this;
  }
  // A 1px separation line around a part where it overlaps what was drawn before (call before painting it).
  edge(m, ch = 'x') {
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (m.has(x, y) || this.c[y][x] === '.') continue;
        if (m.has(x - 1, y) || m.has(x + 1, y) || m.has(x, y - 1) || m.has(x, y + 1)) this.c[y][x] = ch;
      }
    }
    return this;
  }
  // Paint a part: separation edge, then the shaded volume.
  part(m, ramp, opts = {}) {
    if (opts.edge !== false) this.edge(m, opts.edgeChar ?? 'x');
    return this.shade(m, ramp, opts);
  }
  // Overlay hand-drawn detail rows at (x, y): '.' keeps what is there, '_' erases.
  stamp(x, y, rows, only = null) {
    for (let j = 0; j < rows.length; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const ch = rows[j][i];
        if (ch === '.' || ch === ' ') continue;
        const gx = x + i;
        const gy = y + j;
        if (only && !only(this.get(gx, gy))) continue;
        this.set(gx, gy, ch === '_' ? '.' : ch);
      }
    }
    return this;
  }
  // Replace chars inside a mask (e.g. recolour a band of an already shaded part).
  remap(m, map) {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y) && map[this.c[y][x]]) this.c[y][x] = map[this.c[y][x]];
    return this;
  }
  rows() {
    return this.c.map((r) => r.join(''));
  }
}

// Template-literal art: one row per line, '.' transparent; rows are padded to equal width.
function art(s) {
  const lines = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length);
  const w = Math.max(...lines.map((l) => l.length));
  return lines.map((l) => l.padEnd(w, '.'));
}

function flipRows(rows) {
  return rows.map((r) => r.split('').reverse().join(''));
}

// ---------------------------------------------------------------- draw helpers

function lv(o) {
  const n = o?.level | 0;
  return n >= 1 && n <= 4 ? n : 1;
}

function T(e) {
  return e?.animT | 0;
}

function body(ctx, rows, pal, x, y, flip, alpha) {
  sprite(ctx, rows, pal, x, y, { anchor: 'feet', flip, outline: OUT, alpha });
}

// Mirror a horizontal offset for primitive-drawn details.
function fx(x, dx, flip) {
  return flip ? x - dx - 1 : x + dx;
}

function withAlpha(ctx, a, fn) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.max(0, Math.min(1, a));
  fn();
  ctx.globalAlpha = prev;
}

// Soft glow: concentric translucent discs.
function glow(ctx, x, y, r, color, a = 0.35) {
  withAlpha(ctx, a * 0.5, () => disc(ctx, x, y, r, color));
  withAlpha(ctx, a, () => disc(ctx, x, y, Math.max(1, Math.round(r * 0.6)), color));
}

// ================================================================= IRONCLAD

// Materials: armour a-e (light->deep), chrome p q s t, brass trim k l m n, furnace glow o g h,
// x dark seams, r rivets, w white.
const IRON_PAL = Object.freeze({
  a: '#cfd6df', b: '#9ea9b7', c: '#717c8b', d: '#4b5360', e: '#2f353f',
  p: '#f4f7fb', q: '#b8c2cf', s: '#78828f', t: '#4c5461',
  k: '#f2c45c', l: '#c48f33', m: '#8a611f', n: '#553b11',
  o: '#fff3c0', g: '#ffb53c', h: '#e0661b',
  x: '#1a1e27', r: '#f0f3f8', w: '#ffffff',
});
const IRON_PALS = [
  IRON_PAL,
  recolor(IRON_PAL, {
    a: '#f0c7a0', b: '#cf8c5a', c: '#a05e37', d: '#6c3b21', e: '#432414',
    k: '#bfd4ea', l: '#87a2c2', m: '#56708f', n: '#344761',
    o: '#e2fdff', g: '#62e2ff', h: '#2192c8',
  }),
  recolor(IRON_PAL, {
    a: '#a9b8de', b: '#7183b3', c: '#4e5e8b', d: '#333f64', e: '#1f2742',
    q: '#c5cde0', s: '#7f89a6',
    k: '#ffe28e', l: '#dcaa3c', m: '#9b701c', n: '#5f4310',
    o: '#ffd6cb', g: '#ff5a43', h: '#c02a1b',
  }),
  recolor(IRON_PAL, {
    a: '#857e9e', b: '#5f587a', c: '#423c59', d: '#2b263d', e: '#1a1726',
    p: '#e7dcff', q: '#a99bc9', s: '#6d6290', t: '#463d63',
    k: '#dda0ff', l: '#a85ee8', m: '#6f2db3', n: '#451a70',
    o: '#ffe6ff', g: '#f084ff', h: '#a93ae0',
  }),
];
const IRON_GLOW = ['#ffb53c', '#62e2ff', '#ff5a43', '#d070ff'];

const IW = 56;
const IH = 58;

// Pixels of mask `m` whose position along the axis (x0,y0)->(x1,y1) lies in [t0, t1] (bands on limbs).
function band(m, x0, y0, x1, y1, t0, t1) {
  const out = new Mask(m.w, m.h);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L2 = dx * dx + dy * dy || 1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.has(x, y)) continue;
      const t = ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / L2;
      if (t >= t0 && t <= t1) out.set(x, y);
    }
  }
  return out;
}

const BRASS = { a: 'k', b: 'k', c: 'l', d: 'm', e: 'n' };

// The piston fist, drawn at (x, y) = its top-left.
function ironFist(g, x, y, mode = 'down') {
  const m = g.mask().rect(x, y, 13, 11, 3);
  g.part(m, 'bcde');
  if (mode === 'down') {
    g.stamp(x, y, art(`
      ...aaabbb....
      ..abbbbbbbc..
      .abbbbbbbbcc.
      .xxxxxxxxxxx.
      .bxbbxbbxbcx.
      .bxbbxbbxccx.
      .bxbbxbcxccx.
      .dxddxddxddx.
      ..xxxxxxxxx..
    `), (c) => c !== '.');
    g.stamp(x + 2, y + 1, art('r.....r'));
  } else {
    g.stamp(x, y, art(`
      ..xxxxxxxxx..
      .bxbbxbbxbcx.
      .bxbbxbbxccx.
      .bxbbxbcxccx.
      .xxxxxxxxxxx.
      .abbbbbbbbcc.
      ..abbbbbbbc..
      ...r.....r...
    `), (c) => c !== '.');
  }
}

// Piston forearm from the elbow (ex, ey) to the wrist (wx, wy): an iron cylinder with brass collars and a
// chrome rod sliding out toward the wrist.
function ironForearm(g, ex, ey, wx, wy, rod = 3) {
  const len = Math.hypot(wx - ex, wy - ey) || 1;
  const ux = (wx - ex) / len;
  const uy = (wy - ey) / len;
  const cx = wx - ux * rod;
  const cy = wy - uy * rod;
  g.part(g.mask().capsule(cx, cy, wx, wy, 1.7), 'pqst');
  const cyl = g.mask().capsule(ex, ey, cx, cy, 4.8, 4.4);
  g.part(cyl, 'abcde');
  g.remap(band(cyl, ex, ey, cx, cy, 0.12, 0.26), BRASS);
  g.remap(band(cyl, ex, ey, cx, cy, 0.86, 1.2), BRASS);
  // a dark seam down the cylinder's shadow side
  const sx = ex + (cx - ex) * 0.55 + uy * 2.5;
  const sy = ey + (cy - ey) * 0.55 - ux * 2.5;
  g.set(sx, sy, 'r');
}

function ironHead(g, x, y, mood = 'idle') {
  const m = g.mask().ellipse(x + 7.5, y + 7.5, 7.4, 7.6).rect(x, y + 7, 15, 7, 2);
  g.part(m, 'abcde');
  const eyes = mood === 'hurt' ? 'xhxxxhxx' : mood === 'rage' ? 'ooooooox' : 'gogxxgog';
  g.stamp(x, y, art(`
    ......xx.......
    .....xaax......
    ...............
    ...............
    ....r..........
    ..ddddxxxxxxxxx
    .....x${eyes}
    ......xxxxxxxxx
    ...............
    .......xcxcxcx.
    .......xcxcxcx.
    ..r....xdxdxdx.
    ........xxxxx..
  `));
}

function ironTorso(g, x, y) {
  // barrel chest over a squarer belly
  const m = g.mask().ellipse(x + 16.5, y + 11, 16.5, 12).rect(x + 2, y + 10, 29, 12, 5);
  g.part(m, 'abcde');
  // the belly below the chest seam is a shade darker
  const belly = g.mask().rect(x, y + 15, 34, 10).and(m);
  g.remap(belly, { a: 'b', b: 'c', c: 'c', d: 'd', e: 'e' });
  const belt = g.mask().rect(x + 4, y + 19, 25, 5, 2);
  g.part(belt, 'klmn', { light: [-0.3, -1] });
  g.stamp(x, y, art(`
    ..................................
    ..................................
    ..................................
    ..............xxxxxxxxxxxx........
    .............xhhhhhhhhhhhhx.......
    .............xggggggggggggx.......
    .............xooooooooooggx.......
    .............xxxxxxxxxxxxxx.......
    .............xhhhhhhhhhhhhx.......
    .............xggggggggggggx.......
    .............xooooooooooggx.......
    ..............xxxxxxxxxxxx........
    ......r.....r..............r.r....
    ..................................
    ...xxxxxxxxxxxxxxxxxxxxxxxxxxxxx..
    ....r.......r.......r.......r.....
    ..................................
    ..................................
    ..................................
    ..................................
    ..............xxxxx...............
    ..............xgogx...............
    ..............xxxxx...............
  `));
}

function ironPauldron(g, x, y) {
  const outer = g.mask().ellipse(x + 8.5, y + 7.5, 8.5, 7.6);
  g.part(outer, 'abcde');
  g.remap(g.mask().ellipse(x + 8.5, y + 7.5, 8.5, 7.6).cut(g.mask().ellipse(x + 8.8, y + 7.9, 7, 6.2)), BRASS);
  g.stamp(x, y, art(`
    .................
    .................
    ......r....r.....
    .................
    ...r.............
    ..............r..
    .................
    ...r.............
    ..............r..
    .................
    ......r....r.....
  `));
}

function ironSaw(g, cx, cy, r = 9, edge = true, phase = 0) {
  const teeth = g.mask();
  const n = r >= 9 ? 14 : 12;
  for (let i = 0; i < n; i++) {
    const a = ((i + phase) / n) * Math.PI * 2;
    const a2 = a + (Math.PI * 2) / n * 0.55;
    teeth.poly([
      [cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2)],
      [cx + Math.cos(a) * (r + 1.8), cy + Math.sin(a) * (r + 1.8)],
      [cx + Math.cos(a2) * (r - 2), cy + Math.sin(a2) * (r - 2)],
    ]);
  }
  teeth.add(g.mask().ellipse(cx, cy, r - 0.5, r - 0.5));
  g.part(teeth, 'pqst', { edge });
  g.remap(g.mask().ellipse(cx, cy, r - 3.2, r - 3.2), { p: 'q', q: 's', s: 's', t: 't' });
  g.fill(g.mask().ellipse(cx, cy, r - 4.2, r - 4.2).cut(g.mask().ellipse(cx, cy, r - 5.2, r - 5.2)), 't');
  g.fill(g.mask().ellipse(cx, cy, 2.6, 2.6), 'x');
  g.fill(g.mask().ellipse(cx, cy, 1.3, 1.3), 'k');
}

function ironLegs(g, o) {
  const lift = o.lift ?? 0; // front leg raised (stomp wind-up)
  const stepB = o.stepB ?? 0;
  const stepF = o.stepF ?? 0;
  // back leg: a step deeper in the ramp (raised high for the stomp tell)
  const liftB = o.liftB ?? 0;
  if (liftB) {
    g.part(g.mask().capsule(22, 44, 14, 46 - liftB, 4.4), 'bcde', { bias: 1 });
    g.part(g.mask().rect(4, 43 - liftB, 13, 8, 3), 'bcde', { bias: 1 });
    g.stamp(4, 49 - liftB, art('.xxxxxxxxxxx.'));
  } else {
    g.part(g.mask().capsule(22, 44, 21, 50 - stepB, 4.4), 'bcde', { bias: 1 });
    g.part(g.mask().rect(14, 49 - stepB, 13, 8, 3), 'bcde', { bias: 1 });
    g.stamp(14, 55 - stepB, art('.xxxxxxxxxxx.'));
  }
  // front leg
  const fx0 = 29 + Math.round(lift * 0.4);
  const fy0 = 49 - stepF - lift;
  g.part(g.mask().capsule(34, 44 - Math.round(lift * 0.5), 35 + lift * 0.3, fy0 + 1, 4.6), 'abcde');
  const boot = g.mask().rect(fx0, fy0, 14, 8, 3);
  g.part(boot, 'abcde');
  g.remap(g.mask().rect(fx0, fy0, 14, 3).and(boot), BRASS);
  g.stamp(fx0, fy0, art(`
    ...r.....r....
    ..............
    ..............
    ..............
    ..............
    ..............
    .xxxxxxxxxxxx.
  `));
}

// A full Ironclad pose. o: { arm: 'hang'|'raise'|'launch'|'slam'|'catch', back: 'saw'|'raise'|'throw'|'empty',
// lift, stepB, stepF, dy (body sink), lean, mood }
function ironPose(o = {}) {
  const g = new Grid(IW, IH);
  const dy = o.dy ?? 0;
  const bx = o.lean ?? 0;
  const back = o.back ?? 'saw';
  // the great saw rides on its back
  if (back === 'saw') ironSaw(g, 13 + bx, 24 + dy, 10, false);
  // back arm
  if (back === 'raise') {
    g.part(g.mask().capsule(17 + bx, 28 + dy, 11 + bx, 17 + dy, 4.2), 'bcde', { bias: 1 });
    ironSaw(g, 8 + bx, 9 + dy, 9);
  } else if (back !== 'throw') {
    g.part(g.mask().capsule(17 + bx, 28 + dy, 12 + bx, 38 + dy, 4.2), 'bcde', { bias: 1 });
    g.part(g.mask().rect(7 + bx, 37 + dy, 9, 8, 3), 'bcde', { bias: 1 });
  }
  ironLegs(g, o);
  ironTorso(g, 11 + bx, 22 + dy);
  ironHead(g, 23 + bx, 8 + dy, o.mood);
  // the throwing arm swings across the front of the body
  if (back === 'throw') {
    g.part(g.mask().capsule(18 + bx, 28 + dy, 33 + bx, 32 + dy, 4.2), 'abcde');
    g.part(g.mask().rect(31 + bx, 28 + dy, 9, 8, 3), 'abcde');
  }
  // front arm
  const arm = o.arm ?? 'hang';
  ironPauldron(g, 31 + bx, 17 + dy);
  if (arm === 'hang' || arm === 'catch') {
    const up = arm === 'catch' ? 3 : 0;
    ironForearm(g, 42 + bx, 29 + dy, 44 + bx, 42 + dy - up);
    ironFist(g, 37 + bx, 41 + dy - up, 'down');
  } else if (arm === 'raise') {
    ironForearm(g, 43 + bx, 22 + dy, 42 + bx, 9 + dy);
    ironFist(g, 35 + bx, 0 + dy, 'up');
  } else if (arm === 'launch') {
    ironForearm(g, 43 + bx, 22 + dy, 44 + bx, 7 + dy, 6);
  } else if (arm === 'slam') {
    ironForearm(g, 42 + bx, 28 + dy, 46 + bx, 40 + dy);
    ironFist(g, 41 + bx, 40 + dy, 'down');
  }
  const rows = g.rows();
  rows.lean = bx; // overlays (furnace light) follow the body
  rows.dy = dy;
  return rows;
}

const IRON = {
  idle: ironPose({}),
  idle2: ironPose({ dy: 1 }),
  stepA: ironPose({ stepF: 3, dy: 1 }),
  stepB: ironPose({ stepB: 3, dy: 1 }),
  windup: ironPose({ arm: 'raise', lean: -1, mood: 'rage' }),
  launch: ironPose({ arm: 'launch', mood: 'rage' }),
  catch: ironPose({ arm: 'catch', dy: 1 }),
  sawwind: ironPose({ back: 'raise', lean: -1 }),
  throw: ironPose({ back: 'throw', lean: 1 }),
  stompwind: ironPose({ liftB: 9, lean: 2, dy: -1, arm: 'catch', mood: 'rage' }),
  stomp: ironPose({ dy: 3, arm: 'slam', mood: 'rage' }),
  hurt: ironPose({ lean: -3, dy: 2, arm: 'catch', mood: 'hurt' }),
  summon: ironPose({ arm: 'slam', mood: 'rage' }),
};

function drawIronclad(ctx, e, x, y, t) {
  const L = lv(e);
  const pal = IRON_PALS[L - 1];
  const flip = (e.facing ?? 1) < 0;
  const a = e.anim ?? 'idle';
  const k = T(e);
  let rows;
  let ox = 0;
  switch (a) {
    case 'move':
      rows = k < 6 ? IRON.stepA : IRON.stepB;
      break;
    case 'windup':
      rows = IRON.windup;
      ox = k % 4 < 2 ? 0 : -1;
      break;
    case 'launch':
      rows = IRON.launch;
      break;
    case 'catch':
      rows = IRON.catch;
      break;
    case 'sawwind':
      rows = IRON.sawwind;
      ox = k % 6 < 3 ? 0 : -1;
      break;
    case 'throw':
      rows = IRON.throw;
      break;
    case 'stompwind':
      rows = IRON.stompwind;
      break;
    case 'stomp':
      rows = IRON.stomp;
      break;
    case 'hurt':
    case 'delete':
      rows = IRON.hurt;
      ox = k % 4 < 2 ? -1 : 1;
      break;
    case 'summon':
      // called by the player's Navi chip: cock the fist, fire it at the foe, catch it again
      rows = k < 12 ? IRON.windup : k < 50 ? IRON.launch : IRON.catch;
      break;
    case 'slam':
      rows = IRON.summon;
      break;
    default:
      rows = Math.floor(t / 24) % 2 ? IRON.idle2 : IRON.idle;
  }
  const gc = IRON_GLOW[L - 1];
  if (L === 4) glow(ctx, x, y - 26, 26, '#9a30d8', 0.16 + 0.05 * Math.sin(t / 8));
  const bx = x + (flip ? -ox : ox);
  body(ctx, rows, pal, bx, y, flip);
  // furnace light through the grate
  const sink = rows.dy ?? 0;
  const lean = rows.lean ?? 0;
  if (rows === IRON.launch && k < 8) {
    // rocket flare where the fist left the piston
    const fx0 = fx(bx, 16, flip);
    disc(ctx, fx0, y - IH + 4 - k, 3, IRON_GLOW[L - 1]);
    disc(ctx, fx0, y - IH + 4 - k, 1, '#ffffff');
  }
  const gx = fx(bx, 4 + lean, flip);
  const gy = y - IH + 30 + sink;
  withAlpha(ctx, 0.22 + 0.1 * Math.sin(t / 6), () => ellipse(ctx, gx, gy, 9, 6, gc));
  // exhaust steam from the back
  if (a === 'idle' || a === 'move' || a === 'catch') {
    const ph = (t + (e.id ?? 0) * 17) % 80;
    if (ph < 36) {
      const sx = fx(bx, -15 - Math.floor(ph / 9), flip);
      const sy = y - IH + 16 + sink - Math.floor(ph / 2);
      withAlpha(ctx, 0.55 * (1 - ph / 36), () => {
        disc(ctx, sx, sy, 2 + Math.floor(ph / 9), '#e8eef6');
        disc(ctx, fx(sx, 3, flip), sy + 2, 1 + Math.floor(ph / 12), '#c8d0dc');
      });
    }
  }
}

// ================================================================= SABRE

// Materials: crimson armour a-e, bodysuit u v y, gold trim k l m, silver p q s t, face f, eyes o h,
// blade w j i, shield energy g G H, x dark seams.
const SABRE_PAL = Object.freeze({
  a: '#ffb8bc', b: '#f0465a', c: '#b8243e', d: '#74112c', e: '#3e0818',
  u: '#5a6ca0', v: '#343f6c', y: '#1c2244',
  k: '#ffe08a', l: '#d9a43a', m: '#94671c',
  p: '#ffffff', q: '#c8d2ea', s: '#8691b4', t: '#4e5878',
  f: '#12162a', o: '#ffe56a', h: '#ff9a3c',
  w: '#ffffff', j: '#ff8ab8', i: '#e0306e',
  g: '#aef8ff', G: '#3ec8ee', H: '#1c78b8',
  x: '#1b1020',
});
const SABRE_PALS = [
  SABRE_PAL,
  recolor(SABRE_PAL, {
    a: '#d2ebff', b: '#5aa8f0', c: '#2f6cc0', d: '#1a3f80', e: '#0e2148',
    u: '#585b78', v: '#36384f', y: '#1d1e2e',
    k: '#f4f8ff', l: '#b0bcd8', m: '#6e7a9c',
    o: '#d2ffff', h: '#40c8f0', j: '#8af0ff', i: '#2aa8e0',
    g: '#fff4b8', G: '#ffd060', H: '#c08a20',
  }),
  recolor(SABRE_PAL, {
    a: '#9a9ab2', b: '#545468', c: '#33333f', d: '#1f1f28', e: '#101016',
    u: '#e0465a', v: '#a8203a', y: '#6a1028',
    o: '#ff8a8a', h: '#d02040', j: '#ffd86a', i: '#e09a20',
    g: '#ffd0d0', G: '#ff5a6a', H: '#b02040',
  }),
  recolor(SABRE_PAL, {
    a: '#c8a0f0', b: '#7a46c0', c: '#4e2888', d: '#301656', e: '#1a0a30',
    u: '#2c2644', v: '#1c1830', y: '#100e1e',
    k: '#ffb8f4', l: '#e060c8', m: '#902a80',
    q: '#d8c8f0', s: '#9a84c0', t: '#5a4880',
    o: '#ffe0ff', h: '#ff60e0', j: '#ff8af0', i: '#c030c0',
    g: '#f4d0ff', G: '#c070ff', H: '#7a30c0',
  }),
];
const SABRE_GLOW = ['#ff5a7a', '#5ab8ff', '#ff4a5a', '#c050ff'];

const SW = 60;
const SH = 56;

function hexShield(g, cx, cy, rx, ry) {
  const pts = [[cx, cy - ry], [cx + rx, cy - ry / 2], [cx + rx, cy + ry / 2], [cx, cy + ry], [cx - rx, cy + ry / 2], [cx - rx, cy - ry / 2]];
  const m = g.mask().poly(pts);
  g.part(m, 'pqst');
  const inner = g.mask().poly(pts.map(([x, y]) => [cx + (x - cx) * 0.6, cy + (y - cy) * 0.64]));
  g.shade(inner, 'gGH', { cuts: [0.4, 0.75] });
  g.set(cx - 1, cy - 1, 'p');
  g.set(cx - 2, cy - 2, 'g');
}

function sabreBlade(g, hx, hy, ang, len) {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  // hilt and guard
  g.part(g.mask().capsule(hx - ux * 3, hy - uy * 3, hx, hy, 1.2), 'klm');
  g.part(g.mask().capsule(hx + uy * 2.6, hy - ux * 2.6, hx - uy * 2.6, hy + ux * 2.6, 1.1), 'klm');
  // a slightly curved blade: two segments, the second bending toward the back edge
  const mx = hx + ux * len * 0.55;
  const my = hy + uy * len * 0.55;
  const bend = 0.18;
  const tx = mx + Math.cos(ang - bend) * len * 0.45;
  const ty = my + Math.sin(ang - bend) * len * 0.45;
  const edge = g.mask().capsule(hx + ux, hy + uy, mx, my, 1.6, 1.5).add(g.mask().capsule(mx, my, tx, ty, 1.5, 0.4));
  g.edge(edge, 'x');
  g.fill(edge, 'j');
  g.fill(g.mask().capsule(hx + ux, hy + uy, mx, my, 0.7).add(g.mask().capsule(mx, my, tx - Math.cos(ang - bend), ty - Math.sin(ang - bend), 0.6)), 'w');
}

// Pose keys: lean (upper body x), dy (sink), legs, tails, plume, fArm [elbow, hand], bArm [elbow, hand],
// blade [ang, len], bladeBehind, shield 'back'|'front'|'none', mood.
function sabrePose(o = {}) {
  const g = new Grid(SW, SH);
  const L = o.lean ?? 0;
  const D = o.dy ?? 0;
  const X = (v) => v + L;
  const Y = (v) => v + D;
  const legs = o.legs ?? 'stance';
  const LEGS = {
    stance: { b: [[28, 39], [25, 45], [24, 51]], f: [[33, 39], [36, 45], [37, 51]] },
    lunge: { b: [[28, 40], [22, 45], [17, 50]], f: [[33, 40], [40, 44], [42, 51]] },
    crouch: { b: [[28, 41], [23, 46], [23, 51]], f: [[33, 41], [39, 45], [38, 51]] },
    run: { b: [[28, 39], [22, 43], [15, 46]], f: [[33, 39], [39, 43], [38, 50]] },
  }[legs];
  const leg = (pts, bias) => {
    const [h, k, a] = pts;
    g.part(g.mask().capsule(X(h[0]) - L * 0.5, Y(h[1]), k[0], k[1], 2.9, 2.5), 'uvy', { bias });
    g.part(g.mask().capsule(k[0], k[1], a[0], a[1], 2.5, 2.1), 'abcde', { bias });
    // pointed knee guard and boot
    g.part(g.mask().poly([[k[0] - 2, k[1] - 2.5], [k[0] + 3.5, k[1] + 0.5], [k[0] - 1, k[1] + 2.5]]), 'abcde', { bias });
    g.part(g.mask().poly([[a[0] - 3, a[1] - 1], [a[0] + 2, a[1] - 1], [a[0] + 8, a[1] + 4.6], [a[0] - 3.5, a[1] + 4.6]]), 'abcde', { bias });
    g.stamp(Math.round(a[0]) - 2, Math.round(a[1]) + 3, art('xxxxxxxxx'));
  };
  // coat tails stream behind
  const tails = o.tails ?? 0; // 0 hanging, 1 flying back
  const tp = tails
    ? [[X(27), Y(34)], [X(24), Y(35)], [X(9), Y(39)], [X(10), Y(41)], [X(16), Y(41)], [X(8), Y(46)], [X(12), Y(47)], [X(27), Y(40)]]
    : [[X(27), Y(34)], [X(24), Y(35)], [X(16), Y(49)], [X(19), Y(50)], [X(22), Y(44)], [X(21), Y(53)], [X(24), Y(52)], [X(28), Y(41)]];
  g.part(g.mask().poly(tp), 'bcde', { bias: 1, edge: false });
  // white plume from the back of the helm
  const pl = o.plume ?? 0;
  const hx = X(32);
  const hy = Y(17);
  g.part(
    g.mask()
      .capsule(hx - 5, hy - 3, hx - 9, hy + pl * 0.5, 2.3, 2)
      .add(g.mask().capsule(hx - 9, hy + pl * 0.5, hx - 12 + pl, hy + 6, 2, 1.4))
      .add(g.mask().capsule(hx - 12 + pl, hy + 6, hx - 13 + pl * 2, hy + 12, 1.4, 0.4)),
    'pqst',
    { edge: false },
  );
  // back arm + shield behind
  const bArm = o.bArm ?? [[23, 31], [20, 35]];
  g.part(g.mask().capsule(X(25), Y(26), X(bArm[0][0]), Y(bArm[0][1]), 2.3), 'uvy', { bias: 1 });
  g.part(g.mask().capsule(X(bArm[0][0]), Y(bArm[0][1]), X(bArm[1][0]), Y(bArm[1][1]), 2.4, 2.2), 'abcde', { bias: 1 });
  const shield = o.shield ?? 'back';
  if (shield === 'back') hexShield(g, X(bArm[1][0]) - 2, Y(bArm[1][1]) - 1, 6.2, 7.8);
  if (o.bladeBehind) sabreBlade(g, X(o.fArm[1][0]), Y(o.fArm[1][1]), o.blade[0], o.blade[1]);
  leg(LEGS.b, 1);
  leg(LEGS.f, 0);
  // waist: dark suit + gold belt
  g.part(g.mask().rect(X(26), Y(32), 10, 8, 3), 'uvy');
  g.stamp(X(26), Y(36), art('.kkkkllll.'));
  // V-cut crimson breastplate over the suit
  const chest = g.mask().ellipse(X(31), Y(28.5), 6.8, 6.4);
  g.part(chest, 'uvy');
  const plate = g.mask().poly([[X(24.5), Y(23.5)], [X(37.8), Y(23.5)], [X(36.5), Y(29)], [X(31.5), Y(34)], [X(25.5), Y(29)]]).and(chest);
  g.shade(plate, 'abcde');
  g.stamp(X(25), Y(23), art(`
    .............
    .k.........k.
    ..l.......l..
    ...l.....l...
    ....l...l....
    .....lkl.....
  `));
  // back pauldron
  g.part(g.mask().poly([[X(21), Y(25)], [X(25), Y(22)], [X(29), Y(24)], [X(27), Y(28)], [X(22), Y(28)]]), 'abcde', { bias: 1 });
  // helm: crimson shell, dark visor band, jaw guard, gold crest
  const head = g.mask().ellipse(hx, hy, 6.5, 6.7);
  g.part(head, 'abcde');
  g.part(g.mask().poly([[hx + 2, hy + 2], [hx + 8, hy + 1], [hx + 6, hy + 6], [hx + 1, hy + 7]]), 'abcde');
  g.part(g.mask().poly([[hx + 1, hy - 6], [hx + 6, hy - 12], [hx + 5, hy - 5]]), 'klm');
  const mood = o.mood ?? 'idle';
  const eyes = mood === 'hurt' ? 'xhxxhx' : mood === 'fierce' ? 'oooooo' : 'xoxxo.';
  g.stamp(hx - 1, hy - 2, art(`
    ..xxxxxxx.
    .xffffffffx
    .f${eyes}fx
    ..xxxxxxxx
  `));
  // front pauldron (angular, gold-edged)
  const fp = g.mask().poly([[X(33), Y(23)], [X(38), Y(21.5)], [X(42), Y(24.5)], [X(40.5), Y(28.5)], [X(34), Y(28)]]);
  g.part(fp, 'abcde');
  g.remap(g.mask().rect(X(32), Y(27), 12, 2).and(fp), { a: 'k', b: 'k', c: 'l', d: 'm', e: 'm' });
  // front arm + blade
  const fa = o.fArm ?? [[39, 31], [42, 35]];
  g.part(g.mask().capsule(X(37), Y(26), X(fa[0][0]), Y(fa[0][1]), 2.3), 'uvy');
  g.part(g.mask().capsule(X(fa[0][0]), Y(fa[0][1]), X(fa[1][0]), Y(fa[1][1]), 2.5, 2.3), 'abcde');
  if (!o.bladeBehind && o.blade) sabreBlade(g, X(fa[1][0]), Y(fa[1][1]), o.blade[0], o.blade[1]);
  if (shield === 'front') {
    g.part(g.mask().capsule(X(27), Y(27), X(36), Y(30), 2.3), 'abcde');
    hexShield(g, X(41), Y(29), 7.5, 9.5);
  }
  return g.rows();
}

const SABRE = {
  idle: sabrePose({ blade: [1.0, 16] }),
  idle2: sabrePose({ blade: [1.0, 16], dy: 1, plume: 1, fArm: [[39, 32], [42, 36]] }),
  move: sabrePose({ lean: 2, dy: 1, legs: 'run', tails: 1, plume: -2, fArm: [[36, 32], [33, 36]], blade: [2.75, 15] }),
  guard: sabrePose({ dy: 2, legs: 'crouch', shield: 'front', fArm: [[35, 32], [31, 35]], blade: [2.2, 14], bladeBehind: true, mood: 'fierce' }),
  windup: sabrePose({ lean: -2, legs: 'crouch', fArm: [[37, 19], [33, 12]], blade: [-2.55, 17], bladeBehind: true, mood: 'fierce' }),
  slash: sabrePose({ lean: 3, dy: 2, legs: 'lunge', tails: 1, plume: -2, fArm: [[42, 30], [46, 34]], blade: [0.35, 15], mood: 'fierce' }),
  aim: sabrePose({ lean: -2, dy: 1, legs: 'crouch', fArm: [[34, 32], [30, 34]], blade: [3.05, 16], bladeBehind: true, mood: 'fierce' }),
  thrust: sabrePose({ lean: 4, dy: 2, legs: 'lunge', tails: 1, plume: -2, fArm: [[42, 28], [47, 29]], blade: [0.02, 16], mood: 'fierce' }),
  hurt: sabrePose({ lean: -3, dy: 1, blade: [1.4, 15], fArm: [[37, 33], [38, 37]], mood: 'hurt' }),
  summon: sabrePose({ fArm: [[40, 28], [38, 22]], blade: [-1.45, 17], mood: 'fierce' }),
};

function drawSabre(ctx, e, x, y, t) {
  const L = lv(e);
  const pal = SABRE_PALS[L - 1];
  const flip = (e.facing ?? 1) < 0;
  const a = e.anim ?? 'idle';
  const k = T(e);
  let rows;
  let ox = 0;
  switch (a) {
    case 'move':
      rows = SABRE.move;
      // afterimages trail behind the blink
      withAlpha(ctx, 0.25, () => body(ctx, SABRE.move, SABRE_PALS[L - 1], x + (flip ? 7 : -7), y, flip));
      break;
    case 'guard':
      rows = SABRE.guard;
      break;
    case 'windup':
      rows = SABRE.windup;
      ox = k % 4 < 2 ? 0 : -1;
      break;
    case 'slash':
      rows = SABRE.slash;
      break;
    case 'aim':
      rows = SABRE.aim;
      ox = k % 4 < 2 ? 0 : -1;
      break;
    case 'thrust':
      rows = SABRE.thrust;
      break;
    case 'hurt':
    case 'delete':
      rows = SABRE.hurt;
      ox = k % 4 < 2 ? -1 : 0;
      break;
    case 'summon':
      // Navi chip: a salute, then the cut lands on the foe
      rows = k < 12 ? SABRE.summon : k < 30 ? SABRE.slash : SABRE.idle;
      break;
    default:
      rows = Math.floor(t / 20) % 2 ? SABRE.idle2 : SABRE.idle;
  }
  if (L === 4) glow(ctx, x, y - 24, 22, '#9a30d8', 0.16 + 0.05 * Math.sin(t / 7));
  const bx = x + (flip ? -ox : ox);
  body(ctx, rows, pal, bx, y, flip);
  // the raised shield shimmers
  if (a === 'guard') {
    const cx = fx(bx, 10, flip);
    withAlpha(ctx, 0.3 + 0.2 * Math.sin(t / 2), () => ellipse(ctx, cx, y - SH + 29 + 2, 6, 8, SABRE_GLOW[L - 1]));
  }
  // charging glint on the blade during wind-ups
  if ((a === 'windup' || a === 'aim') && k % 6 < 3) {
    const gx = a === 'windup' ? fx(bx, -12, flip) : fx(bx, -15, flip);
    const gy = a === 'windup' ? y - SH + 4 : y - SH + 34;
    px(ctx, gx, gy, '#ffffff');
    px(ctx, gx - 1, gy, '#ffffff');
    px(ctx, gx + 1, gy, '#ffffff');
    px(ctx, gx, gy - 1, '#ffffff');
    px(ctx, gx, gy + 1, '#ffffff');
  }
}

// ================================================================= ZERODAY

// Materials: cloak a-d (+e deepest), chrome p q s t, core o g h, eyes r R, void x, accent k l (trim).
const ZERO_PAL = Object.freeze({
  a: '#62629a', b: '#3a3a62', c: '#262646', d: '#17172e', e: '#0b0b18',
  p: '#eef1fb', q: '#aab2ca', s: '#6c7492', t: '#3e4462',
  o: '#f0ffff', g: '#6af0ff', h: '#1a90c0',
  r: '#ff4060', R: '#ffb0bc',
  k: '#8a7ac8', l: '#5a4a96',
  x: '#05050c',
});
const ZERO_PALS = [
  ZERO_PAL,
  recolor(ZERO_PAL, {
    a: '#7a4258', b: '#4c2a3c', c: '#321a28', d: '#1e0e18', e: '#10060c',
    o: '#fff0d8', g: '#ff8a3a', h: '#c03a1a', k: '#d8606a', l: '#963040',
  }),
  recolor(ZERO_PAL, {
    a: '#56666a', b: '#323e42', c: '#20292c', d: '#13191b', e: '#090d0e',
    p: '#fff6dc', q: '#e0c88a', s: '#a8884a', t: '#6a5428',
    o: '#fffbe0', g: '#ffd84a', h: '#c08a10', k: '#e0c060', l: '#a08030',
  }),
  recolor(ZERO_PAL, {
    a: '#683a8e', b: '#40225c', c: '#2a143e', d: '#180a26', e: '#0c0414',
    p: '#f4e8ff', q: '#c0a8e0', s: '#8068a8', t: '#4a3a70',
    o: '#ffe8ff', g: '#f070ff', h: '#a030d0', r: '#ff60f0', R: '#ffd0ff', k: '#d080ff', l: '#8a40c0',
  }),
];
const ZERO_CORE = ['#6af0ff', '#ff8a3a', '#ffd84a', '#f070ff'];
const ZERO_DARK = ['#3a2a8a', '#8a1a2a', '#6a5a10', '#7a10a0'];

const ZW = 60;
const ZH = 62;

function zeroClaw(g, sx, sy, hx, hy, curl = 0) {
  // sleeve
  g.part(g.mask().capsule(sx, sy, hx, hy, 3.4, 2.8), 'abcd');
  // gauntlet and three talons
  g.part(g.mask().ellipse(hx, hy + 1, 3.3, 2.8), 'pqst');
  const ang = Math.atan2(hy - sy, hx - sx);
  for (let i = -1; i <= 1; i++) {
    const a = ang + i * 0.42 + curl;
    const bx = hx + Math.cos(a) * 2;
    const by = hy + 1 + Math.sin(a) * 2;
    g.part(g.mask().capsule(bx, by, bx + Math.cos(a + curl) * 4.5, by + Math.sin(a + curl) * 4.5, 1.1, 0.3), 'pqst');
  }
}

// Pose keys: dy, lean, hem (0/1 ripple), spread (cloak flare), fClaw/bClaw [shoulder->hand], hood (lowered), mood.
function zeroPose(o = {}) {
  const g = new Grid(ZW, ZH);
  const D = o.dy ?? 0;
  const L = o.lean ?? 0;
  const X = (v) => v + L;
  const Y = (v) => v + D;
  const sp = o.spread ?? 0;
  const hem = o.hem ?? 0;
  // cloak bell with a tattered hem
  const cloak = g.mask().poly([[X(24), Y(21)], [X(38), Y(21)], [X(42 + sp * 0.4), Y(31)], [46 + sp, Y(45)], [47 + sp, Y(51)], [13 - sp, Y(51)], [14 - sp, Y(44)], [X(19 - sp * 0.4), Y(30)]]);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x0 = 13 - sp + ((34 + sp * 2) * i) / n;
    const x1 = 13 - sp + ((34 + sp * 2) * (i + 1)) / n;
    const len = [6, 3, 7, 4, 6, 2, 7, 4, 5][(i + hem * 3) % 9];
    const tipx = (x0 + x1) / 2 + (hem ? 1.5 : -1);
    cloak.poly([[x0, Y(50)], [x1, Y(50)], [tipx, Y(50 + len)]]);
  }
  g.part(cloak, 'abcde', { edge: false });
  // fold lines down the cloak
  for (const [fx0, fx1, len] of [[22, 18 - sp, 22], [26, 24 - sp * 0.5, 24], [40, 44 + sp, 20]]) {
    for (let j = 0; j < len; j++) {
      const yy = Y(29) + j;
      const xx = Math.round(X(fx0) + ((fx1 - fx0) * j) / len);
      if (g.get(xx, yy) !== '.' && g.get(xx, yy) !== 'x') g.set(xx, yy, 'e');
      if (g.get(xx - 1, yy) !== '.' && g.get(xx - 1, yy) !== 'x' && j % 3) g.set(xx - 1, yy, 'b');
    }
  }
  // the cloak parts in front over the void
  const slit = g.mask().poly([[X(31), Y(25)], [X(35), Y(25)], [X(37) + sp * 0.3, Y(52)], [X(29) - sp * 0.3, Y(52)]]);
  g.fill(slit.and(cloak), 'x');
  g.stamp(X(28), Y(24), art(`
    ...k.....k..
    ...k.....k..
    ....k...k...
    ....l...l...
  `));
  // back claw
  const bc = o.bClaw ?? [[22, 25], [18, 39]];
  zeroClaw(g, X(bc[0][0]), Y(bc[0][1]), X(bc[1][0]), Y(bc[1][1]), o.bCurl ?? 0.2);
  // shoulder spikes
  g.part(g.mask().poly([[X(22), Y(22)], [X(18), Y(12)], [X(26), Y(21)]]), 'pqst');
  g.part(g.mask().poly([[X(36), Y(21)], [X(44), Y(12)], [X(40), Y(23)]]), 'pqst');
  // hood with a swept-back point
  const hy = Y(o.hood ? 18 : 15);
  const hood = g.mask().ellipse(X(31), hy, 8.2, 8.6).poly([[X(26), hy - 6], [X(15), hy - 12], [X(24), hy + 1]]);
  g.part(hood, 'abcde');
  // face: a void opening with a cracked chrome mask and slit eyes
  const face = g.mask().ellipse(X(34.5), hy + 1.5, 4.6, 6);
  g.fill(face, 'x');
  const mask = g.mask().ellipse(X(35), hy + 2, 3.2, 4.6);
  g.shade(mask, 'pqst', { cuts: [0.25, 0.55, 0.8] });
  const mood = o.mood ?? 'idle';
  const eye = mood === 'hurt' ? 'R.R' : mood === 'fierce' ? 'rrr' : 'r.r';
  g.stamp(X(33), hy, art(`
    ....x.
    .${eye}..
    ...x..
    ..x...
  `));
  if (mood === 'fierce') g.stamp(X(33), hy + 1, art('.R.R.'));
  // void core
  g.fill(g.mask().ellipse(X(33), Y(32), 3.6, 3.6), 'h');
  g.fill(g.mask().ellipse(X(33), Y(32), 2.6, 2.6), 'g');
  g.fill(g.mask().ellipse(X(33), Y(32), 1.6, 1.6), 'x');
  g.set(X(32), Y(31), 'o');
  // front claw
  const fc = o.fClaw ?? [[39, 25], [43, 39]];
  zeroClaw(g, X(fc[0][0]), Y(fc[0][1]), X(fc[1][0]), Y(fc[1][1]), o.fCurl ?? -0.2);
  const rows = g.rows();
  rows.lean = L; // the core glow overlay follows the body
  rows.dy = D;
  return rows;
}

const ZERO = {
  idle: zeroPose({}),
  idle2: zeroPose({ hem: 1, dy: 1 }),
  barragewind: zeroPose({ fClaw: [[39, 25], [47, 22]], fCurl: 0.5, mood: 'fierce' }),
  barrage: zeroPose({ lean: -1, fClaw: [[39, 25], [50, 27]], fCurl: 0, mood: 'fierce', hem: 1 }),
  crouch: zeroPose({ dy: 5, spread: 4, hood: 1, fClaw: [[39, 26], [44, 40]], bClaw: [[22, 26], [16, 40]], mood: 'fierce' }),
  leap: zeroPose({ dy: -2, spread: -2, hem: 1, fClaw: [[39, 24], [43, 10]], bClaw: [[22, 24], [19, 10]], fCurl: 0.3, bCurl: -0.3 }),
  smash: zeroPose({ dy: 4, spread: 5, hood: 1, lean: 2, fClaw: [[39, 26], [47, 44]], fCurl: 0.4, mood: 'fierce' }),
  aura: zeroPose({ spread: 3, fClaw: [[39, 25], [51, 19]], bClaw: [[22, 25], [9, 19]], fCurl: -0.6, bCurl: 0.6, mood: 'fierce' }),
  charge: zeroPose({ lean: -1, dy: 1, fClaw: [[39, 26], [47, 31]], bClaw: [[24, 26], [40, 34]], fCurl: 0.9, mood: 'fierce', hem: 1 }),
  beam: zeroPose({ lean: -3, spread: 2, fClaw: [[37, 26], [48, 29]], bClaw: [[24, 26], [44, 32]], fCurl: 0, mood: 'fierce' }),
  hurt: zeroPose({ lean: -3, dy: 1, hood: 1, mood: 'hurt', fClaw: [[39, 26], [41, 39]] }),
};
ZERO.summon = ZERO.aura;

function drawZeroday(ctx, e, x, y, t) {
  const L = lv(e);
  const pal = ZERO_PALS[L - 1];
  const flip = (e.facing ?? 1) < 0;
  const a = e.anim ?? 'idle';
  const k = T(e);
  const core = ZERO_CORE[L - 1];
  const dark = ZERO_DARK[L - 1];
  let rows = ZERO.idle;
  let ox = 0;
  // it floats: a slow bob
  const bob = a === 'leap' || a === 'smash' || a === 'crouch' ? 0 : Math.round(Math.sin(t / 14) * 1.5) - 1;
  switch (a) {
    case 'barragewind':
      rows = ZERO.barragewind;
      break;
    case 'barrage':
      rows = ZERO.barrage;
      break;
    case 'crouch':
      rows = ZERO.crouch;
      ox = k % 4 < 2 ? 0 : 1;
      break;
    case 'leap':
      rows = ZERO.leap;
      break;
    case 'smash':
      rows = ZERO.smash;
      break;
    case 'aura':
      rows = ZERO.aura;
      break;
    case 'charge':
      rows = ZERO.charge;
      ox = k % 6 < 3 ? 0 : -1;
      break;
    case 'beam':
      rows = ZERO.beam;
      ox = k % 4 < 2 ? 0 : -1;
      break;
    case 'hurt':
    case 'delete':
      rows = ZERO.hurt;
      ox = k % 4 < 2 ? -1 : 1;
      break;
    case 'summon':
      // Giga chip: gather the void, then throw the arms wide as the storm falls
      rows = k < 12 ? ZERO.charge : ZERO.summon;
      break;
    default:
      rows = Math.floor(t / 18) % 2 ? ZERO.idle2 : ZERO.idle;
  }
  const bx = x + (flip ? -ox : ox);
  const by = y + bob;
  // a dark haze pools under and around it
  withAlpha(ctx, 0.22 + 0.06 * Math.sin(t / 9), () => ellipse(ctx, bx, by - 30, 20, 26, dark));
  if (L === 4) glow(ctx, bx, by - 30, 26, '#b030e0', 0.2 + 0.07 * Math.sin(t / 6));
  if (a === 'move') {
    // warping: sliced and see-through
    withAlpha(ctx, 0.5, () => body(ctx, rows, pal, bx + (k % 2 ? 2 : -2), by, flip));
  } else body(ctx, rows, pal, bx, by, flip);
  // the void core pulses
  const cx = fx(bx, 3 + (rows.lean ?? 0), flip);
  const cy = by - ZH + 32 + (rows.dy ?? 0);
  withAlpha(ctx, 0.35 + 0.2 * Math.sin(t / 5), () => disc(ctx, cx, cy, 4 + (t % 30 < 15 ? 1 : 0), core));
  // attack glows
  if (a === 'barragewind') {
    const hx = fx(bx, 19, flip);
    const r = 2 + Math.min(4, Math.floor(k / 4));
    withAlpha(ctx, 0.5, () => disc(ctx, hx, by - ZH + 19, r + 2, dark));
    disc(ctx, hx, by - ZH + 19, r, '#0a0614');
    ring(ctx, hx, by - ZH + 19, r + 1, core);
  }
  if (a === 'barrage' && k % 6 < 3) {
    const hx = fx(bx, 24, flip);
    disc(ctx, hx, by - ZH + 26, 3, core);
    disc(ctx, hx, by - ZH + 26, 1, '#ffffff');
  }
  if (a === 'charge' || a === 'beam') {
    const hx = fx(bx, a === 'beam' ? 22 : 19, flip);
    const hy = by - ZH + 31;
    const r = a === 'beam' ? 7 : Math.min(8, 2 + Math.floor(k / 8));
    withAlpha(ctx, 0.4, () => disc(ctx, hx, hy, r + 3, dark));
    disc(ctx, hx, hy, r, '#06030c');
    ring(ctx, hx, hy, r, core);
    if (k % 4 < 2) ring(ctx, hx, hy, r + 2, mix(core, '#ffffff', 0.5));
    // motes sucked into the orb
    for (let i = 0; i < 5; i++) {
      const ang = i * 1.256 + k * 0.15;
      const d = 14 - ((k * 0.6 + i * 3) % 12);
      px(ctx, hx + Math.round(Math.cos(ang) * d), hy + Math.round(Math.sin(ang) * d), core);
    }
  }
  if (a === 'aura' || a === 'summon') {
    const rr = 10 + ((k * 0.8) % 16);
    withAlpha(ctx, Math.max(0, 0.6 - rr / 40), () => ring(ctx, bx, by - 32, Math.round(rr), core));
  }
}

// ================================================================= BRIARIX

// Materials: bark a-d, cape e f g h (evergreen), leaves l m n o, rose petals p q r s, visor v y, thorns t,
// x dark seams, w white.
const BRIAR_PAL = Object.freeze({
  a: '#e0b07a', b: '#ae7640', c: '#7c4a24', d: '#4a2a12',
  e: '#4a7a8a', f: '#2c5466', g: '#1a3746', h: '#0e2130',
  l: '#d2f57c', m: '#7cc845', n: '#3a8a34', o: '#1c4c22',
  p: '#ffd0e0', q: '#ff6a9a', r: '#d42a62', s: '#7a1238',
  v: '#f6ffa8', y: '#b6e030',
  t: '#f6e8c0',
  x: '#1c140c', w: '#ffffff',
});
const BRIAR_PALS = [
  BRIAR_PAL,
  recolor(BRIAR_PAL, {
    a: '#c8a882', b: '#94704e', c: '#64462e', d: '#3c2816',
    e: '#7a5a8a', f: '#563c68', g: '#38264a', h: '#22162e',
    l: '#a8f0d0', m: '#48b890', n: '#227a64', o: '#0f4a3e',
    p: '#fff2b8', q: '#ffd040', r: '#e0960e', s: '#8a5808',
  }),
  recolor(BRIAR_PAL, {
    a: '#b8b4c4', b: '#868096', c: '#5a546a', d: '#363244',
    e: '#7a6a3a', f: '#5a4a24', g: '#3c3016', h: '#241c0c',
    l: '#d8f080', m: '#98c040', n: '#608a26', o: '#38561a',
    p: '#e8f4ff', q: '#8ac2ff', r: '#4a78e0', s: '#24408a',
    v: '#e0f4ff', y: '#7ab0f0',
  }),
  recolor(BRIAR_PAL, {
    a: '#7a6684', b: '#54445e', c: '#382c42', d: '#221828',
    e: '#3c2c5c', f: '#281c42', g: '#180f2c', h: '#0c0818',
    l: '#88d098', m: '#4a9060', n: '#2a5a3a', o: '#143420',
    p: '#ffdcff', q: '#f070ff', r: '#b030d0', s: '#62188a',
    v: '#ffd0ff', y: '#e060ff', t: '#ecd0ff',
  }),
];
const BRIAR_GLOW = ['#ff6a9a', '#ffd040', '#8ac2ff', '#e060ff'];

const BW = 58;
const BH = 58;

function rose(g, cx, cy, r = 2.6) {
  g.part(g.mask().ellipse(cx, cy, r, r * 0.9), 'pqrs', { cuts: [0.25, 0.55, 0.8] });
  g.set(cx, cy, 's');
  g.set(cx - 1, cy, 'r');
  g.set(cx, cy - 1, 'q');
  if (r >= 2.8) {
    g.set(cx + 1, cy - 1, 'p');
    g.set(cx - 1, cy + 1, 'r');
  }
}

function leaf(g, x0, y0, x1, y1, w = 2.4, ramp = 'lmno') {
  g.part(g.mask().capsule(x0, y0, x1, y1, w * 0.6, 0.4).add(g.mask().capsule(x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.35, x1, y1, w, 0.4)), ramp);
}

function lance(g, x0, y0, x1, y1) {
  // a thorned wooden shaft with a leaf spearhead and a rosebud at (x1, y1)
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  g.part(g.mask().capsule(x0, y0, x1 - ux * 4, y1 - uy * 4, 1.6), 'abcd');
  for (let k = 0.12; k < 0.86; k += 0.14) {
    const tx = x0 + (x1 - x0) * k;
    const ty = y0 + (y1 - y0) * k;
    const side = Math.round(k * 10) % 2 ? 1 : -1;
    g.set(tx - uy * 2.4 * side, ty + ux * 2.4 * side, 't');
  }
  g.part(g.mask().capsule(x1 - ux * 5, y1 - uy * 5, x1 + ux * 4, y1 + uy * 4, 2.5, 0.3), 'lmno');
  rose(g, x1 - ux * 5, y1 - uy * 5, 2.8);
}

// Pose keys: lean, dy, legs ('stand'|'kneel'|'stepA'|'stepB'), fArm/bArm [elbow, hand], lance [x0,y0,x1,y1] | null,
// lanceBehind, bloom (crown size), cape (sway), mood.
function briarPose(o = {}) {
  const g = new Grid(BW, BH);
  const L = o.lean ?? 0;
  const D = o.dy ?? 0;
  const X = (v) => v + L;
  const Y = (v) => v + D;
  const legs = o.legs ?? 'stand';
  const cs = o.cape ?? 0;
  // evergreen cape behind
  const cape = g.mask().poly([[X(26), Y(23)], [X(20), Y(24)], [X(12) - cs, Y(48)], [X(16) - cs, Y(47)], [X(17) - cs, Y(52)], [X(22) - cs, Y(47)], [X(25), Y(51)], [X(28), Y(40)]]);
  g.part(cape, 'efgh', { edge: false });
  // back arm
  const ba = o.bArm ?? [[21, 32], [20, 38]];
  g.part(g.mask().capsule(X(24), Y(26), X(ba[0][0]), Y(ba[0][1]), 2.8), 'abcd', { bias: 1 });
  g.part(g.mask().capsule(X(ba[0][0]), Y(ba[0][1]), X(ba[1][0]), Y(ba[1][1]), 2.7, 2.5), 'abcd', { bias: 1 });
  g.part(g.mask().ellipse(X(ba[1][0]), Y(ba[1][1]) + 1, 2.6, 2.4), 'lmno', { bias: 1 });
  if (o.lance && o.lanceBehind) lance(g, ...o.lance.map((v, i) => (i % 2 ? Y(v) : X(v))));
  // legs
  const LEGS = {
    stand: { b: [[27, 40], [25, 47], [24, 52]], f: [[34, 40], [36, 47], [36, 52]], bb: 18, fb: 31, by: 51, fy: 51 },
    stepA: { b: [[27, 40], [25, 47], [24, 52]], f: [[34, 40], [37, 45], [37, 49]], bb: 18, fb: 32, by: 51, fy: 48 },
    stepB: { b: [[27, 40], [24, 45], [22, 49]], f: [[34, 40], [36, 47], [36, 52]], bb: 16, fb: 31, by: 48, fy: 51 },
    kneel: { b: [[27, 44], [21, 52], [16, 53]], f: [[34, 44], [40, 45], [40, 52]], bb: 10, fb: 35, by: 51, fy: 51 },
  }[legs];
  const leg = (pts, bias) => {
    const [h, k, a] = pts;
    g.part(g.mask().capsule(X(h[0]) - L * 0.5, Y(h[1]) - D * 0.5, k[0], k[1], 3.5, 3), 'abcd', { bias });
    g.part(g.mask().capsule(k[0], k[1], a[0], a[1], 3, 2.6), 'abcd', { bias });
    leaf(g, k[0] - 2, k[1] - 2, k[0] + 4, k[1] + 1, 2.4);
  };
  leg(LEGS.b, 1);
  g.part(g.mask().rect(LEGS.bb, LEGS.by, 12, 6, 2), 'abcd', { bias: 1 });
  leg(LEGS.f, 0);
  g.part(g.mask().rect(LEGS.fb, LEGS.fy, 12, 6, 2), 'abcd');
  g.stamp(LEGS.fb + 9, LEGS.fy + 3, art('ttt'));
  // leaf skirt
  const sk = g.mask().poly([[X(22), Y(35)], [X(39), Y(35)], [X(42), Y(44)], [X(37), Y(41)], [X(34), Y(46)], [X(30.5), Y(41)], [X(27), Y(46)], [X(24), Y(41)], [X(19), Y(44)]]);
  g.part(sk, 'lmno');
  // broad bark breastplate with a rose emblem and vine tracery
  const chest = g.mask().ellipse(X(30.5), Y(28.5), 9, 8).rect(X(23), Y(30), 15, 7, 3);
  g.part(chest, 'abcd');
  g.stamp(X(22), Y(22), art(`
    .................
    .................
    ........x........
    .......x.x.......
    .................
    ...n..........n..
    ....n........n...
    .....nn....nn....
    .......nnnn......
    .................
    .................
    ...xxxxxxxxxxx...
  `));
  rose(g, X(31), Y(28.5), 3.4);
  leaf(g, X(28), Y(30.5), X(24), Y(32.5), 1.7);
  leaf(g, X(34), Y(30.5), X(37.5), Y(32.5), 1.7);
  // back pauldron: layered leaves
  leaf(g, X(26), Y(23), X(17), Y(27), 3.6);
  leaf(g, X(25), Y(25), X(19), Y(31), 2.6, 'mno');
  // helm
  const hy = Y(15);
  const helm = g.mask().ellipse(X(31), hy, 7.2, 7.2).rect(X(24.5), hy, 14, 7, 3);
  g.part(helm, 'abcd');
  const mood = o.mood ?? 'idle';
  const vis = mood === 'hurt' ? 'xyxxyx' : mood === 'fierce' ? 'vvvvvv' : 'xvvxvv';
  g.stamp(X(29), hy - 1, art(`
    ...........
    ..xxxxxxxx.
    ..${vis}xx
    ..xxxxxxxx.
    ...........
    ....xx.xx..
  `));
  // crown: a thorn circlet of roses and leaves
  const bl = o.bloom ?? 0;
  leaf(g, X(26), hy - 5, X(19), hy - 10 - bl, 2.4);
  leaf(g, X(36), hy - 6, X(42), hy - 11 - bl, 2.4);
  g.stamp(X(24), hy - 6, art('t.....t.....t'));
  rose(g, X(24.5), hy - 6 - bl * 0.4, 2.8 + bl * 0.3);
  rose(g, X(28.5), hy - 9 - bl * 0.8, 3 + bl * 0.35);
  rose(g, X(33), hy - 9.5 - bl, 3.2 + bl * 0.4);
  rose(g, X(37.5), hy - 7 - bl * 0.6, 2.8 + bl * 0.3);
  // front pauldron: a big leaf over a smaller one
  leaf(g, X(33), Y(25), X(40), Y(31), 2.8, 'mno');
  leaf(g, X(34), Y(22), X(44), Y(27), 3.8);
  // front arm
  const fa = o.fArm ?? [[40, 31], [41, 37]];
  g.part(g.mask().capsule(X(37), Y(26), X(fa[0][0]), Y(fa[0][1]), 2.8), 'abcd');
  g.part(g.mask().capsule(X(fa[0][0]), Y(fa[0][1]), X(fa[1][0]), Y(fa[1][1]), 2.8, 2.6), 'abcd');
  g.stamp(X(fa[0][0]) - 2, Y(fa[0][1]) - 1, art(`
    n.n.n
    .n.n.
  `));
  g.part(g.mask().ellipse(X(fa[1][0]), Y(fa[1][1]) + 1, 2.8, 2.5), 'lmno');
  if (o.lance && !o.lanceBehind) lance(g, ...o.lance.map((v, i) => (i % 2 ? Y(v) : X(v))));
  return g.rows();
}

const BRIAR = {
  idle: briarPose({ lance: [45, 52, 45, 6] }),
  idle2: briarPose({ lance: [45, 52, 45, 6], dy: 1, cape: 1, fArm: [[40, 32], [41, 38]] }),
  stepA: briarPose({ legs: 'stepA', lance: [45, 51, 46, 6], dy: 1, cape: 2 }),
  stepB: briarPose({ legs: 'stepB', lance: [45, 51, 44, 6], dy: 1, cape: 1 }),
  plant: briarPose({ lean: -1, fArm: [[40, 21], [38, 14]], lance: [34, 1, 42, 40], mood: 'fierce', cape: 1 }),
  stab: briarPose({ lean: 2, dy: 2, fArm: [[43, 31], [46, 38]], lance: [37, 26, 53, 55], mood: 'fierce', cape: 3 }),
  bloom: briarPose({ fArm: [[41, 22], [43, 15]], bArm: [[19, 22], [17, 15]], bloom: 3, lance: null, mood: 'fierce' }),
  storm: briarPose({ fArm: [[43, 27], [49, 25]], bArm: [[18, 27], [12, 25]], bloom: 4, lance: null, mood: 'fierce', cape: 3 }),
  grow: briarPose({ legs: 'kneel', dy: 5, lean: 1, fArm: [[42, 38], [45, 50]], lance: [20, 52, 24, 12], lanceBehind: true, cape: 2 }),
  taunt: briarPose({ lance: [47, 52, 47, 6], fArm: [[41, 30], [45, 34]], bArm: [[19, 31], [23, 36]], bloom: 1 }),
  hurt: briarPose({ lean: -3, dy: 1, lance: [43, 52, 47, 8], mood: 'hurt', cape: 2 }),
  summon: briarPose({ fArm: [[42, 27], [47, 24]], lance: [39, 34, 57, 9], bloom: 2, mood: 'fierce', cape: 2 }),
};

function drawBriarix(ctx, e, x, y, t) {
  const L = lv(e);
  const pal = BRIAR_PALS[L - 1];
  const flip = (e.facing ?? 1) < 0;
  const a = e.anim ?? 'idle';
  const k = T(e);
  let rows;
  let ox = 0;
  switch (a) {
    case 'move':
      rows = k < 5 ? BRIAR.stepA : BRIAR.stepB;
      break;
    case 'plant':
      rows = BRIAR.plant;
      ox = k % 4 < 2 ? 0 : -1;
      break;
    case 'stab':
      rows = BRIAR.stab;
      break;
    case 'bloom':
      rows = BRIAR.bloom;
      ox = k % 6 < 3 ? 0 : 1;
      break;
    case 'storm':
      rows = BRIAR.storm;
      break;
    case 'grow':
      rows = BRIAR.grow;
      break;
    case 'taunt':
      rows = BRIAR.taunt;
      ox = Math.floor(k / 5) % 2;
      break;
    case 'hurt':
    case 'delete':
      rows = BRIAR.hurt;
      ox = k % 4 < 2 ? -1 : 1;
      break;
    case 'summon':
      // Navi chip: raise the lance, then drive it home as the roots lash out
      rows = k < 12 ? BRIAR.plant : k < 52 ? BRIAR.stab : BRIAR.summon;
      break;
    default:
      rows = Math.floor(t / 22) % 2 ? BRIAR.idle2 : BRIAR.idle;
  }
  if (L === 4) glow(ctx, x, y - 26, 24, '#b030d0', 0.16 + 0.05 * Math.sin(t / 8));
  const bx = x + (flip ? -ox : ox);
  body(ctx, rows, pal, bx, y, flip);
  // drifting petals around the crown
  const pc = BRIAR_GLOW[L - 1];
  const n = a === 'bloom' || a === 'storm' || a === 'summon' ? 6 : 2;
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.7 + i * 37 + (e.id ?? 0) * 11) % 60;
    const dx = Math.round(Math.sin((t + i * 40) / 11) * (6 + i * 2)) + (i % 2 ? 6 : -4);
    const py = y - BH + 4 + ph * 0.8;
    if (ph < 50) withAlpha(ctx, 1 - ph / 60, () => rect(ctx, fx(bx, dx, flip), py, 2, 1, pc));
  }
}

// ================================================================= THORN BUD (Briarix's planted object)

function budPose(o = {}) {
  const g = new Grid(26, 30);
  const h = o.h ?? 1; // growth 0..1
  const open = o.open ?? 0; // 0 closed .. 2 wide open
  const droop = o.droop ?? 0;
  const top = 29 - Math.round(22 * h);
  // stem
  g.part(g.mask().capsule(13, 29, 13 + droop * 0.5, top + 6, 1.6), 'mno');
  // leaves at the base
  leaf(g, 12, 28, 4, 24 - h * 2, 2.6);
  leaf(g, 14, 28, 22, 23 - h * 2, 2.6);
  if (h > 0.5) {
    // the bud
    const cx = 13 + droop;
    const cy = top + 4 + droop;
    if (open === 0) {
      g.part(g.mask().ellipse(cx, cy, 4.2, 5.4), 'pqrs');
      leaf(g, cx - 1, cy + 4, cx - 5, cy - 2, 1.8);
      leaf(g, cx + 1, cy + 4, cx + 5, cy - 2, 1.8);
    } else {
      const sp = open * 2;
      leaf(g, cx, cy + 3, cx - 4 - sp, cy - 4, 2.4, 'pqrs');
      leaf(g, cx, cy + 3, cx + 4 + sp, cy - 4, 2.4, 'pqrs');
      leaf(g, cx, cy + 3, cx, cy - 5 - open, 2.4, 'pqrs');
      g.fill(g.mask().ellipse(cx, cy, 2.2, 1.8), 'x');
      g.set(cx, cy, 'v');
      g.set(cx - 1, cy, 'y');
    }
  }
  // thorns
  g.stamp(10, top + 10, art(`
    t.....
    ......
    .....t
  `));
  return g.rows();
}

const BUD = {
  sprout1: budPose({ h: 0.35 }),
  sprout2: budPose({ h: 0.7 }),
  idle: budPose({}),
  aim: budPose({ open: 1 }),
  spit: budPose({ open: 2 }),
  wither: budPose({ droop: 3 }),
};
const BUD_WITHER = BRIAR_PALS.map((p) => recolor(p, { l: '#b8a060', m: '#8a7038', n: '#5e4a22', o: '#3a2c12', p: '#c8a8a0', q: '#9a6a68', r: '#6a4040', s: '#3a2222' }));

function drawThornBud(ctx, e, x, y, t) {
  const L = lv(e);
  const flip = (e.facing ?? 1) < 0;
  const a = e.anim ?? 'idle';
  const k = T(e);
  let rows = BUD.idle;
  let pal = BRIAR_PALS[L - 1];
  if (a === 'sprout') rows = k < 12 ? BUD.sprout1 : k < 24 ? BUD.sprout2 : BUD.idle;
  else if (a === 'aim') rows = BUD.aim;
  else if (a === 'spit') rows = BUD.spit;
  else if (a === 'wither' || a === 'delete') {
    rows = BUD.wither;
    pal = BUD_WITHER[L - 1];
  }
  const sway = a === 'idle' ? Math.round(Math.sin(t / 10)) : 0;
  body(ctx, rows, pal, x + sway, y, flip);
  if (a === 'aim' && k % 4 < 2) withAlpha(ctx, 0.6, () => disc(ctx, x, y - 24, 3, BRIAR_GLOW[L - 1]));
}

// ================================================================= spells

// Floor point of panel (c, r) relative to the spell's own floor point, so per-cell drawing works both in
// battle and on the contact sheet.
function cellPoint(s, x, y, c, r) {
  const a = floorPoint(c, r);
  const b = floorPoint(s.x ?? 0, s.y ?? 0);
  return { x: x + a.x - b.x, y: y + a.y - b.y };
}

function cellsOf(s) {
  const cells = s.data?.cells;
  return cells && cells.length ? cells : [[s.x ?? 0, s.y ?? 0]];
}

// --- Ironclad

// The launched piston fist, seen at full size: a cylinder stub over a huge riveted gauntlet, knuckles down.
const FIST_ROWS = (() => {
  const g = new Grid(27, 32);
  ironForearm(g, 13.5, 0, 13.5, 13, 3.5);
  g.part(g.mask().rect(2, 12, 23, 18, 5), 'abcde');
  g.stamp(2, 12, art(`
    .......................
    ...r..............r....
    .......................
    .......................
    ..xxxxxxxxxxxxxxxxxxx..
    .xaab.xaab.xaab.xabbx..
    .xbbb.xbbb.xbbc.xbccx..
    .xbbc.xbbc.xbcc.xbccx..
    .xbbc.xbbc.xbcc.xccdx..
    .xbcc.xbcc.xccd.xcddx..
    .xbcc.xbcc.xccd.xcddx..
    .xccd.xccd.xcdd.xddex..
    .xccd.xccd.xcdd.xddex..
    .xddd.xddd.xddd.xdeex..
    ..xxxxxxxxxxxxxxxxxx...
  `));
  // thumb plate on the front side
  g.part(g.mask().rect(20, 15, 6, 9, 2), 'abcde');
  g.stamp(21, 16, art(`
    ....
    .r..
  `));
  return g.rows();
})();
const SAW_FRAMES = [0, 1 / 3, 2 / 3].map((ph) => {
  const g = new Grid(25, 25);
  ironSaw(g, 12.5, 12.5, 9.5, true, ph);
  return g.rows();
});

function drawPiston(ctx, s, x, y, t) {
  const L = lv(s.data);
  const pal = IRON_PALS[L - 1];
  const gc = IRON_GLOW[L - 1];
  if (!s.data?.landed) {
    const p = Math.max(0, Math.min(1, s.data?.progress ?? 0));
    // the shadow of the falling fist grows; a warning ring blinks faster as it nears
    withAlpha(ctx, 0.25 + 0.45 * p, () => ellipse(ctx, x, y - 1, 6 + Math.round(12 * p), 2 + Math.round(5 * p), '#05060c'));
    const blink = p > 0.7 ? 2 : p > 0.4 ? 4 : 8;
    if (Math.floor(t / blink) % 2 === 0) {
      withAlpha(ctx, 0.85, () => {
        ellipse(ctx, x, y - 1, 19 - Math.round(4 * p), 7 - Math.round(p), gc);
        ellipse(ctx, x, y - 1, 17 - Math.round(4 * p), 5 - Math.round(p), '#05060c');
      });
    }
    if (p > 0.72) {
      const z = Math.round(((1 - p) / 0.28) * 120);
      sprite(ctx, FIST_ROWS, pal, x, y - z, { anchor: 'feet', outline: OUT });
    }
    return;
  }
  const age = (s.t ?? 0) - (s.data.delay ?? 0) - 1;
  const z = age < 6 ? 0 : (age - 6) * 14;
  withAlpha(ctx, age < 6 ? 1 : Math.max(0, 1 - (age - 6) / 8), () => sprite(ctx, FIST_ROWS, pal, x, y - z, { anchor: 'feet', outline: OUT }));
}

function drawSawblade(ctx, s, x, y, t) {
  const L = lv(s.data);
  const frame = SAW_FRAMES[Math.floor((s.t ?? t) / 2) % 3];
  const rows = (s.dir ?? -1) < 0 ? frame : flipRows(frame);
  const z = 12 + Math.round(Math.sin((s.t ?? t) / 3));
  // sparks off the floor
  if ((s.t ?? t) % 3 === 0) {
    const d = -(s.dir ?? -1);
    px(ctx, x + d * 6, y - 2, '#ffe9a0');
    px(ctx, x + d * 8, y - 4, IRON_GLOW[L - 1]);
  }
  withAlpha(ctx, 0.35, () => ellipse(ctx, x, y - 1, 7, 2, '#05060c'));
  sprite(ctx, rows, IRON_PALS[L - 1], x, y - z + 10, { anchor: 'feet', outline: OUT });
}

// --- Sabre

const SLASH_COL = [
  ['#ff3a5e', '#ff9ac0'],
  ['#3a9cff', '#b4ecff'],
  ['#ffb02a', '#fff2a8'],
  ['#d040ff', '#ffc0ff'],
];

function drawSabreWave(ctx, s, x, y, t) {
  const [c0, c1] = SLASH_COL[lv(s.data) - 1];
  const d = s.dir ?? -1;
  const cy = y - 15;
  // a crescent of light (bulging forward), a white inner edge and fading afterimages
  for (let k = 3; k >= 1; k--) {
    withAlpha(ctx, 0.18 * (4 - k), () => {
      for (let i = -11; i <= 11; i++) {
        const bow = Math.round(Math.sqrt(Math.max(0, 121 - i * i)) * 0.6);
        rect(ctx, x + d * (bow - k * 6) - (d < 0 ? 1 : 0), cy + i, 2, 1, c0);
      }
    });
  }
  for (let i = -12; i <= 12; i++) {
    const bow = Math.round(Math.sqrt(Math.max(0, 144 - i * i)) * 0.6);
    const w = Math.abs(i) > 9 ? 1 : 3;
    rect(ctx, x + d * bow - (d < 0 ? w - 1 : 0), cy + i, w, 1, c0);
    px(ctx, x + d * (bow + (d > 0 ? w : -w)), cy + i, c1);
    if (Math.abs(i) < 8) px(ctx, x + d * (bow + (d > 0 ? w - 1 : -w + 1)), cy + i, '#ffffff');
  }
}

// --- ZeroDay

function drawNullShot(ctx, s, x, y, t) {
  const L = lv(s.data);
  const core = ZERO_CORE[L - 1];
  if (s.data?.landed) {
    withAlpha(ctx, 0.5, () => ellipse(ctx, x, y - 1, 8, 3, '#05030a'));
    return;
  }
  const p = Math.max(0, Math.min(1, s.data?.progress ?? 0));
  // a marked panel: a spinning dark diamond and converging motes
  const r = 9 - Math.round(4 * p);
  const spin = Math.floor(t / 3) % 2;
  withAlpha(ctx, 0.35 + 0.4 * p, () => ellipse(ctx, x, y - 1, r, Math.max(2, Math.round(r * 0.45)), '#0a0418'));
  const dx = spin ? r : r - 2;
  const dy = Math.round(dx * 0.45);
  line(ctx, x - dx, y - 1, x, y - 1 - dy, core);
  line(ctx, x, y - 1 - dy, x + dx, y - 1, core);
  line(ctx, x + dx, y - 1, x, y - 1 + dy, core);
  line(ctx, x, y - 1 + dy, x - dx, y - 1, core);
  px(ctx, x, y - 1, '#ffffff');
  // the bolt drops in over the last frames
  if (p > 0.55) {
    const k = (p - 0.55) / 0.45;
    const top = y - 100 + Math.round(k * 92);
    withAlpha(ctx, 0.5, () => rect(ctx, x - 1, top - 30, 3, 18, core));
    rect(ctx, x - 3, top - 14, 7, 14, '#05020a');
    rect(ctx, x - 3, top - 14, 1, 14, core);
    rect(ctx, x + 3, top - 14, 1, 14, core);
    disc(ctx, x, top, 3, '#05020a');
    ring(ctx, x, top, 3, core);
    px(ctx, x, top, '#ffffff');
  }
}

function drawVoidWave(ctx, s, x, y, t) {
  const L = lv(s.data);
  const core = ZERO_CORE[L - 1];
  const dark = ZERO_DARK[L - 1];
  const k = s.t ?? t;
  // the floor tears: a dark gash with void crystals spiking up through it
  withAlpha(ctx, 0.6, () => ellipse(ctx, x, y - 1, 17, 4, '#06020c'));
  const spikes = [[-12, 14], [-6, 24], [0, 18], [6, 26], [12, 15]];
  for (let i = 0; i < spikes.length; i++) {
    const [ox, h0] = spikes[i];
    const h = Math.max(4, h0 - ((k + i * 5) % 9));
    poly(ctx, [[x + ox - 4, y], [x + ox, y - h], [x + ox + 4, y]], '#08030f');
    poly(ctx, [[x + ox - 2, y - 1], [x + ox, y - h + 3], [x + ox + 2, y - 1]], dark);
    line(ctx, x + ox, y - h, x + ox + 3, y - 1, core);
    px(ctx, x + ox, y - h, '#ffffff');
  }
  if (k % 4 < 2) {
    px(ctx, x - 15, y - 6 - (k % 6), core);
    px(ctx, x + 14, y - 9 - (k % 5), core);
  }
}

function drawVoidWarn(ctx, s, x, y, t) {
  const L = lv(s.data);
  const core = ZERO_CORE[L - 1];
  const p = s.data?.progress ?? 0;
  const blink = p > 0.75 ? 2 : p > 0.45 ? 4 : 7;
  const on = Math.floor(t / blink) % 2 === 0;
  const d = s.data?.dir ?? -1;
  for (const [c, r] of cellsOf(s)) {
    const q = cellPoint(s, x, y, c, r);
    withAlpha(ctx, (on ? 0.32 : 0.16) + 0.2 * p, () => rect(ctx, q.x - 19, q.y - 15, 38, 18, '#3a0830'));
    if (on) {
      // chevrons point the way the beam will travel
      const cx = q.x + ((t * 2) % 20) * d - 10 * d;
      line(ctx, cx, q.y - 10, cx + d * 4, q.y - 6, core);
      line(ctx, cx + d * 4, q.y - 6, cx, q.y - 2, core);
    }
  }
}

function drawVoidBeam(ctx, s, x, y, t) {
  const L = lv(s.data);
  const core = ZERO_CORE[L - 1];
  const dark = ZERO_DARK[L - 1];
  const cells = cellsOf(s);
  const d = s.data?.dir ?? -1;
  const from = s.data?.fromCol ?? cells[0][0] + 3;
  const row = cells[0][1];
  const o = cellPoint(s, x, y, from, row);
  const age = s.t ?? t;
  const life = s.data?.frames ?? 30;
  const grow = Math.min(1, age / 4);
  const fade = Math.min(1, Math.max(0, (life - age) / 6));
  const th = Math.max(1, Math.round((10 + (age % 4 < 2 ? 1 : 0)) * grow * fade));
  const x0 = o.x + d * 10;
  const x1 = d < 0 ? -10 : 260;
  const cy = o.y - 13;
  const lx = Math.min(x0, x1);
  const w = Math.abs(x1 - x0);
  withAlpha(ctx, 0.45, () => rect(ctx, lx, cy - th - 3, w, th * 2 + 7, dark));
  rect(ctx, lx, cy - th, w, th * 2 + 1, '#08020f');
  rect(ctx, lx, cy - th, w, 1, core);
  rect(ctx, lx, cy + th, w, 1, core);
  if (th > 3) rect(ctx, lx, cy - 1, w, 3, age % 3 ? '#160628' : core);
  // crackle
  for (let i = 0; i < 8; i++) {
    const sx = x0 + d * ((i * 29 + age * 7) % 220);
    px(ctx, sx, cy - th - 1 - ((i + age) % 3), core);
    px(ctx, sx + 3, cy + th + 1 + ((i * 2 + age) % 3), '#ffffff');
  }
  // the muzzle at ZeroDay's claws
  disc(ctx, x0, cy, th + 3, '#08020f');
  ring(ctx, x0, cy, th + 3, core);
  if (age % 4 < 2) ring(ctx, x0, cy, th + 5, '#ffffff');
}

// --- Briarix

const PETAL_COL = [
  ['#ff6a96', '#ffc4d6', '#d02c62'],
  ['#ffd040', '#fff0b0', '#e09a10'],
  ['#8ac0ff', '#e4f2ff', '#4a7ae0'],
  ['#f070ff', '#ffd8ff', '#b030d0'],
];

function drawRoots(ctx, s, x, y, t) {
  const L = lv(s.data);
  const bark = ['#ae7640', '#94704e', '#868096', '#54445e'][L - 1];
  const barkL = ['#e0b07a', '#c8a882', '#b8b4c4', '#7a6684'][L - 1];
  const barkD = ['#4a2a12', '#3c2816', '#363244', '#221828'][L - 1];
  const leafC = ['#7cc845', '#48b890', '#98c040', '#4a9060'][L - 1];
  const glowC = ['#d6ff5a', '#ffe060', '#9ad8ff', '#f080ff'][L - 1];
  if (!s.data?.landed) {
    const p = Math.max(0, Math.min(1, s.data?.progress ?? 0));
    // the soil heaves: a mound swells, glowing cracks spread, shoots wriggle out
    // (wide enough to show around the feet of whoever stands there)
    withAlpha(ctx, 0.5 + 0.3 * p, () => ellipse(ctx, x, y - 2, 8 + Math.round(10 * p), 3 + Math.round(4 * p), barkD));
    const blink = p > 0.7 ? 2 : p > 0.4 ? 4 : 7;
    const lit = Math.floor(t / blink) % 2 === 0;
    for (let i = 0; i < 8; i++) {
      const a = i * 0.785 + 0.2;
      const len = 6 + p * 13;
      const ex = x + Math.round(Math.cos(a) * len);
      const ey = y - 2 + Math.round(Math.sin(a) * len * 0.42);
      const mx = x + Math.round(Math.cos(a + 0.35) * len * 0.55);
      const my = y - 2 + Math.round(Math.sin(a + 0.35) * len * 0.23);
      line(ctx, x, y - 2, mx, my, lit ? glowC : barkD);
      line(ctx, mx, my, ex, ey, lit ? glowC : barkD);
    }
    if (p > 0.25) {
      for (const [ox, ph] of [[-14, 0], [13, 2], [-8, 5], [9, 3]]) {
        const h = Math.round((p - 0.25) * 14) + (Math.floor((t + ph) / 4) % 2);
        rect(ctx, x + ox, y - 2 - h, 1, h + 1, leafC);
        px(ctx, x + ox + (ph % 2 ? 1 : -1), y - 2 - h, leafC);
      }
    }
    if (Math.floor(t / 3) % 2 === 0) {
      px(ctx, x - 4, y - 3 - Math.round(p * 4), bark);
      px(ctx, x + 5, y - 2 - Math.round(p * 3), bark);
    }
    return;
  }
  const age = (s.t ?? 0) - (s.data.delay ?? 0) - 1;
  const caught = !!s.data.caught;
  const hold = caught ? 58 : 3;
  const up = Math.min(1, (age + 1) / 4);
  const down = age > hold ? Math.max(0, 1 - (age - hold) / 10) : 1;
  const k = up * down;
  if (k <= 0) return;
  // thick thorned roots burst up and curl in around the panel; caught prey gets squeezed
  const sq = caught && age > 4 ? Math.round(Math.sin(age / 4)) : 0;
  const roots = [[-12, 22, 0.55], [-6, 30, 0.22], [5, 28, -0.25], [12, 21, -0.6]];
  for (const [ox, h0, lean] of roots) {
    const h = Math.round(h0 * k);
    let tx = x + ox;
    let ty = y;
    for (let j = 0; j < h; j++) {
      const sx = x + ox + Math.round(Math.sin(j / 5 + ox) * 1.5 + lean * j * (0.5 + 0.02 * j)) + (j > h0 * 0.5 ? sq * Math.sign(-ox) : 0);
      const sy = y - j;
      const w = j < h0 * 0.6 ? 2 : 1;
      rect(ctx, sx - w, sy, w * 2 + 1, 1, barkD);
      rect(ctx, sx - w + 1, sy, Math.max(1, w * 2 - 1), 1, bark);
      px(ctx, sx - w + 1, sy, barkL);
      if (j % 6 === 4) px(ctx, sx + (ox < 0 ? -w - 1 : w + 1), sy, '#f6e8c0');
      tx = sx;
      ty = sy;
    }
    rect(ctx, tx - 1, ty - 2, 3, 2, leafC);
    px(ctx, tx + (ox < 0 ? 2 : -2), ty - 1, leafC);
  }
}

function drawPetalZone(ctx, s, x, y, t, warn) {
  const [c0, c1, c2] = PETAL_COL[lv(s.data) - 1];
  const age = s.t ?? t;
  for (const [c, r] of cellsOf(s)) {
    const q = cellPoint(s, x, y, c, r);
    if (warn) {
      // petals gather: a slow ring on the floor and a few petals circling
      const p = s.data?.progress ?? 0;
      withAlpha(ctx, 0.35 + 0.35 * p, () => {
        ellipse(ctx, q.x, q.y - 1, 15, 5, c2);
        ellipse(ctx, q.x, q.y - 1, 13, 4, '#00000000');
      });
      for (let i = 0; i < 5; i++) {
        const a = age * 0.12 + (i / 5) * Math.PI * 2 + c;
        const px0 = q.x + Math.round(Math.cos(a) * 12);
        const py0 = q.y - 4 - Math.round(p * 10) + Math.round(Math.sin(a) * 4);
        rect(ctx, px0, py0, 2, 2, i % 2 ? c0 : c1);
      }
      continue;
    }
    // the storm: a whirling column of petals with white gusts
    for (let i = 0; i < 3; i++) {
      const a = age * 0.45 + i * 2.1;
      const hy = q.y - 6 - i * 9;
      const ax = q.x + Math.round(Math.cos(a) * 14);
      const ay = hy + Math.round(Math.sin(a) * 4);
      withAlpha(ctx, 0.7, () => line(ctx, ax, ay, ax + Math.round(Math.cos(a + 1.4) * 8), ay + Math.round(Math.sin(a + 1.4) * 3), '#ffffff'));
    }
    for (let i = 0; i < 16; i++) {
      const a = age * 0.35 + (i / 16) * Math.PI * 2 * 3 + c;
      const rad = 5 + (i % 4) * 3.5;
      const hgt = 2 + ((i * 11 + age * 1.5) % 30);
      const px0 = q.x + Math.round(Math.cos(a) * rad);
      const py0 = q.y - Math.round(hgt) + Math.round(Math.sin(a) * 3);
      const col = i % 3 === 0 ? c1 : i % 3 === 1 ? c0 : c2;
      rect(ctx, px0, py0, 2, 2, col);
      px(ctx, px0 + (i % 2 ? 2 : -1), py0 + 1, c2);
    }
  }
}

function drawBriarThorn(ctx, s, x, y, t) {
  const L = lv(s.data);
  const d = s.dir ?? -1;
  const cy = y - 13;
  const bark = ['#ae7640', '#94704e', '#868096', '#54445e'][L - 1];
  const tip = '#f6e8c0';
  withAlpha(ctx, 0.5, () => rect(ctx, x - d * 12 - (d < 0 ? 0 : 6), cy, 7, 1, PETAL_COL[L - 1][0]));
  rect(ctx, x - d * 5 - (d < 0 ? 0 : 7), cy - 1, 8, 3, '#2a1608');
  rect(ctx, x - d * 4 - (d < 0 ? 0 : 5), cy, 6, 1, bark);
  poly(ctx, [[x + d * 2, cy - 2], [x + d * 8, cy], [x + d * 2, cy + 2]], tip);
  px(ctx, x - d * 3, cy - 2, tip);
  px(ctx, x - d * 1, cy + 2, tip);
}

// ================================================================= effects

function fxLevel(f) {
  return lv(f);
}

// Dust puffs: n discs drifting outward and up from (x, y).
function dust(ctx, x, y, age, dur, n, spread, color) {
  const k = age / dur;
  withAlpha(ctx, Math.max(0, 0.8 * (1 - k)), () => {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      const dx = Math.round(Math.cos(a) * spread * (0.4 + k));
      const dy = Math.round(Math.sin(a) * spread * 0.35 * (0.4 + k)) - Math.round(k * 4);
      disc(ctx, x + dx, y + dy, 2 + Math.round(k * 3) + (i % 2), color);
    }
  });
}

function debris(ctx, x, y, age, n, color, seed = 0, power = 1) {
  for (let i = 0; i < n; i++) {
    const vx = Math.cos(i * 2.3 + seed) * (1.2 + (i % 3) * 0.5) * power;
    const vy = -(2.6 + (i % 4) * 0.6) * power;
    const dx = Math.round(vx * age);
    const dy = Math.round(vy * age + 0.25 * age * age);
    if (dy > 2) continue;
    rect(ctx, x + dx, y + dy, 2, 2, color);
  }
}

const FX = {
  pistonhit: {
    duration: 22,
    draw(ctx, f, x, y, age) {
      const gc = IRON_GLOW[fxLevel(f) - 1];
      if (age < 3) withAlpha(ctx, 0.8, () => ellipse(ctx, x, y - 2, 18, 7, '#fff4d0'));
      withAlpha(ctx, Math.max(0, 1 - age / 14), () => ring(ctx, x, y - 1, 6 + age * 2, gc));
      dust(ctx, x, y - 2, age, 22, 6, 20, '#b8b0a4');
      debris(ctx, x, y - 2, age, 7, '#6a6258', 0.7);
    },
  },
  ironsteam: {
    duration: 18,
    draw(ctx, f, x, y, age) {
      const d = f.dir ?? 1;
      const k = age / 18;
      withAlpha(ctx, Math.max(0, 0.75 * (1 - k)), () => {
        for (let i = 0; i < 4; i++) {
          disc(ctx, x + d * (12 + i * 2) + Math.round((i - 1.5) * k * 10), y - 48 - i * 3 - Math.round(k * 12), 2 + Math.round(k * 4), '#eef2f8');
        }
      });
      if (age < 6) {
        const gc = IRON_GLOW[fxLevel(f) - 1];
        disc(ctx, x + d * 14, y - 48 - age * 3, 3, gc);
        disc(ctx, x + d * 14, y - 48 - age * 3, 1, '#ffffff');
      }
    },
  },
  ironquake: {
    duration: 22,
    draw(ctx, f, x, y, age) {
      const big = !!f.big;
      dust(ctx, x, y - 1, age, 22, big ? 7 : 4, big ? 24 : 14, '#a8a094');
      debris(ctx, x, y - 1, age, big ? 8 : 4, '#5e564c', 1.3, big ? 1 : 0.6);
      if (age < 8) withAlpha(ctx, 0.6 * (1 - age / 8), () => ellipse(ctx, x, y - 1, big ? 22 : 16, big ? 7 : 5, '#d8d0c0'));
    },
  },
  sabreslash: {
    duration: 14,
    draw(ctx, f, x, y, age) {
      const [c0, c1] = SLASH_COL[fxLevel(f) - 1];
      const d = f.dir ?? 1;
      const k = age / 14;
      const a = Math.max(0, 1 - k);
      if (f.shape === 'long') {
        // a thrust: a long tapering streak across two panels
        const x0 = x - d * 16;
        const len = 66;
        withAlpha(ctx, a, () => {
          for (let i = 0; i < len; i++) {
            const w = Math.max(0, Math.round(3 - (i / len) * 3 + (age < 3 ? 1 : 0)));
            rect(ctx, x0 + d * i, y - 14 - w, 1, w * 2 + 1, c0);
          }
          line(ctx, x0, y - 14, x0 + d * (len + 4), y - 14, c1);
          line(ctx, x0 + d * 4, y - 14, x0 + d * (len - 10), y - 14, '#ffffff');
        });
        return;
      }
      // a wide crescent sweeping the whole column
      withAlpha(ctx, a, () => {
        const top = y - 14 - 30;
        for (let i = 0; i <= 60; i++) {
          const v = (i - 30) / 30;
          const bow = Math.round((1 - v * v) * (12 + age));
          const w = Math.round((1 - Math.abs(v)) * 5) + 1;
          rect(ctx, x + d * (bow - 6) - (d < 0 ? w : 0), top + i, w, 1, c0);
          px(ctx, x + d * (bow - 6 + (d > 0 ? w : -w)), top + i, c1);
          if (age < 5 && Math.abs(v) < 0.8) px(ctx, x + d * (bow - 6 + (d > 0 ? w - 1 : -w + 1)), top + i, '#ffffff');
        }
      });
    },
  },
  nullburst: {
    duration: 16,
    draw(ctx, f, x, y, age) {
      const L = fxLevel(f);
      const core = ZERO_CORE[L - 1];
      if (age < 3) disc(ctx, x, y - 6, 8 - age, '#ffffff');
      const r = 4 + age;
      withAlpha(ctx, Math.max(0, 1 - age / 16), () => {
        disc(ctx, x, y - 6, Math.max(1, 9 - Math.floor(age / 2)), '#0a0414');
        ring(ctx, x, y - 6, r, core);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.047 + 0.3;
          px(ctx, x + Math.round(Math.cos(a) * (r + 3)), y - 6 + Math.round(Math.sin(a) * (r + 3) * 0.7), core);
        }
      });
    },
  },
  voidquake: {
    duration: 26,
    draw(ctx, f, x, y, age) {
      const L = fxLevel(f);
      const core = ZERO_CORE[L - 1];
      const dark = ZERO_DARK[L - 1];
      if (age < 4) withAlpha(ctx, 0.7, () => ellipse(ctx, x, y - 2, 26, 9, '#ffffff'));
      withAlpha(ctx, Math.max(0, 1 - age / 20), () => {
        ellipse(ctx, x, y - 1, 10 + age * 2, 3 + Math.round(age * 0.7), dark);
        ring(ctx, x, y - 1, 8 + age * 2, core);
      });
      debris(ctx, x, y - 2, age, 8, '#140a20', 0.4, 1.2);
    },
  },
  zeroaura: {
    duration: 30,
    draw(ctx, f, x, y, age) {
      const L = fxLevel(f);
      const core = ZERO_CORE[L - 1];
      for (let i = 0; i < 3; i++) {
        const r = (age * 1.4 + i * 8) % 30;
        withAlpha(ctx, Math.max(0, 0.8 - r / 32), () => ring(ctx, x, y - 30, Math.round(r), i === 1 ? '#ffffff' : core));
      }
      for (let i = 0; i < 6; i++) {
        const sx = x + Math.round(Math.sin(i * 2.1) * 16);
        px(ctx, sx, y - 6 - ((age * 2 + i * 9) % 50), core);
      }
    },
  },
  rootburst: {
    duration: 18,
    draw(ctx, f, x, y, age) {
      const L = fxLevel(f);
      debris(ctx, x, y - 2, age, 8, ['#784b26', '#5a422c', '#524c60', '#302638'][L - 1], 0.9, 0.9);
      debris(ctx, x, y - 4, age, 4, ['#5cc040', '#3eae8a', '#8ab83a', '#3a7a4e'][L - 1], 2.2, 0.7);
      dust(ctx, x, y - 1, age, 18, 4, 12, '#8a7a5c');
    },
  },
  briarbloom: {
    duration: 20,
    draw(ctx, f, x, y, age) {
      const L = fxLevel(f);
      const leafC = ['#5cc040', '#3eae8a', '#8ab83a', '#3a7a4e'][L - 1];
      const [c0, c1] = PETAL_COL[L - 1];
      const h = Math.min(6, age);
      withAlpha(ctx, age > 14 ? 1 - (age - 14) / 6 : 1, () => {
        for (let i = 0; i < 6; i++) {
          const bx = x - 15 + i * 6;
          rect(ctx, bx, y - 1 - h + (i % 2), 1, h - (i % 2) + 1, leafC);
        }
        if (age > 4) {
          disc(ctx, x - 6, y - 7, 1, c0);
          disc(ctx, x + 7, y - 6, 1, c1);
          px(ctx, x + 1, y - 9, c0);
        }
      });
    },
  },
};

// ================================================================= registries

export const ENTITY_SPRITES = {
  ironclad: { draw: drawIronclad },
  sabre: { draw: drawSabre },
  zeroday: { draw: drawZeroday },
  briarix: { draw: drawBriarix },
  thornbud: { draw: drawThornBud },
};

export const SPELL_SPRITES = {
  piston: { draw: drawPiston },
  sawblade: { draw: drawSawblade },
  sabrewave: { draw: drawSabreWave },
  nullshot: { draw: drawNullShot },
  voidwave: { draw: drawVoidWave },
  voidwarn: { draw: drawVoidWarn },
  voidbeam: { draw: drawVoidBeam },
  roots: { draw: drawRoots },
  petalwarn: { draw: (ctx, s, x, y, t) => drawPetalZone(ctx, s, x, y, t, true) },
  petals: { draw: (ctx, s, x, y, t) => drawPetalZone(ctx, s, x, y, t, false) },
  briarthorn: { draw: drawBriarThorn },
};

export const FX_SPRITES = FX;
