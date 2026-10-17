import { wait, drop, source, teleport, strike, marker } from '../../combat.js';
import { ELEMENT, TEAM } from '../../constants.js';
import { noteMove, pickMove, windup, pose, ownedCells, otherSpots, rowEdge, settle, spawnPet, livePets, clearPets, petSpots } from './a_util.js';

// Voltframe: a lanky, neon-striped android with a spotlight for a head and a power cord for a tail.
// It blinks from panel to panel around its area, then picks one of:
//   Arc Bolt   - charges (counterable), points, and a lightning strike is telegraphed on the player's
//                panel; V2+ chains 2-3 bolts, each aimed where the player stands when it is called.
//   Flash      - a long, counterable wind-up while the lamp head heats up, then a screen-wide flash that
//                paralyzes the player unless they are invisible. V2+ follows up with a bolt.
//   Neon Field - (V3+) plants a Neon Lamp in its area that warns, then zaps the player's whole row,
//                over and over until it is destroyed.
// Mirrors BN3's FlashMan (HP 300/500/700/1500, Elec).

// Neon Lamp: an object on Voltframe's team. Its own shots can't hurt it; the player's can.
const NEON_LAMP = {
  *ai(b, o) {
    const s = o.data.tune;
    o.setAnim('idle');
    yield* wait(s.lampFirst + b.rng.int(30));
    for (;;) {
      // Lock onto the player's row, warn its panels, then discharge along it.
      const row = b.player.row;
      const cells = ownedCells(b, TEAM.RED, row);
      o.setAnim('charge');
      for (const [c, r] of cells) marker(b, o, 'zapwarn', c, r, s.lampWarn);
      b.emit('sfx', { name: 'charge' });
      yield* wait(s.lampWarn);
      o.setAnim('zap');
      b.emit('sfx', { name: 'beam' });
      strike(b, o, cells, { damage: s.zap, element: ELEMENT.ELEC, flinch: true }, { fx: 'lampzap' });
      yield* wait(18);
      o.setAnim('idle');
      yield* wait(s.lampPeriod);
    }
  },
  onDelete(b, o) {
    const boss = o.data.owner;
    if (boss?.alive) boss.data.lampReady = Math.max(boss.data.lampReady ?? 0, b.fightFrames + o.data.tune.lampCd);
  },
};

function* blink(b, e, s) {
  const spots = otherSpots(b, e);
  if (!spots.length) return;
  const [c, r] = b.rng.pick(spots);
  e.setAnim('warp');
  yield* wait(s.warpT);
  teleport(b, e, c, r);
  e.setAnim('idle');
}

function bolt(b, e, s, c, r) {
  return drop(b, e, { damage: s.attack, element: ELEMENT.ELEC, flinch: true }, c, r, {
    delay: s.boltDelay,
    type: 'arcbolt',
    landFx: 'arcstrike',
    sfx: 'zap',
    linger: 8,
  });
}

function* arcBolt(b, e, s) {
  noteMove(e, 'arcbolt');
  b.emit('sfx', { name: 'charge' });
  yield* windup(e, 'charge', s.boltWind);
  e.setAnim('cast');
  const n = b.rng.range(s.bolts[0], s.bolts[1]);
  for (let i = 0; i < n; i++) {
    bolt(b, e, s, b.player.col, b.player.row);
    yield* wait(i < n - 1 ? s.chainGap : 12);
  }
  // Hold the pose until the last bolt lands: an opening.
  yield* wait(Math.max(0, s.boltDelay - 12));
}

function* flash(b, e, s) {
  noteMove(e, 'flash');
  b.emit('sfx', { name: 'charge' });
  yield* windup(e, 'flashcharge', s.flashWind);
  e.setAnim('flash');
  b.emit('fx', { fx: 'flash' });
  b.emit('fx', { fx: 'voltburst', col: e.col, row: e.row });
  b.emit('sfx', { name: 'flash' });
  // Light hits everyone who can be seen: only Invis (or a barrier/aura) keeps the player moving.
  const hit = { damage: s.flash, element: ELEMENT.ELEC, stun: s.stun, pierceInvis: false, ignoreIframes: true };
  const res = b.applyHit(b.player, hit, source(e, hit));
  yield* wait(20);
  if (res.connected && !res.blocked && s.followUp && b.player.stunTimer > 0) {
    e.setAnim('cast');
    bolt(b, e, s, b.player.col, b.player.row);
    yield* wait(s.boltDelay + 4);
  } else yield* wait(16);
}

function lampOk(b, e, s) {
  return s.lamps > livePets(e, 'neonlamp').length && b.fightFrames >= e.data.lampReady && petSpots(b, e).length > 0;
}

// Between attacks: a few blinks, each after a pause.
function* blinks(b, e, s) {
  const hops = b.rng.range(1, s.hops);
  for (let i = 0; i < hops; i++) {
    yield* pose(e, 'idle', s.idle);
    yield* blink(b, e, s);
  }
  yield* wait(8);
}

