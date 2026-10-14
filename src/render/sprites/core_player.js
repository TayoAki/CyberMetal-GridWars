// AXIOM — the player's navi. A chrome-and-cyan cyber-warrior: sleek visored helmet with a fin, armoured
// suit, and a right arm that turns into a buster, cannon, blade, rocket fist or shield.
//
// The body is assembled from layered pixel-string parts (back arm, torso, legs, head, front arm) in body
// coordinates: X is the column relative to the feet centre (the centre line sits between X = -1 and X = 0),
// Y is the row relative to the floor (Y = -1 is the bottom row of the boots). Every pose is composed once
// into a single 64x56 sprite (cached) and drawn with the 'feet' anchor, so flipping mirrors cleanly.

import { sprite, recolor } from '../pixel.js';
import { OUTLINE, compose, solidPalette, withAlpha, sparkle, flameTongue, ellipseRing, hash, rect, px, line, ellipse, disc, ring, poly } from './core_util.js';

const CW = 64;
const CH = 56;
const OX = 32; // canvas column of X = 0
const OY = 56; // canvas row of Y = 0 (the floor line)

export const PAL = Object.freeze({
  k: OUTLINE,
  // chrome
  W: '#ffffff',
  A: '#dbe5f5',
  B: '#a6b5d0',
  C: '#7180a3',
  D: '#475273',
  E: '#2b3250',
  // cyan lights
  1: '#eaffff',
  2: '#86f3ff',
  3: '#27c3ee',
  4: '#1281b3',
  5: '#0b4f77',
  // navy undersuit
  n: '#4c5d96',
  m: '#323d6c',
  q: '#1e2548',
  // hurt visor
  v: '#3a4f78',
  w: '#d8ecff',
  // thruster / flame
  y: '#fff27a',
  o: '#ff9a3a',
  r: '#e0441e',
});

// Style Change: the accent lights (keys 1-5) follow e.data.style.element. Default stays cyan.
const STYLE_ACCENTS = {
  fire: { 1: '#fff4d6', 2: '#ffc65a', 3: '#ff7a2a', 4: '#c8401a', 5: '#7a1e10' },
  aqua: { 1: '#e2f0ff', 2: '#6eb0ff', 3: '#2f6ce6', 4: '#1c42a6', 5: '#0f2766' },
  elec: { 1: '#fffbe0', 2: '#ffee6a', 3: '#f2c21a', 4: '#b0820c', 5: '#6a4a08' },
  wood: { 1: '#eaffe0', 2: '#9af27a', 3: '#3ec44a', 4: '#1e8a32', 5: '#0e4a1c' },
};

export function stylePalette(style) {
  const acc = style && STYLE_ACCENTS[style.element];
  return acc ? recolor(PAL, acc) : PAL;
}

// Where effects attach, in body coordinates (facing right).
export const BUSTER_MUZZLE = Object.freeze({ x: 21, y: -23 });
export const CANNON_MUZZLE = Object.freeze({ x: 26, y: -24 });

// ---------------------------------------------------------------- parts
// part(rows, X, Y): rows with their top-left at body coordinate (X, Y).
const part = (rows, X, Y) => Object.freeze({ rows, X, Y });

const HEAD = part(
  [
    '..23..........', // -41 fin
    '..234.........',
    '...234........',
    '...34AAAB.....',
    '..A4AWWAAB....',
    '.AWAAWAAAABB..',
    '.AAAAAAAABBBC.',
    'AAABBBBBBBBCC.', // -34
    'ABCDDE54444443', // -33 visor
    'BBD2DE41122222',
    'BCDDDE4333333.',
    '.CCCDEqmmnnnC.', // -30 face plate
    '..DCCEqmmnnC..',
    '...DDDCBAAC...', // -28 jaw
    '.....DDDD.....', // -27
  ],
  -7,
  -41,
);

const HEAD_HURT = part(
  [
    '..23..........',
    '..234.........',
    '...234........',
    '...34AAAB.....',
    '..A4AWWAAB....',
    '.AWAAWAAAABB..',
    '.AAAAAAAABBBC.',
    'AAABBBBBBBBCC.',
    'ABCDDE5vvvvvv.',
    'BBD2DEvwwvwwvv',
    'BCDDDE4vvvvv..',
    '.CCCDEqmmnnnC.',
    '..DCCEqmmqnC..',
    '...DDDCBAAC...',
    '.....DDDD.....',
  ],
  -7,
  -41,
);

