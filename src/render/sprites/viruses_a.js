// Sprite pack: viruses_a. See docs/CONTRACT.md "Sprites". Each registry maps a key to { draw(ctx, obj, x, y, t) }.
import { sprite, recolor, rect, px, line, ellipse, disc, ring, mix, shade } from '../pixel.js';
import { floorPoint } from '../layout.js';

export const ENTITY_SPRITES = {};
export const SPELL_SPRITES = {};
export const FX_SPRITES = {};

const OUTLINE = '#0c0f1c';

// ---------------------------------------------------------------- authoring helpers

// Pixel art from a template string: one row per line, leading/trailing whitespace ignored, '.' is clear.
// Rows are padded to the same width so flipping stays aligned.
function art(src) {
  const rows = src.split('\n').map((l) => l.trim()).filter((l) => l.length);
  const w = Math.max(...rows.map((r) => r.length));
  return Object.freeze(rows.map((r) => r.padEnd(w, '.')));
}

// Stamp parts onto a w x h canvas: compose(w, h, [part, x, y], ...). Later parts draw over earlier ones.
function compose(w, h, ...layers) {
  const g = [];
  for (let i = 0; i < h; i++) g.push(new Array(w).fill('.'));
  for (const [part, x, y] of layers) {
    for (let j = 0; j < part.length; j++) {
      const row = g[y + j];
      if (!row) continue;
      for (let i = 0; i < part[j].length; i++) {
        const ch = part[j][i];
        if (ch !== '.' && x + i >= 0 && x + i < w) row[x + i] = ch;
      }
    }
  }
  return Object.freeze(g.map((r) => r.join('')));
}

const lv = (e) => Math.max(1, Math.min(4, (e && e.level) | 0 || 1));

// Draw a body sprite at the feet point. dx/dy nudge it (dx mirrors with the facing).
function body(ctx, rows, pal, e, x, y, dx = 0, dy = 0) {
  const flip = (e.facing ?? 1) < 0;
  sprite(ctx, rows, pal, x + (flip ? -dx : dx), y + dy, { anchor: 'feet', flip, outline: OUTLINE });
}

// A palette where every key is one colour: the silhouette for Ω glows.
const silhouettes = new Map();
function silhouette(pal, color) {
  let m = silhouettes.get(pal);
  if (!m) silhouettes.set(pal, (m = new Map()));
  let p = m.get(color);
  if (!p) {
    p = {};
    for (const k of Object.keys(pal)) p[k] = color;
    p = Object.freeze(p);
    m.set(color, p);
  }
  return p;
}

// Ω aura: a soft pulsing halo just outside the outline.
function glow(ctx, rows, pal, e, x, y, t, color, dx = 0, dy = 0) {
  const flip = (e.facing ?? 1) < 0;
  const sil = silhouette(pal, color);
  const a = 0.28 + 0.16 * Math.sin((t ?? 0) * 0.15);
  const bx = x + (flip ? -dx : dx);
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    sprite(ctx, rows, sil, bx + ox, y + dy + oy, { anchor: 'feet', flip, outline: color, alpha: a });
  }
}

// Pick a frame from a cycle: every `rate` frames of `t`.
const cyc = (frames, t, rate) => frames[Math.floor(Math.max(0, t || 0) / rate) % frames.length];

// ================================================================ Rivet (construction bot)
// Hard-hatted, single-eyed construction bot with a sledgehammer. Anims: idle, move, windup, swing, hurt.

const RIVET_PAL = Object.freeze({
  H: '#fff7c2', Y: '#ffd83a', y: '#e19a1f', Q: '#9c5410', // helmet
  s: '#fff1a0', S: '#c97a14', // helmet ridge
  l: '#8a5a12', L: '#fffbe0', // lamp frame / lens
  k: '#161a2e', K: '#3a4570', e: '#5ff2ff', E: '#effeff', // visor + eye
  W: '#e4ecf6', M: '#a7b6c9', m: '#6f8099', D: '#46536b', c: '#2b3346', // steel, bolt
  o: '#ff8a1f', x: '#262a3d', // hazard band
  b: '#2c3248', B: '#5d6788', // boots
  G: '#f2f6fb', g: '#a3afbf', q: '#5b6677', // hammer head
  n: '#e2a868', N: '#8b5627', // handle
});
const RIVET_LV = [
  RIVET_PAL,
  // Lv2 foreman: white helmet, blue ridge, green eye.
  recolor(RIVET_PAL, { H: '#ffffff', Y: '#e6ecf6', y: '#a9b5cb', Q: '#66728c', s: '#9cc8ff', S: '#3b6fd1', e: '#7dff8f', E: '#f0fff0', o: '#3b8cff', L: '#e8fff0' }),
  // Lv3 heavy-duty: black helmet, gold ridge, red eye.
  recolor(RIVET_PAL, { H: '#767d9e', Y: '#3d4360', y: '#262b40', Q: '#14172a', s: '#ffd23a', S: '#b8860b', l: '#b8860b', L: '#ffe9a0', e: '#ff4b4b', E: '#fff0f0', o: '#ffc928', W: '#c9d2df', M: '#8794a8', m: '#59667c', D: '#3a4456' }),
  // Ω: violet helmet, magenta glow.
  recolor(RIVET_PAL, { H: '#d2b4ff', Y: '#8455e0', y: '#53309e', Q: '#2c1660', s: '#ff9cf5', S: '#b0309f', l: '#3a1a6e', L: '#ffb8fa', e: '#ff5cf0', E: '#ffffff', o: '#ff4fd8', x: '#1a0f2e', W: '#b3a9cf', M: '#766b9a', m: '#4f4570', D: '#2f2849', c: '#1c1630', b: '#1d1830', B: '#463d6c' }),
];

const RV_HELMET = art(`
  ........HHHHHH.........
  ......HHYYYYYYYy.......
  ....HHYYYYYsYYYYyy.....
  ...HYYYYYYYsYYYlLly....
  ..HYYYYYYYYsYYYlLLly...
  ..YYYYYYYYYsYYYYllyy...
  .HYYYYYYYYYsYYYYYYyy...
  .YYYYYYYYYYSYYYYYYYyy..
  yyyyyyyyyyyyyyyyyyyyyyy
  .QQQQQQQQQQQQQQQQQQQQQ.
`);
const RV_VISOR = art(`
  kkkkkkkkkkkkkkkkkkk
  kKkkkkkkkkkkkeEEEek
  kKkkkkkkkkkkkeEEEek
  .kkkkkkkkkkkkkeeek.
`);
const RV_VISOR_HURT = art(`
  kkkkkkkkkkkkkkkkkkk
  kKkkkkkkkkkkkEkkkEk
  kKkkkkkkkkkkkkEkEkk
  .kkkkkkkkkkkkkkEkk.
`);
const RV_VISOR_MAD = art(`
  kkkkkkkkkkkkkkkkkkk
  kKkkkkkkkkkkkkeEEEk
  kKkkkkkkkkkkkeEEEek
  .kkkkkkkkkkkkkkkkk.
`);
const RV_BODY = art(`
  ..WWMMMMMMMMMMmD..
  .WWMMMMMMMMMMMMmD.
  .WMMcMMMMMMMMcMmD.
  .oxxooxxooxxooxxD.
  .WMMMMMMMMMMMMMmD.
  ..mmmmmmmmmmmmmD..
`);
const RV_FEET = art(`
  .bbBb.....bbBb.
  bbbbbb...bbbbbb
  .bbbb.....bbbb.
`);
const RV_FEET_UP = art(`
  ..bBb.....bBb..
  .bbbbb...bbbbb.
`);
// Front arm, handle and the sledgehammer resting on the floor.
const RV_HAMMER_REST = art(`
  WMn.......
  MmDNn.....
  .DD.NNn...
  ..GGGGGGGg
  ..Gggggggq
  ..gggggqqq
`);
// Both hands up, hammer raised high behind the helmet.
const RV_HAMMER_UP = art(`
  GGGGGGg........
  GWWGGGq........
  GGggggq........
  gggggqq........
  qqqqqqqnN......
  .......nNn.....
  ........nNn....
  .........nNn...
  ..........nNnWM
  ...........nMmD
`);
// Hammer slammed down in front, with a puff of dust.
const RV_HAMMER_DOWN = art(`
  WMNn.........
  MmDNNnn......
  .DD...NNnn...
  ........GGGGg
  .......GGgggq
  .......Ggggqq
  .......gggqqq
`);

const RV_W = 32;
const RIVET = {
  idle: [
    compose(RV_W, 26, [RV_FEET, 6, 23], [RV_BODY, 4, 16], [RV_VISOR, 4, 12], [RV_HELMET, 2, 2], [RV_HAMMER_REST, 20, 20]),
    compose(RV_W, 26, [RV_FEET, 6, 23], [RV_BODY, 4, 17], [RV_VISOR, 4, 13], [RV_HELMET, 2, 3], [RV_HAMMER_REST, 20, 20]),
  ],
  move: [
    compose(RV_W, 26, [RV_FEET_UP, 6, 22], [RV_BODY, 4, 15], [RV_VISOR, 4, 11], [RV_HELMET, 2, 1], [RV_HAMMER_REST, 20, 18]),
    compose(RV_W, 26, [RV_FEET, 6, 23], [RV_BODY, 4, 17], [RV_VISOR, 4, 13], [RV_HELMET, 2, 3], [RV_HAMMER_REST, 20, 20]),
  ],
  windup: compose(RV_W, 30, [RV_FEET, 6, 27], [RV_BODY, 3, 20], [RV_VISOR_MAD, 3, 16], [RV_HAMMER_UP, 2, 0], [RV_HELMET, 1, 6]),
  swing: compose(RV_W, 26, [RV_FEET, 6, 23], [RV_BODY, 6, 16], [RV_VISOR_MAD, 7, 13], [RV_HELMET, 6, 3], [RV_HAMMER_DOWN, 19, 17]),
  hurt: compose(RV_W, 28, [RV_FEET, 6, 25], [RV_BODY, 3, 18], [RV_VISOR_HURT, 3, 14], [RV_HELMET, 0, 1], [RV_HAMMER_REST, 19, 22]),
};
const RV_CX = 13; // body centre column: keeps the floor shadow under the body, not the hammer

ENTITY_SPRITES.rivet = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = RIVET_LV[L - 1];
    const at = e.animT ?? 0;
    let rows;
    switch (e.anim) {
      case 'move':
        rows = at < 16 ? cyc(RIVET.move, at, 4) : cyc(RIVET.idle, t, 20);
        break;
      case 'windup':
        rows = RIVET.windup;
        break;
      case 'swing':
        rows = RIVET.swing;
        break;
      case 'hurt':
        rows = RIVET.hurt;
        break;
      default:
        rows = cyc(RIVET.idle, t, 20);
    }
    const dx = RV_W / 2 - RV_CX;
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx);
    body(ctx, rows, pal, e, x, y, dx);
    if (e.anim === 'swing' && at < 10) impact(ctx, x + (e.facing ?? 1) * 15, y - 2, at, L === 4 ? '#ff9cf5' : '#fff3b0');
  },
};

// A burst of sparks and dust where something heavy hits the floor (age 0..9).
function impact(ctx, x, y, age, color) {
  const r = 2 + age;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i * Math.PI) / 5;
    const x0 = x + Math.cos(a) * (r - 2);
    const y0 = y + Math.sin(a) * (r - 2) * 0.7;
    px(ctx, x0, y0, age < 5 ? color : '#c8b89a');
    if (age < 6) px(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, age < 3 ? '#ffffff' : color);
  }
  if (age < 4) {
    rect(ctx, x - 1, y - 1, 3, 1, '#ffffff');
    rect(ctx, x, y - 2, 1, 3, '#ffffff');
  }
}

