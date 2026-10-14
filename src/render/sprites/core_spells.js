// Spell sprites: every chip attack's moving or lingering part. (x, y) is the floor point of (s.x, s.y);
// projectiles fly at chest height, lobbed things use s.z, zones read s.data.cells.
import { sprite } from '../pixel.js';
import { OUTLINE, ramp, hash, withAlpha, cellDelta, sparkle, bolt, flameTongue, ditherDisc, ellipseRing, crescent, streak, rect, px, line, ellipse, disc, ring, poly } from './core_util.js';

const CHEST = 14; // projectile height above the floor

const TEAM_SHOT = {
  red: ['#ffffff', '#bff4ff', '#27c3ee', '#0b6ea0'],
  blue: ['#ffffff', '#ffd6a8', '#ff7a3a', '#b0301a'],
};

function shotRamp(s) {
  if (s.element && s.element !== 'null') return ramp(s.element);
  return TEAM_SHOT[s.team] ?? TEAM_SHOT.red;
}

// Horizontal direction of travel, also for lobs (which carry no dir).
function travelDir(s) {
  const tg = s.data?.target;
  if (tg && tg.col !== undefined && Math.abs(tg.col - (s.x ?? tg.col)) > 0.01) return Math.sign(tg.col - s.x);
  if (s.dir) return s.dir < 0 ? -1 : 1;
  return s.team === 'blue' ? -1 : 1;
}

function cellsOf(s) {
  const c = s.data?.cells;
  return c && c.length ? c : [[s.col ?? s.x ?? 0, s.row ?? s.y ?? 0]];
}

// Screen point of cell (c, r) relative to the spell's own draw point.
function cellPoint(s, x, y, c, r) {
  const d = cellDelta(s.x ?? c, s.y ?? r, c, r);
  return [x + d.dx, y + d.dy];
}

// Frames since a drop() spell landed (or -1).
function landedAge(s) {
  if (!s.data?.landed) return -1;
  return Math.max(0, (s.t ?? 0) - (s.data.delay ?? 0));
}

function floorShadow(ctx, x, y, z, base = 6) {
  const k = Math.max(0.35, 1 - z / 90);
  withAlpha(ctx, 0.4, () => ellipse(ctx, x, y, Math.max(2, Math.round(base * k)), Math.max(1, Math.round(2 * k)), '#000000'));
}

// ---------------------------------------------------------------- ground crawlers

// A breaking wave rolling toward dir: a long back slope, a crest that curls over a hollow front face,
// foam on the lip and spray. pal = [foam, light, mid, dark].
const WAVE_OUTER = [[-0.5, 0], [-0.4, 0.18], [-0.26, 0.45], [-0.1, 0.72], [0.06, 0.92], [0.2, 1], [0.33, 0.97], [0.43, 0.86], [0.47, 0.72], [0.4, 0.64], [0.33, 0.69], [0.29, 0.55], [0.33, 0.3], [0.42, 0.12], [0.5, 0]];
const WAVE_MID = [[-0.38, 0], [-0.24, 0.36], [-0.08, 0.64], [0.08, 0.82], [0.2, 0.88], [0.3, 0.84], [0.36, 0.76], [0.28, 0.62], [0.24, 0.5], [0.28, 0.26], [0.36, 0]];
const WAVE_LIGHT = [[-0.2, 0], [-0.1, 0.3], [0.04, 0.55], [0.14, 0.66], [0.2, 0.5], [0.18, 0.28], [0.24, 0]];
function crestWave(ctx, x, y, d, t, pal, height, width) {
  const bob = [0, 1, 2, 1][(t >> 2) % 4];
  const h = height + bob;
  const P = (pts, dy = 0) => pts.map(([u, v]) => [x + d * u * width, y - v * h + dy]);
  poly(ctx, P(WAVE_OUTER), pal[3]);
  poly(ctx, P(WAVE_MID), pal[2]);
  poly(ctx, P(WAVE_LIGHT), pal[1]);
  // Foam along the lip and its curled tip.
  const lip = P([[0.04, 0.9], [0.14, 0.97], [0.26, 0.98], [0.36, 0.93], [0.43, 0.84], [0.45, 0.74]]);
  for (let i = 0; i + 1 < lip.length; i++) {
    line(ctx, lip[i][0], lip[i][1], lip[i + 1][0], lip[i + 1][1], pal[0]);
    line(ctx, lip[i][0], lip[i][1] + 1, lip[i + 1][0], lip[i + 1][1] + 1, pal[0]);
  }
  // Streaks on the back slope.
  for (let i = 0; i < 3; i++) {
    const ph = (t + i * 4) % 10;
    const [sx, sy] = P([[-0.3 + i * 0.12 + ph * 0.012, 0.25 + i * 0.16]])[0];
    rect(ctx, d > 0 ? sx : sx - 3, sy, 4, 1, pal[1]);
  }
  // Spray falling off the front.
  for (let i = 0; i < 5; i++) {
    const ph = (t + i * 3) % 12;
    const [sx, sy] = P([[0.46 + ph * 0.012 + (i % 2) * 0.03, 0.78 - ph * 0.05]])[0];
    px(ctx, sx, sy, i % 2 ? pal[1] : pal[0]);
  }
}

