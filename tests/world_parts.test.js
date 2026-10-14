import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, DT, PLAYER, GARAGE_SAFE } from '../src/world/sim.js';
import { PLAY_RADIUS } from '../src/world/terrain.js';
import { PARTS, SLOTS, STARTER, buildKit, partsIn, partStats, validLoadout } from '../src/world/parts.js';
import { CHIPS, MELEE } from '../src/world/combat.js';
import { Rng } from '../src/engine/rng.js';
import { quiet, run, place, dummy } from './world_helpers.js';

// Parts (Medabots / Custom Robo style): the equipped arm, gun, legs and core decide how the mech fights.

const types = (ev, type) => ev.filter((x) => x.type === type);
const tough = (e, hp = 2000) => {
  e.hp = e.maxHp = hp;
  return e;
};
// Own and equip parts directly (the garage itself is tested separately).
function equip(w, ...parts) {
  for (const part of parts) {
    w.owned.add(part);
    w.garage({ op: 'equip', part });
  }
  w.drainEvents();
}
const mash = (i) => ({ attack: i % 6 < 3 });

test('the catalog: four parts per slot, a free starter in each, every part described and priced', () => {
  for (const slot of SLOTS) {
    const keys = partsIn(slot);
    assert.equal(keys.length, 4, slot);
    assert.equal(PARTS[STARTER[slot]].price, 0, `${slot} starter is free`);
    for (const k of keys) {
      assert.ok(PARTS[k].name && PARTS[k].desc, k);
      if (k !== STARTER[slot]) assert.ok(PARTS[k].price > 0, `${k} has a price`);
      assert.ok(partStats(k).length >= 2, `${k} has stats to show`);
    }
  }
  assert.ok(validLoadout(STARTER));
  assert.ok(!validLoadout({ ...STARTER, arm: 'buster' }), 'a gun is not an arm');
  // Every arm's combo ends in a finisher, and every gun charges in increasing steps.
  for (const k of partsIn('arm')) {
    const arm = buildKit({ ...STARTER, arm: k }).arm;
    assert.ok(arm.ground.at(-1).finisher && arm.air.at(-1).finisher, k);
    assert.ok(arm.ground.slice(0, -1).every((s) => !s.finisher), k);
  }
  for (const k of partsIn('gun')) {
    const c = buildKit({ ...STARTER, gun: k }).gun.charge;
    assert.ok(c.delay < c.mid && c.mid < c.full, k);
  }
});

test('the garage: buy with DATA, equip what you own, and only out of combat', () => {
  const w = quiet();
  let ev = run(w, 1, { garage: { op: 'buy', part: 'lance' } });
  assert.equal(types(ev, 'garage-denied')[0]?.reason, 'data');
  w.wallet = 100;
  ev = run(w, 1, { garage: { op: 'equip', part: 'lance' } });
  assert.equal(types(ev, 'garage-denied')[0]?.reason, 'locked', 'must own it first');
  ev = run(w, 1, { garage: { op: 'buy', part: 'lance' } });
  assert.equal(types(ev, 'part-bought')[0]?.part, 'lance');
  assert.equal(w.wallet, 100 - PARTS.lance.price);
  ev = run(w, 1, { garage: { op: 'equip', part: 'lance' } });
  assert.equal(types(ev, 'part-equipped')[0]?.slot, 'arm');
  assert.equal(w.loadout.arm, 'lance');
  assert.equal(w.kit.arm.magnet, 13);
  // A virus close by: the garage is shut.
  const e = dummy(w, 'rivet', GARAGE_SAFE - 5);
  ev = run(w, 1, { garage: { op: 'equip', part: 'saber' } });
  assert.equal(types(ev, 'garage-denied')[0]?.reason, 'combat');
  assert.equal(w.loadout.arm, 'lance');
  w.killEnemy(e);
  run(w, 60);
  ev = run(w, 1, { garage: { op: 'equip', part: 'saber' } });
  assert.equal(w.loadout.arm, 'saber');
});

test('changing the core keeps the HP fraction; the Fortress core has more HP', () => {
  const w = quiet();
  w.player.hp = 60;
  equip(w, 'fortress');
  assert.equal(w.player.maxHp, 165);
  assert.equal(w.player.hp, Math.round(165 * 0.5));
});

test('sealing a rift turns up a part you don\'t have; DATA once you have them all', () => {
  const w = new World({ seed: 3 });
  const zone = w.zones[0];
  const p = w.player;
  p.x = zone.x + 30;
  p.z = zone.z;
  p.y = w.terrain.ground(p.x, p.z);
  run(w, 2);
  for (const e of w.enemies) if (e.alive) w.killEnemy(e);
  const ev = run(w, 2);
  const found = types(ev, 'part-found');
  assert.equal(found.length, w.zones.filter((z) => z.state === 'cleared').length);
  assert.ok(found.every((f) => PARTS[f.part] && PARTS[f.part].price > 0));
  assert.ok(found.every((f) => w.owned.has(f.part)));
  // Everything owned: DATA instead.
  for (const k of Object.keys(PARTS)) w.owned.add(k);
  const before = w.wallet;
  w.findPart(0, 0, 0);
  assert.equal(w.wallet, before + 20);
});