// ================================================================ Plinker (turret)
// A squat bunker turret: plated base, domed head with a scanning slit eye, a stubby cannon.
// Anims: idle, aim, fire, hurt.

const PLINKER_PAL = Object.freeze({
  H: '#a9c4ff', d: '#5a82e6', t: '#3a5bb5', D: '#25397a', // dome
  k: '#121628', e: '#ffd23a', E: '#fffbe0', r: '#ff4040', R: '#ffd0d0', // slit, lens, lock lens
  U: '#c3ccd9', u: '#7e8a9e', w: '#4c5669', p: '#ff8a1f', P: '#ffc27a', // barrel, muzzle band
  G: '#e1e7f0', g: '#a6b0c0', c: '#59647a', q: '#3c4458', // base
  b: '#262b3f', B: '#4a5270', // feet
  a: '#ff5050', // antenna light
});
const PLINKER_LV = [
  PLINKER_PAL,
  // Lv2 desert: sand dome, red lens.
  recolor(PLINKER_PAL, { H: '#fff0c8', d: '#d8b46e', t: '#a8833f', D: '#6f5222', e: '#ff5a3c', E: '#fff0e0', p: '#5aa0ff', P: '#bcd8ff', a: '#40a0ff' }),
  // Lv3 crimson: red dome, charcoal base, gold lens.
  recolor(PLINKER_PAL, { H: '#ff9aa6', d: '#d23a50', t: '#9a2034', D: '#5c1020', e: '#ffe14a', G: '#9aa3b6', g: '#646d82', c: '#3b4256', q: '#262b3c', p: '#ffd23a', P: '#fff0a0', U: '#9aa3b6', u: '#5d6679', w: '#353c4f' }),
  // Ω: violet dome, magenta glow.
  recolor(PLINKER_PAL, { H: '#d6b8ff', d: '#8455e0', t: '#5a33a8', D: '#341b6e', e: '#ff5cf0', E: '#ffffff', r: '#ff5cf0', R: '#ffffff', p: '#ff4fd8', P: '#ffb3f3', G: '#a99fc6', g: '#71678f', c: '#463d66', q: '#2c2545', U: '#a99fc6', u: '#6a6088', w: '#3d3560', a: '#ff5cf0', b: '#1d1830', B: '#3d3560' }),
];

const PL_DOME = art(`
  .......HHHHH.......
  .....HHdddddtt.....
  ....HddddddddttD...
  ...HdddddddddddtD..
  ..HddddddddddddttD.
  ..dkkkkkkkkkkkkktD.
  .Hdkkkkkkkkkkkkkkt.
  .ddkkkkkkkkkkkkkkt.
  .dddddddddddddddtD.
  .ddddddddddddddttD.
  .tttttttttttttttDD.
`);
const PL_ANTENNA = art(`
  a
  c
  c
  c
`);
const PL_BARREL = art(`
  .........pp.
  UUUUUUUUUpPU
  uuuuuuuuupPu
  wwwwwwwwwpPw
  .........pp.
`);
const PL_BARREL_LONG = art(`
  ...........pp.
  UUUUUUUUUUUpPU
  uuuuuuuuuuupPu
  wwwwwwwwwwwpPw
  ...........pp.
`);
const PL_BARREL_SHORT = art(`
  ......pp.
  UUUUUUpPU
  uuuuuupPu
  wwwwwwpPw
  ......pp.
`);
const PL_BASE = art(`
  .....GGGGGGGGGGGGGGGGGG.....
  ...GGggggggggggggggggggqq...
  ..GgcgggggggggggggggggggcqD.
  .GggggqqqgggqqqgggqqqgggggqD
  GgggggggggggggggggggggggggqD
  gggggggggggggggggggggggggqqD
  .qqqqqqqqqqqqqqqqqqqqqqqqqq.
  ..bBbbb..............bBbbb..
  .bbbbbbb............bbbbbbb.
`);
const PL_LENS = [art(`
  eE
  ee
`), art(`
  Ee
  ee
`)];
const PL_LOCK = art(`
  RrR
  rrr
`);
const PL_X = art(`
  E.E
  .E.
`);

const PL_W = 36;
function plinkerFrame(lens, lensX, barrel, domeX = 0, domeY = 0) {
  return compose(PL_W, 24,
    [PL_BASE, 3, 15],
    [PL_ANTENNA, 10 + domeX, 1 + domeY],
    [PL_DOME, 6 + domeX, 5 + domeY],
    [barrel, 22 + domeX, 9 + domeY],
    [lens, lensX + domeX, 11 + domeY],
  );
}
const PLINKER = {
  idle: [plinkerFrame(PL_LENS[0], 16, PL_BARREL), plinkerFrame(PL_LENS[0], 19, PL_BARREL), plinkerFrame(PL_LENS[1], 13, PL_BARREL), plinkerFrame(PL_LENS[0], 19, PL_BARREL)],
  aim: [plinkerFrame(PL_LOCK, 18, PL_BARREL_LONG, 1, 0), plinkerFrame(PL_LOCK, 18, PL_BARREL_LONG, 1, 1)],
  fire: plinkerFrame(PL_LOCK, 18, PL_BARREL_SHORT, -1, 0),
  hurt: plinkerFrame(PL_X, 17, PL_BARREL, -1, -2),
};
const PL_CX = 17;

ENTITY_SPRITES.plinker = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = PLINKER_LV[L - 1];
    const at = e.animT ?? 0;
    const f = (e.facing ?? 1) < 0 ? -1 : 1;
    let rows;
    let jx = 0;
    switch (e.anim) {
      case 'aim':
        rows = cyc(PLINKER.aim, at, 6);
        break;
      case 'fire':
        rows = at < 12 ? PLINKER.fire : PLINKER.idle[0];
        break;
      case 'hurt':
        rows = PLINKER.hurt;
        jx = at % 4 < 2 ? 1 : 0;
        break;
      default:
        rows = cyc(PLINKER.idle, (t ?? 0) + (e.id ?? 0) * 13, 24);
    }
    const dx = PL_W / 2 - PL_CX + jx;
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx);
    body(ctx, rows, pal, e, x, y, dx);
    if (e.anim === 'fire' && at < 8) muzzleFlash(ctx, x + f * 13, y - 13, at, f, L === 4 ? '#ff7ef2' : '#ffd23a');
    if (e.anim === 'hurt' && at < 12) sparks(ctx, x - f * 1, y - 20, at, '#ffe9a0');
    // Lock-on: the antenna light strobes.
    if (e.anim === 'aim' && at % 8 < 4) {
      const w = rows[0].length;
      const ax = f > 0 ? x - (w >> 1) + dx + 11 : x + (w >> 1) - dx - 12;
      px(ctx, ax, y - rows.length + 1, '#ffffff');
    }
  },
};

// Cannon flash: a hot core with a spiky star, fading out over ~8 frames.
function muzzleFlash(ctx, x, y, age, dir, color) {
  const r = Math.max(1, 5 - age);
  disc(ctx, x + dir * 2, y, r, color);
  disc(ctx, x + dir * 2, y, Math.max(0, r - 2), '#ffffff');
  if (age < 4) {
    line(ctx, x + dir * 2, y - r - 2, x + dir * 2, y + r + 2, color);
    line(ctx, x + dir * (r + 5), y, x + dir * 2, y, '#ffffff');
  }
}

// A few bright sparks flying off a struck body.
function sparks(ctx, x, y, age, color) {
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.4;
    const d = 3 + age * 1.2;
    px(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d - age * 0.3, i % 2 ? color : '#ffffff');
  }
}

// ================================================================ Dartfin (torpedo glider)
// A torpedo-shaped fish drone: glass eye, dorsal and tail fins, hovering. Anims: idle, aim, dash, hurt.

const DARTFIN_PAL = Object.freeze({
  H: '#f2f7ff', b: '#b7c6dc', s: '#7d90ad', S: '#4f5f7e', // hull
  n: '#5ad8ff', N: '#2a8fc8', // nose cone / stripe
  F: '#7fe0ff', f: '#2fa8e0', // fins
  k: '#101428', e: '#8ffcff', E: '#ffffff', // eye
  j: '#ffe06a', J: '#ff9a2a', // thruster
});
const DARTFIN_LV = [
  DARTFIN_PAL,
  // Lv2 fire: red hull, flame fins.
  recolor(DARTFIN_PAL, { H: '#ffd9c4', b: '#ff7a4a', s: '#d8402a', S: '#8c2016', n: '#ffd23a', N: '#ff9a1a', F: '#ffe066', f: '#ff8a1a', e: '#fff3a0' }),
  // Lv3: navy hull, gold fins.
  recolor(DARTFIN_PAL, { H: '#c8d2f0', b: '#4c5f9e', s: '#33437a', S: '#1f2a52', n: '#ffd23a', N: '#c8961a', F: '#ffe58a', f: '#d9a521', e: '#ffe14a' }),
  // Ω: violet hull, magenta glow.
  recolor(DARTFIN_PAL, { H: '#e6d4ff', b: '#8a5ee6', s: '#5c37ad', S: '#33196e', n: '#ff7ef2', N: '#c23cbf', F: '#ffa8f6', f: '#d34fd0', e: '#ff8cf5', j: '#ffb3f3', J: '#ff4fd8' }),
];

const DF_BODY = art(`
  ...............FF..........
  ..............FFf..........
  .............FFff..........
  ...........HHHHHHHHHHH.....
  ........HHHbbbbbbbbbbbHHn..
  ......HHbbbbbbbbbbbbbbbbnn.
  .....SbbbbjbbbbbbbbbkkkbnN.
  ....SSnnnnjnnnnnnnnkeeEknNN
  ....SSssssjsssssssskeeekNNN
  .....SssssjssssssssskkkNNN.
  ......SSssssssssssssssNNN..
  ........SSSSSSSSSSSSSS.....
`);
const DF_TAIL_UP = art(`
  FF...
  Fff..
  .ffS.
  ..fS.
  ..fS.
  .ffS.
  ff...
`);
const DF_TAIL_FLAT = art(`
  .....
  FFf..
  .FfS.
  ..fS.
  ..fS.
  .FfS.
  FFf..
`);
const DF_PEC = art(`
  ffff.
  .fFff
  ...ff
`);
const DF_PEC_UP = art(`
  ...ff
  .fFff
  ffff.
`);
const DF_EYE_X = art(`
  kEk
  kkk
  kEk
`);

const DF_W = 34;
const DARTFIN = {
  idle: [
    compose(DF_W, 15, [DF_TAIL_UP, 4, 4], [DF_BODY, 4, 2], [DF_PEC, 14, 12]),
    compose(DF_W, 15, [DF_TAIL_FLAT, 4, 4], [DF_BODY, 4, 2], [DF_PEC_UP, 14, 11]),
  ],
  aim: compose(DF_W, 15, [DF_TAIL_UP, 3, 4], [DF_BODY, 4, 2], [DF_PEC_UP, 13, 11]),
  dash: compose(DF_W, 15, [DF_TAIL_FLAT, 3, 4], [DF_BODY, 4, 2], [DF_PEC, 12, 12]),
  hurt: compose(DF_W, 15, [DF_TAIL_UP, 4, 3], [DF_BODY, 4, 2], [DF_PEC_UP, 14, 11], [DF_EYE_X, 23, 8]),
};
const DF_CX = 17;
const DF_HOVER = 9; // px between the floor and the hull

