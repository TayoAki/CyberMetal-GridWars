import { wait, drop, zone, projectile } from '../../combat.js';
import { ELEMENT, PANEL, ROWS, COLS } from '../../constants.js';
import { noteMove, pickMove, settle, windup, markCounter, pose, foeArea, ownArea, isGrass, plantSpots, warning, spawnPet, livePets, clearPets } from './b_util.js';

// Briarix: a thorned knight of living bark wearing a crown of roses, armed with a briar lance. It turns
// its area to grass the moment it appears (a Wood body regains HP on grass), so fire — doubled by grass —
// is the way to cut it down. It strolls its area, then picks one of:
//   Root Snare  - raises the lance (counterable) and drives it into the ground: roots split the player's
//                 panel after a telegraph and burst up, paralyzing instead of flinching. Roots grow faster
//                 (and hold longer) through grass. V3+ sends a second snare after the player.
//   Petal Storm - lifts its arms (counterable) as petals gather over the player's row, then a whirling
//                 storm scours it, hitting again every 10 frames while the player stays in it.
//   Overgrowth  - (V2+) kneels (counterable) and grass swallows the whole field, its own area included.
//   Thorn Bud   - (V3+) plants a bud in its area that blooms and spits thorns down its row until it is cut
//                 down or withers. It also shields Briarix from shots in that row.
// Mirrors BN3's PlantMan (HP 1000/1300/1700/2100, Wood).

const W = ELEMENT.WOOD;

// Grass every intact panel owned by `who` (a team), or of the whole field when `who` is null.
function grow(b, who, fx = true, level = 1) {
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (who && b.field.ownerAt(c, r) !== who) continue;
      const t = b.field.typeAt(c, r);
      if (t === PANEL.BROKEN || t === PANEL.METAL || t === PANEL.GRASS) continue;
      if (b.field.setType(c, r, PANEL.GRASS)) {
        n++;
        if (fx) b.emit('fx', { fx: 'briarbloom', col: c, row: r, level });
      }
    }
  }
  return n;
}

function bareCount(b, cells) {
  return cells.filter(([c, r]) => {
    const t = b.field.typeAt(c, r);
    return t !== PANEL.GRASS && t !== PANEL.BROKEN && t !== PANEL.METAL;
  }).length;
}

function* stroll(b, e, s, frames) {
  let t = 0;
  e.setAnim('idle');
  while (t < frames) {
    const n = Math.min(s.stepEvery, frames - t);
    yield* wait(n);
    t += n;
    if (t >= frames || !b.rng.chance(0.5)) continue;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]].filter(([dc, dr]) => b.canEnter(e, e.col + dc, e.row + dr));
    if (!dirs.length) continue;
    const [dc, dr] = b.rng.pick(dirs);
    b.tryStep(e, dc, dr);
    yield* pose(e, 'move', 10);
    t += 10;
    e.setAnim('idle');
  }
}

function snare(b, e, s, c, r) {
  const grass = isGrass(b, c, r);
  const delay = Math.round(s.rootDelay * (grass ? 0.75 : 1));
  const stun = s.stun + (grass ? 15 : 0);
  const sp = drop(b, e, { damage: s.root, element: W, stun, flinch: false }, c, r, {
    delay,
    type: 'roots',
    landFx: 'rootburst',
    sfx: 'thud',
    linger: stun,
    onLand: (spell) => {
      spell.data.caught = spell.hitIds.size > 0;
      spell.z = 1; // the roots wrap whoever they caught: drawn over bodies
    },
  });
  sp.data.level = e.level;
  sp.data.grass = grass;
  return delay;
}

function* rootSnare(b, e, s) {
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, 'plant', s.windup))) return yield* pose(e, 'idle', s.recover);
  e.setAnim('stab');
  b.emit('sfx', { name: 'thud' });
  let last = 0;
  for (let k = 0; k < s.snares; k++) {
    last = snare(b, e, s, b.player.col, b.player.row);
    if (k < s.snares - 1) yield* wait(s.snareGap);
  }
  yield* wait(last);
  yield* pose(e, 'idle', s.recover);
}