const TORSO = part(
  [
    '......mnnq......', // -27
    '...AAAAnnAAAB...', // -26 collar
    '..AWWAB33BAABC..', // -25
    '..AWAB3123BBCC..',
    '..AAAB4224BCCD..',
    '...ABBC44CCCD...',
    '....BCCCCCCD....', // -21
    '.....mnnnmq.....',
    '.....mnnmmq.....',
    '...ABBB23BBCD...', // -18 belt
    '...BCCC34CCDD...',
    '...mnnnmmnnmq...', // -16 hips
    '...mnnq..mnmq...',
  ],
  -8,
  -27,
);

const LEGS_STAND = part(
  [
    '...mnnq..mnnq...', // -14
    '...mnnq..mnnq...',
    '...mnmq..mnmq...',
    '..AWABC..AWABC..', // -11 knees
    '..BABCD..BABCD..',
    '...mnq....mnq...',
    '...mnq....mnq...',
    '..32234..32234..', // -7 cuffs
    '..AWAAB..AWAAB..',
    '.AWAABC..AWAABCC',
    '.AAABBCC.AAABBCC',
    '.BBBCCDD.BBBCCDD',
    '.CDDDDEE.CDDDDEE',
    '..EEEEE...EEEEE.', // -1
  ],
  -8,
  -14,
);

// Front leg forward and bent, back leg stretched behind (sword, punch, dash).
const LEGS_LUNGE = part(
  [
    '..........mnnq..mnnq......', // -14
    '.........mnnq....mnnq.....',
    '........mnnq......mnnq....',
    '.......mnnq.......AWABC...', // -11
    '......AWAB........BABCD...',
    '.....AWABC.........mnq....',
    '.....BABC..........mnq....',
    '....mnq...........32234...', // -7
    '...mnq............AWAAB...',
    '..3234...........AWAABCC..',
    '.AWAB............AAABBCC..',
    'AWABC............BBBCCDD..',
    'AABCD............CDDDDEE..',
    '.CDE..............EEEEE...', // -1
  ],
  -13,
  -14,
);

// Knees bent, wide stance; the upper body sits 3 px lower (ground strike, hammer, burner).
const LEGS_CROUCH = part(
  [
    '...mnnnq..mnnnq...', // -11
    '..mnnq......mnnq..',
    '.AWAB........AWAB.', // -9
    '.BABC........BABC.',
    '..mnq........mnq..',
    '.32234......32234.', // -6
    '.AWAAB......AWAAB.',
    'AWAABC......AWAABCC',
    'AAABBCC.....AAABBCC',
    'BCDDDEE.....BCDDDEE',
    '.EEEEE.......EEEEE.', // -1
  ],
  -9,
  -11,
);

// Knocked back: front foot lifted, back leg braced.
const LEGS_HURT = part(
  [
    '...mnnq..mnnq....', // -14
    '...mnnq...mnnq...',
    '..mnnq.....mnnq..',
    '..AWAB......AWAB.', // -11
    '.ABABC......BABC.',
    '.mnq.......mnq...',
    '.mnq......mnq....',
    '32234....32234...', // -7
    'AWAAB....AWAABC..',
    'AWAABC...AAABBCC.',
    'AAABBC...BCDDDEE.',
    'BBBCCDD...EEEEE..',
    'CDDDDEE..........',
    '.EEEEE...........',
  ],
  -9,
  -14,
);

const B_PAULDRON = part(['..AAAA.', '.AWWAB.', 'AWAABBC', 'AABBBCC', '.BBCCD.'], -11, -27);
const F_PAULDRON = part(['.AAAB..', 'AWWABC.', 'AWAABCD', 'ABBBCCD', '.BCCCD.'], 3, -27);

