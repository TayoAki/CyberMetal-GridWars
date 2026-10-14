import { wait, drop, source } from '../../combat.js';
import { COLS, PANEL } from '../../constants.js';
import { noteMove, pickMove, settle, windup, markCounter, pose, foeArea } from './b_util.js';

// Ironclad: a squat riveted iron golem with a furnace in its chest and a hydraulic piston for a right arm.
// It never flinches (super armor) and can't be shoved, so the fight is about reading its tells and
// punishing the long recoveries. It stomps around its area, then picks one of:
//   Piston Slam - cocks the piston (counterable) and fires the fist into the sky; a shadow grows on the
//                 player's panel and the fist slams down, breaking the panel. V2+ slams again on the
//                 player's new panel (Ω: three times). The arm is empty until the fist comes home.
//   Saw Blade   - lines up with the player's row, rears back (counterable) and hurls a spinning saw that
//                 grinds down the row to the far edge and back, cutting on both passes.
//   Quake Stomp - (V3+) a counterable leg lift, then a stomp that cracks every panel of the player's area
//                 and jolts a grounded player for small damage.
// Mirrors BN3's MetalMan (HP 500/800/1200/1700, Null).

function* roam(b, e, s, frames) {
  let t = 0;
  e.setAnim('idle');
  while (t < frames) {
    const n = Math.min(s.stepEvery, frames - t);
    yield* wait(n);
    t += n;
    if (t >= frames || !b.rng.chance(0.55)) continue;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => b.canEnter(e, e.col + dc, e.row + dr));
    if (!dirs.length) continue;
    // Half the time it lumbers toward the player's row (so a saw throw is quick), else anywhere.
    const toward = dirs.filter(([, dr]) => dr !== 0 && Math.sign(dr) === Math.sign(b.player.row - e.row));
    const [dc, dr] = toward.length && b.rng.chance(0.5) ? toward[0] : b.rng.pick(dirs);
    b.tryStep(e, dc, dr);
    b.emit('sfx', { name: 'thud' });
    yield* pose(e, 'move', 12);
    t += 12;
    e.setAnim('idle');
  }
}

function pistonFist(b, e, s, c, r, delay) {
  const sp = drop(b, e, { damage: s.slam, flinch: true }, c, r, { delay, type: 'piston', breakPanel: true, landFx: 'pistonhit', sfx: 'hammer', linger: 14 });
  sp.data.level = e.level;
  return sp;
}

function* pistonSlam(b, e, s) {
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, 'windup', s.windup))) return yield* pose(e, 'idle', s.recover);
  // The fist rockets off the arm and out of sight.
  e.setAnim('launch');
  b.emit('sfx', { name: 'dash' });
  b.emit('fx', { fx: 'ironsteam', col: e.col, row: e.row, dir: e.facing, level: e.level });
  yield* wait(6);
  for (let k = 0; k < s.slams; k++) {
    const delay = k === 0 ? s.telegraph : s.telegraph2;
    pistonFist(b, e, s, b.player.col, b.player.row, delay);
    yield* wait(delay + (k < s.slams - 1 ? s.between : 12));
  }
  // The fist flies home and clanks back onto the piston.
  b.emit('sfx', { name: 'thud' });
  yield* pose(e, 'catch', 14);
  yield* pose(e, 'idle', s.recover);
}

// A spinning saw that grinds out along the thrower's row to the far edge, then back into its hand. It
// passes through bodies (hitting each once per pass) and flies over holes.
function throwSaw(b, e, hit, speed) {
  const d = e.facing;
  const row = e.row;
  const home = e.col;
  const path = [];
  for (let c = home + d; c >= 0 && c < COLS; c += d) path.push(c);
  const s = b.addSpell({ type: 'sawblade', team: e.team, owner: e, col: path[0] ?? home, row, dir: d, hit });
  s.x = home + d * 0.4;
  s.data.level = e.level;
  s.script = (function* () {
    function* travel(cols) {
      for (const c of cols) {
        s.col = c;
        for (let f = 0; f < speed; f++) {
          s.x += (c - s.x) / (speed - f);
          b.hitPanel(s, c, row);
          yield;
        }
      }
    }
    yield* travel(path);
    // Turn at the far edge (grinding there a moment), then come back for a second pass.
    s.hitIds.clear();
    s.dir = -d;
    s.data.returning = true;
    for (let f = 0; f < 10; f++) {
      b.hitPanel(s, s.col, row);
      yield;
    }
    yield* travel(path.slice(0, -1).reverse());
    for (let f = 0; f < speed; f++) {
      s.x += (home - s.x) / (speed - f);
      yield;
    }
  })();
  return s;
}

