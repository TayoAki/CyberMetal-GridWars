import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL, TEAM, TIMING } from '../src/engine/constants.js';
import { ENEMIES } from '../src/engine/enemies/index.js';
import { source } from '../src/engine/combat.js';
import { makeBattle, folderOf, run, toFight, pickAndFight, press, enemy } from './helpers.js';

// Boss pack B: Ironclad (MetalMan pattern), Sabre (ProtoMan), ZeroDay (Bass), Briarix (PlantMan).

const BOSSES = {
  ironclad: { hp: [500, 800, 1200, 1700], element: 'null' },
  sabre: { hp: [1000, 1300, 1600, 2000], element: 'null' },
  zeroday: { hp: [1000, 2000, 3000, 3000], element: 'null' },
  briarix: { hp: [1000, 1300, 1700, 2100], element: 'wood' },
};
const TYPES = Object.keys(BOSSES);
const LEVELS = [1, 2, 3, 4];

function duel(type, level, opts = {}) {
  return makeBattle({ enemies: [{ type, level, col: 4, row: 1 }], player: { maxHp: 9999, ...(opts.player ?? {}) }, seed: opts.seed ?? 7, folder: opts.folder ?? [], field: opts.field ?? null, shuffle: opts.shuffle ?? false });
}

// A hit from the player (attributed to the player like a chip would be).
function playerHit(b, target, hit) {
  return b.applyHit(target, hit, source(b.player, hit));
}

// Run until pred() or `max` frames; returns the frames taken (or -1).
function until(b, pred, max = 2000, pad = {}) {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    b.step(pad);
  }
  return pred() ? max : -1;
}

test('every boss spawns at every version with its ROM HP and element', () => {
  for (const type of TYPES) {
    const fam = ENEMIES[type];
    assert.ok(fam, `${type} registered`);
    assert.equal(fam.kind, 'navi');
    for (const level of LEVELS) {
      const b = duel(type, level);
      assert.ok(b.isBossBattle);
      const e = enemy(b, type);
      assert.equal(e.hp, BOSSES[type].hp[level - 1], `${type} L${level} hp`);
      assert.equal(e.maxHp, e.hp);
      assert.equal(e.element, BOSSES[type].element);
      assert.equal(e.kind, 'navi');
      assert.equal(e.name, fam.names[level - 1]);
      assert.ok(e.stats.attack > 0);
    }
  }
});

test('over 2500 fight frames each boss hurts a passive player and uses at least two moves', () => {
  for (const type of TYPES) {
    for (const level of LEVELS) {
      const b = duel(type, level, { seed: 100 + level });
      toFight(b);
      const e = enemy(b, type);
      for (let f = 0; f < 2500; f++) {
        b.step({});
        assert.equal(b.field.ownerAt(e.col, e.row), e.team, `${type} L${level} stays in its area`);
      }
      assert.ok(b.player.hp < b.player.maxHp, `${type} L${level} dealt damage`);
      const moves = Object.keys(e.data.moves ?? {});
      assert.ok(moves.length >= 2, `${type} L${level} used ${moves.join(',')}`);
    }
  }
});

test('higher versions hit harder and add moves', () => {
  for (const type of TYPES) {
    const fam = ENEMIES[type];
    for (let i = 1; i < 4; i++) assert.ok(fam.levels[i].attack > fam.levels[i - 1].attack, `${type} attack rises`);
  }
  // Moves used over a few seeds (so a change in how much rng other code consumes can't flake this).
  const used = (type, level) => {
    const all = {};
    for (const seed of [21, 22, 23]) {
      const b = duel(type, level, { seed });
      toFight(b);
      run(b, 4000);
      for (const [k, n] of Object.entries(enemy(b, type).data.moves)) all[k] = (all[k] ?? 0) + n;
    }
    return all;
  };
  assert.ok(used('ironclad', 3).quake > 0);
  assert.equal(used('ironclad', 1).quake, undefined);
  assert.ok(used('sabre', 2).step > 0);
  assert.ok(used('sabre', 3).triple > 0);
  assert.equal(used('sabre', 1).step, undefined);
  assert.ok(used('zeroday', 3).collapse > 0);
  assert.equal(used('zeroday', 2).collapse, undefined);
  assert.ok(used('briarix', 2).overgrow > 0);
  assert.ok(used('briarix', 3).bud > 0);
});

