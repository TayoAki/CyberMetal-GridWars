import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DT, GARAGE_SAFE } from '../src/world/sim.js';
import { PLAY_RADIUS } from '../src/world/terrain.js';
import { PARTS, STARTER, buildKit, partsIn } from '../src/world/parts.js';
import { CHIPS } from '../src/world/combat.js';
import {
  ELEMENTS, ELEMENT_KEYS, STATUS, MODS, MOD_KEYS, STARTER_MODS, MAX_DESIGNS, MAX_MODS, CAPACITY, NULL_BONUS, NAME_MAX, FORM,
  basesFor, capacityOf, memoryUsed, modFits, cleanName, defaultDesign, normalizeDesign, applyDesign, encodeDesign, decodeDesign,
  designSummary, weakViruses,
} from '../src/world/forge.js';
import { Rng } from '../src/engine/rng.js';
import { quiet, run, place, dummy } from './world_helpers.js';

// The forge: weapons the player designs from a base part, a look, an element and mods.

const types = (ev, type) => ev.filter((x) => x.type === type);
const tough = (e, hp = 5000) => {
  e.hp = e.maxHp = hp;
  return e;
};
const close = (a, b) => Math.abs(a - b) < 1e-9;
const mash = (i) => ({ attack: i % 6 < 3 });
const center = (e) => ({ x: e.x, y: e.y + e.def.height * 0.5, z: e.z });

// A design: the base's default with some fields (and form fields) changed.
function design(slot, base, over = {}) {
  const d = defaultDesign(slot, base);
  return { ...d, ...over, form: { ...d.form, ...over.form } };
}

// Forge a design and equip it, owning its base and unlocking its mods first. Returns the new design's id.
function wield(w, d) {
  w.owned.add(d.base);
  for (const m of d.mods) w.programs.add(m);
  w.garage({ op: 'forge', design: d });
  const saved = types(w.drainEvents(), 'design-saved')[0];
  assert.ok(saved, `forged ${JSON.stringify(d)}`);
  w.garage({ op: 'equip-design', id: saved.id });
  w.drainEvents();
  return saved.id;
}

// Tap the gun at a virus `n` times, a shot every `gap` frames; returns every event.
function shootAt(w, e, n = 1, gap = 12) {
  return run(w, n * gap, (i) => ({ shoot: i % gap === 0, aimPoint: center(e) }));
}

// A random valid design (mods picked at random while they fit).
function randomDesign(rng) {
  const slot = rng.chance(0.5) ? 'arm' : 'gun';
  const d = {
    name: rng.pick(['Blaze', "Rock'n Roll!", 'Q-7', 'Tide & Volt', 'X+', 'Ember 2']), slot, base: rng.pick(basesFor(slot)),
    form: { shape: rng.int(4), size: rng.int(3), color: rng.int(FORM.palette.length), glow: rng.int(FORM.palette.length) },
    element: rng.pick(ELEMENT_KEYS), mods: [],
  };
  for (const m of rng.shuffle(MOD_KEYS.filter((k) => modFits(k, d)))) {
    if (d.mods.length < MAX_MODS && memoryUsed([...d.mods, m]) <= capacityOf(d) && rng.chance(0.6)) d.mods.push(m);
  }
  return d;
}

// ------------------------------------------------------------------ designs

test('every arm and gun part is a base to forge from, with four shapes, and the default design is valid', () => {
  for (const slot of ['arm', 'gun']) {
    assert.deepEqual(basesFor(slot), partsIn(slot));
    for (const base of basesFor(slot)) {
      assert.equal(FORM.shapes[base].length, 4, base);
      const { design: d, error } = normalizeDesign(defaultDesign(slot, base));
      assert.ok(d && !error, base);
      assert.equal(d.name, `My ${PARTS[base].name}`);
    }
  }
  assert.equal(FORM.palette.length, 12);
  assert.ok(FORM.palette.length <= 16, 'a colour fits in four bits of the share code');
  for (const k of MOD_KEYS) {
    const m = MODS[k];
    assert.ok(m.name && m.desc && m.cost > 0 && m.cost <= CAPACITY && m.slots.length, k);
  }
  assert.deepEqual(STARTER_MODS, MOD_KEYS.filter((k) => MODS[k].price === 0));
  assert.ok(STARTER_MODS.length >= 4 && STARTER_MODS.length < MOD_KEYS.length, 'some mods to start with, some to earn');
});

