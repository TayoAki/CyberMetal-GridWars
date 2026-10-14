import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL, TEAM, ROWS, COLS } from '../src/engine/constants.js';
import { ENEMIES } from '../src/engine/enemies/index.js';
import { FAMILIES } from '../src/engine/enemies/pack_b.js';
import { CHIPS } from '../src/engine/chips/library.js';
import { source } from '../src/engine/combat.js';
import { makeBattle, toFight, run, enemy } from './helpers.js';

// Virus pack B: Watcher (KillerEye), Cinderkite (Metrid), Frostbit (Pengi), Sporeling (Mushy) and
// Scurrier (Ratty).

const SPEC = {
  watcher: { hp: [140, 190, 240, 300], element: 'elec', mirrors: 'KillerEye' },
  cinderkite: { hp: [150, 200, 250, 300], element: 'fire', mirrors: 'Metrid' },
  frostbit: { hp: [80, 100, 130, 260], element: 'aqua', mirrors: 'Pengi' },
  sporeling: { hp: [50, 100, 160, 200], element: 'wood', mirrors: 'Mushy' },
  scurrier: { hp: [40, 100, 160, 230], element: 'null', mirrors: 'Ratty' },
};
const TYPES = Object.keys(SPEC);

// Where each family is placed for the "it can reach a player standing at (1, 1)" checks.
const REACH = { watcher: [4, 1], cinderkite: [4, 0], frostbit: [5, 0], sporeling: [5, 2], scurrier: [5, 0] };

const TOUGH = { maxHp: 99999, hp: 99999 };

function hurtsOnPlayer(b) {
  return b.events.filter((ev) => ev.type === 'hurt' && ev.id === b.player.id);
}

function stepUntil(b, pred, limit = 2000, pad = {}) {
  for (let i = 0; i < limit; i++) {
    if (pred()) return true;
    b.step(pad);
  }
  return pred();
}

// Deterministic test-side RNG (the sim has its own; tests must not use Math.random either).
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('pack B registers five families with BN3 stat-table HP, elements and names', () => {
  assert.deepEqual(
    FAMILIES.map((f) => f.type),
    TYPES,
  );
  for (const f of FAMILIES) {
    const spec = SPEC[f.type];
    assert.equal(ENEMIES[f.type], f, `${f.type} is registered`);
    assert.equal(f.kind, 'virus');
    assert.equal(f.mirrors, spec.mirrors);
    assert.deepEqual(f.hp, spec.hp);
    assert.equal(f.names.length, 4);
    assert.equal(f.levels.length, 4);
    for (const n of f.names) assert.ok([...n].length <= 10, `${n} fits 10 chars`);
    assert.ok(f.names[3].endsWith('Ω'));
    for (let i = 1; i < 4; i++) assert.ok(f.levels[i].attack > f.levels[i - 1].attack, `${f.type} hits harder at level ${i + 1}`);
    assert.ok(f.levels[0].attack <= 30, `${f.type} level 1 is gentle`);
    assert.ok(f.levels[3].attack >= 100, `${f.type} Ω is fierce`);
  }
});

test('every family spawns at every level with the right HP, element and name', () => {
  for (const type of TYPES) {
    for (let level = 1; level <= 4; level++) {
      const b = makeBattle({ enemies: [{ type, level, col: 4, row: 1 }] });
      const e = enemy(b, type);
      assert.equal(e.hp, SPEC[type].hp[level - 1], `${type} L${level} hp`);
      assert.equal(e.maxHp, SPEC[type].hp[level - 1]);
      assert.equal(e.element, SPEC[type].element, `${type} L${level} element`);
      assert.equal(e.name, ENEMIES[type].names[level - 1]);
      assert.equal(e.stats.level, level);
      assert.equal(e.kind, 'virus');
      assert.equal(e.team, TEAM.BLUE);
    }
  }
  assert.ok(enemy(makeBattle({ enemies: [{ type: 'cinderkite', level: 1, col: 4, row: 1 }] }), 'cinderkite').flying);
  assert.ok(enemy(makeBattle({ enemies: [{ type: 'watcher', level: 1, col: 4, row: 1 }] }), 'watcher').immovable);
});

