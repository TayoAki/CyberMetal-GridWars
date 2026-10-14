import { wait, drop, shockwave, zone, teleport } from '../../combat.js';
import { COLS } from '../../constants.js';
import { noteMove, pickMove, settle, windup, markCounter, pose, foeArea, otherSpots, backCol, warning } from './b_util.js';

// ZeroDay: the final boss. A hooded, hovering figure of dark chrome with a cracked mask and a void core
// burning in its chest. It warps around its area between attacks:
//   Null Barrage   - its claw charges (counterable), then a stream of void bolts rains on the player's
//                    area; each bolt marks its panel briefly first, and every third one hunts the player.
//   Earth Splitter - crouches (counterable), leaps out of sight and smashes down: cracking shockwaves run
//                    along every row in two pulses (the player's row first, or the other two first), so
//                    the player must weave between them.
//   Dark Aura      - (V2+) raised as the fight opens: any hit under 100 damage is shrugged off until a
//                    single big hit breaks it; it is raised again after a cooldown (the raise is an
//                    opening: counterable, and nothing protects it until the aura is up).
//   Void Collapse  - (V3+) blinks to the back of the player's row and gathers the void for a long,
//                    counterable charge while the row is marked, then a giant beam scours the whole row.
//                    Ω re-aims once mid-charge if the player slips out of the row.
// Mirrors BN3's Bass (HP 1000/2000/3000/3000, Null).

// Record when the aura was lost (blocked hits never reach onHit, so poll it).
function watchAura(b, e) {
  if (e.auraPower > 0) e.data.auraUp = true;
  else if (e.data.auraUp) {
    e.data.auraUp = false;
    e.data.auraLost = b.fightFrames;
  }
}

function* drift(b, e, s, frames) {
  let t = 0;
  e.setAnim('idle');
  while (t < frames) {
    const n = Math.min(s.warpEvery, frames - t);
    for (let i = 0; i < n; i++) {
      watchAura(b, e);
      yield;
    }
    t += n;
    if (t >= frames || !b.rng.chance(0.65)) continue;
    const spots = otherSpots(b, e);
    if (!spots.length) continue;
    const [c, r] = b.rng.pick(spots);
    e.setAnim('move');
    yield* wait(5);
    teleport(b, e, c, r);
    yield* pose(e, 'move', 5);
    e.setAnim('idle');
    t += 10;
  }
}

function* nullBarrage(b, e, s) {
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, 'barragewind', s.barrageWind))) return yield* pose(e, 'idle', s.recover);
  e.setAnim('barrage');
  const hit = { damage: s.shot, flinch: true };
  for (let i = 0; i < s.shots; i++) {
    const area = foeArea(b, e);
    const p = b.player;
    const [c, r] = i % 3 === 0 || !area.length ? [p.col, p.row] : b.rng.pick(area);
    const sp = drop(b, e, hit, c, r, { delay: s.shotDelay, type: 'nullshot', landFx: 'nullburst', sfx: 'explode', linger: 4 });
    sp.data.level = e.level;
    b.emit('sfx', { name: 'buster' });
    yield* wait(s.shotGap);
  }
  yield* pose(e, 'idle', s.shotDelay + s.recover);
}

function splitWave(b, e, hit, row, speed) {
  const sw = shockwave(b, e, hit, {
    row,
    col: e.col + e.facing,
    speed,
    type: 'voidwave',
    // Crack the floor it crosses in the player's area (its own panels are spared).
    onPanel: (sp, c, r) => {
      if (b.field.ownerAt(c, r) !== e.team) b.field.crack(c, r, !!b.entityAt(c, r));
    },
  });
  sw.data.level = e.level;
  return sw;
}

