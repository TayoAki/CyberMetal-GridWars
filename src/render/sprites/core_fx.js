// One-shot effects. Each entry is { duration, draw(ctx, fx, x, y, age) } with (x, y) the floor point of
// (fx.col, fx.row). Full-screen effects (flash, stage, wind, fan) ignore (x, y).
import { SCREEN_W, SCREEN_H, FIELD_Y, PANEL_W, PANEL_H } from '../layout.js';
import { OUTLINE, ramp, hash, withAlpha, shotEndX, sparkle, bolt, flameTongue, ellipseRing, crescent, streak, rect, px, line, ellipse, disc, ring, poly } from './core_util.js';
import { BUSTER_MUZZLE, CANNON_MUZZLE } from './core_player.js';
import { drawHeart } from './core_objects.js';

const BODY = 14; // a body's mid height above its floor point

// Muzzle of the shooter: AXIOM's buster/cannon for player shots, a generic one for enemies.
function muzzle(fx, x, y, kind = 'buster') {
  const d = fx.dir < 0 ? -1 : 1;
  if (fx.enemy) return { mx: x + d * 12, my: y - BODY, d };
  const m = kind === 'cannon' ? CANNON_MUZZLE : BUSTER_MUZZLE;
  return { mx: d > 0 ? x + m.x : x - 1 - m.x, my: y + m.y, d };
}

// Full-screen effects ignore (x, y): the engine emits them without a panel. When a caller does give a
// panel (dev contact sheets), draw a clipped thumbnail of the screen centred on (x, y) instead of
// painting over the whole canvas.
function screenFx(ctx, fx, x, y, fn) {
  if (fx.col === undefined && fx.row === undefined) {
    fn();
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 26, y - 44, 52, 46);
  ctx.clip();
  ctx.translate(Math.round(x - SCREEN_W / 2), Math.round(y - 116));
  fn();
  ctx.restore();
}

function seedOf(fx) {
  return (fx.col ?? 0) * 31 + (fx.row ?? 0) * 17 + (fx.frame ?? 0) * 7 + (fx.ox ?? 0);
}

// Layered puff: dark rim, mid body, light core offset up-left.
function puff(ctx, cx, cy, r, cols) {
  if (r <= 0) return;
  disc(ctx, cx, cy, r, cols[0]);
  if (r > 1) disc(ctx, cx - 1, cy - 1, r - 1, cols[1]);
  if (r > 3) disc(ctx, cx - 2, cy - 2, r - 3, cols[2]);
}

// A small solid dust puff that fades from light to dark as k grows.
function dust(ctx, x, y, r, k) {
  if (r <= 0) return;
  const c = k < 5 ? ['#8a8070', '#c8bca8', '#e8e0d0'] : k < 10 ? ['#6a6258', '#9a9080', '#b8ae9c'] : ['#4a443e', '#6a6258', '#827a6c'];
  disc(ctx, x, y, r, c[0]);
  if (r > 1) disc(ctx, x - 1, y - 1, r - 1, c[1]);
  if (r > 2) px(ctx, x - 1, y - 2, c[2]);
}

const FIRE_STAGES = [
  ['#ffd23f', '#fff6c8', '#ffffff'],
  ['#ff7a1f', '#ffb43f', '#fff27a'],
  ['#c8321a', '#ff6a1f', '#ffb43f'],
  ['#6a2a2a', '#a8381a', '#e0641f'],
  ['#2e2a3c', '#46405a', '#5e5876'],
];

function sparkBurst(ctx, x, y, r, n, color, core = '#ffffff', rot = 0) {
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    line(ctx, x + Math.cos(a) * (r * 0.4), y + Math.sin(a) * (r * 0.4), x + Math.cos(a) * r, y + Math.sin(a) * r, color);
  }
  px(ctx, x, y, core);
}

// Horizontal tracer from (x0, y) to (x1, y) drawn as a short streak at progress k (0..1).
function tracer(ctx, x0, x1, y, k, len, cols, thick = 2) {
  const hx = x0 + (x1 - x0) * Math.min(1, k);
  const d = Math.sign(x1 - x0) || 1;
  const tx = hx - d * len;
  const a = Math.min(hx, tx);
  const b = Math.max(hx, tx);
  rect(ctx, a, y - (thick >> 1), b - a + 1, thick, cols[1]);
  rect(ctx, d > 0 ? hx - Math.round(len / 2) : hx, y - (thick >> 1), Math.round(len / 2), 1, cols[0]);
  rect(ctx, hx - 1, y - 1, 3, 3, cols[1]);
  px(ctx, hx, y, cols[0]);
}

// ---------------------------------------------------------------- sword arcs

const SLASH_COLS = {
  null: ['#ffffff', '#c8f4ff', '#6ac8f0', '#2a6ab0'],
  fire: ['#ffffff', '#fff27a', '#ff8a2a', '#c42e18'],
  aqua: ['#ffffff', '#bff0ff', '#3a9cff', '#1f4fc0'],
  elec: ['#ffffff', '#fff6a0', '#ffd21f', '#b07410'],
  wood: ['#ffffff', '#d8ffb0', '#5fd23a', '#1c742a'],
};

// One crescent (thick in the middle), bulging toward d. age 0..9. thick = band width / rx.
function arc(ctx, cx, cy, rx, ry, d, age, cols, thick = 0.45) {
  if (age > 9) return;
  const grow = Math.min(1, (age + 1) / 3);
  const fade = age > 4 ? (age - 4) / 6 : 0;
  const w = Math.max(1, Math.round(rx * thick * (1 - fade * 0.8)));
  const span = (Math.PI / 2) * grow;
  const from = -span;
  const to = span;
  const ryy = ry * (0.4 + 0.6 * grow);
  crescent(ctx, cx, cy, rx, rx - w, ryy, d, cols[3], from, to);
  if (age < 8) crescent(ctx, cx + d, cy, rx - 1, rx - Math.max(1, w - 2), ryy * 0.92, d, cols[2], from, to);
  if (age < 6) crescent(ctx, cx + d, cy, rx - 1, rx - Math.max(1, Math.round(w / 2)), ryy * 0.8, d, cols[1], from, to);
  if (age < 4) crescent(ctx, cx + d * 2, cy, rx - 2, rx - 3, ryy * 0.62, d, cols[0], from, to);
}