test('every family at every level damages a player it can reach, with its element, and never leaves its area', () => {
  for (const type of TYPES) {
    for (let level = 1; level <= 4; level++) {
      const [col, row] = REACH[type];
      const b = makeBattle({ enemies: [{ type, level, col, row }], seed: 20 + level, player: TOUGH });
      toFight(b);
      const e = enemy(b, type);
      for (let f = 0; f < 1500; f++) {
        b.step({});
        assert.equal(b.field.ownerAt(e.col, e.row), TEAM.BLUE, `${type} L${level} stays in its area`);
      }
      const hurts = hurtsOnPlayer(b);
      assert.ok(hurts.length >= 1, `${type} L${level} hit the player at least once`);
      assert.equal(hurts[0].element, SPEC[type].element, `${type} attacks with its element`);
      assert.equal(hurts[0].amount, e.stats.attack, `${type} L${level} deals its level's damage`);
    }
  }
});

test('every family opens a counter window while winding up', () => {
  for (const type of TYPES) {
    const [col, row] = REACH[type];
    const b = makeBattle({ enemies: [{ type, level: 1, col, row }], seed: 3, player: TOUGH });
    toFight(b);
    const e = enemy(b, type);
    assert.ok(stepUntil(b, () => e.counterWindow > 0, 1500), `${type} winds up`);
    assert.equal(e.anim, 'windup');
  }
});

test('Watcher charges when the player enters its row; leaving mid-charge dodges the beam', () => {
  const b = makeBattle({ enemies: [{ type: 'watcher', level: 1, col: 4, row: 0 }], seed: 5, player: TOUGH });
  toFight(b);
  const w = enemy(b, 'watcher');
  run(b, 200);
  assert.equal(w.anim, 'idle', 'no charge while the player is in another row');
  assert.equal(w.data.look, 1, 'the eye follows the player (down)');
  b.player.row = 0;
  assert.ok(stepUntil(b, () => w.counterWindow > 0, 10), 'charges at once');
  run(b, 5);
  b.player.row = 1; // dodge late
  const hp = b.player.hp;
  assert.ok(stepUntil(b, () => b.events.some((ev) => ev.fx === 'eyebeam'), 60), 'still fires');
  const beam = b.events.find((ev) => ev.fx === 'eyebeam');
  assert.equal(beam.hit, false);
  assert.equal(beam.toCol, -1);
  assert.equal(b.player.hp, hp, 'the dodge worked');
  assert.equal(w.col, 4);
  assert.equal(w.row, 0);
});

test('Watcher beam is instant down the row; the Ω beam also paralyses', () => {
  const b = makeBattle({ enemies: [{ type: 'watcher', level: 4, col: 5, row: 1 }], seed: 6, player: TOUGH });
  toFight(b);
  b.player.col = 0;
  const hp = b.player.hp;
  assert.ok(stepUntil(b, () => b.player.hp < hp, 300));
  assert.equal(hp - b.player.hp, 130);
  assert.ok(b.player.stunTimer > 0, 'paralysed');
  assert.ok(b.events.some((ev) => ev.fx === 'stun'));
  const beam = b.events.find((ev) => ev.fx === 'eyebeam');
  assert.equal(beam.hit, true);
  assert.equal(beam.toCol, 0);
  // Level 3 does not paralyse.
  const b3 = makeBattle({ enemies: [{ type: 'watcher', level: 3, col: 5, row: 1 }], seed: 6, player: TOUGH });
  toFight(b3);
  assert.ok(stepUntil(b3, () => b3.player.hp < 99999, 300));
  assert.equal(b3.player.stunTimer, 0);
});