const B_ARM = part(['.nmq.', '.nmq.', '.nmq.', '.ABC.', '.334.', '.ABC.', '.BCD.', '.qmq.', '..q..'], -10, -22);
// Back arm swung behind (lunges).
const B_ARM_BACK = part(['...nmq', '..nmq.', '.nmq..', 'ABC...', '334...', 'BCD...', 'qm....'], -13, -22);
// Back arm raised out (recover, burner).
const B_ARM_OUT = part(['..nmq.', '.nmq..', 'ABC...', '334...', 'BCD...', 'mq....'], -15, -27);
// Back arm flung back (hurt).
const B_ARM_UP = part(['..qmq..nmq', 'BCD.nmq...', '433nq.....', 'ABC.......'], -17, -25);

const F_ARM = part(['.mnq.', '.mnq.', '.mnq.', 'ABBCC', '32234', 'ABBCD', 'BBCDD', '.qmq.', '.qq..'], 4, -22);

// Buster: the forearm becomes a barrel with a cyan muzzle.
const F_BUSTER = part(
  [
    '...AAAAAAAB..', // -26
    '..AWWWWWWABC.',
    '.mAAAAAAABCD2',
    '.mB33BBBBCCD1', // -23 muzzle
    '.qB44CCCCCDD2',
    '..CCCDDDDDDE.',
    '...DDEEEEEE..', // -20
  ],
  8,
  -26,
);

// Heavy cannon carried on the forearm.
const F_CANNON = part(
  [
    '...AAAAAAAAB.......', // -28
    '..AWWWWWAAABC.AAB..',
    '.AWAAAAAAABBCAWABC.',
    '.AA32ABBBBBCDAEEEC.', // -25
    'mBB43BBBBBCCDBEEED.',
    'mBC44CCCCCCDDBEEED.',
    'qCCCCCCCCDDDECDDDD.',
    '..DDDDDDDDDE..DDD..',
    '...EEEEEEEE........', // -20
  ],
  7,
  -28,
);

// Sword: an energy blade grows from the gauntlet.
const F_BLADE_UP = part(
  [
    '.....1..', // -48
    '.....1..',
    '....213.',
    '....213.',
    '....213.',
    '....213.',
    '....214.',
    '....214.',
    '....214.',
    '....314.',
    '....324.',
    '....324.',
    '....BAC.', // -36 emitter
    '...AWABC',
    '...A3234',
    '...ABBCD',
    '...BCCD.',
    '..mnq...', // -31
    '.mnq....',
    '.mnq....',
    'mnq.....',
    'mnq.....', // -27
  ],
  6,
  -48,
);

const F_BLADE_FWD = part(
  [
    '...AAB..............', // -25
    'mnAWABC.............',
    'mnA3234B222222222223',
    'qmABBCDA111111111111', // -22
    '..BCCD.C3333344444..',
  ],
  8,
  -25,
);

const F_BLADE_DOWN = part(
  [
    'mn.........', // -22
    'mnAAB......',
    'qAWABC.....',
    '.A3234.....',
    '.BBCDB2....', // -18
    '..CD.A12...',
    '.....3112..',
    '......3112.',
    '.......3112',
    '........311', // -13
    '.........31',
    '..........1',
  ],
  9,
  -22,
);

// Rocket fist, cocked and extended.
const F_FIST_BACK = part(['.mnq...', '.mnqAAB', '.ABAWAC', '.32AABD', '.ABBBCD', '.BCCCD.'], 4, -22);
const F_FIST = part(
  [
    '.........AAAB.', // -27
    '........AWWABC',
    '.mnAAB.yAWAABC',
    '.mn324oyBAABCD', // -24
    '.qmABCryABBBCD',
    '...BCD.yCBBCDD',
    '.........CCDD.', // -21
  ],
  8,
  -27,
);

// Arm raised high with a fist (ground-strike wind-up, throw wind-up).
const F_UP_FIST = part(['.AAB.', 'AWABC', 'AAABC', 'BABCD', '.BCD.', '.324.', '.ABC.', '.BCD.', '.mnq.', '.mnq.', '.mnq.'], 7, -37);

// Fist driven into the floor (the body crouches 3 px).
const F_STRIKE_DOWN = part(
  [
    '.mnq.....', // -21
    '..mnq....',
    '...mnq...',
    '....mnq..',
    '....ABC..', // -17
    '....324..',
    '....ABC..',
    '...AAAB..',
    '..AWWABC.',
    '..AWAABC.', // -12
    '..BAABCD.',
    '..BBBCCD.',
    '...CCDD..',
  ],
  5,
  -21,
);