// A horizontal swoosh along the row (long blades): an elliptic band under (cx, cy) that sweeps from the
// back end to the front end and tapers at both tips.
function swoosh(ctx, cx, cy, rx, ry, d, age, cols) {
  if (age > 9) return;
  const grow = Math.min(1, (age + 1) / 3);
  const fade = age > 4 ? (age - 4) / 6 : 0;
  const a0 = d > 0 ? Math.PI : 0;
  const a1 = d > 0 ? Math.PI * (1 - grow) : Math.PI * grow;
  const band = (ro, ri, color, shrink = 1) => {
    const pts = [];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * rx * shrink, cy + Math.sin(a) * ro]);
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * rx * shrink, cy + Math.sin(a) * ri]);
    }
    poly(ctx, pts, color);
  };
  const th = ry * 0.75 * (1 - fade * 0.75);
  band(ry, ry - th, cols[3]);
  if (age < 8) band(ry - 1, ry - th + 1, cols[2], 0.98);
  if (age < 6) band(ry - 1, ry - th * 0.5, cols[1], 0.96);
  if (age < 4) band(ry - 1, ry - 2, cols[0], 0.92);
}

// A straight diagonal blade streak (cross slash).
function bladeStreak(ctx, x0, y0, x1, y1, age, cols) {
  if (age > 9) return;
  const k = Math.min(1, (age + 1) / 3);
  const ex = x0 + (x1 - x0) * k;
  const ey = y0 + (y1 - y0) * k;
  const w = age > 5 ? 1 : 3;
  streak(ctx, x0, y0, ex, ey, w + 1, cols[3]);
  streak(ctx, x0, y0, ex, ey, w, cols[2]);
  if (age < 6) streak(ctx, x0, y0, ex, ey, Math.max(1, w - 1), cols[1]);
  if (age < 4) line(ctx, x0, y0, ex, ey, cols[0]);
}

function drawSlash(ctx, fx, x, y, age) {
  const d = fx.dir < 0 ? -1 : 1;
  const cols = SLASH_COLS[fx.element] ?? SLASH_COLS.null;
  const cy = y - 12;
  const P = PANEL_W;
  switch (fx.shape) {
    case 'sword':
      arc(ctx, x + d * (P - 18), cy - 1, 20, 19, d, age, cols, 0.5);
      break;
    case 'wide':
      arc(ctx, x + d * (P - 14), cy, 18, 34, d, age, cols);
      break;
    case 'long':
      // A flat sweep along the two panels in front.
      swoosh(ctx, x + d * (P * 1.5), cy - 10, P + 4, 16, d, age, cols);
      break;
    case 'hero':
      swoosh(ctx, x + d * (P * 2), cy - 10, P * 1.5 + 4, 17, d, age, cols);
      if (age < 3) rect(ctx, d > 0 ? x + 16 : x - 16 - (3 * P - 8), cy + 4, 3 * P - 8, 1, cols[0]);
      break;
    case 'big':
      // A huge crescent over the 2x3 block in front.
      arc(ctx, x + d * 20, cy, 58, 36, d, age, cols, 0.62);
      break;
    case 'cross': {
      const cx = x + d * P;
      bladeStreak(ctx, cx - d * 34, cy - 22, cx + d * 34, cy + 22, age, cols);
      bladeStreak(ctx, cx - d * 34, cy + 22, cx + d * 34, cy - 22, Math.max(0, age - 1), cols);
      if (age < 4) sparkle(ctx, cx, cy, 4 - age, cols[1], cols[0], true);
      break;
    }
    default:
      arc(ctx, x + d * (P - 12), cy, 14, 15, d, age, cols);
  }
}

// ---------------------------------------------------------------- effects

const NAVI_COLORS = {
  voltframe: ['#fff6a0', '#ffe23a'],
  feralis: ['#ffe0c0', '#ff9a4a'],
  tidecaller: ['#bfe9ff', '#3a9cff'],
  pyreclaw: ['#ffd0a0', '#ff5a2a'],
  ironclad: ['#e8ecf4', '#9aa4b8'],
  sabre: ['#f0e8ff', '#a88aff'],
  mender: ['#ffe0ee', '#ff74ae'],
  crusher: ['#fff0b0', '#ffb43a'],
  briarix: ['#e0ffc0', '#5fd23a'],
  zeroday: ['#ffc0f0', '#b03aff'],
};

const STAGE_TINT = {
  lava: '#ff6a1f',
  ice: '#bff0ff',
  grass: '#7ae07a',
  sand: '#e4c88a',
  metal: '#d8e0f0',
  holy: '#fff2b0',
  crackall: '#ffffff',
  breakall: '#9aa6c8',
  poisonall: '#c08aff',
};