test('killing the boss ends the battle even with its objects still on the field', () => {
  for (const type of TYPES) {
    for (const level of [1, 4]) {
      const b = duel(type, level);
      toFight(b);
      run(b, 200);
      const e = enemy(b, type);
      // A blue object left behind (like a planted bud) must not hold the fight open.
      const spot = [[5, 0], [5, 2], [3, 0], [3, 2]].find(([c, r]) => !b.entityAt(c, r));
      b.spawnObject({ type: 'rockcube', name: 'Rock', team: TEAM.BLUE, col: spot[0], row: spot[1], hp: 300 });
      e.auraPower = 0;
      e.guardTimer = 0;
      e.guard = null;
      e.hidden = false;
      playerHit(b, e, { damage: 99999, isChip: true });
      assert.ok(!e.alive);
      b.step({});
      assert.equal(b.phase, 'win', `${type} L${level}`);
      run(b, TIMING.WIN_BANNER + 5);
      assert.equal(b.phase, 'results');
      assert.ok(b.result.won);
    }
  }
});

test('Briarix V3 plants a Thorn Bud; deleting Briarix still wins and clears the bud', () => {
  const b = duel('briarix', 3, { seed: 4 });
  toFight(b);
  const br = enemy(b, 'briarix');
  br.data.forceMove = 'bud';
  const bud = () => b.entities.find((x) => x.type === 'thornbud' && x.alive);
  assert.ok(until(b, () => !!bud(), 600) >= 0, 'a bud was planted');
  const pet = bud();
  assert.equal(pet.kind, 'object');
  assert.equal(pet.team, TEAM.BLUE);
  assert.equal(b.field.ownerAt(pet.col, pet.row), TEAM.BLUE);
  playerHit(b, br, { damage: 99999, isChip: true });
  b.step({});
  assert.equal(b.phase, 'win');
  assert.ok(!pet.alive, 'the bud withers with its master');
});

test('Thorn Bud spits thorns down its row and can be cut down', () => {
  const b = duel('briarix', 4, { seed: 8 });
  toFight(b);
  const br = enemy(b, 'briarix');
  br.data.forceMove = 'bud';
  const bud = () => b.entities.find((x) => x.type === 'thornbud' && x.alive);
  assert.ok(until(b, () => !!bud(), 600) >= 0);
  const pet = bud();
  // Keep Briarix itself quiet; stand in the bud's row and wait for a thorn.
  br.stunTimer = 100000;
  b.player.row = pet.row;
  assert.ok(until(b, () => b.spells.some((s) => s.type === 'briarthorn'), 400) >= 0, 'a thorn was fired');
  playerHit(b, pet, { damage: 999, isChip: true });
  assert.ok(!pet.alive);
});

test('Sabre guards on reflex: a buster shot into his shield is blocked and bounced back', () => {
  for (const level of [1, 3]) {
    const b = duel('sabre', level, { seed: 3 });
    toFight(b);
    const s = enemy(b, 'sabre');
    let blocked = false;
    let reflected = false;
    for (let f = 0; f < 4000 && !(blocked && reflected); f++) {
      if (b.player.row !== s.row && b.player.stunTimer === 0) b.player.row = s.row; // keep lined up
      const hp = s.hp;
      const up = s.guardTimer > 0;
      b.step({ b: f % 16 === 0 });
      const ev = b.drainEvents();
      if (up && s.hp === hp && ev.some((x) => x.type === 'fx' && x.fx === 'guard' && x.col === s.col && x.row === s.row)) blocked = true;
      if (b.spells.some((sp) => sp.type === 'reflect' && sp.owner === s)) reflected = true;
    }
    assert.ok(blocked, `L${level} blocked a shot`);
    assert.ok(reflected, `L${level} reflected it`);
    assert.ok(s.data.moves.guard > 0);
  }
});

test("Sabre's Wide Slash cuts the player's front column from the front of his own area", () => {
  const b = duel('sabre', 1, { seed: 12 });
  toFight(b);
  const s = enemy(b, 'sabre');
  b.player.col = 2;
  s.data.forceMove = 'wide';
  const hp = b.player.hp;
  assert.ok(until(b, () => s.anim === 'slash', 600) >= 0);
  assert.equal(s.col, 3, 'slashes from his front column');
  assert.equal(s.row, b.player.row);
  b.step({});
  assert.equal(hp - b.player.hp, s.stats.slash);
  // One column back the Wide Slash can't reach.
  const b2 = duel('sabre', 1, { seed: 12 });
  toFight(b2);
  const s2 = enemy(b2, 'sabre');
  s2.data.forceMove = 'wide';
  assert.ok(until(b2, () => s2.anim === 'slash', 600) >= 0);
  run(b2, 6);
  assert.equal(b2.player.hp, b2.player.maxHp);
});

