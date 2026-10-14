import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEL, TEAM } from '../src/engine/constants.js';
import { Rng } from '../src/engine/rng.js';
import { source } from '../src/engine/combat.js';
import { ENEMIES } from '../src/engine/enemies/index.js';
import { FAMILIES } from '../src/engine/enemies/pack_a.js';
import { makeBattle, folderOf, run, toFight, pickAndFight, press, enemy } from './helpers.js';

// Virus pack A: Emberhound (Spikey), Volthare (Bunny), Mortarshell (HardHead), Gloop (Jelly),
// Bombeetle (Beetle).

const EXPECT = {
  emberhound: { mirrors: 'Spikey', hp: [90, 140, 190, 260], element: ['fire', 'fire', 'fire', 'fire'] },
  volthare: { mirrors: 'Bunny', hp: [40, 100, 160, 220], element: ['elec', 'elec', 'elec', 'elec'] },
  mortarshell: { mirrors: 'HardHead', hp: [80, 120, 200, 300], element: ['null', 'aqua', 'fire', 'null'] },
  gloop: { mirrors: 'Jelly', hp: [170, 220, 270, 370], element: ['aqua', 'fire', 'wood', 'aqua'] },
  bombeetle: { mirrors: 'Beetle', hp: [90, 130, 170, 220], element: ['null', 'null', 'null', 'null'] },
};
const TYPES = Object.keys(EXPECT);
const BIG_HP = { maxHp: 99999 }; // keep the player alive through long soaks

// Run until pred() holds (or `limit` frames pass); returns the frames taken, or -1.
function until(b, pred, limit = 1500, pad = {}) {
  for (let n = 0; n < limit; n++) {
    if (pred()) return n;
    b.step(pad);
  }
  return pred() ? limit : -1;
}

// Distinct spells of `type` seen while running `frames` frames.
function spellsSeen(b, type, frames) {
  const ids = new Set();
  for (let i = 0; i < frames; i++) {
    b.step({});
    for (const s of b.spells) if (s.type === type) ids.add(s.id);
  }
  return ids.size;
}

test('pack A registers five families with BN3 stat-table HP and elements', () => {
  assert.deepEqual(FAMILIES.map((f) => f.type).sort(), [...TYPES].sort());
  for (const fam of FAMILIES) {
    const want = EXPECT[fam.type];
    assert.equal(ENEMIES[fam.type], fam, `${fam.type} registered`);
    assert.equal(fam.kind, 'virus');
    assert.equal(fam.mirrors, want.mirrors);
    assert.equal(fam.names.length, 4);
    assert.equal(fam.levels.length, 4);
    for (const n of fam.names) assert.ok([...n].length <= 10, `${n} fits 10 chars`);
    // Attack climbs with the level: gentle at 1, fierce at Ω.
    for (let i = 1; i < 4; i++) assert.ok(fam.levels[i].attack > fam.levels[i - 1].attack, `${fam.type} attack rises`);
    assert.ok(fam.levels[0].attack <= 30 && fam.levels[3].attack >= 80, `${fam.type} attack range`);
  }
});

test('every family spawns at every level with the right HP, element and name', () => {
  for (const type of TYPES) {
    for (let level = 1; level <= 4; level++) {
      const b = makeBattle({ enemies: [{ type, level, col: 4, row: 1 }] });
      const e = enemy(b, type);
      const i = level - 1;
      assert.equal(e.hp, EXPECT[type].hp[i], `${type} L${level} hp`);
      assert.equal(e.maxHp, EXPECT[type].hp[i]);
      assert.equal(e.element, EXPECT[type].element[i], `${type} L${level} element`);
      assert.equal(e.level, level);
      assert.equal(e.name, ENEMIES[type].names[i]);
      assert.equal(e.stats.level, level);
      assert.ok(e.stats.attack > 0);
    }
  }
});

