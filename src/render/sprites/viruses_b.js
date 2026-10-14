// Sprite pack: viruses_b. See docs/CONTRACT.md "Sprites". Each registry maps a key to { draw(ctx, obj, x, y, t) }.
//
// Pack B families: Watcher (sentinel eye in a tesla cradle), Cinderkite (ember kite), Frostbit (cryo
// penguin bot), Sporeling (burrowing toadstool) and Scurrier (clockwork rodent), plus their spells and
// effects. Bodies are pixel-string art authored facing right, built once at module load with the small
// grid helpers below (shaded orbs, polygons, stamps), and drawn with sprite() and per-level palettes.

import { sprite, recolor, rect, px, line, ellipse, disc, ring, mix } from '../pixel.js';
import { PANEL_W, PANEL_H } from '../layout.js';

const OUTLINE = '#0c0f1c';

// ================================================================ authoring helpers (module load only)

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
const LIGHT = norm3(-0.6, -0.75, 0.55);

function blank(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill('.'));
}

function rowsOf(g) {
  return Object.freeze(g.map((r) => r.join('')));
}

function plot(g, x, y, ch) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch;
}

function at(g, x, y) {
  return g[y]?.[x] ?? '.';
}

function box(g, x, y, w, h, ch) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) plot(g, x + i, y + j, ch);
}

function seg(g, x0, y0, x1, y1, ch) {
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
    plot(g, x0, y0, ch);
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

// Fill every pixel whose centre satisfies fn(x + .5, y + .5) -> palette key | null.
function shape(g, fn, x0 = 0, y0 = 0, x1 = g[0].length, y1 = g.length) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(g.length, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(g[0].length, Math.ceil(x1)); x++) {
      const ch = fn(x + 0.5, y + 0.5, x, y);
      if (ch) g[y][x] = ch;
    }
  }
}

// Lambert term of an ellipsoid at (px, py), 0..1, or -1 outside.
function orbLight(cx, cy, rx, ry, pxc, pyc, light = LIGHT) {
  const nx = (pxc - cx) / rx;
  const ny = (pyc - cy) / ry;
  const d = nx * nx + ny * ny;
  if (d > 1) return -1;
  const nz = Math.sqrt(1 - d);
  return Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
}

// A shaded ellipsoid. `ramp` lists palette keys dark -> light; `stops` are the light levels where each next
// key starts (one fewer than the ramp).
function orb(g, cx, cy, rx, ry, ramp, stops, opts = {}) {
  shape(
    g,
    (x, y) => {
      if (opts.clip && !opts.clip(x, y)) return null;
      const l = orbLight(cx, cy, rx, ry, x, y, opts.light);
      if (l < 0) return null;
      let i = 0;
      while (i < stops.length && l >= stops[i]) i++;
      return ramp[i];
    },
    cx - rx - 1,
    cy - ry - 1,
    cx + rx + 1,
    cy + ry + 1,
  );
}

