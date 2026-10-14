import { wait, strike, projectile, teleport } from '../../combat.js';
import { noteMove, pickMove, settle, windup, markCounter, pose, frontCol, backCol, otherSpots, depth } from './b_util.js';

// Sabre: the rival. A sleek crimson duelist with a hexagonal energy shield and a curved saber. He blinks
// around the back of his area watching the player, and the moment the player fires (buster, charge shot
// or chip) he may snap his shield up: for a second every hit is blocked, and the first one is bounced back
// down his row. The guard then needs a moment to recharge — the window to strike. Between guards he attacks:
//   Wide Slash  - blinks to the front column of his area in the player's row, raises the saber
//                 (counterable) and cuts the whole column in front of him: the player's front column.
//   Crescent    - from the back, an overhead swing that sends a crimson blade wave down his row.
//   Step Slash  - (V2+) blinks to the front, draws back (counterable) and lunges: a thrust two panels deep.
//   Triple Edge - (V3+) three quick slashes (wide, thrust, wide), re-aiming at the player's row each time;
//                 he is spent afterwards — the big opening.
// After blocking he may riposte with an immediate Wide Slash. Mirrors BN3's ProtoMan
// (HP 1000/1300/1600/2000, Null).

// Did the player just start an attack (or hurt Sabre)? Edge-triggered on the controller's state.
function threat(b, e) {
  const c = b.controller;
  const cd = c?.busterCooldown ?? 0;
  const act = c?.action ?? null;
  const fired = cd > (e.data.lastCd ?? 0);
  const chip = !!act && act !== e.data.lastAction;
  e.data.lastCd = cd;
  e.data.lastAction = act;
  const stung = !!e.data.stung;
  e.data.stung = false;
  return fired || chip || stung;
}

function canGuard(b, e) {
  return b.fightFrames >= (e.data.guardReady ?? 0);
}

// The shield is up for guardTime frames: every hit is blocked, and the first one is bounced back down the
// row (the engine fires the reflection); after that it only blocks.
function* guard(b, e, s) {
  noteMove(e, 'guard');
  e.setAnim('guard');
  e.guardTimer = s.guardTime;
  e.guard = { reflect: s.reflect };
  b.emit('sfx', { name: 'guardup' });
  const old = new Set(b.spells.filter((sp) => sp.type === 'reflect' && sp.owner === e));
  for (let t = 0; t < s.guardTime; t++) {
    if (e.guard?.reflect > 0 && b.spells.some((sp) => sp.type === 'reflect' && sp.owner === e && !old.has(sp))) e.guard.reflect = 0;
    yield;
  }
  e.guardTimer = 0;
  e.guard = null;
  e.data.guardReady = b.fightFrames + s.guardCd;
  e.setAnim('idle');
  threat(b, e); // forget what was thrown at the shield
}

// Blink to another panel, usually toward the back of the area.
function* hop(b, e, s) {
  const spots = otherSpots(b, e);
  if (!spots.length) return;
  const deepest = Math.max(...spots.map(([c]) => depth(e, c)));
  const back = spots.filter(([c]) => depth(e, c) >= deepest - 1);
  const [c, r] = b.rng.pick(back.length && b.rng.chance(0.75) ? back : spots);
  e.setAnim('move');
  yield* wait(4);
  teleport(b, e, c, r);
  yield* pose(e, 'move', 4);
  e.setAnim('idle');
}

// Idle phase: watch the player, guard on reflex, drift around. Returns 'riposte' to strike back at once.
function* watch(b, e, s, frames) {
  let hopIn = s.hop;
  e.setAnim('idle');
  for (let t = 0; t < frames; t++) {
    if (threat(b, e) && canGuard(b, e) && b.rng.chance(s.guardChance)) {
      yield* wait(s.react);
      yield* guard(b, e, s);
      if (b.rng.chance(s.riposte)) return 'riposte';
      hopIn = s.hop;
      continue;
    }
    if (--hopIn <= 0) {
      hopIn = s.hop;
      if (b.rng.chance(0.7)) yield* hop(b, e, s);
    }
    yield;
  }
  return null;
}

// Blink to the front of the area in the player's row, wind up, and cut. kind: 'wide' (the column in front)
// or 'long' (a two-panel thrust down the row). Returns 'ok', 'skip' (can't reach) or 'countered'.
function* slash(b, e, s, kind, wind, damage) {
  const row = b.player.row;
  const fc = frontCol(b, e, row);
  if (fc === null) return 'skip';
  if (fc !== e.col || row !== e.row) {
    e.setAnim('move');
    yield* wait(3);
    if (!teleport(b, e, fc, row)) return 'skip';
  }
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, kind === 'long' ? 'aim' : 'windup', wind))) return 'countered';
  const d = e.facing;
  const c1 = e.col + d;
  const cells = kind === 'long' ? [[c1, e.row], [c1 + d, e.row]] : [[c1, e.row - 1], [c1, e.row], [c1, e.row + 1]];
  e.setAnim(kind === 'long' ? 'thrust' : 'slash');
  if (kind === 'long') e.offsetX = d * 0.3;
  b.emit('sfx', { name: 'sword' });
  b.emit('fx', { fx: 'sabreslash', shape: kind, col: c1, row: e.row, dir: d, level: e.level });
  strike(b, e, cells, { damage, flinch: true });
  yield* wait(10);
  e.offsetX = 0;
  return 'ok';
}