test('every family at every level hits a player who stands in its row, stays in its area, never throws', () => {
  for (const type of TYPES) {
    for (let level = 1; level <= 4; level++) {
      for (const seed of [3, 17]) {
        const b = makeBattle({ enemies: [{ type, level, col: 4, row: 1 }], seed, player: BIG_HP });
        toFight(b);
        const e = enemy(b, type);
        let damagedAt = -1;
        for (let f = 0; f < 1500; f++) {
          b.step({});
          if (damagedAt < 0 && b.stats.damageTaken > 0) damagedAt = f;
          assert.equal(b.field.ownerAt(e.col, e.row), TEAM.BLUE, `${type} L${level} left its area`);
          assert.ok(e.alive, `${type} L${level} died on its own`);
        }
        assert.ok(damagedAt >= 0, `${type} L${level} seed ${seed} never hurt the player`);
        assert.ok(b.stats.hitsTaken > 0);
      }
    }
  }
});

test('every family opens a counter window while winding up', () => {
  for (const type of TYPES) {
    for (const level of [1, 4]) {
      const b = makeBattle({ enemies: [{ type, level, col: 4, row: 1 }], seed: 5, player: BIG_HP });
      toFight(b);
      const e = enemy(b, type);
      assert.ok(until(b, () => e.counterWindow > 0, 1200) >= 0, `${type} L${level} never wound up`);
      assert.equal(e.anim, 'windup');
    }
  }
});

test('a counter hit during the Emberhound wind-up staggers it and cancels the shot', () => {
  const b = makeBattle({ enemies: [{ type: 'emberhound', level: 1, col: 4, row: 1 }], folder: folderOf('cannon:A'), seed: 8, player: BIG_HP });
  pickAndFight(b, [0]);
  const e = enemy(b, 'emberhound');
  // Follow the hound so the cannon lines up when it rears back.
  assert.ok(until(b, () => { b.player.row = e.row; return e.counterWindow > 8; }, 1200) >= 0);
  press(b, 'a');
  run(b, 12);
  assert.equal(b.stats.counters, 1);
  assert.equal(e.hp, 90 - 40);
  assert.ok(!b.spells.some((s) => s.type === 'emberball'));
});

test('Emberhound: fire projectile down its row; the Ω hound spits two per volley', () => {
  const b = makeBattle({ enemies: [{ type: 'emberhound', level: 1, col: 4, row: 1 }], seed: 2, player: BIG_HP });
  toFight(b);
  assert.ok(until(b, () => b.spells.some((s) => s.type === 'emberball')) >= 0);
  const shot = b.spells.find((s) => s.type === 'emberball');
  assert.equal(shot.hit.element, 'fire');
  assert.ok(shot.hit.flinch);
  assert.equal(shot.row, enemy(b, 'emberhound').row);
  assert.equal(shot.dir, -1);

  const b4 = makeBattle({ enemies: [{ type: 'emberhound', level: 4, col: 4, row: 1 }], seed: 2, player: BIG_HP });
  toFight(b4);
  const h = enemy(b4, 'emberhound');
  assert.ok(until(b4, () => h.anim === 'fire') >= 0);
  assert.equal(spellsSeen(b4, 'emberball', 30) + 0, 2);
});

test("Volthare's slow ring paralyzes without a flinch", () => {
  for (const level of [1, 4]) {
    const b = makeBattle({ enemies: [{ type: 'volthare', level, col: 4, row: 1 }], seed: 5, player: BIG_HP });
    toFight(b);
    const stun = ENEMIES.volthare.levels[level - 1].stun;
    assert.ok(stun >= 60 && stun <= 90);
    assert.ok(until(b, () => b.player.stunTimer > 0) >= 0, `L${level} never paralyzed`);
    assert.ok(b.player.stunTimer > stun - 5 && b.player.stunTimer <= stun);
    assert.equal(b.player.flinchTimer, 0);
    assert.equal(b.player.iframes, 0);
    assert.equal(b.stats.damageTaken, ENEMIES.volthare.levels[level - 1].attack);
    // Paralyzed: the navi can't step.
    const row = b.player.row;
    press(b, 'up');
    press(b, 'down');
    assert.equal(b.player.row, row);
  }
});

