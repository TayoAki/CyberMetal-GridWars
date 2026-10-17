import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS } from '../src/game/data/areas.js';
import { SaveData, PROGRAMS, rewardPrograms } from '../src/game/save.js';
import { applyReward, bossReward } from '../src/game/rewards.js';
import { GauntletScene } from '../src/game/scenes/gauntletScene.js';
import { PANEL } from '../src/engine/constants.js';
import { makeBattle, toFight } from './helpers.js';

// The Gauntlet's flow around bosses, and the programs bosses give.

const fakeGame = (save) => ({ save, audio: { play() {}, music() {} }, scene: null, setScene(s) { this.scene = s; } });
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test('HP carries through an area\'s virus battles, the boss is fought at full HP, and losing to it keeps you at the boss', () => {
  const save = new SaveData(null);
  save.data.stats.hpMem = 28;
  const game = fakeGame(save);
  const p = save.data.progress;
  p.area = 7;
  p.step = 2;
  p.hp = 120;
  // The third virus battle starts on the HP carried in; winning it leads to the boss with HP restored.
  new GauntletScene(game).startBattle();
  assert.equal(game.scene.battle.player.hp, 120);
  game.scene.battle.player.hp = 42;
  game.scene.opts.onEnd({ won: true }, null, game.scene);
  assert.equal(p.step, 3);
  assert.equal(game.scene.note?.text, 'HP restored for the boss');
  // The boss: full HP, whatever was carried in.
  new GauntletScene(game).startBattle();
  assert.ok(game.scene.battle.isBossBattle);
  assert.equal(game.scene.battle.player.hp, save.maxHp);
  // Deleted or retreating: back to the boss, not the start of the area.
  for (const result of [{ won: false }, { won: false, retreated: true }]) {
    new GauntletScene(game).startBattle();
    game.scene.opts.onEnd(result, null, game.scene);
    assert.equal(p.step, 3, JSON.stringify(result));
    assert.equal(p.hp, null);
  }
  // A virus battle lost still resets the area.
  p.step = 1;
  p.hp = 200;
  new GauntletScene(game).startBattle();
  game.scene.opts.onEnd({ won: false }, null, game.scene);
  assert.equal(p.step, 0);
});

test('every program can be earned: UnderShirt from the start, the rest from bosses (Ironclad gives AirShoes)', () => {
  const save = new SaveData(null);
  const fromBosses = AREAS.flatMap((a) => rewardPrograms(a.boss.reward));
  for (const k of Object.keys(PROGRAMS)) assert.ok(save.data.programs.owned.includes(k) || fromBosses.includes(k), `${k} can't be earned`);
  const iron = AREAS.find((a) => a.boss.enemies[0].type === 'ironclad').boss;
  const rw = bossReward(save, iron, 1, { bustingLevel: 6 });
  assert.deepEqual(rw.program, ['superArmor', 'airShoes']);
  assert.equal(rw.label, 'Ironclad I, HP +80, SuperArmor, AirShoes');
  applyReward(save, rw);
  assert.ok(save.data.programs.owned.includes('superArmor') && save.data.programs.owned.includes('airShoes'));
  // The other rewards read as before.
  assert.equal(bossReward(new SaveData(null), AREAS[0].boss, 1, { bustingLevel: 6 }).label, 'Voltframe V, HP +100');
  assert.equal(bossReward(new SaveData(null), AREAS[1].boss, 1, { bustingLevel: 6 }).label, 'Feralis F, HP +80, ATTACK +1');
});

test('a save that beat Ironclad before it gave AirShoes gets them on load; one that hasn\'t does not', () => {
  const storage = memoryStorage();
  const a = new SaveData(storage);
  a.data.progress.bosses.ironclad = 1;
  a.data.programs.owned = ['underShirt', 'superArmor'];
  a.persist();
  assert.deepEqual(new SaveData(storage).data.programs.owned, ['underShirt', 'superArmor', 'airShoes']);
  assert.deepEqual(new SaveData(null).data.programs.owned, ['underShirt']);
});

test('AirShoes let the player stand on holes', () => {
  const field = ['x.....', '......', '......'];
  for (const airShoes of [false, true]) {
    const b = makeBattle({ field, player: { programs: { airShoes } } });
    toFight(b);
    assert.equal(b.field.typeAt(0, 0), PANEL.BROKEN);
    assert.equal(b.canEnter(b.player, 0, 0), airShoes);
  }
});
