// Placed objects (RockCube, BlkBomb, TimeBomb, DoomBomb) and the summon-only helper navis drawn at the
// player's panel during Navi chips (Mender, Crusher).
import { sprite, recolor } from '../pixel.js';
import { drawText } from '../font.js';
import { OUTLINE, compose, solidPalette, withAlpha, sparkle, flameTongue, hash, rect, px, line, disc, ring, poly } from './core_util.js';

// ---------------------------------------------------------------- RockCube: a cracked data-cube rock

const ROCK_PAL = Object.freeze({
  W: '#eef1fa',
  a: '#bcc4dc',
  b: '#959fbe',
  c: '#727c9e',
  d: '#525a7c',
  e: '#373d5a',
});

const ROCK = [
  '.....aaaaaaaaaaab.......', // 0
  '...aaWWaaaaaaaaaabb.....',
  '..aWWaaaaaaaaaaaaaabbd..',
  '.aaWaaaaaaaaaaaaaaaabdd.',
  'aaaaaaaaaaaaaaaaaaaabddd',
  'bbbbbbbbbbbbbbbbbbbbcddd', // 5 front top edge
  'bcccccccccccccccccccdddd',
  'bcccccccccccccccccccdddd',
  'bccccccccccccccccccddddd',
  'bccccccccccccccccccddddd',
  'bccccccccccccccccccddddd', // 10
  'bccccccccccccccccccddddd',
  'bccccccccccccccccccdddde',
  'bccccccccccccccccccdddde',
  'bccccccccccccccccccdddee',
  'bccccccccccccccccccdddee', // 15
  'bccccccccccccccccccddeee',
  'cccccccccccccccccccddee.',
  'cdddddddddddddddddddee..',
  '.dddddddddddddddddddd...', // 19
];

// Front-face circuit veins (relative to the sprite's top-left): [x0, y0, x1, y1] segments.
const VEINS = [
  [2, 9, 7, 9],
  [7, 9, 7, 14],
  [7, 14, 13, 14],
  [13, 14, 13, 11],
  [13, 11, 17, 11],
  [4, 16, 9, 16],
  [10, 7, 10, 9],
];
const VEIN_NODES = [[2, 9], [17, 11], [4, 16], [10, 7], [13, 14]];
const CRACKS = [
  // always
  [[11, 5], [12, 7], [11, 9], [12, 11]],
  [[20, 7], [21, 9], [20, 11]],
  // below 2/3 hp
  [[3, 6], [5, 8], [4, 10], [6, 12]],
  [[16, 15], [14, 17], [15, 18]],
  // below 1/3 hp
  [[8, 2], [10, 4], [12, 5]],
  [[1, 13], [3, 15], [2, 17]],
  [[17, 6], [15, 8], [16, 10], [14, 12]],
];

export const ROCKCUBE_SPRITE = {
  draw(ctx, e, x, y, t) {
    const w = ROCK[0].length;
    const h = ROCK.length;
    sprite(ctx, ROCK, ROCK_PAL, x, y, { anchor: 'feet', outline: OUTLINE });
    const ox = Math.round(x - w / 2);
    const oy = Math.round(y - h);
    // Speckles on the faces.
    for (let i = 0; i < 14; i++) {
      const sx = 1 + Math.floor(hash(i, 3) * 18);
      const sy = 7 + Math.floor(hash(i, 7) * 11);
      px(ctx, ox + sx, oy + sy, i % 3 ? '#7f89aa' : '#626c8e');
    }
    px(ctx, ox + 6, oy + 2, '#d8deee');
    px(ctx, ox + 14, oy + 3, '#d8deee');
    // Data veins pulse along their length.
    const pulse = (t >> 2) % 8;
    VEINS.forEach(([x0, y0, x1, y1], i) => {
      const lit = (i + pulse) % 4 === 0;
      line(ctx, ox + x0, oy + y0, ox + x1, oy + y1, lit ? '#9af6ff' : '#2a8fb8');
    });
    for (const [nx, ny] of VEIN_NODES) {
      rect(ctx, ox + nx - 1, oy + ny - 1, 2, 2, '#1c5f84');
      px(ctx, ox + nx, oy + ny, (t >> 3) % 2 ? '#eaffff' : '#5fe0ff');
    }
    // Cracks deepen with damage.
    const k = e.maxHp ? e.hp / e.maxHp : 1;
    const n = k > 0.66 ? 2 : k > 0.33 ? 4 : CRACKS.length;
    for (let i = 0; i < n; i++) {
      const pts = CRACKS[i];
      for (let j = 0; j + 1 < pts.length; j++) line(ctx, ox + pts[j][0], oy + pts[j][1], ox + pts[j + 1][0], oy + pts[j + 1][1], '#191c2e');
      const [lx, ly] = pts[0];
      px(ctx, ox + lx + 1, oy + ly, '#a8b2cc');
    }
  },
};