test('Mortarshell takes no damage while closed, blocks shots, and is hittable once open', () => {
  const b = makeBattle({
    enemies: [
      { type: 'mortarshell', level: 1, col: 4, row: 1 },
      { type: 'bombeetle', level: 1, col: 5, row: 1 },
    ],
    folder: folderOf('cannon:A'),
    seed: 4,
    player: BIG_HP,
  });
  pickAndFight(b, [0]);
  const m = enemy(b, 'mortarshell');
  const beetle = enemy(b, 'bombeetle');
  assert.ok(m.data.closed);
  b.drainEvents();
  press(b, 'a'); // Cannon: stopped by the shell, the beetle behind is untouched
  run(b, 30);
  assert.equal(m.hp, 80);
  assert.equal(beetle.hp, 90);
  assert.ok(b.drainEvents().some((ev) => ev.type === 'fx' && ev.fx === 'guard'));
  for (let i = 0; i < 6; i++) {
    press(b, 'b');
    run(b, 14);
  }
  assert.equal(m.hp, 80);
  assert.equal(beetle.hp, 90);
  // Straight through the hit pipeline: connects (so it stops projectiles) but is blocked.
  const hit = { damage: 500, flinch: true, stun: 90, isChip: true };
  const res = b.applyHit(m, hit, source(b.player, hit));
  assert.ok(res.connected && res.blocked);
  assert.equal(m.hp, 80);
  assert.equal(m.stunTimer, 0);
  assert.equal(m.flinchTimer, 0);

  // Wait for it to open: now it is vulnerable (and a counter window is up while it opens).
  assert.ok(until(b, () => !m.data.closed, 600) >= 0);
  assert.ok(m.counterWindow > 0);
  const hit2 = { damage: 10 };
  b.applyHit(m, hit2, source(b.player, hit2));
  assert.equal(m.hp, 70);
  // ...and it shuts again afterwards.
  assert.ok(until(b, () => m.data.closed, 600) >= 0);
  b.applyHit(m, hit2, source(b.player, hit2));
  assert.equal(m.hp, 70);
});

test('Mortarshell mortars land on the player panel: break / ice / lava / plus blast', () => {
  const marks = [];
  for (let level = 1; level <= 4; level++) {
    const b = makeBattle({ enemies: [{ type: 'mortarshell', level, col: 4, row: 1 }], seed: 9, player: BIG_HP });
    toFight(b);
    b.player.row = 2;
    assert.ok(until(b, () => b.spells.some((s) => s.type === 'mortarball'), 900) >= 0);
    const ball = b.spells.find((s) => s.type === 'mortarball');
    assert.deepEqual(ball.data.target, { col: 1, row: 2 });
    // Step out of the way after the throw: the empty landing panel takes the full effect.
    b.player.row = 0;
    assert.ok(until(b, () => !ball.alive, 120) >= 0);
    marks.push(b.field.typeAt(1, 2));
    if (level === 4) {
      // Only the centre breaks; the plus around it is blast damage, not field damage.
      assert.equal(b.field.typeAt(1, 2), PANEL.BROKEN);
      assert.equal(b.field.typeAt(0, 2), PANEL.NORMAL);
      assert.equal(b.field.typeAt(2, 2), PANEL.NORMAL);
      assert.equal(b.field.typeAt(1, 1), PANEL.NORMAL);
      assert.equal(ball.data.landing?.length ?? 5, 5);
    }
    assert.equal(b.stats.damageTaken, 0);
  }
  assert.deepEqual(marks, [PANEL.BROKEN, PANEL.ICE, PANEL.LAVA, PANEL.BROKEN]);
});

