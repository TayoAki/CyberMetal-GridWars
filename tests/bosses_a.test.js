import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL, TEAM, COLS } from '../src/engine/constants.js';
import { ENEMIES } from '../src/engine/enemies/index.js';
import { FAMILIES } from '../src/engine/enemies/bosses/bosses_a.js';
import { CHIPS } from '../src/engine/chips/library.js';
import { makeBattle, folderOf, run, toFight, pickAndFight, press } from './helpers.js';

// Boss pack A: Voltframe (FlashMan), Feralis (BeastMan), Tidecaller (BubbleMan), Pyreclaw (FlameMan).

const BOSSES = [
  { type: 'voltframe', hp: [300, 500, 700, 1500], element: 'elec', col: 4, row: 1 },
  { type: 'feralis', hp: [500, 700, 900, 1600], element: 'null', col: 4, row: 1 },
  { type: 'tidecaller', hp: [500, 800, 1200, 1800], element: 'aqua', col: 5, row: 1 },
  { type: 'pyreclaw', hp: [1000, 1400, 1800, 2400], element: 'fire', col: 4, row: 1 },
];
const LEVELS = [1, 2, 3, 4];
const TOUGH = { maxHp: 99999 }; // a passive player who survives long enough to see the whole moveset

function bossBattle(type, level, opts = {}) {
  const spec = BOSSES.find((x) => x.type === type);
  const b = makeBattle({
    enemies: [{ type, level, col: opts.col ?? spec.col, row: opts.row ?? spec.row }],
    seed: opts.seed ?? 7,
    player: opts.player ?? TOUGH,
    folder: opts.folder ?? [],
    field: opts.field ?? null,
  });
  return b;
}

const boss = (b) => b.entities.find((e) => e.kind === 'navi');
const pets = (b, type) => b.entities.filter((e) => e.kind === 'object' && e.alive && !e.removed && (!type || e.type === type));

function runUntil(b, pred, max = 3000, pad = {}) {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    b.step(typeof pad === 'function' ? pad(i) : pad);
    b.drainEvents();
  }
  return pred();
}

// Seeded input generator for fuzzing (tests may use their own PRNG; the engine must not).
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FUZZ_FOLDER = folderOf(
  'cannon:A', 'cannon:B', 'hicannon:H', 'airshot1:*', 'shotgun:B', 'spreader:M', 'bubbler:A', 'heatshot:B',
  'minibomb:B', 'lavaball:B', 'sword:E', 'widesword:L', 'stepsword:L', 'shockwave:D', 'zapring1:A', 'wave:E',
  'areagrab:L', 'panlgrab:A', 'panlout1:B', 'rockcube:*', 'wind:*', 'fan:*', 'invis:*', 'barrier:E',
  'recov30:*', 'voltframe1:V', 'feralis2:F', 'tidecaller3:T', 'pyreclaw1:P', 'geddon1:D',
);

// ------------------------------------------------------------------ registry and stats

test('boss pack A registers four navis with BN3 HP/element at every version', () => {
  assert.deepEqual(FAMILIES.map((f) => f.type), BOSSES.map((x) => x.type));
  for (const spec of BOSSES) {
    const fam = ENEMIES[spec.type];
    assert.ok(fam, `${spec.type} registered`);
    assert.equal(fam.kind, 'navi');
    assert.equal(fam.levels.length, 4);
    for (const level of LEVELS) {
      const b = bossBattle(spec.type, level);
      assert.ok(b.isBossBattle, 'navi battles use the boss busting table');
      const e = boss(b);
      assert.equal(e.type, spec.type);
      assert.equal(e.level, level);
      assert.equal(e.hp, spec.hp[level - 1]);
      assert.equal(e.maxHp, spec.hp[level - 1]);
      assert.equal(e.element, spec.element);
      assert.equal(e.name, fam.names[level - 1]);
    }
  }
});

test('every navi chip summons a type this pack defines', () => {
  for (const key of ['voltframe1', 'feralis1', 'tidecaller1', 'pyreclaw1']) assert.ok(CHIPS[key], key);
  for (const spec of BOSSES) assert.ok(ENEMIES[spec.type].ai, `${spec.type} has an AI`);
});