export const FX_SPRITES = {
  // Buster: muzzle flash, a fast pellet to the target, a spark on a hit.
  buster: {
    duration: 10,
    draw(ctx, fx, x, y, age) {
      const { mx, my, d } = muzzle(fx, x, y);
      const ex = shotEndX(fx, x) - d * 6;
      if (age < 3) {
        sparkle(ctx, mx + d, my, 3 - age, '#fff27a', '#ffffff', age === 0);
        disc(ctx, mx, my, 2 - (age >> 1), '#ffffff');
      }
      if (age < 5) tracer(ctx, mx, ex, my, (age + 1) / 4, 10, ['#ffffff', '#ffe23a']);
      if (fx.hit && age >= 3) {
        const k = age - 3;
        sparkBurst(ctx, ex, my, 3 + k, 6, k < 3 ? '#fff27a' : '#ffb43f', '#ffffff', k * 0.4);
        if (k < 2) disc(ctx, ex, my, 2, '#ffffff');
      }
    },
  },

  // Charged buster: a fat plasma beam to the target, then a pink burst.
  chargeshot: {
    duration: 18,
    draw(ctx, fx, x, y, age) {
      const { mx, my, d } = muzzle(fx, x, y);
      const ex = shotEndX(fx, x) - d * 4;
      const reach = Math.min(1, (age + 1) / 3);
      const hx = mx + (ex - mx) * reach;
      const thick = age < 6 ? 7 - (age > 3 ? 2 : 0) : Math.max(0, 9 - age);
      if (thick > 0) {
        const a = Math.min(mx, hx);
        const w = Math.abs(hx - mx);
        const h = thick;
        rect(ctx, a, my - (h >> 1) - 1, w, h + 2, '#a03aff');
        rect(ctx, a, my - (h >> 1), w, h, '#ff6ad5');
        rect(ctx, a, my - (h >> 2), w, Math.max(1, h >> 1), '#ffd0f8');
        rect(ctx, a, my, w, 1, '#ffffff');
        for (let i = 0; i < 4; i++) {
          const sx = mx + d * ((age * 13 + i * 23) % Math.max(1, Math.abs(hx - mx)));
          px(ctx, sx, my - (h >> 1) - 2 - (i % 2), '#ffd0f8');
        }
      }
      if (age < 5) {
        disc(ctx, mx, my, 6 - age, '#ff6ad5');
        disc(ctx, mx, my, 4 - (age >> 1), '#ffffff');
      }
      if (age >= 2 && (fx.hit || fx.toCol !== undefined)) {
        const k = age - 2;
        if (k < 12) {
          ring(ctx, ex, my, 3 + k * 2, k < 6 ? '#ff8ae6' : '#a03aff');
          if (k < 7) disc(ctx, ex, my, Math.max(1, 6 - k), k < 3 ? '#ffffff' : '#ffd0f8');
          sparkBurst(ctx, ex, my, 6 + k * 2, 8, '#ffd0f8', '#ffffff', 0.2);
        }
      }
    },
  },

  // Cannon: muzzle blast, a shell streak and smoke, tinted by element.
  cannonshot: {
    duration: 16,
    draw(ctx, fx, x, y, age) {
      const { mx, my, d } = muzzle(fx, x, y, 'cannon');
      const ex = shotEndX(fx, x) - d * 6;
      const el = fx.element && fx.element !== 'null' ? fx.element : null;
      const cols = el ? ramp(el) : ['#ffffff', '#fff27a', '#ffb43f', '#c8641a'];
      if (age < 6) {
        const r = [6, 8, 7, 5, 3, 2][age];
        puff(ctx, mx + d * 3, my, r, [cols[3], cols[2], cols[1]]);
        if (age < 3) disc(ctx, mx + d * 3, my, r - 3, cols[0]);
        for (let i = 0; i < 3; i++) line(ctx, mx + d * (6 + age), my + (i - 1) * 3, mx + d * (10 + age * 3), my + (i - 1) * (4 + age), cols[1]);
      }
      if (age >= 4 && age < 13) {
        const k = age - 4;
        dust(ctx, mx + d * (2 - k), my - 3 - k, Math.max(1, 3 - (k >> 2)), k + 2);
        dust(ctx, mx + d * (6 - (k >> 1)), my - 1 - (k >> 1), Math.max(1, 2 - (k >> 2)), k + 4);
      }
      if (age < 6) {
        const k = (age + 1) / 4;
        tracer(ctx, mx, ex, my, k, 18, [cols[0], cols[1]], 3);
        const hx = mx + (ex - mx) * Math.min(1, k);
        disc(ctx, hx, my, 2, '#4a4f60');
        px(ctx, hx - d, my - 1, '#c8d0e0');
      }
    },
  },

  // AirShot: pale rings rippling down the row.
  airshot: {
    duration: 14,
    draw(ctx, fx, x, y, age) {
      const { mx, my, d } = muzzle(fx, x, y);
      const ex = shotEndX(fx, x);
      for (let i = 0; i < 3; i++) {
        const k = (age - i * 2) / 6;
        if (k < 0 || k > 1.3) continue;
        const rx = mx + (ex - mx) * Math.min(1, k);
        const ry = 6 + i * 2 + Math.round(k * 3);
        ellipseRing(ctx, rx - d, my, 3, ry, '#7ac0ff');
        ellipseRing(ctx, rx, my, 3, ry, '#ffffff');
        ellipseRing(ctx, rx + d, my, 2, ry - 2, '#d8eeff', -Math.PI / 2, Math.PI / 2);
      }
      if (age < 4) sparkle(ctx, mx, my, 3 - age, '#e8f4ff', '#ffffff');
    },
  },

  // Gun: a quick tinted tracer.
  gunshot: {
    duration: 9,
    draw(ctx, fx, x, y, age) {
      const { mx, my, d } = muzzle(fx, x, y);
      const ex = shotEndX(fx, x) - d * 6;
      const el = fx.element && fx.element !== 'null' ? fx.element : null;
      const cols = el ? ramp(el) : ['#ffffff', '#fff27a', '#ffb43f', '#c8641a'];
      if (age < 3) sparkle(ctx, mx + d, my, 3 - age, cols[1], '#ffffff', true);
      if (age < 5) {
        tracer(ctx, mx, ex, my, (age + 1) / 3, 14, [cols[0], cols[2]], 2);
        if (el === 'aqua') ring(ctx, mx + (ex - mx) * Math.min(1, (age + 1) / 3), my, 3, cols[1]);
      }
    },
  },

  // The classic chunky explosion: a white pop, a lumpy fireball that cools from yellow to red, flying
  // sparks, then a dark smoke cloud that rises and breaks up.
  explosion: {
    duration: 22,
    draw(ctx, fx, x, y, age) {
      const cx = x;
      const cy = y - 13;
      const seed = seedOf(fx);
      if (age === 0) {
        disc(ctx, cx, cy, 7, '#fff6c8');
        disc(ctx, cx, cy, 5, '#ffffff');
        return;
      }
      if (age === 1) {
        disc(ctx, cx, cy, 11, '#ffd23f');
        disc(ctx, cx, cy, 9, '#fff6c8');
        disc(ctx, cx, cy, 6, '#ffffff');
        return;
      }
      // Sparks and embers (behind the cloud).
      if (age < 15) {
        for (let i = 0; i < 9; i++) {
          const a = hash(seed, i, 9) * Math.PI * 2;
          const sp = 2.4 + hash(seed, i, 4) * 1.8;
          const k = age - 1;
          const sx = Math.round(cx + Math.cos(a) * sp * k);
          const sy = Math.round(cy + Math.sin(a) * sp * k * 0.75 + k * k * 0.16);
          const big = k < 6 && i % 3 === 0;
          rect(ctx, sx, sy, big ? 2 : 1, big ? 2 : 1, k < 4 ? '#fff6c8' : k < 8 ? '#ffd23f' : '#ff7a1f');
        }
      }
      // Fireball: seeded puffs merged into one lumpy cloud (all rims, then all bodies, then cores).
      const puffs = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 7) * Math.PI * 2 + hash(seed, i) * 0.9;
        const dist = i === 0 ? 0 : 4 + hash(seed, i, 1) * 4.5;
        const r0 = i === 0 ? 10 : 5 + hash(seed, i, 2) * 3.5;
        const delay = i === 0 ? 0 : Math.floor(hash(seed, i, 3) * 3);
        const k = age - 2 - delay;
        if (k < 0) continue;
        const life = 18 - delay;
        if (k >= life) continue;
        const p = k / life;
        const grow = Math.min(1, (k + 2) / 4);
        const r = Math.max(1, Math.round(r0 * grow * (1 - p * p * 0.65)));
        const spread = 1 + p * 1.3;
        puffs.push({
          x: Math.round(cx + Math.cos(a) * dist * spread),
          y: Math.round(cy + Math.sin(a) * dist * spread * 0.8 - p * p * 11),
          r,
          st: Math.min(4, Math.floor(p * 5.4 + (i ? 0.2 : 0))),
        });
      }
      const fire = puffs.filter((q) => q.st < 4);
      const smoke = puffs.filter((q) => q.st >= 4);
      // Smoke: soft translucent grey puffs that rise and thin out.
      if (smoke.length) {
        withAlpha(ctx, Math.max(0.2, 0.75 - (age - 14) * 0.08), () => {
          for (const q of smoke) disc(ctx, q.x, q.y, Math.max(1, q.r - 1), '#3a3648');
          for (const q of smoke) if (q.r > 3) disc(ctx, q.x - 1, q.y - 1, q.r - 3, '#5a5670');
        });
      }
      for (const q of fire) disc(ctx, q.x, q.y, q.r + 1, FIRE_STAGES[Math.min(3, q.st + 1)][0]);
      for (const q of fire) disc(ctx, q.x, q.y, q.r, FIRE_STAGES[q.st][0]);
      for (const q of fire) if (q.r > 2) disc(ctx, q.x - 1, q.y - 1, q.r - 2, FIRE_STAGES[q.st][1]);
      for (const q of fire) if (q.r > 4) disc(ctx, q.x - 2, q.y - 2, q.r - 4, FIRE_STAGES[q.st][2]);
    },
  },

  // A small spark: a twinkling star with chips flying off.
  burst: {
    duration: 10,
    draw(ctx, fx, x, y, age) {
      const cy = y - BODY;
      const r = [4, 7, 8, 7, 5, 4, 3, 2, 1, 1][age] ?? 1;
      poly(ctx, starPoints(x, cy, r, Math.max(1, r * 0.35), 4, age * 0.12), age < 5 ? '#ffd23f' : '#ff9a3a');
      if (r > 2) poly(ctx, starPoints(x, cy, r - 2, 1, 4, age * 0.12), '#fff6c8');
      px(ctx, x, cy, '#ffffff');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const d0 = 4 + age * 2.2;
        if (age > 1 && age < 9) rect(ctx, Math.round(x + Math.cos(a) * d0), Math.round(cy + Math.sin(a) * d0 * 0.8), age < 5 ? 2 : 1, age < 5 ? 2 : 1, age < 5 ? '#fff6c8' : '#ffb43f');
      }
    },
  },

  // Bubbles bloom and pop.
  bubble: {
    duration: 18,
    draw(ctx, fx, x, y, age) {
      const cy = y - BODY;
      const seed = seedOf(fx);
      for (let i = 0; i < 6; i++) {
        const delay = Math.floor(hash(seed, i) * 5);
        const k = age - delay;
        if (k < 0) continue;
        const ox = Math.round((hash(seed, i, 1) - 0.5) * 24);
        const oy = Math.round((hash(seed, i, 2) - 0.5) * 16) - k;
        const r = 2 + Math.floor(hash(seed, i, 3) * 3);
        if (k < 9) {
          ring(ctx, x + ox, cy + oy, r, '#8fe2ff');
          px(ctx, x + ox - 1, cy + oy - r + 1, '#ffffff');
          if (r > 2) px(ctx, x + ox - r + 1, cy + oy - 1, '#effcff');
        } else if (k < 13) {
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) px(ctx, x + ox + dx * (r + k - 8), cy + oy + dy * (r + k - 8), '#bfe9ff');
        }
      }
      if (age < 5) {
        ring(ctx, x, cy, 4 + age * 2, age < 3 ? '#ffffff' : '#8fe2ff');
        if (age < 3) disc(ctx, x, cy, 3 - age, '#e8fbff');
      }
    },
  },

  // Fire burst on a panel.
  flame: {
    duration: 22,
    draw(ctx, fx, x, y, age) {
      const cols = ['#fff6c8', '#ffd23f', '#ff7a1f', '#c42e18'];
      const k = age < 4 ? (age + 1) / 4 : Math.max(0, 1 - (age - 10) / 12);
      if (k <= 0) return;
      withAlpha(ctx, 0.4 * k, () => ellipse(ctx, x, y - 3, 16, 5, '#ff7a1f'));
      const tongues = [[-9, 14, 4], [0, 24, 6], [9, 16, 4], [-4, 10, 3], [5, 11, 3]];
      tongues.forEach(([ox, h, w], i) => {
        const hh = Math.round(h * k + ((age + i * 3) % 4));
        if (hh > 2) flameTongue(ctx, x + ox, y, w, hh, age, i, cols);
      });
      for (let i = 0; i < 4; i++) {
        const ph = age * 1.5 + i * 4;
        const ex = x - 8 + i * 5 + Math.round(Math.sin(ph) * 2);
        const ey = y - 14 - ph;
        if (ey > y - 40) px(ctx, ex, ey, i % 2 ? '#ffd23f' : '#ff7a1f');
      }
    },
  },

  // Ice: a cluster of crystals juts up from the panel, then shatters into glitter.
  ice: {
    duration: 20,
    draw(ctx, fx, x, y, age) {
      const crystals = [[-8, 12, 3, 1], [-2, 20, 4, 0], [5, 15, 3, 1], [10, 9, 3, 2], [-12, 7, 2, 2]];
      if (age < 13) {
        for (const [ox, h0, w, delay] of crystals) {
          const k = age - delay;
          if (k < 0) continue;
          const h = Math.round(h0 * Math.min(1, (k + 1) / 3));
          const bx = x + ox;
          poly(ctx, [[bx - w - 1, y + 1], [bx - w - 1, y - h + w], [bx, y - h - 1], [bx + w + 1, y - h + w], [bx + w + 1, y + 1]], '#123a66');
          poly(ctx, [[bx - w, y], [bx - w, y - h + w], [bx, y - h], [bx + w, y - h + w], [bx + w, y]], '#6ac8f0');
          poly(ctx, [[bx - w, y], [bx - w, y - h + w], [bx, y - h], [bx, y]], '#bff0ff');
          line(ctx, bx - w + 1, y - 2, bx - w + 1, y - h + w + 1, '#ffffff');
        }
        if (age > 5 && age % 3 === 0) sparkle(ctx, x - 1, y - 23, 2, '#e8fbff', '#ffffff', true);
        if (age < 4) ellipseRing(ctx, x, y - 1, 10 + age * 3, 3 + age, '#e8fbff');
      } else {
        const k = age - 13;
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI * (0.1 + 0.8 * (i / 9));
          const sx = x + Math.cos(a) * (4 + k * 3);
          const sy = y - 8 + Math.sin(a) * (6 + k * 2.5) + k * k * 0.35;
          rect(ctx, Math.round(sx), Math.round(sy), i % 3 ? 1 : 2, i % 3 ? 1 : 2, i % 2 ? '#bff0ff' : '#ffffff');
        }
      }
    },
  },

  slash: { duration: 11, draw: drawSlash },

  // Punch impact: a white star with speed rays.
  punch: {
    duration: 12,
    draw(ctx, fx, x, y, age) {
      const d = fx.dir < 0 ? -1 : 1;
      const cx = x - d * 6;
      const cy = y - 18;
      if (age < 3) {
        poly(ctx, starPoints(cx, cy, 11 + age * 2, 5, 8, age * 0.2), '#fff27a');
        poly(ctx, starPoints(cx, cy, 8 + age, 3, 8, age * 0.2), '#ffffff');
      } else if (age < 8) {
        ring(ctx, cx, cy, 6 + (age - 3) * 3, age < 6 ? '#ffffff' : '#fff27a');
        sparkBurst(ctx, cx, cy, 10 + age, 8, '#fff6c8', '#ffffff', 0.4);
      }
      for (let i = 0; i < 3; i++) {
        const yy = cy - 6 + i * 6;
        const len = Math.max(0, 12 - age * 2);
        if (len > 0) rect(ctx, d > 0 ? cx - 16 - len : cx + 16, yy, len, 1, '#ffffff');
      }
    },
  },

  // Ground quake: dust clouds, flying chips and a flash crack.
  quake: {
    duration: 20,
    draw(ctx, fx, x, y, age) {
      const seed = seedOf(fx);
      if (age < 4) {
        rect(ctx, x - 18 + age, y - 9, 36 - age * 2, 1, '#ffffff');
        line(ctx, x - 10, y - 6, x - 2, y - 11, '#fff6c8');
        line(ctx, x - 2, y - 11, x + 4, y - 5, '#fff6c8');
        line(ctx, x + 4, y - 5, x + 12, y - 10, '#fff6c8');
      }
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * (0.15 + 0.7 * hash(seed, i));
        const sp = 1.6 + hash(seed, i, 2) * 1.8;
        const k = age;
        const sx = x + Math.cos(a) * sp * k * 1.6;
        const sy = y - 6 + Math.sin(a) * sp * k * 1.6 + k * k * 0.22;
        if (sy > y + 2) continue;
        rect(ctx, Math.round(sx), Math.round(sy), i % 3 ? 2 : 3, 2, i % 2 ? '#8a7a68' : '#b8a888');
      }
      for (const s of [-1, 1]) {
        for (let j = 0; j < 2; j++) {
          const k = age - j * 2;
          if (k < 0 || k > 15) continue;
          const px0 = Math.round(x + s * (7 + k * 1.5 + j * 5));
          const py0 = Math.round(y - 3 - k * 0.45);
          const r = Math.max(1, Math.round(5 - k * 0.3));
          dust(ctx, px0, py0, r, k);
        }
      }
    },
  },

  // Guard: the shield flares and repels.
  guard: {
    duration: 12,
    draw(ctx, fx, x, y, age) {
      const d = fx.dir !== undefined ? (fx.dir < 0 ? -1 : 1) : (fx.col ?? 0) < 3 ? 1 : -1;
      const gx = x + d * 15;
      const cy = y - 26;
      if (age < 9) {
        const s = age < 3 ? 1 : 1 - (age - 3) / 8;
        const hw = Math.round(5 * s) + 1;
        const hh = Math.round(11 * s) + 1;
        const hex = (w, h) => [[gx - w, cy - h + 3], [gx, cy - h], [gx + w, cy - h + 3], [gx + w, cy + h - 3], [gx, cy + h], [gx - w, cy + h - 3]];
        poly(ctx, hex(hw + 1, hh + 1), age < 4 ? '#ffffff' : '#86f3ff');
        poly(ctx, hex(hw, hh), age < 2 ? '#ffffff' : '#bff4ff');
        if (hw > 2) poly(ctx, hex(hw - 2, hh - 3), '#ffffff');
      }
      if (age < 6) sparkle(ctx, gx + d * 7, cy - 6, 5 - age, '#ffffff', '#ffffff', true);
      if (age >= 2 && age < 8) ellipseRing(ctx, gx, cy, 3 + age, 9 + age * 2, age < 5 ? '#86f3ff' : '#27c3ee');
    },
  },

  // Barrier: a bubble swells around the body.
  barrierup: {
    duration: 18,
    draw(ctx, fx, x, y, age) {
      const cy = y - 14;
      const k = Math.min(1, (age + 1) / 8);
      const r = Math.round(4 + 12 * k);
      ring(ctx, x, cy, r, age < 12 ? '#ffffff' : '#9ae8ff');
      if (age < 6) ring(ctx, x, cy, r + 2, '#5ab8ff');
      if (age < 14) ring(ctx, x, cy, Math.max(1, r - 2), '#5ab8ff');
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + age * 0.12;
        const hx = x + Math.cos(a) * (r - 4);
        const hy = cy + Math.sin(a) * (r - 4);
        if (age > 4 && age < 16) px(ctx, hx, hy, '#e8fbff');
      }
      if (age > 8 && age < 16) sparkle(ctx, x - 6, cy - 8, 1, '#ffffff', '#ffffff');
    },
  },
  barrierhit: {
    duration: 10,
    draw(ctx, fx, x, y, age) {
      const cy = y - 14;
      ring(ctx, x, cy, 16, age % 2 ? '#ffffff' : '#9ae8ff');
      if (age < 4) ring(ctx, x, cy, 15, '#e8fbff');
      if (age < 3) sparkle(ctx, x + 9, cy - 9, 3 - age, '#ffffff', '#ffffff', true);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + 0.5;
        const r0 = 9 + age;
        line(ctx, x + Math.cos(a) * r0, cy + Math.sin(a) * r0, x + Math.cos(a) * (r0 + 3), cy + Math.sin(a) * (r0 + 3), '#e8fbff');
      }
    },
  },
  barrierbreak: {
    duration: 18,
    draw(ctx, fx, x, y, age) {
      const cy = y - 14;
      if (age < 3) ring(ctx, x, cy, 16, '#ffffff');
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12 + 0.2;
        const r = 14 + age * 2.2;
        const sx = x + Math.cos(a) * r;
        const sy = cy + Math.sin(a) * r + age * age * 0.06;
        const c = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#9ae8ff' : '#5ab8ff';
        if (age < 14 || i % 2) poly(ctx, [[sx, sy - 2], [sx + 2, sy], [sx, sy + 2], [sx - 1, sy]], c);
      }
    },
  },

  // Aura: pink swirl repels a weak hit; aurabreak scatters it.
  aurablock: {
    duration: 14,
    draw(ctx, fx, x, y, age) {
      const cy = y - 16;
      for (let i = 0; i < 10; i++) {
        const a = age * 0.45 + (i * Math.PI * 2) / 10;
        const r = 16 - age * 0.5;
        rect(ctx, Math.round(x + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 1.1), 2, 2, i % 2 ? '#ff7ae0' : '#ffd0f8');
      }
      if (age < 7) {
        ring(ctx, x, cy, 13 + (age >> 1), '#ffffff');
        ring(ctx, x, cy, 15 + (age >> 1), '#ff7ae0');
        if (age < 3) sparkle(ctx, x + 8, cy - 8, 3 - age, '#ffd0f8', '#ffffff', true);
      }
    },
  },
  aurabreak: {
    duration: 20,
    draw(ctx, fx, x, y, age) {
      const cy = y - 16;
      if (age < 4) {
        disc(ctx, x, cy, 14 + age, '#ffd0f8');
        disc(ctx, x, cy, 10 + age, '#ffffff');
        return;
      }
      for (let i = 0; i < 14; i++) {
        const a = (i * Math.PI * 2) / 14;
        const r = 12 + (age - 4) * 2.4;
        const sx = x + Math.cos(a) * r;
        const sy = cy + Math.sin(a) * r * 1.1;
        sparkle(ctx, sx, sy, age < 12 ? 1 : 0, i % 2 ? '#ff7ae0' : '#ffd0f8', '#ffffff');
      }
      if (age < 12) ring(ctx, x, cy, 14 + (age - 4) * 3, '#ff7ae0');
    },
  },

  // Recover: green sparkles and plus signs rise around the body.
  recover: {
    duration: 34,
    draw(ctx, fx, x, y, age) {
      const seed = seedOf(fx);
      if (age < 14) ellipseRing(ctx, x, y - 2, 6 + age, 2 + (age >> 2), age < 8 ? '#b8ffc8' : '#5fe39a');
      for (let j = 0; j < 2; j++) {
        const k = age - j * 8;
        if (k < 0 || k > 18) continue;
        const ry = y - 2 - k * 2.2;
        ellipseRing(ctx, x, ry, 13 - (k >> 2), 3, k < 10 ? '#b8ffc8' : '#5fe39a');
      }
      for (let i = 0; i < 9; i++) {
        const delay = Math.floor(hash(seed, i) * 14);
        const a = age - delay;
        if (a < 0 || a > 20) continue;
        const sx = x + Math.round((hash(seed, i, 1) - 0.5) * 26);
        const sy = y - 4 - a * 2;
        const c = a < 12 ? '#b8ffc8' : '#5fe39a';
        if (i % 3 === 0) {
          rect(ctx, sx - 2, sy, 5, 1, c);
          rect(ctx, sx, sy - 2, 1, 5, c);
          px(ctx, sx, sy, '#ffffff');
        } else sparkle(ctx, sx, sy, a < 10 ? 1 : 0, c, '#ffffff');
      }
    },
  },

  // Warp: a light column with scanlines.
  warp: {
    duration: 14,
    draw(ctx, fx, x, y, age) {
      const w = Math.max(0, 7 - age);
      const top = y - 46;
      if (w > 0) {
        withAlpha(ctx, 0.75, () => rect(ctx, x - w, top, w * 2, 48, '#9af0ff'));
        rect(ctx, x - Math.max(1, w >> 1), top - 4, Math.max(2, w), 52, '#ffffff');
      }
      for (let i = 0; i < 6; i++) {
        const yy = y - 4 - ((age * 5 + i * 8) % 44);
        const hw = 10 - (age >> 1);
        if (hw > 0) rect(ctx, x - hw, yy, hw * 2, 1, i % 2 ? '#e8fbff' : '#5fd8ff');
      }
      if (age > 3 && age < 12) sparkle(ctx, x + ((age * 7) % 13) - 6, y - 10 - ((age * 11) % 30), 1, '#ffffff', '#ffffff');
    },
  },

  // Stun: electric zigzags crackle over the body.
  stun: {
    duration: 24,
    draw(ctx, fx, x, y, age) {
      const cy = y - 20;
      for (let i = 0; i < 4; i++) {
        if ((age + i) % 3 === 0) continue;
        const a = (i * Math.PI) / 2 + age * 0.3;
        const x0 = x + Math.cos(a) * 6;
        const y0 = cy + Math.sin(a) * 8;
        bolt(ctx, x0, y0, x0 + Math.cos(a) * 9, y0 + Math.sin(a) * 9, 3, 3, i % 2 ? '#ffe23a' : '#ffffff', age * 3 + i);
      }
      if (age < 5) ring(ctx, x, cy, 8 + age * 2, age < 3 ? '#ffffff' : '#ffe23a');
    },
  },

  // Summon: a beam of light materialises the called navi.
  summon: {
    duration: 26,
    draw(ctx, fx, x, y, age) {
      const [c0, c1] = NAVI_COLORS[fx.navi] ?? ['#e8fbff', '#5fd8ff'];
      const w = age < 4 ? 2 + age * 3 : Math.max(0, 14 - (age - 4));
      // The beam reaches past the top of the screen from any row (floor y <= 140), without assuming y = 0.
      const top = y - 150;
      if (w > 0) {
        withAlpha(ctx, 0.7, () => rect(ctx, x - w, top, w * 2, y - top, c1));
        rect(ctx, x - Math.max(1, w >> 1), top, Math.max(2, w), y - top, c0);
        rect(ctx, x - 1, top, 2, y - top, '#ffffff');
      }
      if (age < 18) {
        ellipseRing(ctx, x, y - 1, 8 + age, 3 + (age >> 2), c1);
        ellipseRing(ctx, x, y - 1, 4 + (age >> 1), 1 + (age >> 3), c0);
      }
      for (let i = 0; i < 5; i++) {
        const yy = y - 6 - ((age * 4 + i * 11) % 50);
        sparkle(ctx, x + ((i * 13 + age * 3) % 25) - 12, yy, i % 2, c0, '#ffffff');
      }
    },
  },

  // PanlGrab / AreaGrab: a red panel tile drops onto the target panel, flashes, then melts into the
  // real panel (translucent once landed so whoever stands there stays visible).
  panelfall: {
    duration: 20,
    draw(ctx, fx, x, y, age) {
      const px0 = x - PANEL_W / 2;
      const land = 11;
      const k = Math.min(1, age / land);
      const drop = Math.round((1 - k * k) * 80);
      const top = y - 18 - drop;
      const a = age < land ? 0.9 : Math.max(0, 0.65 - (age - land) * 0.08);
      if (age < land) withAlpha(ctx, 0.25 + 0.35 * k, () => ellipse(ctx, x, y - 8, Math.round(10 + 8 * k), Math.round(3 + 4 * k), '#000000'));
      withAlpha(ctx, a, () => {
        rect(ctx, px0, top, PANEL_W, PANEL_H, '#4a0c10');
        rect(ctx, px0 + 1, top + 1, PANEL_W - 2, 17, '#d84a4a');
        rect(ctx, px0 + 4, top + 3, PANEL_W - 8, 12, '#ee7070');
        rect(ctx, px0 + 1, top + 1, PANEL_W - 2, 1, '#ffaaa4');
        rect(ctx, px0 + 1, top + 18, PANEL_W - 2, 5, '#9a2626');
      });
      if (age >= land && age < land + 4) withAlpha(ctx, 0.8 - (age - land) * 0.2, () => rect(ctx, px0 + 1, top + 1, PANEL_W - 2, 17, '#ffffff'));
      if (age >= land && age < land + 6) {
        const kk = age - land;
        for (const s of [-1, 1]) dust(ctx, x + s * (18 + kk * 2), y + 2 - kk, 3 - (kk >> 1), kk);
      }
      if (age < land) for (let i = 0; i < 3; i++) rect(ctx, px0 + 8 + i * 12, top - 8 - (age % 3) * 2, 1, 6, '#ffaaa4');
    },
  },

  // Lance: wooden spears burst up out of the panel.
  lance: {
    duration: 18,
    draw(ctx, fx, x, y, age) {
      const spears = [[-10, 0], [0, 2], [10, 1]];
      spears.forEach(([ox, delay], i) => {
        const k = age - delay;
        if (k < 0) return;
        const up = k < 4 ? k / 4 : k < 11 ? 1 : Math.max(0, 1 - (k - 11) / 5);
        const h = Math.round(30 * up) + (i === 1 ? 6 : 0) * up;
        if (h < 2) return;
        const sx = x + ox;
        const top = y - h;
        rect(ctx, sx - 1, top + 6, 3, h - 6, '#8a5a2a');
        rect(ctx, sx - 1, top + 6, 1, h - 6, '#c89050');
        poly(ctx, [[sx - 3, top + 7], [sx, top - 2], [sx + 3, top + 7], [sx, top + 9]], '#1c742a');
        poly(ctx, [[sx - 2, top + 6], [sx, top], [sx + 2, top + 6], [sx, top + 8]], '#a8f07a');
        line(ctx, sx - 1, top + 5, sx, top + 1, '#f0ffd8');
        rect(ctx, sx - 2, top + 9, 5, 1, '#5fd23a');
      });
      if (age < 8) {
        for (const s of [-1, 1]) dust(ctx, x + s * (12 + age), y - 2, 3 - (age >> 2), age);
        rect(ctx, x - 14, y - 1, 28, 1, '#5a4028');
      }
    },
  },

  // Claw: three raking slashes across the panel.
  claw: {
    duration: 12,
    draw(ctx, fx, x, y, age) {
      const d = fx.dir < 0 ? -1 : 1;
      for (let i = 0; i < 3; i++) {
        const k = age - i;
        if (k < 0 || k > 8) continue;
        const ox = (i - 1) * 7;
        const x0 = x - d * 14 + ox;
        const y0 = y - 30;
        const x1 = x + d * 10 + ox;
        const y1 = y + 2;
        const g = Math.min(1, (k + 1) / 2);
        const ex = x0 + (x1 - x0) * g;
        const ey = y0 + (y1 - y0) * g;
        const w = k < 5 ? 2 : 1;
        streak(ctx, x0, y0, ex, ey, w + 1, '#c42e18');
        streak(ctx, x0, y0, ex, ey, w, k < 4 ? '#ffffff' : '#ffb0a0');
      }
    },
  },

  // Dark burst: ZeroDay's void storm.
  darkburst: {
    duration: 18,
    draw(ctx, fx, x, y, age) {
      const cy = y - BODY;
      const seed = seedOf(fx);
      const r = age < 4 ? 4 + age * 3 : Math.max(0, 16 - (age - 4));
      if (r > 0) {
        disc(ctx, x, cy, r + 1, '#ff3ae0');
        disc(ctx, x, cy, r, '#1a0828');
        if (r > 4) disc(ctx, x - 2, cy - 2, r - 4, '#3a1258');
      }
      for (let i = 0; i < 8; i++) {
        const a = hash(seed, i) * Math.PI * 2;
        const rr = 6 + age * 1.8;
        const sx = x + Math.cos(a) * rr;
        const sy = cy + Math.sin(a) * rr;
        poly(ctx, [[sx, sy - 2], [sx + 2, sy], [sx, sy + 2], [sx - 2, sy]], i % 2 ? '#b03aff' : '#ff3ae0');
      }
      if (age < 10 && age % 3 === 0) bolt(ctx, x - 12, cy - 10, x + 12, cy + 8, 4, 4, '#ff9af0', seed + age);
    },
  },

  // Full-screen white flash (the battle view also flashes; this adds a quick bright pop and streaks).
  flash: {
    duration: 24,
    draw: (ctx, fx, x, y, age) => screenFx(ctx, fx, x, y, () => drawFlash(ctx, age)),
  },
  // Stage change: a shimmer sweeps across the whole field, tinted by the new floor.
  stage: {
    duration: 30,
    draw: (ctx, fx, x, y, age) => screenFx(ctx, fx, x, y, () => drawStage(ctx, fx, age)),
  },

  // Wind / Fan: gust streaks cross the field in dir.
  wind: { duration: 30, draw: (ctx, fx, x, y, age) => screenFx(ctx, fx, x, y, () => gust(ctx, fx, age, false)) },
  fan: { duration: 30, draw: (ctx, fx, x, y, age) => screenFx(ctx, fx, x, y, () => gust(ctx, fx, age, true)) },

  // Geyser: a column of water erupts from the panel.
  geyser: {
    duration: 26,
    draw(ctx, fx, x, y, age) {
      const up = age < 4 ? (age + 1) / 4 : age < 16 ? 1 : Math.max(0, 1 - (age - 16) / 10);
      const h = Math.round(58 * up);
      if (h > 2) {
        const top = y - h;
        const wob = (age >> 1) % 2;
        rect(ctx, x - 8 - wob, top + 4, 16 + wob * 2, h - 4, '#1f56c8');
        rect(ctx, x - 6, top + 2, 12, h - 2, '#3a9cff');
        rect(ctx, x - 3, top + 2, 5, h - 2, '#8fe2ff');
        rect(ctx, x - 1, top + 2, 1, h - 2, '#ffffff');
        for (let i = 0; i < 5; i++) disc(ctx, x - 8 + i * 4, top + 2 + ((i + age) % 2), 3, i % 2 ? '#ffffff' : '#bfe9ff');
      }
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i - 3.5) * 0.35;
        const k = (age + i * 2) % 14;
        const sx = x + Math.cos(a) * k * 2.2;
        const sy = y - h + Math.sin(a) * k * 1.8 + k * k * 0.18;
        if (sy < y) rect(ctx, Math.round(sx), Math.round(sy), 2, 2, i % 2 ? '#bfe9ff' : '#ffffff');
      }
      withAlpha(ctx, 0.5, () => ellipse(ctx, x, y - 2, 16, 4, '#8fe2ff'));
    },
  },

  // Rock: chunks of rock and dust thrown up.
  rock: {
    duration: 18,
    draw(ctx, fx, x, y, age) {
      const seed = seedOf(fx);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * (0.1 + 0.8 * hash(seed, i));
        const sp = 1.8 + hash(seed, i, 1) * 1.8;
        const sx = x + Math.cos(a) * sp * age * 1.4;
        const sy = y - 8 + Math.sin(a) * sp * age * 1.4 + age * age * 0.2;
        if (sy > y + 1) continue;
        const r = i % 3 === 0 ? 3 : 2;
        disc(ctx, Math.round(sx), Math.round(sy), r, OUTLINE);
        disc(ctx, Math.round(sx), Math.round(sy), r - 1, i % 2 ? '#8a92ac' : '#6a7290');
        px(ctx, Math.round(sx) - 1, Math.round(sy) - 1, '#c8d0e0');
      }
      if (age < 12) for (const s of [-1, 1]) dust(ctx, Math.round(x + s * (6 + age * 1.5)), y - 3, 4 - (age >> 2), age);
    },
  },
};