test('Cinderkite volleys: L1 calls 3 telegraphed meteors (first on the player), Ω calls 7; they crack the floor', () => {
  for (const [level, count] of [[1, 3], [2, 4], [3, 5], [4, 7]]) {
    const b = makeBattle({ enemies: [{ type: 'cinderkite', level, col: 4, row: 1 }], seed: 8, player: TOUGH });
    toFight(b);
    const kite = enemy(b, 'cinderkite');
    assert.ok(stepUntil(b, () => kite.anim === 'attack', 1500), 'calls meteors');
    const seen = new Map();
    const marks = new Set();
    const playerAt = [b.player.col, b.player.row];
    // One volley: every meteor is called while the kite holds its calling pose.
    while (kite.anim === 'attack') {
      b.step({});
      for (const s of b.spells) {
        if (s.type === 'kitemeteor' && !seen.has(s.id)) seen.set(s.id, [s.col, s.row]);
        if (s.type === 'kitemark') marks.add(s.id);
      }
    }
    run(b, 60); // let the last meteors land
    const cells = [...seen.values()];
    assert.equal(cells.length, count, `L${level} meteor count`);
    assert.equal(marks.size, count, 'each meteor is telegraphed by a floor mark');
    assert.deepEqual(cells[0], playerAt, 'the first meteor is aimed at the player');
    for (const [c, r] of cells) assert.equal(b.field.ownerAt(c, r), TEAM.RED, 'meteors fall on the player area');
    const strays = cells.filter(([c, r]) => c !== playerAt[0] || r !== playerAt[1]);
    assert.equal(new Set(strays.map(([c, r]) => c + r * COLS)).size, strays.length, 'random meteors pick distinct panels');
    assert.equal(cells.length - strays.length, [1, 1, 2, 3][level - 1], 'aimed meteors per volley');
    const cracked = cells.filter(([c, r]) => [PANEL.CRACKED, PANEL.BROKEN].includes(b.field.typeAt(c, r)));
    assert.ok(cracked.length >= 1, 'meteors crack the floor');
    assert.ok(b.events.some((ev) => ev.fx === (level === 4 ? 'kiteburstv' : 'kiteburst')));
  }
});

test('Cinderkite meteors fly above bodies while falling, and only one kite calls at a time', () => {
  const b = makeBattle({
    enemies: [
      { type: 'cinderkite', level: 2, col: 4, row: 0 },
      { type: 'cinderkite', level: 2, col: 5, row: 2 },
    ],
    seed: 9,
    player: TOUGH,
  });
  toFight(b);
  const kites = b.livingEnemies();
  for (let f = 0; f < 1500; f++) {
    b.step({});
    assert.ok(kites.filter((k) => k.anim === 'attack').length <= 1, 'kites take turns');
    for (const s of b.spells) if (s.type === 'kitemeteor' && !s.data.landed) assert.ok(s.z > 0);
  }
});

test('Frostbit lines up, inhales and breathes a gust that ices its row; level 2+ freezes the player panel first', () => {
  const b = makeBattle({ enemies: [{ type: 'frostbit', level: 1, col: 5, row: 0 }], seed: 4, player: TOUGH });
  toFight(b);
  const fb = enemy(b, 'frostbit');
  assert.ok(stepUntil(b, () => fb.anim === 'windup', 600));
  assert.equal(fb.row, b.player.row, 'slid into the player row');
  assert.equal(b.field.typeAt(b.player.col, b.player.row), PANEL.NORMAL, 'level 1 does not pre-freeze');
  assert.ok(stepUntil(b, () => b.spells.some((s) => s.type === 'frostbreath'), 60));
  assert.ok(stepUntil(b, () => !b.spells.some((s) => s.type === 'frostbreath'), 120));
  for (let c = 0; c < fb.col; c++) assert.equal(b.field.typeAt(c, fb.row), PANEL.ICE, `panel ${c} iced`);
  assert.ok(hurtsOnPlayer(b).some((ev) => ev.element === 'aqua'));

  const b2 = makeBattle({ enemies: [{ type: 'frostbit', level: 2, col: 4, row: 1 }], seed: 4, player: TOUGH });
  toFight(b2);
  const f2 = enemy(b2, 'frostbit');
  assert.ok(stepUntil(b2, () => f2.anim === 'windup', 600));
  assert.ok(!b2.spells.some((s) => s.type === 'frostbreath'));
  assert.equal(b2.field.typeAt(b2.player.col, b2.player.row), PANEL.ICE, 'the player panel is frozen before the breath');
  assert.ok(b2.events.some((ev) => ev.fx === 'frostflash'));
});

