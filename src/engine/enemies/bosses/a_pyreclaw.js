import { wait, zone } from '../../combat.js';
import { COLS, ELEMENT, TEAM } from '../../constants.js';
import { noteMove, pickMove, windup, pose, rowEdge, settle, walkTo, spawnPet, livePets, clearPets, petSpots } from './a_util.js';

// Pyreclaw: a hulking brawler with a furnace for a chest and claw gauntlets. It lumbers a step or two
// between attacks, then:
//   Fire Tower   - raises a claw (counterable) and slams the floor: a pillar of fire erupts at the edge of
//                  the player's area in the player's row and marches across it, leaving brief flames. Once,
//                  it slides to the player's row before marching on. Ω sends a second pillar.
//   Flamethrower - stomps up to the front of its area (into the player's row when it can), braces
//                  (counterable) and pours a 2-panel jet of flame ahead. Flinching it cuts the jet off.
//   Braziers     - (V2+) roars (counterable) and lights 1-2 braziers in its area; each one heals it a
//                  little every so often until destroyed, and gets relit a while after.
// Mirrors BN3's FlameMan (HP 1000/1400/1800/2400, Fire, so weak to Aqua).

const BRAZIER = {
  *ai(b, o) {
    const s = o.data.tune;
    o.setAnim('idle');
    for (;;) {
      yield* wait(s.healEvery);
      const boss = o.data.owner;
      if (boss && boss.alive && !boss.removed && boss.hp < boss.maxHp) {
        o.setAnim('pulse');
        b.heal(boss, s.heal);
        b.emit('fx', { fx: 'emberheal', col: boss.col, row: boss.row });
        b.emit('sfx', { name: 'recover' });
        yield* wait(14);
        o.setAnim('idle');
      }
    }
  },
  onDelete(b, o) {
    const boss = o.data.owner;
    if (boss?.alive) boss.data.brazierReady = Math.max(boss.data.brazierReady ?? 0, b.fightFrames + o.data.tune.brazierCd);
  },
};

// A fire pillar that erupts at the edge of the player's area and marches across the row, one panel
// every `towerSpeed` frames. The first time the player is in another row when it finishes a panel, it
// slides to that row (no hits while sliding) and marches on from there. Every panel it leaves keeps
// burning for `trail` frames.
function fireTower(b, e, s) {
  const dir = e.facing;
  let row = b.player.row;
  let col = rowEdge(b, TEAM.RED, row, 'front');
  if (col < 0) return null;
  const hit = { damage: s.tower, element: ELEMENT.FIRE, flinch: true };
  const sp = b.addSpell({ type: 'firetower2', team: e.team, owner: e, col, row, dir, hit });
  sp.data.level = e.level;
  sp.data.phase = 'rise';
  sp.script = (function* () {
    for (let t = 0; t < s.towerRise; t++) {
      sp.data.progress = t / s.towerRise;
      yield;
    }
    b.emit('sfx', { name: 'flame' });
    let reaimed = false;
    while (col >= 0 && col < COLS) {
      if (b.field.isHole(col, row)) return;
      sp.col = col;
      sp.row = row;
      sp.x = col;
      sp.y = row;
      sp.data.phase = 'burn';
      for (let f = 0; f < s.towerSpeed; f++) {
        sp.data.stepT = f;
        b.hitPanel(sp, col, row);
        yield;
      }
      const trail = zone(b, e, hit, [[col, row]], s.trail, { type: 'pyreflame' });
      trail.data.level = e.level;
      if (!reaimed && b.player.row !== row) {
        // Slide to the player's row (same column), then burn there before marching on.
        reaimed = true;
        const to = b.player.row;
        sp.data.phase = 'shift';
        for (let f = 1; f <= s.towerShift; f++) {
          sp.y = row + ((to - row) * f) / s.towerShift;
          yield;
        }
        row = to;
        continue;
      }
      col += dir;
    }
  })();
  return sp;
}

function* towers(b, e, s) {
  noteMove(e, 'tower');
  yield* windup(e, 'windup', s.towerWind);
  for (let i = 0; i < s.towers; i++) {
    e.setAnim('slam');
    b.emit('fx', { fx: 'pyreburst', col: e.col, row: e.row });
    b.emit('sfx', { name: 'hammer' });
    fireTower(b, e, s);
    if (i < s.towers - 1) {
      yield* wait(s.towerGap);
      yield* pose(e, 'windup', 10);
    }
  }
  yield* wait(26);
}

function* flamethrower(b, e, s) {
  noteMove(e, 'flame');
  // Its jet only reaches the player from the front of its own area.
  const row = b.player.row;
  const front = rowEdge(b, e.team, row, 'front');
  if (front >= 0) yield* walkTo(b, e, front, row, s.step, 'move', 5);
  e.setAnim('idle');
  b.emit('sfx', { name: 'charge' });
  yield* windup(e, 'aim', s.flameWind);
  e.setAnim('blast');
  b.emit('sfx', { name: 'flame' });
  const d = e.facing;
  const cells = [[e.col + d, e.row], [e.col + 2 * d, e.row]];
  const jet = zone(b, e, { damage: s.flame, element: ELEMENT.FIRE, flinch: true }, cells, s.flameTime, { type: 'flamejet' });
  jet.data.level = e.level;
  jet.data.dir = d;
  e.data.jet = jet;
  yield* wait(s.flameTime);
  e.data.jet = null;
  yield* pose(e, 'idle', 12);
  // Lumber back from the front line.
  if (b.tryStep(e, -d, 0)) yield* pose(e, 'move', s.step);
}