test("ZeroDay's Dark Aura shrugs off a 40-damage Cannon and breaks to a 100+ hit", () => {
  const b = duel('zeroday', 2, { folder: folderOf('cannon:B', 'lavacan2:B'), seed: 5 });
  pickAndFight(b, [0, 1]);
  const z = enemy(b, 'zeroday');
  assert.ok(until(b, () => z.auraPower > 0, 400) >= 0, 'aura raised at the start');
  assert.equal(z.auraPower, 100);
  // Hold it in place (a stun pauses the AI) and line up.
  z.stunTimer = 100000;
  z.hidden = false;
  z.z = 0;
  b.player.row = z.row;
  const hp = z.hp;
  press(b, 'a'); // Cannon, 40
  run(b, 30);
  assert.equal(z.hp, hp);
  assert.equal(z.auraPower, 100);
  press(b, 'a'); // LavaCan2, 120: breaks the aura (that hit itself is absorbed)
  run(b, 30);
  assert.equal(z.auraPower, 0);
  assert.equal(z.hp, hp);
  playerHit(b, z, { damage: 40, isChip: true });
  assert.equal(z.hp, hp - 40);
  // ...and it comes back after the cooldown.
  z.stunTimer = 0;
  assert.ok(until(b, () => z.auraPower > 0, z.stats.auraCd + 900) >= 0, 'aura re-raised');
});

test('ZeroDay V1 has no aura; Earth Splitter cracks the player area along every row', () => {
  const b = duel('zeroday', 1, { seed: 9 });
  toFight(b);
  const z = enemy(b, 'zeroday');
  z.data.forceMove = 'split';
  let waves = 0;
  const rows = new Set();
  for (let f = 0; f < 700 && z.data.moves.split === undefined; f++) b.step({});
  for (let f = 0; f < 160; f++) {
    for (const s of b.spells) if (s.type === 'voidwave' && !s.data.seen) {
      s.data.seen = true;
      waves++;
      rows.add(s.row);
    }
    b.step({});
  }
  assert.equal(z.auraPower, 0);
  assert.equal(waves, 3);
  assert.equal(rows.size, 3);
  let cracked = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if ([PANEL.CRACKED, PANEL.BROKEN].includes(b.field.typeAt(c, r))) cracked++;
  assert.ok(cracked >= 6, `cracked ${cracked}`);
  for (let r = 0; r < 3; r++) for (let c = 3; c < 6; c++) assert.equal(b.field.typeAt(c, r), PANEL.NORMAL, 'its own area is spared');
  assert.ok(b.player.hp < b.player.maxHp);
});

test("ZeroDay V3's Void Collapse scours the player's row for big damage", () => {
  const b = duel('zeroday', 3, { seed: 2 });
  toFight(b);
  const z = enemy(b, 'zeroday');
  z.data.forceMove = 'collapse';
  let beamHit = false;
  let warned = false;
  for (let f = 0; f < 900 && !beamHit; f++) {
    b.step({});
    if (b.spells.some((s) => s.type === 'voidwarn')) warned = true;
    for (const ev of b.drainEvents()) if (ev.type === 'hurt' && ev.id === b.player.id && ev.amount === z.stats.beam) beamHit = true;
  }
  assert.ok(warned, 'the row was marked first');
  assert.ok(beamHit, 'the beam hit for its full damage');
});

test('a counter during a wind-up calls the attack off (even on super-armored Ironclad)', () => {
  const b = duel('ironclad', 2, { seed: 6 });
  toFight(b);
  const ic = enemy(b, 'ironclad');
  ic.data.forceMove = 'slam';
  assert.ok(until(b, () => ic.counterWindow > 0 && ic.anim === 'windup', 600) >= 0);
  playerHit(b, ic, { damage: 10, isChip: true, flinch: true });
  assert.equal(b.stats.counters, 1);
  assert.ok(ic.stunTimer > 0);
  assert.equal(ic.flinchTimer, 0);
  let fists = 0;
  for (let f = 0; f < 120; f++) {
    b.step({});
    fists += b.spells.filter((s) => s.type === 'piston').length;
  }
  assert.equal(fists, 0, 'no fist was fired');
});

