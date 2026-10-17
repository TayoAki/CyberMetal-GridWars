import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMING, PANEL, TEAM } from '../src/engine/constants.js';
import { compatible, resolveQueue } from '../src/engine/custom.js';
import { registerEnemy } from '../src/engine/enemies/index.js';
import { makeBattle, folderOf, run, toCustom, toFight, pickAndFight, press, enemy } from './helpers.js';
import { wait } from '../src/engine/combat.js';

// A punching bag for rules tests: big HP, never acts.
registerEnemy({
  type: 'dummy',
  kind: 'virus',
  names: ['Dummy', 'Dummy', 'Dummy', 'Dummy'],
  hp: [1000, 1000, 1000, 1000],
  element: ['null', 'fire', 'aqua', 'wood'],
  *ai() {
    for (;;) yield;
  },
});
registerEnemy({
  type: 'dummynavi',
  kind: 'navi',
  names: ['DummyNavi'],
  hp: [500, 500, 500, 500],
  element: 'null',
  *ai() {
    for (;;) yield* wait(100);
  },
});

const C = (key, code) => ({ key, code });

test('intro runs, then the Custom Screen opens', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], folder: folderOf('cannon:A') });
  run(b, TIMING.INTRO - 1);
  assert.equal(b.phase, 'intro');
  b.step({});
  assert.equal(b.phase, 'custom');
  assert.equal(b.custom.hand.length, 1);
});

test('selection rule: same chip, or one shared code with * wild', () => {
  assert.ok(compatible([C('cannon', 'A'), C('cannon', 'B')]));
  assert.ok(compatible([C('cannon', 'A'), C('sword', 'A')]));
  assert.ok(compatible([C('cannon', 'A'), C('atk10', '*')]));
  assert.ok(!compatible([C('cannon', 'A'), C('cannon', 'B'), C('atk10', '*')]));
  assert.ok(compatible([C('cannon', '*'), C('sword', 'E')]));
  assert.ok(!compatible([C('cannon', '*'), C('sword', 'E'), C('minibomb', 'B')]));
  assert.ok(!compatible([C('cannon', 'A'), C('sword', 'E')]));
});

test('custom screen enforces the rule and the 5-chip cap', () => {
  const b = makeBattle({
    enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }],
    folder: folderOf('cannon:A', 'sword:E', 'cannon:B', 'atk10:*', 'minibomb:B'),
  });
  toCustom(b);
  assert.ok(b.custom.select(0)); // Cannon A
  assert.ok(!b.custom.canSelect(1)); // Sword E: different chip, different code
  assert.ok(b.custom.select(2)); // Cannon B: same chip
  assert.ok(!b.custom.canSelect(3)); // Atk+10 *: codes A,B already mixed
  assert.ok(b.custom.deselectLast());
  assert.ok(b.custom.select(3)); // now Cannon A + Atk+10 *
});

test('program advance: Cannon A,B,C fuses into Cannonade; order and codes matter', () => {
  const pa = resolveQueue([C('cannon', 'A'), C('cannon', 'B'), C('cannon', 'C')]);
  assert.equal(pa.pa?.key, 'cannonade1');
  assert.equal(pa.queue.length, 1);
  assert.equal(resolveQueue([C('cannon', 'C'), C('cannon', 'B'), C('cannon', 'A')]).pa, null);
  assert.equal(resolveQueue([C('cannon', 'A'), C('cannon', 'C'), C('cannon', 'D')]).pa, null);
  const life = resolveQueue([C('sword', 'E'), C('widesword', 'E'), C('longsword', 'E')]);
  assert.equal(life.pa?.key, 'lifesaber');
  assert.equal(life.queue[0].damage, 400);
});

test('boost chips fold into the chip before them', () => {
  const q = resolveQueue([C('cannon', 'A'), C('atk10', '*'), C('atk10', '*')]).queue;
  assert.equal(q.length, 1);
  assert.equal(q[0].damage, 60);
  assert.equal(resolveQueue([C('atk10', '*'), C('cannon', 'A')]).queue[0].damage, 40); // nothing before it: wasted
  assert.equal(resolveQueue([C('cannon', 'A'), C('fire30', '*')]).queue[0].damage, 40); // Cannon is not Fire
  assert.equal(resolveQueue([C('heatshot', 'B'), C('fire30', '*')]).queue[0].damage, 70);
  assert.equal(resolveQueue([C('voltframe1', 'V'), C('navi20', '*')]).queue[0].damage, 70);
});