test('collected DATA goes into the wallet', () => {
  const w = quiet();
  const e = dummy(w, 'rivet', 5);
  w.killEnemy(e);
  run(w, 240);
  assert.equal(w.wallet, e.def.data);
});

// Mash attack at a tough virus and report the swings and hits.
function combo(parts, frames = 120, setup = (w) => tough(dummy(w, 'plinker', 2.5))) {
  const w = quiet();
  equip(w, ...parts);
  const e = setup(w);
  const ev = run(w, frames, mash);
  return { w, e, ev, swings: types(ev, 'swing').map((x) => x.name), hits: types(ev, 'enemy-hit') };
}

test('each arm part has its own combo', () => {
  for (const arm of partsIn('arm')) {
    const kit = buildKit({ ...STARTER, arm }).arm;
    const r = combo([arm]);
    const expect = kit.ground.map((s) => s.name);
    if (kit.launcher) expect[expect.length - 1] = kit.launcher.name; // one on one, the saber launches
    assert.deepEqual(r.swings.slice(0, expect.length), expect, arm);
  }
});

test('the Breaker hits hard and shatters revenge armor', () => {
  const r = combo(['breaker'], 60);
  assert.equal(r.hits[0].amount, 16);
  const w = quiet();
  equip(w, 'breaker');
  const e = tough(dummy(w, 'rivet', 2.5));
  e.armor = MELEE.armorTime; // armored, as after a long combo
  const ev = run(w, 40, (i) => ({ attack: i === 0 }));
  assert.equal(types(ev, 'armor-break').length, 1);
  assert.equal(e.armor, 0);
  assert.ok(types(ev, 'enemy-hit')[0] && !types(ev, 'enemy-hit')[0].armored);
});

test('the Lance lunges from 13 m, where the Saber does not reach, and its finisher pierces a line', () => {
  for (const [arm, reach] of [['saber', false], ['lance', true]]) {
    const w = quiet();
    equip(w, arm);
    tough(dummy(w, 'plinker', 11.5));
    const ev = run(w, 40, (i) => ({ attack: i === 0 }));
    assert.equal(types(ev, 'enemy-hit').length > 0, reach, arm);
  }
  // Pierce: two viruses in a row, both hit by the finisher's charge.
  const w = quiet();
  equip(w, 'lance');
  const a = tough(dummy(w, 'rivet', 3));
  const b = tough(dummy(w, 'rivet', 7));
  let ev = [];
  for (let i = 0; i < 200 && !types(ev, 'charge').length; i++) ev.push(...run(w, 1, mash(i)));
  assert.ok(types(ev, 'charge').length, 'the pierce started');
  ev.push(...run(w, 60));
  const fin = types(ev, 'enemy-hit').filter((x) => x.kind === 'finisher');
  assert.deepEqual(new Set(fin.map((x) => x.id)), new Set([a.id, b.id]));
});

test('the Claws chain five strikes on the ground and four in the air', () => {
  const r = combo(['claws'], 120);
  assert.ok(r.swings.length >= 5);
  const w = quiet();
  equip(w, 'claws');
  tough(dummy(w, 'dartfin', 3));
  const ev = run(w, 120, (i) => ({ jump: i === 0, attack: i > 8 && i % 6 < 3 }));
  assert.equal(types(ev, 'swing').filter((x) => x.air).length, 4);
});

test('the Spreader fires a fan of pellets; a full charge fires more', () => {
  const w = quiet();
  equip(w, 'spreader');
  const kit = w.kit.gun;
  run(w, 1, { shoot: true });
  assert.equal(w.shots.filter((s) => s.kind === 'pellet').length, kit.pellets[0]);
  run(w, Math.ceil(kit.charge.full / DT) + 2, { shoot: true });
  w.shots = [];
  run(w, 1, { shoot: false });
  assert.equal(w.shots.filter((s) => s.kind === 'blast').length, kit.pellets[2]);
  // Up close, most of the fan lands.
  const w2 = quiet();
  equip(w2, 'spreader');
  const e = tough(dummy(w2, 'plinker', 5));
  const ev = run(w2, 30, (i) => ({ shoot: i === 0, aimPoint: { x: e.x, y: e.y + 0.75, z: e.z } }));
  assert.ok(types(ev, 'enemy-hit').length >= 3);
});