function inEllipse(cx, cy, rx, ry, x, y) {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function fillPoly(g, pts, ch) {
  shape(g, (x, y) => (inPoly(pts, x, y) ? (typeof ch === 'function' ? ch(x, y) : ch) : null));
}

// Paste hand-drawn rows; '.' is transparent.
function stamp(g, x, y, lines) {
  lines.forEach((ln, j) => {
    for (let i = 0; i < ln.length; i++) if (ln[i] !== '.' && ln[i] !== ' ') plot(g, x + i, y + j, ln[i]);
  });
}

// Shift rows sideways: a lean of k pixels per row above pivotY (k > 0 leans forward, to the right).
function shear(g, k, pivotY) {
  const w = g[0].length;
  return g.map((row, y) => {
    const s = Math.round((pivotY - y) * k);
    const out = new Array(w).fill('.');
    for (let x = 0; x < w; x++) {
      const sx = x - s;
      if (sx >= 0 && sx < w) out[x] = row[sx];
    }
    return out;
  });
}

// Small deterministic hash for flicker and particles (the view never needs real randomness).
function hash(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function lv(o) {
  const l = (o && o.level) | 0;
  return l >= 1 && l <= 4 ? l : 1;
}

function ownerLevel(s) {
  return lv(s?.owner ?? s);
}

function fl(e) {
  return e && e.facing < 0 ? -1 : 1;
}

// ================================================================ WATCHER (sentinel eye in a tesla cradle)
//
// Two sprites: the pylon (pedestal, coil column and a U-shaped electrode cradle) stands on the floor; the
// armoured eye pod floats inside the cradle and bobs. Its lids open to charge and the iris turns white-hot
// to fire.

function buildWatcherEye({ open = 3.4, look = 0, mode = 'idle' } = {}) {
  const W = 20;
  const g = blank(W, 22);
  const cx = 10;
  const cy = 12.3;
  const R = 9.4;
  // Antenna with a spark-gap tip.
  box(g, 8, 0, 3, 1, 'Y');
  box(g, 9, 1, 1, 2, '4');
  plot(g, 10, 1, '2');
  plot(g, 10, 2, '2');
  // Shell.
  orb(g, cx, cy, R, R, '12345', [0.2, 0.42, 0.68, 0.92]);
  // Armour seam around the back and two rivets.
  for (let x = 1; x <= 6; x++) plot(g, x, Math.floor(cy), x < 3 ? '1' : '2');
  plot(g, 4, Math.floor(cy) - 4, '5');
  plot(g, 4, Math.floor(cy) + 4, '3');
  // The eye: a lens-shaped opening on the front.
  const ex = 13.4;
  const ea = 7.2;
  const lens = (x, y) => {
    if (orbLight(cx, cy, R - 0.6, R - 0.6, x, y) < 0) return false;
    const u = (x - ex) / ea;
    if (Math.abs(u) >= 1) return false;
    return Math.abs(y - cy) <= open * (1 - u * u) + 0.15;
  };
  if (open > 0.5) {
    const ix = 14.3;
    const iy = cy + look * Math.max(0, Math.min(1.6, open - 1.8));
    const ir = Math.min(4.1, open + 0.4);
    shape(g, (x, y) => {
      if (!lens(x, y)) return null;
      const di = Math.hypot(x - ix, y - iy);
      if (mode === 'fire') return di < ir - 1.2 ? 'w' : di < ir + 0.3 ? 'J' : 'g';
      if (mode === 'charge') return di < ir - 1.8 ? 'w' : di < ir - 0.7 ? 'J' : di < ir + 0.2 ? 'I' : 'g';
      if (di < 1.3) return 'p';
      if (di < ir - 1.4) return y > iy ? 'J' : 'I';
      if (di < ir + 0.1) return 'i';
      return y < cy - open * 0.3 ? 's' : 'S';
    });
    if (mode === 'idle') {
      plot(g, Math.floor(ix) - 1, Math.floor(iy) - 2, 'w');
      plot(g, Math.floor(ix) - 2, Math.floor(iy) - 1, 'w');
    }
    // Lid rims: a dark crease above the opening with a bright lip over it, and a soft lower lid.
    for (let x = 0; x < W; x++) {
      for (let y = 1; y < g.length - 1; y++) {
        if (!lens(x + 0.5, y + 0.5)) continue;
        if (!lens(x + 0.5, y - 0.5) && g[y - 1][x] !== '.') {
          g[y - 1][x] = '1';
          if (y - 2 >= 0 && '2345'.includes(g[y - 2][x])) g[y - 2][x] = '5';
        }
        if (!lens(x + 0.5, y + 1.5) && g[y + 1][x] !== '.') g[y + 1][x] = '2';
      }
    }
  } else {
    // Shut: a tight squint seam with a bright upper lid.
    for (let x = 7; x <= 18; x++) {
      const yy = Math.floor(cy) + (x < 10 ? 1 : 0);
      if (g[yy][x] !== '.') g[yy][x] = '1';
      if (g[yy - 1]?.[x] && g[yy - 1][x] !== '.') g[yy - 1][x] = '4';
      if (g[yy + 1]?.[x] && g[yy + 1][x] !== '.' && x > 12) g[yy + 1][x] = '2';
    }
  }
  return rowsOf(g);
}

function buildWatcherPylon() {
  const W = 26;
  const g = blank(W, 19);
  // Pedestal: a squat block with a lit top edge and a status light.
  fillPoly(g, [[6, 13.5], [20, 13.5], [23, 18.5], [3, 18.5]], 'n');
  box(g, 6, 13, 14, 1, 'o');
  box(g, 4, 16, 18, 2, 'm');
  box(g, 3, 18, 20, 1, 'k');
  plot(g, 5, 15, 'o');
  plot(g, 4, 16, 'n');
  box(g, 12, 15, 2, 1, 'Y');
  plot(g, 7, 17, 'k');
  plot(g, 18, 17, 'k');
  // Coil column: copper windings between two steel collars.
  box(g, 9, 6, 8, 1, 'o');
  box(g, 9, 7, 8, 1, 'm');
  for (let y = 8; y < 12; y++) {
    const odd = y % 2;
    plot(g, 10, y, odd ? 'z' : 'y');
    plot(g, 11, y, odd ? 'y' : 'Y');
    plot(g, 12, y, odd ? 'y' : 'Y');
    plot(g, 13, y, odd ? 'z' : 'y');
    plot(g, 14, y, 'z');
    plot(g, 15, y, odd ? 'k' : 'z');
  }
  box(g, 9, 12, 8, 1, 'n');
  plot(g, 9, 12, 'o');
  // Cradle: a wide U whose arms rise beside the floating pod, tipped with electrodes.
  box(g, 5, 4, 16, 1, 'o');
  box(g, 5, 5, 16, 1, 'm');
  plot(g, 4, 4, 'n');
  plot(g, 21, 4, 'n');
  for (const [x, y] of [[3, 3], [2, 2], [2, 1], [1, 0]]) {
    plot(g, x, y, 'o');
    plot(g, x + 1, y, 'n');
  }
  for (const [x, y] of [[22, 3], [23, 2], [23, 1], [24, 0]]) {
    plot(g, x - 1, y, 'n');
    plot(g, x, y, 'm');
  }
  plot(g, 3, 4, 'n');
  plot(g, 22, 4, 'm');
  // Electrode tips.
  stamp(g, 0, 0, ['YY', 'yY']);
  stamp(g, 24, 0, ['Yy', 'yz']);
  return rowsOf(g);
}

const WATCHER_PYLON = buildWatcherPylon();
const WATCHER_EYES = {
  idle: [-1, 0, 1].map((look) => buildWatcherEye({ open: 3.4, look })),
  blink: buildWatcherEye({ open: 1.2 }),
  charge: [buildWatcherEye({ open: 4.6, mode: 'charge' }), buildWatcherEye({ open: 5.4, mode: 'charge' })],
  fire: buildWatcherEye({ open: 5.6, mode: 'fire' }),
  shut: buildWatcherEye({ open: 0 }),
};

const WATCHER_BASE = Object.freeze({
  1: '#1a2240', 2: '#2c3a64', 3: '#465e92', 4: '#7894c8', 5: '#c8daf6',
  s: '#a0a8c0', S: '#eef2fc', i: '#8a4a06', I: '#e8a018', J: '#ffe25a', p: '#140a04', w: '#ffffff', g: '#fff4b0',
  k: '#141a26', m: '#2c3444', n: '#4a5466', o: '#7a869c', y: '#d8941c', Y: '#ffd848', z: '#8a5410',
});
const WATCHER_PAL = {
  1: WATCHER_BASE,
  2: recolor(WATCHER_BASE, { 1: '#0a302a', 2: '#125246', 3: '#1f7e68', 4: '#48b494', 5: '#acf0d0' }),
  3: recolor(WATCHER_BASE, { 1: '#380a12', 2: '#62121e', 3: '#961e2a', 4: '#d24242', 5: '#ffa294', s: '#c8a8a0', S: '#fff2ea' }),
  4: recolor(WATCHER_BASE, {
    1: '#100620', 2: '#22103e', 3: '#3a1c66', 4: '#62349a', 5: '#a878dc',
    s: '#8a6aa8', S: '#ecdcff', i: '#6a1480', I: '#c83ade', J: '#ff9cff', p: '#1a0420', w: '#ffffff', g: '#ffd8ff',
    k: '#0a0612', m: '#1e1430', n: '#36284e', o: '#5a4a7a', y: '#9a3ab8', Y: '#f078ff', z: '#541868',
  }),
};
const ELEC_GLOW = { 1: '#ffe25a', 2: '#ffe25a', 3: '#ffe25a', 4: '#ff8cf8' };

function drawWatcher(ctx, e, x, y, t) {
  const L = lv(e);
  const pal = WATCHER_PAL[L];
  const F = fl(e);
  const flip = F < 0;
  const anim = e.anim ?? 'idle';
  const k = e.animT ?? 0;
  const glow = ELEC_GLOW[L];
  sprite(ctx, WATCHER_PYLON, pal, x, y, { anchor: 'feet', flip, outline: OUTLINE });

  let eye;
  let ex = 0;
  let ey = Math.round(Math.sin(t / 14) * 1.1);
  if (anim === 'windup') {
    eye = WATCHER_EYES.charge[k < 6 ? 0 : 1];
    ey = -1;
  } else if (anim === 'attack') {
    eye = k < 10 ? WATCHER_EYES.fire : WATCHER_EYES.charge[0];
    ex = k < 5 ? -2 : k < 12 ? -1 : 0;
    ey = -1;
  } else if (anim === 'hurt' || anim === 'delete') {
    eye = WATCHER_EYES.shut;
    ex = -1;
    ey = 1;
  } else {
    const look = Math.max(-1, Math.min(1, e.data?.look ?? 0));
    const blink = (t + (e.id ?? 0) * 37) % 160 < 5;
    eye = blink ? WATCHER_EYES.blink : WATCHER_EYES.idle[look + 1];
  }
  const eyeX = x + F * ex;
  const eyeY = y - 14 + ey;
  sprite(ctx, eye, pal, eyeX, eyeY, { anchor: 'feet', flip, outline: OUTLINE });

  // Arcs jump between the electrodes and the pod.
  const busy = anim === 'windup' || anim === 'attack';
  if (busy || (t >> 1) % 23 < 3) {
    for (const side of [-1, 1]) {
      const sx = x + F * side * 12;
      const sy = y - 19;
      const r = hash(t >> 1, side);
      px(ctx, sx - F * side, sy - 1, glow);
      px(ctx, sx - F * side * 2, sy - 2 - (r > 0.5 ? 1 : 0), '#ffffff');
      if (busy) px(ctx, sx - F * side * 3, sy - 3 + (r > 0.5 ? 0 : 1), glow);
    }
  }
  if (anim === 'windup') {
    // Sparks spiral into the iris.
    const cx = eyeX + F * 4;
    const cy = eyeY - 10;
    const r = Math.max(2.5, 14 - (k % 18) * 0.65);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + k * 0.17;
      px(ctx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, i % 2 ? glow : '#ffffff');
    }
  } else if (anim === 'attack' && k < 8) {
    const cx = eyeX + F * 10;
    const cy = eyeY - 10;
    disc(ctx, cx, cy, 5 - (k >> 1), glow);
    disc(ctx, cx, cy, 3 - (k >> 2), '#ffffff');
  } else if (anim === 'hurt') {
    px(ctx, eyeX + F * 7, eyeY - 19, glow);
    px(ctx, eyeX - F * 8, eyeY - 5, '#ffffff');
  }
}

// ================================================================ CINDERKITE (ember kite)
//
// A diamond kite of ember cloth on iron spars with a molten core-eye, trailing a tail of flame bows. It
// hovers well above the floor; the pose changes the kite's tilt, the core size and how hot the cloth glows.

function buildKite({ ang = 0.18, core = 3.4, phase = 0, stream = 0, eye = 'open' } = {}) {
  const W = 36;
  const H = 36;
  const g = blank(W, H);
  const cx = 19;
  const cy = 12;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const P = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
  const top = P(0, -11);
  const right = P(10, 0);
  const bot = P(0, 15);
  const left = P(-10, 0);
  const mid = P(0, 0);

  // Tail: a cord from the bottom tip, waving, with flame bows.
  let prev = bot;
  const pts = [];
  for (let i = 1; i <= 6; i++) {
    const wav = Math.sin(phase + i * 1.1) * (1.2 + i * 0.25);
    const tx = bot[0] - i * (2.3 + stream * 1.2) + wav * 0.5;
    const ty = bot[1] + i * (2.6 - stream * 1.1) + wav * 0.6;
    pts.push([tx, ty]);
    seg(g, prev[0], prev[1], tx, ty, 't');
    prev = [tx, ty];
  }
  for (const i of [1, 3, 5]) {
    const [bx, by] = pts[i];
    if (i === 5) stamp(g, Math.round(bx) - 2, Math.round(by) - 2, ['..f..', '.fFf.', 'fFFFf', '.fFf.', '..f..']);
    else stamp(g, Math.round(bx) - 3, Math.round(by) - 1, ['ff...ff', 'fFFtFFf', 'ff...ff']);
  }

  // Cloth: four panels lit from the top-left.
  fillPoly(g, [top, mid, left], 'd');
  fillPoly(g, [top, right, mid], 'c');
  fillPoly(g, [left, mid, bot], 'b');
  fillPoly(g, [mid, right, bot], 'a');
  // Glowing seams in the cloth, like cracks in a coal.
  const vein = (x0, y0, x1, y1) => {
    const a = P(x0, y0);
    const b = P(x1, y1);
    seg(g, a[0], a[1], b[0], b[1], 'e');
  };
  vein(-6, -2, -3, -5);
  vein(-3, -5, -2, -8);
  vein(4, -3, 6, -1);
  vein(-5, 3, -3, 7);
  vein(-3, 7, -1, 10);
  vein(4, 4, 3, 8);
  // Edges darken toward the bottom-right.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = g[y][x];
      if (!'abcd'.includes(ch)) continue;
      if (at(g, x + 1, y) === '.' || at(g, x, y + 1) === '.') g[y][x] = ch === 'd' ? 'c' : ch === 'c' ? 'b' : 'a';
    }
  }
  // Spars.
  seg(g, top[0], top[1], bot[0], bot[1], 'k');
  seg(g, left[0], left[1], right[0], right[1], 'k');
  const hi = P(-1, -9);
  plot(g, hi[0], hi[1], 'K');
  // Molten core with an eye.
  orb(g, mid[0], mid[1], core, core, 'roOyw', [0.25, 0.45, 0.66, 0.86]);
  plot(g, mid[0] - core * 0.45, mid[1] - core * 0.55, 'w');
  const ex = Math.round(mid[0] + core * 0.35);
  const ey = Math.round(mid[1]);
  if (eye === 'open') {
    plot(g, ex, ey - 1, 'p');
    plot(g, ex, ey, 'p');
    plot(g, ex, ey + 1, 'p');
  } else if (eye === 'wide') {
    plot(g, ex, ey - 1, 'p');
    plot(g, ex, ey, 'w');
    plot(g, ex, ey + 1, 'p');
    plot(g, ex + 1, ey, 'p');
    plot(g, ex - 1, ey, 'p');
  } else if (eye === 'x') {
    plot(g, ex - 1, ey - 1, 'p');
    plot(g, ex + 1, ey - 1, 'p');
    plot(g, ex, ey, 'p');
    plot(g, ex - 1, ey + 1, 'p');
    plot(g, ex + 1, ey + 1, 'p');
  }
  return rowsOf(g);
}

const KITE = {
  idle: [0, 1, 2, 3].map((i) => buildKite({ core: 4, phase: (i * Math.PI) / 2 })),
  move: [0, 1].map((i) => buildKite({ ang: 0.36, core: 4, phase: i * Math.PI, stream: 1 })),
  windup: [0, 1].map((i) => buildKite({ ang: 0.06, core: 4.8, phase: i * Math.PI, eye: 'wide' })),
  attack: [0, 1].map((i) => buildKite({ ang: -0.14, core: 5.2, phase: i * Math.PI + 1, stream: 0.4, eye: 'wide' })),
  hurt: buildKite({ ang: -0.42, core: 3, phase: 1, stream: -0.3, eye: 'x' }),
};