// Open hand raised forward, casting.
const F_RAISED = part(['....AA.', '...AWAB', '...ABBC', '...BCD.', '..324..', '..ABC..', '.mnq...', '.mnq...', 'mnq....', 'mnq....'], 6, -36);

// Arm thrown forward after a release.
const F_THROW_FWD = part(['.mnAAB.....', '.mnABCAAB..', '.qm324AWAB.', '....BCABBC.', '......BCC..'], 8, -25);

// Hammer: a chrome mallet with cyan bands.
const F_HAMMER_UP = part(
  [
    '..AAAAAAB..', // -47
    '.AWWWWAABC.',
    '.A3333334C.',
    '.ABBBBBBCD.',
    '..CCCCCDD..',
    '....BC.....', // -42 handle
    '....AC.....',
    '....BD.....',
    '....AC.....',
    '...AWAB....', // -38 hand
    '...A324....',
    '...ABCD....',
    '...mnq.....',
    '..mnq......',
    '..mnq......',
    '.mnq.......',
    '.mnq.......', // -31
  ],
  6,
  -47,
);

const F_HAMMER_DOWN = part(
  [
    '.mnq..............', // -24 (the pose sits 3 px lower)
    '.mnq..............',
    '..mnq.............',
    '..mnq.............',
    '...mnq............',
    '...AWAB...........', // -19
    '...A324...........',
    '...ABCDAC.........', // -17 handle
    '........AC........',
    '.........AC.......',
    '..........AC......',
    '...........AC.....',
    '............AC....',
    '.............AC...',
    '...........AAAAAB.', // -10 head
    '...........AWWWABC',
    '...........A3333BC',
    '...........ABBBBCC',
    '...........A4444CD',
    '...........BCCCCDD',
    '............DDDDD.', // -4
  ],
  6,
  -24,
);

// Guard: a hexagonal shield on the forearm.
const F_SHIELD = part(
  [
    '...AAAB...', // -35
    '..AWWABC..',
    '.AW2222BC.',
    'AW233334BC',
    'AW231134BD',
    'AB231134CD', // -30
    'AB233334CD',
    'AB233344CD',
    'AB233344CD',
    'AB233344CD',
    'AB233444CD', // -25
    'AB234444CD',
    'BC344445DD',
    '.BC4455DD.',
    '..CC55DD..',
    '...CDDD...', // -20
  ],
  10,
  -35,
);
const F_SHIELD_ARM = part(['.mnq...', '.mnABC.', '.qm324.', '...BCD.'], 5, -25);

// Arm held out (recover / burner).
const F_ARM_OUT = part(['.mnq...', '..mnq..', '...ABC.', '...3224', '...ABCD', '....mq.'], 5, -26);

// Forearm tucked in front of the chest (dash).
const F_TUCK = part(['.mnq....', '.mnABBC.', '.AW3224.', '.ABBBCD.', '..CCDD..'], 4, -23);

// Arm flung back (hurt).
const F_ARM_HURT = part(['...mnq.', '..mnq..', '.mnq...', 'ABC....', '324....', 'BCD....', 'qm.....'], 3, -23);

// ---------------------------------------------------------------- poses

const L = (p, dx = 0, dy = 0, contour = true) => (p ? { rows: p.rows, x: p.X + dx + OX, y: p.Y + dy + OY, contour } : null);

// Assemble a pose. ux/uy shift the upper body (torso, head, arms) relative to the legs.
function build(key, o) {
  const ux = o.ux ?? 0;
  const uy = o.uy ?? 0;
  const legs = o.legs ?? LEGS_STAND;
  const layers = [
    o.back === null ? null : L(o.back ?? B_ARM, ux, uy),
    L(B_PAULDRON, ux, uy),
    L(TORSO, ux, uy),
    L(legs, 0, 0, false),
    L(o.head ?? HEAD, ux + (o.hx ?? 0), uy + (o.hy ?? 0)),
    ...(o.behindFront ?? []).map(([p, dx, dy]) => L(p, ux + dx, uy + dy)),
    L(o.front ?? F_ARM, ux + (o.fx ?? 0), uy + (o.fy ?? 0)),
    o.pauldron === false ? null : L(F_PAULDRON, ux, uy),
    ...(o.over ?? []).map(([p, dx, dy]) => L(p, ux + dx, uy + dy)),
  ];
  return compose(`axiom:${key}`, CW, CH, layers);
}

