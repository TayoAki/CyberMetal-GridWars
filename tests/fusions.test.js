import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHIPS } from '../src/engine/chips/library.js';
import { PROGRAM_ADVANCES, findProgramAdvance } from '../src/engine/chips/pa.js';
import { compatible, fusionHint, resolveQueue } from '../src/engine/custom.js';
import { LIMITS } from '../src/engine/constants.js';
import { fusionSources, folderFusions } from '../src/game/data/fusions.js';
import { PRESET_FOLDERS, STARTER_FOLDER, expandFolder } from '../src/game/data/folders.js';
import { SaveData } from '../src/game/save.js';

// Fusions (Program Advances): the Custom Screen's hints, and that every fusion can be built from chips the
// game hands out.

const hand = (...ids) => ids.map((id) => ({ key: id.split(':')[0], code: id.split(':')[1] }));
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

// The Custom Screen's selection rule, as CustomScreen.canSelect applies it.
const canPick = (h, selected, i) => !selected.includes(i) && selected.length < LIMITS.SELECT_MAX && compatible([...selected.map((k) => h[k]), h[i]]);

test('the hint walks you through a fusion: the chips to pick, in order, then ready', () => {
  const h = hand('cannon:A', 'recov10:L', 'cannon:B', 'sword:L', 'cannon:C');
  assert.deepEqual(fusionHint(h, []), { pa: CHIPS.cannonade1, picks: [0, 2, 4], done: 0 });
  assert.deepEqual(fusionHint(h, [0]), { pa: CHIPS.cannonade1, picks: [0, 2, 4], done: 1 });
  assert.deepEqual(fusionHint(h, [0, 2]), { pa: CHIPS.cannonade1, picks: [0, 2, 4], done: 2 });
  assert.deepEqual(fusionHint(h, [0, 2, 4]), { pa: CHIPS.cannonade1, ready: true });
  assert.equal(resolveQueue([0, 2, 4].map((i) => h[i])).pa, CHIPS.cannonade1);
});

test('picked out of order, or after a chip that blocks it, the hint says to undo', () => {
  const h = hand('cannon:A', 'recov10:L', 'cannon:B', 'sword:L', 'cannon:C');
  for (const selected of [[2], [4], [3], [2, 0]]) {
    assert.deepEqual(fusionHint(h, selected), { pa: CHIPS.cannonade1, picks: [0, 2, 4], done: 0, undo: true }, JSON.stringify(selected));
  }
  // A second Cannon B makes a fresh run after the first one, so no undo is needed.
  const two = hand('cannon:B', 'cannon:A', 'cannon:B', 'cannon:C');
  assert.deepEqual(fusionHint(two, [0]), { pa: CHIPS.cannonade1, picks: [1, 2, 3], done: 0 });
});

test('sets take a * chip for any piece, and want one code', () => {
  const h = hand('longsword:L', 'sword:L', 'widesword:*');
  assert.deepEqual(fusionHint(h, []), { pa: CHIPS.lifesaber, picks: [1, 2, 0], done: 0 });
  assert.equal(resolveQueue([1, 2, 0].map((i) => h[i])).pa, CHIPS.lifesaber);
  // Mixed codes don't fuse; holding two of them is still worth it if the third is in the folder.
  const mixed = hand('sword:L', 'widesword:E', 'longsword:L');
  assert.equal(fusionHint(mixed, []), null);
  assert.deepEqual(fusionHint(mixed, [], hand('recov10:A', 'widesword:L')), { pa: CHIPS.lifesaber, keep: [0, 2], missing: { key: 'widesword', code: 'L' } });
});

test('two pieces in hand and the third still in the folder: hold them', () => {
  const h = hand('cannon:A', 'recov10:L', 'cannon:B');
  assert.deepEqual(fusionHint(h, [], hand('sword:L', 'cannon:C')), { pa: CHIPS.cannonade1, keep: [0, 2], missing: { key: 'cannon', code: 'C' } });
  assert.equal(fusionHint(h, [], hand('sword:L', 'cannon:E')), null, 'the third piece is not coming');
  assert.equal(fusionHint(hand('cannon:A', 'recov10:L'), [], hand('cannon:B', 'cannon:C')), null, 'only one piece in hand');
});