const KITE_BASE = Object.freeze({
  a: '#7a1c12', b: '#b4321a', c: '#e05a20', d: '#ff8c3a', e: '#ffd060',
  k: '#2a1612', K: '#7a4a38', t: '#3a2018', f: '#ff7a1a', F: '#ffe060',
  r: '#a01810', o: '#e8501a', O: '#ff9a28', y: '#ffd848', w: '#fff8d8', p: '#2a0a04',
});
const KITE_PAL = {
  1: KITE_BASE,
  2: recolor(KITE_BASE, { a: '#2a1818', b: '#40262a', c: '#5e3634', d: '#7e4c44', e: '#ff8a2a', f: '#ff5a1a', F: '#ffb040' }),
  3: recolor(KITE_BASE, {
    a: '#a0400c', b: '#d87414', c: '#f6a428', d: '#ffd45a', e: '#fffbe0', k: '#3a1e0c', t: '#4a2a10',
    r: '#e88a20', o: '#ffc840', O: '#fff080', y: '#ffffff', w: '#ffffff', f: '#ffb02a', F: '#fff6b0',
  }),
  4: recolor(KITE_BASE, {
    a: '#1c0a28', b: '#341450', c: '#52207a', d: '#7834a6', e: '#ff6ad8', k: '#0c0614', K: '#4a2a6a', t: '#1a0c26',
    r: '#7a1aa0', o: '#c03ae0', O: '#ff6af0', y: '#ffb4ff', w: '#fff0ff', f: '#d040f0', F: '#ffa0ff', p: '#1a0420',
  }),
};
const KITE_GLOW = {
  1: recolor(KITE_BASE, { a: '#b4321a', b: '#e05a20', c: '#ff8c3a', d: '#ffc060', e: '#fff4b0' }),
  2: recolor(KITE_PAL[2], { a: '#5a2a1a', b: '#8a3a1a', c: '#c05a20', d: '#e88a3a', e: '#ffe080' }),
  3: recolor(KITE_PAL[3], { a: '#d87414', b: '#f6a428', c: '#ffd45a', d: '#fff2a0' }),
  4: recolor(KITE_PAL[4], { a: '#341450', b: '#5e2488', c: '#8a3ab8', d: '#b05ad8', e: '#ffc0f4' }),
};
const FLAME = {
  1: ['#a01810', '#ff6a1a', '#ffd040', '#fff8d8'],
  2: ['#7a1a10', '#e8501a', '#ffa030', '#ffe8a0'],
  3: ['#e88a20', '#ffd040', '#fff6b0', '#ffffff'],
  4: ['#4a0a6a', '#b030d8', '#ff70f0', '#ffe0ff'],
};

// A licking flame: a column of colour bands, `h` tall, swaying with t.
function flameTongue(ctx, x, y, h, cols, t, seed) {
  for (let i = 0; i < h; i++) {
    const sway = Math.round(Math.sin(t / 4 + seed + i * 0.8) * (i / h) * 1.5);
    const w = Math.max(1, Math.round((1 - i / h) * 3));
    const c = cols[Math.min(cols.length - 1, Math.floor(((h - i) / h) * (cols.length - 1)))];
    rect(ctx, x - (w >> 1) + sway, y - i, w, 1, c);
  }
}

function drawCinderkite(ctx, e, x, y, t) {
  const L = lv(e);
  const F = fl(e);
  const flip = F < 0;
  const anim = e.anim ?? 'idle';
  const k = e.animT ?? 0;
  const seed = (e.id ?? 0) * 13;
  let rows = KITE.idle[((t + seed) >> 3) % 4];
  let pal = KITE_PAL[L];
  let lift = 0;
  if (anim === 'move') rows = KITE.move[(t >> 3) % 2];
  else if (anim === 'windup') {
    rows = KITE.windup[(t >> 2) % 2];
    pal = (k >> 2) % 2 ? KITE_GLOW[L] : pal;
    lift = Math.min(4, k >> 2);
  } else if (anim === 'attack') {
    rows = KITE.attack[(t >> 2) % 2];
    pal = KITE_GLOW[L];
    lift = 4;
  } else if (anim === 'hurt' || anim === 'delete') rows = KITE.hurt;
  const bob = Math.round(Math.sin((t + seed) / 11) * 2);
  const fy = y - 3 + bob - lift;
  sprite(ctx, rows, pal, x, fy, { anchor: 'feet', flip, outline: OUTLINE });

  // Flames lick from the upper tips; bigger while calling meteors.
  const cols = FLAME[L];
  const top = fy - 36;
  const big = anim === 'windup' || anim === 'attack';
  if (anim !== 'hurt' && anim !== 'delete') {
    flameTongue(ctx, x + F * 2, top + 2, big ? 9 : 5, cols, t, seed);
    flameTongue(ctx, x - F * 8, top + 13, big ? 6 : 3, cols, t, seed + 2);
    flameTongue(ctx, x + F * 12, top + 14, big ? 6 : 3, cols, t, seed + 4);
  }
  // Embers drifting up.
  for (let i = 0; i < (big ? 6 : 3); i++) {
    const p = ((t + i * 17 + seed) % 40) / 40;
    const ex = x + F * (Math.round((hash(i, seed) - 0.5) * 22) + Math.round(Math.sin(t / 7 + i) * 2));
    const ey = top + 18 - Math.round(p * (big ? 30 : 20));
    if (p < 0.9) px(ctx, ex, ey, p < 0.4 ? cols[3] : p < 0.7 ? cols[2] : cols[1]);
  }
  if (anim === 'attack') {
    // Calling: sparks shoot up from the crest.
    for (let i = 0; i < 4; i++) {
      const p = ((k * 2 + i * 7) % 24) / 24;
      px(ctx, x + F * (2 + Math.round(Math.sin(i * 2.1 + t / 4) * 3)), top - 6 - Math.round(p * 16), p < 0.5 ? cols[3] : cols[2]);
    }
  }
}

// ================================================================ FROSTBIT (cryo penguin bot)
//
// An egg-shaped bot with a navy shell, a frosted belly plate, goggle eyes, a stubby beak-nozzle and a
// snowflake antenna. Poses vary its squash, flippers, eyes and beak.

function buildFrostbit({ rx = 8.6, ry = 9.6, lean = 0, flip = 'down', eyes = 'open', beak = 'shut', puff = 0, feet = 0 } = {}) {
  const W = 28;
  const H = 30;
  const g = blank(W, H);
  const cx = 13;
  const cy = H - 1.5 - ry;
  // Far flipper (behind the body).
  if (flip === 'spread') fillPoly(g, [[cx + 3, cy + 1], [cx + 11, cy - 1], [cx + 10, cy + 1], [cx + 3, cy + 4]], 'a');
  // Feet.
  const fy = H - 2;
  stamp(g, Math.round(cx - 6 + feet), fy, ['oOOo.', '.oo..']);
  stamp(g, Math.round(cx + 1 - feet), fy, ['oOOo.', '.oo..']);
  // Body shell.
  orb(g, cx, cy, rx + puff, ry + puff * 0.4, 'abcd', [0.3, 0.58, 0.84]);
  // Belly plate: a frosted oval on the front.
  const bx = cx + 2.4;
  const by = cy + 2.2;
  orb(g, bx, by, rx * 0.66 + puff * 0.8, ry * 0.68, 'efgw', [0.32, 0.62, 0.9], {
    clip: (x, y) => inEllipse(cx, cy, rx + puff - 0.8, ry + puff * 0.4 - 0.8, x, y),
  });
  // Face: goggle eyes (near and far) on the upper front.
  const eyY = Math.round(cy - ry * 0.42);
  const nearX = Math.round(cx + rx * 0.35);
  const farX = nearX + 5;
  const eyeAt = (ex, near) => {
    if (eyes === 'open') {
      stamp(g, ex - 1, eyY - 1, near ? ['.ww.', 'wiIw', 'wIkw', '.ww.'] : ['.w.', 'wIw', 'wkw', '.w.']);
      plot(g, ex, eyY, 'w');
    } else if (eyes === 'shut') stamp(g, ex - 1, eyY, near ? ['.kk.', 'k..k'] : ['.k.', 'k.k']);
    else if (eyes === 'mad') stamp(g, ex - 1, eyY - 1, near ? ['kk..', '.wIw', 'wIkw', '.ww.'] : ['k..', 'wIw', 'wkw']);
    else if (eyes === 'x') stamp(g, ex - 1, eyY - 1, near ? ['k..k', '.kk.', '.kk.', 'k..k'] : ['k.k', '.k.', 'k.k']);
  };
  eyeAt(nearX, true);
  eyeAt(farX, false);
  // Beak-nozzle.
  const bkx = Math.round(cx + rx + puff) - 1;
  const bky = eyY + 3;
  if (beak === 'open') {
    stamp(g, bkx, bky - 2, ['hHHj..', '.hHHHj', '..zzz.', '.hhhh.', 'hhh...']);
  } else if (beak === 'puffed') {
    stamp(g, bkx, bky - 1, ['hHj.', 'hhh.']);
  } else {
    stamp(g, bkx, bky - 1, ['hHHj.', '.hhhh', 'hh...']);
  }
  // Near flipper.
  if (flip === 'down') fillPoly(g, [[cx - 6, cy - 2], [cx - 3, cy - 1], [cx - 4, cy + 6], [cx - 8, cy + 7]], 'b');
  else if (flip === 'up') fillPoly(g, [[cx - 6, cy - 1], [cx - 3, cy + 1], [cx - 9, cy - 7], [cx - 11, cy - 5]], 'b');
  else if (flip === 'back') fillPoly(g, [[cx - 6, cy - 1], [cx - 3, cy + 2], [cx - 12, cy + 3], [cx - 12, cy + 1]], 'b');
  else if (flip === 'spread') fillPoly(g, [[cx - 5, cy - 1], [cx - 3, cy + 2], [cx - 13, cy + 1], [cx - 12, cy - 2]], 'b');
  // Snowflake antenna.
  const ay = Math.round(cy - ry - puff * 0.4);
  const ax = Math.round(cx - 1);
  plot(g, ax, ay - 1, 'c');
  plot(g, ax, ay - 2, 'c');
  stamp(g, ax - 2, ay - 7, ['x.X.x', '.xXx.', 'XXwXX', '.xXx.', 'x.X.x']);
  let out = g;
  if (lean) out = shear(out, lean, H - 1);
  return rowsOf(out);
}