function drawStage(ctx, fx, age) {
  const tint = STAGE_TINT[fx.panel] ?? '#ffffff';
  const sweep = (age / 22) * 8 - 1; // column of the sweep front
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const dist = sweep - c - r * 0.5;
      if (dist < 0 || dist > 2.5) continue;
      const a = dist < 0.6 ? dist / 0.6 : 1 - (dist - 0.6) / 1.9;
      const px0 = c * PANEL_W;
      const py0 = FIELD_Y + r * PANEL_H;
      withAlpha(ctx, 0.55 * a, () => rect(ctx, px0 + 1, py0 + 1, PANEL_W - 2, 17, tint));
      if (dist < 0.8) rect(ctx, px0 + 1, py0 + 1, PANEL_W - 2, 1, '#ffffff');
    }
  }
  if (age < 26) {
    for (let i = 0; i < 6; i++) {
      const sx = ((i * 41 + age * 9) % SCREEN_W) | 0;
      const sy = FIELD_Y + ((i * 23 + age * 3) % 70);
      sparkle(ctx, sx, sy, (age + i) % 4 < 2 ? 1 : 2, tint, '#ffffff');
    }
  }
}

function drawFlash(ctx, age) {
  const a = Math.max(0, 1 - age / 24);
  withAlpha(ctx, a * a * 0.7, () => rect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#ffffff'));
  if (age < 10) {
    for (let i = 0; i < 5; i++) {
      const yy = 20 + ((i * 37 + age * 13) % 120);
      withAlpha(ctx, 0.6 * (1 - age / 10), () => rect(ctx, 0, yy, SCREEN_W, 1, '#fffbe0'));
    }
  }
}

function starPoints(x, y, r1, r2, n, rot) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return pts;
}