function* petalStorm(b, e, s) {
  b.emit('sfx', { name: 'charge' });
  if (!(yield* windup(b, e, 'bloom', s.windup))) return yield* pose(e, 'idle', s.recover);
  const row = b.player.row;
  const cells = foeArea(b, e, row);
  if (!cells.length) return yield* pose(e, 'idle', s.recover);
  e.setAnim('storm');
  b.emit('sfx', { name: 'wind' });
  e.data.warn = warning(b, e, 'petalwarn', cells, s.petalWarn);
  yield* wait(s.petalWarn);
  e.data.warn = null;
  const z = zone(b, e, { damage: s.petal, element: W, flinch: false }, cells, s.petalFrames, { type: 'petals', rehit: 10 });
  z.z = 1; // the storm engulfs the row
  z.data.level = e.level;
  z.data.frames = s.petalFrames;
  yield* wait(s.petalFrames);
  yield* pose(e, 'idle', s.recover);
}

function overgrowthDue(b, e, s) {
  if (!s.overgrow || b.fightFrames - (e.data.lastGrow ?? -1e9) < s.growCd) return false;
  return bareCount(b, foeArea(b, e)) >= 4 || bareCount(b, ownArea(b, e)) >= 2;
}

function* overgrowth(b, e, s) {
  e.data.lastGrow = b.fightFrames;
  if (!(yield* windup(b, e, 'grow', s.growWind))) return yield* pose(e, 'idle', s.recover);
  b.emit('sfx', { name: 'stage' });
  grow(b, null, true, e.level);
  yield* pose(e, 'grow', 20);
  yield* pose(e, 'idle', s.recover);
}

// Thorn Bud: an object on Briarix's team. It sprouts, then spits a thorn down its row whenever the player
// stands in it, and withers after a while.
const THORN_BUD = {
  *ai(b, o) {
    const s = o.data.tune;
    o.setAnim('sprout');
    yield* wait(36);
    o.setAnim('idle');
    let life = s.budLife;
    let cool = 30;
    while (life-- > 0) {
      if (--cool <= 0 && b.player.row === o.row) {
        o.setAnim('aim');
        yield* wait(18);
        life -= 18;
        o.setAnim('spit');
        b.emit('sfx', { name: 'gun' });
        const t = projectile(b, o, { damage: s.thorn, element: W, flinch: true }, { type: 'briarthorn', speed: 5 });
        t.data.level = o.level;
        t.z = 1;
        yield* wait(14);
        life -= 14;
        o.setAnim('idle');
        cool = s.budRate;
      }
      yield;
    }
    o.setAnim('wither');
    yield* wait(24);
    o.alive = false;
    o.removed = true;
  },
};

function budOk(b, e, s) {
  return s.bud && livePets(e, 'thornbud').length === 0 && b.fightFrames - (e.data.lastBud ?? -1e9) >= s.budCd && plantSpots(b, e).length > 0;
}

function* thornBud(b, e, s) {
  e.data.lastBud = b.fightFrames;
  if (!(yield* windup(b, e, 'grow', s.growWind))) return yield* pose(e, 'idle', s.recover);
  // Best spot: in front of Briarix in the player's row (a living shield), else any free panel.
  const spots = plantSpots(b, e);
  const d = e.facing;
  const shield = spots.filter(([c, r]) => r === b.player.row && (c - e.col) * d > 0);
  const inRow = spots.filter(([, r]) => r === b.player.row);
  const pick = shield.length ? shield[0] : inRow.length ? b.rng.pick(inRow) : b.rng.pick(spots);
  if (pick) {
    spawnPet(b, e, { type: 'thornbud', name: 'ThornBud', col: pick[0], row: pick[1], hp: s.budHp, element: W, def: THORN_BUD, data: { tune: s } });
    b.emit('fx', { fx: 'briarbloom', col: pick[0], row: pick[1], level: e.level });
    b.emit('sfx', { name: 'thud' });
  }
  yield* pose(e, 'grow', 14);
  yield* pose(e, 'idle', s.recover);
}

