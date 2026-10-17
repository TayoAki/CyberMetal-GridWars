import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAM } from '../src/engine/constants.js';
import { ENEMIES, registerEnemy } from '../src/engine/enemies/index.js';
import { KITS, compositeBoss, kitMove, moveAtTier } from '../src/engine/enemies/bosses/composite.js';
import { dailyRecipe, dayNumber, dayDate, playerFor, LAUNCH } from '../src/daily/recipe.js';
import { dailyBattle, suggestedFolder, FOLDERS } from '../src/daily/fight.js';
import { autopilot } from '../src/game/autopilot.js';
import { makeBattle, toFight } from './helpers.js';

// GridWars Daily: a new boss every day, drawn from the day's number and put together from the eight
// bosses' moves (src/daily/recipe.js, src/engine/enemies/bosses/composite.js).

const DAYS = [...Array(60).keys()].map((i) => i + 1);
const always = (r) => r.moves.filter((id) => !kitMove(id).ok && !kitMove(id).support);

test('day numbers follow the calendar: launch day is #1 wherever the player is', () => {
  assert.equal(dayNumber(new Date(2026, 9, 17, 0, 5)), 1);
  assert.equal(dayNumber(new Date(2026, 9, 17, 23, 55)), 1);
  assert.equal(dayNumber(new Date(2026, 9, 18, 0, 0)), 2);
  assert.equal(dayNumber(new Date(2027, 0, 1, 12)), 77);
  assert.equal(dayDate(1), '2026-10-17');
  assert.equal(dayDate(77), '2027-01-01');
  assert.equal(new Date(LAUNCH).getUTCDay(), 6); // a Saturday
});

test('a day always draws the same boss, and the days differ', () => {
  for (const d of DAYS) assert.deepEqual(dailyRecipe(d), dailyRecipe(d), `day ${d}`);
  const names = new Set(DAYS.map((d) => dailyRecipe(d).name));
  assert.ok(names.size >= 50, `${names.size} names in 60 days`);
  for (let d = 2; d <= 365; d++) assert.notEqual(dailyRecipe(d).element, dailyRecipe(d - 1).element, `days ${d - 1} and ${d}`);
  // Every element and every family's way of moving turns up within the first two months.
  const recipes = DAYS.map(dailyRecipe);
  assert.deepEqual(new Set(recipes.map((r) => r.element)), new Set(['elec', 'fire', 'aqua', 'wood', 'null']));
  assert.deepEqual(new Set(recipes.map((r) => r.mover)), new Set(Object.keys(KITS)));
});

test('the week builds up from V1 on Monday to Omega on Sunday', () => {
  const tiers = DAYS.slice(2, 9).map((d) => [new Date(dayDate(d)).getUTCDay(), dailyRecipe(d).tier]);
  assert.deepEqual(tiers, [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [0, 4]]);
  for (const d of DAYS) {
    const r = dailyRecipe(d);
    assert.ok(r.hp >= [600, 800, 1000, 1200][r.tier - 1] && r.hp <= [720, 960, 1200, 1440][r.tier - 1], `day ${d}: ${r.hp} HP at tier ${r.tier}`);
    assert.equal(r.hp % 50, 0);
  }
});

test('every recipe is playable: its moves exist at its tier, two always have a target, and the name is new', () => {
  const taken = Object.values(KITS).map((k) => k.family.names[0].toLowerCase());
  for (let d = 1; d <= 365; d++) {
    const r = dailyRecipe(d);
    for (const id of r.moves) assert.ok(moveAtTier(id, r.tier), `day ${d}: ${id} exists at tier ${r.tier}`);
    assert.equal(new Set(r.moves).size, r.moves.length, `day ${d}: no move twice`);
    assert.ok(always(r).length >= 2, `day ${d}: ${r.moves.join(' ')}`);
    assert.ok(r.moves.length >= 3 && r.moves.length <= 5, `day ${d}: ${r.moves.length} moves`);
    assert.ok(!taken.includes(r.name.toLowerCase()), `day ${d}: ${r.name}`);
    assert.equal(r.field.length, 3);
    assert.ok(r.field.every((row) => /^[.cgilhm]{6}$/.test(row)), `day ${d}: ${r.field}`);
    assert.ok(FOLDERS.includes(suggestedFolder(r)));
  }
});

// A passive player (it never moves or fires) facing day d's boss.
function passive(r, seed = 11) {
  const b = dailyBattle(r, { seed });
  b.player.maxHp = b.player.hp = 99999;
  toFight(b);
  return b;
}

test('each of the first 60 bosses fights: it hurts a passive player, uses its moves and keeps to its area', () => {
  for (const d of DAYS) {
    const r = dailyRecipe(d);
    const b = passive(r);
    const e = b.entities.find((x) => x.type === r.type);
    assert.equal(e.hp, r.hp);
    assert.equal(e.element, r.element);
    assert.equal(e.name, r.name);
    assert.ok(b.isBossBattle);
    for (let f = 0; f < 3000; f++) {
      b.step({});
      if (e.alive) assert.equal(b.field.ownerAt(e.col, e.row), e.team, `day ${d}: ${r.name} stays in its area (frame ${f}, at ${e.col},${e.row})`);
    }
    assert.ok(b.player.hp < b.player.maxHp, `day ${d}: ${r.name} dealt damage`);
    const used = Object.keys(e.data.picks);
    assert.ok(used.length >= 2, `day ${d}: ${r.name} used ${used.join(', ')}`);
    assert.ok(used.every((id) => r.moves.includes(id)));
  }
});