test('Ironclad has super armor and cannot be shoved', () => {
  const b = duel('ironclad', 1, { seed: 1 });
  toFight(b);
  const ic = enemy(b, 'ironclad');
  run(b, 5);
  const script = ic.script;
  const at = [ic.col, ic.row];
  playerHit(b, ic, { damage: 40, isChip: true, flinch: true, push: -1 });
  assert.equal(ic.hp, 460);
  assert.equal(ic.flinchTimer, 0);
  assert.notEqual(ic.anim, 'hurt');
  assert.equal(ic.script, script, 'the AI was not reset');
  assert.deepEqual([ic.col, ic.row], at);
  playerHit(b, ic, { damage: 10, isChip: true, flinch: true, push: 1 });
  assert.deepEqual([ic.col, ic.row], at);
});

test("Ironclad's Piston Slam breaks the panel the player dodged off", () => {
  const b = duel('ironclad', 1, { seed: 14 });
  toFight(b);
  const ic = enemy(b, 'ironclad');
  ic.data.forceMove = 'slam';
  assert.ok(until(b, () => b.spells.some((s) => s.type === 'piston'), 600) >= 0);
  const fist = b.spells.find((s) => s.type === 'piston');
  assert.equal(fist.col, b.player.col);
  assert.equal(fist.row, b.player.row);
  const [c, r] = [fist.col, fist.row];
  press(b, r === 0 ? 'down' : 'up'); // dodge
  run(b, 60);
  assert.equal(b.player.hp, b.player.maxHp);
  assert.equal(b.field.typeAt(c, r), PANEL.BROKEN);
});

test("Ironclad's Saw Blade cuts on the way out and on the way back", () => {
  const b = duel('ironclad', 1, { seed: 3 });
  toFight(b);
  const ic = enemy(b, 'ironclad');
  ic.data.forceMove = 'saw';
  b.player.col = 1;
  assert.ok(until(b, () => b.spells.some((s) => s.type === 'sawblade'), 800) >= 0);
  const saw = b.spells.find((s) => s.type === 'sawblade');
  assert.equal(saw.row, ic.row);
  const hits = [];
  for (let f = 0; f < 200 && saw.alive; f++) {
    // Teleport a fresh target in front of the saw path: two hits on one body need its i-frames cleared.
    b.player.iframes = 0;
    b.player.row = saw.row;
    const before = b.player.hp;
    b.step({});
    if (b.player.hp < before) hits.push(saw.data.returning ? 'back' : 'out');
  }
  assert.ok(hits.includes('out') && hits.includes('back'), hits.join(','));
});

test('Briarix grows grass over its own area on spawn and heals on it', () => {
  const b = duel('briarix', 1);
  for (let r = 0; r < 3; r++) {
    for (let c = 3; c < 6; c++) assert.equal(b.field.typeAt(c, r), PANEL.GRASS);
    for (let c = 0; c < 3; c++) assert.equal(b.field.typeAt(c, r), PANEL.NORMAL);
  }
  toFight(b);
  const br = enemy(b, 'briarix');
  br.hp = 900;
  br.stunTimer = 1000; // hold still
  run(b, 300);
  assert.ok(br.hp > 900, `healed to ${br.hp}`);
});

test('Briarix is weak to fire: a HeatShot on its grass does double damage and burns the grass', () => {
  const b = duel('briarix', 1, { folder: folderOf('heatshot:B') });
  pickAndFight(b, [0]);
  const br = enemy(b, 'briarix');
  br.stunTimer = 1000;
  b.player.row = br.row;
  const hp = br.hp;
  press(b, 'a');
  run(b, 30);
  assert.equal(hp - br.hp, 80);
  assert.equal(b.field.typeAt(br.col, br.row), PANEL.NORMAL);
});

test("Briarix's Root Snare paralyzes instead of flinching", () => {
  const b = duel('briarix', 1, { seed: 5 });
  toFight(b);
  const br = enemy(b, 'briarix');
  br.data.forceMove = 'snare';
  const hp = b.player.hp;
  assert.ok(until(b, () => b.player.hp < hp, 600) >= 0);
  assert.equal(hp - b.player.hp, br.stats.root);
  assert.ok(b.player.stunTimer > 40, 'paralyzed');
  assert.equal(b.player.flinchTimer, 0);
  const roots = b.spells.find((s) => s.type === 'roots');
  assert.ok(roots?.data.caught, 'the roots hold on');
});