const SHOCK_PAL = ['#ffffff', '#fffbd0', '#ffe08a', '#b8863a'];

function shockwaveSprite(ctx, s, x, y, t, pal = SHOCK_PAL) {
  const d = s.dir < 0 ? -1 : 1;
  const k = s.t ?? t;
  // Three jagged energy spikes riding the floor.
  for (let i = -1; i <= 1; i++) {
    const ph = (k + i * 2 + 6) % 6;
    const h = 9 + [0, 3, 7, 5, 2, 1][ph] + (i === 0 ? 5 : i > 0 ? 2 : 0);
    const bx = x + i * 6 * d;
    poly(ctx, [[bx - 4, y + 1], [bx + d * 3, y - h], [bx + 4, y + 1]], pal[3]);
    poly(ctx, [[bx - 3, y], [bx + d * 3, y - h + 2], [bx + 3, y]], pal[2]);
    poly(ctx, [[bx - 1, y], [bx + d * 2, y - h + 5], [bx + 1, y]], pal[1]);
    line(ctx, bx, y - 2, bx + d * 2, y - h + 4, pal[0]);
  }
  rect(ctx, x - 11, y - 1, 23, 2, pal[2]);
  rect(ctx, x - 8, y - 1, 17, 1, pal[1]);
  // Debris kicked up behind.
  for (let i = 0; i < 3; i++) {
    const ph = (k * 2 + i * 7) % 14;
    const bx = x - d * (8 + ph);
    const by = y - 2 - Math.round(Math.sin((ph / 14) * Math.PI) * 8);
    rect(ctx, bx, by, 2, 2, i % 2 ? '#b8a888' : '#8a7a68');
  }
}

// ---------------------------------------------------------------- lobbed things

function lobbed(ctx, s, x, y, r, drawBody) {
  const z = s.z ?? 0;
  floorShadow(ctx, x, y, z, r + 1);
  drawBody(x, y - z - r - 1);
}

function drawBomb(ctx, cx, cy, t, d) {
  disc(ctx, cx, cy, 6, OUTLINE);
  disc(ctx, cx, cy, 5, '#2c3e78');
  disc(ctx, cx - 1, cy - 1, 3, '#3e56a0');
  rect(ctx, cx - 3, cy - 3, 2, 1, '#c8d8ff');
  // Cap and fuse rotate with the throw.
  const a = -Math.PI / 2 + (t * 0.35 * d);
  const capx = Math.round(cx + Math.cos(a) * 5);
  const capy = Math.round(cy + Math.sin(a) * 5);
  rect(ctx, capx - 1, capy - 1, 3, 3, OUTLINE);
  px(ctx, capx, capy, '#c8d0e0');
  const fx = Math.round(cx + Math.cos(a) * 8);
  const fy = Math.round(cy + Math.sin(a) * 8);
  sparkle(ctx, fx, fy, (t >> 1) % 2 ? 1 : 2, '#ffd23f', '#ffffff');
}

function drawIronBall(ctx, cx, cy, t) {
  disc(ctx, cx, cy, 7, OUTLINE);
  disc(ctx, cx, cy, 6, '#3a3f52');
  disc(ctx, cx - 1, cy - 1, 4, '#565d76');
  disc(ctx, cx - 2, cy - 2, 2, '#8a92ac');
  px(ctx, cx - 3, cy - 3, '#e0e6f4');
  // A rivet band that spins.
  const off = ((t >> 1) % 4) - 2;
  line(ctx, cx + off - 3, cy + 4, cx + off + 3, cy - 4, '#2a2e3e');
}

function drawIceBall(ctx, cx, cy, t) {
  disc(ctx, cx, cy, 7, '#1a4a7a');
  disc(ctx, cx, cy, 6, '#6ac8f0');
  poly(ctx, [[cx - 5, cy], [cx, cy - 6], [cx + 1, cy], [cx, cy + 5]], '#bff0ff');
  poly(ctx, [[cx + 1, cy - 5], [cx + 5, cy - 1], [cx + 2, cy + 1]], '#9adcf8');
  line(ctx, cx - 3, cy - 3, cx - 1, cy - 5, '#ffffff');
  if ((t >> 2) % 2) sparkle(ctx, cx + 4, cy - 5, 1, '#e8fbff', '#ffffff');
  for (let i = 0; i < 3; i++) px(ctx, cx - 6 - i * 2, cy + ((t + i) % 3) - 1, '#bff0ff');
}