test('the frost gust stops at a hole and never ices a hole', () => {
  const b = makeBattle({ enemies: [{ type: 'frostbit', level: 1, col: 4, row: 1 }], seed: 4, player: TOUGH, field: ['......', '..x...', '......'] });
  toFight(b);
  run(b, 600);
  assert.equal(b.field.typeAt(2, 1), PANEL.BROKEN);
  assert.equal(b.field.typeAt(3, 1), PANEL.ICE);
  assert.notEqual(b.field.typeAt(1, 1), PANEL.ICE);
  assert.equal(hurtsOnPlayer(b).length, 0);
});

test('Sporeling is untargetable while burrowed, pops up at the front of the player row and puffs two panels', () => {
  const b = makeBattle({ enemies: [{ type: 'sporeling', level: 1, col: 5, row: 2 }], seed: 2, player: TOUGH, folder: [] });
  toFight(b);
  const sp = enemy(b, 'sporeling');
  assert.ok(stepUntil(b, () => sp.hidden, 600), 'burrows');
  assert.ok(!sp.targetable);
  const hp = sp.hp;
  assert.equal(b.hitPanel(source(b.player, { damage: 50, flinch: true, isChip: true }), sp.col, sp.row), null);
  assert.equal(b.firstTarget(TEAM.RED, 2, sp.row, 1), null, 'shots pass over the hole');
  assert.equal(sp.hp, hp);
  assert.ok(stepUntil(b, () => b.spells.some((s) => s.type === 'sporemound'), 200), 'a mound telegraphs the pop-up');
  const mound = b.spells.find((s) => s.type === 'sporemound');
  assert.deepEqual([mound.col, mound.row], [3, 1], 'front column, player row');
  assert.ok(stepUntil(b, () => !sp.hidden, 60));
  assert.deepEqual([sp.col, sp.row], [3, 1]);
  assert.ok(sp.targetable);
  assert.ok(stepUntil(b, () => sp.counterWindow > 0, 30), 'counterable puff wind-up');
  assert.ok(stepUntil(b, () => b.spells.some((s) => s.type === 'sporecloud'), 60));
  const cloud = b.spells.find((s) => s.type === 'sporecloud');
  assert.deepEqual(cloud.data.cells, [[2, 1], [1, 1]]);
  assert.equal(cloud.element, 'wood');
  run(b, 40);
  assert.ok(hurtsOnPlayer(b).some((ev) => ev.element === 'wood'));
});

test('Sporeling surfaces next to an occupied front panel and is visible again after a flinch', () => {
  const b = makeBattle({
    enemies: [
      { type: 'sporeling', level: 2, col: 5, row: 0 },
      { type: 'watcher', level: 1, col: 3, row: 1 },
    ],
    seed: 2,
    player: TOUGH,
  });
  toFight(b);
  const sp = enemy(b, 'sporeling');
  assert.ok(stepUntil(b, () => b.spells.some((s) => s.type === 'sporemound'), 800));
  assert.deepEqual([sp.col, sp.row], [4, 1], 'next-best panel: same row, one back');
  assert.ok(stepUntil(b, () => sp.anim === 'windup', 80));
  b.applyHit(sp, { damage: 1, flinch: true, isChip: true }, source(b.player, {}));
  assert.equal(sp.hidden, false);
  assert.equal(b.stats.counters, 1, 'hit during the wind-up is a counter');
});