export const BRIARIX = {
  type: 'briarix',
  kind: 'navi',
  mirrors: 'PlantMan',
  names: ['Briarix', 'BriarixV2', 'BriarixV3', 'BriarixΩ'],
  hp: [1000, 1300, 1700, 2100],
  element: 'wood',
  levels: [
    // root: Root Snare damage (paralyzes `stun` frames, +15 through grass); petal: each Petal Storm tick
    // (every 10 frames for petalFrames); overgrow: V2+ field to grass; bud: V3+ Thorn Bud (budHp, thorn dmg).
    { attack: 30, root: 30, stun: 60, rootDelay: 42, snares: 1, snareGap: 0, petal: 10, petalWarn: 24, petalFrames: 40, overgrow: false, growWind: 22, growCd: 0, bud: false, budHp: 0, thorn: 0, budLife: 0, budRate: 0, budCd: 0, windup: 24, idle: [60, 100], stepEvery: 36, recover: 44 },
    { attack: 60, root: 60, stun: 60, rootDelay: 36, snares: 2, snareGap: 20, petal: 20, petalWarn: 22, petalFrames: 40, overgrow: true, growWind: 22, growCd: 600, bud: false, budHp: 0, thorn: 0, budLife: 0, budRate: 0, budCd: 0, windup: 22, idle: [50, 85], stepEvery: 32, recover: 36 },
    { attack: 90, root: 90, stun: 66, rootDelay: 34, snares: 2, snareGap: 16, petal: 30, petalWarn: 20, petalFrames: 40, overgrow: true, growWind: 20, growCd: 540, bud: true, budHp: 60, thorn: 40, budLife: 900, budRate: 90, budCd: 600, windup: 20, idle: [40, 70], stepEvery: 28, recover: 30 },
    { attack: 140, root: 140, stun: 72, rootDelay: 30, snares: 2, snareGap: 12, petal: 45, petalWarn: 18, petalFrames: 40, overgrow: true, growWind: 18, growCd: 480, bud: true, budHp: 100, thorn: 70, budLife: 900, budRate: 75, budCd: 480, windup: 16, idle: [30, 60], stepEvery: 24, recover: 24 },
  ],
  onSpawn(b, e) {
    e.data.moves = {};
    e.data.pets = [];
    // Its own area turns to grass at once (no fx: this happens before the fight is drawn).
    grow(b, e.team, false, e.level);
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.data.warn?.kill();
    e.data.warn = null;
    e.setAnim('idle');
    yield* wait(e.data.started ? 12 : b.rng.range(24, 44));
    e.data.started = true;
    for (;;) {
      yield* stroll(b, e, s, b.rng.range(s.idle[0], s.idle[1]));
      // Don't follow a snare that landed with more pain while the player is still held: taunt instead.
      if (b.player.stunTimer > 0) {
        yield* pose(e, 'taunt', Math.min(40, b.player.stunTimer));
        e.setAnim('idle');
      }
      const move = pickMove(b, e, [
        ['snare', 5],
        ['petals', 4],
        ['overgrow', overgrowthDue(b, e, s) ? 4 : 0],
        ['bud', budOk(b, e, s) ? 3 : 0],
      ]);
      noteMove(e, move);
      if (move === 'petals') yield* petalStorm(b, e, s);
      else if (move === 'overgrow') yield* overgrowth(b, e, s);
      else if (move === 'bud') yield* thornBud(b, e, s);
      else yield* rootSnare(b, e, s);
    }
  },
  onHit(b, e, hit) {
    markCounter(b, e, hit);
  },
  onFlinch(b, e) {
    e.data.warn?.kill();
    e.data.warn = null;
  },
  onDelete(b, e) {
    clearPets(b, e);
  },
};