// ------------------------------------------------------------------ a fight against a passive player

for (const spec of BOSSES) {
  for (const level of LEVELS) {
    test(`${spec.type} V${level} damages a passive player and uses 2+ moves in 2500 frames`, () => {
      const b = bossBattle(spec.type, level, { seed: 100 + level });
      toFight(b);
      const e = boss(b);
      const anims = new Set();
      let damaged = 0;
      for (let f = 0; f < 2500; f++) {
        const hp = b.player.hp;
        b.step({});
        b.drainEvents();
        if (b.player.hp < hp) damaged++;
        anims.add(e.anim);
        // Bosses stay in their own area.
        assert.equal(b.field.ownerAt(e.col, e.row), TEAM.BLUE);
      }
      assert.equal(b.phase, 'fight');
      assert.ok(damaged >= 1, 'hit the player at least once');
      const attacks = Object.keys(e.data.moves).filter((m) => m !== 'coral');
      assert.ok(attacks.length >= 2, `used ${attacks.join(',')}`);
      assert.ok(anims.size >= 4, `poses ${[...anims].join(',')}`);
      // No dash/leap view hints left over while it stands.
      if (!e.hidden && e.anim === 'idle') {
        assert.equal(e.offsetX, 0);
        assert.equal(e.z, 0);
      }
    });
  }
}

test('higher versions unlock their extra moves', () => {
  const used = (type, level, seed) => {
    const b = bossBattle(type, level, { seed });
    toFight(b);
    run(b, 4000);
    return boss(b).data.moves;
  };
  assert.equal(used('voltframe', 1, 3).neon, undefined);
  assert.ok(used('voltframe', 3, 3).neon >= 1);
  assert.equal(used('feralis', 1, 3).howl, undefined);
  assert.ok(used('feralis', 2, 3).howl >= 1);
  assert.equal(used('tidecaller', 1, 3).tide, undefined);
  assert.ok(used('tidecaller', 2, 3).tide >= 1);
  assert.equal(used('pyreclaw', 1, 3).brazier, undefined);
  assert.ok(used('pyreclaw', 2, 3).brazier >= 1);
});

// ------------------------------------------------------------------ Voltframe

test('Voltframe Flash paralyzes the player (only Invis avoids it)', () => {
  const b = bossBattle('voltframe', 1);
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'flash';
  assert.ok(runUntil(b, () => e.anim === 'flashcharge', 600));
  assert.ok(e.counterWindow > 0, 'the wind-up is counterable');
  assert.ok(runUntil(b, () => b.player.stunTimer > 0, 120));
  assert.ok(b.player.stunTimer >= 80 && b.player.stunTimer <= 90, `stun ${b.player.stunTimer}`);
  assert.equal(b.player.hp, TOUGH.maxHp - e.stats.flash);
  // Paralysed: input does nothing.
  const row = b.player.row;
  press(b, 'up');
  press(b, 'down', 3);
  assert.equal(b.player.row, row);

  // Invisible: the flash goes off but does not land.
  const b2 = bossBattle('voltframe', 1);
  toFight(b2);
  const e2 = boss(b2);
  e2.data.forceMove = 'flash';
  b2.player.invisTimer = 5000;
  assert.ok(runUntil(b2, () => e2.anim === 'flash', 600));
  run(b2, 30);
  assert.equal(b2.player.stunTimer, 0);
  assert.equal(b2.player.hp, TOUGH.maxHp);
});

test('Voltframe V2 follows a landed Flash with a bolt on the paralysed player', () => {
  const b = bossBattle('voltframe', 2);
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'flash';
  assert.ok(runUntil(b, () => b.player.stunTimer > 0, 700));
  const hp = b.player.hp;
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'arcbolt'), 60), 'a bolt is called down');
  const bolt = b.spells.find((s) => s.type === 'arcbolt');
  assert.equal(bolt.col, b.player.col);
  assert.equal(bolt.row, b.player.row);
  assert.ok(runUntil(b, () => b.player.hp < hp, 80), 'the bolt lands before the paralysis ends');
  assert.equal(hp - b.player.hp, e.stats.attack);
});