function* earthSplitter(b, e, s) {
  if (!(yield* windup(b, e, 'crouch', s.splitWind))) return yield* pose(e, 'idle', s.recover);
  e.setAnim('leap');
  b.emit('sfx', { name: 'dash' });
  for (let t = 1; t <= 10; t++) {
    e.z = t * 7;
    yield;
  }
  e.hidden = true; // out of sight above the field
  yield* wait(s.airTime);
  // Come down on a panel of its area, favouring the middle row.
  const spots = otherSpots(b, e);
  const mid = spots.filter(([, r]) => r === 1);
  const land = mid.length && b.rng.chance(0.6) ? b.rng.pick(mid) : spots.length ? b.rng.pick(spots) : null;
  if (land) b.moveEntity(e, land[0], land[1], { noBreak: true });
  e.hidden = false;
  e.setAnim('smash');
  for (let t = 1; t <= 6; t++) {
    e.z = Math.max(0, 70 - t * 12);
    yield;
  }
  e.z = 0;
  b.emit('sfx', { name: 'bigexplode' });
  b.emit('fx', { fx: 'voidquake', col: e.col, row: e.row, level: e.level });
  const hit = { damage: s.wave, flinch: true };
  const pr = b.player.row;
  const others = [0, 1, 2].filter((r) => r !== pr);
  const [first, second] = b.rng.chance(0.5) ? [[pr], others] : [others, [pr]];
  for (const r of first) splitWave(b, e, hit, r, s.waveSpeed);
  yield* wait(s.pulseGap);
  b.emit('sfx', { name: 'shockwave' });
  for (const r of second) splitWave(b, e, hit, r, s.waveSpeed);
  yield* wait(12);
  yield* pose(e, 'idle', s.recover);
}

function* darkAura(b, e, s) {
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, 'aura', s.auraWind))) return yield* pose(e, 'idle', s.recover);
  e.auraPower = s.aura;
  e.data.auraUp = true;
  b.emit('sfx', { name: 'barrier' });
  b.emit('fx', { fx: 'zeroaura', col: e.col, row: e.row, level: e.level });
  yield* pose(e, 'aura', 20);
  e.setAnim('idle');
}

function auraDue(b, e, s) {
  return s.aura > 0 && e.auraPower <= 0 && b.fightFrames - (e.data.auraLost ?? -1e9) >= s.auraCd;
}

function* voidCollapse(b, e, s) {
  e.data.lastBeam = b.fightFrames;
  // Blink to the back of the player's row.
  const go = function* (row) {
    const c = backCol(b, e, row);
    if (c === null || (c === e.col && row === e.row)) return;
    e.setAnim('move');
    yield* wait(4);
    teleport(b, e, c, row);
  };
  yield* go(b.player.row);
  const rowCells = () => {
    const out = [];
    for (let c = 0; c < COLS; c++) if (c !== e.col) out.push([c, e.row]);
    return out;
  };
  let warn = warning(b, e, 'voidwarn', rowCells(), s.beamWind, { fromCol: e.col, dir: e.facing });
  e.data.warn = warn;
  b.emit('sfx', { name: 'charge' });
  let relocked = !s.relock;
  let ok = yield* windup(b, e, 'charge', s.beamWind, (t) => {
    // Ω: once, past the halfway mark, re-aim at a player who left the row (the tell restarts short).
    if (!relocked && t > s.beamWind / 2 && b.player.row !== e.row) {
      relocked = true;
      e.data.relock = true;
      return true;
    }
    return false;
  });
  if (ok && e.data.relock) {
    e.data.relock = false;
    warn.kill();
    yield* go(b.player.row);
    warn = warning(b, e, 'voidwarn', rowCells(), s.relockWind, { fromCol: e.col, dir: e.facing });
    e.data.warn = warn;
    ok = yield* windup(b, e, 'charge', s.relockWind);
  }
  warn.kill();
  e.data.warn = null;
  if (!ok) return yield* pose(e, 'idle', s.recover);
  e.setAnim('beam');
  b.emit('sfx', { name: 'bigexplode' });
  b.emit('sfx', { name: 'lance' });
  const beam = zone(b, e, { damage: s.beam, flinch: true }, rowCells(), s.beamFrames, { type: 'voidbeam' });
  beam.z = 1; // drawn through the bodies it scours
  beam.data.fromCol = e.col;
  beam.data.dir = e.facing;
  beam.data.level = e.level;
  beam.data.frames = s.beamFrames;
  yield* wait(s.beamFrames);
  // Spent: a long opening.
  yield* pose(e, 'idle', s.beamRecover);
}