// ---------------------------------------------------------------- bombs

const BOMB_BODY = [
  '.......cccc.......', // 0 cap
  '......cbaabc......',
  '.....dccccccd.....',
  '....nnnmmmmmnq....', // 3
  '...nWWnmmmmmmmq...',
  '..nWWnmmmmmmmmmq..',
  '..nWnmmmmmmmmmmq..',
  '.nnnmmmmmmmmmmmqq.',
  '.nnmmmmmmmmmmmmqq.',
  '.nmmmmmmmmmmmmmqq.',
  '.nmmmmmmmmmmmmqqq.', // 10
  '.mmmmmmmmmmmmmqqq.',
  '.mmmmmmmmmmmmqqqq.',
  '..mmmmmmmmmmqqqq..',
  '..mmmmmmmmqqqqqq..',
  '...mmqqqqqqqqqq...', // 15
  '....qqqqqqqqqq....',
  '......qqqqqq......',
];

const BLACK_PAL = Object.freeze({
  a: '#e6ebf6',
  b: '#a3acc6',
  c: '#6c7696',
  d: '#454c68',
  W: '#cfc8ee',
  n: '#5e5878',
  m: '#2f2a42',
  q: '#1a1628',
});
const TIME_PAL = recolor(BLACK_PAL, { W: '#d8e8ff', n: '#5a74b0', m: '#2c3e78', q: '#18224a' });

function fuseSpark(ctx, x, y, t, big = false) {
  const f = (t >> 1) % 3;
  const r = big ? 3 : 2;
  sparkle(ctx, x, y, r - (f === 2 ? 1 : 0), f === 0 ? '#ffd23f' : '#ff7a1f', '#ffffff', f === 1);
  if (f !== 1) px(ctx, x + (f ? 2 : -2), y - 2, '#fff27a');
}

export const BLACKBOMB_SPRITE = {
  draw(ctx, e, x, y, t) {
    const bob = (t >> 4) % 2;
    const h = BOMB_BODY.length;
    const top = y - h - bob;
    // Fuse: a short curl from the cap to the spark.
    const fx = Math.round(x);
    line(ctx, fx, top, fx + 1, top - 3, '#3a2a1a');
    line(ctx, fx + 1, top - 3, fx + 3, top - 4, '#3a2a1a');
    sprite(ctx, BOMB_BODY, BLACK_PAL, x, y - bob, { anchor: 'feet', outline: OUTLINE });
    // Fire emblem glowing on the casing.
    const glow = (t >> 3) % 2;
    flameTongue(ctx, Math.round(x - 1), top + 14, 3, 7 + glow, t, 1, ['#fff6c8', '#ffd23f', '#ff7a1f', glow ? '#c42e18' : '#8a1e10']);
    fuseSpark(ctx, fx + 4, top - 5, t);
  },
};

// Ticking bombs: the casing shows the seconds left and a light that blinks faster as the fuse runs out.
function fuseInfo(e) {
  const max = e.data?.fuseMax ?? 180;
  const fuse = e.data?.fuse ?? max;
  const k = max > 0 ? Math.max(0, Math.min(1, fuse / max)) : 0;
  return { k, secs: Math.max(0, Math.ceil(fuse / 60)), fuse };
}

// Remaining-time wedge on a clock dial: a pie from 12 o'clock, k = fraction left.
function dialWedge(ctx, cx, cy, r, k, color) {
  if (k <= 0) return;
  if (k >= 0.999) {
    disc(ctx, cx, cy, r, color);
    return;
  }
  const pts = [[cx, cy]];
  const n = Math.max(3, Math.ceil(k * 16));
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + k * Math.PI * 2 * (i / n);
    pts.push([cx + Math.cos(a) * (r + 0.4), cy + Math.sin(a) * (r + 0.4)]);
  }
  poly(ctx, pts, color);
}