// Pose table: name -> () => { rows, hand: [X, Y] (where the charge aura sits), ux, uy }.
const P = {};
function def(name, o, hand) {
  const rows = build(name, o);
  P[name] = { rows, hand: hand ?? [6 + (o.ux ?? 0), -15 + (o.uy ?? 0)], ux: o.ux ?? 0, uy: o.uy ?? 0 };
}

def('idle0', {});
def('idle1', { uy: 1 });
def('shoot', { front: F_BUSTER }, [19, -23]);
def('shootR', { front: F_BUSTER, ux: -1 }, [18, -23]);
def('charged', { front: F_BUSTER, ux: -2, legs: LEGS_HURT, hx: -1 }, [17, -23]);
def('charged2', { front: F_BUSTER, ux: -1 }, [18, -23]);
def('cannon', { front: F_CANNON }, [24, -24]);
def('cannonR', { front: F_CANNON, ux: -2, hx: -1 }, [22, -24]);
def('sword0', { front: F_BLADE_UP, back: B_ARM }, [10, -33]);
def('sword1', { front: F_BLADE_FWD, back: B_ARM_BACK, legs: LEGS_LUNGE, ux: 2, uy: 1 }, [14, -21]);
def('sword2', { front: F_BLADE_DOWN, back: B_ARM_BACK, legs: LEGS_LUNGE, ux: 1, uy: 1 }, [12, -18]);
def('throw0', { front: F_UP_FIST }, [9, -34]);
def('throw1', { front: F_THROW_FWD, back: B_ARM_BACK, legs: LEGS_LUNGE, ux: 1, uy: 1 }, [16, -22]);
def('punch0', { front: F_FIST_BACK }, [8, -20]);
def('punch1', { front: F_FIST, back: B_ARM_BACK, legs: LEGS_LUNGE, ux: 2, uy: 1 }, [18, -23]);
def('hammer0', { front: F_HAMMER_UP }, [9, -36]);
def('hammer1', { front: F_HAMMER_DOWN, back: B_ARM_BACK, legs: LEGS_CROUCH, ux: 1, uy: 3 }, [11, -15]);
def('swing0', { front: F_UP_FIST }, [9, -34]);
def('swing1', { front: F_STRIKE_DOWN, back: B_ARM_BACK, legs: LEGS_CROUCH, ux: 1, uy: 3 }, [9, -6]);
def('guard', { front: F_SHIELD, behindFront: [[F_SHIELD_ARM, 0, 0]] }, [14, -27]);
def('point', { front: F_RAISED }, [10, -34]);
def('recover', { front: F_ARM_OUT, back: B_ARM_OUT }, [9, -22]);
def('dash', { front: F_TUCK, back: B_ARM_BACK, legs: LEGS_LUNGE, ux: 2, uy: 1, hy: 1 }, [10, -20]);
def('burner', { front: F_ARM_OUT, back: B_ARM_OUT, legs: LEGS_CROUCH, uy: 3 }, [9, -19]);
def('hurt', { front: F_ARM_HURT, back: B_ARM_UP, legs: LEGS_HURT, head: HEAD_HURT, ux: -2, hx: -1, hy: 1 }, [3, -19]);

function poseFor(e, t) {
  const k = e.animT ?? 0;
  switch (e.anim) {
    case 'shoot':
      return k < 3 ? P.shootR : P.shoot;
    case 'charged':
      return k < 7 ? P.charged : P.charged2;
    case 'cannon':
      return k >= 8 && k < 16 ? P.cannonR : P.cannon;
    case 'sword':
      return k < 5 ? P.sword0 : k < 10 ? P.sword1 : P.sword2;
    case 'throw':
      return k < 9 ? P.throw0 : P.throw1;
    case 'punch':
      return k % 7 < 3 && k < 4 ? P.punch0 : P.punch1;
    case 'hammer':
      return k < 12 ? P.hammer0 : P.hammer1;
    case 'swing':
      return k < 10 ? P.swing0 : P.swing1;
    case 'guard':
      return P.guard;
    case 'point':
      return P.point;
    case 'recover':
      return P.recover;
    case 'dash':
      return P.dash;
    case 'burner':
      return P.burner;
    case 'hurt':
    case 'delete':
      return P.hurt;
    case 'move':
    case 'summon':
    case 'idle':
    default:
      return Math.floor(t / 14) % 4 >= 2 ? P.idle1 : P.idle0;
  }
}

