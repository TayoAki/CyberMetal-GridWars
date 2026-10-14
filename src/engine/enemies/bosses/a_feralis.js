import { wait, strike, teleport } from '../../combat.js';
import { COLS, ROWS } from '../../constants.js';
import { noteMove, pickMove, windup, otherSpots, settle, leap } from './a_util.js';

// Feralis: a feral cyber-beast with claw gauntlets and a cable mane. It never sits still: bursts of
// quick, erratic leaps around its area, then one of:
//   Rake        - crouches (counterable), swipes, and three claw marks drop on the player's whole column;
//                 they strike once the telegraph completes.
//   Pounce Dash - leaps into the player's row, crouches (counterable), vanishes and tears straight across
//                 the row, then lands back in its area. V3+ may pounce twice.
//   Howl        - (V2+) a long counterable howl, then two quick Rakes in a row.
// Mirrors BN3's BeastMan (HP 500/700/900/1600, Null).

// One claw mark on (c, r): a telegraph that strikes when it completes. A cell per spell keeps each mark
// drawn on its own row.
function clawMark(b, e, c, r, warn, hit) {
  const sp = b.addSpell({ type: 'rakewarn', team: e.team, owner: e, col: c, row: r, dir: e.facing, hit });
  sp.data.level = e.level;
  sp.data.delay = warn;
  sp.script = (function* () {
    for (let t = 0; t < warn; t++) {
      sp.data.progress = t / warn;
      yield;
    }
    sp.data.progress = 1;
    sp.data.struck = true;
    strike(b, e, [[c, r]], hit, { fx: 'rakeclaw', src: sp });
    for (let t = 0; t < 8; t++) yield;
  })();
  return sp;
}

function rakeColumn(b, e, col, warn, damage) {
  const hit = { damage, flinch: true };
  for (let r = 0; r < ROWS; r++) clawMark(b, e, col, r, warn, hit);
  b.emit('sfx', { name: 'claw' });
}

function* rake(b, e, s) {
  noteMove(e, 'rake');
  yield* windup(e, 'crouch', s.rakeWind);
  e.setAnim('rake');
  rakeColumn(b, e, b.player.col, s.rakeWarn, s.rake);
  yield* wait(s.rakeWarn + 10);
}

function* howl(b, e, s) {
  noteMove(e, 'howl');
  b.emit('fx', { fx: 'howlwave', col: e.col, row: e.row, dir: e.facing });
  b.emit('sfx', { name: 'roar' });
  yield* windup(e, 'howl', s.howlWind);
  for (let k = 0; k < 2; k++) {
    e.setAnim('rake');
    rakeColumn(b, e, b.player.col, s.quickWarn, s.rake);
    yield* wait(s.quickGap >> 1);
    e.setAnim('crouch');
    yield* wait(s.quickGap - (s.quickGap >> 1));
  }
  e.setAnim('rake');
  yield* wait(s.quickWarn);
}

// Vanish and tear across the row. The body stays registered on its panel but is hidden (untargetable,
// not drawn); the 'pounce' spell carries the hitbox and is what the view draws.
function* dash(b, e, s) {
  const row = e.row;
  const startCol = e.col;
  const dir = e.facing;
  const end = dir < 0 ? -1 : COLS;
  const speed = s.pounceSpeed;
  e.hidden = true;
  e.setAnim('pounce');
  b.emit('sfx', { name: 'dash' });
  const sp = b.addSpell({ type: 'pounce', team: e.team, owner: e, col: startCol, row, dir, hit: { damage: s.pounce, flinch: true } });
  sp.data.level = e.level;
  sp.script = (function* () {
    for (let c = startCol + dir; c !== end + dir; c += dir) {
      for (let f = 0; f < speed; f++) {
        const x = c - dir + dir * ((f + 1) / speed);
        sp.x = x;
        sp.col = Math.max(0, Math.min(COLS - 1, c));
        if (e.alive && e.hidden) e.offsetX = x - startCol;
        if (c >= 0 && c < COLS) b.hitPanel(sp, c, row);
        yield;
      }
    }
  })();
  while (sp.alive) yield;
  e.offsetX = 0;
  e.hidden = false;
  // Land back somewhere in its own area.
  const spots = otherSpots(b, e);
  if (spots.length) {
    const [c, r] = b.rng.pick(spots);
    teleport(b, e, c, r);
  } else b.emit('fx', { fx: 'warp', col: e.col, row: e.row });
  e.setAnim('land');
}

