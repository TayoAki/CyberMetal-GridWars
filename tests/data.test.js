import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIPS, CHIP_KEYS } from '../src/engine/chips/library.js';
import { PROGRAM_ADVANCES } from '../src/engine/chips/pa.js';
import { BEHAVIORS } from '../src/engine/chips/behaviors.js';
import { ENEMIES } from '../src/engine/enemies/index.js';
import { AREAS, ENCOUNTERS, BOSS_CHIPS } from '../src/game/data/areas.js';
import { STARTER_FOLDER, SaveData, FOLDER_RULES } from '../src/game/save.js';
import { Battle } from '../src/engine/battle.js';

function validChipId(id) {
  const [key, code] = id.split(':');
  const def = CHIPS[key];
  if (!def) return `unknown chip ${key}`;
  if (!def.codes.includes(code)) return `${key} has no code ${code} (codes ${def.codes})`;
  return null;
}

test('every chip has a behaviour, sane codes and numbers', () => {
  for (const key of Object.keys(CHIPS)) {
    const d = CHIPS[key];
    assert.ok(BEHAVIORS[d.behavior], `${key}: missing behaviour ${d.behavior}`);
    assert.match(d.codes, /^[A-Z*]+$/, `${key} codes`);
    assert.ok(d.damage >= 0 && Number.isFinite(d.damage), `${key} damage`);
    assert.ok(d.name.length <= 10, `${key} name too long for the HUD: ${d.name}`);
  }
  assert.ok(CHIP_KEYS.length >= 100);
});

test('program advance recipes use real chips', () => {
  for (const pa of PROGRAM_ADVANCES) {
    const keys = pa.recipe.type === 'consecutive' ? [pa.recipe.chip] : pa.recipe.chips;
    for (const k of keys) assert.ok(CHIPS[k], `${pa.key} recipe uses unknown ${k}`);
    if (pa.recipe.type === 'consecutive') {
      // Some three ascending letters must exist among the chip's codes.
      const codes = CHIPS[pa.recipe.chip].codes.replace('*', '');
      const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const ok = [...codes].some((c) => codes.includes(L[L.indexOf(c) + 1]) && codes.includes(L[L.indexOf(c) + 2]));
      assert.ok(ok, `${pa.key}: ${pa.recipe.chip} has no 3 consecutive codes`);
    } else {
      const shared = [...CHIPS[keys[0]].codes].filter((c) => c !== '*' && keys.every((k) => CHIPS[k].codes.includes(c)));
      assert.ok(shared.length > 0, `${pa.key}: recipe chips share no code`);
    }
  }
});

test('drops, rares and boss rewards are real chip codes', () => {
  for (const enc of ENCOUNTERS) {
    for (const id of [...(enc.drops ?? []), ...(enc.rare ?? [])]) assert.equal(validChipId(id), null, `${enc.id}: ${id}`);
    if (enc.reward?.chip) assert.equal(validChipId(enc.reward.chip), null, `${enc.id} reward`);
  }
  for (const ids of Object.values(BOSS_CHIPS)) for (const id of ids) assert.equal(validChipId(id), null, id);
});

test('formations sit on the blue side without overlaps', () => {
  for (const enc of ENCOUNTERS) {
    const seen = new Set();
    for (const e of enc.enemies) {
      assert.ok(e.col >= 3 && e.col <= 5 && e.row >= 0 && e.row <= 2, `${enc.id}: ${e.type} at ${e.col},${e.row}`);
      const k = `${e.col},${e.row}`;
      assert.ok(!seen.has(k), `${enc.id}: two enemies on ${k}`);
      seen.add(k);
      if (enc.field) assert.notEqual(enc.field[e.row][e.col], 'x', `${enc.id}: enemy on a hole`);
    }
    if (enc.field) assert.notEqual(enc.field[1][1], 'x', `${enc.id}: hole under the player start`);
  }
  assert.equal(AREAS.length, 8);
});

test('every encounter enemy type is registered (integration with content packs)', () => {
  const missing = new Set();
  for (const enc of ENCOUNTERS) for (const e of enc.enemies) if (!ENEMIES[e.type]) missing.add(e.type);
  assert.deepEqual([...missing], [], `missing enemy families: ${[...missing].join(', ')}`);
});

test('every encounter can start and run a few seconds', () => {
  for (const enc of ENCOUNTERS) {
    if (enc.enemies.some((e) => !ENEMIES[e.type])) continue;
    const save = new SaveData(null);
    const b = new Battle({ seed: 3, encounter: enc, player: save.battlePlayer(), shuffle: true });
    for (let i = 0; i < 400; i++) {
      if (b.phase === 'custom') b.custom.confirm();
      b.step({ b: i % 7 === 0 });
    }
    assert.ok(['fight', 'win', 'results', 'lose', 'over', 'custom', 'banner'].includes(b.phase), `${enc.id} phase ${b.phase}`);
  }
});

test('the starter folder (BN3\'s, with a Cannon C) obeys the folder rules', () => {
  const n = STARTER_FOLDER.reduce((s, [, , c]) => s + c, 0);
  assert.equal(n, FOLDER_RULES.size);
  for (const [key, code] of STARTER_FOLDER) assert.equal(validChipId(`${key}:${code}`), null);
  const save = new SaveData(null);
  assert.equal(save.data.folder.length, 30);
  // Every folder chip is owned.
  for (const c of save.data.folder) assert.ok(save.ownedCount(c.key, c.code) >= save.folderCount(c.key, c.code));
});