// ---------------------------------------------------------------- drawing

function sxOf(x, facing) {
  return (X) => (facing < 0 ? x - 1 - X : x + X);
}

function drawBody(ctx, rows, x, y, flip, alpha = 1, pal = PAL) {
  sprite(ctx, rows, pal, x, y, { anchor: 'feet', flip, outline: OUTLINE, alpha });
}

// Charge aura around the buster hand: blue while charging, pink/purple pulsing at full.
function drawChargeAura(ctx, hx, hy, level, t, behind) {
  if (level === 1) {
    if (behind) {
      withAlpha(ctx, 0.35 + 0.15 * Math.sin(t / 2), () => disc(ctx, hx, hy, 4 + ((t >> 2) % 2), '#3a8cff'));
      return;
    }
    // Particles spiral in toward the hand.
    for (let i = 0; i < 4; i++) {
      const ph = ((t + i * 5) % 20) / 20;
      const a = i * 1.7 + t / 5;
      const r = 13 * (1 - ph);
      const px0 = hx + Math.cos(a) * r;
      const py0 = hy + Math.sin(a) * r * 0.8;
      rect(ctx, Math.round(px0), Math.round(py0), ph > 0.6 ? 2 : 1, ph > 0.6 ? 2 : 1, ph > 0.6 ? '#bff4ff' : '#4aa8ff');
    }
    ring(ctx, hx, hy, 3 + ((t >> 1) % 2), '#7ad0ff');
    px(ctx, hx, hy, '#ffffff');
    return;
  }
  // Full charge.
  const pulse = (t >> 1) % 3;
  if (behind) {
    withAlpha(ctx, 0.45, () => disc(ctx, hx, hy, 7 + pulse, '#b23aff'));
    withAlpha(ctx, 0.55, () => disc(ctx, hx, hy, 4 + (pulse > 1 ? 1 : 0), '#ff6ad5'));
    return;
  }
  ring(ctx, hx, hy, 6 + pulse, t % 4 < 2 ? '#ff8ae6' : '#c86aff');
  disc(ctx, hx, hy, 2, '#ffe0fa');
  px(ctx, hx, hy, '#ffffff');
  for (let i = 0; i < 3; i++) {
    const a = t / 4 + (i * Math.PI * 2) / 3;
    sparkle(ctx, hx + Math.cos(a) * 9, hy + Math.sin(a) * 7, (t + i) % 6 < 3 ? 1 : 0, '#ffb0f0', '#ffffff');
  }
}

// Teleport-in flicker for 'move': the body re-forms from horizontal slices around a light column.
function drawWarpIn(ctx, rows, x, y, flip, k, t, pal) {
  const top = y - 42;
  const h = 42;
  if (k >= 4) {
    drawBody(ctx, rows, x, y, flip, 1, pal);
    return;
  }
  // Light column.
  const cw = 4 - k;
  withAlpha(ctx, 0.85, () => rect(ctx, x - cw, top - 4, cw * 2, h + 4, '#bff4ff'));
  rect(ctx, x - 1, top - 6, 2, h + 6, '#ffffff');
  // Body slices: every other row band, offset sideways, filling in as k grows.
  ctx.save();
  ctx.beginPath();
  const band = 2;
  for (let yy = top; yy < y; yy += band * 2) ctx.rect(x - 40, yy + (k % 2) * band, 80, band + (k >= 2 ? 1 : 0));
  ctx.clip();
  drawBody(ctx, rows, x + ((k + (t >> 1)) % 2 ? 1 : -1) * (3 - k), y, flip, 0.9, pal);
  ctx.restore();
}