// TimeBomb: an alarm-clock bomb. The dial shows the time left as a red wedge plus the seconds, and the
// bells rattle faster as the fuse runs out.
export const TIMEBOMB_SPRITE = {
  draw(ctx, e, x, y, t) {
    const { k, secs, fuse } = fuseInfo(e);
    const h = BOMB_BODY.length;
    const urgent = k < 0.34;
    const period = Math.max(6, Math.round(6 + 24 * k));
    const ring = fuse % period < period / 2;
    const shake = urgent && ring ? ((t >> 1) % 2 ? 1 : -1) : 0;
    const bx = Math.round(x) + shake;
    const top = Math.round(y) - h;
    // Bells and the striker between them.
    for (const s of [-1, 1]) {
      const cx = bx + s * 5 - (s > 0 ? 1 : 0);
      disc(ctx, cx, top + 2, 3, OUTLINE);
      disc(ctx, cx, top + 2, 2, '#ffd23f');
      px(ctx, cx - 1, top + 1, '#fff6c8');
      px(ctx, cx + 1, top + 3, '#c88a10');
    }
    const strike = ring ? ((t >> 1) % 2 ? -1 : 1) : 0;
    rect(ctx, bx - 1 + strike, top - 1, 2, 3, OUTLINE);
    px(ctx, bx - 1 + strike, top, '#c8d0e0');
    sprite(ctx, BOMB_BODY, TIME_PAL, bx, y, { anchor: 'feet', outline: OUTLINE });
    // Dial.
    const cx = bx - 1;
    const cy = top + 10;
    disc(ctx, cx, cy, 6, OUTLINE);
    disc(ctx, cx, cy, 5, urgent && ring ? '#ffe0e0' : '#f2f6ff');
    dialWedge(ctx, cx, cy, 5, k, urgent ? '#ff4a4a' : '#ff8a6a');
    px(ctx, cx, cy - 5, '#1a2040');
    drawText(ctx, String(Math.min(9, secs)), cx - 1, cy - 2, '#1a2040', { mini: true });
    if (urgent && ring) withAlpha(ctx, 0.3, () => disc(ctx, cx, cy, 8, '#ff4a4a'));
  },
};

// DoomBomb: a spiked hazard bomb with a big countdown display and a red halo that quickens near zero.
export const DOOMBOMB_SPRITE = {
  draw(ctx, e, x, y, t) {
    const { k, secs, fuse } = fuseInfo(e);
    const urgent = k < 0.3;
    const shake = urgent && (t >> 1) % 2 ? 1 : 0;
    const cx = Math.round(x) + shake;
    const cy = Math.round(y) - 13;
    const r = 11;
    const period = Math.max(5, Math.round(5 + 25 * k));
    const on = fuse % period < period / 2;
    if (on) withAlpha(ctx, 0.28, () => disc(ctx, cx, cy, r + 5, '#ff2a5a'));
    // Spikes.
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + Math.PI / 6 + (i * Math.PI) / 3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const bx = cx + ca * (r - 1);
      const by = cy + sa * (r - 1);
      const tx = cx + ca * (r + 6);
      const ty = cy + sa * (r + 6);
      const nx = -sa * 3.2;
      const ny = ca * 3.2;
      poly(ctx, [[bx + nx * 1.4, by + ny * 1.4], [tx + ca, ty + sa], [bx - nx * 1.4, by - ny * 1.4]], OUTLINE);
      poly(ctx, [[bx + nx, by + ny], [tx, ty], [bx - nx, by - ny]], '#7a8098');
      line(ctx, bx + nx * 0.4, by + ny * 0.4, tx, ty, '#c8d0e0');
    }
    // Casing.
    disc(ctx, cx, cy, r + 1, OUTLINE);
    disc(ctx, cx, cy, r, '#1e1626');
    disc(ctx, cx - 1, cy - 1, r - 2, '#2e2238');
    disc(ctx, cx - 4, cy - 5, 3, '#4a3a58');
    rect(ctx, cx - 6, cy - 7, 2, 1, '#b8a8d0');
    // Hazard ring.
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + ((fuse % 40) / 40) * 0.31;
      px(ctx, cx + Math.round(Math.cos(a) * (r - 1)), cy + Math.round(Math.sin(a) * (r - 1)), i % 2 ? '#ffd23f' : '#2a2030');
    }
    // Display.
    rect(ctx, cx - 6, cy - 4, 13, 11, OUTLINE);
    rect(ctx, cx - 5, cy - 3, 11, 9, '#2a0610');
    rect(ctx, cx - 5, cy - 3, 11, 1, '#4a1020');
    drawText(ctx, String(Math.min(9, secs)), cx - 2, cy - 2, urgent && on ? '#ffffff' : '#ff4a6a');
    const bar = Math.round(9 * k);
    rect(ctx, cx - 4, cy + 5, 9, 1, '#3a0c18');
    rect(ctx, cx - 4, cy + 5, bar, 1, urgent ? '#ff4a4a' : '#ffd23f');
    // Cap light.
    rect(ctx, cx - 2, cy - r - 3, 5, 3, OUTLINE);
    rect(ctx, cx - 1, cy - r - 2, 3, 1, on ? '#ff6a6a' : '#5a1010');
  },
};