function drawLavaBall(ctx, cx, cy, t, d) {
  for (let i = 0; i < 4; i++) {
    const ph = (t + i * 3) % 9;
    disc(ctx, cx - d * (4 + ph), cy + 1 - (ph >> 1), Math.max(0, 2 - (ph >> 2)), ph < 4 ? '#ffd23f' : '#ff6a1f');
  }
  disc(ctx, cx, cy, 7, '#5a1a10');
  disc(ctx, cx, cy, 6, '#d8401a');
  disc(ctx, cx - 1, cy - 1, 4, '#ff8a2a');
  disc(ctx, cx - 1, cy - 1, 2, '#ffd23f');
  px(ctx, cx - 2, cy - 2, '#fff6c8');
  rect(ctx, cx + 2, cy + 2, 2, 2, '#7a2010');
  rect(ctx, cx - 4, cy + 3, 2, 1, '#7a2010');
}

// ---------------------------------------------------------------- small pixel sprites

const RAT_PAL = Object.freeze({ a: '#c8d0e0', b: '#8a94ac', c: '#5a6278', d: '#3a4054', p: '#ff9ac0', r: '#ff3a3a', n: '#2a2440', N: '#4a4068', w: '#ffffff' });
const RAT_SIDE = [
  [
    '.....nnnn.....',
    '....nNNnnn....',
    '...nNnnnnnn.pp',
    '..abbbbbbbbbpa',
    '.abbbbbbbbbbbr',
    'cbbbbbbbbbbbaw',
    'c.bbbbbbbbbbb.',
    '...d.d...d.d..',
  ],
  [
    '.....nnnn.....',
    '....nNNnnn....',
    '...nNnnnnnn.pp',
    '..abbbbbbbbbpa',
    '.abbbbbbbbbbbr',
    'cbbbbbbbbbbbaw',
    'c.bbbbbbbbbbb.',
    '..d.d.....d.d.',
  ],
];
const RAT_FRONT = ['..pp..pp..', '..pnnnnp..', '.anNnnnna.', 'abbbbbbbba', 'abrbbbbrba', 'bbbbwwbbbb', '.bbbbbbbb.', '.d.d..d.d.'];
const RAT_BACK = ['..pp..pp..', '..nnnnnn..', '.nNNnnnnn.', 'abbbbbbbba', 'abbbbbbbba', 'bbbbbbbbbb', '.bbbbcbbb.', '.d.d.cd.d.'];

const BIGRAT_PAL = Object.freeze({ ...RAT_PAL, a: '#e0b8c8', b: '#b07a98', c: '#7a4a66', d: '#4a2a40', n: '#2a1830', N: '#5a3a68', s: '#e0e6f4' });
const BIGRAT = [
  [
    '........nnnnnnn...........',
    '......nnNNNnnnnnn.....s.s.',
    '.....nNNnnnnnnnnnn...pppp.',
    '....nNnnnnnnnnnnnnn.ppppa.',
    '...aabbbbbbbbbbbbbbbbbbaaa',
    '..abbbbbbbbbbbbbbbbbbbbbrr',
    '.abbbbbbbbbbbbbbbbbbbbbbbr',
    'cbbbbbbbbbbbbbbbbbbbbbaaww',
    'cbbbbbbbbbbbbbbbbbbbbbbbaw',
    'c.bbbbbbbbbbbbbbbbbbbbbbb.',
    'c..bbbbbbbbbbbbbbbbbbbbb..',
    '....dd.dd.......dd.dd.....',
  ],
  [
    '........nnnnnnn...........',
    '......nnNNNnnnnnn.....s.s.',
    '.....nNNnnnnnnnnnn...pppp.',
    '....nNnnnnnnnnnnnnn.ppppa.',
    '...aabbbbbbbbbbbbbbbbbbaaa',
    '..abbbbbbbbbbbbbbbbbbbbbrr',
    '.abbbbbbbbbbbbbbbbbbbbbbbr',
    'cbbbbbbbbbbbbbbbbbbbbbaaww',
    'cbbbbbbbbbbbbbbbbbbbbbbbaw',
    'c.bbbbbbbbbbbbbbbbbbbbbbb.',
    'c..bbbbbbbbbbbbbbbbbbbbb..',
    '..dd.dd.........dd.dd.....',
  ],
];

const FIST_PAL = Object.freeze({ W: '#ffffff', A: '#dbe5f5', B: '#a6b5d0', C: '#7180a3', D: '#475273', E: '#2b3250', 2: '#86f3ff', 3: '#27c3ee', 4: '#1281b3' });
const FIST_SIDE = [
  '....AAAAB...',
  '...AWWWABC..',
  '..AWAAAABBC.',
  'ABBAAAAABBCD',
  '324AABABBBCD',
  '324ABCBCBCCD',
  'ABBBBBBBCCDD',
  '.BCDCCCCCDD.',
  '.....DDDD...',
];
const IRON_PAL = Object.freeze({ W: '#f4f4f8', A: '#c0c6d4', B: '#8e96aa', C: '#646c82', D: '#444a5e', E: '#2a2e3c', 2: '#ffd07a', 3: '#ff8a2a', 4: '#c0501a' });
const FIST_DOWN = [
  '.....DDDDDDDDDD.....', // cuff
  '....D3232323232D....',
  '....DCCCCCCCCCCD....',
  '...AAABBBBBBBBBCD...',
  '..AWWAABBBBBBBBBCD..',
  '.AWWAAABBBBBBBBBCCD.', // back of the hand
  '.AWAAAABBBBBBBBBBCD.',
  'AWAAAABBBBBBBBBBBCD.',
  'AAAAABBBBBBBBBBBBCD.',
  'ABAABBEBBBEBBBEBBCD.', // fingers
  'ABAABBEBBBEBBBEBBCD.',
  '.BAABEBBBBEBBBEBBCD.',
  '.BBBCEBBBCEBBBCEBCD.',
  '..CC.EBCBCEBCBCEBD..', // knuckles
  '......CCC..CCC..C...',
];