test('the Railgun\'s charged beam hits everything in a line at once', () => {
  const w = quiet();
  equip(w, 'railgun');
  const a = tough(dummy(w, 'plinker', 10));
  const b = tough(dummy(w, 'plinker', 25));
  const aim = { x: b.x, y: b.y + 0.75, z: b.z };
  run(w, Math.ceil(w.kit.gun.charge.full / DT) + 2, { shoot: true, aimPoint: aim });
  const before = [a.hp, b.hp];
  const ev = run(w, 1, { shoot: false, aimPoint: aim });
  const beam = types(ev, 'beam')[0];
  assert.equal(beam?.hits, 2);
  assert.equal(before[0] - a.hp, w.kit.gun.beam[2]);
  assert.equal(before[1] - b.hp, w.kit.gun.beam[2]);
});

test('the Bomber lobs bombs onto the locked target, over the top', () => {
  const w = quiet();
  equip(w, 'bomber');
  const e = tough(dummy(w, 'rivet', 14));
  run(w, 2, (i) => ({ lock: i === 0 }));
  run(w, 1, { shoot: true });
  const bomb = w.shots.find((s) => s.kind === 'bomb');
  assert.ok(bomb && bomb.vy > 0, 'thrown upward');
  const ev = run(w, 90);
  assert.ok(types(ev, 'enemy-hit').some((x) => x.id === e.id), 'it landed on the target');
  // A full charge throws three.
  run(w, Math.ceil(w.kit.gun.charge.full / DT) + 2, { shoot: true });
  w.shots = [];
  run(w, 1, { shoot: false });
  assert.equal(w.shots.filter((s) => s.kind === 'bomb').length, 3);
});

test('legs decide movement: Sprinters run faster, Treads slower', () => {
  const dist = (legs) => {
    const w = quiet();
    equip(w, legs);
    run(w, 60, { move: { x: 0, y: 1 } });
    return w.player.z;
  };
  const strider = dist('striders');
  assert.ok(dist('sprinters') > strider + 1.5);
  assert.ok(dist('treads') < strider - 1);
});

test('Hover legs glide while jump is held and get two air dodges', () => {
  const fall = (glide) => {
    const w = quiet();
    equip(w, 'hover');
    run(w, 45, (i) => ({ jump: i === 0 || glide }));
    return w.player.y;
  };
  assert.ok(fall(true) > fall(false) + 0.5, 'gliding keeps you up');
  // Air dodges: Hover gets two before landing (gliding keeps it up long enough), Striders one.
  const w = quiet();
  equip(w, 'hover');
  const ev = run(w, 70, (i) => ({ jump: true, dash: i === 8 || i === 8 + 33, move: { x: 0, y: 1 } }));
  assert.equal(types(ev, 'dash').length, 2);
  assert.equal(w.player.airDashes, 0);
  const w2 = quiet();
  run(w2, 8, (i) => ({ jump: i === 0 }));
  const ev2 = run(w2, 2, (i) => ({ dash: i === 0, move: { x: 0, y: 1 } }));
  assert.equal(types(ev2, 'dash').length, 1);
  assert.ok(!w2.player.onGround);
  assert.equal(w2.player.airDashes, 0, 'Striders have one');
});

test('Treads shrug off light hits; heavier parts are knocked back less', () => {
  const w = quiet();
  equip(w, 'treads');
  tough(dummy(w, 'plinker', 2.5));
  run(w, 1, { attack: true });
  w.hurtPlayer(10, w.player.x, w.player.z - 1);
  assert.equal(w.player.flinch, 0, 'no stagger');
  assert.ok(w.player.action, 'the strike carries on');
  run(w, 40); // past the short invincibility
  w.hurtPlayer(30, w.player.x, w.player.z - 1);
  assert.ok(w.player.flinch > 0, 'a heavy hit still staggers');
  assert.equal(w.player.hp, w.player.maxHp - 40);
  const push = (parts) => {
    const v = quiet();
    equip(v, ...parts);
    v.hurtPlayer(20, v.player.x, v.player.z - 1);
    return v.player.vz;
  };
  assert.ok(push(['treads', 'fortress']) < push(['striders']) && push(['striders']) < push(['hover']));
});