// ---------------------------------------------------------------- summon-only helper navis

const OX = 24;
const OY = 48;
const L = (rows, X, Y, contour = true) => ({ rows, x: X + OX, y: Y + OY, contour });

// Materialise-in: scanline build-up during the first frames of the summon.
function materialise(ctx, rows, pal, x, y, k, flip = false) {
  if (k >= 10) {
    sprite(ctx, rows, pal, x, y, { anchor: 'feet', flip, outline: OUTLINE });
    return;
  }
  const a = Math.min(1, k / 8);
  ctx.save();
  ctx.beginPath();
  const cut = Math.round(y - 4 - (k / 10) * 48);
  for (let yy = y - 50; yy < y + 2; yy += 2) if (yy >= cut || yy % 4 === 0) ctx.rect(x - 30, yy, 60, yy >= cut ? 2 : 1);
  ctx.clip();
  sprite(ctx, rows, pal, x, y, { anchor: 'feet', flip, outline: OUTLINE, alpha: a });
  ctx.restore();
  withAlpha(ctx, 0.6 * (1 - a), () => sprite(ctx, rows, solidPalette('#d8f8ff'), x, y, { anchor: 'feet', flip }));
  rect(ctx, x - 14, cut, 28, 1, '#ffffff');
}

// Mender: a cheerful medic navi with a heart wand.
const MENDER_PAL = Object.freeze({
  k: OUTLINE,
  W: '#ffffff',
  a: '#eef3fb',
  b: '#c6d2e8',
  c: '#93a2c2',
  d: '#5f6c8e',
  g: '#c8ffe0',
  G: '#5fe3a1',
  H: '#24a866',
  J: '#166b42',
  p: '#ffc8de',
  P: '#ff74ae',
  Q: '#d23f80',
  s: '#1c2244',
  e: '#8affc8',
});

const MENDER_HEAD = [
  '.......aab......', // -29
  '.....aWWaabb....',
  '...aaWWaaaaabb..',
  '..aWaaaaaaaaabb.',
  '.aWaaaaaaaaaaabc',
  'PaaaaaaaaaaaaabP', // ear pods
  'PPaaasssssssssbP',
  'PPaaassesssessbP', // happy eyes
  'QPaaasesesesesbQ',
  '.QaaasssPPPsssb.', // smile
  '..aaasssssssssb.',
  '...bbbbbbbbbbbc.',
  '.....cccccccc...', // -17
];
const MENDER_BODY = [
  '....aaWaab....', // -17
  '...aWaaaaabc..',
  '..aWaGGaGGbc..',
  '.aWaGPPGPPGbc.',
  '.aaaGPPPPPGbcc',
  '.aaaGGPPPGGbcc',
  '.babaGGPGGbbcc',
  '.bbbaaGGGabbcd',
  '..bbbbbbbbccd.',
  '...ccbbbbccd..',
  '....ccdddd....', // -7
];
const MENDER_LEGS = [
  '...ab....ab...', // -7
  '...ab....ab...',
  '..aabc..aabc..',
  '..GGHJ..GGHJ..',
  '.GGGHJ.GGGHJJ.',
  '.HHHJJ.HHHJJJ.',
  '..JJJ...JJJJ..', // -1
];
const MENDER_ARM_BACK = ['.ab', 'abc', 'bc.', 'GG.', '.G.'];
const MENDER_WAND_DOWN = ['.ab.....', 'abc.....', 'bcGG....', '..cb....', '..bc....', '...cb...', '..PQP...', '..QPQ...', '...Q....'];
const MENDER_WAND_UP = [
  '..PP.PP..', // -38 heart
  '.PpPPPPQ.',
  '.PPPPPPQ.',
  '..PPPPQ..',
  '...PPQ...',
  '....Q....',
  '....b....', // staff
  '....b....',
  '....c....',
  '....b....',
  '....c....',
  '...GGb...', // hand
  '...abc...',
  '..abc....',
  '..bc.....',
  '.bc......',
  '.c.......',
];
const MENDER_WAND_FWD = ['.........PP.PP.', '........PpPPPPQ', '.ab.....PPPPPPQ', 'abcbbcbcbPPPPQ.', '.bcGG.....PPQ..', '...........Q...'];