ENTITY_SPRITES.dartfin = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = DARTFIN_LV[L - 1];
    const at = e.animT ?? 0;
    const tt = (t ?? 0) + (e.id ?? 0) * 11;
    const f = (e.facing ?? 1) < 0 ? -1 : 1;
    let rows;
    let dx = DF_W / 2 - DF_CX;
    let dy = -DF_HOVER + Math.round(Math.sin(tt * 0.12) * 1.5);
    switch (e.anim) {
      case 'aim':
        rows = DARTFIN.aim;
        dx += at % 4 < 2 ? -1 : 0; // quiver
        dy = -DF_HOVER;
        break;
      case 'dash':
        rows = DARTFIN.dash;
        dy = -DF_HOVER + 1;
        break;
      case 'hurt':
        rows = DARTFIN.hurt;
        dy = -DF_HOVER + 2;
        break;
      default:
        rows = cyc(DARTFIN.idle, tt, 10);
    }
    if (e.anim === 'dash') speedLines(ctx, x - f * 16, y + dy - 7, f, tt, L === 4 ? '#ff9cf5' : '#dff6ff');
    if (e.anim === 'aim' || e.anim === 'dash') thruster(ctx, x - f * 13, y + dy - 7, f, e.anim === 'dash' ? 7 : 3 + (at % 4 < 2 ? 1 : 0), tt, pal);
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx, dy);
    body(ctx, rows, pal, e, x, y, dx, dy);
  },
};

function speedLines(ctx, x, y, dir, t, color) {
  for (let i = 0; i < 4; i++) {
    const len = 6 + ((t + i * 5) % 7);
    const yy = y + i * 3 - 4;
    const x0 = x - dir * ((i * 3) % 5);
    line(ctx, x0, yy, x0 - dir * len, yy, i % 2 ? color : mix(color, '#5a6a90', 0.5));
  }
}

// Exhaust jet out of the tail: a hot cone pointing backwards, `len` px long, flickering.
function thruster(ctx, x, y, dir, len, t, pal) {
  const n = len + (t % 3 === 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    const half = k < 0.5 ? 1 : 0;
    const c = k < 0.25 ? '#ffffff' : k < 0.6 ? pal.j : pal.J;
    rect(ctx, x - dir * i, y - half, 1, 1 + half * 2, c);
  }
}

// ================================================================ Emberhound (fire hound)
// A lean hound with a burning mane and torch tail. Anims: idle, move, windup, fire, hurt.

const EMBER_PAL = Object.freeze({
  A: '#ff9a6a', B: '#e0483a', C: '#a02632', D: '#5e1426', // fur
  k: '#24101c', e: '#fff27a', w: '#fff2e0', m: '#5a0c18', M: '#ffb13b', // nose, eye, teeth, mouth, mouth glow
  Y: '#fffbe0', y: '#ffe14a', o: '#ff9a1f', r: '#ff4a1a', // flame core → rim
  s: '#ffb36b', // ember spots
});
const EMBER_LV = [
  EMBER_PAL,
  // Lv2 sunfire: golden fur, white-hot flames, red eyes.
  recolor(EMBER_PAL, { A: '#ffe7a0', B: '#f2a83a', C: '#c0661c', D: '#7a3410', e: '#ff3a2a', y: '#ffffff', o: '#fff07a', r: '#ffa82a', s: '#fff3c0', m: '#7a1e10' }),
  // Lv3 obsidian: charcoal fur, molten cracks.
  recolor(EMBER_PAL, { A: '#7a6a78', B: '#4a3c4c', C: '#2e2433', D: '#1a1220', s: '#ff7a1a', e: '#ffb13b', y: '#ffd23a', o: '#ff6a1a', r: '#e02a1a' }),
  // Ω: violet fur, magenta-violet fire.
  recolor(EMBER_PAL, { A: '#b48ae8', B: '#6e3fc0', C: '#46238a', D: '#281150', e: '#ff8cf5', M: '#ff7ef2', Y: '#ffffff', y: '#ffc8fa', o: '#ff5cf0', r: '#b43cff', s: '#ff9cf5', m: '#2a0838' }),
];

const EH_HEAD = art(`
  ..AC..........
  .ABC..........
  .ABBC.........
  ABBBBAAAA.....
  ABBBBBBBBAA...
  BBBBBekBBBBBA.
  BBBBBBBBBBBBBk
  CBBBBBBBBBBBBk
  CBBBBBmmmmmmm.
  .CCCCwCwCwCC..
  ...CCCCCCC....
`);
const EH_HEAD_OPEN = art(`
  ..AC..........
  .ABC..........
  .ABBC.........
  ABBBBAAAA.....
  ABBBBBBBBAA...
  BBBBBekBBBBBA.
  BBBBBBBBBBBBBk
  CBBBBBBBBwCwCk
  CBBBBBMMMMMM..
  CBBBBMMMMM....
  .CCCCwCwCwCC..
  ...CCCCCCC....
`);
const EH_HEAD_HURT = art(`
  ..............
  ACC...........
  ABBCC.........
  ABBBBAAAA.....
  ABBBBkBBBAA...
  BBBBBBkBBBBBA.
  BBBBBkBBBBBBBk
  CBBBBBBBBBwCwk
  CBBBBBmmmmm...
  .CCCCmmmm.....
  ...CCwCwCC....
`);
const EH_FLAMES_LOW = [
  art(`
    ...........
    .r.....r...
    royr.r.ory.
    oyyoroyoyyo
  `),
  art(`
    ..r....r...
    .ror..roy..
    royyrroyyr.
    oyyyoyyyyyo
  `),
  art(`
    ...r.....r.
    ..ror..rory
    .royrrroyyo
    oyyyoyyyyyo
  `),
];
const EH_TORSO = art(`
  ...AAAAAAAAAAA...
  .AABBBsBBBBBBBA..
  ABBBBBBBBBsBBBBB.
  BBBsBBBBBBBBBBBBC
  BBBBBBBBBBBBBBBCC
  CBBBBBBBsBBBBBBCC
  .CCBBBBBBBBBBBCC.
  ...CCCCCCCCCCC...
`);
const EH_LEGS = art(`
  .DCBC.......DCBC..
  .DCBC.......DCBC..
  .DCB........DCB...
  DDCB.......DDCB...
  DDCBw......DDCBw..
  DDkkk......DDkkk..
`);
const EH_LEGS_LEAP = art(`
  DCBC.............DCBC.
  .DCBC...........DCBC..
  ..DCBC.........DCBw...
  ...DCkk.......DCkk....
`);
const EH_LEGS_REAR = art(`
  .DCBC..............
  DDCBC..............
  DDCBB..............
  DDCBBw.............
  DDkkkk.............
`);
const EH_FRONT_UP = art(`
  ..CBC.
  .CBBC.
  CBBw..
  Ck....
`);
const EH_TAIL = art(`
  BC.....
  .BC....
  ..BBC..
  ...BBCC
  .....BB
`);
const EH_FLAMES = [
  art(`
    ..r.......r..
    .ror.....ror.
    .oyo..r..oyo.
    royyr.or.oyyr
    oyYyororoyYyo
    oyYyyyoyyyyyo
  `),
  art(`
    ...r....r....
    ..ror..ror...
    .royo..oyor..
    .oyyo.royyo.r
    royYyoyyYyoro
    oyYyyyyyyyyyo
  `),
  art(`
    .r.......r...
    ror..r..ror..
    oyo.ror.oyo..
    oyyrroyroyyr.
    oyYyoyyyyYyo.
    oyyyyYyyyyyyo
  `),
];
const EH_TAILFLAME = [
  art(`
    ..r..
    .ror.
    royo.
    oyyor
    oyYyo
    .oyo.
  `),
  art(`
    .r...
    .or..
    royr.
    oyyo.
    oyYyo
    .oyo.
  `),
  art(`
    ...r.
    ..ro.
    .royr
    royyo
    oyYyo
    .oyo.
  `),
];

const EH_W = 36;
function houndFrame(f, { head = EH_HEAD, hx = 21, hy = 5, ty = 12, legs = EH_LEGS, lx = 8, ly = 20, tail = true, extra = [], flames = EH_FLAMES } = {}) {
  return compose(EH_W, 26,
    [EH_TAILFLAME[f], 0, ty - 9],
    tail ? [EH_TAIL, 2, ty - 4] : [EH_TAIL, -9, 0],
    [legs, lx, ly],
    [EH_TORSO, 7, ty],
    [flames[f], 9, ty - 5 + (flames === EH_FLAMES ? 0 : 2)],
    [head, hx, hy],
    ...extra,
  );
}
const EMBERHOUND = {
  idle: [0, 1, 2].map((f) => houndFrame(f)),
  idle2: [0, 1, 2].map((f) => houndFrame(f, { hy: 6, ty: 13 })),
  move: [0, 1, 2].map((f) => houndFrame(f, { legs: EH_LEGS_LEAP, lx: 6, ly: 19, ty: 12, hy: 4 })),
  windup: [0, 1, 2].map((f) => houndFrame(f, { head: EH_HEAD_OPEN, hx: 20, hy: 1, ty: 12, legs: EH_LEGS_REAR, lx: 7, ly: 21, extra: [[EH_FRONT_UP, 20, 16]] })),
  fire: [0, 1, 2].map((f) => houndFrame(f, { head: EH_HEAD_OPEN, hx: 22, hy: 7, ty: 13 })),
  hurt: [0, 1, 2].map((f) => houndFrame(f, { head: EH_HEAD_HURT, hx: 18, hy: 8, ty: 14, flames: EH_FLAMES_LOW, legs: EH_LEGS_REAR, lx: 7, ly: 21, extra: [[EH_FRONT_UP, 19, 19]] })),
};
const EH_CX = 17;

ENTITY_SPRITES.emberhound = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = EMBER_LV[L - 1];
    const at = e.animT ?? 0;
    const tt = (t ?? 0) + (e.id ?? 0) * 7;
    const fl = Math.floor(tt / 5) % 3; // flame flicker
    let rows;
    let dx = EH_W / 2 - EH_CX;
    switch (e.anim) {
      case 'move':
        rows = EMBERHOUND.move[fl];
        break;
      case 'windup':
        rows = EMBERHOUND.windup[fl];
        dx += at % 6 < 3 ? 0 : -1;
        break;
      case 'fire':
        rows = EMBERHOUND.fire[fl];
        break;
      case 'hurt':
        rows = EMBERHOUND.hurt[fl];
        break;
      default:
        rows = (Math.floor(tt / 18) % 2 ? EMBERHOUND.idle2 : EMBERHOUND.idle)[fl];
    }
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx);
    body(ctx, rows, pal, e, x, y, dx);
    const f = (e.facing ?? 1) < 0 ? -1 : 1;
    if (e.anim === 'windup') emberGlow(ctx, x + f * 13, y - 21, at, pal);
    if (e.anim === 'fire' && at < 10) breath(ctx, x + f * 19, y - 12, at, f, pal);
  },
};

// Fire gathering in the jaws during the wind-up.
function emberGlow(ctx, x, y, age, pal) {
  const r = Math.min(3, 1 + (age >> 3));
  disc(ctx, x, y, r, pal.o);
  disc(ctx, x, y, Math.max(0, r - 1), pal.y);
  if (age % 8 < 4) px(ctx, x, y - r - 2, pal.y);
}

// A short burst of flame out of the mouth as it spits.
function breath(ctx, x, y, age, dir, pal) {
  const len = 3 + Math.min(age, 5);
  ellipse(ctx, x + dir * (len >> 1), y, len, 3, pal.r);
  ellipse(ctx, x + dir * (len >> 1), y, Math.max(1, len - 2), 2, pal.o);
  ellipse(ctx, x + dir * 1, y, 2, 1, pal.y);
}