function* pounce(b, e, s) {
  noteMove(e, 'pounce');
  const n = b.rng.range(s.pounces[0], s.pounces[1]);
  for (let k = 0; k < n; k++) {
    if (e.row !== b.player.row) {
      // Line up: the nearest free panel in the player's row.
      const inRow = otherSpots(b, e, (c, r) => r === b.player.row);
      inRow.sort((p, q) => Math.abs(p[0] - e.col) - Math.abs(q[0] - e.col) || p[0] - q[0]);
      if (inRow.length) {
        e.setAnim('move');
        yield* leap(b, e, inRow[0][0], inRow[0][1], s.hopT, 8);
      }
    }
    yield* windup(e, 'crouch', s.pounceWind);
    yield* dash(b, e, s);
    yield* wait(k < n - 1 ? 10 : 16);
  }
}

export const FERALIS = {
  type: 'feralis',
  kind: 'navi',
  mirrors: 'BeastMan',
  names: ['Feralis', 'FeralisV2', 'FeralisV3', 'FeralisΩ'],
  hp: [500, 700, 900, 1600],
  element: 'null',
  levels: [
    // rake/pounce: damage; hops: leaps per burst [min, max]; hopT: frames per leap; hopRest: pause after
    // each leap [min, max]; rakeWarn/quickWarn: claw-mark telegraph frames; pounceSpeed: frames per panel.
    { rake: 40, pounce: 50, hops: [2, 3], hopT: 8, hopRest: [14, 26], rakeWind: 24, rakeWarn: 28, pounceWind: 20, pounceSpeed: 4, pounces: [1, 1], howl: false, howlWind: 0, quickWarn: 0, quickGap: 0, rest: 34 },
    { rake: 70, pounce: 90, hops: [2, 4], hopT: 7, hopRest: [10, 22], rakeWind: 20, rakeWarn: 24, pounceWind: 18, pounceSpeed: 3, pounces: [1, 1], howl: true, howlWind: 36, quickWarn: 20, quickGap: 16, rest: 28 },
    { rake: 110, pounce: 130, hops: [2, 4], hopT: 6, hopRest: [8, 18], rakeWind: 18, rakeWarn: 20, pounceWind: 16, pounceSpeed: 3, pounces: [1, 2], howl: true, howlWind: 32, quickWarn: 18, quickGap: 14, rest: 22 },
    { rake: 160, pounce: 190, hops: [2, 4], hopT: 5, hopRest: [4, 12], rakeWind: 16, rakeWarn: 16, pounceWind: 14, pounceSpeed: 2, pounces: [2, 2], howl: true, howlWind: 28, quickWarn: 14, quickGap: 12, rest: 18 },
  ],
  onSpawn(b, e) {
    e.data.moves = {};
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.hidden = false;
    e.setAnim('idle');
    yield* wait(b.rng.range(10, 22));
    for (;;) {
      // Erratic prowling: a burst of quick leaps with uneven pauses.
      const hops = b.rng.range(s.hops[0], s.hops[1]);
      for (let i = 0; i < hops; i++) {
        const spots = otherSpots(b, e);
        if (spots.length) {
          const [c, r] = b.rng.pick(spots);
          e.setAnim('move');
          yield* leap(b, e, c, r, s.hopT, 10);
        }
        e.setAnim('idle');
        yield* wait(b.rng.range(s.hopRest[0], s.hopRest[1]));
      }
      const move = pickMove(b, e, [
        ['rake', 4],
        ['pounce', e.data.lastMove === 'pounce' ? 1 : 3],
        ['howl', s.howl ? 3 : 0],
      ]);
      if (move === 'pounce') yield* pounce(b, e, s);
      else if (move === 'howl' && s.howl) yield* howl(b, e, s);
      else yield* rake(b, e, s);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
  onFlinch(b, e) {
    settle(e);
    e.hidden = false;
  },
};