test('every move of every family plays inside a mixed boss, at every tier it exists', () => {
  for (const [fam, kit] of Object.entries(KITS)) {
    const base = Object.entries(kit.moves).filter(([, m]) => !m.has && !m.ok && !m.support).map(([k]) => `${fam}.${k}`);
    for (const key of Object.keys(kit.moves)) {
      const id = `${fam}.${key}`;
      for (let tier = 1; tier <= 4; tier++) {
        if (!moveAtTier(id, tier)) continue;
        // Moved by another family, so a move never relies on its own family's mover.
        const mover = fam === 'sabre' ? 'feralis' : 'sabre';
        const type = `mix_${fam}_${key}_${tier}`;
        registerEnemy(compositeBoss({ type, name: 'Mix', tier, hp: 5000, element: 'null', mover, moves: [...new Set([id, ...base])] }));
        const b = makeBattle({ enemies: [{ type, level: tier, col: 4, row: 1 }], player: { maxHp: 99999 }, seed: 3 + tier });
        toFight(b);
        const e = b.entities.find((x) => x.type === type);
        let n = 0;
        for (let f = 0; f < 2400 && !(e.data.picks[id] >= 1); f++) {
          // Ask for it before each pick; a move that needs a moment (coral, braziers) waits for its chance.
          if (!e.data.forceMove && !kitMove(id).due) e.data.forceMove = id;
          b.step({});
          n = f;
        }
        if (kitMove(id).opener) assert.ok(e.data.picks[id] >= 1, `${id} T${tier} opens the fight`);
        else assert.ok(e.data.picks[id] >= 1, `${id} T${tier} was played (${n} frames)`);
        for (let f = 0; f < 600; f++) b.step({});
        assert.ok(e.alive);
      }
    }
  }
});

test('a riposte answers with the guard\'s own Wide Slash, and a flinch cancels a flamethrower', () => {
  registerEnemy(compositeBoss({ type: 'mix_guard', name: 'Mix', tier: 4, hp: 5000, element: 'null', mover: 'sabre', moves: ['sabre.wide', 'pyreclaw.flame', 'pyreclaw.tower'] }));
  let ripostes = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const b = makeBattle({ enemies: [{ type: 'mix_guard', level: 4, col: 4, row: 1 }], player: { maxHp: 99999, rapid: 5 }, seed });
    toFight(b);
    const e = b.entities.find((x) => x.type === 'mix_guard');
    const moves = [];
    b.drainEvents();
    for (let f = 0; f < 2400; f++) {
      b.step(f % 8 < 2 ? { b: true } : {}); // keep shooting: the guard goes up and answers
      for (const ev of b.drainEvents()) if (ev.type === 'bossmove') moves.push(ev.move);
      if (e.data.jet && f % 97 === 0) {
        b.flinch(e);
        assert.equal(e.data.jet, null);
      }
    }
    ripostes += e.data.picks['sabre.wide'] ?? 0;
    assert.ok(moves.length > 3);
  }
  assert.ok(ripostes > 0);
});

test('fights are deterministic: the same day, seed and inputs give the same battle', () => {
  for (const d of [1, 2, 9]) {
    const r = dailyRecipe(d);
    const play = () => {
      const b = dailyBattle(r, { seed: 5 });
      const bot = autopilot();
      for (let f = 0; f < 3000 && !b.done; f++) b.step(bot(b));
      const e = b.entities.find((x) => x.type === r.type);
      return [b.frame, b.player.hp, e?.hp ?? 0, JSON.stringify(e?.data.picks ?? {})];
    };
    assert.deepEqual(play(), play());
  }
});

test('the autopilot beats nearly every day, and the bosses hit harder as the week goes on', () => {
  const byTier = { 1: [], 2: [], 3: [], 4: [] };
  for (const d of DAYS.slice(0, 28)) {
    const r = dailyRecipe(d);
    for (const seed of [1, 2]) {
      const b = dailyBattle(r, { seed });
      const bot = autopilot();
      for (let f = 0; f < 20000 && !b.done; f++) b.step(bot(b));
      assert.ok(b.done, `day ${d} seed ${seed}: over within 20000 frames (boss at ${b.entities.find((x) => x.type === r.type)?.hp})`);
      byTier[r.tier].push(b.result.won ? b.player.hp / b.player.maxHp : -1);
    }
  }
  const wins = (t) => byTier[t].filter((x) => x >= 0);
  const rate = (t) => wins(t).length / byTier[t].length;
  const left = (t) => wins(t).reduce((a, x) => a + x, 0) / Math.max(1, wins(t).length);
  const report = JSON.stringify(Object.keys(byTier).map((t) => [t, rate(t).toFixed(2), left(t).toFixed(2)]));
  assert.ok(rate(1) >= 0.9, `V1 ${report}`);
  assert.ok(rate(4) >= 0.5, `Ω can be beaten ${report}`);
  assert.ok(left(4) < left(1) - 0.2, `Ω costs more HP than V1 ${report}`);
});

test('the player\'s navi grows with the tier', () => {
  for (let t = 2; t <= 4; t++) assert.ok(playerFor(t).maxHp > playerFor(t - 1).maxHp);
  assert.ok(ENEMIES.voltframe, 'the Gauntlet bosses are untouched');
});

test('ally checks: blue bodies other than the boss are its pets, on its team', () => {
  for (const d of DAYS.slice(0, 20)) {
    const r = dailyRecipe(d);
    const b = passive(r, 21);
    for (let f = 0; f < 2500; f++) b.step({});
    for (const x of b.entities) if (x.team === TEAM.BLUE && x.type !== r.type) assert.equal(x.kind, 'object', `day ${d}: ${x.type}`);
  }
});