// ================================================================ Volthare (electric hare)
// A jittery robot hare: long ears tipped with electrodes, a lightning flash on the haunch, a coil-spring
// tail. Anims: idle, move, windup, fire, hurt.

const VOLT_PAL = Object.freeze({
  H: '#fffbd0', Y: '#ffd93a', y: '#e3a01e', d: '#9a5e12', // fur plating
  c: '#fff6dc', C: '#e8d6a8', // cream belly / cheek
  i: '#ff9a52', // inner ear
  s: '#f2f6ff', S: '#8d98b4', // electrodes, coil
  k: '#151a30', E: '#8ffcff', W: '#ffffff', // eye
  z: '#5a3010', n: '#ff6a8a', // haunch bolt, nose
});
const VOLT_LV = [
  VOLT_PAL,
  // Lv2 blackout: charcoal plating, bright yellow bolt, ears and eyes.
  recolor(VOLT_PAL, { H: '#7a809e', Y: '#454a66', y: '#2c3048', d: '#171a28', c: '#ffe9a0', C: '#e0b840', i: '#ffe14a', z: '#ffe14a', E: '#ffe14a', n: '#ffe14a' }),
  // Lv3 storm: pale plating, electric-yellow bolts and eyes.
  recolor(VOLT_PAL, { H: '#ffffff', Y: '#e6ecf8', y: '#aab4cc', d: '#6a7490', c: '#fff8c0', C: '#e8d870', i: '#ffe14a', z: '#e8b400', E: '#ffe14a', n: '#ffe14a' }),
  // Ω: violet plating, yellow-white glow.
  recolor(VOLT_PAL, { H: '#d8c0ff', Y: '#8a5ae6', y: '#5c37ad', d: '#33196e', c: '#ffe9ff', C: '#d8b0f0', i: '#ffe14a', z: '#ffe14a', E: '#fff38a', n: '#ffe14a', s: '#fff8c0' }),
];

const VH_IDLE = art(`
  ..............sS..sS......
  ..............SS..SS......
  ..............HY..HY......
  ..............HYy.HYy.....
  ..............HiY.HiY.....
  ..............HiY.HiY.....
  ..............HiY.HiY.....
  ..............HiY.HiY.....
  ..............HYy.HYy.....
  ..............HYYyHYy.....
  .............HHYYYYYYy....
  ............HYYYYYYYYYy...
  ............YYYYYkkYYYYy..
  ............YYYYkWEkYYYYn.
  ............YYYYkkEkYYCCy.
  .....HHHHH...yYYYkkYYCcY..
  ...HHYYYYYYHHyyYYYYYYyy...
  ..HYYYYYYYYYYYYyyyyyyc....
  .HYYYzYYYYYYYYYYccccy.....
  .YYYYzzYYYYYYYYccccccy....
  SYYYYYzzYYYYYYYccccccy....
  sSYYYYYzYYYYYYYYccccyy....
  SyYYYYYYYYYYYYYYYyyyy.....
  .yyYYYYYYYYYYyyyyHYy......
  ..yyyyyyyyyyyyy..Yyy......
  ..dHYYYYYYYYYd...yyd......
  .dYYYYYYYYYYYYd...........
`);
const VH_IDLE_TWITCH = art(`
  ......................sS..
  ...................sSSS...
  ..............sS..HYy.....
  ..............SS.HYy......
  ..............HY.HiY......
  ..............HYyHiY......
  ..............HiYHiY......
  ..............HiYHiY......
  ..............HiYHiY......
  ..............HiYHYy......
  .............HHYYYYYYy....
  ............HYYYYYYYYYy...
  ............YYYYYkkYYYYy..
  ............YYYYkWEkYYYYn.
  ............YYYYkkEkYYCCy.
  .....HHHHH...yYYYkkYYCcY..
  ...HHYYYYYYHHyyYYYYYYyy...
  ..HYYYYYYYYYYYYyyyyyyc....
  .HYYYzYYYYYYYYYYccccy.....
  .YYYYzzYYYYYYYYccccccy....
  SYYYYYzzYYYYYYYccccccy....
  sSYYYYYzYYYYYYYYccccyy....
  SyYYYYYYYYYYYYYYYyyyy.....
  .yyYYYYYYYYYYyyyyHYy......
  ..yyyyyyyyyyyyy..Yyy......
  ..dHYYYYYYYYYd...yyd......
  .dYYYYYYYYYYYYd...........
`);
// Mid-hop: stretched out, ears streaming back, legs extended.
const VH_HOP = art(`
  ..sSS.....................
  ...SHYYy..................
  ....HiYYy..sSS............
  .....HiiYYy.SHYYy.........
  ......HHiiYYyHiYYy........
  ........HHYYYYYYYYy.......
  ..........HYYYYYYYYYy.....
  .........HYYYYYYkkYYYy....
  .........YYYYYYkWEkYYYn...
  .....HHHHHYYYYYkkEkYCCy...
  ...HHYYYYYYYYYYYkkYCcY....
  SsHYYYzYYYYYYYYYYYYyy.....
  sSYYYYzzYYYYYYYYccccy.....
  .YYYYYYzzYYYYYYccccccy....
  .yYYYYYYzYYYYYYYccccyHy...
  ..yyyYYYYYYYYYyyyyy..yYy..
  dHYYyyyyyyyyyy.......yyd..
  dYYYd.....................
`);
// Crouched low, ears forward, charge building between the electrodes.
const VH_CROUCH = art(`
  .....................sS...
  ...................sSSS...
  ...........sS.....HYy.....
  ...........SSy...HYy......
  ...........HYYy.HiY.......
  ............HiYyHiY.......
  .............HiYHiY.......
  ............HHYYYYYYy.....
  ...........HYYYYYYYYYy....
  ...........YYYYYkkYYYYy...
  ...........YYYYkWEkYYYYn..
  ....HHHHH..YYYYkkEkYYCCy..
  ..HHYYYYYYHHyYYYkkYYCcY...
  .HYYYzYYYYYYYyyyYYYYyy....
  SYYYYzzYYYYYYYYYccccc.....
  sSYYYYzzYYYYYYYcccccccy...
  SyYYYYYzYYYYYYYYccccyHy...
  .yyYYYYYYYYYYYyyyyyy.Yyy..
  .dHYYYYYYYYYYYYd....yyd...
  dYYYYYYYYYYYYYYYd.........
`);
// Ears thrust forward as the ring leaves.
const VH_FIRE = art(`
  ........................sS
  ......................sSSS
  ...................sSHYy..
  .................sSSHYy...
  ...............HHYyHiY....
  ..............HiYHiYY.....
  ..............HiiYYy......
  .............HHYYYYYYy....
  ............HYYYYYYYYYy...
  ............YYYYYkkYYYYy..
  ............YYYYkWEkYYYYn.
  ............YYYYkkEkYYCCy.
  .....HHHHH...yYYYkkYYCcY..
  ...HHYYYYYYHHyyYYYYYYyy...
  ..HYYYYYYYYYYYYyyyyyyc....
  .HYYYzYYYYYYYYYYccccy.....
  .YYYYzzYYYYYYYYccccccy....
  SYYYYYzzYYYYYYYccccccy....
  sSYYYYYzYYYYYYYYccccyy....
  SyYYYYYYYYYYYYYYYyyyy.....
  .yyYYYYYYYYYYyyyyHYy......
  ..yyyyyyyyyyyyy..Yyy......
  ..dHYYYYYYYYYd...yyd......
  .dYYYYYYYYYYYYd...........
`);
const VH_HURT = art(`
  ..........................
  ..........................
  ....sSHYYy..sSHYy.........
  .....SHiYYy..SHiYy........
  .......HHiYYy..HiYy.......
  .........HHYYYYYYYy.......
  ..........HYYYYYYYYYy.....
  ..........YYYYYkWkYYYy....
  ..........YYYYYYkYYYYYn...
  ..........YYYYYkWkYYCCy...
  .....HHHHH.yYYYYYYYCcY....
  ...HHYYYYYYHHyyYYYYYyy....
  ..HYYYYYYYYYYYYyyyyyc.....
  .HYYYzYYYYYYYYYYcccy......
  .YYYYzzYYYYYYYYcccccy.....
  SYYYYYzzYYYYYYYcccccy.....
  sSYYYYYzYYYYYYYYcccyy.....
  SyYYYYYYYYYYYYYYYyyy......
  .yyYYYYYYYYYYyyyyHYy......
  ..yyyyyyyyyyyyy..Yyy......
  ..dHYYYYYYYYYd...yyd......
  .dYYYYYYYYYYYYd...........
`);
const VH_BOLT = art(`
  ..zz
  .zz.
  zzzz
  .zz.
  zz..
`);
// Strip the old haunch marks (z) and stamp the zigzag bolt at (bx, by).
function vh(rows, bx, by) {
  const plain = rows.map((r) => r.replace(/z/g, 'Y'));
  return compose(rows[0].length, rows.length, [plain, 0, 0], [VH_BOLT, bx, by]);
}
const VH = {
  idle: vh(VH_IDLE, 4, 17),
  twitch: vh(VH_IDLE_TWITCH, 4, 17),
  hop: vh(VH_HOP, 4, 10),
  crouch: vh(VH_CROUCH, 3, 12),
  fire: vh(VH_FIRE, 4, 14),
  hurt: vh(VH_HURT, 4, 12),
};
const VH_CX = 12;

ENTITY_SPRITES.volthare = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = VOLT_LV[L - 1];
    const at = e.animT ?? 0;
    const tt = (t ?? 0) + (e.id ?? 0) * 9;
    const f = (e.facing ?? 1) < 0 ? -1 : 1;
    let rows;
    let dx = 13 - VH_CX;
    let dy = 0;
    let arc = null; // [x0, y0, x1, y1] electrode pair (canvas coords) to arc between
    switch (e.anim) {
      case 'move':
        rows = VH.hop;
        break;
      case 'windup':
        rows = VH.crouch;
        dx += at % 4 < 2 ? 0 : 1; // trembling with charge
        arc = [12, 3, 22, 1];
        break;
      case 'fire':
        rows = VH.fire;
        break;
      case 'hurt':
        rows = VH.hurt;
        break;
      default:
        rows = tt % 90 < 8 ? VH.twitch : VH.idle;
        dy = tt % 30 < 15 ? 0 : 1;
        if (tt % 70 < 10) arc = [15, 1, 19, 1];
    }
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx, dy);
    body(ctx, rows, pal, e, x, y, dx, dy);
    if (arc) {
      // Canvas coords → screen: the sprite's top-left is at (x - w/2 + dx, y - h + dy), mirrored by facing.
      const w = rows[0].length;
      const h = rows.length;
      const sx = (cx) => (f > 0 ? x - (w >> 1) + dx + cx : x + (w >> 1) - dx - cx);
      const sy = (cy) => y - h + dy + cy;
      zap(ctx, sx(arc[0]), sy(arc[1]), sx(arc[2]), sy(arc[3]), tt, e.anim === 'windup' ? '#ffffff' : pal.E);
    }
    if (e.anim === 'fire' && at < 8) {
      const w = rows[0].length;
      const tipX = f > 0 ? x - (w >> 1) + dx + 25 : x + (w >> 1) - dx - 25;
      ring(ctx, tipX, y - rows.length + 1, 2 + (at >> 1), at < 4 ? '#ffffff' : pal.E);
    }
  },
};