const FROST = {
  idle: [buildFrostbit({ feet: 0 }), buildFrostbit({ flip: 'back', feet: 1, lean: 0.06 })],
  move: [buildFrostbit({ flip: 'spread', lean: -0.12 }), buildFrostbit({ flip: 'spread', lean: -0.16, feet: 1 })],
  windup: [buildFrostbit({ puff: 1, flip: 'up', eyes: 'shut', beak: 'puffed' }), buildFrostbit({ puff: 2, flip: 'up', eyes: 'shut', beak: 'puffed' })],
  attack: [buildFrostbit({ flip: 'back', eyes: 'mad', beak: 'open', lean: 0.16 }), buildFrostbit({ flip: 'back', eyes: 'mad', beak: 'open', lean: 0.2 })],
  hurt: buildFrostbit({ flip: 'up', eyes: 'x', beak: 'open', lean: -0.2 }),
};

const FROST_BASE = Object.freeze({
  a: '#123e6a', b: '#1c66a4', c: '#2e94d8', d: '#7ccaf8',
  e: '#7a9cbc', f: '#bcd6ec', g: '#e6f4ff', w: '#ffffff',
  i: '#1a8ac8', I: '#56d0ff', k: '#0c1222', z: '#5a1a2a',
  h: '#b06010', H: '#f0a024', j: '#ffe070', o: '#c86a10', O: '#ffaa2a',
  x: '#8ad8ff', X: '#d8f8ff',
});
const FROST_PAL = {
  1: FROST_BASE,
  2: recolor(FROST_BASE, { a: '#0c0e34', b: '#181e62', c: '#2a3496', d: '#5664cc', i: '#3a58e0', I: '#90a8ff', x: '#a0b0ff', X: '#e8ecff', h: '#c04a18', H: '#ff7a2a', j: '#ffc070', o: '#c04a18', O: '#ff7a2a' }),
  3: recolor(FROST_BASE, {
    a: '#0a3236', b: '#0e5658', c: '#18888a', d: '#5ccac6', e: '#88b0b8', f: '#c4e2e4', g: '#eefcfc',
    h: '#a83a4a', H: '#e86a7a', j: '#ffb0b8', o: '#a83a4a', O: '#e86a7a', i: '#0a9a8a', I: '#5af0d8',
  }),
  4: recolor(FROST_BASE, {
    a: '#12082a', b: '#24104a', c: '#3e1e74', d: '#6a3aa6', e: '#6a5a8a', f: '#a898c8', g: '#d8ccf0',
    i: '#c030e0', I: '#ff8cff', h: '#6a4a10', H: '#b08a20', j: '#f0d060', o: '#6a4a10', O: '#b08a20',
    x: '#d070ff', X: '#ffd0ff', w: '#f8f0ff',
  }),
};
const FROST_MIST = { 1: ['#ffffff', '#c8f0ff', '#7ac8f0'], 2: ['#ffffff', '#c8d4ff', '#7a8cf0'], 3: ['#ffffff', '#c8fff6', '#6ad8d0'], 4: ['#ffffff', '#f0c8ff', '#b06ae0'] };

function drawFrostbit(ctx, e, x, y, t) {
  const L = lv(e);
  const F = fl(e);
  const flip = F < 0;
  const anim = e.anim ?? 'idle';
  const k = e.animT ?? 0;
  const pal = FROST_PAL[L];
  const mist = FROST_MIST[L];
  let rows = FROST.idle[((t + (e.id ?? 0) * 7) >> 4) % 2];
  if (anim === 'move') rows = FROST.move[(t >> 2) % 2];
  else if (anim === 'windup') rows = FROST.windup[k < 8 ? 0 : 1];
  else if (anim === 'attack') rows = FROST.attack[(t >> 2) % 2];
  else if (anim === 'hurt' || anim === 'delete') rows = FROST.hurt;
  sprite(ctx, rows, pal, x, y, { anchor: 'feet', flip, outline: OUTLINE });

  if (anim === 'move') {
    // Ice spray kicked up by the slide.
    for (let i = 0; i < 4; i++) {
      const p = ((t + i * 5) % 12) / 12;
      px(ctx, x - F * (6 + Math.round(p * 8)) + F * i, y - 1 - Math.round(p * 4) - (i & 1), mist[i % 3]);
    }
  } else if (anim === 'windup') {
    // Air drawn into the nozzle.
    for (let i = 0; i < 4; i++) {
      const p = 1 - (((k + i * 4) % 16) / 16);
      const ax = x + F * (12 + Math.round(p * 12));
      const ay = y - 15 + Math.round(Math.sin(i * 1.7) * p * 6);
      px(ctx, ax, ay, mist[1]);
      px(ctx, ax + F, ay, mist[2]);
    }
  } else if (anim === 'attack') {
    // Frost blast at the nozzle.
    const bx = x + F * 16;
    const by = y - 14;
    disc(ctx, bx, by, 3 + ((t >> 1) % 2), mist[2]);
    disc(ctx, bx, by, 2, mist[1]);
    px(ctx, bx, by, mist[0]);
    for (let i = 0; i < 3; i++) px(ctx, bx + F * (4 + i * 2), by - 3 + i * 3, mist[0]);
  }
}

// ================================================================ SPORELING (burrowing toadstool)
//
// A big spotted cap on a stubby stalk with a shy face under the brim. Squash and stretch carry its poses;
// burrowing and emerging are drawn by clipping the sprite at the floor line.

function buildSporeling({ squash = 0, face = 'open', glow = false, mouth = 'smile', lift = 0 } = {}) {
  const W = 28;
  const H = 30;
  const g = blank(W, H);
  const cx = 13.5;
  // Stalk (the body, with the face).
  const sRx = 7 + squash * 1.3;
  const sRy = 7.2 - squash * 1.5;
  const sCy = H - 1.2 - sRy;
  orb(g, cx + 0.5, sCy, sRx, sRy, 'efgg', [0.28, 0.58, 0.92]);
  // Feet.
  stamp(g, Math.round(cx - 5), H - 2, ['nNn']);
  stamp(g, Math.round(cx + 3), H - 2, ['nNn']);
  // Cap: a spotted dome whose brim overhangs the top of the stalk.
  const brim = sCy - sRy + 3.6 - lift;
  const capRx = 12.2 + squash * 1.8;
  const capRy = 9.6 - squash * 2.6 + lift * 0.5;
  // Shadow the cap throws on the stalk, and the gills.
  for (let x = 0; x < W; x++) {
    const xc = x + 0.5;
    const yb = Math.floor(brim) + 1;
    if (Math.abs(xc - cx) <= capRx - 2.5) {
      if ('efg'.includes(at(g, x, yb + 1))) plot(g, x, yb + 1, 'e');
    }
  }
  orb(g, cx, brim + 0.5, capRx, capRy, 'abcd', [0.3, 0.56, 0.83], { clip: (x, y) => y < brim + 0.6 });
  for (let x = 0; x < W; x++) {
    const xc = x + 0.5;
    const dx = Math.abs(xc - cx);
    if (dx > capRx - 1.5) continue;
    const yb = Math.floor(brim) + 1;
    plot(g, x, yb, dx > capRx - 3.5 ? 'a' : (x % 2 ? 'q' : 'Q'));
  }
  // Spots, following the dome.
  const spots = [[-0.42, -0.62, 2.9], [0.2, -0.82, 2.3], [0.62, -0.4, 2.1], [-0.86, -0.22, 1.5], [0.02, -0.3, 1.7]];
  for (const [ux, uy, r] of spots) {
    const sx = cx + ux * capRx;
    const sy = brim + 0.5 + uy * capRy;
    shape(g, (x, y) => {
      if (!'abcd'.includes(at(g, Math.floor(x), Math.floor(y)))) return null;
      const d = Math.hypot(x - sx, (y - sy) * 1.3);
      if (d > r) return null;
      if (glow) return d < r * 0.55 ? 'G' : 'S';
      return (x - sx) + (y - sy) * 1.3 < 0.4 ? 'S' : 's';
    });
  }
  // Face on the front of the stalk (a little right of centre: it faces right).
  const fy = Math.round(brim) + 3;
  const fx = Math.round(cx - 0.5);
  if (face === 'open') stamp(g, fx, fy, ['wk..wk', 'kk..kk', 'kk..kk']);
  else if (face === 'shut') stamp(g, fx, fy + 1, ['kk..kk', '.k...k']);
  else if (face === 'happy') stamp(g, fx, fy, ['.k...k.', 'k.k.k.k']);
  else if (face === 'puffed') stamp(g, fx, fy + 1, ['kk..kk']);
  else if (face === 'x') stamp(g, fx - 1, fy, ['k.k..k.k', '.k....k.', 'k.k..k.k']);
  if (face === 'puffed') {
    stamp(g, fx - 2, fy + 3, ['rr']);
    stamp(g, fx + 6, fy + 3, ['rr']);
  } else if (face !== 'x') {
    plot(g, fx - 1, fy + 3, 'r');
    plot(g, fx + 6, fy + 3, 'r');
  }
  if (mouth === 'smile') stamp(g, fx + 2, fy + 4, ['k.k', '.k.']);
  else if (mouth === 'o') stamp(g, fx + 2, fy + 4, ['.k.', 'kmk', '.k.']);
  else if (mouth === 'puff') stamp(g, fx + 2, fy + 4, ['kk']);
  else if (mouth === 'wail') stamp(g, fx + 2, fy + 4, ['kkk', 'kmk']);
  return rowsOf(g);
}

const SPORE = {
  idle: [buildSporeling({ squash: 0 }), buildSporeling({ squash: 0.35 })],
  blink: buildSporeling({ squash: 0, face: 'shut' }),
  hop: buildSporeling({ squash: -0.6, face: 'happy' }),
  windup: [buildSporeling({ squash: 0.8, face: 'puffed', mouth: 'puff', glow: true }), buildSporeling({ squash: 1.1, face: 'puffed', mouth: 'puff', glow: true })],
  attack: buildSporeling({ squash: -0.5, face: 'shut', mouth: 'o', glow: true, lift: 2 }),
  hurt: buildSporeling({ squash: 0.7, face: 'x', mouth: 'wail' }),
};