test('buster deals attack-level damage to the first body in the row', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], player: { attack: 3 } });
  toFight(b);
  const d = enemy(b, 'dummy');
  press(b, 'b');
  assert.equal(d.hp, 997);
  assert.equal(d.flinchTimer, 0); // buster does not flinch
  b.player.row = 0; // out of the row: miss
  run(b, 20);
  press(b, 'b');
  assert.equal(d.hp, 997);
});

test('charge shot: hold B for the charge time, release for 10x attack, flinches', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }] });
  toFight(b);
  const d = enemy(b, 'dummy');
  const hold = TIMING.CHARGE_START + TIMING.CHARGE_TIME[1];
  run(b, hold, { b: true });
  assert.equal(b.controller.chargeState, 2);
  b.step({});
  assert.equal(d.hp, 1000 - 1 - 10); // tap shot on press + charge shot on release
  assert.ok(d.flinchTimer > 0);
  // Releasing early fires nothing extra.
  const b2 = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }] });
  toFight(b2);
  run(b2, hold - 5, { b: true });
  b2.step({});
  assert.equal(enemy(b2, 'dummy').hp, 999);
});

test('chips: Cannon hits for 40, elements double, boosts carry into battle', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], folder: folderOf('cannon:A', 'atk10:*') });
  pickAndFight(b, [0, 1]);
  assert.equal(b.controller.chips.length, 1);
  assert.equal(b.controller.chips[0].damage, 50);
  const d = enemy(b, 'dummy');
  press(b, 'a');
  run(b, 30);
  assert.equal(d.hp, 950);

  // AquaSwrd (Aqua) against a Fire body: double damage.
  const b2 = makeBattle({ enemies: [{ type: 'dummy', level: 2, col: 3, row: 1 }], folder: folderOf('aquasword:A') });
  pickAndFight(b2, [0]);
  b2.player.col = 2;
  press(b2, 'a');
  run(b2, 30);
  assert.equal(enemy(b2, 'dummy').hp, 1000 - 300);
});

test('Rivet shockwave crawls down the row and hits; i-frames follow a flinch', () => {
  const b = makeBattle({ enemies: [{ type: 'rivet', level: 1, col: 4, row: 1 }], seed: 3 });
  toFight(b);
  let n = 0;
  while (b.player.hp === 100 && n++ < 600) b.step({});
  assert.equal(b.player.hp, 90);
  assert.ok(b.player.iframes > 0);
  assert.equal(b.stats.hitsTaken, 1);
});

test('the shockwave stops at a hole', () => {
  const b = makeBattle({ enemies: [{ type: 'rivet', level: 1, col: 4, row: 1 }], seed: 3, field: ['......', '..x...', '......'] });
  toFight(b);
  run(b, 600);
  assert.equal(b.player.hp, 100);
});

test('Custom Gauge fills in GAUGE_FULL fight frames; L opens the Custom Screen', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], folder: folderOf('cannon:A', 'cannon:B') });
  toFight(b);
  run(b, TIMING.GAUGE_FULL - 2);
  b.step({ l: true }); // fight frame GAUGE_FULL - 1: not full yet, L does nothing
  assert.ok(!b.gaugeFull);
  assert.equal(b.phase, 'fight');
  b.step({});
  assert.ok(b.gaugeFull); // full on fight frame GAUGE_FULL
  press(b, 'l');
  assert.equal(b.phase, 'custom');
  assert.equal(b.turn, 2);
});

test('AreaGrab steals the enemy front column; an occupied panel is hit instead', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 3, row: 1 }], folder: folderOf('areagrab:L') });
  pickAndFight(b, [0]);
  press(b, 'a');
  run(b, 40);
  assert.equal(b.field.ownerAt(3, 0), TEAM.RED);
  assert.equal(b.field.ownerAt(3, 2), TEAM.RED);
  assert.equal(b.field.ownerAt(3, 1), TEAM.BLUE);
  assert.equal(enemy(b, 'dummy').hp, 990);
  // Stolen panels return after AREA_RETURN once empty.
  run(b, TIMING.AREA_RETURN);
  assert.equal(b.field.ownerAt(3, 0), TEAM.BLUE);
});

