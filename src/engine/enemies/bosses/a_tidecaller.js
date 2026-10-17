import { wait, drop, projectile } from '../../combat.js';
import { COLS, ELEMENT, PANEL, TEAM } from '../../constants.js';
import { noteMove, pickMove, windup, pose, ownedCells, rowEdge, settle, walkTo, spawnPet, livePets, clearPets } from './a_util.js';

// Tidecaller: a water mage in a brass diving suit. It keeps to the back of its area and raises coral
// rocks in front of itself; the rocks (its own team, so its attacks pass through) stop the player's shots
// until broken, and grow back a while later. Between drifts up and down its column it uses:
//   Bubble Volley - moves into the player's row, inhales (counterable), and blows a stream of slow aqua
//                   bubbles down the row.
//   Fish Torpedo  - raises its staff (counterable); a torpedo fish surfaces at the edge of the player's
//                   area, quivers, then shoots across the row hitting everything in it. V3+ sends two.
//   Tide Rise     - (V2+) a counterable chant, then geysers erupt on the player's panel and 1-2 others,
//                   freezing them to ice.
// Mirrors BN3's BubbleMan (HP 500/800/1200/1800, Aqua, so weak to Elec).

const CORAL = {
  onDelete(b, o) {
    const boss = o.data.owner;
    if (boss?.alive) boss.data.rockReady = Math.max(boss.data.rockReady ?? 0, b.fightFrames + o.data.tune.rockCd);
  },
};

// Where coral should grow: the column in front of Tidecaller, its own row first, then the other rows
// nearest the middle.
function rockSpots(b, e) {
  const c = e.col + e.facing;
  const rows = [e.row, ...[1, 0, 2].filter((r) => r !== e.row)];
  return rows.filter((r) => b.field.ownerAt(c, r) === e.team && !b.entityAt(c, r) && !b.field.isHole(c, r)).map((r) => [c, r]);
}

function wantsRocks(b, e, s) {
  return livePets(e, 'coralrock').length < s.rocks && b.fightFrames >= (e.data.rockReady ?? 0) && rockSpots(b, e).length > 0;
}

function* coralCall(b, e, s) {
  noteMove(e, 'coral');
  yield* windup(e, 'call', 18);
  const want = s.rocks - livePets(e, 'coralrock').length;
  const spots = rockSpots(b, e).slice(0, Math.max(0, want));
  for (const [c, r] of spots) {
    spawnPet(b, e, { type: 'coralrock', name: 'Coral', col: c, row: r, hp: s.rockHp, def: CORAL, data: { tune: s } });
    b.emit('fx', { fx: 'tidesplash', col: c, row: r });
  }
  if (spots.length) b.emit('sfx', { name: 'wave' });
  yield* pose(e, 'call', 16);
}

// Bob up or down the column, favouring rows its coral covers.
function* drift(b, e, s) {
  const coverC = e.col + e.facing;
  const covered = livePets(e, 'coralrock').filter((p) => p.col === coverC).map((p) => p.row);
  const rows = [0, 1, 2].filter((r) => r !== e.row);
  const safe = rows.filter((r) => covered.includes(r));
  const target = safe.length && b.rng.chance(0.65) ? b.rng.pick(safe) : b.rng.pick(rows);
  if (b.rng.chance(0.8)) yield* walkTo(b, e, e.col, target, s.step, 'move', 2);
  e.setAnim('idle');
  yield* wait(s.idle);
}

function* bubbleVolley(b, e, s) {
  noteMove(e, 'bubble');
  yield* walkTo(b, e, e.col, b.player.row, Math.ceil(s.step / 2), 'move', 2);
  b.emit('sfx', { name: 'charge' });
  yield* windup(e, 'aim', s.bubbleWind);
  e.setAnim('shoot');
  const hit = { damage: s.bubble, element: ELEMENT.AQUA, flinch: true };
  for (let i = 0; i < s.bubbles; i++) {
    b.emit('sfx', { name: 'bubble' });
    const p = projectile(b, e, hit, {
      type: 'tidebubble',
      speed: s.bubbleSpeed,
      onHit: (sp, t, c, r) => b.emit('fx', { fx: 'bubblepop', col: c, row: r }),
    });
    p.data.level = e.level;
    p.data.seed = i;
    yield* wait(s.bubbleGap);
  }
  yield* pose(e, 'idle', 10);
}