const SPORE_BASE = Object.freeze({
  a: '#1a4618', b: '#2c7426', c: '#48a63a', d: '#8ad85e', s: '#c6d898', S: '#f6ffdc', G: '#fffcb0',
  q: '#7a6a4a', Q: '#4a3c2a', e: '#9a8a6a', f: '#d4c49c', g: '#f8f0d2', k: '#1a120c', w: '#ffffff', m: '#c03a3a',
  n: '#5a3a1e', N: '#8a5a2e', r: '#f08a8a',
});
const SPORE_PAL = {
  1: SPORE_BASE,
  2: recolor(SPORE_BASE, { a: '#3a5208', b: '#668a12', c: '#98bc26', d: '#d2ee5c', s: '#e8a040', S: '#ffd890', G: '#fff0c0' }),
  3: recolor(SPORE_BASE, { a: '#06342a', b: '#0e5c46', c: '#1a8a64', d: '#52c896', s: '#c89a18', S: '#ffe066', G: '#fff8c0' }),
  4: recolor(SPORE_BASE, {
    a: '#1a0a2a', b: '#341458', c: '#521f80', d: '#7a3aac', s: '#2ad86a', S: '#a8ffc4', G: '#e8fff0',
    q: '#4a3a5a', Q: '#2a1e38', e: '#6a5a7a', f: '#a898b8', g: '#d8cce4', n: '#2a1a38', N: '#4a3060',
  }),
};
const SPORE_DUST = { 1: ['#e8f8a0', '#a8d860', '#5a9a3a'], 2: ['#fff0a0', '#e0c050', '#9a8a20'], 3: ['#fff0a0', '#d8c040', '#3a9a6a'], 4: ['#d8ffe8', '#5aff9a', '#2a9a5a'] };
const DIRT = ['#6a4a2a', '#9a7244', '#3e2a18'];

function drawSporeling(ctx, e, x, y, t) {
  const L = lv(e);
  const F = fl(e);
  const flip = F < 0;
  const anim = e.anim ?? 'idle';
  const k = e.animT ?? 0;
  const pal = SPORE_PAL[L];
  let rows = SPORE.idle[((t + (e.id ?? 0) * 11) >> 4) % 2];
  if ((t + (e.id ?? 0) * 29) % 150 < 6) rows = SPORE.blink;
  let dy = 0;
  let sink = 0;
  if (anim === 'move') {
    rows = SPORE.hop;
    dy = -3;
  } else if (anim === 'windup') rows = SPORE.windup[k < 8 ? 0 : 1];
  else if (anim === 'attack') {
    rows = SPORE.attack;
    dy = k < 6 ? -2 : -1;
  } else if (anim === 'hurt' || anim === 'delete') rows = SPORE.hurt;
  else if (anim === 'burrow') {
    rows = SPORE.windup[0];
    sink = Math.min(30, Math.round((k / 12) * 30));
  } else if (anim === 'emerge') {
    rows = k < 6 ? SPORE.hop : SPORE.idle[0];
    sink = Math.max(0, Math.round((1 - k / 8) * 30));
    dy = k >= 6 && k < 9 ? -2 : 0;
  }
  if (sink > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 24, y - 60, 48, 60);
    ctx.clip();
    sprite(ctx, rows, pal, x, y + sink, { anchor: 'feet', flip, outline: OUTLINE });
    ctx.restore();
    // Dirt flung up around the hole.
    for (let i = 0; i < 6; i++) {
      const p = ((k + i * 3) % 10) / 10;
      const side = i % 2 ? 1 : -1;
      const dx = side * (6 + Math.round(p * 6 + i));
      px(ctx, x + dx, y - 1 - Math.round(Math.sin(p * Math.PI) * (5 + i)), DIRT[i % 3]);
    }
    rect(ctx, x - 9, y - 1, 18, 2, DIRT[2]);
    rect(ctx, x - 7, y - 2, 14, 1, DIRT[0]);
    return;
  }
  sprite(ctx, rows, pal, x, y + dy, { anchor: 'feet', flip, outline: OUTLINE });
  if (anim === 'windup' || anim === 'attack') {
    const dust = SPORE_DUST[L];
    for (let i = 0; i < 5; i++) {
      const p = ((k + i * 5) % 18) / 18;
      const sx = x + F * (Math.round((hash(i, 3) - 0.3) * 20) + (anim === 'attack' ? Math.round(p * 14) : 0));
      const sy = y - 22 - Math.round(p * 10) + dy;
      px(ctx, sx, sy, dust[i % 3]);
    }
  }
}

// ================================================================ SCURRIER (clockwork rodent)
//
// A wind-up mouse bot: round body, dish ears, bead eye, a pink nose, a brass key on its back and a cable
// tail ending in a plug. Body lean and leg positions carry the skitter; the key turns while it idles.

function buildScurrier({ crouch = 0, stretch = 0, key = 0, tail = 0, legs = 0, eye = 'open', mouth = false, bomb = false, ears = 0, nose = 0 } = {}) {
  const W = 38;
  const H = 26;
  const g = blank(W, H);
  const floor = H - 1;
  // Body.
  const bx = 13 - stretch * 0.4;
  const brx = 8.4 + stretch * 0.9 + crouch * 0.5;
  const bry = 5.8 - crouch * 0.8 - stretch * 0.3;
  const by = floor - 1.4 - bry;
  // Head (big, chibi) at the front.
  const hx = bx + 9.6 + stretch * 1.2;
  const hy = by - 4.6 + crouch * 1.6;
  // Cable tail curling up behind into a plug.
  const tp = [];
  for (let i = 0; i <= 10; i++) {
    const a = i / 10;
    tp.push([bx - brx + 1.2 - a * 6.5 + Math.sin(a * 2.6 + tail) * 0.8, by + 2 - a * 11 + Math.sin(a * 5 + tail) * 1.2]);
  }
  for (let i = 1; i < tp.length; i++) seg(g, tp[i - 1][0], tp[i - 1][1], tp[i][0], tp[i][1], 't');
  const [tx, ty] = tp[tp.length - 1];
  stamp(g, Math.round(tx) - 1, Math.round(ty) - 3, ['y.y', 'y.y', 'YYy', 'yyz']);
  // Far ear and far feet (behind).
  orb(g, hx - 5.4 - ears, hy - 5.8, 3.4, 3.8, 'ab', [0.55]);
  const lp = legs ? [2, -2] : [0, 0];
  stamp(g, Math.round(bx - 4 + lp[1]), floor - 1, ['ff.', 'fff']);
  stamp(g, Math.round(bx + 5 + lp[0]), floor - 1, ['ff.', 'fff']);
  // Body with a panel seam, rivets and a pale belly.
  orb(g, bx, by, brx, bry, 'abcd', [0.26, 0.52, 0.82]);
  for (let x = Math.round(bx - brx + 3); x <= Math.round(bx + brx - 3); x++) {
    const u = (x - bx) / brx;
    const yy = Math.round(by + 1.2 - u * u * 1.4);
    if ('bcd'.includes(at(g, x, yy))) plot(g, x, yy, 'a');
  }
  plot(g, bx - 4, by - 1.5, 'd');
  plot(g, bx + 1, by - 2.5, 'd');
  for (let x = Math.round(bx - brx + 3); x <= Math.round(bx + brx - 2); x++) {
    const yb = Math.round(by + bry - 1);
    if (at(g, x, yb) !== '.' && at(g, x, yb + 1) !== '.') plot(g, x, yb, 'e');
  }
  // Wind-up key on the back: a stem and a two-lobed bow that turns.
  const kx = Math.round(bx - 2.5);
  const ky = Math.round(by - bry - 1);
  plot(g, kx, ky + 1, 'z');
  plot(g, kx + 1, ky + 1, 'z');
  if (key === 0) stamp(g, kx - 3, ky - 3, ['YYy..yYy', 'Y..yz..y', 'yyyzzyyz']);
  else if (key === 1) stamp(g, kx - 1, ky - 3, ['Yy.yz', 'Y.z.z', 'yyzzz']);
  else stamp(g, kx, ky - 3, ['Yz', 'yz', 'yz']);
  // Neck shadow, then the head.
  orb(g, hx - 0.6, hy + 0.4, 6.9, 6.3, 'aa', [2], { clip: (x, y) => 'bcde'.includes(at(g, Math.floor(x), Math.floor(y))) });
  orb(g, hx, hy, 6.4, 5.8, 'abcd', [0.26, 0.52, 0.82]);
  // Snout and nose.
  fillPoly(g, [[hx + 3.2, hy - 2.6], [hx + 9.2, hy + 1], [hx + 8.8, hy + 2.6], [hx + 3, hy + 4.2]], (x, y) => (y < hy - 0.2 ? 'd' : y < hy + 1.8 ? 'c' : 'b'));
  const nx = Math.round(hx + 8.4);
  const ny = Math.round(hy + 0.6 - nose);
  stamp(g, nx, ny - 1, ['Nn', 'nn']);
  // Cheek.
  plot(g, hx + 1, hy + 2, 'e');
  plot(g, hx + 2, hy + 2, 'e');
  plot(g, hx + 2, hy + 3, 'd');
  // Eye.
  const ex = Math.round(hx + 1.4);
  const ey = Math.round(hy - 2.6);
  if (eye === 'open') stamp(g, ex, ey, ['wk', 'kk', 'kk']);
  else if (eye === 'squint') stamp(g, ex - 1, ey + 1, ['kkk', '..k']);
  else if (eye === 'x') stamp(g, ex - 1, ey, ['k.k', '.k.', 'k.k']);
  if (mouth) stamp(g, Math.round(hx + 4.6), Math.round(hy + 2.6), ['kk.', 'mmk']);
  // Whiskers.
  seg(g, hx + 6.4, hy + 3.2, hx + 9, hy + 4.6, 'h');
  seg(g, hx + 6.4, hy - 1.2, hx + 9, hy - 2.8, 'h');
  // Near ear: a big dish with a pink lining, set on the back of the head.
  const ex2 = hx - 2.4 - ears;
  const ey2 = hy - 6.4 + crouch * 0.3;
  orb(g, ex2, ey2, 4.3, 4.7, 'abcd', [0.28, 0.52, 0.84]);
  orb(g, ex2 + 0.8, ey2 + 0.4, 2.5, 3.1, 'pP', [0.55]);
  // Near feet.
  stamp(g, Math.round(bx - 2 + lp[0]), floor - 1, ['FF.', 'FFf']);
  stamp(g, Math.round(bx + 7 + lp[1]), floor - 1, ['FF.', 'FFf']);
  if (bomb) stamp(g, Math.round(hx + 9), floor - 5, ['..Y..', '.bab.', 'bccba', 'bcdba', '.bba.']);
  return rowsOf(g);
}