test('countering the Flash wind-up cancels it', () => {
  const b = bossBattle('voltframe', 1, { folder: folderOf('cannon:A'), player: { maxHp: 500 } });
  pickAndFight(b, [0]);
  const e = boss(b);
  e.data.forceMove = 'flash';
  assert.ok(runUntil(b, () => e.anim === 'flashcharge' && e.counterWindow > 10, 600));
  b.player.row = e.row; // line up (test shortcut)
  press(b, 'a');
  run(b, 12);
  assert.equal(b.stats.counters, 1);
  assert.equal(e.hp, 300 - 40);
  run(b, 80);
  assert.equal(b.player.stunTimer, 0, 'no flash went off');
});

test('Arc Bolt telegraphs on the player panel; stepping away dodges it', () => {
  const b = bossBattle('voltframe', 1, { player: { maxHp: 500 } });
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'arcbolt';
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'arcbolt'), 600));
  const bolt = b.spells.find((s) => s.type === 'arcbolt');
  assert.deepEqual([bolt.col, bolt.row], [1, 1]);
  assert.ok(bolt.data.delay >= 30, 'a readable telegraph');
  press(b, 'up');
  run(b, 60);
  assert.equal(b.player.hp, 500);

  // Standing still gets struck.
  const b2 = bossBattle('voltframe', 1, { player: { maxHp: 500 } });
  toFight(b2);
  boss(b2).data.forceMove = 'arcbolt';
  assert.ok(runUntil(b2, () => b2.player.hp < 500, 700));
  assert.equal(b2.player.hp, 470);
  assert.ok(b2.player.flinchTimer > 0 || b2.player.iframes > 0, 'bolts flinch');
});

test('Voltframe V3 plants a Neon Lamp that zaps the player row until destroyed', () => {
  const b = bossBattle('voltframe', 3);
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'neon';
  assert.ok(runUntil(b, () => pets(b, 'neonlamp').length === 1, 600));
  const lamp = pets(b, 'neonlamp')[0];
  assert.equal(lamp.kind, 'object');
  assert.equal(lamp.team, TEAM.BLUE);
  assert.equal(lamp.hp, 60);
  assert.equal(b.field.ownerAt(lamp.col, lamp.row), TEAM.BLUE);
  // Its warning covers the player's row in the player's area.
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'zapwarn'), 200));
  const warns = b.spells.filter((s) => s.type === 'zapwarn' && s.owner === lamp);
  assert.deepEqual(warns.map((s) => s.col).sort(), [0, 1, 2]);
  assert.ok(warns.every((s) => s.row === b.player.row));
  // Destroy it: it stops, and Voltframe waits before planting another.
  b.applyHit(lamp, { damage: 999 }, null);
  assert.ok(!lamp.alive);
  assert.ok(e.data.lampReady > b.fightFrames);
});

// ------------------------------------------------------------------ Feralis

test('Feralis Rake strikes the whole column after a telegraph', () => {
  const b = bossBattle('feralis', 1, { player: { maxHp: 500 } });
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'rake';
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'rakewarn'), 600));
  const marks = b.spells.filter((s) => s.type === 'rakewarn');
  assert.deepEqual(marks.map((s) => [s.col, s.row]).sort(), [[1, 0], [1, 1], [1, 2]]);
  // Stepping out of the column dodges.
  press(b, 'left');
  run(b, 50);
  assert.equal(b.player.hp, 500);
  // Standing in it does not.
  const b2 = bossBattle('feralis', 1, { player: { maxHp: 500 } });
  toFight(b2);
  boss(b2).data.forceMove = 'rake';
  assert.ok(runUntil(b2, () => b2.player.hp < 500, 700));
  assert.equal(b2.player.hp, 460);
});