const MENDER_POSES = {};
function menderPose(name, arm, ax, ay) {
  MENDER_POSES[name] = compose(`mender:${name}`, 48, 48, [
    L(MENDER_ARM_BACK, -10, -15),
    L(MENDER_BODY, -7, -17),
    L(MENDER_LEGS, -7, -7, false),
    L(MENDER_HEAD, -8, -29),
    L(arm, ax, ay),
  ]);
}
menderPose('down', MENDER_WAND_DOWN, 4, -15);
menderPose('up', MENDER_WAND_UP, 3, -38);
menderPose('fwd', MENDER_WAND_FWD, 4, -18);

export const MENDER_SPRITE = {
  draw(ctx, e, x, y, t) {
    const k = e.animT ?? 0;
    const hop = k >= 10 && k < 40 && (t >> 3) % 2 ? 1 : 0;
    const pose = k < 14 ? MENDER_POSES.up : k < 26 ? MENDER_POSES.fwd : k < 30 ? MENDER_POSES.down : MENDER_POSES.up;
    const flip = (e.facing ?? 1) < 0;
    const d = flip ? -1 : 1;
    materialise(ctx, pose, MENDER_PAL, x, y - hop, k, flip);
    if (k < 10) return;
    if (pose === MENDER_POSES.up) {
      const r = (t >> 2) % 2 ? 2 : 1;
      sparkle(ctx, x + d * 7, y - 40 - hop, r, '#ffc8de', '#ffffff', true);
      if (k >= 30) {
        for (let i = 0; i < 3; i++) {
          const ph = (k * 1.2 + i * 9) % 26;
          drawHeart(ctx, x - 8 + i * 8, y - 30 - ph, ph < 18 ? '#ff74ae' : '#ffc8de');
        }
      }
    } else if (pose === MENDER_POSES.fwd && k < 22) {
      // A heart bolt flies off the wand tip.
      const bx = x + d * (20 + (k - 14) * 5);
      drawHeart(ctx, bx, y - 16, '#ff74ae');
      sparkle(ctx, bx - d * 5, y - 15, 1, '#ffc8de', '#ffffff');
    }
  },
};

export function drawHeart(ctx, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  rect(ctx, x - 2, y - 1, 2, 2, color);
  rect(ctx, x + 1, y - 1, 2, 2, color);
  rect(ctx, x - 2, y, 5, 1, color);
  rect(ctx, x - 1, y + 1, 3, 1, color);
  px(ctx, x, y + 2, color);
  px(ctx, x - 1, y - 1, '#ffffff');
}

// Crusher: a stocky demolition navi with huge fists.
const CRUSHER_PAL = Object.freeze({
  k: OUTLINE,
  W: '#fff8d8',
  a: '#ffe27a',
  b: '#ffc23a',
  c: '#e08a1a',
  d: '#a85a10',
  h: '#262a38',
  x: '#3a3e50',
  z: '#575d74',
  m: '#c8d0e0',
  n: '#98a2b8',
  o: '#69728a',
  q: '#454b60',
  r: '#ff8a2a',
  R: '#ffd07a',
});