test("Briarix's Petal Storm hits again and again while the player stays in the row", () => {
  const b = duel('briarix', 2, { seed: 5 });
  toFight(b);
  const br = enemy(b, 'briarix');
  br.data.forceMove = 'petals';
  // Petal Storm is the first move, so every hurt until the storm ends is a petal tick.
  let ticks = 0;
  const count = () => {
    for (const ev of b.drainEvents()) if (ev.type === 'hurt' && ev.id === b.player.id) ticks++;
  };
  for (let f = 0; f < 800 && !b.spells.some((s) => s.type === 'petals'); f++) {
    b.step({});
    count();
  }
  assert.ok(b.spells.some((s) => s.type === 'petals'));
  for (let f = 0; f < 45; f++) {
    b.step({});
    count();
  }
  assert.equal(ticks, 4);
});

test('Briarix V2 Overgrowth turns the whole field to grass', () => {
  const b = duel('briarix', 2, { seed: 5 });
  toFight(b);
  const br = enemy(b, 'briarix');
  br.data.forceMove = 'overgrow';
  assert.ok(until(b, () => b.field.typeAt(0, 0) === PANEL.GRASS, 600) >= 0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) assert.equal(b.field.typeAt(c, r), PANEL.GRASS);
});

// A tiny LCG so the fuzz inputs are reproducible without touching the battle's rng.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const FUZZ_FOLDER = folderOf(
  'cannon:*', 'hicannon:*', 'sword:*', 'widesword:*', 'stepsword:*', 'minibomb:*', 'airshot1:*', 'heatshot:*',
  'tornado:*', 'zapring1:*', 'lavacan2:*', 'guard:*', 'areagrab:*', 'panlout3:*', 'rockcube:*', 'invis:*',
  'recov50:*', 'barrier:*', 'aura:*', 'ironclad1:I', 'sabre1:S', 'briarix1:B', 'zerostorm:Z', 'atk10:*',
  'shockwave:*', 'boomer1:*', 'yoyo1:*', 'geddon1:*', 'fstgauge:*', 'dashatk:*',
);
const KEYS = ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r'];

function fuzz(type, level, seed, frames) {
  const b = makeBattle({ enemies: [{ type, level, col: 4, row: 1 }], folder: FUZZ_FOLDER, seed, shuffle: true, player: { maxHp: 9999 } });
  const rnd = lcg(seed * 7919 + level);
  const e = enemy(b, type);
  const pad = {};
  for (let f = 0; f < frames && !b.done; f++) {
    if (b.phase === 'custom') {
      for (let k = 0; k < 3; k++) b.custom.select(Math.floor(rnd() * b.custom.hand.length));
      b.custom.confirm();
    }
    for (const k of KEYS) if (rnd() < 0.08) pad[k] = !pad[k];
    b.step(pad);
    if (e.alive) {
      assert.ok(e.hp >= 0 && e.hp <= e.maxHp);
      assert.equal(b.field.ownerAt(e.col, e.row), e.team, `${type} L${level} left its area`);
    }
  }
  return b;
}

test('fuzz: random inputs and chips for thousands of frames never throw', () => {
  for (const type of TYPES) {
    for (const level of LEVELS) fuzz(type, level, 31 + level, 4000);
  }
});

test('boss fights are deterministic for a seed and an input log', () => {
  for (const type of TYPES) {
    const play = () => {
      const b = fuzz(type, 4, 77, 0);
      const rnd = lcg(99);
      const pad = {};
      const log = [];
      for (let f = 0; f < 2400; f++) {
        if (b.phase === 'custom') {
          b.custom.select(Math.floor(rnd() * b.custom.hand.length));
          b.custom.confirm();
        }
        for (const k of KEYS) if (rnd() < 0.06) pad[k] = !pad[k];
        b.step(pad);
        if (f % 60 === 0) log.push(`${b.frame}:${b.phase}:${b.player.hp}@${b.player.col},${b.player.row}|${b.entities.map((x) => `${x.type}${x.hp}@${x.col},${x.row}:${x.anim}`).join(';')}|${b.spells.length}|${b.field.snapshot().flat().map((p) => p.type[0]).join('')}`);
      }
      return log.join('\n');
    };
    assert.equal(play(), play(), type);
  }
});