test('Feralis Pounce Dash: hidden while it tears across the row, then lands back home', () => {
  const b = bossBattle('feralis', 1, { player: { maxHp: 500 } });
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'pounce';
  assert.ok(runUntil(b, () => e.hidden, 600));
  assert.equal(e.row, b.player.row, 'lined up with the player first');
  assert.ok(!e.targetable);
  const sp = b.spells.find((s) => s.type === 'pounce');
  assert.ok(sp && sp.owner === e);
  assert.ok(runUntil(b, () => !e.hidden, 60));
  assert.equal(b.player.hp, 450);
  assert.equal(e.offsetX, 0);
  assert.equal(b.field.ownerAt(e.col, e.row), TEAM.BLUE);
  assert.ok(e.targetable);
});

test('Feralis V2 Howl is followed by two quick rakes', () => {
  const b = bossBattle('feralis', 2, { player: { maxHp: 999 } });
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'howl';
  assert.ok(runUntil(b, () => e.anim === 'howl', 600));
  assert.ok(e.counterWindow > 0);
  let sets = 0;
  let last = 0;
  runUntil(b, () => {
    // A spell is 1 frame old at the end of the frame it was cast in.
    const n = b.spells.filter((s) => s.type === 'rakewarn' && s.t === 1).length;
    if (n === 3) sets++;
    last = n;
    return sets >= 2;
  }, 120);
  assert.equal(sets, 2);
  assert.ok(last >= 0);
});

// ------------------------------------------------------------------ Tidecaller

test('Tidecaller raises coral that blocks shots, and regrows it after it breaks', () => {
  const b = bossBattle('tidecaller', 1);
  toFight(b);
  const e = boss(b);
  assert.ok(runUntil(b, () => pets(b, 'coralrock').length === 1, 300));
  const rock = pets(b, 'coralrock')[0];
  assert.equal(rock.hp, 40);
  assert.equal(rock.team, TEAM.BLUE);
  assert.equal(rock.col, e.col - 1, 'in front of Tidecaller');
  // The buster hits the coral, not Tidecaller behind it.
  b.player.row = rock.row;
  e.row === rock.row || b.moveEntity(e, rock.col + 1, rock.row);
  run(b, 2);
  press(b, 'b');
  assert.equal(rock.hp, 39);
  assert.equal(e.hp, 500);
  // Break it; after the regrow delay Tidecaller calls more.
  b.applyHit(rock, { damage: 99 }, null);
  assert.ok(!rock.alive);
  assert.ok(e.data.rockReady >= b.fightFrames + 500);
  assert.ok(runUntil(b, () => pets(b, 'coralrock').length === 1, 1400));
  assert.equal(e.data.moves.coral, 2);
});

test('Tidecaller bubbles pass through its own coral', () => {
  const b = bossBattle('tidecaller', 2, { player: { maxHp: 999 } });
  toFight(b);
  const e = boss(b);
  assert.ok(runUntil(b, () => pets(b, 'coralrock').length === 2, 300));
  e.data.forceMove = 'bubble';
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'tidebubble'), 600));
  assert.equal(e.row, b.player.row);
  assert.ok(runUntil(b, () => b.player.hp < 999, 200));
  assert.equal(b.player.hp, 999 - e.stats.bubble);
  assert.ok(pets(b, 'coralrock').every((r) => r.hp === r.maxHp), 'its own coral is untouched');
});

test('Tidecaller Fish Torpedo surfaces, then sweeps the row', () => {
  const b = bossBattle('tidecaller', 1, { player: { maxHp: 999 } });
  toFight(b);
  const e = boss(b);
  runUntil(b, () => pets(b, 'coralrock').length === 1, 300);
  e.data.forceMove = 'torpedo';
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'torpedofish'), 600));
  const fish = b.spells.find((s) => s.type === 'torpedofish');
  assert.equal(fish.row, b.player.row);
  assert.equal(fish.data.phase, 'surface');
  assert.ok(runUntil(b, () => b.player.hp < 999, 120));
  assert.equal(b.player.hp, 999 - 30);
});