test("Mortarshell's ice thaws and its lava cools back to normal panels", () => {
  for (const [level, type, frames] of [[2, PANEL.ICE, 480], [3, PANEL.LAVA, 300]]) {
    const b = makeBattle({ enemies: [{ type: 'mortarshell', level, col: 4, row: 1 }], seed: 9, player: BIG_HP });
    toFight(b);
    b.player.row = 2;
    assert.ok(until(b, () => b.spells.some((s) => s.type === 'mortarball'), 900) >= 0);
    const ball = b.spells.find((s) => s.type === 'mortarball');
    b.player.row = 0; // every later shell lands on row 0
    assert.ok(until(b, () => !ball.alive, 120) >= 0);
    assert.equal(b.field.typeAt(1, 2), type);
    const mark = b.spells.find((s) => s.type === 'mortarmark' && s.col === 1 && s.row === 2);
    assert.ok(mark && mark.hit === null);
    run(b, frames - 10);
    assert.equal(b.field.typeAt(1, 2), type, `L${level} mark still there just before it fades`);
    run(b, 15);
    assert.equal(b.field.typeAt(1, 2), PANEL.NORMAL, `L${level} mark faded`);
  }
});

test('the Lv3 Mortarshell keeps at most 2 lava panels on the player side', () => {
  const b = makeBattle({ enemies: [{ type: 'mortarshell', level: 3, col: 4, row: 1 }], seed: 13, player: BIG_HP });
  toFight(b);
  const lavaCount = () => {
    let n = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (b.field.typeAt(c, r) === PANEL.LAVA) n++;
    return n;
  };
  let landed = 0;
  let maxLava = 0;
  // Hop the player to a fresh panel after every throw so each shell lands on an empty one.
  const tour = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2], [1, 1]];
  for (let f = 0; f < 3600 && landed < 7; f++) {
    const ball = b.spells.find((s) => s.type === 'mortarball');
    if (ball && ball.t === 1) {
      const [c, r] = tour[landed % tour.length];
      b.player.col = c === ball.data.target.col && r === ball.data.target.row ? (c + 1) % 3 : c;
      b.player.row = r;
      landed++;
    }
    b.step({});
    maxLava = Math.max(maxLava, lavaCount());
  }
  assert.ok(landed >= 5);
  assert.equal(maxLava, 2);
});

test('Gloop is untargetable while sunk and resurfaces at the front of the player row', () => {
  const b = makeBattle({ enemies: [{ type: 'gloop', level: 1, col: 5, row: 0 }], seed: 6, player: BIG_HP });
  toFight(b);
  const g = enemy(b, 'gloop');
  b.player.row = 2;
  assert.ok(until(b, () => g.hidden, 600) >= 0);
  assert.ok(!g.targetable);
  const hit = { damage: 50, flinch: true, isChip: true };
  const res = b.applyHit(g, hit, source(b.player, hit));
  assert.ok(!res.connected);
  assert.equal(g.hp, 170);
  // Shots pass over the puddle.
  assert.equal(b.firstTarget(TEAM.RED, 2, g.row, 1), null);
  // A bubbling marker telegraphs where it comes up.
  assert.ok(until(b, () => b.spells.some((s) => s.type === 'gloopbubble'), 300) >= 0);
  assert.ok(until(b, () => !g.hidden, 300) >= 0);
  assert.equal(g.row, 2);
  assert.equal(g.col, 3);
  assert.ok(g.targetable);
  // The wave rolls down the row with Gloop's element.
  assert.ok(until(b, () => b.spells.some((s) => s.type === 'gloopwave'), 300) >= 0);
  assert.equal(b.spells.find((s) => s.type === 'gloopwave').hit.element, 'aqua');
});