test('designs are checked: unknown pieces, mods that do not fit and too many mods are refused', () => {
  const bad = (over) => normalizeDesign({ ...defaultDesign('arm', 'saber'), ...over }).error;
  assert.ok(bad({ slot: 'legs' }), 'legs are not forged');
  assert.ok(bad({ base: 'buster' }), 'a gun is not an arm');
  assert.ok(bad({ base: 'laser' }));
  assert.ok(bad({ element: 'ice' }));
  assert.ok(bad({ form: { shape: 4, size: 1, color: 0, glow: 0 } }));
  assert.ok(bad({ form: { shape: 0, size: 3, color: 0, glow: 0 } }));
  assert.ok(bad({ form: { shape: 0, size: 1, color: 12, glow: 0 } }));
  assert.ok(bad({ form: { shape: 0.5, size: 1, color: 0, glow: 0 } }));
  assert.ok(bad({ form: null }));
  assert.match(bad({ mods: ['split'] }), /Split/, 'Split is for guns');
  assert.match(bad({ mods: ['heavy', 'swift', 'reach', 'burst'] }), /at most 3/);
  assert.match(bad({ mods: ['nope'] }), /doesn't fit/);
  assert.ok(normalizeDesign({ ...defaultDesign('gun', 'bomber'), mods: ['pierce'] }).error, 'bombs burst, they do not pierce');
  assert.ok(normalizeDesign({ ...defaultDesign('gun', 'railgun'), mods: ['pierce'] }).error, 'the beam pierces already');
  assert.ok(normalizeDesign({ ...defaultDesign('gun', 'railgun'), mods: ['homing'] }).error, 'a beam cannot curve');
  assert.ok(normalizeDesign({ ...defaultDesign('gun', 'spreader'), mods: ['pierce', 'homing'] }).design);
  for (const junk of [null, undefined, 'saber', 7, []]) assert.ok(normalizeDesign(junk).error);
  // A mod listed twice counts once; ids are kept only when sensible.
  assert.deepEqual(normalizeDesign({ ...defaultDesign('arm', 'saber'), mods: ['heavy', 'heavy'] }).design.mods, ['heavy']);
  assert.equal(normalizeDesign({ ...defaultDesign('arm', 'saber'), id: 4 }).design.id, 4);
  assert.equal(normalizeDesign({ ...defaultDesign('arm', 'saber'), id: 'x' }).design.id, undefined);
  assert.equal(normalizeDesign({ ...defaultDesign('arm', 'saber'), id: 1000 }).design.id, undefined);
});

test('mods must fit the weapon\'s memory, and a Null weapon has two MB more', () => {
  const load = ['chain', 'burst', 'heavy'];
  assert.equal(memoryUsed(load), CAPACITY + NULL_BONUS);
  assert.ok(normalizeDesign(design('arm', 'saber', { mods: load })).design, 'fits a Null weapon');
  for (const el of ELEMENT_KEYS.filter((k) => k !== 'none')) {
    assert.match(normalizeDesign(design('arm', 'saber', { element: el, mods: load })).error, /memory/, el);
    assert.equal(capacityOf(design('gun', 'buster', { element: el })), CAPACITY);
  }
  assert.equal(capacityOf(design('gun', 'buster')), CAPACITY + NULL_BONUS);
});

test('names are plain text: odd characters are dropped, spaces tidied, and the length capped', () => {
  const s = cleanName('<img src=x onerror="alert(1)">');
  assert.ok(!/[<>="()]/.test(s) && s.length <= NAME_MAX, s);
  assert.equal(cleanName('  Blaze    Edge  '), 'Blaze Edge');
  assert.equal(cleanName("Rock'n Roll!"), "Rock'n Roll!");
  assert.equal(cleanName('A'.repeat(40)).length, NAME_MAX);
  assert.equal(cleanName('🔥🔥'), 'Custom');
  assert.equal(cleanName(''), 'Custom');
  assert.equal(normalizeDesign(design('gun', 'railgun', { name: '   ' })).design.name, 'My Railgun');
});

test('the summary says what the element and each mod do, naming the viruses weak to it', () => {
  assert.deepEqual(weakViruses('fire'), ['Rivets']);
  assert.deepEqual(weakViruses('aqua'), ['Plinkers']);
  assert.deepEqual(weakViruses('elec'), ['Dartfins']);
  assert.deepEqual(weakViruses('wood'), [], 'no Elec viruses yet');
  assert.deepEqual(weakViruses('none'), []);
  const lines = designSummary(design('arm', 'saber', { element: 'fire', form: { size: 2 }, mods: ['heavy', 'wave'] }));
  assert.match(lines[0], /burns.*Rivets/);
  assert.match(lines[1], /Size L: reach \+8%, speed −5%/);
  assert.deepEqual(lines.slice(2), [`Heavy: ${MODS.heavy.desc}`, `Wave: ${MODS.wave.desc}`]);
  assert.match(designSummary(design('gun', 'buster', { element: 'wood' }))[0], /none out here yet/);
  assert.match(designSummary(design('gun', 'buster'))[0], /\+2 MB/);
  assert.equal(designSummary(design('gun', 'buster', { form: { size: 2 } })).length, 1, 'a gun\'s size is only its look');
});

// ------------------------------------------------------------------ share codes

test('share codes round-trip every design, and survive sloppy retyping', () => {
  const rng = new Rng(11);
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const d = normalizeDesign(randomDesign(rng)).design;
    const code = encodeDesign(d);
    assert.match(code, /^CMW(-[0-9A-HJKMNP-TV-Z]{1,4})+$/);
    assert.ok(code.length <= 60, code);
    assert.deepEqual(decodeDesign(code).design, d, code);
    // Lower case, spaces for dashes, O for 0 and l for 1 all read back the same.
    const sloppy = ` ${code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l')} `;
    assert.deepEqual(decodeDesign(sloppy).design, d, sloppy);
    assert.deepEqual(decodeDesign(code.slice(4)).design, d, 'the prefix is optional');
    seen.add(`${d.base}/${d.element}`);
  }
  assert.equal(seen.size, 8 * ELEMENT_KEYS.length, 'every base with every element');
  // A code carries no save slot id.
  assert.equal(decodeDesign(encodeDesign({ ...design('arm', 'claws'), id: 5 })).design.id, undefined);
});

test('a code with any one character wrong is caught, and junk is refused with a reason', () => {
  const code = encodeDesign(design('arm', 'lance', { name: 'Volt Pike', element: 'elec', mods: ['reach', 'chain'] }));
  const body = code.slice(4).replace(/-/g, '');
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let tries = 0;
  for (let i = 0; i < body.length; i++) {
    for (const ch of B32) {
      if (ch === body[i]) continue;
      tries++;
      const r = decodeDesign(body.slice(0, i) + ch + body.slice(i + 1));
      assert.ok(r.error, `missed a typo at ${i}: ${ch}`);
    }
  }
  assert.ok(body.length >= 25 && tries === body.length * 31);
  // A character added or left off anywhere is caught too (by the length check and the 16-bit checksum).
  const rng = new Rng(3);
  for (let k = 0; k < 12; k++) {
    const b = encodeDesign(normalizeDesign(randomDesign(rng)).design).slice(4).replace(/-/g, '');
    for (let i = 0; i <= b.length; i++) {
      if (i < b.length) assert.ok(decodeDesign(b.slice(0, i) + b.slice(i + 1)).error, `missed a deletion at ${i} of ${b}`);
      for (const ch of B32) assert.ok(decodeDesign(b.slice(0, i) + ch + b.slice(i)).error, `missed an insertion of ${ch} at ${i} of ${b}`);
    }
  }
  assert.match(decodeDesign('').error, /isn't a weapon code/);
  assert.match(decodeDesign('my sword, please!').error, /isn't a weapon code/);
  assert.match(decodeDesign('hello world').error, /too short/, 'looks like code letters, but far too few');
  assert.match(decodeDesign('CMW-U000').error, /isn't a weapon code/, 'U is not a code letter');
  assert.match(decodeDesign('CMW-0400').error, /too short/);
  assert.match(decodeDesign(code.slice(0, -5)).error, /cut off|too short/);
  assert.match(decodeDesign(`${code}0`).error, /typo/);
  assert.match(decodeDesign(`1${body.slice(1)}`).error, /another version/);
  assert.match(decodeDesign('CMW-' + '0'.repeat(70)).error, /isn't a weapon code/, 'too long to be one');
  // A well-formed code for a design that breaks the rules (Split on a sword) is still refused.
  assert.match(decodeDesign(encodeDesign({ ...design('arm', 'saber'), mods: ['split'] })).error, /Split/);
});

// ------------------------------------------------------------------ the forge in the garage

test('forging needs the base part and the mod programs; a program is learned from viruses, then costs DATA', () => {
  const w = quiet();
  let ev = run(w, 1, { garage: { op: 'forge', design: design('arm', 'lance') } });
  assert.deepEqual([types(ev, 'garage-denied')[0]?.reason, types(ev, 'garage-denied')[0]?.part], ['locked', 'lance']);
  w.owned.add('lance');
  ev = run(w, 1, { garage: { op: 'forge', design: design('arm', 'lance', { mods: ['chain'] }) } });
  assert.deepEqual([types(ev, 'garage-denied')[0]?.reason, types(ev, 'garage-denied')[0]?.mod], ['program', 'chain']);
  // Chain is the Dartfin's: it takes five Dartfin deletes before DATA can unlock it.
  assert.deepEqual(MODS.chain.learn, { from: 'dartfin', deletes: 5 });
  w.wallet = 100;
  ev = run(w, 1, { garage: { op: 'unlock', mod: 'chain' } });
  assert.deepEqual([types(ev, 'garage-denied')[0]?.reason, types(ev, 'garage-denied')[0]?.need], ['learn', 5]);
  const ready = [];
  for (let i = 0; i < 5; i++) {
    w.killEnemy(dummy(w, 'dartfin', 40));
    ready.push(...types(run(w, 1), 'mod-ready').map((x) => x.mod));
  }
  assert.deepEqual(ready, ['homing', 'chain'], 'the third Dartfin teaches Homing, the fifth Chain');
  assert.equal(w.deletesOf('dartfin'), 5);
  w.pickups = [];
  w.wallet = 10;
  ev = run(w, 1, { garage: { op: 'unlock', mod: 'chain' } });
  assert.equal(types(ev, 'garage-denied')[0]?.reason, 'data');
  // Training dummies teach nothing.
  run(w, 1, { garage: { op: 'dummy' } });
  for (const e of w.enemies) if (e.dummy) w.killEnemy(e);
  assert.equal(w.deletesOf('rivet'), 0);
  for (const e of w.enemies) if (e.dummy) e.alive = false;
  w.wallet = 100;
  ev = run(w, 1, { garage: { op: 'unlock', mod: 'chain' } });
  assert.deepEqual(types(ev, 'program-unlocked')[0], { type: 'program-unlocked', mod: 'chain', price: MODS.chain.price });
  assert.equal(w.wallet, 100 - MODS.chain.price);
  ev = run(w, 1, { garage: { op: 'unlock', mod: 'chain' } });
  assert.equal(ev.length, 0, 'unlocking twice does nothing');
  ev = run(w, 1, { garage: { op: 'unlock', mod: 'warp' } });
  assert.equal(ev.length, 0);
  ev = run(w, 1, { garage: { op: 'forge', design: design('arm', 'lance', { name: 'Volt Pike', element: 'elec', mods: ['chain'] }) } });
  const saved = types(ev, 'design-saved')[0];
  assert.deepEqual([saved.id, saved.name, saved.slot], [1, 'Volt Pike', 'arm']);
  assert.equal(w.designs.length, 1);
  ev = run(w, 1, { garage: { op: 'forge', design: { ...design('arm', 'lance'), mods: ['split'] } } });
  assert.deepEqual([types(ev, 'garage-denied')[0]?.reason, /Split/.test(types(ev, 'garage-denied')[0]?.message)], ['design', true]);
});

test('equipping a design swaps in its base and effects; editing it applies at once; the plain part takes it off', () => {
  const w = quiet();
  w.owned.add('lance');
  w.programs.add('chain');
  run(w, 1, { garage: { op: 'forge', design: design('arm', 'lance', { name: 'Volt Pike', element: 'elec', mods: ['chain', 'reach'] }) } });
  let ev = run(w, 1, { garage: { op: 'equip-design', id: 1 } });
  const eq = types(ev, 'part-equipped')[0];
  assert.deepEqual([eq.part, eq.slot, eq.design, eq.name], ['lance', 'arm', 1, 'Volt Pike']);
  assert.equal(w.loadout.arm, 'lance');
  assert.equal(w.equipped.arm, 1);
  assert.deepEqual(w.kit.armFx, { element: 'elec', crit: false, chain: true, burst: false, wave: false });
  assert.equal(w.kit.arm.magnet, buildKit({ ...STARTER, arm: 'lance' }).arm.magnet + 3);
  // Re-forging the same id edits it in place, and the kit follows.
  ev = run(w, 1, { garage: { op: 'forge', design: { ...w.designs[0], element: 'fire', mods: ['reach'] } } });
  assert.equal(types(ev, 'design-saved')[0]?.id, 1);
  assert.equal(w.designs.length, 1);
  assert.equal(w.kit.armFx.element, 'fire');
  assert.ok(!w.kit.armFx.chain);
  // A weapon keeps its slot.
  ev = run(w, 1, { garage: { op: 'forge', design: { ...design('gun', 'buster'), id: 1 } } });
  assert.match(types(ev, 'garage-denied')[0]?.message, /slot/);
  // Equipping the plain Lance (or any arm part) takes the design off.
  ev = run(w, 1, { garage: { op: 'equip', part: 'lance' } });
  assert.equal(types(ev, 'part-equipped')[0]?.design, undefined);
  assert.equal(w.equipped.arm, null);
  assert.equal(w.kit.armFx, undefined);
  assert.equal(w.kit.arm.magnet, buildKit({ ...STARTER, arm: 'lance' }).arm.magnet);
  // A design whose base you no longer own can't be equipped (a save edited by hand, say).
  w.owned.delete('lance');
  ev = run(w, 1, { garage: { op: 'equip-design', id: 1 } });
  assert.equal(types(ev, 'garage-denied')[0]?.reason, 'locked');
  ev = run(w, 1, { garage: { op: 'equip-design', id: 42 } });
  assert.match(types(ev, 'garage-denied')[0]?.message, /no such/);
});

test('six designs at most; deleting the equipped one puts the plain part back, and frees its id', () => {
  const w = quiet();
  for (let i = 0; i < MAX_DESIGNS; i++) run(w, 1, { garage: { op: 'forge', design: design('gun', 'buster', { name: `Gun ${i}` }) } });
  assert.deepEqual(w.designs.map((d) => d.id), [1, 2, 3, 4, 5, 6]);
  let ev = run(w, 1, { garage: { op: 'forge', design: design('gun', 'buster') } });
  assert.equal(types(ev, 'garage-denied')[0]?.reason, 'full');
  run(w, 1, { garage: { op: 'equip-design', id: 3 } });
  assert.equal(w.kit.gunDesign.name, 'Gun 2');
  ev = run(w, 1, { garage: { op: 'delete-design', id: 3 } });
  assert.deepEqual(types(ev, 'design-deleted')[0], { type: 'design-deleted', id: 3, name: 'Gun 2' });
  assert.equal(w.equipped.gun, null);
  assert.equal(w.kit.gunFx, undefined);
  assert.equal(w.loadout.gun, 'buster');
  run(w, 1, { garage: { op: 'forge', design: design('gun', 'buster', { name: 'Again' }) } });
  assert.equal(w.designs.find((d) => d.name === 'Again')?.id, 3);
});

test('the forge is part of the garage: none of it works in a fight', () => {
  const w = quiet();
  run(w, 1, { garage: { op: 'forge', design: design('arm', 'saber') } });
  w.wallet = 999;
  dummy(w, 'rivet', GARAGE_SAFE - 5);
  const cmds = [{ op: 'forge', design: design('arm', 'saber') }, { op: 'equip-design', id: 1 }, { op: 'delete-design', id: 1 }, { op: 'unlock', mod: 'crit' }, { op: 'dummy' }];
  for (const cmd of cmds) {
    const ev = run(w, 1, { garage: cmd });
    assert.equal(types(ev, 'garage-denied')[0]?.reason, 'combat', cmd.op);
  }
  assert.equal(w.designs.length, 1);
  assert.equal(w.wallet, 999);
});

test('applying a design scales the base part\'s numbers, and never changes the catalog', () => {
  const pristine = JSON.stringify(buildKit(STARTER));
  const base = buildKit(STARTER);
  const s0 = base.arm.ground[0];
  const arm = (over) => applyDesign(buildKit(STARTER), design('arm', 'saber', over));
  const heavy = arm({ mods: ['heavy'] }).arm;
  assert.equal(heavy.ground[0].dmg, Math.round(s0.dmg * 1.3));
  assert.ok(close(heavy.ground[0].dur, s0.dur * 1.15) && close(heavy.ground[0].hit, s0.hit * 1.15));
  assert.ok(close(heavy.ground[0].push, s0.push * 1.5));
  assert.equal(heavy.launcher.dmg, Math.round(base.arm.launcher.dmg * 1.3));
  assert.equal(heavy.air.at(-1).dmg, Math.round(base.arm.air.at(-1).dmg * 1.3));
  const swift = arm({ mods: ['swift'] }).arm;
  assert.ok(close(swift.ground[0].cancel, s0.cancel * 0.85) && swift.ground[0].dmg === s0.dmg);
  const reach = arm({ mods: ['reach'] }).arm;
  assert.ok(close(reach.ground[0].reach, s0.reach * 1.25));
  assert.equal(reach.magnet, base.arm.magnet + 3);
  // Size: S is a little quicker with less reach, L the other way round.
  const [S, L] = [arm({ form: { size: 0 } }).arm, arm({ form: { size: 2 } }).arm];
  assert.ok(S.ground[0].reach < s0.reach && S.ground[0].dur < s0.dur);
  assert.ok(L.air[0].reach > base.arm.air[0].reach && L.launcher.dur > base.arm.launcher.dur);
  assert.deepEqual(arm({}).arm, base.arm, 'a plain M design is the part itself');
  // Guns.
  const g = base.gun;
  const gun = (over) => applyDesign(buildKit(STARTER), design('gun', 'buster', over)).gun;
  assert.ok(close(gun({ mods: ['swift'] }).cooldown, g.cooldown * 0.75));
  assert.ok(close(gun({ mods: ['heavy'] }).cooldown, g.cooldown * 1.15));
  const q = gun({ mods: ['quick'] }).charge;
  assert.ok(close(q.delay, g.charge.delay * 0.65) && close(q.mid, g.charge.mid * 0.65) && close(q.full, g.charge.full * 0.65));
  assert.deepEqual(gun({ form: { size: 2, shape: 3 } }), g, 'a gun\'s look changes nothing');
  assert.equal(JSON.stringify(buildKit(STARTER)), pristine);
});

// ------------------------------------------------------------------ elements

test('each element deals double damage to the virus element it beats (Fire > Wood > Elec > Aqua > Fire)', () => {
  assert.deepEqual(Object.fromEntries(ELEMENT_KEYS.map((k) => [k, ELEMENTS[k].beats])), { none: null, fire: 'wood', aqua: 'fire', elec: 'aqua', wood: 'elec' });
  for (const element of ELEMENT_KEYS) {
    for (const virus of ['rivet', 'plinker', 'dartfin']) {
      const w = quiet();
      wield(w, design('gun', 'buster', { element }));
      const e = tough(dummy(w, virus, 6));
      const hit = types(shootAt(w, e), 'enemy-hit')[0];
      const weak = ELEMENTS[element].beats === e.def.element;
      assert.ok(hit, `${element} on ${virus}`);
      assert.equal(hit.weak, weak, `${element} on ${virus}`);
      assert.equal(hit.amount, 6 * (weak ? 2 : 1), `${element} on ${virus}`);
      assert.equal(hit.element, element === 'none' ? null : element);
    }
  }
});

test('chips carry their virus\'s element: Cannon (Fire) doubles on Rivets, but chips leave no status', () => {
  assert.deepEqual([CHIPS.shockwave.element, CHIPS.cannon.element, CHIPS.findash.element], ['wood', 'fire', 'aqua']);
  const amount = (target) => {
    const w = quiet();
    w.killEnemy(dummy(w, 'plinker', 30)); // learn Cannon
    run(w, 2);
    const e = tough(dummy(w, target, 8));
    run(w, 2, (i) => ({ lock: i === 0 }));
    const ev = run(w, 40, (i) => ({ chip: i === 0 ? 1 : 0 }));
    const hit = types(ev, 'enemy-hit').find((x) => x.id === e.id);
    assert.ok(!(e.burn > 0), 'no burn from a chip');
    return hit;
  };
  const onRivet = amount('rivet');
  const onPlinker = amount('plinker');
  assert.ok(onRivet.weak && !onPlinker.weak);
  assert.equal(onRivet.amount, onPlinker.amount * 2);
});

test('Fire burns: four ticks of damage over two seconds, refreshed by another hit, and it can finish a virus', () => {
  const w = quiet();
  wield(w, design('gun', 'buster', { element: 'fire' }));
  const e = tough(dummy(w, 'plinker', 6));
  shootAt(w, e);
  assert.equal(e.burn, STATUS.burn.ticks);
  let ev = run(w, 200);
  const burns = types(ev, 'enemy-hit').filter((x) => x.kind === 'burn');
  assert.equal(burns.length, STATUS.burn.ticks);
  assert.ok(burns.every((b) => b.amount === STATUS.burn.dmg && b.element === 'fire'));
  assert.equal(e.burn, 0);
  // Hitting again while it burns starts the four ticks over without resetting the tick clock.
  shootAt(w, e);
  ev = run(w, 40); // one tick so far
  shootAt(w, e);
  ev.push(...run(w, 240));
  assert.equal(types(ev, 'enemy-hit').filter((x) => x.kind === 'burn').length, 1 + STATUS.burn.ticks);
  // A burn tick can delete a virus (and it drops DATA as usual).
  const v = dummy(w, 'rivet', 6, 4);
  v.hp = 12 + 3; // the shot does 12 (Fire on Wood), the first tick the rest
  ev = shootAt(w, v);
  ev.push(...run(w, 60));
  assert.ok(types(ev, 'delete').some((x) => x.id === v.id));
  // A plain buster doesn't burn.
  const w2 = quiet();
  const e2 = tough(dummy(w2, 'plinker', 6));
  shootAt(w2, e2);
  assert.ok(!(e2.burn > 0));
});

test('Aqua soaks: a soaked virus moves at 55% and its wind-ups take longer', () => {
  const walk = (soaked) => {
    const w = quiet();
    const e = place(w, 'rivet', 20, 'chase');
    const z0 = e.z;
    for (let i = 0; i < 40; i++) {
      if (soaked) e.soak = STATUS.soak.time;
      run(w, 1);
    }
    return z0 - e.z;
  };
  assert.ok(Math.abs(walk(true) / walk(false) - STATUS.soak.speed) < 0.01);
  const windup = (soaked) => {
    const w = quiet();
    const e = place(w, 'rivet', 6, 'windup');
    e.t = 0.75;
    if (soaked) e.soak = STATUS.soak.time;
    for (let i = 1; i < 200; i++) if (types(run(w, 1), 'slam').length) return i;
    return Infinity;
  };
  const [dry, wet] = [windup(false), windup(true)];
  assert.ok(Math.abs(wet - dry / STATUS.soak.clock) <= 2, `${dry} -> ${wet}`);
  // An Aqua hit soaks; the soak wears off.
  const w = quiet();
  wield(w, design('gun', 'buster', { element: 'aqua' }));
  const e = tough(dummy(w, 'plinker', 6));
  shootAt(w, e);
  assert.ok(e.soak > 2);
  run(w, Math.ceil(STATUS.soak.time / DT) + 2);
  assert.ok(!(e.soak > 0));
});

test('Elec shocks: three hits stun, even through revenge armor; then it resists, and needs more hits next time', () => {
  const w = quiet();
  wield(w, design('gun', 'buster', { element: 'elec' }));
  const e = tough(dummy(w, 'plinker', 6));
  e.armor = 99;
  const stuns = [];
  for (let n = 1; n <= 100; n++) {
    const ev = shootAt(w, e, 1, 10); // six hits a second
    assert.ok(types(ev, 'enemy-hit')[0]?.armored, 'armored hits');
    if (types(ev, 'stun').length) {
      stuns.push(n);
      assert.ok(e.flinch > STATUS.shock.stun - 10 * DT, 'stunned through the armor');
    }
  }
  // Stunned on hit 3; then 4 s (24 hits) of resistance; then 5 more hits; then 7, and 7 from then on.
  const gap = (STATUS.shock.stun + STATUS.shock.immune) / (10 * DT);
  assert.equal(stuns[0], 3);
  assert.equal(stuns[1], stuns[0] + gap + 5);
  assert.equal(stuns[2], stuns[1] + gap + 7);
  assert.equal(stuns[3], stuns[2] + gap + 7);
});

// The share of frames a virus can't act (flinching or stunned) under steady fire. (The design-practice notes
// measured the first version of Elec at 99.7%: a permanent lock.)
function lockShare(element, taps = 4, seconds = 20) {
  const w = quiet();
  wield(w, design('gun', 'buster', { element }));
  const e = place(w, 'rivet', 6, 'chase');
  e.hp = e.maxHp = 1e6;
  const gap = Math.round(60 / taps);
  let locked = 0;
  for (let i = 0; i < seconds * 60; i++) {
    run(w, 1, { shoot: i % gap === 0, aimPoint: center(e) });
    if (e.flinch > 0) locked++;
    if (Math.hypot(e.x - w.player.x, e.z - w.player.z) < 3) {
      // Keep it at range: a Rivet that reaches the player would start its own slam.
      e.x = w.player.x;
      e.z = w.player.z + 6;
    }
  }
  return locked / (seconds * 60);
}

test('Elec can\'t lock a virus down: under rapid fire it acts about as often as with no element', () => {
  for (const taps of [3, 6]) {
    const none = lockShare('none', taps);
    const elec = lockShare('elec', taps);
    assert.ok(elec < 0.65 && elec - none < 0.25, `${taps}/s: Null ${none.toFixed(2)}, Elec ${elec.toFixed(2)}`);
  }
});

test('Wood leeches: hits heal whole HP, a share of the damage dealt, never past full', () => {
  const w = quiet();
  wield(w, design('arm', 'saber', { element: 'wood' }));
  w.player.hp = 40;
  const e = tough(dummy(w, 'plinker', 2.5));
  const ev = run(w, 120, mash);
  const dealt = types(ev, 'enemy-hit').reduce((n, x) => n + x.amount, 0);
  const healed = types(ev, 'leech').reduce((n, x) => n + x.amount, 0);
  assert.ok(dealt > 50, `dealt ${dealt}`);
  assert.equal(w.player.hp, 40 + healed);
  assert.ok(Number.isInteger(w.player.hp));
  assert.ok(Math.abs(healed - dealt * STATUS.leech) < 1, `${healed} of ${dealt}`);
  // At full HP nothing is banked for later.
  w.player.hp = w.player.maxHp;
  run(w, 120, mash);
  assert.equal(w.player.hp, w.player.maxHp);
  assert.ok(w.leech < 1);
  assert.ok(e.alive);
});

// ------------------------------------------------------------------ mods

test('Heavy hits harder; Critical doubles every fourth hit', () => {
  const first = (mods) => {
    const w = quiet();
    wield(w, design('arm', 'saber', { mods }));
    tough(dummy(w, 'plinker', 2.5));
    return types(run(w, 30, (i) => ({ attack: i === 0 })), 'enemy-hit')[0].amount;
  };
  assert.equal(first(['heavy']), Math.round(first([]) * 1.3));
  const w = quiet();
  wield(w, design('gun', 'buster', { mods: ['crit'] }));
  const e = tough(dummy(w, 'plinker', 6));
  const hits = types(shootAt(w, e, 8, 10), 'enemy-hit');
  assert.deepEqual(hits.map((h) => h.amount), [6, 6, 6, 12, 6, 6, 6, 12]);
  assert.deepEqual(hits.map((h) => h.crit), [false, false, false, true, false, false, false, true]);
});

test('bonuses add up rather than multiply: a weak critical is ×3, a weak counter ×3', () => {
  const w = quiet();
  wield(w, design('gun', 'buster', { element: 'fire', mods: ['crit'] }));
  const e = tough(dummy(w, 'rivet', 6));
  const hits = types(shootAt(w, e, 4, 10), 'enemy-hit').filter((h) => h.kind !== 'burn');
  assert.deepEqual(hits.map((h) => h.amount), [12, 12, 12, 18]);
  // A counter (hitting a Rivet as it winds up) on top of its weakness: +100% +100%.
  const w2 = quiet();
  wield(w2, design('gun', 'buster', { element: 'fire' }));
  const r = place(w2, 'rivet', 6, 'windup');
  r.t = 0.75;
  r.hp = r.maxHp = 500;
  const hit = types(shootAt(w2, r), 'enemy-hit')[0];
  assert.ok(hit.counter && hit.weak);
  assert.equal(hit.amount, 6 * 3);
});

test('Chain: a hit arcs to the nearest other virus within 6 m for half damage, once', () => {
  const w = quiet();
  wield(w, design('gun', 'buster', { mods: ['chain'] }));
  const a = tough(dummy(w, 'plinker', 8));
  const b = tough(dummy(w, 'plinker', 8, 3.5));
  const c = tough(dummy(w, 'plinker', 8, -12));
  const ev = shootAt(w, a);
  const arcs = types(ev, 'arc');
  assert.equal(arcs.length, 1);
  assert.deepEqual([arcs[0].from, arcs[0].to], [a.id, b.id]);
  const hits = types(ev, 'enemy-hit');
  assert.deepEqual(hits.map((h) => [h.id, h.amount]), [[a.id, 6], [b.id, 3]]);
  assert.deepEqual(hits.map((h) => h.kind), ['buster', 'arc']);
  assert.equal(c.hp, c.maxHp);
  // Without the mod, nothing arcs.
  const w2 = quiet();
  const a2 = tough(dummy(w2, 'plinker', 8));
  tough(dummy(w2, 'plinker', 8, 3.5));
  assert.equal(types(shootAt(w2, a2), 'arc').length, 0);
});

test('Burst: shots burst on impact, and arm finishers explode around the target', () => {
  const w = quiet();
  wield(w, design('gun', 'buster', { mods: ['burst'] }));
  const a = tough(dummy(w, 'plinker', 8));
  const b = tough(dummy(w, 'rivet', 8, 2.2));
  const ev = shootAt(w, a);
  const imp = types(ev, 'impact')[0];
  assert.ok(imp.splash > 0);
  assert.deepEqual(types(ev, 'enemy-hit').map((h) => [h.id, h.amount]), [[a.id, 6], [b.id, 3]]);
  // A full charge's splash grows by a third.
  const w2 = quiet();
  wield(w2, design('gun', 'buster', { mods: ['burst'] }));
  run(w2, Math.ceil(w2.kit.gun.charge.full / DT) + 2, { shoot: true });
  run(w2, 1, { shoot: false });
  const shot = w2.shots.find((s) => s.kind === 'charge');
  assert.ok(shot && shot.splash > 3.4 * 1.3);
  // The saber's finisher sets off a burst.
  const w3 = quiet();
  wield(w3, design('arm', 'saber', { mods: ['burst'] }));
  tough(dummy(w3, 'plinker', 2.5));
  const ev3 = run(w3, 120, mash);
  assert.ok(types(ev3, 'burst').length >= 1);
  assert.ok(types(ev3, 'enemy-hit').some((h) => h.kind === 'burst'));
});

test('Wave: an arm finisher sends a shockwave along the ground that hits everything in its path', () => {
  const w = quiet();
  wield(w, design('arm', 'saber', { element: 'fire', mods: ['wave'] }));
  const a = tough(dummy(w, 'plinker', 2.5));
  const far = tough(dummy(w, 'rivet', 12));
  const ev = run(w, 150, mash);
  const casts = types(ev, 'wave-cast');
  assert.ok(casts.length >= 1);
  assert.equal(casts[0].element, 'fire');
  const waveHits = types(ev, 'enemy-hit').filter((h) => h.kind === 'swordwave');
  assert.ok(waveHits.some((h) => h.id === far.id), 'it reached the far Rivet');
  assert.ok(waveHits.find((h) => h.id === far.id).weak, 'and carried the Fire element');
  assert.ok(waveHits.some((h) => h.id === a.id) || a.hp < a.maxHp);
});

test('Pierce: shots pass through a line of viruses', () => {
  const hitIds = (mods) => {
    const w = quiet();
    wield(w, design('gun', 'buster', { mods }));
    const a = tough(dummy(w, 'plinker', 6));
    const b = tough(dummy(w, 'plinker', 14));
    const ev = run(w, 30, (i) => ({ shoot: i === 0, aimPoint: center(b) }));
    return [types(ev, 'enemy-hit').map((h) => h.id), [a.id, b.id], ev];
  };
  const [plain, [a]] = hitIds([]);
  assert.deepEqual(plain, [a]);
  const [pierced, both, ev] = hitIds(['pierce']);
  assert.deepEqual(pierced, both);
  assert.ok(types(ev, 'impact').some((x) => x.pass));
});

test('Homing: a shot fired well off target curves into it', () => {
  const hits = (mods) => {
    const w = quiet();
    wield(w, design('gun', 'buster', { mods }));
    const e = tough(dummy(w, 'plinker', 16));
    const p = w.player;
    const a = 0.3; // radians off
    const aim = { x: p.x + Math.sin(a) * 16, y: e.y + 0.75, z: p.z + Math.cos(a) * 16 };
    return types(run(w, 60, (i) => ({ shoot: i === 0, aimPoint: aim })), 'enemy-hit').length;
  };
  assert.equal(hits([]), 0);
  assert.equal(hits(['homing']), 1);
});

test('Split: the Buster fires three shots (side shots 60%), Spreader more pellets, Bomber more bombs, Railgun three beams', () => {
  const fired = (gun, charged = false) => {
    const w = quiet();
    wield(w, design('gun', gun, { mods: ['split'] }));
    if (charged) {
      run(w, Math.ceil(w.kit.gun.charge.full / DT) + 2, { shoot: true });
      w.shots = [];
      return { w, ev: run(w, 1, { shoot: false }) };
    }
    return { w, ev: run(w, 1, { shoot: true }) };
  };
  const b = fired('buster').w.shots;
  assert.deepEqual(b.map((s) => s.dmg), [6, 4, 4]);
  const spread = buildKit({ ...STARTER, gun: 'spreader' }).gun;
  assert.equal(fired('spreader').w.shots.length, spread.pellets[0] + 4);
  assert.equal(fired('bomber').w.shots.length, buildKit({ ...STARTER, gun: 'bomber' }).gun.count[0] + 2);
  assert.equal(types(fired('railgun', true).ev, 'beam').length, 3);
  assert.equal(fired('railgun').w.shots.filter((s) => s.kind === 'needle').length, 3);
});

test('Swift fires faster; Quick Charge reaches a full charge in 65% of the time', () => {
  const w = quiet();
  wield(w, design('gun', 'buster', { mods: ['swift'] }));
  run(w, 1, { shoot: true });
  assert.ok(close(w.player.fireCd, buildKit(STARTER).gun.cooldown * 0.75));
  const level = (mods) => {
    const v = quiet();
    wield(v, design('gun', 'buster', { mods }));
    run(v, Math.ceil((buildKit(STARTER).gun.charge.full * 0.65) / DT) + 2, { shoot: true });
    v.shots = [];
    run(v, 1, { shoot: false });
    return v.shots[0]?.kind;
  };
  assert.equal(level([]), 'mid');
  assert.equal(level(['quick']), 'charge');
});

test('Reach: a longer blade lunges from further away', () => {
  const reaches = (mods) => {
    const w = quiet();
    wield(w, design('arm', 'saber', { mods }));
    tough(dummy(w, 'plinker', 11.5));
    return types(run(w, 40, (i) => ({ attack: i === 0 })), 'enemy-hit').length > 0;
  };
  assert.equal(reaches([]), false);
  assert.equal(reaches(['reach']), true);
});

// ------------------------------------------------------------------ training dummies

test('training dummies: one of each virus ahead, they never fight back or break, and pack up later', () => {
  const w = quiet();
  let ev = run(w, 1, { garage: { op: 'dummy' } });
  const ids = types(ev, 'dummies')[0]?.ids;
  assert.equal(ids?.length, 3);
  const ds = w.enemies.filter((e) => e.dummy);
  assert.deepEqual(ds.map((e) => e.type), ['rivet', 'plinker', 'dartfin']);
  for (const e of ds) {
    const d = Math.hypot(e.x - w.player.x, e.z - w.player.z);
    assert.ok(d > 6 && d < 10, `${d}`);
  }
  assert.ok(w.canGarage(), 'they do not count as a fight');
  const id = wield(w, design('gun', 'buster', { element: 'fire', mods: ['burst', 'heavy'] }));
  assert.equal(w.equipped.gun, id);
  const hp = w.player.hp;
  const target = ds[0];
  target.hp = 30; // even a near-dead dummy never breaks
  ev = run(w, 900, (i) => ({ shoot: i % 9 === 0, aimPoint: center(target) }));
  assert.ok(types(ev, 'enemy-hit').some((h) => h.id === target.id && h.weak), 'Fire on the Rivet dummy shows WEAK');
  assert.equal(w.player.hp, hp);
  assert.ok(ds.every((e) => e.alive));
  assert.equal(types(ev, 'delete').length, 0);
  assert.equal(w.wallet, 0);
  assert.deepEqual(w.deck, []);
  // Calling them again replaces the set.
  run(w, 1, { garage: { op: 'dummy' } });
  run(w, 30); // they beam in
  assert.equal(w.enemies.filter((e) => e.alive && e.dummy).length, 3);
  // They leave when their time is up...
  for (const e of w.enemies) if (e.dummy) e.dummyT = 2 * DT;
  run(w, 3);
  assert.equal(w.enemies.filter((e) => e.alive && e.dummy).length, 0);
  // ...or when you walk away.
  run(w, 1, { garage: { op: 'dummy' } });
  run(w, 30);
  w.player.z -= 60;
  run(w, 2);
  assert.equal(w.enemies.filter((e) => e.alive && e.dummy).length, 0);
});

// ------------------------------------------------------------------ saves and replays

test('a save keeps designs, unlocked programs and what is equipped, and refuses junk', () => {
  const w = quiet();
  w.wallet = 500;
  w.owned.add('lance');
  w.owned.add('spreader');
  w.chips.findash = { deletes: 5, level: 2 }; // five Dartfins deleted: Chain is learned
  w.garage({ op: 'unlock', mod: 'chain' });
  w.garage({ op: 'forge', design: design('arm', 'lance', { name: 'Volt Pike', element: 'elec', mods: ['chain', 'reach'] }) });
  w.garage({ op: 'forge', design: design('gun', 'spreader', { name: 'Ember Fan', element: 'fire', form: { color: 4, glow: 6, shape: 2 }, mods: ['split'] }) });
  w.garage({ op: 'equip-design', id: 1 });
  w.garage({ op: 'equip-design', id: 2 });
  w.drainEvents();
  const save = JSON.parse(JSON.stringify(w.saveData()));
  assert.equal(save.v, 2);
  const w2 = quiet();
  assert.ok(w2.loadSave(save));
  assert.deepEqual(w2.designs, w.designs);
  assert.deepEqual([...w2.programs].sort(), [...w.programs].sort());
  assert.deepEqual(w2.equipped, { arm: 1, gun: 2 });
  assert.deepEqual(w2.kit.armFx, w.kit.armFx);
  assert.deepEqual(w2.kit.gunFx, w.kit.gunFx);
  assert.equal(w2.loadout.arm, 'lance');
  // Junk: unknown programs, broken and duplicate designs, equipped ids that don't match.
  const w3 = quiet();
  assert.ok(w3.loadSave({
    ...save,
    programs: ['chain', 'hack', 7],
    designs: [save.designs[0], { ...save.designs[0], name: 'Copy' }, { slot: 'arm', base: 'saber', id: 5, element: 'plasma' }, 'x', null, { ...save.designs[0], id: 7, mods: ['split'] }, { ...save.designs[1], id: 0 }],
    equipped: { arm: 9, gun: 1 },
  }));
  assert.deepEqual(w3.designs.map((d) => d.name), ['Volt Pike']);
  assert.ok(w3.programs.has('chain') && !w3.programs.has('hack'));
  assert.deepEqual(w3.equipped, { arm: null, gun: null });
  // An equipped design whose base isn't the equipped part comes off.
  const w4 = quiet();
  assert.ok(w4.loadSave({ ...save, loadout: { ...save.loadout, arm: 'saber' } }));
  assert.deepEqual(w4.equipped, { arm: null, gun: 2 });
  assert.equal(w4.kit.armFx, undefined);
  // An old (v1) save loads with no designs and the starter programs.
  const w5 = quiet();
  const { designs, programs, equipped, ...v1 } = save;
  assert.ok(w5.loadSave({ ...v1, v: 1 }));
  assert.deepEqual(w5.designs, []);
  assert.deepEqual([...w5.programs].sort(), [...STARTER_MODS].sort());
  assert.ok(designs && programs && equipped);
  // Too many designs: only the first six.
  const w6 = quiet();
  const many = Array.from({ length: 9 }, (_, i) => ({ ...save.designs[0], id: i + 1 }));
  assert.ok(w6.loadSave({ ...save, designs: many }));
  assert.equal(w6.designs.length, MAX_DESIGNS);
});

test('determinism and a fuzz with random designs: no NaN, whole HP, the same replay twice', () => {
  const play = (seed) => {
    const rng = new Rng(seed);
    const w = new World({ seed: 9 });
    for (const k of Object.keys(PARTS)) w.owned.add(k);
    for (const m of MOD_KEYS) w.programs.add(m);
    const z = w.zones[1];
    w.player.x = z.x + 15;
    w.player.z = z.z;
    w.player.y = w.terrain.ground(w.player.x, w.player.z);
    const seen = {};
    for (let i = 0; i < 7000; i++) {
      const input = {
        move: { x: rng.next() * 2 - 1, y: rng.next() * 2 - 1 }, camYaw: rng.next() * 7, aimYaw: rng.next() * 7, aimPitch: rng.next() - 0.5,
        attack: rng.chance(0.35), shoot: rng.chance(0.3), jump: rng.chance(0.05), dash: rng.chance(0.03), lock: rng.chance(0.02),
        next: rng.chance(0.02), react: rng.chance(0.2), chip: rng.chance(0.05) ? 1 + rng.int(3) : 0,
      };
      if (i % 300 === 0) {
        // Out of the fight for a moment (and a little hurt, so Wood has something to heal): forge a random
        // design and equip it.
        for (const e of w.enemies) if (e.alive && !e.dummy) w.killEnemy(e);
        if (w.designs.length >= MAX_DESIGNS) w.garage({ op: 'delete-design', id: rng.pick(w.designs).id });
        w.garage({ op: 'forge', design: randomDesign(rng) });
        w.player.hp = Math.max(1, w.player.hp - 30);
        input.garage = { op: 'equip-design', id: w.designs.at(-1).id };
      } else if (i % 300 === 150) input.garage = { op: 'dummy' }; // refused if a rift woke up nearby
      w.step(input);
      for (const ev of w.drainEvents()) seen[ev.type] = (seen[ev.type] ?? 0) + 1;
      const p = w.player;
      for (const o of [p, ...w.enemies]) assert.ok(['x', 'y', 'z', 'vx', 'vy', 'vz'].every((k) => Number.isFinite(o[k])), `NaN at ${i}`);
      for (const e of w.enemies) assert.ok(Number.isFinite(e.hp), `virus HP NaN at ${i}`);
      for (const s of w.shots) assert.ok(Number.isFinite(s.x + s.y + s.z + s.vx + s.vy + s.vz), `shot NaN at ${i}`);
      assert.ok(Number.isInteger(p.hp) && p.hp <= p.maxHp, `HP ${p.hp} at ${i}`);
      assert.ok(Math.hypot(p.x, p.z) <= PLAY_RADIUS + 1e-6);
    }
    return { w, seen };
  };
  const a = play(41);
  const b = play(41);
  assert.equal(a.w.hash(), b.w.hash());
  assert.deepEqual(a.w.stats, b.w.stats);
  assert.deepEqual(a.seen, b.seen);
  assert.ok(a.seen['design-saved'] >= 15 && a.seen['part-equipped'] >= 8, JSON.stringify(a.seen));
  for (const k of ['arc', 'burst', 'stun', 'leech', 'wave-cast']) assert.ok(a.seen[k] > 0, `the fuzz saw ${k}: ${JSON.stringify(a.seen)}`);
});