test('Scurrier zig-zags and its crawling bomb turns toward the player at the player column', () => {
  const b = makeBattle({ enemies: [{ type: 'scurrier', level: 1, col: 5, row: 0 }], seed: 3, player: TOUGH });
  toFight(b);
  const sc = enemy(b, 'scurrier');
  const visited = new Set();
  assert.ok(stepUntil(b, () => (visited.add(`${sc.col},${sc.row}`), sc.anim === 'windup'), 600));
  assert.ok(visited.size >= 3, 'skittered around');
  // Step out of its row while it crouches: the bomb has to turn to find us.
  b.player.row = sc.row === 2 ? 0 : 2;
  assert.ok(stepUntil(b, () => b.spells.some((s) => s.type === 'scurrybomb'), 60), 'released a bomb');
  const bomb = b.spells.find((s) => s.type === 'scurrybomb');
  const path = [];
  const hp = b.player.hp;
  for (let f = 0; f < 200 && bomb.alive; f++) {
    const last = path[path.length - 1];
    if (!last || last[0] !== bomb.col || last[1] !== bomb.row) path.push([bomb.col, bomb.row]);
    b.step({});
  }
  const startRow = path[0][1];
  assert.equal(startRow, sc.row, 'it runs along its own row');
  const turnAt = path.findIndex(([, r]) => r !== startRow);
  assert.ok(turnAt > 0, `turned (${JSON.stringify(path)})`);
  assert.equal(path[turnAt][0], b.player.col, 'turned in the player column');
  assert.ok(path.slice(0, turnAt).every(([, r]) => r === startRow), 'ran straight along its row first');
  assert.ok(path.slice(turnAt).every(([c]) => c === b.player.col), 'then ran straight at the player');
  assert.equal(bomb.data.turned, true);
  assert.equal(Math.sign(bomb.data.dr), Math.sign(b.player.row - startRow));
  assert.equal(b.player.hp, hp - 20, 'exploded on the player');
  assert.ok(b.events.some((ev) => ev.fx === 'scurryblast'));
});

test('a crawling bomb that misses its turn runs off the field', () => {
  const b = makeBattle({ enemies: [{ type: 'scurrier', level: 1, col: 5, row: 0 }], seed: 3, player: TOUGH });
  toFight(b);
  const sc = enemy(b, 'scurrier');
  assert.ok(stepUntil(b, () => sc.anim === 'windup', 600));
  b.player.row = sc.row === 2 ? 0 : 2;
  assert.ok(stepUntil(b, () => b.spells.some((s) => s.type === 'scurrybomb'), 60));
  const bomb = b.spells.find((s) => s.type === 'scurrybomb');
  assert.ok(stepUntil(b, () => bomb.data.turned, 120), 'turned toward the player');
  // Side-step out of the column once it has turned: it runs on past and off the field.
  b.player.col = 2;
  const hp = b.player.hp;
  assert.ok(stepUntil(b, () => !bomb.alive, 200));
  assert.equal(b.player.hp, hp);
  assert.ok(!b.events.some((ev) => ev.fx === 'scurryblast'));
});

test('the crawling bomb stops at a hole', () => {
  const b = makeBattle({ enemies: [{ type: 'scurrier', level: 2, col: 5, row: 1 }], seed: 3, player: TOUGH, field: ['..x...', '..x...', '..x...'] });
  toFight(b);
  run(b, 1500);
  assert.equal(hurtsOnPlayer(b).length, 0);
  assert.ok(b.events.some((ev) => ev.fx === 'bombfizzle'));
});

// ---------------------------------------------------------------- fuzz + determinism

const FUZZ_CHIPS = ['cannon', 'shotgun', 'sword', 'widesword', 'minibomb', 'airshot1', 'areagrab', 'recov10', 'shockwave', 'zapring1', 'icewave1', 'panlgrab'].filter((k) => CHIPS[k]);