// A jagged spark between two points.
function zap(ctx, x0, y0, x1, y1, t, color) {
  const n = 4;
  let px0 = x0;
  let py0 = y0;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const jx = i < n ? (((t * 7 + i * 13) % 5) - 2) * 0.6 : 0;
    const jy = i < n ? (((t * 5 + i * 11) % 5) - 2) : 0;
    const px1 = x0 + (x1 - x0) * k + jx;
    const py1 = y0 + (y1 - y0) * k + jy;
    line(ctx, px0, py0, px1, py1, color);
    px0 = px1;
    py0 = py1;
  }
}

// ================================================================ Mortarshell (armoured mortar turtle)
// A riveted dome shell with a mortar hatch on top. Shut tight most of the time; opens to poke out its head
// and raise the mortar tube. Anims: idle (shut), windup (opening), fire, open, close, hurt.

const MORTAR_PAL = Object.freeze({
  H: '#e2e8f2', A: '#a9b4c6', B: '#77849a', C: '#4f5a6e', D: '#333b4c', // shell plates
  j: '#262c3b', // seams
  r: '#ffcf5a', R: '#a8761e', // rivets
  h: '#ff8a1f', // hatch ring
  g: '#c9cfa6', G: '#8e9670', q: '#5c6348', // skin (head, legs)
  k: '#121626', e: '#ffe14a', E: '#ffffff', // eye
  t: '#59647a', T: '#a6b0c0', u: '#2a3040', // mortar tube, bore
});
const MORTAR_LV = [
  MORTAR_PAL,
  // Lv2 aqua (ice): frosted blue plates, white rivets.
  recolor(MORTAR_PAL, { H: '#f2fbff', A: '#9fdcff', B: '#4fa6e8', C: '#2b6fb8', D: '#1a4378', j: '#123058', r: '#ffffff', R: '#8fc8f0', h: '#7ff0ff', g: '#c8f0ff', G: '#7fb8d8', q: '#4a7a98', e: '#7ff0ff', t: '#3a6a9a', T: '#9fd0f0' }),
  // Lv3 fire (magma): red plates with glowing seams.
  recolor(MORTAR_PAL, { H: '#ffd0b0', A: '#ff8a5a', B: '#d8402a', C: '#9a2418', D: '#5e140e', j: '#ffb13b', r: '#ffe14a', R: '#c86a10', h: '#ffe14a', g: '#e8b090', G: '#b8704a', q: '#7a3a22', e: '#ffe14a', t: '#5a3a3a', T: '#a8706a' }),
  // Ω: violet plates, magenta seams.
  recolor(MORTAR_PAL, { H: '#e6d4ff', A: '#a27ef0', B: '#6c45c4', C: '#46268e', D: '#2a1458', j: '#ff5cf0', r: '#ffb3f3', R: '#a03aa0', h: '#ff5cf0', g: '#b8a8d8', G: '#7a6aa8', q: '#4a3a78', e: '#ff8cf5', t: '#4a3f6e', T: '#8a7fb0' }),
];

// The shell, shut (24 x 15).
const MS_SHELL = art(`
  .........HHHHHH.........
  ......HHHAhhhhAAB.......
  ....HHAAAhuuuuhAABB.....
  ...HAAAAjjhhhhjjAABB....
  ..HAAAAjAAAAAAAAjAABB...
  ..HAAAjAAAAHAAAAAjABBC..
  .HjjjjAAAAAAAAAAAAjjjBC.
  .AAArjAAAAAAAAAAAAjrABCC
  HAAAAjAAAAAAAAAAAAjAABCC
  AAAAAAjAAAAAAAAAAjAAABBC
  AjjjjjjjjjjjjjjjjjjjjjBC
  BrBBBjBBBBjBBBBjBBBBrBCC
  CCCCCCCCCCCCCCCCCCCCCCCD
  .DDDDDDDDDDDDDDDDDDDDDD.
`);
// Head out (pokes from the front of the shell).
// Shut: two eyes glinting in the dark gap at the front of the shell.
const MS_PEEP = art(`
  kkk
  eke
`);
const MS_HEAD = art(`
  ...gggg..
  .ggggggg.
  gggggkeGg
  gGgggkEkG
  GGGggggGq
  .qqGGGGq.
`);
const MS_HEAD_HURT = art(`
  ...gggg..
  .ggggggg.
  gggggEkEg
  gGgggkEkG
  GGGggEkEq
  .qqGGGGq.
`);
const MS_HEAD_PEEK = art(`
  .gggg.
  gggkeG
  GggkEq
  .qGGq.
`);
const MS_LEG_F = art(`
  .ggG
  gggG
  qGGq
`);
const MS_LEG_B = art(`
  Ggg.
  Gggg
  qGGq
`);
// Mortar tube, raised and angled forward.
const MS_TUBE = art(`
  .....TTT
  ....TTuu
  ...TTuuT
  ..TttuTt
  .Tttttt.
  Tttttt..
  ttttt...
  .ttt....
`);
const MS_TUBE_LOW = art(`
  ...TTT
  ..TTuu
  .TttuT
  Tttttt
  .tttt.
`);

const MS_W = 34;
const MORTARSHELL = {
  closed: [
    compose(MS_W, 17, [MS_SHELL, 5, 3]),
    compose(MS_W, 17, [MS_SHELL, 5, 3], [MS_PEEP, 24, 11]),
  ],
  opening: compose(MS_W, 22, [MS_LEG_B, 5, 18], [MS_LEG_F, 22, 18], [MS_TUBE_LOW, 15, 2], [MS_SHELL, 5, 6], [MS_HEAD_PEEK, 27, 13]),
  open: compose(MS_W, 24, [MS_LEG_B, 5, 20], [MS_LEG_F, 22, 20], [MS_TUBE, 15, 0], [MS_SHELL, 5, 8], [MS_HEAD, 26, 13]),
  fire: compose(MS_W, 24, [MS_LEG_B, 5, 20], [MS_LEG_F, 22, 20], [MS_TUBE_LOW, 15, 4], [MS_SHELL, 5, 9], [MS_HEAD, 26, 14]),
  hurt: compose(MS_W, 24, [MS_LEG_B, 4, 20], [MS_LEG_F, 21, 20], [MS_TUBE_LOW, 14, 4], [MS_SHELL, 4, 8], [MS_HEAD_HURT, 25, 12]),
};
const MS_CX = 17;

ENTITY_SPRITES.mortarshell = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = MORTAR_LV[L - 1];
    const at = e.animT ?? 0;
    const tt = (t ?? 0) + (e.id ?? 0) * 17;
    const f = (e.facing ?? 1) < 0 ? -1 : 1;
    let rows;
    let dx = MS_W / 2 - MS_CX;
    switch (e.anim) {
      case 'windup':
        rows = at < 8 ? MORTARSHELL.opening : MORTARSHELL.open;
        break;
      case 'fire':
        rows = at < 10 ? MORTARSHELL.fire : MORTARSHELL.open;
        break;
      case 'open':
        rows = MORTARSHELL.open;
        break;
      case 'close':
        rows = at < 5 ? MORTARSHELL.opening : MORTARSHELL.closed[0];
        break;
      case 'idle':
      case undefined:
        // Shut tight; now and then a pair of eyes glints in the gap.
        rows = MORTARSHELL.closed[tt % 150 > 110 && tt % 150 < 140 ? 1 : 0];
        break;
      case 'hurt':
        rows = MORTARSHELL.hurt;
        dx += at % 4 < 2 ? 1 : 0;
        break;
      default:
        rows = MORTARSHELL.closed[0];
    }
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx);
    body(ctx, rows, pal, e, x, y, dx);
    if (e.anim === 'fire' && at < 14) smoke(ctx, x + f * 3, y - 24 - at, at);
    // Shut: a slow glint along the shell.
    if ((e.anim === 'idle' || !e.anim) && tt % 120 < 12) {
      const k = (tt % 120) / 12;
      px(ctx, x - f * 8 + f * Math.round(k * 16), y - 13 + Math.round(Math.abs(k - 0.5) * 6), '#ffffff');
    }
  },
};

// A puff of smoke rising from the mortar.
function smoke(ctx, x, y, age) {
  if (age < 3) {
    // Muzzle flash first.
    disc(ctx, x, y + 3, 3 - age, '#ffe14a');
    disc(ctx, x, y + 3, 1, '#ffffff');
    return;
  }
  const r = 1 + Math.min(3, age >> 2);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * Math.max(0.25, 1 - age / 16);
  disc(ctx, x + 1, y + 1, r, '#5a6078');
  disc(ctx, x, y, r, '#b8bccb');
  disc(ctx, x - 2, y + 2, Math.max(1, r - 1), '#9aa0b4');
  px(ctx, x - 1, y - r + 1, '#eef0f6');
  ctx.globalAlpha = a;
}

// ================================================================ Gloop (jelly blob)
// A glossy gelatinous mound with a glowing nucleus. Sinks into a puddle, oozes back up, wobbles.
// Element badges: an ember wisp (Lv2 fire) and a leaf sprout (Lv3 wood) on top.
// Anims: idle, sink, rise, windup, fire, hurt.

const GLOOP_PAL = Object.freeze({
  W: '#ffffff', H: '#c8f4ff', A: '#7fd8ff', B: '#3fa6f0', C: '#2a6fd0', D: '#1d4596', // jelly
  n: '#f0feff', N: '#a8ecff', // nucleus
  k: '#0f1630', // eyes
  b: '#e0f8ff', // bubbles
});
// Copy of a palette without some keys: those pixels are left out entirely (badges on other levels).
function withKeys(pal, extra) {
  return Object.freeze({ ...pal, ...extra });
}
const GLOOP_LV = [
  GLOOP_PAL,
  // Lv2 fire: orange jelly, ember core, flame wisp.
  withKeys(recolor(GLOOP_PAL, { H: '#ffe2b0', A: '#ffab4a', B: '#f06a2a', C: '#c0401e', D: '#7e2214', n: '#ffffff', N: '#ffe14a', b: '#ffe9c0' }), { f: '#ffe14a', F: '#ff7a1a', g: '#fff8d0' }),
  // Lv3 wood: green jelly, seed core, leaf sprout.
  withKeys(recolor(GLOOP_PAL, { H: '#e0ffc0', A: '#a6e86a', B: '#5ab83a', C: '#3a8a2a', D: '#22561c', n: '#fffff0', N: '#e8f080', b: '#efffd8' }), { l: '#c8ff8a', L: '#3a9a2a', s: '#7a5a2a' }),
  // Ω: indigo jelly, magenta core.
  recolor(GLOOP_PAL, { H: '#d8c8ff', A: '#8a6ef0', B: '#5a3cc8', C: '#3c2496', D: '#22125e', n: '#ffffff', N: '#ff7ef2', b: '#e8d8ff' }),
];