// A torpedo fish surfaces at the front edge of the blue area, quivers (the telegraph), then shoots across
// the row, hitting every body in it.
function torpedo(b, e, row, s) {
  const dir = e.facing;
  let start = rowEdge(b, e.team, row, 'front');
  if (start < 0) start = dir < 0 ? COLS - 1 : 0;
  const end = dir < 0 ? -1 : COLS;
  const sp = b.addSpell({ type: 'torpedofish', team: e.team, owner: e, col: start, row, dir, hit: { damage: s.fish, element: ELEMENT.AQUA, flinch: true } });
  sp.data.level = e.level;
  sp.data.phase = 'surface';
  b.emit('fx', { fx: 'tidesplash', col: start, row });
  sp.script = (function* () {
    for (let t = 0; t < s.fishAim; t++) {
      sp.data.progress = t / s.fishAim;
      yield;
    }
    sp.data.phase = 'dash';
    b.emit('sfx', { name: 'dash' });
    for (let c = start + dir; c !== end + dir; c += dir) {
      for (let f = 0; f < s.fishSpeed; f++) {
        sp.x = c - dir + dir * ((f + 1) / s.fishSpeed);
        sp.col = Math.max(0, Math.min(COLS - 1, c));
        if (c >= 0 && c < COLS) b.hitPanel(sp, c, row);
        yield;
      }
    }
  })();
  return sp;
}

function* fishTorpedo(b, e, s) {
  noteMove(e, 'torpedo');
  yield* windup(e, 'call', s.fishWind);
  const rows = [b.player.row];
  if (s.fishCount > 1) rows.push(b.rng.pick([0, 1, 2].filter((r) => r !== rows[0])));
  for (let i = 0; i < rows.length; i++) {
    torpedo(b, e, rows[i], s);
    if (i < rows.length - 1) yield* wait(s.fishStagger);
  }
  yield* wait(s.fishAim + 6);
}

function* tideRise(b, e, s) {
  noteMove(e, 'tide');
  yield* windup(e, 'tide', s.tideWind);
  const p = b.player;
  const area = ownedCells(b, TEAM.RED).filter(([c, r]) => !b.field.isHole(c, r));
  const picks = area.filter(([c, r]) => c === p.col && r === p.row);
  const rest = b.rng.shuffle(area.filter(([c, r]) => c !== p.col || r !== p.row));
  while (picks.length < s.tidePanels && rest.length) picks.push(rest.pop());
  const hit = { damage: s.tide, element: ELEMENT.AQUA, flinch: true };
  picks.forEach(([c, r], i) => {
    const g = drop(b, e, hit, c, r, { delay: s.tideDelay + i * 4, type: 'tidegeyser', landFx: 'tidesplash', sfx: 'ice', panel: PANEL.ICE, linger: 10 });
    g.data.level = e.level;
  });
  b.emit('sfx', { name: 'wave' });
  yield* wait(s.tideDelay + 12);
}

// Between attacks (for GridWars Daily's mixed bosses): back off to the rear of the area, then drift.
function* keepBack(b, e, s) {
  const back = rowEdge(b, e.team, e.row, 'back');
  if (back >= 0 && back !== e.col && b.tryStep(e, Math.sign(back - e.col), 0)) yield* pose(e, 'move', s.step);
  yield* drift(b, e, s);
}

