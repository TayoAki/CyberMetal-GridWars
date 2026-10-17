import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_POSES, PAL, playerPalette, lookPoses } from '../src/render/sprites/core_player.js';
import { LOOK_SLOTS, LOOK_COLORS, COLOR_CHANNELS, DEFAULT_LOOK, HEADS, TORSOS, SHOULDERS, BACKS, LEG_STYLES, normalizeLook, partsKey, lookColors, colorRamp } from '../src/render/sprites/core_player_looks.js';
import { SaveData } from '../src/game/save.js';
import { Battle } from '../src/engine/battle.js';
import { ENCOUNTERS } from '../src/game/data/areas.js';
import { autopilot } from '../src/game/autopilot.js';
import { hexToRgb } from '../src/render/pixel.js';

// AXIOM's look (CUSTOMIZE): swappable parts and colours. Cosmetic only.

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};

test('every option in the catalog has its art, and the default look is AXIOM as drawn', () => {
  const art = { head: HEADS, body: TORSOS, arms: SHOULDERS, legs: LEG_STYLES, back: BACKS };
  for (const s of LOOK_SLOTS) {
    assert.equal(s.options[0].id, DEFAULT_LOOK[s.key], `${s.key}: the first option is the default`);
    for (const o of s.options.slice(1)) assert.ok(art[s.key][o.id], `${s.key}.${o.id} has no art`);
    assert.equal(new Set(s.options.map((o) => o.id)).size, s.options.length, `${s.key}: unique ids`);
  }
  for (const c of COLOR_CHANNELS) assert.equal(LOOK_COLORS[c.key][0].id, DEFAULT_LOOK[c.key]);
  assert.deepEqual(lookColors(DEFAULT_LOOK), {}, 'AXIOM\'s colours are the drawn palette, untouched');
  assert.equal(playerPalette(DEFAULT_LOOK, null), PAL);
});

test('looks are checked: unknown parts and colours fall back to AXIOM\'s, and the parts key ignores colour', () => {
  assert.deepEqual(normalizeLook(null), { ...DEFAULT_LOOK });
  assert.deepEqual(normalizeLook({ head: 'oni', body: 'nope', armor: 'crimson', lights: 42 }), { ...DEFAULT_LOOK, head: 'oni', armor: 'crimson' });
  // A 3D model and its turn: only the known models, only quarter turns.
  assert.deepEqual(normalizeLook({ model: 'mech', turn: 3 }), { ...DEFAULT_LOOK, model: 'mech', turn: 3 });
  assert.deepEqual(normalizeLook({ model: 'http://x/y.glb', turn: 1.5 }), { ...DEFAULT_LOOK });
  assert.equal(partsKey({ ...DEFAULT_LOOK, model: 'mech', turn: 1 }), partsKey(DEFAULT_LOOK), 'a model leaves the sprite alone');
  assert.equal(partsKey({ ...DEFAULT_LOOK, armor: 'gold' }), partsKey(DEFAULT_LOOK));
  assert.notEqual(partsKey({ ...DEFAULT_LOOK, back: 'wings' }), partsKey(DEFAULT_LOOK));
});