test('Gloop surfaces anywhere free when the front panel is taken, and a flinch unhides it', () => {
  const b = makeBattle({
    enemies: [
      { type: 'gloop', level: 2, col: 5, row: 0 },
      { type: 'mortarshell', level: 1, col: 3, row: 1 },
    ],
    seed: 12,
    player: BIG_HP,
  });
  toFight(b);
  const g = enemy(b, 'gloop');
  assert.ok(until(b, () => g.hidden, 600) >= 0);
  assert.ok(until(b, () => !g.hidden, 600) >= 0);
  assert.ok(!(g.col === 3 && g.row === 1));
  assert.equal(b.field.ownerAt(g.col, g.row), TEAM.BLUE);
  // Hit it on the surface with a flinching blow: the AI restarts visible.
  const hit = { damage: 10, flinch: true };
  b.applyHit(g, hit, source(b.player, hit));
  assert.ok(!g.hidden && g.flinchTimer > 0 && g.anim === 'hurt');
});

test('Bombeetle volleys: one bomb, a plus blast, two bombs, three faster bombs', () => {
  const counts = [];
  const blasts = [];
  for (let level = 1; level <= 4; level++) {
    const b = makeBattle({ enemies: [{ type: 'bombeetle', level, col: 4, row: 1 }], seed: 21, player: BIG_HP });
    toFight(b);
    const e = enemy(b, 'bombeetle');
    assert.ok(until(b, () => e.anim === 'fire', 900) >= 0);
    b.drainEvents();
    counts.push(spellsSeen(b, 'beetlebomb', 20));
    // Count explosions when the volley lands.
    run(b, 40);
    blasts.push(b.drainEvents().filter((ev) => ev.type === 'fx' && ev.fx === 'explosion').length);
  }
  assert.deepEqual(counts, [1, 1, 2, 3]);
  assert.deepEqual(blasts, [1, 5, 2, 3]);
  assert.ok(ENEMIES.bombeetle.levels[3].flight < ENEMIES.bombeetle.levels[0].flight);
});

const FUZZ_FOLDER = folderOf(
  'cannon:A', 'cannon:B', 'sword:E', 'widesword:E', 'minibomb:B', 'shotgun:B', 'zapring1:A', 'icewave1:A',
  'lavacan1:A', 'areagrab:E', 'panlout1:A', 'panlout3:C', 'rockcube:A', 'recov30:B', 'shockwave:D', 'hammer:B',
  'airshot1:*', 'tornado:C', 'boomer1:F', 'guard:*', 'barrier:C', 'aura:F', 'wind:A', 'fan:A', 'rndmetr:E',
  'geddon1:D', 'icestage:C', 'lavastage:A', 'dashatk:C', 'mine:A',
);

function fuzzBattle(seed, frames, onFrame = null) {
  const r = new Rng(seed * 7919 + 1);
  const n = 1 + r.int(3);
  const spots = r.shuffle([[3, 0], [3, 1], [3, 2], [4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2]]);
  const enemies = [];
  for (let i = 0; i < n; i++) enemies.push({ type: r.pick(TYPES), level: 1 + r.int(4), col: spots[i][0], row: spots[i][1] });
  const b = makeBattle({ enemies, folder: FUZZ_FOLDER, seed, shuffle: true, player: { maxHp: 2000 } });
  const keys = ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r'];
  let pad = {};
  for (let f = 0; f < frames && !b.done; f++) {
    if (b.phase === 'custom') {
      // Pick a few chips at random, then OK.
      for (let k = 0; k < 3; k++) b.custom.select(r.int(b.custom.hand.length + 1));
      b.custom.confirm();
    }
    if (r.chance(0.3)) {
      pad = {};
      for (const k of keys) if (r.chance(0.12)) pad[k] = true;
    }
    b.step(pad);
    onFrame?.(b, f);
  }
  return b;
}

test('fuzz: random pack-A mixes and random inputs run thousands of frames without breaking invariants', () => {
  for (let seed = 1; seed <= 12; seed++) {
    fuzzBattle(seed, 3000, (b) => {
      const seen = new Set();
      for (const e of b.entities) {
        if (!e.alive || e.removed) continue;
        const key = `${e.col},${e.row}`;
        assert.ok(!seen.has(key), `seed ${seed}: two bodies on ${key}`);
        seen.add(key);
        assert.ok(e.hp >= 0 && e.hp <= e.maxHp);
        if (e.kind === 'virus') {
          assert.ok(e.col >= 0 && e.col < 6 && e.row >= 0 && e.row < 3);
          assert.equal(b.field.ownerAt(e.col, e.row), e.team, `seed ${seed}: ${e.type} outside its area`);
        }
      }
    });
  }
});