test('stolen panels never strand the player deep in the enemy area: their way back stays until they have used it', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 5, row: 0 }] });
  toFight(b);
  // Two AreaGrabs, 300 frames apart, and the player walks two columns deep.
  for (let r = 0; r < 3; r++) b.field.steal(3, r, TEAM.RED);
  run(b, 300);
  for (let r = 0; r < 3; r++) b.field.steal(4, r, TEAM.RED);
  b.moveEntity(b.player, 4, 1);
  run(b, TIMING.AREA_RETURN - 300);
  // The first column's time is up: its other rows go back, but the player's row stays theirs.
  assert.deepEqual([0, 1, 2].map((r) => b.field.ownerAt(3, r)), [TEAM.BLUE, TEAM.RED, TEAM.BLUE]);
  run(b, 300);
  assert.deepEqual([0, 1, 2].map((r) => b.field.ownerAt(4, r)), [TEAM.BLUE, TEAM.RED, TEAM.BLUE]);
  // They can always walk home, and everything goes back once they have.
  press(b, 'left');
  run(b, 12);
  press(b, 'left');
  run(b, 4);
  assert.deepEqual([b.player.col, b.player.row], [2, 1]);
  for (const c of [3, 4]) assert.deepEqual([0, 1, 2].map((r) => b.field.ownerAt(c, r)), [TEAM.BLUE, TEAM.BLUE, TEAM.BLUE], `column ${c}`);

  // Around an enemy: the first AreaGrab couldn't take the panel it stood on, so the player went in by the
  // top row. That way back is what stays.
  const b2 = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 3, row: 1 }] });
  toFight(b2);
  for (const r of [0, 2]) b2.field.steal(3, r, TEAM.RED);
  run(b2, 300);
  for (let r = 0; r < 3; r++) b2.field.steal(4, r, TEAM.RED);
  b2.moveEntity(b2.player, 4, 1);
  run(b2, TIMING.AREA_RETURN);
  const owners = (bb) => [3, 4].map((c) => [0, 1, 2].map((r) => (bb.field.ownerAt(c, r) === TEAM.RED ? 'R' : 'B')).join('')).join(' ');
  assert.equal(owners(b2), 'RBB RRB');
  for (const dir of ['up', 'left', 'left']) {
    press(b2, dir);
    run(b2, 12);
  }
  assert.deepEqual([b2.player.col, b2.player.row], [2, 0]);
  assert.equal(owners(b2), 'BBB BBB');
});

test('cracked panels break when stepped off and block movement', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], field: ['......', '.c....', '......'] });
  toFight(b);
  press(b, 'up');
  assert.equal(b.player.row, 0);
  assert.equal(b.field.typeAt(1, 1), PANEL.BROKEN);
  run(b, 12);
  press(b, 'down');
  assert.equal(b.player.row, 0);
});

test('holy panels halve damage; grass doubles fire and burns away', () => {
  const b = makeBattle({ enemies: [{ type: 'rivet', level: 1, col: 4, row: 1 }], seed: 3, field: ['......', '.h....', '......'] });
  toFight(b);
  let n = 0;
  while (b.player.hp === 100 && n++ < 600) b.step({});
  assert.equal(b.player.hp, 95);

  const b2 = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], field: ['......', '....g.', '......'], folder: folderOf('heatshot:B') });
  pickAndFight(b2, [0]);
  press(b2, 'a');
  run(b2, 30);
  assert.equal(enemy(b2, 'dummy').hp, 1000 - 80);
  assert.equal(b2.field.typeAt(4, 1), PANEL.NORMAL);
});

test('a chip hit during a wind-up is a Counter', () => {
  const b = makeBattle({ enemies: [{ type: 'rivet', level: 3, col: 4, row: 1 }], folder: folderOf('cannon:A'), seed: 5 });
  pickAndFight(b, [0]);
  const r = enemy(b, 'rivet');
  let n = 0;
  while (r.counterWindow === 0 && n++ < 300) b.step({});
  assert.ok(r.counterWindow > 0);
  press(b, 'a');
  run(b, 10);
  assert.equal(b.stats.counters, 1);
});

test('deleting every enemy wins and scores a Busting Level', () => {
  const b = makeBattle({ enemies: [{ type: 'rivet', level: 1, col: 4, row: 1 }], folder: folderOf('cannon:A'), seed: 9 });
  pickAndFight(b, [0]);
  press(b, 'a');
  run(b, 30);
  assert.equal(b.phase, 'win');
  run(b, TIMING.WIN_BANNER + 5);
  assert.equal(b.phase, 'results');
  assert.ok(b.result.won);
  // Under 5 s, no hits, no steps: 7 + 1 + 1 = 9.
  assert.equal(b.result.bustingLevel, 9);
});