test('every colour preset makes a full ramp, light to dark', () => {
  const lum = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const c of COLOR_CHANNELS) {
    for (const preset of LOOK_COLORS[c.key]) {
      const ramp = colorRamp(c.key, preset);
      const tones = Object.values(ramp);
      assert.ok(tones.every((h) => /^#[0-9a-f]{6}$/.test(h)), `${c.key}.${preset.id}`);
      for (let i = 1; i < tones.length; i++) assert.ok(lum(tones[i]) < lum(tones[i - 1]), `${c.key}.${preset.id}: tone ${i} is darker`);
    }
    // Each non-default preset changes the palette the player is drawn with.
    for (const preset of LOOK_COLORS[c.key].slice(1)) assert.notEqual(playerPalette({ ...DEFAULT_LOOK, [c.key]: preset.id }, null), PAL, `${c.key}.${preset.id}`);
  }
});

test('the parts compose into every pose, inside the sprite, and each option changes how AXIOM looks', () => {
  const base = lookPoses(DEFAULT_LOOK);
  assert.deepEqual(Object.keys(base), Object.keys(PLAYER_POSES));
  for (const name of Object.keys(PLAYER_POSES)) assert.deepEqual(base[name].rows, PLAYER_POSES[name].rows, `default ${name}`);
  for (const s of LOOK_SLOTS) {
    for (const o of s.options.slice(1)) {
      const poses = lookPoses({ ...DEFAULT_LOOK, [s.key]: o.id });
      for (const [name, pose] of Object.entries(poses)) {
        assert.equal(pose.rows.length, 56, `${s.key}.${o.id} ${name}`);
        assert.ok(pose.rows.every((r) => r.length === 64));
      }
      assert.notDeepEqual(poses.idle0.rows, base.idle0.rows, `${s.key}.${o.id} looks like the default`);
    }
  }
  // Nothing a part draws is cut off by the 64x56 sprite: every part sits at least a pixel inside it, in
  // every pose offset (the upper body moves by up to 3 px).
  const inside = (p, label) => {
    const w = Math.max(...p.rows.map((r) => r.length));
    assert.ok(p.X + 32 - 3 >= 0 && p.X + 32 + w + 3 <= 64, `${label}: x`);
    assert.ok(p.Y + 56 - 3 >= 0 && p.Y + 56 + p.rows.length <= 56, `${label}: y`);
  };
  for (const [id, h] of Object.entries(HEADS)) inside(h.part, `head ${id}`);
  for (const [id, t] of Object.entries(TORSOS)) inside(t, `body ${id}`);
  for (const [id, sh] of Object.entries(SHOULDERS)) {
    inside(sh.back, `arms ${id} back`);
    inside(sh.front, `arms ${id} front`);
  }
  for (const [id, b] of Object.entries(BACKS)) inside(b, `back ${id}`);
});

test("the hurt face darkens each head's visor", () => {
  for (const id of Object.keys(HEADS)) {
    const p = lookPoses({ ...DEFAULT_LOOK, head: id });
    const lights = (rows) => rows.join('').replace(/[^12345]/g, '').length;
    assert.ok(lights(p.hurt.rows) < lights(p.idle0.rows), `${id}: hurt has fewer lights`);
    assert.ok(p.hurt.rows.join('').includes('v'), `${id}: the dark visor shows`);
  }
});

test('the look is saved and reloaded, a bad one is repaired, and it rides into battle without changing it', () => {
  const storage = memoryStorage();
  const a = new SaveData(storage);
  assert.deepEqual(a.data.look, DEFAULT_LOOK);
  const mine = { head: 'nova', body: 'aegis', arms: 'stinger', legs: 'stealth', back: 'scarf', armor: 'gold', suit: 'black', lights: 'magenta', model: 'custom', turn: 2 };
  a.data.look = Object.freeze({ ...mine });
  a.persist();
  assert.deepEqual(new SaveData(storage).data.look, mine);
  storage.setItem('cybermetal-gridwars-save-v1', JSON.stringify({ ...a.data, look: { head: 'lizard', armor: 'gold' } }));
  assert.deepEqual(new SaveData(storage).data.look, { ...DEFAULT_LOOK, armor: 'gold' });
  // An old save without a look gets AXIOM's.
  const { look, ...old } = a.data;
  storage.setItem('cybermetal-gridwars-save-v1', JSON.stringify(old));
  assert.deepEqual(new SaveData(storage).data.look, DEFAULT_LOOK);
  assert.ok(look);

  // Battles carry it for the renderer; the sim plays out exactly the same with any look.
  const run = (lk) => {
    const s = new SaveData(null);
    s.data.look = lk;
    const b = new Battle({ seed: 11, encounter: ENCOUNTERS[0], player: s.battlePlayer(), shuffle: true });
    const bot = autopilot();
    for (let i = 0; i < 1200 && !b.done; i++) b.step(bot(b));
    return { b, state: JSON.stringify({ hp: b.player.hp, col: b.player.col, row: b.player.row, frame: b.frame, foes: b.entities.map((e) => [e.type, e.hp, e.col, e.row]) }) };
  };
  const plain = run(DEFAULT_LOOK);
  const fancy = run(Object.freeze({ ...mine }));
  assert.deepEqual(fancy.b.player.data.look, mine);
  assert.equal(fancy.state, plain.state);
});