// Build a jelly mound as pixel rows: a superellipse dome, shaded from the top-left, with a specular
// highlight, a nucleus, bubbles and eyes. lean > 0 tips the top toward the facing.
function jelly({ w, h, lean = 0, p = 2.3, eyes = 'open', eyeX = 0.6, eyeY = 0.42, nucleus = true, bub = true }) {
  const g = [];
  const cx0 = (w - 1) / 2;
  const hw0 = w / 2;
  const prof = [];
  for (let y = 0; y < h; y++) {
    const v = Math.min(1, (h - 1 - y + 0.6) / h); // 1 at the top, ~0 at the floor
    const hw = hw0 * Math.pow(Math.max(0, 1 - Math.pow(v, p)), 1 / p);
    const cx = cx0 + lean * v * v;
    prof.push([cx, hw]);
    const row = [];
    for (let x = 0; x < w; x++) row.push(Math.abs(x - cx) <= hw - 0.35 ? 'A' : '.');
    g.push(row);
  }
  const at = (x, y) => (g[y] && g[y][x] && g[y][x] !== '.' ? g[y][x] : null);
  // Shade: top-left light, bottom-right shadow, dark floor contact.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      const [cx, hw] = prof[y];
      const nx = (x - cx) / Math.max(1, hw);
      const ny = (y - h * 0.55) / (h * 0.5);
      const l = -0.6 * nx - 0.8 * ny;
      let k = l > 0.35 ? 'A' : l > -0.45 ? 'B' : 'C';
      if (nx > 0.55 && k === 'A') k = 'B';
      const edgeR = !at(x + 1, y);
      const edgeB = !at(x, y + 1);
      const edgeT = !at(x, y - 1);
      const edgeL = !at(x - 1, y);
      if (edgeT && nx < 0.35) k = 'H';
      else if (edgeL && ny < 0.3) k = k === 'C' ? 'B' : 'A';
      if (edgeR && k !== 'H') k = ny > 0.2 ? 'D' : 'C';
      if (y === h - 1) k = edgeL || edgeR ? 'D' : 'C';
      if (y === h - 2 && (edgeL || edgeR)) k = 'C';
      g[y][x] = k;
    }
  }
  // Rim light along the lower left (light through the jelly).
  for (let y = Math.floor(h * 0.55); y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) && !at(x - 1, y)) {
        if (at(x + 1, y)) g[y][x + 1] = 'A';
        break;
      }
    }
  }
  const put = (x, y, k) => {
    x = Math.round(x);
    y = Math.round(y);
    if (at(x, y)) g[y][x] = k;
  };
  // Specular highlight, top-left.
  if (h >= 7) {
    const [cx, hw] = prof[Math.round(h * 0.28)];
    const sx = cx - hw * 0.5;
    const sy = Math.round(h * 0.22);
    put(sx, sy, 'W');
    put(sx + 1, sy, 'W');
    put(sx - 1, sy + 1, 'W');
    put(sx, sy + 1, 'H');
    put(sx + 2, sy, 'H');
    put(sx - 1, sy + 2, 'H');
  }
  // Nucleus.
  if (nucleus && h >= 6) {
    const ny0 = Math.round(h * 0.55);
    const [cx, hw] = prof[ny0];
    const nx0 = cx - hw * 0.15;
    for (const [dx, dy, k] of [[-1, -1, 'N'], [0, -1, 'N'], [-2, 0, 'N'], [-1, 0, 'n'], [0, 0, 'n'], [1, 0, 'N'], [-1, 1, 'N'], [0, 1, 'N']]) put(nx0 + dx, ny0 + dy, k);
  }
  if (bub && h >= 8) {
    const [cx, hw] = prof[Math.round(h * 0.7)];
    put(cx - hw * 0.62, Math.round(h * 0.7), 'b');
    const [cx2, hw2] = prof[Math.round(h * 0.4)];
    put(cx2 - hw2 * 0.15, Math.round(h * 0.38), 'b');
  }
  // Eyes on the front side.
  if (eyes) {
    const ey = Math.round(h * eyeY);
    const [cx, hw] = prof[ey];
    const ex = Math.round(cx + hw * (eyeX * 2 - 1));
    const eye = (x0) => {
      if (eyes === 'x') {
        for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) put(x0 + dx, ey + dy - 1, 'k');
      } else if (eyes === 'angry') {
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx < 2; dx++) put(x0 + dx, ey + dy, 'k');
      } else if (eyes === 'shut') {
        for (const dx of [0, 1, 2]) put(x0 + dx, ey + 1, 'k');
      } else {
        for (let dy = -1; dy <= 1; dy++) for (let dx = 0; dx < 2; dx++) put(x0 + dx, ey + dy, 'k');
        put(x0, ey - 1, 'W');
      }
    };
    eye(ex - 3);
    eye(ex + 1);
    if (eyes === 'angry') {
      // Brows slanting down toward the middle.
      for (const [dx, dy] of [[-4, -2], [-3, -2], [-2, -1], [3, -2], [2, -2], [1, -1]]) put(ex + dx, ey + dy, 'k');
    }
  }
  return Object.freeze(g.map((r) => r.join('')));
}

const GL_FLAME = [
  art(`
    ..F..
    ..fF.
    .Ffg.
    FfggF
    FfgfF
    .FfF.
  `),
  art(`
    .F...
    .Ff..
    .fgF.
    FfgfF
    FggfF
    .FfF.
  `),
  art(`
    ...F.
    ..Ff.
    .Fgf.
    FfggF
    FfgfF
    .FfF.
  `),
];
const GL_LEAF = [
  art(`
    ll...LL
    lLL.LlL
    .LLsLL.
    ...s...
  `),
  art(`
    .l...LL
    llL.LlL
    .LLsLL.
    ...s...
  `),
];
const GL_W = 32;
// Centre a jelly body on the canvas and crown it with the badge (both flame and leaf are stamped; each
// level's palette only defines one of them, so the other leaves no pixels).
function gl(rows, f = 0, badge = true, bx = 0) {
  const w = rows[0].length;
  const x = Math.floor((GL_W - w) / 2);
  const top = 5;
  const layers = [[rows, x, top]];
  if (badge) {
    // Find the top of the dome and sit the badge on it.
    let cx = x + (w >> 1);
    for (let i = 0; i < w; i++) if (rows[0][i] !== '.') { cx = x + i + 1; break; }
    layers.push([GL_FLAME[f % 3], cx - 2 + bx, top - 5], [GL_LEAF[f % 2], cx - 3 + bx, top - 3]);
  }
  return compose(GL_W, top + rows.length, ...layers);
}
const GL_SHAPES = {
  idle: jelly({ w: 26, h: 17 }),
  tall: jelly({ w: 22, h: 19, p: 2.0 }),
  wide: jelly({ w: 29, h: 15, p: 2.6 }),
  melt1: jelly({ w: 29, h: 11, p: 2.8, eyeY: 0.45 }),
  melt2: jelly({ w: 30, h: 7, p: 3.2, eyeY: 0.45, bub: false }),
  melt3: jelly({ w: 30, h: 4, p: 4, eyes: null, nucleus: false, bub: false }),
  angry: jelly({ w: 29, h: 15, p: 2.6, eyes: 'angry' }),
  angryTall: jelly({ w: 22, h: 19, p: 2.0, eyes: 'angry' }),
  lunge: jelly({ w: 28, h: 17, lean: 5, p: 2.2, eyeX: 0.72 }),
  hurt: jelly({ w: 30, h: 12, p: 2.8, eyes: 'x' }),
};
const GLOOP = {
  idle: [0, 1, 2, 3].map((f) => gl([GL_SHAPES.idle, GL_SHAPES.tall, GL_SHAPES.idle, GL_SHAPES.wide][f], f)),
  melt: [gl(GL_SHAPES.melt1, 0), gl(GL_SHAPES.melt2, 1, false), gl(GL_SHAPES.melt3, 2, false)],
  angry: [gl(GL_SHAPES.angry, 0), gl(GL_SHAPES.angryTall, 1)],
  lunge: gl(GL_SHAPES.lunge, 2, true, 3),
  hurt: gl(GL_SHAPES.hurt, 1),
};

// Re-crown a frame with the flame frame for time t (cached per frame so bitmaps stay cached too).
const flameCache = new Map();
function flameSwap(rows, t) {
  const f = Math.floor(t / 5) % 3;
  let m = flameCache.get(rows);
  if (!m) flameCache.set(rows, (m = []));
  if (!m[f]) {
    // Clear the old wisp (its keys are only f/F/g) and stamp the new one where it was.
    let x0 = -1;
    let y0 = -1;
    for (let y = 0; y < rows.length && y0 < 0; y++) {
      const i = rows[y].search(/[fFg]/);
      if (i >= 0) {
        y0 = y;
        x0 = i;
      }
    }
    if (y0 < 0) return rows;
    const g = rows.map((r) => r.replace(/[fFg]/g, '.'));
    const first = GL_FLAME[f].findIndex((r) => /[^.]/.test(r));
    const fx = x0 - GL_FLAME[f][first].search(/[^.]/);
    m[f] = compose(rows[0].length, rows.length, [g, 0, 0], [GL_FLAME[f], fx, y0 - first]);
  }
  return m[f];
}

ENTITY_SPRITES.gloop = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = GLOOP_LV[L - 1];
    const at = e.animT ?? 0;
    const tt = (t ?? 0) + (e.id ?? 0) * 5;
    let rows;
    let dx = 0;
    switch (e.anim) {
      case 'sink':
        rows = at < 5 ? GLOOP.idle[0] : at < 9 ? GLOOP.melt[0] : at < 13 ? GLOOP.melt[1] : GLOOP.melt[2];
        break;
      case 'rise':
        rows = at < 4 ? GLOOP.melt[2] : at < 8 ? GLOOP.melt[1] : at < 11 ? GLOOP.melt[0] : GLOOP.idle[1];
        break;
      case 'windup':
        rows = cyc(GLOOP.angry, at, 3);
        dx = at % 6 < 3 ? -1 : 1;
        break;
      case 'fire':
        rows = at < 14 ? GLOOP.lunge : GLOOP.idle[0];
        break;
      case 'hurt':
        rows = GLOOP.hurt;
        break;
      default:
        rows = cyc(GLOOP.idle, tt, 9);
    }
    if (L === 2 && rows.length > 12) rows = flameSwap(rows, tt); // the ember wisp flickers on its own beat
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx);
    body(ctx, rows, pal, e, x, y, dx);
  },
};

// ================================================================ Bombeetle (bomb-lobbing beetle)
// A rhino beetle with a bomb cradled on its back; it rears up and flings the bomb with a buck of its shell.
// Anims: idle, move, windup, fire, hurt.

const BEETLE_PAL = Object.freeze({
  H: '#ffe6b8', A: '#e39a48', B: '#b8652a', C: '#7f3d18', D: '#4a210c', // elytra
  s: '#fff6e0', // shine
  P: '#f3ead2', p: '#c2b28a', Z: '#857650', // horn (ivory)
  j: '#2a1608', // seam
  m: '#7a6488', M: '#4c3c5c', n: '#a892b8', // pronotum / head plate
  l: '#2e2230', L: '#5a4660', // legs
  k: '#0f1220', e: '#ffe14a', // eye
  O: '#4a5274', o: '#262b40', Q: '#9aa4c8', W: '#e8ecff', // bomb
  b: '#ffcf5a', // bomb band
  T: '#8a93a8', t: '#4c5468', // cradle
  f: '#e8d8b0', y: '#ffe14a', // fuse
});
const BEETLE_LV = [
  BEETLE_PAL,
  // Lv2 steel-blue carapace.
  recolor(BEETLE_PAL, { H: '#dceaff', A: '#7ea6e6', B: '#4b70bc', C: '#2c4682', D: '#18284c', e: '#7ff0ff', b: '#7fd0ff', m: '#3e4a66', M: '#283048', n: '#6a7898' }),
  // Lv3 crimson carapace, black horn.
  recolor(BEETLE_PAL, { H: '#ffc8c0', A: '#f05a5a', B: '#c42a38', C: '#801424', D: '#440a14', P: '#6a7090', p: '#3e4460', Z: '#262a3c', e: '#ffe14a', b: '#ff5a5a', m: '#2e2a3a', M: '#1c1a26', n: '#4a4660' }),
  // Ω: violet carapace, magenta glow.
  recolor(BEETLE_PAL, { H: '#ecd8ff', A: '#a27ef0', B: '#6c45c4', C: '#46268e', D: '#2a1458', P: '#ffd8fb', p: '#d890e8', Z: '#8a4aa8', e: '#ff8cf5', O: '#3a2a5e', o: '#1c1430', Q: '#8a6ac8', b: '#ff5cf0', y: '#ffc8fa', m: '#2c2048', M: '#1a1230', n: '#4a3a70' }),
];