test('determinism: the same seed and inputs replay the same pack-A battle', () => {
  const play = (seed) => {
    const log = [];
    fuzzBattle(seed, 2500, (b, f) => {
      if (f % 50 === 0) {
        log.push(`${b.frame}:${b.phase}:${b.player.hp}@${b.player.col},${b.player.row}:` +
          b.entities.map((e) => `${e.type}${e.hp}@${e.col},${e.row}:${e.anim}${e.hidden ? 'h' : ''}`).join('|') + ':' +
          b.spells.map((s) => `${s.type}@${s.col},${s.row}`).join('|') + ':' +
          b.field.snapshot().map((row) => row.map((p) => p.type[0]).join('')).join('/'));
      }
    });
    return log.join('\n');
  };
  for (const seed of [5, 99]) {
    const a = play(seed);
    assert.equal(a, play(seed));
    assert.ok(a.length > 1000);
  }
  assert.notEqual(play(5), play(6));
});

// ---------------------------------------------------------------- sprites (no DOM: a stub canvas)

function stubCtx(counter) {
  return new Proxy({ globalAlpha: 1, fillStyle: '#000', globalCompositeOperation: 'source-over' }, {
    get(t, k) {
      if (k in t) return t[k];
      return (...args) => {
        if (k === 'drawImage') counter.images++;
        return k === 'getContext' ? stubCtx(counter) : undefined;
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

test('pack A sprites draw every family, level, anim and facing (and bare stubs) without throwing', async () => {
  const counter = { images: 0 };
  globalThis.OffscreenCanvas ??= class {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return stubCtx(counter);
    }
  };
  const { ENTITY_SPRITES, SPELL_SPRITES } = await import('../src/render/sprites/viruses_a.js');
  const ctx = stubCtx(counter);
  const families = ['rivet', 'plinker', 'dartfin', ...TYPES];
  for (const type of families) assert.ok(ENTITY_SPRITES[type], `${type} has a sprite`);
  const anims = ['idle', 'move', 'windup', 'aim', 'swing', 'fire', 'dash', 'hurt', 'sink', 'rise', 'open', 'close', 'mystery'];
  for (const type of families) {
    for (const level of [1, 2, 3, 4]) {
      for (const anim of anims) {
        for (const animT of [0, 4, 9, 13, 30]) {
          for (const facing of [1, -1]) {
            const before = counter.images;
            // The shape the contact sheet passes: no stats, empty data.
            const e = { type, anim, animT, facing, level, team: facing > 0 ? 'red' : 'blue', element: 'null', data: {}, hp: 100, maxHp: 100, z: 0, offsetX: 0, offsetY: 0, alive: true };
            ENTITY_SPRITES[type].draw(ctx, e, 120, 100, 30 + animT);
            assert.ok(counter.images > before, `${type} L${level} ${anim}@${animT} drew nothing`);
          }
        }
      }
    }
    ENTITY_SPRITES[type].draw(ctx, {}, 0, 0); // a bare object and no clock
  }
  const spells = ['emberball', 'voltring', 'mortarball', 'beetlebomb', 'gloopwave', 'gloopbubble'];
  for (const type of spells) {
    assert.ok(SPELL_SPRITES[type], `${type} has a sprite`);
    for (const s of [{}, { data: {} }, { t: 20, z: 30, dir: 1, element: 'fire', data: { level: 4, target: { col: 1, row: 2 }, landing: [[1, 2], [0, 2], [2, 2]], progress: 0.5 } }]) {
      SPELL_SPRITES[type].draw(ctx, { type, ...s }, 60, 90, 11);
    }
  }
});