test('double delete: one Spreader burst deleting two viruses scores +2', () => {
  const b = makeBattle({
    enemies: [
      { type: 'rivet', level: 1, col: 4, row: 1 },
      { type: 'rivet', level: 1, col: 5, row: 1 },
    ],
    folder: folderOf('spreader:M'),
    seed: 2,
  });
  pickAndFight(b, [0]);
  for (const e of b.livingEnemies()) e.hp = 20;
  press(b, 'a');
  run(b, 40);
  assert.equal(b.phase, 'win');
  run(b, TIMING.WIN_BANNER + 5);
  assert.equal(b.result.double, 1);
  assert.equal(b.result.bustingLevel, 'S');
});

test('ADD skips a turn and shows more chips next time', () => {
  const folder = [];
  for (let i = 0; i < 30; i++) folder.push({ key: 'cannon', code: 'A' });
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], folder });
  toCustom(b);
  assert.equal(b.custom.hand.length, 5);
  b.custom.add();
  run(b, 80);
  b.gauge = TIMING.GAUGE_FULL;
  press(b, 'r');
  assert.equal(b.phase, 'custom');
  assert.equal(b.custom.hand.length, 10);
});

test('the battle is deterministic for a seed and an input log', () => {
  const play = () => {
    const b = makeBattle({
      enemies: [
        { type: 'rivet', level: 2, col: 4, row: 0 },
        { type: 'plinker', level: 2, col: 5, row: 1 },
        { type: 'dartfin', level: 2, col: 3, row: 2 },
      ],
      folder: folderOf('cannon:A', 'sword:E', 'minibomb:B', 'shotgun:B', 'recov10:A'),
      seed: 1234,
      shuffle: true,
    });
    const log = [];
    for (let f = 0; f < 1500; f++) {
      const pad = { b: f % 9 < 3, up: f % 97 === 5, down: f % 61 === 7, a: f % 45 === 0 };
      if (b.phase === 'custom') b.custom.confirm();
      b.step(pad);
      if (f % 100 === 0) log.push(`${b.frame}:${b.player.hp}:${b.entities.map((e) => `${e.type}${e.hp}@${e.col},${e.row}`).join('|')}`);
    }
    return log.join('\n');
  };
  assert.equal(play(), play());
});

test('boss battles use the navi time table', () => {
  const b = makeBattle({ enemies: [{ type: 'dummynavi', level: 1, col: 4, row: 1 }], folder: folderOf('cannon:A') });
  assert.ok(b.isBossBattle);
  pickAndFight(b, [0]);
  enemy(b, 'dummynavi').hp = 30;
  press(b, 'a');
  run(b, 30 + TIMING.WIN_BANNER + 5);
  assert.equal(b.phase, 'results');
  assert.equal(b.result.bustingLevel, 'S'); // 10 (<30 s) + 1 + 1
});

test('Style Change: element sets weakness and charge shot; Guts doubles the buster', () => {
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], player: { style: { type: 'guts', element: 'fire' }, attack: 2 } });
  assert.equal(b.player.element, 'fire');
  assert.ok(b.player.superArmor);
  toFight(b);
  press(b, 'b');
  assert.equal(enemy(b, 'dummy').hp, 1000 - 4); // Guts: 2 x attack 2
  // Heat charge shot: flames 3 panels ahead (player at col 1 -> cols 2..4), 10 x attack.
  run(b, 30);
  const hold = TIMING.CHARGE_START + TIMING.CHARGE_TIME[1];
  run(b, hold, { b: true });
  b.step({});
  run(b, 30);
  assert.equal(enemy(b, 'dummy').hp, 1000 - 4 - 4 - 20);
  // Aqua beats Fire: an aqua hit on the player doubles.
  b.applyHit(b.player, { damage: 10, element: 'aqua' }, { team: 'blue', owner: null });
  assert.equal(b.player.hp, 80);
});

test('Custom style adds a chip to the hand; Shield style reflects with Back+B', () => {
  const folder = [];
  for (let i = 0; i < 30; i++) folder.push({ key: 'cannon', code: 'A' });
  const b = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], folder, player: { style: { type: 'custom' } } });
  toCustom(b);
  assert.equal(b.custom.hand.length, 6);

  const s = makeBattle({ enemies: [{ type: 'dummy', level: 1, col: 4, row: 1 }], player: { style: { type: 'shield' } } });
  toFight(s);
  s.step({ left: true });
  s.step({ left: true, b: true });
  assert.ok(s.player.guardTimer > 0);
  const res = s.applyHit(s.player, { damage: 30, flinch: true }, { team: 'blue', owner: null });
  assert.ok(res.reflected);
});