export const TIDECALLER = {
  type: 'tidecaller',
  kind: 'navi',
  mirrors: 'BubbleMan',
  names: ['Tidecaller', 'TidecallerV2', 'TidecallerV3', 'TidecallerΩ'],
  hp: [500, 800, 1200, 1800],
  element: 'aqua',
  levels: [
    // bubble/fish/tide: damage; bubbleSpeed/fishSpeed: frames per panel; fishAim: surface telegraph;
    // tidePanels: geysers per Tide Rise (0 = no Tide Rise); rocks: coral kept up; rockCd: regrow delay.
    { bubble: 20, bubbles: 3, bubbleSpeed: 7, bubbleGap: 16, bubbleWind: 24, fish: 30, fishCount: 1, fishAim: 30, fishSpeed: 5, fishWind: 24, fishStagger: 24, tide: 0, tidePanels: 0, tideWind: 30, tideDelay: 40, rocks: 1, rockHp: 40, rockCd: 600, step: 28, idle: 40, rest: 40 },
    { bubble: 40, bubbles: 4, bubbleSpeed: 6, bubbleGap: 14, bubbleWind: 22, fish: 60, fishCount: 1, fishAim: 26, fishSpeed: 4, fishWind: 22, fishStagger: 22, tide: 40, tidePanels: 2, tideWind: 30, tideDelay: 40, rocks: 2, rockHp: 40, rockCd: 540, step: 24, idle: 34, rest: 34 },
    { bubble: 60, bubbles: 5, bubbleSpeed: 5, bubbleGap: 12, bubbleWind: 20, fish: 90, fishCount: 2, fishAim: 24, fishSpeed: 4, fishWind: 20, fishStagger: 20, tide: 60, tidePanels: 3, tideWind: 28, tideDelay: 36, rocks: 2, rockHp: 50, rockCd: 480, step: 20, idle: 28, rest: 28 },
    { bubble: 100, bubbles: 6, bubbleSpeed: 4, bubbleGap: 10, bubbleWind: 18, fish: 140, fishCount: 2, fishAim: 20, fishSpeed: 3, fishWind: 18, fishStagger: 16, tide: 100, tidePanels: 3, tideWind: 24, tideDelay: 32, rocks: 2, rockHp: 60, rockCd: 420, step: 16, idle: 22, rest: 22 },
  ],
  onSpawn(b, e) {
    e.data.moves = {};
    e.data.pets = [];
    e.data.rockReady = 0;
  },
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    yield* wait(b.rng.range(10, 20));
    for (;;) {
      // Keep to the back of the area (wind and pulls can drag it forward).
      const back = rowEdge(b, e.team, e.row, 'back');
      if (back >= 0 && back !== e.col && b.tryStep(e, Math.sign(back - e.col), 0)) {
        yield* pose(e, 'move', s.step);
        continue;
      }
      if (wantsRocks(b, e, s)) {
        yield* coralCall(b, e, s);
        continue;
      }
      yield* drift(b, e, s);
      const move = pickMove(b, e, [
        ['bubble', 4],
        ['torpedo', e.data.lastMove === 'torpedo' ? 1 : 3],
        ['tide', s.tidePanels > 0 ? 2 : 0],
      ]);
      if (move === 'torpedo') yield* fishTorpedo(b, e, s);
      else if (move === 'tide' && s.tidePanels > 0) yield* tideRise(b, e, s);
      else yield* bubbleVolley(b, e, s);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
  onDelete(b, e) {
    clearPets(b, e);
  },
};

// What GridWars Daily's mixed bosses borrow (composite.js; see a_voltframe.js's KIT for the fields).
export const KIT = {
  family: TIDECALLER,
  damage: ['bubble', 'fish', 'tide'], // the stats that are damage numbers
  mover: keepBack,
  rest: (s) => s.rest,
  moves: {
    bubble: { name: 'Bubble Volley', element: 'aqua', fn: bubbleVolley, weight: 4, desc: 'a stream of bubbles down your row' },
    torpedo: { name: 'Fish Torpedo', element: 'aqua', fn: fishTorpedo, weight: 3, again: 1, desc: 'a torpedo fish shoots across your row' },
    tide: { name: 'Tide Rise', element: 'aqua', fn: tideRise, weight: 2, has: (s) => s.tidePanels > 0, desc: 'geysers freeze panels to ice' },
    coral: { name: 'Coral Call', element: 'null', fn: coralCall, weight: 6, ok: wantsRocks, support: true, desc: 'coral rocks that block your shots' },
  },
};