export const PLAYER_SPRITE = {
  draw(ctx, e, x, y, t) {
    const facing = e.facing < 0 ? -1 : 1;
    const flip = facing < 0;
    const anim = e.anim ?? 'idle';
    const k = e.animT ?? 0;
    const pose = poseFor(e, t);
    const pal = stylePalette(e.data?.style);
    const sx = sxOf(x, facing);
    const charge = anim === 'hurt' || anim === 'delete' ? 0 : (e.data?.charge ?? 0);
    const [hX, hY] = pose.hand;
    const hx = sx(hX);
    const hy = y + hY;

    if (anim === 'summon') {
      // Fading out into the summon beam.
      const a = Math.max(0, 1 - k / 14);
      if (a <= 0) return;
      ctx.save();
      ctx.beginPath();
      for (let yy = y - 44; yy < y; yy += 2) ctx.rect(x - 40, yy, 80, 1 + (k < 6 ? 1 : 0));
      ctx.clip();
      drawBody(ctx, pose.rows, x, y, flip, a, pal);
      ctx.restore();
      withAlpha(ctx, a * 0.6, () => sprite(ctx, pose.rows, solidPalette('#bff4ff'), x, y, { anchor: 'feet', flip }));
      return;
    }

    if (charge > 0) drawChargeAura(ctx, hx, hy, charge, t, true);

    const glow = anim === 'recover' ? 0.5 + 0.5 * Math.sin(k / 3) : 0;
    if (anim === 'recover') {
      // Soft green halo behind the body.
      withAlpha(ctx, 0.18 + 0.14 * glow, () => {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) sprite(ctx, pose.rows, solidPalette('#7aff9a'), x + dx, y + dy, { anchor: 'feet', flip, outline: '#7aff9a' });
      });
    }
    if (anim === 'burner') drawBurnerFlames(ctx, x, y, k, t, true);

    if (anim === 'move') drawWarpIn(ctx, pose.rows, x, y, flip, k, t, pal);
    else drawBody(ctx, pose.rows, x, y, flip, 1, pal);
    if (glow > 0) withAlpha(ctx, 0.12 + 0.22 * glow, () => sprite(ctx, pose.rows, solidPalette('#b8ffc8'), x, y, { anchor: 'feet', flip }));

    // Pose details drawn on top.
    switch (anim) {
      case 'shoot':
        if (k < 3) sparkle(ctx, sx(BUSTER_MUZZLE.x), y + BUSTER_MUZZLE.y, 2 - k, '#bff4ff', '#ffffff');
        break;
      case 'charged':
        if (k < 6) {
          const mx = sx(BUSTER_MUZZLE.x - 2);
          disc(ctx, mx, y + BUSTER_MUZZLE.y, 4 - (k >> 1), '#ff8ae6');
          disc(ctx, mx, y + BUSTER_MUZZLE.y, 2 - (k >> 2), '#ffffff');
        }
        break;
      case 'cannon':
        if (k >= 8 && k < 12) {
          const mx = sx(CANNON_MUZZLE.x - 2);
          disc(ctx, mx, y + CANNON_MUZZLE.y, 5 - (k - 8), '#ffd23f');
          disc(ctx, mx, y + CANNON_MUZZLE.y, 3 - ((k - 8) >> 1), '#ffffff');
        }
        break;
      case 'sword':
        if (k >= 5 && k < 10) drawSwordSmear(ctx, sx, y, k - 5);
        break;
      case 'punch':
        if (pose === P.punch1 && (t >> 1) % 2) px(ctx, sx(14), y - 23, '#fff27a');
        break;
      case 'hammer':
        if (k >= 12 && k < 18) drawImpact(ctx, sx(23), y - 2, k - 12);
        break;
      case 'swing':
        if (k >= 10 && k < 16) drawImpact(ctx, sx(13), y - 1, k - 10);
        break;
      case 'guard': {
        // A light band sweeps across the shield.
        const band = (t >> 1) % 14;
        if (band < 10) {
          const gx = sx(12 + (band >> 1));
          withAlpha(ctx, 0.55, () => rect(ctx, gx, y - 33 + band, 2, 2, '#ffffff'));
        }
        break;
      }
      case 'point': {
        const r = (t >> 2) % 2 ? 2 : 3;
        sparkle(ctx, sx(10), y - 37, r, '#86f3ff', '#ffffff', true);
        break;
      }
      case 'recover':
        if ((t >> 2) % 2) sparkle(ctx, sx(-3 + ((t >> 3) % 7)), y - 40 - ((t >> 1) % 6), 1, '#b8ffc8', '#ffffff');
        break;
      case 'dash':
        drawSpeedLines(ctx, x, y, facing, t);
        break;
      case 'burner':
        drawBurnerFlames(ctx, x, y, k, t, false);
        break;
      default:
        break;
    }

    if (charge > 0) drawChargeAura(ctx, hx, hy, charge, t, false);
  },
};