const SCURRY = {
  idle: [0, 1, 2].map((key) => buildScurrier({ key, tail: key * 1.1, nose: key === 1 ? 1 : 0 })),
  move: [buildScurrier({ stretch: 1.6, legs: 1, tail: 2.2, ears: 1.5 }), buildScurrier({ stretch: 1.9, legs: 0, tail: 3.4, ears: 1.5 })],
  windup: [buildScurrier({ crouch: 1.6, eye: 'squint', bomb: true, tail: 1 }), buildScurrier({ crouch: 2.1, eye: 'squint', bomb: true, tail: 2 })],
  attack: buildScurrier({ stretch: 2.2, eye: 'open', mouth: true, tail: 4, ears: 1 }),
  hurt: buildScurrier({ crouch: 0.8, eye: 'x', mouth: true, tail: 0.5, ears: 2.5 }),
};

const SCURRY_BASE = Object.freeze({
  a: '#3a3448', b: '#6a6480', c: '#9c96b0', d: '#d4d0e2', e: '#ece8f6',
  p: '#a8405e', P: '#f48aa8', n: '#e04a78', N: '#ffb4cc', k: '#0e0c14', w: '#ffffff', m: '#c03a4a',
  y: '#c88a18', Y: '#ffd84a', z: '#6a4a10', t: '#2a2634', F: '#4a4458', f: '#24202e', h: '#e8e4f4',
});
const SCURRY_PAL = {
  1: SCURRY_BASE,
  2: recolor(SCURRY_BASE, { a: '#4a3016', b: '#7a5628', c: '#b08848', d: '#e4c486', e: '#f6e4b8', F: '#5a3e20', f: '#2e1e0e' }),
  3: recolor(SCURRY_BASE, { a: '#3c0c16', b: '#6c1a28', c: '#a8303c', d: '#e06a68', e: '#f8b4aa', p: '#6a1a2a', P: '#ff9aaa', F: '#4a1420', f: '#24080e' }),
  4: recolor(SCURRY_BASE, {
    a: '#180a28', b: '#30164e', c: '#502a78', d: '#8452b4', e: '#b28ee0', p: '#8a1a9a', P: '#ff7af0',
    n: '#ff4ae0', N: '#ffc0ff', w: '#ffb0ff', y: '#8a3aa8', Y: '#e070ff', z: '#3a1050', F: '#2a1640', f: '#100818', h: '#c8a8f0',
  }),
};

function drawScurrier(ctx, e, x, y, t) {
  const L = lv(e);
  const F = fl(e);
  const flip = F < 0;
  const anim = e.anim ?? 'idle';
  const k = e.animT ?? 0;
  const pal = SCURRY_PAL[L];
  let rows = SCURRY.idle[((t + (e.id ?? 0) * 5) >> 3) % 3];
  let dx = 0;
  let dy = 0;
  if (anim === 'move') {
    rows = SCURRY.move[(t >> 2) % 2];
    dy = -((t >> 2) % 2);
  } else if (anim === 'windup') rows = SCURRY.windup[(k >> 3) % 2];
  else if (anim === 'attack') {
    rows = SCURRY.attack;
    dx = k < 8 ? 3 : 1;
  } else if (anim === 'hurt' || anim === 'delete') {
    rows = SCURRY.hurt;
    dx = -2;
  }
  sprite(ctx, rows, pal, x + F * dx, y + dy, { anchor: 'feet', flip, outline: OUTLINE });
  if (anim === 'move') {
    // Speed lines behind.
    for (let i = 0; i < 3; i++) {
      const lx = x - F * (21 + i * 2);
      rect(ctx, F > 0 ? lx - 5 : lx, y - 5 - i * 4, 6, 1, i === 1 ? '#ffffff' : '#a8b0d0');
    }
  }
  if (anim === 'windup') {
    // Fuse spark on the bomb it is about to let go.
    const sx = x + F * 14;
    const sy = y - 6;
    px(ctx, sx, sy, (t >> 1) % 2 ? '#ffffff' : '#ffd24a');
    px(ctx, sx + F * ((t >> 1) % 2), sy - 1, '#ff8a2a');
  }
}

// ================================================================ spells

// kitemark: the fiery target painted on a panel before a meteor lands (drawn under bodies).
function drawKiteMark(ctx, s, x, y, t) {
  const L = ownerLevel(s);
  const cols = FLAME[L];
  const p = Math.max(0, Math.min(1, s.data?.progress ?? 0));
  const blink = p > 0.7 ? (t >> 1) % 2 : (t >> 2) % 2;
  const cy = y - 8;
  // Outer ring and corner ticks.
  ring2(ctx, x, cy, 15, 6, blink ? cols[2] : cols[1]);
  const r = Math.max(2, Math.round(13 * (1 - p)));
  ring2(ctx, x, cy, r + 1, Math.max(1, Math.round((r + 1) * 0.42)), cols[3]);
  for (const [ax, ay] of [[-17, 0], [17, 0], [0, -8], [0, 8]]) {
    rect(ctx, x + ax - (ax ? 1 : 0), cy + ay - (ay ? 0 : 0), ax ? 3 : 1, 1, blink ? cols[3] : cols[2]);
  }
  if (p > 0.55) ellipse(ctx, x, cy, Math.round(4 + p * 6), Math.round(2 + p * 2), cols[1]);
  if (p > 0.55) ellipse(ctx, x, cy, Math.round(2 + p * 3), Math.round(1 + p), cols[2]);
}

// An axis-aligned ellipse outline (rx, ry), pixel-exact.
function ring2(ctx, cx, cy, rx, ry, color) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.fillStyle = color;
  let px0 = null;
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    const xx = cx + Math.round(Math.cos(ang) * rx);
    const yy = cy + Math.round(Math.sin(ang) * ry);
    if (px0 && px0[0] === xx && px0[1] === yy) continue;
    ctx.fillRect(xx, yy, 1, 1);
    px0 = [xx, yy];
  }
}

const METEOR_ROWS = rowsOf(
  (() => {
    const g = blank(10, 10);
    orb(g, 5, 5, 4.4, 4.4, 'abcd', [0.3, 0.55, 0.8]);
    stamp(g, 2, 3, ['e..', '.e.']);
    stamp(g, 5, 6, ['ee', '.e']);
    return g;
  })(),
);
const METEOR_PAL = {
  1: { a: '#4a1a10', b: '#8a2a14', c: '#d2501a', d: '#ffa040', e: '#ffe070' },
  2: { a: '#2a1410', b: '#5a2a1a', c: '#a04a1a', d: '#f08a30', e: '#ffd060' },
  3: { a: '#8a3a0a', b: '#d27a14', c: '#ffc040', d: '#fff2a0', e: '#ffffff' },
  4: { a: '#24082e', b: '#4a1460', c: '#8a2ab0', d: '#d070f0', e: '#ffd0ff' },
};

// kitemeteor: the falling ember meteor (drawn above bodies while it falls; s.z > 0).
function drawKiteMeteor(ctx, s, x, y, t) {
  const L = ownerLevel(s);
  const cols = FLAME[L];
  const p = Math.max(0, Math.min(1, s.data?.progress ?? 0));
  if (s.data?.landed) return;
  const start = 0.4;
  if (p < start) return;
  const k = (p - start) / (1 - start);
  const H = 92;
  const mx = Math.round(x + (1 - k) * 34);
  const my = Math.round(y - 8 - (1 - k) * H);
  // Flame trail streaming back toward the sky.
  for (let i = 12; i >= 1; i--) {
    const tx = mx + Math.round(i * 1.9);
    const ty = my - Math.round(i * 4.6);
    const r = Math.max(1, Math.round(4 - i * 0.28));
    const c = i < 3 ? cols[3] : i < 6 ? cols[2] : i < 9 ? cols[1] : cols[0];
    disc(ctx, tx + ((t + i) % 3 === 0 ? 1 : 0), ty, r, c);
  }
  disc(ctx, mx, my, 6, cols[1]);
  disc(ctx, mx, my, 5, cols[2]);
  sprite(ctx, METEOR_ROWS, METEOR_PAL[L], mx, my + 5, { anchor: 'feet', outline: OUTLINE });
  px(ctx, mx - 3 + ((t >> 1) % 3), my - 2, cols[3]);
}

// frostbreath: a rolling gust of frost along the floor, ice shards leading, frost trailing.
const FROST_EDGE = { 1: '#1c4a86', 2: '#1e2a86', 3: '#0e5a62', 4: '#3a1a6a' };
function drawFrostBreath(ctx, s, x, y, t) {
  const L = ownerLevel(s);
  const mist = FROST_MIST[L];
  const edge = FROST_EDGE[L];
  const d = s.dir ?? -1;
  const sp = s.data?.speed ?? 0;
  const f = sp ? Math.min(1, (s.t - (s.data.enterT ?? s.t)) / sp) : 0.5;
  const cx = Math.round(x + d * (f - 0.5) * PANEL_W * 0.9);
  const cy = y - 8;
  // Puffs from the front (leading, low) to the back (trailing, small).
  const puffs = [];
  for (let i = 0; i < 6; i++) {
    const wob = Math.sin(t / 3 + i * 1.7);
    puffs.push([cx - d * (i * 4 - 3), cy - 3 - Math.round(Math.abs(Math.sin(t / 5 + i)) * 3) + (i % 2) * 3, Math.max(2, 7 - i) + (wob > 0.5 ? 1 : 0)]);
  }
  for (const [px0, py0, r] of puffs) disc(ctx, px0, py0, r + 1, edge);
  for (const [px0, py0, r] of puffs) disc(ctx, px0, py0, r, mist[2]);
  for (const [px0, py0, r] of puffs) disc(ctx, px0 - 1, py0 - 1, Math.max(1, r - 1), mist[1]);
  for (const [px0, py0, r] of puffs) if (r > 3) disc(ctx, px0 - 2, py0 - 2, r - 3, mist[0]);
  // Ice shards jutting forward from the front of the gust.
  const fx0 = cx + d * 6;
  for (let i = 0; i < 3; i++) {
    const len = 5 + ((t + i * 2) % 3);
    const sy = cy - 6 + i * 4;
    line(ctx, fx0, sy, fx0 + d * len, sy - 1 + (i === 2 ? 2 : 0), i === 1 ? '#ffffff' : mist[1]);
    px(ctx, fx0 + d * (len + 1), sy - 1 + (i === 2 ? 2 : 0), '#ffffff');
  }
  // Glints inside, and frost settling behind it.
  for (let i = 0; i < 3; i++) {
    if ((t + i * 3) % 7 < 4) {
      const gx = cx - d * (2 + i * 6);
      const gy = cy - 7 + i * 3;
      px(ctx, gx, gy, '#ffffff');
      px(ctx, gx - 1, gy, mist[0]);
      px(ctx, gx + 1, gy, mist[0]);
      px(ctx, gx, gy - 1, mist[0]);
      px(ctx, gx, gy + 1, mist[0]);
    }
  }
  for (let i = 0; i < 8; i++) px(ctx, cx - d * (22 + i * 2), y - 1 - ((i * 7 + (t >> 1)) % 4), i % 2 ? mist[0] : mist[1]);
}