function* sawBlade(b, e, s) {
  // Lumber into the player's row first.
  for (let n = 0; n < 2 && e.row !== b.player.row; n++) {
    if (!b.tryStep(e, 0, Math.sign(b.player.row - e.row))) break;
    b.emit('sfx', { name: 'thud' });
    yield* pose(e, 'move', s.lineUp);
  }
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, 'sawwind', s.sawWind))) return yield* pose(e, 'idle', s.recover);
  e.setAnim('throw');
  b.emit('sfx', { name: 'boomer' });
  const saw = throwSaw(b, e, { damage: s.saw, flinch: true }, s.sawSpeed);
  for (let t = 0; saw.alive && t < 300; t++) yield;
  b.emit('sfx', { name: 'thud' });
  yield* pose(e, 'catch', 10);
  yield* pose(e, 'idle', s.recover);
}

function canQuake(b, e, s) {
  if (!s.quake || b.fightFrames - (e.data.lastQuake ?? -1e9) < s.quakeCd) return false;
  // Only worth it while there is still floor left to crack.
  return foeArea(b, e).filter(([c, r]) => b.field.typeAt(c, r) !== PANEL.CRACKED && !b.field.isHole(c, r)).length >= 4;
}

function* quakeStomp(b, e, s) {
  e.data.lastQuake = b.fightFrames;
  if (!(yield* windup(b, e, 'stompwind', s.stompWind))) return yield* pose(e, 'idle', s.recover);
  e.setAnim('stomp');
  b.emit('sfx', { name: 'bigexplode' });
  b.emit('fx', { fx: 'ironquake', col: e.col, row: e.row, level: e.level, big: true });
  for (const [c, r] of foeArea(b, e)) {
    b.emit('fx', { fx: 'ironquake', col: c, row: r, level: e.level });
    // Normal panels crack; already-cracked ones are left alone (the stomp never digs holes by itself).
    if (b.field.typeAt(c, r) !== PANEL.CRACKED) b.field.crack(c, r, !!b.entityAt(c, r));
  }
  const hit = { damage: s.quake, flinch: true };
  const src = source(e, hit);
  for (const f of b.opponentsOf(e.team)) if (f.grounded && f.targetable) b.applyHit(f, hit, src);
  yield* wait(22);
  yield* pose(e, 'idle', s.recover);
}

export const IRONCLAD = {
  type: 'ironclad',
  kind: 'navi',
  mirrors: 'MetalMan',
  names: ['Ironclad', 'IroncladV2', 'IroncladV3', 'IroncladΩ'],
  hp: [500, 800, 1200, 1700],
  element: 'null',
  superArmor: true,
  levels: [
    // attack/slam: Piston Slam damage; saw: Saw Blade (each pass); quake: Quake Stomp jolt (V3+).
    // windup/sawWind/stompWind: counterable tells; telegraph(2): shadow frames before the first (later) slam.
    { attack: 40, slam: 40, saw: 30, quake: 0, slams: 1, windup: 28, telegraph: 44, telegraph2: 36, between: 14, sawWind: 24, sawSpeed: 6, lineUp: 16, stompWind: 0, quakeCd: 0, idle: [70, 110], stepEvery: 34, recover: 44 },
    { attack: 70, slam: 70, saw: 50, quake: 0, slams: 2, windup: 24, telegraph: 40, telegraph2: 32, between: 12, sawWind: 22, sawSpeed: 5, lineUp: 14, stompWind: 0, quakeCd: 0, idle: [55, 90], stepEvery: 28, recover: 36 },
    { attack: 110, slam: 110, saw: 80, quake: 30, slams: 2, windup: 22, telegraph: 38, telegraph2: 30, between: 10, sawWind: 20, sawSpeed: 4, lineUp: 12, stompWind: 30, quakeCd: 720, idle: [45, 75], stepEvery: 24, recover: 30 },
    { attack: 160, slam: 160, saw: 120, quake: 50, slams: 3, windup: 18, telegraph: 34, telegraph2: 26, between: 8, sawWind: 16, sawSpeed: 3, lineUp: 10, stompWind: 26, quakeCd: 600, idle: [35, 60], stepEvery: 20, recover: 24 },
  ],
  onSpawn(b, e) {
    e.immovable = true; // too heavy to shove
    e.data.moves = {};
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    yield* wait(e.data.started ? 12 : b.rng.range(24, 44));
    e.data.started = true;
    for (;;) {
      yield* roam(b, e, s, b.rng.range(s.idle[0], s.idle[1]));
      const move = pickMove(b, e, [
        ['slam', 5],
        ['saw', 4],
        ['quake', canQuake(b, e, s) ? 3 : 0],
      ]);
      noteMove(e, move);
      if (move === 'quake') yield* quakeStomp(b, e, s);
      else if (move === 'saw') yield* sawBlade(b, e, s);
      else yield* pistonSlam(b, e, s);
    }
  },
  onHit(b, e, hit) {
    markCounter(b, e, hit);
  },
};