function* neonField(b, e, s) {
  noteMove(e, 'neon');
  b.emit('sfx', { name: 'charge' });
  yield* windup(e, 'cast', s.lampWind);
  const spots = petSpots(b, e);
  if (spots.length) {
    // The front column keeps the lamp in reach (and lets it screen that row).
    const front = spots.filter(([c, r]) => c === rowEdge(b, e.team, r, 'front'));
    const [c, r] = b.rng.pick(front.length ? front : spots);
    spawnPet(b, e, { type: 'neonlamp', name: 'NeonLamp', col: c, row: r, hp: s.lampHp, element: ELEMENT.ELEC, def: NEON_LAMP, data: { tune: s } });
    b.emit('fx', { fx: 'arcstrike', col: c, row: r });
    b.emit('sfx', { name: 'zap' });
  }
  e.data.lampReady = b.fightFrames + s.lampCd;
  yield* pose(e, 'cast', 16);
}

export const VOLTFRAME = {
  type: 'voltframe',
  kind: 'navi',
  mirrors: 'FlashMan',
  names: ['Voltframe', 'VoltframeV2', 'VoltframeV3', 'VoltframeΩ'],
  hp: [300, 500, 700, 1500],
  element: 'elec',
  levels: [
    // attack: Arc Bolt damage; flash: Flash damage, stun: paralysis frames; zap: Neon Lamp damage.
    // idle/warpT: frames between blinks / in the blink pose; bolts: [min, max] per Arc Bolt.
    { attack: 30, flash: 10, stun: 90, zap: 0, idle: 44, hops: 2, warpT: 8, boltWind: 20, boltDelay: 38, bolts: [1, 1], chainGap: 20, flashWind: 54, followUp: false, lamps: 0, lampWind: 24, lampHp: 60, lampFirst: 50, lampWarn: 36, lampPeriod: 150, lampCd: 600, rest: 40 },
    { attack: 60, flash: 20, stun: 90, zap: 0, idle: 38, hops: 2, warpT: 7, boltWind: 18, boltDelay: 36, bolts: [2, 2], chainGap: 18, flashWind: 52, followUp: true, lamps: 0, lampWind: 24, lampHp: 60, lampFirst: 50, lampWarn: 36, lampPeriod: 150, lampCd: 600, rest: 34 },
    { attack: 90, flash: 30, stun: 90, zap: 60, idle: 32, hops: 3, warpT: 6, boltWind: 16, boltDelay: 34, bolts: [2, 3], chainGap: 16, flashWind: 50, followUp: true, lamps: 1, lampWind: 22, lampHp: 60, lampFirst: 50, lampWarn: 34, lampPeriod: 140, lampCd: 480, rest: 28 },
    { attack: 140, flash: 50, stun: 100, zap: 100, idle: 24, hops: 3, warpT: 5, boltWind: 14, boltDelay: 30, bolts: [3, 3], chainGap: 14, flashWind: 46, followUp: true, lamps: 2, lampWind: 20, lampHp: 80, lampFirst: 40, lampWarn: 30, lampPeriod: 120, lampCd: 360, rest: 22 },
  ],
  onSpawn(b, e) {
    e.data.moves = {};
    e.data.pets = [];
    e.data.lampReady = 0;
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    yield* wait(b.rng.range(14, 28));
    for (;;) {
      yield* blinks(b, e, s);
      const lamp = lampOk(b, e, s);
      const move = pickMove(b, e, [
        ['arcbolt', 5],
        ['flash', e.data.lastMove === 'flash' ? 0 : 3],
        ['neon', lamp ? 4 : 0],
      ]);
      if (move === 'flash') yield* flash(b, e, s);
      else if (move === 'neon' && lamp) yield* neonField(b, e, s);
      else yield* arcBolt(b, e, s);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
  onDelete(b, e) {
    clearPets(b, e);
  },
};

// What GridWars Daily's mixed bosses borrow (composite.js): the blinks between attacks, and each attack with
// its pick weight (`again`: the weight right after it was used), `has(s)`: whether this level has it, and
// `ok(b, e, s)`: whether it can be used now. `s` is this family's level stats.
export const KIT = {
  family: VOLTFRAME,
  damage: ['attack', 'flash', 'zap'], // the stats that are damage numbers
  mover: blinks,
  rest: (s) => s.rest,
  moves: {
    arcbolt: { name: 'Arc Bolt', element: 'elec', fn: arcBolt, weight: 5, desc: 'lightning strikes where you stand' },
    flash: { name: 'Flash', element: 'elec', fn: flash, weight: 3, again: 0, desc: 'a blinding flash that paralyzes' },
    neon: { name: 'Neon Field', element: 'elec', fn: neonField, weight: 4, has: (s) => s.lamps > 0, ok: lampOk, desc: 'a lamp that zaps your row' },
  },
};