function* recoverAndHop(b, e, s, extra = 0) {
  yield* pose(e, 'idle', s.recover + extra);
  yield* hop(b, e, s);
}

function* crescent(b, e, s) {
  // Line up from the back of the area.
  const row = b.player.row;
  if (row !== e.row) {
    const c = backCol(b, e, row);
    if (c !== null) {
      e.setAnim('move');
      yield* wait(3);
      teleport(b, e, c, row);
    }
  }
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, 'windup', s.waveWind))) return yield* pose(e, 'idle', s.recover);
  e.setAnim('slash');
  b.emit('sfx', { name: 'sword' });
  const w = projectile(b, e, { damage: s.wave, flinch: true }, { type: 'sabrewave', speed: s.waveSpeed });
  w.data.level = e.level;
  w.z = 1;
  yield* wait(14);
  yield* pose(e, 'idle', s.recover);
}

function* tripleEdge(b, e, s) {
  e.data.lastTriple = b.fightFrames;
  const kinds = ['wide', 'long', 'wide'];
  for (let i = 0; i < 3; i++) {
    const r = yield* slash(b, e, s, kinds[i], i === 0 ? s.windup : s.tripleWind, s.triple);
    if (r !== 'ok') break;
    yield* wait(s.tripleGap);
  }
  // Spent: the big opening.
  yield* recoverAndHop(b, e, s, 20);
}

export const SABRE = {
  type: 'sabre',
  kind: 'navi',
  mirrors: 'ProtoMan',
  names: ['Sabre', 'SabreV2', 'SabreV3', 'SabreΩ'],
  hp: [1000, 1300, 1600, 2000],
  element: 'null',
  levels: [
    // slash: Wide Slash; wave: Crescent; stepSlash: Step Slash (V2+); triple: each Triple Edge cut (V3+);
    // reflect: damage bounced back while guarding. guardChance/react: odds and reaction frames to guard
    // when the player fires; guardCd: frames before he can guard again; riposte: odds of striking back.
    { attack: 60, slash: 60, wave: 40, stepSlash: 0, triple: 0, reflect: 10, windup: 22, aimWind: 0, waveWind: 26, waveSpeed: 6, tripleWind: 0, tripleGap: 0, tripleCd: 0, guardChance: 0.45, react: 10, guardTime: 60, guardCd: 100, riposte: 0.25, idle: [60, 100], hop: 34, recover: 44 },
    { attack: 80, slash: 80, wave: 60, stepSlash: 90, triple: 0, reflect: 20, windup: 20, aimWind: 22, waveWind: 22, waveSpeed: 5, tripleWind: 0, tripleGap: 0, tripleCd: 0, guardChance: 0.6, react: 8, guardTime: 60, guardCd: 90, riposte: 0.35, idle: [50, 85], hop: 30, recover: 36 },
    { attack: 120, slash: 120, wave: 90, stepSlash: 130, triple: 100, reflect: 30, windup: 18, aimWind: 20, waveWind: 20, waveSpeed: 4, tripleWind: 12, tripleGap: 6, tripleCd: 480, guardChance: 0.62, react: 6, guardTime: 60, guardCd: 96, riposte: 0.45, idle: [40, 70], hop: 26, recover: 30 },
    { attack: 180, slash: 180, wave: 130, stepSlash: 190, triple: 150, reflect: 50, windup: 15, aimWind: 16, waveWind: 16, waveSpeed: 3, tripleWind: 10, tripleGap: 4, tripleCd: 360, guardChance: 0.7, react: 4, guardTime: 60, guardCd: 84, riposte: 0.55, idle: [30, 55], hop: 22, recover: 24 },
  ],
  onSpawn(b, e) {
    e.data.moves = {};
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    threat(b, e);
    if (!e.data.started) {
      e.data.started = true;
      yield* wait(b.rng.range(24, 40));
    } else if (e.data.flinched) {
      // Stung: shield up at once, or slip away.
      e.data.flinched = false;
      if (canGuard(b, e) && b.rng.chance(s.guardChance)) yield* guard(b, e, s);
      else yield* hop(b, e, s);
    }
    for (;;) {
      const riposte = (yield* watch(b, e, s, b.rng.range(s.idle[0], s.idle[1]))) === 'riposte';
      const tripleOk = s.triple > 0 && b.fightFrames - (e.data.lastTriple ?? -1e9) >= s.tripleCd;
      const move = riposte
        ? 'wide'
        : pickMove(b, e, [
            ['wide', 5],
            ['crescent', 3],
            ['step', s.stepSlash ? 4 : 0],
            ['triple', tripleOk ? 3 : 0],
          ]);
      noteMove(e, move);
      if (move === 'crescent') yield* crescent(b, e, s);
      else if (move === 'triple') yield* tripleEdge(b, e, s);
      else {
        const long = move === 'step';
        const r = yield* slash(b, e, s, long ? 'long' : 'wide', long ? s.aimWind : riposte ? Math.max(10, s.windup - 6) : s.windup, long ? s.stepSlash : s.slash);
        if (r !== 'skip') yield* recoverAndHop(b, e, s);
      }
    }
  },
  onHit(b, e, hit, res) {
    markCounter(b, e, hit);
    if (res.dealt > 0) e.data.stung = true;
  },
  onFlinch(b, e) {
    e.data.flinched = true;
  },
};