function fuzzBattle(seed) {
  const rnd = mulberry(seed * 7919 + 1);
  const spots = [];
  for (let r = 0; r < ROWS; r++) for (let c = 3; c < COLS; c++) spots.push([c, r]);
  const enemies = [];
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const [col, row] = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
    enemies.push({ type: TYPES[Math.floor(rnd() * TYPES.length)], level: 1 + Math.floor(rnd() * 4), col, row });
  }
  const folder = [];
  for (let i = 0; i < 30; i++) folder.push({ key: FUZZ_CHIPS[i % FUZZ_CHIPS.length], code: '*' });
  const b = makeBattle({ enemies, folder, seed, shuffle: true, player: { maxHp: 20000, hp: 20000 } });
  // Most seeds use sturdy viruses so the AIs run the whole time; every fourth uses fragile ones so deletions
  // (mid-burrow, mid-volley, holding a turn token) are covered too.
  for (const e of b.livingEnemies()) {
    if (seed % 4 === 0) e.hp = Math.min(e.hp, 25);
    else {
      e.maxHp = 5000;
      e.hp = 5000;
    }
  }
  return { b, rnd, enemies };
}

function playFuzz(seed, frames) {
  const { b, rnd, enemies } = fuzzBattle(seed);
  const log = [];
  let held = {};
  for (let f = 0; f < frames && !b.done; f++) {
    if (b.phase === 'custom') {
      for (let k = 0; k < 3; k++) if (b.custom.hand.length) b.custom.select(Math.floor(rnd() * b.custom.hand.length));
      b.custom.confirm();
    }
    if (f % 4 === 0) {
      held = {};
      const roll = rnd();
      if (roll < 0.35) held[['up', 'down', 'left', 'right'][Math.floor(rnd() * 4)]] = true;
      else if (roll < 0.55) held.b = true;
      else if (roll < 0.62) held.a = true;
      else if (roll < 0.66) held.l = true;
    }
    b.step(held);
    for (const e of b.entities) {
      if (e === b.player || !e.alive || e.removed) continue;
      assert.ok(e.col >= 0 && e.col < COLS && e.row >= 0 && e.row < ROWS, 'in bounds');
      assert.equal(b.field.ownerAt(e.col, e.row), TEAM.BLUE, `${e.type} stays in its own area`);
      assert.ok(e.hp >= 0 && e.hp <= e.maxHp);
    }
    if (f % 50 === 0) log.push(`${f}:${b.phase}:${b.player.hp}@${b.player.col},${b.player.row}|${b.entities.map((e) => `${e.type}${e.hp}@${e.col},${e.row}${e.hidden ? 'h' : ''}:${e.anim}`).join('|')}|${b.spells.map((s) => `${s.type}@${s.col},${s.row}`).join(',')}`);
  }
  b.drainEvents();
  return { log: log.join('\n'), b, enemies };
}

test('fuzz: random pack-B mixes and random inputs run thousands of frames without breaking invariants', () => {
  const kinds = new Set();
  let fight = 0;
  let won = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const { b, enemies } = playFuzz(seed, 3000);
    for (const en of enemies) kinds.add(en.type);
    fight += b.fightFrames;
    if (b.phase === 'win' || b.phase === 'results') won++;
  }
  assert.equal(kinds.size, TYPES.length, 'every family was fuzzed');
  assert.ok(fight > 30000, `long fights (${fight} fight frames)`);
  assert.ok(won >= 1, 'some fragile mixes were deleted');
});

test('determinism: the same seed and inputs replay the same pack-B battle', () => {
  for (const seed of [3, 11, 42]) {
    const a = playFuzz(seed, 2500).log;
    const c = playFuzz(seed, 2500).log;
    assert.equal(a, c, `seed ${seed} replays identically`);
  }
  assert.notEqual(playFuzz(5, 1500).log, playFuzz(6, 1500).log);
});