const YOYO_PAL = Object.freeze({ a: '#f0f4ff', b: '#b8c4dc', c: '#7a86a6', d: '#4a5272', r: '#ff5a7a', R: '#c02a4a', w: '#ffffff' });

// ---------------------------------------------------------------- the registry

export const SPELL_SPRITES = {
  shockwave: {
    draw(ctx, s, x, y, t) {
      shockwaveSprite(ctx, s, x, y, t);
    },
  },

  shot: {
    draw(ctx, s, x, y, t) {
      const d = s.dir < 0 ? -1 : 1;
      const yy = y - CHEST - (s.z ?? 0);
      const r = shotRamp(s);
      rect(ctx, d > 0 ? x - 10 : x + 1, yy - 1, 9, 2, r[3]);
      rect(ctx, d > 0 ? x - 6 : x + 1, yy - 1, 5, 1, r[2]);
      disc(ctx, x, yy, 3, r[2]);
      disc(ctx, x, yy, 2, r[1]);
      px(ctx, x, yy, r[0]);
      if ((t >> 1) % 2) px(ctx, x + d * 3, yy - 2, r[0]);
    },
  },

  bomb: {
    draw(ctx, s, x, y, t) {
      lobbed(ctx, s, x, y, 5, (cx, cy) => drawBomb(ctx, cx, cy, s.t ?? t, travelDir(s)));
    },
  },
  cannonball: {
    draw(ctx, s, x, y, t) {
      lobbed(ctx, s, x, y, 6, (cx, cy) => drawIronBall(ctx, cx, cy, s.t ?? t));
    },
  },
  iceball: {
    draw(ctx, s, x, y, t) {
      lobbed(ctx, s, x, y, 6, (cx, cy) => drawIceBall(ctx, cx, cy, s.t ?? t));
    },
  },
  lavaball: {
    draw(ctx, s, x, y, t) {
      lobbed(ctx, s, x, y, 6, (cx, cy) => drawLavaBall(ctx, cx, cy, s.t ?? t, travelDir(s)));
    },
  },

  zapring: {
    draw(ctx, s, x, y, t) {
      const yy = y - CHEST;
      const k = s.t ?? t;
      const rx = [4, 3, 2, 3][(k >> 1) % 4];
      withAlpha(ctx, 0.35, () => ellipse(ctx, x, yy, rx + 3, 9, '#ffe23a'));
      ellipseRing(ctx, x, yy, rx + 1, 8, '#b07410');
      ellipseRing(ctx, x, yy, rx, 7, '#ffe23a');
      ellipseRing(ctx, x, yy - 1, Math.max(1, rx - 1), 5, '#fff6c8', Math.PI, Math.PI * 2);
      for (let i = 0; i < 3; i++) {
        const a = k * 0.7 + i * 2.1;
        const sx = x + Math.cos(a) * (rx + 4);
        const sy = yy + Math.sin(a) * 9;
        bolt(ctx, sx, sy, sx + Math.cos(a) * 4, sy + Math.sin(a) * 4, 2, 2, '#ffffff', k + i);
      }
    },
  },

  fist: {
    draw(ctx, s, x, y, t) {
      if (s.data?.delay !== undefined) {
        // Telegraphed drop: a shadow grows on the target and a giant fist falls in.
        const p = s.data.progress ?? 0;
        const la = landedAge(s);
        if (la >= 0) {
          const a = Math.max(0, 1 - la / 6);
          withAlpha(ctx, a, () => sprite(ctx, FIST_DOWN, IRON_PAL, x, y + 1, { anchor: 'feet', outline: OUTLINE }));
          return;
        }
        withAlpha(ctx, 0.25 + 0.35 * p, () => ellipse(ctx, x, y - 2, Math.round(4 + 10 * p), Math.round(2 + 3 * p), '#000000'));
        if ((s.t ?? t) % 8 < 4) ellipseRing(ctx, x, y - 2, Math.round(6 + 10 * p), Math.round(3 + 3 * p), '#ff5a3a');
        const fall = Math.round((1 - p) * (1 - p) * 120);
        sprite(ctx, FIST_DOWN, IRON_PAL, x, y - fall, { anchor: 'feet', outline: OUTLINE });
        for (let i = 0; i < 3; i++) rect(ctx, x - 5 + i * 5, y - fall - 14 - ((t + i * 3) % 6) * 2, 1, 4, '#ffd07a');
        return;
      }
      // Rocket fist in flight.
      const d = s.dir < 0 ? -1 : 1;
      const yy = y - 24 - (s.z ?? 0);
      const k = s.t ?? t;
      for (let i = 0; i < 7; i++) {
        const c = i < 2 ? '#fff27a' : i < 4 ? '#ff9a3a' : '#e0441e';
        rect(ctx, x - d * (7 + i), yy + 4 + (i > 3 && k % 2 ? 1 : 0), 1, i > 4 ? 1 : 2, c);
      }
      sprite(ctx, FIST_SIDE, FIST_PAL, x, yy + 9, { anchor: 'feet', flip: d < 0, outline: OUTLINE });
    },
  },

  flames: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? 0;
      const grow = Math.min(1, (k + 1) / 5);
      const fade = k > 26 ? Math.max(0, 1 - (k - 26) / 10) : 1;
      const cols = ['#fff6c8', '#ffd23f', '#ff7a1f', '#c42e18'];
      cellsOf(s).forEach(([c, r], i) => {
        const [cx, cy] = cellPoint(s, x, y, c, r);
        const sc = grow * fade;
        if (sc <= 0) return;
        withAlpha(ctx, 0.35 * sc, () => ellipse(ctx, cx, cy - 3, 15, 5, '#ff7a1f'));
        for (let j = 0; j < 3; j++) {
          const fx = cx + (j - 1) * 9;
          const h = Math.round((12 + ((t + i * 5 + j * 7) % 7) + (j === 1 ? 7 : 0)) * sc);
          if (h > 2) flameTongue(ctx, fx, cy, j === 1 ? 5 : 4, h, t, i * 3 + j, cols);
        }
        for (let j = 0; j < 2; j++) {
          const ph = (t + i * 7 + j * 11) % 18;
          px(ctx, cx - 6 + j * 12 + (ph % 3), cy - 18 - ph, ph < 9 ? '#ffd23f' : '#ff7a1f');
        }
      });
    },
  },

  ratton: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      const turned = s.data?.turned ?? 0;
      const yy = y - 1;
      if (turned) {
        const rows = turned > 0 ? RAT_FRONT : RAT_BACK;
        const bob = (k >> 1) % 2;
        sprite(ctx, rows, RAT_PAL, x, yy - bob, { anchor: 'feet', outline: OUTLINE });
        sparkle(ctx, x + 3, yy - 11 - bob, (k >> 1) % 2 ? 1 : 2, '#ffd23f', '#ffffff');
        return;
      }
      const d = s.dir < 0 ? -1 : 1;
      const rows = RAT_SIDE[(k >> 1) % 2];
      sprite(ctx, rows, RAT_PAL, x, yy, { anchor: 'feet', flip: d < 0, outline: OUTLINE });
      // Fuse spark on the bomb back.
      sparkle(ctx, x - d * 1, yy - 10, (k >> 1) % 2 ? 1 : 2, '#ffd23f', '#ffffff');
      // Dust behind.
      if (k % 4 < 2) px(ctx, x - d * 9, yy - 1, '#a8a0b8');
    },
  },

  megarat: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      const d = s.dir < 0 ? -1 : 1;
      const rows = BIGRAT[(k >> 1) % 2];
      sprite(ctx, rows, BIGRAT_PAL, x, y - 1, { anchor: 'feet', flip: d < 0, outline: OUTLINE });
      // Three lit fuses on the back.
      for (let i = 0; i < 3; i++) sparkle(ctx, x - d * (6 - i * 4), y - 15 - (i === 1 ? 2 : 0), (k + i) % 3 ? 1 : 2, '#ffd23f', '#ffffff');
      for (let i = 0; i < 2; i++) {
        const ph = (k + i * 3) % 6;
        disc(ctx, x - d * (15 + ph), y - 2, ph < 3 ? 2 : 1, '#9a92aa');
      }
    },
  },

  wave: {
    draw(ctx, s, x, y, t) {
      crestWave(ctx, x, y, s.dir < 0 ? -1 : 1, s.t ?? t, ['#ffffff', '#9ae8ff', '#3a9cff', '#1f56c8'], 24, 30);
    },
  },
  lavawave: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      crestWave(ctx, x, y, s.dir < 0 ? -1 : 1, k, ['#fff6c8', '#ffd23f', '#ff6a1f', '#a8281a'], 24, 30);
      for (let i = 0; i < 3; i++) rect(ctx, x - 8 + i * 6, y - 4 - ((k + i * 5) % 10), 2, 1, '#5a1a10');
    },
  },
  mudwave: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      crestWave(ctx, x, y, s.dir < 0 ? -1 : 1, k, ['#e8dcb0', '#ae9058', '#76603a', '#433822'], 24, 30);
      for (let i = 0; i < 3; i++) rect(ctx, x - 9 + i * 7, y - 6 - ((k + i * 4) % 9), 2, 2, i % 2 ? '#6ab04a' : '#4a8a2a');
    },
  },

  icewave: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      const d = s.dir < 0 ? -1 : 1;
      const rise = Math.min(1, ((k % 6) + 2) / 5);
      const shards = [[-10, 12, 3], [-2, 22, 5], [7, 16, 4]];
      ellipseRing(ctx, x, y - 1, 16, 3, '#bff0ff');
      shards.forEach(([ox, h, w], i) => {
        const hh = Math.round(h * (i === 1 ? 1 : rise));
        const bx = x + ox * d;
        poly(ctx, [[bx - w - 1, y + 1], [bx - w - 1, y - hh + w], [bx + d, y - hh - 1], [bx + w + 1, y - hh + w], [bx + w + 1, y + 1]], '#123a66');
        poly(ctx, [[bx - w, y], [bx - w, y - hh + w], [bx + d, y - hh], [bx + w, y - hh + w], [bx + w, y]], '#6ac8f0');
        poly(ctx, [[bx - w, y], [bx - w, y - hh + w], [bx + d, y - hh], [bx + d, y]], '#bff0ff');
        line(ctx, bx - w + 1, y - 2, bx - w + 1, y - hh + w + 1, '#ffffff');
      });
      if ((k >> 1) % 3 === 0) sparkle(ctx, x + d * 2, y - 24, 2, '#e8fbff', '#ffffff');
      for (let i = 0; i < 3; i++) px(ctx, x - d * (12 + i * 3), y - 2 - ((k + i * 2) % 6), '#e8fbff');
    },
  },

  tornado: {
    draw(ctx, s, x, y, t) {
      cellsOf(s).forEach(([c, r]) => {
        const [cx, cy] = cellPoint(s, x, y, c, r);
        const k = s.t ?? t;
        const H = 36;
        withAlpha(ctx, 0.3, () => ellipse(ctx, cx, cy - 1, 12, 3, '#c8d0e0'));
        for (let i = 0; i < 12; i++) {
          const yy = cy - 2 - i * 3;
          const w = 3 + Math.round((i / 11) * 11);
          const ph = (k * 0.8 + i * 0.9) % (Math.PI * 2);
          const off = Math.round(Math.sin(ph) * 2 + Math.sin(i * 0.7 + k * 0.2) * 2);
          const c0 = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#d8e2f4' : '#a8b4cc';
          rect(ctx, cx - w + off, yy, w * 2, 2, i % 2 ? '#8a96b0' : '#b8c4dc');
          const sx = Math.round(Math.cos(ph) * w);
          rect(ctx, cx + off + sx - 2, yy, 4, 1, c0);
        }
        for (let i = 0; i < 3; i++) {
          const a = k * 0.5 + i * 2.1;
          rect(ctx, cx + Math.round(Math.cos(a) * 14), cy - 10 - i * 8 + Math.round(Math.sin(a) * 2), 2, 2, '#7a6a58');
        }
        void H;
      });
    },
  },

  yoyo: {
    draw(ctx, s, x, y, t) {
      const yy = y - CHEST;
      const k = s.t ?? t;
      if (s.owner && s.owner.col !== undefined) {
        const own = cellDelta(s.x, s.y, s.owner.col, s.owner.row ?? s.y);
        const hx = x + own.dx + (s.owner.facing ?? 1) * 10;
        line(ctx, hx, y + own.dy - 20, x, yy, '#e8eef8');
      }
      disc(ctx, x, yy, 7, OUTLINE);
      disc(ctx, x, yy, 6, '#b8c4dc');
      disc(ctx, x - 1, yy - 1, 4, '#f0f4ff');
      ring(ctx, x, yy, 4, '#ff5a7a');
      const a = k * 0.9;
      for (let i = 0; i < 3; i++) {
        const aa = a + (i * Math.PI * 2) / 3;
        line(ctx, x, yy, x + Math.round(Math.cos(aa) * 4), yy + Math.round(Math.sin(aa) * 4), '#c02a4a');
      }
      px(ctx, x, yy, '#ffffff');
      if (k % 6 < 3) sparkle(ctx, x + 6, yy - 6, 1, '#ffffff', '#ffffff');
    },
  },

  boomer: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      const cy = y - 12;
      const a = k * 0.9;
      withAlpha(ctx, 0.35, () => ellipse(ctx, x, y - 1, 6, 2, '#000000'));
      ellipseRing(ctx, x, cy, 10, 6, '#bdf08a', a + Math.PI, a + Math.PI * 1.6);
      // Two arms of a V, rotating.
      for (const off of [0, 1.9]) {
        const ax = x + Math.cos(a + off) * 8;
        const ay = cy + Math.sin(a + off) * 6;
        streak(ctx, x, cy, ax, ay, 3, OUTLINE);
        streak(ctx, x, cy, ax, ay, 2, '#c89050');
        line(ctx, x, cy, ax, ay, '#e8c088');
        disc(ctx, ax, ay, 2, '#3fbe3a');
        px(ctx, ax, ay, '#d8f0a0');
      }
      disc(ctx, x, cy, 2, '#8a5a2a');
      px(ctx, x, cy, '#e8c088');
    },
  },

  meteor: {
    draw(ctx, s, x, y, t) {
      if (s.data?.landed) return;
      const p = s.data?.progress ?? 0;
      const k = s.t ?? t;
      // Target marker.
      const blink = k % (p > 0.7 ? 4 : 8) < (p > 0.7 ? 2 : 4);
      ellipseRing(ctx, x, y - 4, 14, 6, blink ? '#ff5a3a' : '#a02a1a');
      ellipseRing(ctx, x, y - 4, Math.round(14 - 8 * p), Math.round(6 - 3 * p), '#ffd23f');
      rect(ctx, x - 1, y - 4, 3, 1, '#ffd23f');
      // The rock falls in from the upper left.
      const q = 1 - p;
      const mx = x - Math.round(q * 46);
      const my = y - 8 - Math.round(q * 120);
      for (let i = 1; i <= 4; i++) {
        const tx = mx - i * 4;
        const ty = my - i * 9;
        disc(ctx, tx, ty, Math.max(1, 5 - i), i < 2 ? '#ffd23f' : i < 3 ? '#ff7a1f' : '#c42e18');
      }
      disc(ctx, mx, my, 7, OUTLINE);
      disc(ctx, mx, my, 6, '#ff7a1f');
      disc(ctx, mx, my, 5, '#5a3a2a');
      disc(ctx, mx - 1, my - 1, 3, '#7a5238');
      px(ctx, mx - 2, my - 2, '#b8885a');
      rect(ctx, mx + 2, my + 1, 2, 2, '#ffd23f');
      px(ctx, mx - 3, my + 2, '#ffd23f');
    },
  },

  plasma: {
    draw(ctx, s, x, y, t) {
      cellsOf(s).forEach(([c, r]) => {
        const [cx, cy0] = cellPoint(s, x, y, c, r);
        const cy = cy0 - CHEST;
        const k = s.t ?? t;
        ring(ctx, cx, cy, 9 + ((k >> 1) % 2), k % 4 < 2 ? '#fff27a' : '#ffcf1f');
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 + k * 0.4;
          bolt(ctx, cx, cy, cx + Math.cos(a) * 15, cy + Math.sin(a) * 12, 3, 3, i % 2 ? '#ffffff' : '#ffe23a', k * 7 + i);
        }
        // An arc from the sky into the panel.
        if (k % 8 < 3) bolt(ctx, cx + 6, cy - 40, cx, cy, 5, 4, '#fff6c8', k, null);
        disc(ctx, cx, cy, 5, '#ffcf1f');
        disc(ctx, cx, cy, 4, '#fff27a');
        disc(ctx, cx, cy, 2, '#ffffff');
      });
    },
  },

  mine: {
    draw(ctx, s, x, y, t) {
      if (s.data?.hidden) return;
      ellipse(ctx, x, y - 2, 6, 2, OUTLINE);
      ellipse(ctx, x, y - 3, 5, 2, '#5a6278');
      px(ctx, x, y - 4, (t >> 3) % 2 ? '#ff4a4a' : '#6a1a1a');
    },
  },

  geyser: {
    draw(ctx, s, x, y, t) {
      if (s.data?.landed) return;
      const p = s.data?.progress ?? 0;
      const k = s.t ?? t;
      const rx = Math.round(5 + 9 * p);
      ellipse(ctx, x, y - 4, rx, Math.max(2, Math.round(rx / 3)), '#1f56c8');
      ellipse(ctx, x, y - 4, Math.max(1, rx - 2), Math.max(1, Math.round(rx / 3) - 1), '#3a9cff');
      for (let i = 0; i < 4; i++) {
        const ph = (k + i * 5) % 14;
        const bx = x - rx + 3 + Math.round(hash(i, 2) * (rx * 2 - 6));
        if (ph < 8) px(ctx, bx, y - 4 - (ph >> 1), '#bfe9ff');
        else ring(ctx, bx, y - 4 - (ph >> 1), 1, ph < 12 ? '#bfe9ff' : '#ffffff');
      }
      if (p > 0.6 && k % 4 < 2) rect(ctx, x - 1, y - 10, 2, 4, '#e8fbff');
    },
  },

  eruption: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      const la = landedAge(s);
      if (la >= 0) {
        // Lava pillar: a roaring column with blobs flung off the top.
        const a = Math.max(0, 1 - la / 8);
        const h = Math.round(48 * Math.min(1, (la + 1) / 2));
        withAlpha(ctx, a, () => {
          flameTongue(ctx, x, y, 9, h, k, 7, ['#fff6c8', '#ffd23f', '#ff6a1f', '#a8281a']);
          for (let i = 0; i < 5; i++) {
            const bx = x + (i - 2) * 5 + (i - 2) * la;
            const by = y - h + 4 - la * 2 + Math.abs(i - 2) * 3 + la * la * 0.5;
            disc(ctx, bx, by, i === 2 ? 3 : 2, i % 2 ? '#ffd23f' : '#ff6a1f');
          }
          ellipse(ctx, x, y - 2, 13, 4, '#c42e18');
          ellipse(ctx, x, y - 2, 9, 2, '#ffd23f');
        });
        return;
      }
      const p = s.data?.progress ?? 0;
      const rx = Math.round(4 + 10 * p);
      ellipse(ctx, x, y - 4, rx, Math.max(2, Math.round(rx / 3)), '#5a1a10');
      ellipse(ctx, x, y - 4, Math.max(1, rx - 2), Math.max(1, Math.round(rx / 3) - 1), k % 6 < 3 ? '#c42e18' : '#e0441e');
      line(ctx, x - rx + 2, y - 4, x + rx - 2, y - 5, '#ffd23f');
      for (let i = 0; i < 3; i++) {
        const ph = (k + i * 4) % 12;
        disc(ctx, x - rx + 3 + i * Math.max(2, rx - 2), y - 5 - (ph >> 1), ph < 8 ? 1 : 0, '#ffd23f');
      }
    },
  },

  firetower: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? 0;
      const grow = Math.min(1, (k + 1) / 6);
      const fade = k > 24 ? Math.max(0, 1 - (k - 24) / 8) : 1;
      const cols = ['#fff6c8', '#ffd23f', '#ff7a1f', '#c42e18'];
      cellsOf(s).forEach(([c, r], i) => {
        const [cx, cy] = cellPoint(s, x, y, c, r);
        const h = Math.round((34 + ((t + i * 3) % 5) * 2) * grow * fade);
        if (h < 3) return;
        withAlpha(ctx, 0.4, () => ellipse(ctx, cx, cy - 2, 13, 4, '#ff7a1f'));
        flameTongue(ctx, cx, cy, 9, h, t, i, cols);
        flameTongue(ctx, cx - 7, cy, 4, Math.round(h * 0.55), t, i + 5, cols);
        flameTongue(ctx, cx + 7, cy, 4, Math.round(h * 0.5), t, i + 9, cols);
        for (let j = 0; j < 3; j++) {
          const ph = (t + j * 6 + i * 4) % 16;
          px(ctx, cx - 4 + j * 4, cy - h - ph, '#ffd23f');
        }
      });
    },
  },

  reflect: {
    draw(ctx, s, x, y, t) {
      const d = s.dir < 0 ? -1 : 1;
      const yy = y - 16;
      const k = s.t ?? t;
      crescent(ctx, x, yy, 9, 3, 11, d, '#27c3ee');
      crescent(ctx, x + d, yy, 8, 4, 9, d, '#bff4ff');
      crescent(ctx, x + d * 2, yy, 7, 5, 7, d, '#ffffff');
      for (let i = 0; i < 3; i++) rect(ctx, d > 0 ? x - 8 - i * 4 : x + 5 + i * 4, yy - 6 + i * 6, 3, 1, (k + i) % 2 ? '#86f3ff' : '#27c3ee');
    },
  },

  reticle: {
    draw(ctx, s, x, y, t) {
      const p = s.data?.progress ?? 0;
      const k = s.t ?? t;
      const cy = y - CHEST;
      const r = Math.round(16 - 9 * p);
      const fast = p > 0.7;
      const on = k % (fast ? 4 : 10) < (fast ? 2 : 7);
      const c = on ? '#ff3a3a' : '#a01e1e';
      const L = 4;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = x + sx * r;
        const yy = cy + sy * r;
        rect(ctx, sx < 0 ? cx : cx - L + 1, yy, L, 1, c);
        rect(ctx, cx, sy < 0 ? yy : yy - L + 1, 1, L, c);
      }
      rect(ctx, x - 1, cy, 3, 1, c);
      rect(ctx, x, cy - 1, 1, 3, c);
      if (p > 0.85 && on) ring(ctx, x, cy, r + 2, '#ffd0d0');
      withAlpha(ctx, 0.3, () => ellipseRing(ctx, x, y - 2, 12, 4, c));
    },
  },

  zone: {
    draw(ctx, s, x, y, t) {
      const k = s.t ?? t;
      cellsOf(s).forEach(([c, r], i) => {
        const [cx, cy] = cellPoint(s, x, y, c, r);
        for (let j = 0; j < 2; j++) {
          const yy = cy - 2 - ((k + j * 8) % 16);
          withAlpha(ctx, 0.45, () => rect(ctx, cx - 17, yy, 34, 1, '#e8eeff'));
        }
        for (let j = 0; j < 3; j++) {
          const ph = (k + j * 5 + i * 3) % 15;
          sparkle(ctx, cx - 12 + j * 12, cy - 4 - ph, ph < 8 ? 1 : 0, '#e8eeff', '#ffffff');
        }
      });
    },
  },
};

export { shockwaveSprite, crestWave };
