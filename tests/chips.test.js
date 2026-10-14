import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIPS } from '../src/engine/chips/library.js';
import '../src/engine/chips/pa.js';
import { PANEL, TIMING } from '../src/engine/constants.js';
import { registerEnemy } from '../src/engine/enemies/index.js';
import { makeBattle, folderOf, run, pickAndFight, press, enemy, toFight } from './helpers.js';

registerEnemy({
  type: 'bag',
  kind: 'virus',
  names: ['Bag', 'Bag', 'Bag', 'Bag'],
  hp: [3000, 3000, 3000, 3000],
  element: 'null',
  *ai() {
    for (;;) yield;
  },
});

// Put one chip straight into the queue and fire it.
function fire(key, opts = {}) {
  const b = makeBattle({
    enemies: opts.enemies ?? [
      { type: 'bag', level: 1, col: 4, row: 1 },
      { type: 'bag', level: 1, col: 3, row: 0 },
      { type: 'bag', level: 1, col: 5, row: 2 },
    ],
    folder: folderOf('cannon:A'),
    field: opts.field ?? null,
  });
  toFight(b);
  const def = CHIPS[key];
  b.controller.setChips([{ key, name: def.name, code: '*', damage: def.damage, element: def.element, kind: def.kind, klass: def.klass, boost: 0, def }]);
  if (opts.before) opts.before(b);
  press(b, 'a');
  run(b, opts.frames ?? 260);
  return b;
}

test('every chip and fusion runs in a live battle without throwing', () => {
  for (const key of Object.keys(CHIPS)) {
    if (CHIPS[key].kind === 'boost') continue;
    const b = fire(key);
    assert.ok(b.player.alive, `${key}: player died?`);
    assert.equal(b.controller.action, null, `${key}: chip never finished`);
    assert.equal(b.player.hidden, false, `${key}: player left hidden`);
  }
});

test('attack chips that should reach a body in the row actually damage it', () => {
  const rowHitters = ['cannon', 'hicannon', 'airshot1', 'lavacan1', 'shotgun', 'spreader', 'bubbler', 'heatshot', 'shockwave', 'zapring1'];
  for (const key of rowHitters) {
    if (!CHIPS[key]) continue;
    const b = fire(key);
    const bag = b.entities.find((e) => e.type === 'bag' && e.row === 1);
    assert.ok(bag.hp < 3000, `${key} did no damage`);
  }
  // Ratton turns toward the first foe it lines up with: here the one at column 3, row 0.
  const rat = fire('ratton1');
  assert.equal(rat.entities.find((e) => e.type === 'bag' && e.col === 3).hp, 3000 - 80);
  // Swords cut the panel(s) in front.
  const b = fire('widesword', { enemies: [{ type: 'bag', level: 1, col: 2, row: 0 }, { type: 'bag', level: 1, col: 2, row: 2 }] });
  for (const e of b.entities.filter((e) => e.type === 'bag')) assert.equal(e.hp, 3000 - 80);
});

test('Recover heals, Barrier absorbs, Aura blocks small hits, Invis dodges', () => {
  let b = fire('recov50', { before: (bb) => (bb.player.hp = 20) });
  assert.equal(b.player.hp, 70);

  b = fire('barrier');
  assert.equal(b.player.barrierHp, 10);
  b.applyHit(b.player, { damage: 25, flinch: true }, { team: 'blue', owner: null });
  assert.equal(b.player.hp, 100 - 15);
  assert.equal(b.player.barrierHp, 0);

  b = fire('aura');
  b.applyHit(b.player, { damage: 60 }, { team: 'blue', owner: null });
  assert.equal(b.player.hp, 100);
  assert.equal(b.player.auraPower, 100);
  b.applyHit(b.player, { damage: 120 }, { team: 'blue', owner: null });
  assert.equal(b.player.auraPower, 0);
  assert.equal(b.player.hp, 100); // breaking the aura absorbs that hit too

  b = fire('invis', { frames: 20 });
  assert.ok(b.player.invisTimer > 0);
  const res = b.applyHit(b.player, { damage: 50 }, { team: 'blue', owner: null });
  assert.equal(res.connected, false);
  assert.equal(b.player.hp, 100);
});

test('Guard reflects a hit back down the row', () => {
  const b = fire('guard', { frames: 4 });
  assert.ok(b.player.guardTimer > 0);
  const res = b.applyHit(b.player, { damage: 50, flinch: true }, { team: 'blue', owner: null });
  assert.ok(res.reflected);
  assert.equal(b.player.hp, 100);
  run(b, 40);
  assert.ok(enemy(b, 'bag').hp < 3000, 'reflected shot should hit the bag in the row');
});

test('stage chips repaint the field; Geddon2 only breaks empty panels', () => {
  let b = fire('icestage', { frames: 30 });
  assert.equal(b.field.typeAt(0, 0), PANEL.ICE);
  b = fire('geddon2', { frames: 30 });
  assert.equal(b.field.typeAt(0, 0), PANEL.BROKEN);
  assert.notEqual(b.field.typeAt(1, 1), PANEL.BROKEN); // player stands there
  assert.notEqual(b.field.typeAt(4, 1), PANEL.BROKEN); // bag stands there
});

test('ice slides the player until something stops it', () => {
  const b = makeBattle({ enemies: [{ type: 'bag', level: 1, col: 5, row: 1 }], field: ['......', 'iii...', '......'] });
  toFight(b);
  b.player.col = 2;
  press(b, 'left'); // onto (1,1) ice, slides on to the edge
  run(b, 30);
  assert.equal(b.player.col, 0);
  assert.equal(b.player.row, 1);
  // Sliding off the ice onto a plain panel stops there.
  const b2 = makeBattle({ enemies: [{ type: 'bag', level: 1, col: 5, row: 1 }], field: ['......', 'iii...', '......'] });
  toFight(b2);
  b2.player.col = 2;
  b2.player.row = 0;
  press(b2, 'down');
  run(b2, 30);
  assert.equal(b2.player.row, 2);
});

test('lava burns non-Fire bodies once, poison drains', () => {
  const b = makeBattle({ enemies: [{ type: 'bag', level: 1, col: 5, row: 1 }], field: ['......', '..l...', '......'] });
  toFight(b);
  press(b, 'right');
  assert.equal(b.player.col, 2);
  assert.equal(b.player.hp, 50);
  assert.equal(b.field.typeAt(2, 1), PANEL.NORMAL);

  const b2 = makeBattle({ enemies: [{ type: 'bag', level: 1, col: 5, row: 1 }], field: ['......', '.p....', '......'] });
  toFight(b2);
  run(b2, TIMING.POISON_TICK * 10);
  assert.ok(b2.player.hp <= 91 && b2.player.hp >= 89, `poison drained to ${b2.player.hp}`);
});

test('a Navi chip hides the player during the summon and hits', () => {
  const b = fire('voltframe1', { frames: 20 });
  assert.equal(b.player.hidden, true);
  run(b, 120);
  assert.equal(b.player.hidden, false);
  for (const e of b.entities.filter((e) => e.type === 'bag')) assert.equal(e.hp, 3000 - 50);
});

test('PanelOut breaks the panel in front; the hole recovers later', () => {
  const b = fire('panlout1', { frames: 30 });
  assert.equal(b.field.typeAt(2, 1), PANEL.BROKEN);
  run(b, TIMING.BROKEN_RECOVER + 5);
  assert.equal(b.field.typeAt(2, 1), PANEL.NORMAL);
});