function* lightBraziers(b, e, s) {
  noteMove(e, 'brazier');
  b.emit('sfx', { name: 'charge' });
  yield* windup(e, 'roar', s.roarWind);
  const want = s.braziers - livePets(e, 'brazier').length;
  // Behind the front line when possible: they are meant to be dug out.
  let spots = petSpots(b, e, (c, r) => c !== rowEdge(b, e.team, r, 'front'));
  if (spots.length < want) spots = petSpots(b, e);
  b.rng.shuffle(spots);
  for (let i = 0; i < want && spots.length; i++) {
    const [c, r] = spots.pop();
    spawnPet(b, e, { type: 'brazier', name: 'Brazier', col: c, row: r, hp: s.brazierHp, element: ELEMENT.FIRE, def: BRAZIER, data: { tune: s } });
    b.emit('fx', { fx: 'pyreburst', col: c, row: r });
  }
  b.emit('sfx', { name: 'flame' });
  e.data.brazierReady = b.fightFrames + s.brazierCd;
  yield* pose(e, 'roar', 18);
}

// One or two heavy steps to neighbouring panels.
function* lumber(b, e, s) {
  const steps = b.rng.range(1, 2);
  for (let i = 0; i < steps; i++) {
    const opts = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (b.canEnter(e, e.col + dc, e.row + dr)) opts.push([dc, dr]);
    if (!opts.length) break;
    // Drift toward the player's row more often than not.
    const toward = opts.filter(([, dr]) => dr !== 0 && Math.sign(b.player.row - e.row) === dr);
    const [dc, dr] = toward.length && b.rng.chance(0.5) ? toward[0] : b.rng.pick(opts);
    b.tryStep(e, dc, dr);
    yield* pose(e, 'move', s.step);
    yield* pose(e, 'idle', s.pause);
  }
}

export const PYRECLAW = {
  type: 'pyreclaw',
  kind: 'navi',
  mirrors: 'FlameMan',
  names: ['Pyreclaw', 'PyreclawV2', 'PyreclawV3', 'PyreclawΩ'],
  hp: [1000, 1400, 1800, 2400],
  element: 'fire',
  levels: [
    // tower/flame: damage; towerRise: ember warning before the pillar burns; towerSpeed: frames per
    // panel; trail: frames a left-behind flame burns; braziers: kept lit (0 = none); heal per healEvery.
    { tower: 50, flame: 60, towerWind: 30, towerRise: 16, towerSpeed: 20, towerShift: 10, trail: 16, towers: 1, towerGap: 0, flameWind: 32, flameTime: 40, step: 16, pause: 18, braziers: 0, brazierHp: 60, heal: 0, healEvery: 120, brazierCd: 600, roarWind: 30, rest: 40 },
    { tower: 90, flame: 100, towerWind: 28, towerRise: 14, towerSpeed: 17, towerShift: 9, trail: 20, towers: 1, towerGap: 0, flameWind: 30, flameTime: 40, step: 14, pause: 16, braziers: 1, brazierHp: 60, heal: 10, healEvery: 120, brazierCd: 600, roarWind: 30, rest: 34 },
    { tower: 130, flame: 150, towerWind: 26, towerRise: 12, towerSpeed: 15, towerShift: 8, trail: 24, towers: 1, towerGap: 0, flameWind: 28, flameTime: 44, step: 12, pause: 14, braziers: 2, brazierHp: 80, heal: 15, healEvery: 110, brazierCd: 540, roarWind: 28, rest: 28 },
    { tower: 180, flame: 200, towerWind: 22, towerRise: 10, towerSpeed: 12, towerShift: 7, trail: 30, towers: 2, towerGap: 34, flameWind: 24, flameTime: 48, step: 10, pause: 10, braziers: 2, brazierHp: 100, heal: 20, healEvery: 90, brazierCd: 420, roarWind: 24, rest: 22 },
  ],
  onSpawn(b, e) {
    e.data.moves = {};
    e.data.pets = [];
    e.data.brazierReady = 180;
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    yield* wait(b.rng.range(16, 30));
    for (;;) {
      yield* lumber(b, e, s);
      const brazierOk = s.braziers > livePets(e, 'brazier').length && b.fightFrames >= e.data.brazierReady && petSpots(b, e).length > 0;
      const move = pickMove(b, e, [
        ['tower', 4],
        ['flame', e.data.lastMove === 'flame' ? 1 : 3],
        ['brazier', brazierOk ? 5 : 0],
      ]);
      if (move === 'flame') yield* flamethrower(b, e, s);
      else if (move === 'brazier' && brazierOk) yield* lightBraziers(b, e, s);
      else yield* towers(b, e, s);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
  onFlinch(b, e) {
    // Flinching Pyreclaw chokes its flamethrower.
    if (e.data.jet) {
      e.data.jet.kill();
      e.data.jet = null;
    }
    settle(e);
  },
  onDelete(b, e) {
    if (e.data.jet) e.data.jet.kill();
    clearPets(b, e);
  },
};