// Motion smear: an arc swept by the blade tip from overhead to the front during the cut.
function drawSwordSmear(ctx, sx, y, k) {
  const cx = 8;
  const cy = -23;
  const a0 = -Math.PI / 2 - 0.2;
  const a1 = -0.05;
  const alpha = Math.max(0, 0.85 - k * 0.17);
  withAlpha(ctx, alpha, () => {
    for (const [r0, r1, c] of [[13, 21, '#27c3ee'], [15, 20, '#86f3ff'], [18, 20, '#eaffff']]) {
      const pts = [];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([sx(cx + Math.cos(a) * r1), y + cy + Math.sin(a) * r1]);
      }
      for (let i = n; i >= 0; i--) {
        const a = a0 + ((a1 - a0) * i) / n;
        const rr = r0 + (r1 - r0) * (1 - i / n) * 0.6;
        pts.push([sx(cx + Math.cos(a) * rr), y + cy + Math.sin(a) * rr]);
      }
      poly(ctx, pts, c);
    }
  });
}

// Floor impact: a flash line, rays and two dust puffs (k = frames since the hit).
function drawImpact(ctx, x, y, k) {
  const w = 3 + k * 3;
  if (k < 3) rect(ctx, x - w, y - 1, w * 2 + 1, 1, '#ffffff');
  if (k < 4) {
    line(ctx, x - 2 - k, y - 3 - k, x - 4 - k * 2, y - 6 - k * 2, '#eaffff');
    line(ctx, x + 2 + k, y - 3 - k, x + 4 + k * 2, y - 6 - k * 2, '#eaffff');
    line(ctx, x, y - 3 - k, x, y - 6 - k * 2, '#ffffff');
  }
  for (const s of [-1, 1]) {
    const r = k < 2 ? 2 : 1;
    disc(ctx, x + s * (4 + k * 2), y - 2 - (k >> 1), r, k < 3 ? '#b8c4dc' : '#7a86a8');
    if (k < 4) px(ctx, x + s * (2 + k * 3), y - 5 - k * 2, '#d8e2f4');
  }
}

function drawSpeedLines(ctx, x, y, facing, t) {
  for (let i = 0; i < 5; i++) {
    const yy = y - 34 + i * 7 + ((i * 3) % 4);
    const len = 6 + ((i * 5 + t) % 4) * 3;
    const x0 = x - facing * (9 + ((t * 3 + i * 7) % 5));
    const c = i % 2 ? '#86f3ff' : '#eaffff';
    rect(ctx, facing > 0 ? x0 - len : x0 + 1, yy, len, 1, c);
  }
}

function drawBurnerFlames(ctx, x, y, k, t, behind) {
  const cols = ['#fff6c8', '#ffd23f', '#ff7a1f', '#c42e18'];
  if (behind) {
    ellipseRing(ctx, x, y - 1, 19 + ((t >> 2) % 2), 4, t % 4 < 2 ? '#ffd23f' : '#ff7a1f');
    flameTongue(ctx, x - 14, y, 4, 16 + ((t >> 1) % 3) * 2, t, 1, cols);
    flameTongue(ctx, x + 14, y, 4, 15 + ((t >> 1) % 3) * 2, t, 2, cols);
    return;
  }
  // Jets from both hands and the feet.
  flameTongue(ctx, x - 17, y - 14, 3, 9 + ((t >> 1) % 2) * 2, t, 3, cols);
  flameTongue(ctx, x + 17, y - 14, 3, 9 + ((t >> 2) % 2) * 2, t, 4, cols);
  flameTongue(ctx, x - 6, y + 1, 3, 7 + ((t >> 1) % 3), t, 5, cols);
  flameTongue(ctx, x + 6, y + 1, 3, 6 + ((t >> 2) % 3), t, 6, cols);
  if (k < 6) withAlpha(ctx, 1 - k / 6, () => ring(ctx, x, y - 14, 10 + k * 3, '#ffd23f'));
}

// Exported for previews/tests: the composed pose rows.
export const PLAYER_POSES = P;
export { hash };