// Wind streaks cross the field; Fan streaks rush toward the user's side with little swirls.
function gust(ctx, fx, age, pull) {
  const d = fx.dir < 0 ? -1 : 1;
  const a = age < 4 ? (age + 1) / 4 : age > 22 ? Math.max(0, 1 - (age - 22) / 8) : 1;
  withAlpha(ctx, a, () => {
    for (let i = 0; i < 20; i++) {
      const yy = FIELD_Y - 30 + ((i * 37) % 104);
      const speed = 10 + (i % 4) * 4;
      const len = 18 + (i % 3) * 14;
      const head = ((age * speed + i * 53) % (SCREEN_W + len + 40)) - 20;
      const hx = d > 0 ? head : SCREEN_W - head;
      const tx = hx - d * len;
      rect(ctx, Math.min(hx, tx), yy, len, 1, i % 3 ? '#e8f4ff' : '#9ad0ff');
      if (i % 3 === 0) rect(ctx, Math.min(hx, tx) + (d > 0 ? len >> 1 : 0), yy + 1, len >> 1, 1, '#bfe4ff');
      if (i % 4 === 0) rect(ctx, d > 0 ? hx - 5 : hx, yy - 1, 5, 1, '#ffffff');
      if (pull && i % 3 === 0) ellipseRing(ctx, hx + d * 4, yy - 3, 3, 3, '#bfe4ff', 0, Math.PI * 1.3);
    }
  });
}

export { drawSlash, drawHeart };