const CRUSHER_HEAD = [
  '....aaaab....', // -30
  '..aWaaaaabc..',
  '.aWaaaaaaabc.',
  '.abhhbbbhhcc.', // hazard stripe
  '.abbbbbbbbcc.',
  'cbbbbbbbbbccd', // brim
  '.xxxxxxxxxxz.', // face
  '.xxxrRxxxrRz.',
  '.xxxxxxxxxxz.',
  '..zxxxxxxzz..', // -21
];
const CRUSHER_BODY = [
  '....mmmmmmmmn....', // -21
  '..mmaabbbbbbcnn..',
  '.mmabbbbbbbbccno.',
  'mmabbbbbbbbbbccno',
  'mabbbbbbbbbbbbcno',
  'nabbbbbbbbbbbbcoo',
  'nabbbbbbbbbbbbcoo',
  'nbhbhbhbhbhbhbhoo', // hazard belt
  'nbbbbbbbbbbbbbcoo',
  '.obbbbbbbbbbbccq.',
  '..qccccccccccdq..',
  '....qqqqqqqqq....', // -10
];
const CRUSHER_LEGS = [
  '..xzzx...xzzx..', // -10
  '..xzzx...xzzx..',
  '.xzzzx...xzzzx.',
  '.mmnnno.mmnnno.',
  '.mnnooq.mnnooq.',
  'mmnnnooqmnnnooq',
  'mnnnnooqmnnnooq',
  'nooooqqqnooooqq',
  'nooooqqqnooooqq',
  '.qqqqqq..qqqqq.', // -1
];
const FIST = [
  '..mmmmn...',
  '.mWmmmnno.',
  'mmWmmnnnoq',
  'mmmmmnnooq',
  'rRrRrRrooq', // knuckle plate
  'nnnnnnnooq',
  'nmnmnmnooq',
  '.oooooooq.',
  '..qqqqqq..',
];
const ARM = ['zxz', 'xzx', 'zxz', 'xzx'];
const ARM_UP = ['zxz', 'xzx', 'zxz', 'xzx', 'zxz', 'xzx', 'zxz', 'xzx', 'zxz', 'xzx', 'zxz', 'xzx'];

const CRUSHER_POSES = {};
function crusherPose(name, o) {
  const c = o.crouch ?? 0;
  const layers = [L(CRUSHER_BODY, -9, -21 + c), L(CRUSHER_LEGS, -8, -10, false), L(CRUSHER_HEAD, -7, -30 + c)];
  for (const s of [-1, 1]) {
    layers.push(L(o.arm, s < 0 ? -11 - o.armX : 8 + o.armX, o.armY + c));
    layers.push(L(FIST, s < 0 ? -o.fistX - 10 : o.fistX, o.fistY + c));
  }
  CRUSHER_POSES[name] = compose(`crusher:${name}`, 48, 48, layers);
}
crusherPose('stand', { arm: ARM, armX: 0, armY: -18, fistX: 9, fistY: -15 });
crusherPose('raise', { arm: ARM_UP, armX: -2, armY: -32, fistX: 3, fistY: -42 });
crusherPose('slam', { arm: ARM, armX: 1, armY: -15, fistX: 11, fistY: -12, crouch: 3 });

export const CRUSHER_SPRITE = {
  draw(ctx, e, x, y, t) {
    const k = e.animT ?? 0;
    // The chip strikes at frame 14 of the summon: wind up before it, slam on it.
    const pose = k < 6 ? CRUSHER_POSES.stand : k < 14 ? CRUSHER_POSES.raise : k < 34 ? CRUSHER_POSES.slam : CRUSHER_POSES.stand;
    const flip = (e.facing ?? 1) < 0;
    const shake = pose === CRUSHER_POSES.slam && k < 20 ? ((t >> 1) % 2 ? 1 : -1) : 0;
    materialise(ctx, pose, CRUSHER_PAL, x + shake, y, k, flip);
    if (k < 10) return;
    if (pose === CRUSHER_POSES.raise) {
      sparkle(ctx, x - 8, y - 44, (t >> 1) % 2 ? 2 : 1, '#ffd07a', '#ffffff');
      sparkle(ctx, x + 8, y - 44, (t >> 1) % 2 ? 1 : 2, '#ffd07a', '#ffffff');
    } else if (pose === CRUSHER_POSES.slam && k < 22) {
      const kk = k - 14;
      for (const s of [-1, 1]) {
        const ix = x + s * 15;
        rect(ctx, ix - 4 - kk, y - 1, 9 + kk * 2, 1, kk < 3 ? '#ffffff' : '#ffd07a');
        disc(ctx, ix + s * (4 + kk), y - 3, kk < 4 ? 2 : 1, '#b8a888');
        px(ctx, ix + s * (2 + kk * 2), y - 6 - kk, '#d8c8a8');
      }
    }
  },
};