// Carapace: elytra (back) + pronotum (front), 23 x 11.
const BT_BODY = art(`
  ......HHHHHHHH.........
  ....HHAAAAAAAAAHj......
  ...HAAssAAAAAAAABjnnn..
  ..HAAssAAAAAAAAAABjmnnn
  .HAAsAAAAAAAAAAAABjmmmn
  .AAAAAAAAAAAAAAABBjmmmm
  HAAAAAAAAAAAAAABBBjmmmM
  AAAAAAAAAAAAABBBBCjmmMM
  BAAAAAAAAAABBBBBCCjMMMM
  CBBBBBBBBBBBBBCCCDjMMM.
  .CCCCCCCCCCCCCDDDD.....
`);
// Head with the rhino horn sweeping up and forward.
const BT_HEAD = art(`
  .......PP
  ......PPZ
  .....PPZ.
  .....PZ..
  ....PPZ..
  ...PPpZ..
  .nnPpZ...
  nmmmmm...
  mmkemmM..
  MmmmmMM..
  .MMMMM...
`);
const BT_HEAD_UP = art(`
  ........PP
  .......PPZ
  ......PPZ.
  .....PPZ..
  ....PPpZ..
  ...PPpZ...
  .nnPpZ....
  nmmmmmM...
  mmkemmM...
  MmmmmMM...
  .MMMMM....
`);
const BT_HEAD_HURT = art(`
  .........
  .........
  .........
  ...PPZ...
  ..PPpZ...
  .nPpZ....
  nmmmmm...
  mmeEmmM..
  MmEemMM..
  .MMMMM...
`);
const BT_LEGS = [
  art(`
    .lL......lL.......lL..
    .l.......lL........l..
    l.......l.L........Ll.
    l......l...L........l.
    ll.....ll..LL.......ll
  `),
  art(`
    .lL......lL.......lL..
    ..l......l.L......l...
    ..Ll....l..L.....Ll...
    ...l...l....L....l....
    ...ll..ll...LL..ll....
  `),
];
const BT_LEGS_REAR = art(`
  .lL......lL.......
  .l.......lL.......
  l.......l.L.......
  l......l...L......
  ll.....ll..LL.....
`);
const BT_FRONT_UP = art(`
  .lL
  .Ll
  l.L
`);
const BT_BOMB = art(`
  ....fy.
  ...f...
  ..OOOo.
  .OWQOOo
  OQQOOOo
  bbbbbbb
  OOOOOoo
  .OOooo.
  ..ooo..
`);
const BT_BOMB_HOT = art(`
  ...yWy.
  ...fy..
  ..OOOo.
  .OWQOOo
  OQQOOOo
  bbbbbbb
  OOOOOoo
  .OOooo.
  ..ooo..
`);
const BT_CRADLE = art(`
  T.....T
  tTTTTTt
`);
const BT_W = 34;
function beetleFrame({ head = BT_HEAD, hx = 23, hy = 7, by = 8, legs = BT_LEGS[0], ly = 19, bomb = BT_BOMB, bomby = 0, bombx = 7, front = null, dx = 0 } = {}) {
  return compose(BT_W, 24,
    [legs, 4 + dx, ly],
    ...(front ? [front] : []),
    [BT_BODY, 3 + dx, by],
    [head, hx + dx, hy],
    [BT_CRADLE, 9 + dx, by - 1],
    ...(bomb ? [[bomb, bombx + dx, bomby]] : []),
  );
}
const BOMBEETLE = {
  idle: [beetleFrame(), beetleFrame({ by: 9, hy: 8, bomby: 1 })],
  move: [beetleFrame({ legs: BT_LEGS[1] }), beetleFrame({ legs: BT_LEGS[0], by: 9, hy: 8, bomby: 1 })],
  windup: beetleFrame({ head: BT_HEAD_UP, hx: 23, hy: 3, by: 7, bomb: BT_BOMB_HOT, bomby: -1, legs: BT_LEGS_REAR, front: [BT_FRONT_UP, 25, 18] }),
  fire: beetleFrame({ head: BT_HEAD_UP, hx: 23, hy: 4, by: 8, bomb: null, dx: -1 }),
  hurt: beetleFrame({ head: BT_HEAD_HURT, hx: 22, hy: 9, by: 9, bomby: 2, bombx: 6, dx: -1 }),
};
const BT_CX = 16;

ENTITY_SPRITES.bombeetle = {
  draw(ctx, e, x, y, t) {
    const L = lv(e);
    const pal = BEETLE_LV[L - 1];
    const at = e.animT ?? 0;
    const tt = (t ?? 0) + (e.id ?? 0) * 19;
    let rows;
    let dx = BT_W / 2 - BT_CX;
    switch (e.anim) {
      case 'move':
        rows = cyc(BOMBEETLE.move, at, 3);
        break;
      case 'windup':
        rows = BOMBEETLE.windup;
        dx += at % 4 < 2 ? 0 : -1;
        break;
      case 'fire':
        rows = at < 16 ? BOMBEETLE.fire : BOMBEETLE.idle[0];
        break;
      case 'hurt':
        rows = BOMBEETLE.hurt;
        break;
      default:
        rows = cyc(BOMBEETLE.idle, tt, 22);
    }
    if (L === 4) glow(ctx, rows, pal, e, x, y, t, '#c040ff', dx);
    body(ctx, rows, pal, e, x, y, dx);
    // Fuse spark on the cradled bomb.
    if (rows !== BOMBEETLE.fire) {
      const f = (e.facing ?? 1) < 0 ? -1 : 1;
      const w = rows[0].length;
      const bx = 12 + (rows === BOMBEETLE.hurt ? -1 : 0);
      const by = rows === BOMBEETLE.windup ? -1 : rows === BOMBEETLE.hurt ? 2 : rows === BOMBEETLE.idle[1] || rows === BOMBEETLE.move[1] ? 1 : 0;
      const sx = f > 0 ? x - (w >> 1) + dx + bx : x + (w >> 1) - dx - bx - 1;
      const sy = y - rows.length + by;
      if (tt % 4 < 2) px(ctx, sx, sy - 1, '#ffffff');
      else px(ctx, sx + (f > 0 ? 1 : -1), sy - 1, '#ff9a2a');
    }
  },
};

// ================================================================ spells
// (x, y) is the floor point of (s.x, s.y); airborne spells lift themselves by s.z.

const spellLv = (s) => Math.max(1, Math.min(4, (s?.data?.level ?? s?.owner?.level ?? 1) | 0));

// Soft oval shadow on the floor; shrinks as the thing above it rises.
function floorShadow(ctx, x, y, z, w = 6) {
  const k = Math.max(0.35, 1 - z / 90);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * (0.25 + 0.2 * k);
  ellipse(ctx, x, y, Math.max(2, Math.round(w * k)), Math.max(1, Math.round(2 * k)), '#06070f');
  ctx.globalAlpha = a;
}

// Corner brackets over a panel: where something is about to land. `phase` 0..1 tightens them.
function landMark(ctx, col, row, phase, color, t) {
  const p = floorPoint(col, row);
  const w = 15 - Math.round(phase * 5);
  const h = 7 - Math.round(phase * 2);
  if (phase > 0.6 && t % 6 < 3) return; // blink as it closes in
  const cx = p.x;
  const cy = p.y - 2;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x0 = cx + sx * w;
    const y0 = cy + sy * h;
    rect(ctx, Math.min(x0, x0 - sx * 3), y0, 4, 1, color);
    rect(ctx, x0, Math.min(y0, y0 - sy * 2), 1, 3, color);
  }
}

// Brackets on every panel a lobbed spell will hit: the engine's s.data.landing when present, else the
// target panel (plus its arms for a 'plus' blast).
function landMarks(ctx, s, phase, color, t) {
  let cells = s.data?.landing;
  if (!cells) {
    const tg = s.data?.target;
    if (!tg) return;
    cells = [[tg.col, tg.row]];
    if (s.data?.blast === 'plus') cells.push([tg.col + 1, tg.row], [tg.col - 1, tg.row], [tg.col, tg.row - 1], [tg.col, tg.row + 1]);
  }
  for (const [c, r] of cells) {
    if (c < 0 || c > 5 || r < 0 || r > 2) continue;
    landMark(ctx, c, r, phase, color, t);
  }
}

// ---- Emberhound fireball
const FIREBALL_PAL = Object.freeze({ Y: '#ffffff', y: '#fff27a', o: '#ffab2a', r: '#ff5a1a', R: '#c8281a' });
const FIREBALL_LV = [
  FIREBALL_PAL,
  recolor(FIREBALL_PAL, { y: '#fff8c8', o: '#ffd23a', r: '#ff8a1a', R: '#d84a1a' }),
  recolor(FIREBALL_PAL, { y: '#ffe14a', o: '#ff8a1a', r: '#e8301a', R: '#8a1410' }),
  recolor(FIREBALL_PAL, { y: '#ffd6fb', o: '#ff7ef2', r: '#c43cff', R: '#6a1aa8' }),
];
const FIREBALL = [
  art(`
    ..........RRrr...
    .....RR.RRrroorr.
    ..RRrrRRrroooyyor
    RRrrrrrroooyyYyyo
    ..RRrroorrooyyYyo
    ....RRrrroooyyyor
    ......RRrrroooorr
    ..........RRrr...
  `),
  art(`
    .........RRrrr...
    ...RRRRRRrroorr..
    RRrrrrrrroooyyor.
    ..RRrrroooyyYYyyo
    RRRrrrroooyyYyyyo
    ...RRrrrrooyyyyor
    .....RRRrrroooor.
    .........RRrr....
  `),
  art(`
    ..........RRrrr..
    ....RRRRRRroooorr
    .RRRrrrrrroooyyor
    ...RRrroooyyYYyyo
    .RRrrrrrooyyYYyyo
    RRrrrrrrrooyyyyor
    ....RRRRrrrooorr.
    ..........RRrr...
  `),
];

SPELL_SPRITES.emberball = {
  draw(ctx, s, x, y, t) {
    const L = spellLv(s);
    const dir = (s.dir ?? -1) < 0 ? -1 : 1;
    const h = 12 + (s.z ?? 0);
    floorShadow(ctx, x, y, h, 5);
    const rows = FIREBALL[Math.floor((t ?? 0) / 3) % 3];
    sprite(ctx, rows, FIREBALL_LV[L - 1], x - dir * 4, y - h, { anchor: 'center', flip: dir < 0, outline: L === 4 ? '#2a0838' : '#3a0a08' });
  },
};

// ---- Volthare's paralyzing ring
SPELL_SPRITES.voltring = {
  draw(ctx, s, x, y, t) {
    const L = spellLv(s);
    const tt = t ?? 0;
    const main = L === 4 ? '#e9a0ff' : '#ffe14a';
    const hot = L === 4 ? '#fff0ff' : '#fffbd0';
    const deep = L === 4 ? '#8a3ad8' : '#e09a10';
    const h = 12 + (s.z ?? 0);
    const cy = y - h;
    floorShadow(ctx, x, y, h, 5);
    // A spinning hoop: its apparent width swings as it turns.
    const rx = [2, 4, 5, 4][Math.floor(tt / 3) % 4];
    const ry = 7;
    ringOval(ctx, x + 1, cy + 1, rx, ry, deep);
    ringOval(ctx, x, cy, rx, ry, main);
    ringOval(ctx, x, cy, Math.max(1, rx - 1), ry - 1, hot);
    // Crackle.
    for (let i = 0; i < 3; i++) {
      const a = tt * 0.5 + i * 2.1;
      const sx = x + Math.round(Math.cos(a) * (rx + 3));
      const sy = cy + Math.round(Math.sin(a) * (ry + 2));
      px(ctx, sx, sy, i === 0 ? '#ffffff' : main);
      if ((tt + i) % 4 < 2) px(ctx, sx + (i % 2 ? 1 : -1), sy - 1, hot);
    }
  },
};