export const ZERODAY = {
  type: 'zeroday',
  kind: 'navi',
  mirrors: 'Bass',
  names: ['ZeroDay', 'ZeroDayV2', 'ZeroDayV3', 'ZeroDayΩ'],
  hp: [1000, 2000, 3000, 3000],
  element: 'null',
  flying: true, // hovers: holes and floor effects don't touch it
  levels: [
    // shot: each Null Barrage bolt (shots of them, shotGap apart, each marked shotDelay frames first);
    // wave: Earth Splitter shockwaves (waveSpeed frames per panel, pulseGap between the pulses);
    // aura: Dark Aura power (V2+), re-raised auraCd frames after it breaks; beam: Void Collapse (V3+).
    { attack: 20, shot: 20, shots: 10, shotGap: 8, shotDelay: 20, barrageWind: 20, wave: 50, waveSpeed: 8, splitWind: 26, airTime: 18, pulseGap: 30, aura: 0, auraWind: 0, auraCd: 0, beam: 0, beamWind: 0, relock: false, relockWind: 0, beamFrames: 0, beamCd: 0, beamRecover: 0, idle: [55, 90], warpEvery: 40, recover: 40 },
    { attack: 40, shot: 40, shots: 14, shotGap: 7, shotDelay: 18, barrageWind: 18, wave: 80, waveSpeed: 7, splitWind: 24, airTime: 16, pulseGap: 28, aura: 100, auraWind: 24, auraCd: 900, beam: 0, beamWind: 0, relock: false, relockWind: 0, beamFrames: 0, beamCd: 0, beamRecover: 0, idle: [45, 80], warpEvery: 34, recover: 34 },
    { attack: 60, shot: 60, shots: 18, shotGap: 6, shotDelay: 16, barrageWind: 16, wave: 120, waveSpeed: 6, splitWind: 22, airTime: 14, pulseGap: 26, aura: 100, auraWind: 22, auraCd: 780, beam: 150, beamWind: 80, relock: false, relockWind: 0, beamFrames: 30, beamCd: 480, beamRecover: 60, idle: [40, 70], warpEvery: 30, recover: 30 },
    { attack: 100, shot: 100, shots: 22, shotGap: 5, shotDelay: 14, barrageWind: 14, wave: 160, waveSpeed: 5, splitWind: 20, airTime: 12, pulseGap: 24, aura: 100, auraWind: 20, auraCd: 660, beam: 200, beamWind: 72, relock: true, relockWind: 30, beamFrames: 30, beamCd: 420, beamRecover: 50, idle: [30, 60], warpEvery: 26, recover: 26 },
  ],
  onSpawn(b, e) {
    e.data.moves = {};
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.data.warn?.kill();
    e.data.warn = null;
    e.data.relock = false;
    e.setAnim('idle');
    if (!e.data.started) {
      e.data.started = true;
      yield* wait(b.rng.range(16, 28));
      // The aura is up from the opening bell (V2+).
      if (s.aura > 0) {
        noteMove(e, 'aura');
        yield* darkAura(b, e, s);
      }
    } else yield* wait(10);
    for (;;) {
      yield* drift(b, e, s, b.rng.range(s.idle[0], s.idle[1]));
      watchAura(b, e);
      const beamOk = s.beam > 0 && b.fightFrames - (e.data.lastBeam ?? -1e9) >= s.beamCd;
      const move = auraDue(b, e, s)
        ? 'aura'
        : pickMove(b, e, [
            ['barrage', 4],
            ['split', 3],
            ['collapse', beamOk ? 3 : 0],
          ]);
      noteMove(e, move);
      if (move === 'aura') yield* darkAura(b, e, s);
      else if (move === 'split') yield* earthSplitter(b, e, s);
      else if (move === 'collapse') yield* voidCollapse(b, e, s);
      else yield* nullBarrage(b, e, s);
    }
  },
  onHit(b, e, hit) {
    markCounter(b, e, hit);
  },
  onFlinch(b, e) {
    e.data.warn?.kill();
    e.data.warn = null;
  },
};