// sporecloud: a spore puff hanging over each of its cells (cells are drawn relative to s.x, s.y).
const SPORE_EDGE = { 1: '#28541c', 2: '#5a4a10', 3: '#0e4a36', 4: '#14402a' };
function drawSporeCloud(ctx, s, x, y, t) {
  const L = ownerLevel(s);
  const dust = SPORE_DUST[L];
  const edge = SPORE_EDGE[L];
  const cells = s.data?.cells?.length ? s.data.cells : [[s.x ?? 0, s.y ?? 0]];
  const life = s.data?.frames ?? 30;
  const age = s.t ?? 0;
  const grow = Math.min(1, (age + 2) / 7);
  const fade = age > life - 8 ? Math.max(0, (life - age) / 8) : 1;
  cells.forEach(([c, r], n) => {
    const cx = x + (c - (s.x ?? c)) * PANEL_W;
    const cy = y + (r - (s.y ?? r)) * PANEL_H - 11;
    const R = 10 * grow;
    const puffs = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + t / 16 + n * 2;
      const rr = Math.max(1, Math.round((3.5 + ((i * 5) % 3)) * grow * (0.4 + 0.6 * fade)));
      puffs.push([cx + Math.round(Math.cos(a) * R), cy + Math.round(Math.sin(a) * R * 0.5) - (i % 3), rr]);
    }
    puffs.push([cx, cy - 2, Math.max(1, Math.round(6 * grow * (0.4 + 0.6 * fade)))]);
    for (const [px0, py0, rr] of puffs) disc(ctx, px0, py0, rr + 1, edge);
    for (const [px0, py0, rr] of puffs) disc(ctx, px0, py0, rr, dust[2]);
    for (const [px0, py0, rr] of puffs) disc(ctx, px0 - 1, py0 - 1, Math.max(1, rr - 1), dust[1]);
    for (const [px0, py0, rr] of puffs) if (rr > 2) disc(ctx, px0 - 1, py0 - 2, rr - 2, dust[0]);
    // Spores drifting up out of the cloud.
    for (let i = 0; i < 8; i++) {
      const p = ((age * 2 + i * 9 + n * 5) % 32) / 32;
      const sx = cx + Math.round((hash(i, n) - 0.5) * 28) + Math.round(Math.sin(t / 6 + i) * 2);
      const sy = cy + 4 - Math.round(p * 24);
      if (fade > 0.3 && p > 0.1) {
        px(ctx, sx, sy, i % 2 ? dust[0] : edge);
        if (i % 3 === 0) px(ctx, sx + 1, sy, dust[1]);
      }
    }
  });
}

// sporemound: the rumbling dirt mound that marks where a Sporeling will pop up.
function drawSporeMound(ctx, s, x, y, t) {
  const p = Math.max(0, Math.min(1, s.data?.progress ?? 0));
  const shake = (t >> 1) % 2 ? 1 : -1;
  const w = Math.round(6 + p * 6);
  const h = Math.round(2 + p * 3);
  ellipse(ctx, x + shake, y - 1, w, h, DIRT[0]);
  ellipse(ctx, x + shake - 1, y - 2, Math.max(1, w - 3), Math.max(1, h - 1), DIRT[1]);
  rect(ctx, x - w + shake, y - 1, w * 2, 1, DIRT[2]);
  for (let i = 0; i < 3; i++) {
    const q = ((t + i * 4) % 12) / 12;
    px(ctx, x + (i - 1) * 5 + shake, y - h - 1 - Math.round(q * 5), DIRT[i % 2]);
  }
  line(ctx, x - 2 + shake, y - h, x + shake, y - h + 2, DIRT[2]);
}

// The crawling bomb: a little iron bomb-mouse on wheels whose tail is the lit fuse. Views: side (facing
// right; flipped for left), up (seen from behind) and down (seen from the front). FUSE_TIP gives where the
// spark burns in each view, relative to the feet anchor (x right, y up).
function buildBomb(view, frame) {
  const g = blank(16, 15);
  if (view === 'side') {
    // Fuse tail curling up behind.
    seg(g, 3, 9, 1, 7, 't');
    seg(g, 1, 7, 1, 4 - frame, 't');
    orb(g, 6.6, 9, 4.8, 4.6, 'abcd', [0.28, 0.52, 0.8]);
    stamp(g, 3, 6, ['..y', '.yY', 'yY.']);
    // Head: ear, snout, LED eye, pink nose.
    orb(g, 10.4, 4.6, 1.9, 2, 'cd', [0.55]);
    plot(g, 10.6, 4.8, 'p');
    fillPoly(g, [[9.5, 6.2], [15.2, 9.2], [14.8, 10.6], [9.5, 11.6]], (x, y) => (y < 8.6 ? 'd' : y < 10 ? 'c' : 'b'));
    plot(g, 15, 9, 'n');
    plot(g, 11, 8, 'r');
    // Wheels.
    stamp(g, 3, 13, frame ? ['FfF', '.F.'] : ['fFf', '.f.']);
    stamp(g, 8, 13, frame ? ['FfF', '.F.'] : ['fFf', '.f.']);
  } else if (view === 'up') {
    orb(g, 4, 3.6, 2, 2.1, 'cd', [0.55]);
    orb(g, 11, 3.6, 2, 2.1, 'cd', [0.55]);
    orb(g, 7.5, 8, 5, 4.8, 'abcd', [0.28, 0.52, 0.8]);
    stamp(g, 4, 5, ['..y', '.yY', 'yY.']);
    // The fuse tail hangs toward us.
    seg(g, 7, 12, 7 + (frame ? 1 : -1), 14, 't');
  } else {
    seg(g, 11, 4, 12, 1 + frame, 't');
    orb(g, 4, 3, 2, 2.1, 'cd', [0.55]);
    orb(g, 11, 3, 2, 2.1, 'cd', [0.55]);
    plot(g, 4, 3, 'p');
    plot(g, 11, 3, 'p');
    orb(g, 7.5, 8, 5, 4.8, 'abcd', [0.28, 0.52, 0.8]);
    stamp(g, 4, 5, ['..y', '.yY']);
    stamp(g, 5, 8, ['r...r', '..n..', '.ddd.']);
    stamp(g, 4, 13, frame ? ['F.....F'] : ['f.....f']);
  }
  return rowsOf(g);
}
const FUSE_TIP = { side: [-7, 11], up: [0, 0], down: [4, 14] };

const BOMB = {
  side: [buildBomb('side', 0), buildBomb('side', 1)],
  up: [buildBomb('up', 0), buildBomb('up', 1)],
  down: [buildBomb('down', 0), buildBomb('down', 1)],
};
const BOMB_BASE = Object.freeze({
  a: '#141220', b: '#2c283c', c: '#56506c', d: '#a8a2c2', y: '#8a8aa8', Y: '#ffffff',
  r: '#ff3a3a', n: '#f05a88', p: '#f48aa8', t: '#6a5a3a', f: '#1a1820', F: '#5a5468',
});
const BOMB_PAL = {
  1: BOMB_BASE,
  2: recolor(BOMB_BASE, { a: '#1e140c', b: '#3e2c1a', c: '#6e5232', d: '#b8986a' }),
  3: recolor(BOMB_BASE, { a: '#200810', b: '#44121e', c: '#762232', d: '#c45a5e' }),
  4: recolor(BOMB_BASE, { a: '#10081c', b: '#24123c', c: '#442468', d: '#8458be', r: '#ff40e0', n: '#ff4ae0', p: '#ff7af0', y: '#9a6ac8', F: '#4a2a70' }),
};

// scurrybomb: the crawling bomb-mouse with a sputtering fuse; it faces its heading.
function drawScurryBomb(ctx, s, x, y, t) {
  const L = ownerLevel(s);
  const pal = BOMB_PAL[L];
  const dr = s.data?.dr ?? 0;
  const dc = s.data?.dc ?? s.dir ?? -1;
  const f = (t >> 2) % 2;
  const bob = (t >> 1) % 2;
  const view = dr < 0 ? 'up' : dr > 0 ? 'down' : 'side';
  const flip = view === 'side' && dc < 0;
  sprite(ctx, BOMB[view][f], pal, x, y - bob, { anchor: 'feet', flip, outline: OUTLINE });
  const [fx0, fy0] = FUSE_TIP[view];
  const sx = x + (flip ? -fx0 - 1 : fx0);
  const sy = y - bob - fy0;
  if (view === 'up') {
    // The fuse end trails at our side of the bomb.
    px(ctx, x - 1 + (f ? 1 : -1), y - bob, (t >> 1) % 2 ? '#ffffff' : '#ffd24a');
    return;
  }
  px(ctx, sx, sy, (t >> 1) % 2 ? '#ffffff' : '#ffd24a');
  px(ctx, sx + ((t >> 1) % 3) - 1, sy - 1, '#ff8a2a');
  if ((t >> 2) % 2) px(ctx, sx + (flip ? 1 : -1), sy - 2, '#ffe080');
}

// ================================================================ effects