test('Tidecaller V2 Tide Rise freezes the player panel and another', () => {
  const b = bossBattle('tidecaller', 2, { player: { maxHp: 999 } });
  toFight(b);
  const e = boss(b);
  runUntil(b, () => pets(b, 'coralrock').length === 2, 300);
  e.data.forceMove = 'tide';
  assert.ok(runUntil(b, () => b.spells.filter((s) => s.type === 'tidegeyser').length === 2, 600));
  assert.ok(b.spells.some((s) => s.type === 'tidegeyser' && s.col === 1 && s.row === 1));
  assert.ok(runUntil(b, () => !b.spells.some((s) => s.type === 'tidegeyser'), 120));
  let ice = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (b.field.typeAt(c, r) === PANEL.ICE) ice++;
  assert.equal(ice, 2);
  assert.equal(b.field.typeAt(1, 1), PANEL.ICE);
  assert.equal(b.player.hp, 999 - e.stats.tide);
});

// ------------------------------------------------------------------ Pyreclaw

test('Pyreclaw Fire Tower marches the row and re-aims once', () => {
  const b = bossBattle('pyreclaw', 1, { player: { maxHp: 999 } });
  toFight(b);
  const e = boss(b);
  b.moveEntity(b.player, 0, 1);
  e.data.forceMove = 'tower';
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'firetower2'), 600));
  const tower = b.spells.find((s) => s.type === 'firetower2');
  assert.deepEqual([tower.col, tower.row], [2, 1], 'erupts at the edge of the player area');
  assert.equal(tower.data.phase, 'rise');
  // Dodge up: the pillar slides to row 0 once...
  press(b, 'up');
  assert.ok(runUntil(b, () => tower.row === 0 && tower.data.phase === 'burn', 80));
  // ...then dodge to row 2: it does not follow again.
  run(b, 6);
  press(b, 'down');
  run(b, 12);
  press(b, 'down');
  assert.equal(b.player.row, 2);
  assert.ok(runUntil(b, () => !tower.alive, 200));
  assert.equal(b.player.hp, 999, 'never caught');
  // Staying put after the slide gets burned.
  const b2 = bossBattle('pyreclaw', 1, { player: { maxHp: 999 } });
  toFight(b2);
  b2.moveEntity(b2.player, 0, 1);
  boss(b2).data.forceMove = 'tower';
  assert.ok(runUntil(b2, () => b2.spells.some((s) => s.type === 'firetower2'), 600));
  press(b2, 'up');
  assert.ok(runUntil(b2, () => b2.player.hp < 999, 200));
  assert.equal(b2.player.hp, 999 - 50);
});

test('Pyreclaw Flamethrower steps to its front column first; flinching cuts it off', () => {
  const b = bossBattle('pyreclaw', 1, { player: { maxHp: 999 } });
  toFight(b);
  const e = boss(b);
  b.moveEntity(b.player, 2, 0);
  e.data.forceMove = 'flame';
  assert.ok(runUntil(b, () => e.anim === 'aim', 600));
  assert.deepEqual([e.col, e.row], [3, 0], 'braced at the front, in the player row');
  assert.ok(runUntil(b, () => b.spells.some((s) => s.type === 'flamejet'), 60));
  const jet = b.spells.find((s) => s.type === 'flamejet');
  assert.deepEqual(jet.data.cells, [[2, 0], [1, 0]]);
  assert.ok(runUntil(b, () => b.player.hp < 999, 10));
  // A flinching hit chokes the jet.
  b.applyHit(e, { damage: 10, flinch: true, isChip: true }, null);
  run(b, 1);
  assert.ok(!jet.alive);
});

test('Pyreclaw V2 braziers heal it until destroyed', () => {
  const b = bossBattle('pyreclaw', 2);
  toFight(b);
  const e = boss(b);
  e.data.forceMove = 'brazier';
  e.data.brazierReady = 0;
  assert.ok(runUntil(b, () => pets(b, 'brazier').length === 1, 600));
  const br = pets(b, 'brazier')[0];
  assert.equal(br.element, 'fire');
  e.hp = 1000;
  run(b, 130);
  assert.ok(e.hp > 1000, 'healed');
  b.applyHit(br, { damage: 999 }, null);
  const hp = e.hp;
  run(b, 300);
  assert.ok(e.hp <= hp, 'no more healing');
});

