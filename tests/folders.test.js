import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIPS } from '../src/engine/chips/library.js';
import { findProgramAdvance } from '../src/engine/chips/pa.js';
import { AREAS, ENCOUNTERS } from '../src/game/data/areas.js';
import { PRESET_FOLDERS, PRESET_BY_KEY, STARTER_FOLDER, expandFolder, folderCodes } from '../src/game/data/folders.js';
import { SaveData, FOLDER_RULES } from '../src/game/save.js';
import { Battle } from '../src/engine/battle.js';

// Pre-built folders (BN3's XtraFolder idea): ready-made, loaned folders the player can equip.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test('every pre-built folder is a legal 30-chip folder', () => {
  assert.equal(new Set(PRESET_FOLDERS.map((f) => f.key)).size, PRESET_FOLDERS.length, 'unique keys');
  assert.ok(PRESET_FOLDERS.length >= 6);
  for (const f of PRESET_FOLDERS) {
    const chips = expandFolder(f.chips);
    assert.equal(chips.length, FOLDER_RULES.size, f.key);
    assert.ok(f.name.length <= 12 && f.desc, f.key);
    assert.ok(f.area >= 0 && f.area < AREAS.length, f.key);
    const perKey = {};
    let megas = 0;
    let gigas = 0;
    for (const c of chips) {
      const d = CHIPS[c.key];
      assert.ok(d, `${f.key}: unknown chip ${c.key}`);
      assert.ok(d.codes.includes(c.code), `${f.key}: ${c.key} has no code ${c.code}`);
      assert.notEqual(d.klass, 'pa', `${f.key}: a PA can't be in a folder`);
      perKey[c.key] = (perKey[c.key] ?? 0) + 1;
      if (d.klass === 'mega') megas++;
      if (d.klass === 'giga') gigas++;
    }
    for (const [k, n] of Object.entries(perKey)) {
      const klass = CHIPS[k].klass;
      assert.ok(n <= (klass === 'mega' ? FOLDER_RULES.maxMegaEach : FOLDER_RULES.maxStandard), `${f.key}: ${n}× ${k}`);
    }
    assert.ok(megas <= FOLDER_RULES.maxMega && gigas <= FOLDER_RULES.maxGiga, f.key);
  }
  assert.deepEqual(PRESET_BY_KEY.starter.chips, STARTER_FOLDER, 'the STARTER folder is the one every save begins with');
});

test('pre-built folders are built on a few codes, so the Custom Screen lets you take several chips', () => {
  for (const f of PRESET_FOLDERS) {
    if (f.key === 'starter') continue; // BN3's own starter is deliberately mixed
    const letters = folderCodes(expandFolder(f.chips)).filter((c) => c !== '*');
    assert.ok(letters.length <= 3, `${f.key} uses ${letters.join(' ')}`);
  }
});

test('each folder\'s Program Advances can be made from its own chips', () => {
  for (const f of PRESET_FOLDERS) {
    const chips = expandFolder(f.chips);
    for (const paKey of f.pa) {
      const r = CHIPS[paKey].recipe;
      let run = null;
      if (r.type === 'consecutive') {
        const codes = [...new Set(chips.filter((c) => c.key === r.chip && c.code !== '*').map((c) => c.code))];
        const start = codes.find((c) => [...Array(r.count).keys()].every((i) => codes.includes(LETTERS[LETTERS.indexOf(c) + i])));
        assert.ok(start, `${f.key}: no ${r.count} consecutive ${r.chip} codes for ${paKey}`);
        run = [...Array(r.count).keys()].map((i) => ({ key: r.chip, code: LETTERS[LETTERS.indexOf(start) + i] }));
      } else {
        const has = r.chips.map((k) => chips.filter((c) => c.key === k).map((c) => c.code));
        const code = LETTERS.split('').find((L) => has.every((h) => h.includes(L) || h.includes('*'))) ?? '*';
        run = r.chips.map((k, i) => ({ key: k, code: has[i].includes(code) ? code : '*' }));
        assert.ok(run.every((c, i) => has[i].includes(c.code)), `${f.key}: ${paKey} chips missing`);
      }
      assert.equal(findProgramAdvance(run)?.pa.key, paKey, `${f.key}: ${JSON.stringify(run)} should make ${paKey}`);
    }
  }
});

test('folders unlock with the Gauntlet; a locked one can\'t be equipped; battles use the equipped folder', () => {
  const save = new SaveData(null);
  const open = () => PRESET_FOLDERS.filter((f) => save.folderUnlocked(f.key)).map((f) => f.key);
  assert.deepEqual(open(), PRESET_FOLDERS.filter((f) => f.area === 0).map((f) => f.key));
  assert.ok(open().length >= 3, 'a few to choose from at the start');
  assert.equal(save.equipFolder('prism'), false);
  assert.equal(save.data.activeFolder, 'mine');
  assert.deepEqual(save.battlePlayer().folder, save.data.folder);
  assert.equal(save.equipFolder('cannon'), true);
  assert.deepEqual(save.battlePlayer().folder, expandFolder(PRESET_BY_KEY.cannon.chips));
  // Loaned: equipping it adds nothing to the pack, and the player's own folder is untouched.
  assert.equal(save.ownedCount('cannon', 'C'), 1);
  assert.equal(save.data.folder.length, 30);
  save.data.progress.area = 4;
  assert.ok(save.folderUnlocked('elemental') && save.folderUnlocked('blade') && !save.folderUnlocked('demolition'));
  save.data.progress.finished = true;
  assert.equal(open().length, PRESET_FOLDERS.length);
  assert.equal(save.equipFolder('nope'), false);
  assert.equal(save.equipFolder('mine'), true);
});

test('the equipped folder is saved; an unknown or locked one falls back to your own', () => {
  const storage = memoryStorage();
  const a = new SaveData(storage);
  a.equipFolder('sword');
  const b = new SaveData(storage);
  assert.equal(b.data.activeFolder, 'sword');
  // Hand-edited saves: a folder that doesn't exist, or one not unlocked yet.
  for (const bad of ['laser', 'prism']) {
    storage.setItem('cybermetal-gridwars-save-v1', JSON.stringify({ ...b.data, activeFolder: bad }));
    assert.equal(new SaveData(storage).data.activeFolder, 'mine', bad);
  }
  // An old save without the field starts on your own folder.
  const { activeFolder, ...old } = b.data;
  storage.setItem('cybermetal-gridwars-save-v1', JSON.stringify(old));
  assert.equal(new SaveData(storage).data.activeFolder, 'mine');
  assert.ok(activeFolder);
});

test('a battle deals from the equipped pre-built folder, and runs with every one', () => {
  for (const f of PRESET_FOLDERS) {
    const save = new SaveData(null);
    save.data.progress.finished = true;
    save.equipFolder(f.key);
    const b = new Battle({ seed: 5, encounter: ENCOUNTERS[0], player: save.battlePlayer(), shuffle: true });
    const ids = new Set(expandFolder(f.chips).map((c) => `${c.key}:${c.code}`));
    assert.equal(b.custom.deck.length, FOLDER_RULES.size, f.key);
    assert.ok(b.custom.deck.every((c) => ids.has(`${c.key}:${c.code}`)), `${f.key}: the deck is the folder`);
    for (let i = 0; i < 600; i++) {
      if (b.phase === 'custom') b.custom.confirm();
      b.step({ a: i % 11 === 0, b: i % 7 === 0 });
    }
    assert.ok(b.custom.hand.every((c) => ids.has(`${c.key}:${c.code}`)), f.key);
  }
});