// eyebeam: the Watcher's lightning beam from the eye to where it struck.
function drawEyeBeam(ctx, fx, x, y, age) {
  const L = lv(fx);
  const glow = ELEC_GLOW[L];
  const dark = L === 4 ? '#7a1aa0' : '#c07a10';
  const d = fx.dir ?? -1;
  const toCol = fx.toCol ?? (d < 0 ? -1 : 6);
  const x0 = x + d * 14;
  const x1 = x + (toCol - (fx.col ?? 0)) * PANEL_W + (fx.hit ? 0 : d * 30);
  const by = y - 25;
  const fade = age < 4 ? 1 : 1 - (age - 4) / 12;
  const w = Math.max(0, Math.round(5 * fade));
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  if (w > 0) {
    rect(ctx, lo, by - w, hi - lo, w * 2 + 1, dark);
    rect(ctx, lo, by - Math.max(0, w - 2), hi - lo, Math.max(1, w * 2 - 3), glow);
    rect(ctx, lo, by - (w > 3 ? 1 : 0), hi - lo, w > 3 ? 3 : 1, '#ffffff');
  }
  // Jagged arcs crawling along the beam.
  if (age < 12) {
    for (let i = 0; i < 2; i++) {
      let yy = by + (i ? 3 : -3);
      for (let xx = lo; xx < hi; xx += 3) {
        const j = hash(xx, age >> 1, i);
        const ny = by + Math.round((j - 0.5) * (8 + i * 4) * fade);
        line(ctx, xx, yy, xx + 3, ny, i ? glow : '#ffffff');
        yy = ny;
      }
    }
  }
  // Muzzle burst and impact.
  if (age < 8) {
    disc(ctx, x0, by, 6 - (age >> 1), glow);
    disc(ctx, x0, by, 3 - (age >> 2), '#ffffff');
  }
  if (fx.hit && age < 12) {
    const ix = x + (toCol - (fx.col ?? 0)) * PANEL_W;
    const r = 4 + (age >> 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + age * 0.3;
      line(ctx, ix, by, ix + Math.round(Math.cos(a) * r), by + Math.round(Math.sin(a) * r), i % 2 ? glow : '#ffffff');
    }
    disc(ctx, ix, by, Math.max(1, 4 - (age >> 2)), '#ffffff');
  }
}

// kiteburst: a meteor striking the floor: a flash, a ring of fire and flung embers.
function drawKiteBurst(ctx, fx, x, y, age) {
  const cols = FLAME[fx.fx === 'kiteburstv' ? 4 : lv(fx)];
  const cy = y - 6;
  if (age < 4) {
    disc(ctx, x, cy - 6, 12 - age, cols[2]);
    disc(ctx, x, cy - 6, 8 - age, cols[3]);
  }
  const r = 6 + age * 1.2;
  if (age < 16) {
    ring2(ctx, x, cy, Math.round(r), Math.round(r * 0.4), age < 8 ? cols[2] : cols[1]);
    ring2(ctx, x, cy, Math.round(r - 2), Math.round((r - 2) * 0.4), age < 6 ? cols[3] : cols[2]);
  }
  for (let i = 0; i < 5; i++) {
    const h = Math.max(0, Math.round((14 - age) * (0.6 + hash(i, 5) * 0.6)));
    if (h > 0) flameTongue(ctx, x + (i - 2) * 5, cy + 2 - Math.round(hash(i, 2) * 2), h, cols, age * 2, i);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dist = age * (1.4 + hash(i, 9));
    const ex = x + Math.round(Math.cos(a) * dist * 1.4);
    const ey = cy - Math.round(Math.abs(Math.sin(a)) * dist) - Math.round(age * (8 - age) * 0.15);
    if (age < 18) px(ctx, ex, ey, i % 2 ? cols[3] : cols[2]);
  }
  if (age > 6) {
    ctx.globalAlpha = Math.max(0, 1 - (age - 6) / 16);
    ellipse(ctx, x, cy + 2, 9, 3, '#1a0a08');
    ctx.globalAlpha = 1;
  }
}

// frostflash: frost crystals bloom on a panel as it freezes.
function drawFrostFlash(ctx, fx, x, y, age) {
  const mist = FROST_MIST[lv(fx)];
  const cy = y - 8;
  const r = Math.min(14, 3 + age * 1.6);
  if (age < 14) ring2(ctx, x, cy, Math.round(r), Math.round(r * 0.42), age < 7 ? '#ffffff' : mist[1]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const dist = Math.min(12, age * 1.3);
    const sx = x + Math.round(Math.cos(a) * dist);
    const sy = cy + Math.round(Math.sin(a) * dist * 0.42) - Math.round(age * 0.4);
    if (age < 16) {
      px(ctx, sx, sy, '#ffffff');
      if (age < 10) {
        px(ctx, sx - 1, sy, mist[1]);
        px(ctx, sx + 1, sy, mist[1]);
        px(ctx, sx, sy - 1, mist[1]);
        px(ctx, sx, sy + 1, mist[1]);
      }
    }
  }
  if (age < 10) {
    // A crystal shard pops up in the middle.
    const h = Math.min(8, age * 2);
    rect(ctx, x - 1, cy - h, 3, h, mist[1]);
    rect(ctx, x, cy - h - 1, 1, h, '#ffffff');
  }
}

// burrowdirt: clods of dirt flung up where a body digs in or out.
function drawBurrowDirt(ctx, fx, x, y, age) {
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const vx = side * (0.6 + hash(i, 1) * 1.2);
    const vy = 1.6 + hash(i, 2) * 1.6;
    const ex = x + Math.round(vx * age * 1.4);
    const ey = y - 2 - Math.round(vy * age - 0.18 * age * age);
    if (ey <= y) rect(ctx, ex, ey, i < 3 ? 2 : 1, i < 3 ? 2 : 1, DIRT[i % 3]);
  }
  if (age < 8) {
    ellipse(ctx, x, y - 1, 8 + age, 2, DIRT[2]);
    ellipse(ctx, x, y - 2, 6 + age, 1, DIRT[0]);
  }
}

// scurryblast: the crawling bomb going off: a white flash, a rolling fireball, flung scrap and smoke.
const BLAST = {
  1: ['#ffffff', '#fff2a0', '#ffc040', '#ff7a1a', '#c02a10'],
  4: ['#ffffff', '#ffd0ff', '#ff70f0', '#c030e0', '#5a1080'],
};
function drawScurryBlast(ctx, fx, x, y, age) {
  const cols = BLAST[lv(fx) === 4 ? 4 : 1];
  const cy = y - 10;
  if (age < 3) {
    disc(ctx, x, cy, 11 - age, cols[1]);
    disc(ctx, x, cy, 8 - age, cols[0]);
    return;
  }
  // Fireball: puffs that swell, then cool from yellow to red as they rise.
  if (age < 14) {
    const k = (age - 3) / 11;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const d = 4 + k * 6;
      const r = Math.max(1, Math.round(6 - k * 4 + (i % 2)));
      const px0 = x + Math.round(Math.cos(a) * d);
      const py0 = cy + Math.round(Math.sin(a) * d * 0.7) - Math.round(k * 6);
      disc(ctx, px0, py0, r + 1, cols[4]);
      disc(ctx, px0, py0, r, k < 0.4 ? cols[2] : cols[3]);
      if (k < 0.6) disc(ctx, px0 - 1, py0 - 1, Math.max(1, r - 2), k < 0.3 ? cols[1] : cols[2]);
    }
    if (k < 0.5) disc(ctx, x, cy - Math.round(k * 6), Math.round(5 - k * 6), cols[0]);
  }
  // Smoke drifting up.
  if (age >= 8) {
    const k = (age - 8) / 14;
    for (let i = 0; i < 3; i++) {
      const r = Math.max(0, Math.round(4 - k * 4 + (i === 1 ? 1 : 0)));
      if (r > 0) disc(ctx, x + (i - 1) * 6, cy - 8 - Math.round(k * 12) - (i === 1 ? 3 : 0), r, i === 1 ? '#7a7488' : '#5a5468');
    }
  }
  // Scrap and sparks flung out under gravity.
  for (let i = 0; i < 7; i++) {
    const vx = (hash(i, 31) - 0.5) * 3.2;
    const vy = 1.6 + hash(i, 32) * 1.6;
    const ex = x + Math.round(vx * age);
    const ey = cy - Math.round(vy * age - 0.12 * age * age);
    if (ey < y + 2 && age < 20) rect(ctx, ex, ey, i < 3 ? 2 : 1, i < 3 ? 2 : 1, i < 3 ? '#3a3648' : i % 2 ? cols[1] : cols[2]);
  }
}

// bombfizzle: a crawling bomb that ran into a hole sputters out.
function drawBombFizzle(ctx, fx, x, y, age) {
  for (let i = 0; i < 4; i++) {
    const p = age / 14;
    const sx = x + Math.round((hash(i, 4) - 0.5) * 10);
    const sy = y - 4 - Math.round(p * (8 + i * 3));
    const r = Math.max(0, Math.round(3 - p * 3 + (i % 2)));
    if (r > 0) disc(ctx, sx, sy, r, i % 2 ? '#7a7488' : '#a8a2b8');
  }
  if (age < 6) {
    px(ctx, x, y - 4, '#ffd24a');
    px(ctx, x + 1, y - 5, '#ffffff');
  }
}

// ================================================================ registries

export const ENTITY_SPRITES = {
  watcher: { draw: drawWatcher },
  cinderkite: { draw: drawCinderkite },
  frostbit: { draw: drawFrostbit },
  sporeling: { draw: drawSporeling },
  scurrier: { draw: drawScurrier },
};

export const SPELL_SPRITES = {
  kitemark: { draw: drawKiteMark },
  kitemeteor: { draw: drawKiteMeteor },
  frostbreath: { draw: drawFrostBreath },
  sporecloud: { draw: drawSporeCloud },
  sporemound: { draw: drawSporeMound },
  scurrybomb: { draw: drawScurryBomb },
};

export const FX_SPRITES = {
  eyebeam: { duration: 16, draw: drawEyeBeam },
  kiteburst: { duration: 22, draw: drawKiteBurst },
  kiteburstv: { duration: 22, draw: drawKiteBurst },
  frostflash: { duration: 18, draw: drawFrostFlash },
  burrowdirt: { duration: 14, draw: drawBurrowDirt },
  bombfizzle: { duration: 14, draw: drawBombFizzle },
  scurryblast: { duration: 22, draw: drawScurryBlast },
};

void mix;