// ------------------------------------------------------------------ objects and win detection

for (const [type, level, petType, force] of [
  ['voltframe', 3, 'neonlamp', 'neon'],
  ['tidecaller', 2, 'coralrock', null],
  ['pyreclaw', 3, 'brazier', 'brazier'],
]) {
  test(`deleting ${type} wins even with its ${petType}s up, and clears them`, () => {
    const b = bossBattle(type, level);
    toFight(b);
    const e = boss(b);
    if (force) e.data.forceMove = force;
    if (type === 'pyreclaw') e.data.brazierReady = 0;
    assert.ok(runUntil(b, () => pets(b, petType).length >= 1, 900));
    // Engine-level check first: a stray object on the blue team never holds the fight open.
    const stray = b.spawnObject({ type: petType, name: 'Stray', col: 0, row: 0, hp: 50, team: TEAM.BLUE });
    b.applyHit(e, { damage: 99999, isChip: true }, null);
    b.step({});
    assert.equal(b.phase, 'win');
    assert.equal(pets(b, petType).filter((p) => p !== stray).length, 0, 'its own objects go with it');
    run(b, 200);
    assert.equal(b.phase, 'results');
    assert.ok(b.result.won);
  });
}

// ------------------------------------------------------------------ robustness

for (const spec of BOSSES) {
  test(`${spec.type}: fuzzed player input at every version never throws`, () => {
    for (const level of LEVELS) {
      const rnd = lcg(level * 977 + spec.type.length);
      const b = makeBattle({
        enemies: [{ type: spec.type, level, col: spec.col, row: spec.row }],
        seed: 31 * level + 5,
        shuffle: true,
        folder: FUZZ_FOLDER,
        player: { maxHp: 3000, attack: 3, rapid: 3, charge: 3 },
        field: level === 4 ? ['..c...', 'i....g', '...x..'] : null,
      });
      let pad = {};
      for (let f = 0; f < 3500 && !b.done; f++) {
        if (b.phase === 'custom') {
          for (let k = 0; k < 3; k++) b.custom.select(Math.floor(rnd() * b.custom.hand.length));
          b.custom.confirm();
        }
        if (f % 3 === 0) {
          pad = {};
          for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'l']) if (rnd() < (k === 'b' ? 0.45 : 0.12)) pad[k] = true;
        }
        b.step(pad);
        b.drainEvents();
        const e = boss(b);
        if (e && e.alive) {
          assert.ok(e.hp >= 0 && e.hp <= e.maxHp);
          assert.ok(e.col >= 0 && e.col < COLS && e.row >= 0 && e.row < 3);
        }
      }
    }
  });
}

for (const spec of BOSSES) {
  test(`${spec.type}: same seed and inputs replay identically`, () => {
    const play = () => {
      const rnd = lcg(4242);
      const b = makeBattle({
        enemies: [{ type: spec.type, level: 3, col: spec.col, row: spec.row }],
        seed: 999,
        shuffle: true,
        folder: FUZZ_FOLDER,
        player: { maxHp: 2000 },
      });
      const log = [];
      let pad = {};
      for (let f = 0; f < 2400 && !b.done; f++) {
        if (b.phase === 'custom') {
          b.custom.select(0);
          b.custom.confirm();
        }
        if (f % 4 === 0) pad = { b: rnd() < 0.4, a: rnd() < 0.05, up: rnd() < 0.08, down: rnd() < 0.08, left: rnd() < 0.05, right: rnd() < 0.05, l: rnd() < 0.02 };
        b.step(pad);
        const ev = b.drainEvents();
        if (f % 50 === 0 || ev.some((x) => x.type === 'hurt')) {
          log.push(`${b.frame}:${b.phase}:${b.player.hp}:${b.entities.map((e) => `${e.type}${e.hp}@${e.col},${e.row}${e.anim}`).join('|')}:${b.spells.map((s) => `${s.type}${s.col},${s.row}`).join('|')}`);
        }
      }
      return log.join('\n');
    };
    const a = play();
    assert.ok(a.length > 1000);
    assert.equal(a, play());
  });
}