// Outline of an axis-aligned ellipse (pixel-exact, gap-free).
function ringOval(ctx, cx, cy, rx, ry, color) {
  cx = Math.round(cx);
  cy = Math.round(cy);
  ctx.fillStyle = color;
  let prev = null;
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.3) * (ry + 0.3)))));
    const a = prev === null ? w : Math.min(w, prev);
    const b = prev === null ? w : Math.max(w, prev);
    // Left and right edges, bridging to the previous row so the outline stays closed.
    ctx.fillRect(cx - b, cy + dy, b - a + 1, 1);
    ctx.fillRect(cx + a, cy + dy, b - a + 1, 1);
    if (dy === -ry || dy === ry) ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    prev = w;
  }
}

// ---- Mortarshell shell
const MORTARBALL_PAL = Object.freeze({ H: '#e8eef8', A: '#8a96ac', B: '#4c566c', C: '#262c3c', r: '#ff5a3a', R: '#a82a1a' });
const MORTARBALL_LV = [
  MORTARBALL_PAL,
  recolor(MORTARBALL_PAL, { H: '#ffffff', A: '#bfeaff', B: '#5fb0ec', C: '#2a64a8', r: '#e8fbff', R: '#7fd0ff' }),
  recolor(MORTARBALL_PAL, { H: '#ffe9a0', A: '#d84a2a', B: '#8a1e14', C: '#4a0c08', r: '#ffd23a', R: '#ff7a1a' }),
  recolor(MORTARBALL_PAL, { H: '#f0e0ff', A: '#8a6ae0', B: '#4a2c98', C: '#24124e', r: '#ff5cf0', R: '#a02aa8' }),
];
const MORTARBALL = art(`
  ..AAAA..
  .AHHAAB.
  AHHAAABB
  rRrrRrrR
  AAAAABBC
  ABBBBBBC
  .BBBBCC.
  ..CCCC..
`);
SPELL_SPRITES.mortarball = {
  draw(ctx, s, x, y, t) {
    const L = spellLv(s);
    const z = s.z ?? 0;
    const tc = L === 2 ? '#bff4ff' : L === 3 ? '#ffb13b' : L === 4 ? '#ff7ef2' : '#ff6a4a';
    landMarks(ctx, s, Math.min(1, (s.t ?? 0) / 40), tc, t ?? 0);
    floorShadow(ctx, x, y, z, 6);
    sprite(ctx, MORTARBALL, MORTARBALL_LV[L - 1], x, y - z - 4, { anchor: 'center', outline: OUTLINE });
    if (L === 3 && (t ?? 0) % 4 < 2) px(ctx, x - 1, y - z - 10, '#ffd23a'); // embers trailing off a magma shell
    if (L === 2 && (t ?? 0) % 6 < 3) px(ctx, x + 3, y - z - 9, '#ffffff'); // frost glint
  },
};

// ---- A Mortarshell mark fading off a panel: steam off cooling lava, frost sparkles off thawing ice.
SPELL_SPRITES.mortarmark = {
  draw(ctx, s, x, y, t) {
    const p = s.data?.progress ?? 0;
    if (p < 0.7) return;
    const k = (p - 0.7) / 0.3; // 0 → 1 as it fades
    const tt = t ?? 0;
    const ice = s.data?.mark === 'ice';
    for (let i = 0; i < 4; i++) {
      const ph = ((tt + i * 9) % 24) / 24;
      const bx = x + [-11, -3, 5, 12][i];
      if (ice) {
        // Twinkles that grow busier as it thaws.
        if ((tt + i * 5) % 12 < 4 + Math.round(k * 4)) {
          const by = y - 4 - ((i * 7) % 9);
          px(ctx, bx, by, '#ffffff');
          if (k > 0.4) {
            px(ctx, bx - 1, by, '#bff4ff');
            px(ctx, bx + 1, by, '#bff4ff');
          }
        }
      } else {
        // Wisps of steam curling up off the panel.
        const by = y - 2 - Math.round(ph * (8 + k * 6));
        const c = ph < 0.5 ? '#e8ecf4' : '#a8aec0';
        px(ctx, bx + Math.round(Math.sin(ph * 6 + i) * 1.5), by, c);
        if (ph < 0.6) px(ctx, bx + Math.round(Math.sin(ph * 6 + i) * 1.5) + 1, by + 1, c);
      }
    }
  },
};

// ---- Bombeetle bomb
const BOMB_PAL = Object.freeze({ H: '#a8b2d8', A: '#5a6488', B: '#323a58', C: '#1a1f34', f: '#e8d8b0', b: '#ffcf5a' });
const BOMB_LV = [
  BOMB_PAL,
  recolor(BOMB_PAL, { b: '#7fd0ff' }),
  recolor(BOMB_PAL, { b: '#ff5a5a' }),
  recolor(BOMB_PAL, { H: '#c8b0ff', A: '#5a3c98', B: '#33205e', C: '#1a1034', b: '#ff5cf0' }),
];
const BOMB = art(`
  .....f.
  ..AAf..
  .AHAAB.
  AHHAABB
  bbbbbbb
  AABBBBC
  .BBBCC.
  ..CCC..
`);
SPELL_SPRITES.beetlebomb = {
  draw(ctx, s, x, y, t) {
    const L = spellLv(s);
    const z = s.z ?? 0;
    const tt = t ?? 0;
    landMarks(ctx, s, Math.min(1, (s.t ?? 0) / 32), L === 4 ? '#ff7ef2' : '#ffe14a', tt);
    floorShadow(ctx, x, y, z, 5);
    const by = y - z - 4;
    sprite(ctx, BOMB, BOMB_LV[L - 1], x, by, { anchor: 'center', outline: OUTLINE });
    // Fuse spark.
    const sx = x + 2;
    const sy = by - 5;
    px(ctx, sx, sy, tt % 4 < 2 ? '#ffffff' : '#ffe14a');
    if (tt % 4 < 2) {
      px(ctx, sx + 1, sy - 1, '#ff9a2a');
      px(ctx, sx - 1, sy - 1, '#ffe14a');
    } else px(ctx, sx, sy - 2, '#ff9a2a');
  },
};

// ---- Gloop's rolling wave
const WAVE_PAL = Object.freeze({ W: '#ffffff', H: '#c8f4ff', A: '#7fd8ff', B: '#3fa6f0', C: '#2a6fd0', D: '#1d4596' });
const WAVE_EL = {
  aqua: WAVE_PAL,
  fire: recolor(WAVE_PAL, { W: '#fffbe0', H: '#ffe2b0', A: '#ffab4a', B: '#f06a2a', C: '#c0401e', D: '#7e2214' }),
  wood: recolor(WAVE_PAL, { W: '#f8ffe8', H: '#e0ffc0', A: '#a6e86a', B: '#5ab83a', C: '#3a8a2a', D: '#22561c' }),
  elec: recolor(WAVE_PAL, { H: '#fffbd0', A: '#ffe14a', B: '#e3a01e', C: '#a06a10', D: '#5a3a08' }),
  null: recolor(WAVE_PAL, { H: '#e8eef8', A: '#b0bccc', B: '#7d8aa0', C: '#545f75', D: '#363d4e' }),
};
const WAVE_OMEGA = recolor(WAVE_PAL, { H: '#e8d8ff', A: '#a68af8', B: '#6c4ad8', C: '#4428a8', D: '#26126a' });
const GLOOPWAVE = [
  art(`
    ..........HHAA.......
    ........HWWHAAAB.....
    .......HWHAAAABBB....
    ......HHAAAABBBCBB...
    .....HAAAABBBCCC.BC..
    ....HAAABBBBCC....C..
    ...HAAABBBBCC........
    ..HAAABBBBBCC........
    .HAAAABBBBBBCC.......
    HAAAAABBBBBBBCC......
    AAAAAABBBBBBBBCCC....
    BBBBBBBBBBBBCCCCCDD..
    .CCCCCCCCCCCCDDDDD...
  `),
  art(`
    .........HHAA........
    .......HWWHAAAB......
    ......HWHAAAABBB.....
    .....HHAAAABBBCBBB...
    ....HAAAABBBCCC..BC..
    ...HAAABBBBCC.....C..
    ..HAAABBBBCC.........
    ..HAABBBBBCC.........
    .HAAAABBBBBCC........
    HAAAAABBBBBBCCC......
    AAAAAABBBBBBBBCCC....
    BBBBBBBBBBBBBCCCCDD..
    .CCCCCCCCCCCCCDDDD...
  `),
];
SPELL_SPRITES.gloopwave = {
  draw(ctx, s, x, y, t) {
    const L = spellLv(s);
    const el = s.element ?? s.hit?.element ?? 'aqua';
    const pal = L === 4 ? WAVE_OMEGA : WAVE_EL[el] ?? WAVE_PAL;
    const dir = (s.dir ?? -1) < 0 ? -1 : 1;
    const rows = GLOOPWAVE[Math.floor((t ?? 0) / 5) % 2];
    sprite(ctx, rows, pal, x + dir * 2, y + 3, { anchor: 'feet', flip: dir < 0, outline: OUTLINE });
    // Droplets flung off the crest.
    const tt = t ?? 0;
    for (let i = 0; i < 3; i++) {
      const k = ((tt + i * 4) % 12) / 12;
      px(ctx, x + dir * (6 + i * 2 + k * 4), y - 15 + Math.round(k * k * 10) - i, i === 1 ? pal.W : pal.A);
    }
  },
};

// ---- Bubbles where a sunken Gloop is about to surface
const BUBBLE_COLORS = {
  aqua: ['#3fa6f0', '#7fd8ff', '#e8fbff'],
  fire: ['#f06a2a', '#ffab4a', '#fff6b0'],
  wood: ['#5ab83a', '#a6e86a', '#efffd8'],
};
SPELL_SPRITES.gloopbubble = {
  draw(ctx, s, x, y, t) {
    const L = spellLv(s);
    const [deep, mid, light] = L === 4 ? ['#5a3cc8', '#8a6ef0', '#ffe0fb'] : BUBBLE_COLORS[s.data?.element] ?? BUBBLE_COLORS.aqua;
    const p = Math.max(0, Math.min(1, s.data?.progress ?? 0.5));
    const tt = t ?? 0;
    const rx = 6 + Math.round(p * 6);
    ellipse(ctx, x, y - 1, rx, 2, deep);
    ellipse(ctx, x - 1, y - 2, rx - 3, 1, mid);
    // Bubbles rise faster and bigger as it gets ready to surface.
    const n = 2 + Math.round(p * 3);
    for (let i = 0; i < n; i++) {
      const period = 16 - Math.round(p * 6);
      const k = ((tt + i * 7) % period) / period;
      const bx = x + (((i * 5) % 11) - 5);
      const by = y - 2 - Math.round(k * (6 + p * 8));
      const r = k > 0.85 ? 0 : 1 + (i % 2);
      if (r === 0) {
        px(ctx, bx - 1, by, light);
        px(ctx, bx + 1, by, light);
      } else {
        ring(ctx, bx, by, r, mid);
        px(ctx, bx - (r > 1 ? 1 : 0), by - (r > 1 ? 1 : 0), light);
      }
    }
  },
};