test('the hint finds every fusion a hand can make, and following it always makes that fusion', () => {
  // Random 6-chip hands, each seeded with a fusion's pieces (now and then with a wrong code) plus chips from
  // the pre-built folders, checked against every ordered pick of 3 or 4 chips the selection rule allows.
  let seed = 99;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const pool = PRESET_FOLDERS.flatMap((f) => expandFolder(f.chips));
  const codesOf = (key) => [...CHIPS[key].codes];
  let fusing = 0;
  for (let n = 0; n < 1500; n++) {
    const r = pick(PROGRAM_ADVANCES).recipe;
    let pieces;
    if (r.type === 'consecutive') {
      const codes = codesOf(r.chip).filter((c) => c !== '*');
      const s = Math.floor(rnd() * (codes.length - r.count + 1));
      pieces = [...Array(r.count).keys()].map((i) => ({ key: r.chip, code: rnd() < 0.85 ? codes[s + i] : pick(codesOf(r.chip)) }));
    } else {
      const shared = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((L) => r.chips.every((k) => CHIPS[k].codes.includes(L)));
      const code = pick(shared.length ? shared : ['*']);
      pieces = r.chips.map((key) => ({ key, code: rnd() < 0.8 ? code : pick(codesOf(key)) }));
    }
    const h = [...pieces, ...[...Array(6 - pieces.length)].map(() => ({ ...pick(pool) }))];
    for (let i = h.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [h[i], h[j]] = [h[j], h[i]];
    }
    let possible = null;
    const walk = (sel) => {
      if (possible) return;
      if (sel.length >= 3) {
        const pa = findProgramAdvance(sel.map((i) => h[i]))?.pa;
        if (pa) possible = { pa, sel };
      }
      if (sel.length === 4) return;
      for (let i = 0; i < h.length; i++) if (canPick(h, sel, i)) walk([...sel, i]);
    };
    walk([]);
    const hint = fusionHint(h, []);
    assert.equal(!!hint?.picks, !!possible, `${JSON.stringify(h)}: hint ${JSON.stringify(hint)} vs ${JSON.stringify(possible)}`);
    if (!hint?.picks) continue;
    fusing++;
    // Follow it one pick at a time: each step is allowed, keeps the same plan, and ends ready.
    const sel = [];
    for (const i of hint.picks) {
      assert.ok(canPick(h, sel, i), JSON.stringify({ h, hint, sel }));
      sel.push(i);
      const now = fusionHint(h, sel);
      if (sel.length < hint.picks.length) assert.deepEqual(now, { pa: hint.pa, picks: hint.picks, done: sel.length });
      else assert.deepEqual(now, { pa: hint.pa, ready: true });
    }
    assert.equal(resolveQueue(sel.map((i) => h[i])).pa, hint.pa);
  }
  assert.ok(fusing > 100, `only ${fusing} hands could fuse`);
});

test('every fusion can be built from the starter folder and the Gauntlet\'s drops', () => {
  const sources = fusionSources();
  assert.equal(sources.length, PROGRAM_ADVANCES.length);
  for (const f of sources) {
    assert.ok(f.area >= 0, `${f.pa.key} can't be built from drops`);
    assert.equal(findProgramAdvance(f.pieces)?.pa, f.pa, f.pa.key);
    assert.ok(f.text.length > 0);
  }
  const area = Object.fromEntries(sources.map((f) => [f.pa.key, f.area]));
  assert.equal(area.cannonade1, 0, 'the first fusion is there from the start');
  assert.ok(Object.values(area).filter((a) => a <= 3).length >= 5, 'several by the middle of the Gauntlet');
  // The starter folder itself can fuse Cannon A, B, C.
  const starter = expandFolder(STARTER_FOLDER);
  const has = (code) => starter.some((c) => c.key === 'cannon' && c.code === code);
  assert.ok(has('A') && has('B') && has('C'));
});

test('a save still on the old starter folder (SideGun S, no Cannon C) gets the new one; an edited one is left alone', () => {
  const storage = memoryStorage();
  const fresh = new SaveData(storage);
  assert.ok(fresh.data.folder.some((c) => c.key === 'cannon' && c.code === 'C'));
  assert.equal(fresh.ownedCount('sidegun', 'S'), 1, 'the SideGun S is in the pack');
  const old = fresh.data.folder.map((c) => (c.key === 'cannon' && c.code === 'C' ? { key: 'sidegun', code: 'S' } : c));
  storage.setItem('cybermetal-gridwars-save-v1', JSON.stringify({ ...fresh.data, folder: old }));
  const upgraded = new SaveData(storage);
  assert.deepEqual(upgraded.data.folder.map((c) => `${c.key}:${c.code}`).sort(), fresh.data.folder.map((c) => `${c.key}:${c.code}`).sort());
  // Edited: one Recov10 A swapped for the Recov30 * from the pack. Stays as the player left it.
  const edited = old.map((c, i) => (i === old.findIndex((x) => x.key === 'recov10' && x.code === 'A') ? { key: 'recov30', code: '*' } : c));
  storage.setItem('cybermetal-gridwars-save-v1', JSON.stringify({ ...fresh.data, folder: edited }));
  assert.deepEqual(new SaveData(storage).data.folder, edited);
});

test('the folder menu\'s fusion list: what each folder can make', () => {
  const keys = (list) => folderFusions(expandFolder(list)).map((f) => f.pa.key);
  assert.deepEqual(keys(STARTER_FOLDER), ['cannonade1']);
  // The old starter, with a SideGun S where the Cannon C is now, could make none: why no fusion ever came.
  assert.deepEqual(keys(STARTER_FOLDER.map(([k, c, n]) => (k === 'cannon' && c === 'C' ? ['sidegun', 'S', n] : [k, c, n]))), []);
  for (const f of PRESET_FOLDERS) {
    const made = folderFusions(expandFolder(f.chips));
    for (const pa of f.pa) assert.ok(made.some((m) => m.pa.key === pa), `${f.key} lists ${pa}`);
  }
  assert.deepEqual(folderFusions(hand('sword:L', 'widesword:*', 'longsword:L')).map((f) => f.text), ['Sword WideSwrd LongSwrd L']);
});