test('cores: Link speeds chips up and makes them stronger; Overclock triples counters', () => {
  const w = quiet();
  equip(w, 'link');
  w.killEnemy(dummy(w, 'rivet', 30));
  run(w, 2);
  tough(dummy(w, 'rivet', 4));
  const ev = run(w, 1, { chip: 1 });
  assert.ok(Math.abs(w.chipCd.shockwave - (CHIPS.shockwave.cooldown * 0.65 - DT)) < 1e-9, 'a 35% shorter cooldown');
  ev.push(...run(w, 40));
  assert.equal(types(ev, 'enemy-hit').find((x) => x.kind === 'chip')?.amount, Math.round(CHIPS.shockwave.dmg[1] * 1.15));
  const w2 = quiet();
  equip(w2, 'overclock');
  const r = place(w2, 'rivet', 6);
  r.hp = r.maxHp = 500;
  run(w2, 3);
  assert.equal(r.state, 'windup');
  const ev2 = run(w2, 20, (i) => ({ shoot: i === 0, aimPoint: { x: r.x, y: r.y + 0.6, z: r.z } }));
  assert.equal(types(ev2, 'enemy-hit').find((x) => x.counter)?.amount, 6 * 3);
});

test('a save restores parts, the loadout, DATA and chips, and refuses junk', () => {
  const w = quiet();
  w.wallet = 300;
  for (const part of ['lance', 'hover', 'link']) w.garage({ op: 'buy', part });
  equip(w, 'lance', 'hover');
  w.killEnemy(dummy(w, 'rivet', 30));
  run(w, 2);
  const save = JSON.parse(JSON.stringify(w.saveData()));
  const w2 = quiet();
  assert.ok(w2.loadSave(save));
  assert.deepEqual(w2.loadout, w.loadout);
  assert.deepEqual([...w2.owned].sort(), [...w.owned].sort());
  assert.equal(w2.wallet, w.wallet);
  assert.deepEqual(w2.deck, ['shockwave']);
  assert.equal(w2.kit.legs.airDashes, 2);
  // Junk: unknown parts, a loadout you don't own, a negative wallet, chip levels that don't add up.
  const w3 = quiet();
  assert.ok(w3.loadSave({ v: 1, owned: ['laser-sword', 'claws'], loadout: { arm: 'railgun', gun: 'buster', legs: 'treads', core: 'standard' }, wallet: -5, chips: { shockwave: { deletes: 'x' }, nope: { deletes: 9 } }, deck: ['nope', 'shockwave'] }));
  assert.deepEqual(w3.loadout, STARTER);
  assert.ok(w3.owned.has('claws') && !w3.owned.has('laser-sword'));
  assert.equal(w3.wallet, 0);
  assert.deepEqual(w3.deck, []);
  assert.equal(quiet().loadSave(null), false);
  assert.equal(quiet().loadSave({ v: 99 }), false);
});

test('determinism and a fuzz across random loadouts: no NaN, nothing leaves the world', () => {
  const play = (seed) => {
    const rng = new Rng(seed);
    const w = new World({ seed: 5 });
    w.wallet = 10000;
    const z = w.zones[1];
    w.player.x = z.x + 15;
    w.player.z = z.z;
    w.player.y = w.terrain.ground(w.player.x, w.player.z);
    for (let i = 0; i < 6000; i++) {
      const input = {
        move: { x: rng.next() * 2 - 1, y: rng.next() * 2 - 1 }, camYaw: rng.next() * 7, aimYaw: rng.next() * 7, aimPitch: rng.next() - 0.5,
        attack: rng.chance(0.3), shoot: rng.chance(0.3), jump: rng.chance(0.06), dash: rng.chance(0.04), lock: rng.chance(0.02),
        next: rng.chance(0.02), react: rng.chance(0.2), chip: rng.chance(0.05) ? 1 + rng.int(3) : 0,
      };
      if (i % 500 === 0) {
        // Swap a random part now and then (bought first; the garage refuses mid-fight, which is fine).
        const part = rng.pick(Object.keys(PARTS));
        w.garage({ op: 'buy', part });
        input.garage = { op: 'equip', part };
        for (const e of w.enemies) if (e.alive && rng.chance(0.5)) w.killEnemy(e);
      }
      w.step(input);
      w.drainEvents();
      const p = w.player;
      for (const o of [p, ...w.enemies]) assert.ok(['x', 'y', 'z', 'vx', 'vy', 'vz'].every((k) => Number.isFinite(o[k])), `NaN at ${i}`);
      for (const s of w.shots) assert.ok(Number.isFinite(s.x + s.y + s.z + s.vx + s.vy + s.vz), `shot NaN at ${i}`);
      assert.ok(Math.hypot(p.x, p.z) <= PLAY_RADIUS + 1e-6);
    }
    return w;
  };
  const a = play(31);
  const b = play(31);
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.stats, b.stats);
  assert.ok(a.stats.strikes > 0 && a.stats.shots > 0);
});

test('the starting kit matches the numbers the sim exports', () => {
  const k = buildKit(STARTER);
  assert.equal(k.hp, PLAYER.maxHp);
  assert.equal(k.legs.run, PLAYER.run);
  assert.equal(k.legs.dashSpeed, PLAYER.dashSpeed);
  assert.equal(k.legs.jump, PLAYER.jump);
});
