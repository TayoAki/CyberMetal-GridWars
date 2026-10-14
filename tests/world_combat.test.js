import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, PLAYER, DT } from '../src/world/sim.js';
import { PLAY_RADIUS } from '../src/world/terrain.js';
import { CANNONBALL } from '../src/world/enemies.js';
import { GROUND_COMBO, AIR_COMBO, HITSTOP, LOCK, REACTIONS, CHIPS, CHIP_LEVELS, MELEE, chipLevel } from '../src/world/combat.js';
import { Rng } from '../src/engine/rng.js';
import { quiet, run, place, dummy } from './world_helpers.js';

// Kingdom Hearts 2-style close combat (lock-on, combos, reaction commands) and the chips viruses teach.

const press = (key, at = 0, extra = {}) => (i) => ({ ...extra, [key]: i === at });
const types = (ev, type) => ev.filter((x) => x.type === type);

test('lock-on picks the virus the camera faces, switches left and right, and lets go', () => {
  const w = quiet();
  const ahead = dummy(w, 'rivet', 10);
  const right = dummy(w, 'rivet', 8, -8); // the camera's right is -x when it faces +z
  const left = dummy(w, 'rivet', 8, 8);
  const ev = run(w, 2, press('lock'));
  assert.equal(w.player.lock, ahead.id);
  assert.ok(types(ev, 'lock').length === 1);
  run(w, 2, press('next'));
  assert.equal(w.player.lock, right.id, 'next goes right');
  run(w, 2, press('prev'));
  assert.equal(w.player.lock, ahead.id, 'prev goes back left');
  run(w, 2, press('prev'));
  assert.equal(w.player.lock, left.id);
  run(w, 2, press('prev'));
  assert.equal(w.player.lock, right.id, 'wraps around');
  const off = run(w, 2, press('lock'));
  assert.equal(w.player.lock, null);
  assert.ok(types(off, 'unlock').length === 1);
  // Nothing in range: the press is reported so the HUD can say so.
  const w2 = quiet();
  dummy(w2, 'rivet', LOCK.range + 5);
  const none = run(w2, 2, press('lock'));
  assert.equal(w2.player.lock, null);
  assert.ok(types(none, 'lock-none').length === 1);
});

test('the lock carries over to the nearest virus when its target is deleted, and drops when none is close', () => {
  const w = quiet();
  const a = dummy(w, 'rivet', 8);
  const b = dummy(w, 'plinker', 14, 4);
  run(w, 2, press('lock'));
  assert.equal(w.player.lock, a.id);
  w.killEnemy(a);
  const ev = run(w, 2);
  assert.equal(w.player.lock, b.id);
  assert.ok(types(ev, 'lock').some((x) => x.auto));
  w.killEnemy(b);
  const ev2 = run(w, 2);
  assert.equal(w.player.lock, null);
  assert.ok(types(ev2, 'unlock').some((x) => x.auto));
});

test('a ground combo lunges to its target, strikes three times and finishes with a launch', () => {
  const w = quiet();
  const e = dummy(w, 'plinker', 6);
  const ev = run(w, 90, (i) => ({ attack: i % 6 < 3 }));
  assert.deepEqual(types(ev, 'swing').map((x) => x.name), GROUND_COMBO.map((s) => s.name));
  const hits = types(ev, 'enemy-hit');
  assert.deepEqual(hits.map((x) => x.amount), GROUND_COMBO.map((s) => s.dmg));
  assert.equal(e.hp, e.maxHp - GROUND_COMBO.reduce((n, s) => n + s.dmg, 0));
  assert.equal(hits.at(-1).kind, 'finisher');
  assert.ok(w.player.z > 3, `lunged in from 6 m (now ${w.player.z.toFixed(2)})`);
  assert.ok(e.z > 6.5, 'the strikes knocked it back');
  // A walker is launched by the finisher.
  const w2 = quiet();
  const r = dummy(w2, 'rivet', 2.5);
  r.hp = r.maxHp = 500;
  let flew = false;
  run(w2, 90, (i) => {
    flew ||= r.air;
    return { attack: i % 6 < 3 };
  });
  assert.ok(flew, 'the finisher launched the rivet');
});

test('a lone press swings once; a strike with nothing in reach still swings', () => {
  const w = quiet();
  const ev = run(w, 60, press('attack'));
  assert.equal(types(ev, 'swing').length, 1);
  const strike = types(ev, 'strike')[0];
  assert.equal(strike?.hits, 0);
  assert.equal(w.player.action, null, 'the strike ended');
});

test('a solid hit freezes the world for a few frames (hit-stop); presses made during it still count', () => {
  const w = quiet();
  const e = dummy(w, 'rivet', 2);
  let hitAt = -1;
  for (let i = 0; i < 30 && hitAt < 0; i++) {
    w.step({ attack: i === 0 });
    if (types(w.drainEvents(), 'enemy-hit').length) hitAt = i;
  }
  assert.ok(hitAt > 0);
  assert.equal(w.hitstop, HITSTOP.slash);
  const t = w.t;
  const ex = e.x;
  w.step({ dash: true, move: { x: 0, y: -1 } }); // a dodge pressed during the freeze
  assert.equal(w.t, t, 'time stands still');
  assert.equal(e.x, ex);
  const ev = run(w, HITSTOP.slash + 2, { dash: true, move: { x: 0, y: -1 } });
  assert.ok(types(ev, 'dash').length === 1, 'the dodge came out after the freeze');
  assert.ok(w.t > t);
});

test('a combo can be dodge-cancelled once its hit has landed, not before', () => {
  const w = quiet();
  dummy(w, 'plinker', 2.5);
  const early = run(w, 3, (i) => ({ attack: i === 0, dash: i === 2 }));
  assert.equal(types(early, 'dash').length, 0, 'no dodge during the wind-up of a swing');
  assert.equal(w.player.action?.kind, 'melee', 'still swinging');
  const w2 = quiet();
  dummy(w2, 'plinker', 2.5);
  let ev = [];
  for (let i = 0; i < 40; i++) {
    const hitDone = w2.player.action?.hitDone;
    w2.step({ attack: i === 0, dash: !!hitDone });
    ev.push(...w2.drainEvents());
    if (types(ev, 'dash').length) break;
  }
  assert.equal(types(ev, 'dash').length, 1, 'dodged out of the strike after its hit');
  assert.equal(w2.player.action, null);
  // Attack pressed during a dodge comes out when the dodge ends.
  const w3 = quiet();
  dummy(w3, 'plinker', 6);
  ev = run(w3, 30, (i) => ({ dash: i === 0, attack: i === 3, move: { x: 0, y: 1 } }));
  assert.equal(types(ev, 'swing').length, 1);
});

test('an air combo hits a hovering Dartfin twice and the finisher slams it down; it resets on landing', () => {
  const w = quiet();
  const e = dummy(w, 'dartfin', 3);
  e.hp = e.maxHp = 500;
  const y0 = e.y;
  let lowest = y0;
  const ev = run(w, 120, (i) => {
    lowest = Math.min(lowest, e.y);
    return { jump: i === 0, attack: i > 8 && i % 6 < 3 };
  });
  const air = types(ev, 'swing').filter((x) => x.air);
  assert.deepEqual(air.map((x) => x.name), AIR_COMBO.map((s) => s.name));
  const hits = types(ev, 'enemy-hit');
  assert.ok(hits.length >= 3, `${hits.length} hits`);
  assert.ok(lowest < y0 - 1, `slammed down from ${y0.toFixed(2)} to ${lowest.toFixed(2)}`);
  // The air combo is spent until landing; then the ground combo is available again.
  assert.ok(w.player.onGround);
  assert.equal(w.player.airCombo, 0);
});

test('a ground strike reaches a Dartfin hovering overhead', () => {
  const w = quiet();
  const e = dummy(w, 'dartfin', 2.5);
  e.y += 0.3; // top of its bob
  const ev = run(w, 40, press('attack'));
  assert.equal(types(ev, 'enemy-hit').length, 1);
  assert.ok(MELEE.vertical > 2);
});

test('revenge value: a virus hit again and again shrugs off flinching for a moment', () => {
  const w = quiet();
  const e = dummy(w, 'plinker', 2.5);
  e.hp = e.maxHp = 1000;
  const ev = run(w, 240, (i) => ({ attack: i % 6 < 3 }));
  const armor = types(ev, 'armor');
  assert.ok(armor.length >= 1, 'armor came up');
  const hits = types(ev, 'enemy-hit');
  assert.ok(hits.some((x) => x.armored), 'some strikes landed on armor');
  const firstArmored = hits.findIndex((x) => x.armored);
  assert.ok(firstArmored >= MELEE.armorAfter - 1, `armor after ${firstArmored + 1} hits`);
});

test('BREAK: a Rivet winding up its slam can be smashed with the reaction command', () => {
  const w = quiet();
  const e = place(w, 'rivet', 6);
  run(w, 3);
  assert.equal(e.state, 'windup');
  assert.equal(w.player.reaction?.kind, 'break');
  assert.equal(w.player.reaction.label, REACTIONS.break.label);
  const ev = run(w, 120, press('react'));
  const r = types(ev, 'reaction')[0];
  assert.equal(r?.label, 'BREAK');
  assert.equal(e.hp, e.maxHp - REACTIONS.break.dmg);
  assert.ok(!types(ev, 'slam').length, 'the slam never comes');
  assert.equal(w.player.hp, PLAYER.maxHp);
  const d = Math.hypot(e.x - w.player.x, e.z - w.player.z);
  assert.ok(d < 4, `dashed in next to it (${d.toFixed(2)} m)`);
});

test('REVERSAL: warp behind a diving Dartfin and strike its back', () => {
  const w = quiet();
  const e = place(w, 'dartfin', 9);
  let seen = false;
  let ev = [];
  for (let i = 0; i < 400 && !seen; i++) {
    w.step({});
    ev.push(...w.drainEvents());
    seen = w.player.reaction?.kind === 'reversal';
  }
  assert.ok(seen, 'the prompt appeared');
  assert.ok(!types(ev, 'hurt').length, 'before the dive hit');
  const dir = Math.hypot(e.vx, e.vz) > 0.5 ? { x: e.vx, z: e.vz } : { x: Math.sin(e.yaw), z: Math.cos(e.yaw) };
  w.step({ react: true });
  ev = w.drainEvents();
  assert.equal(types(ev, 'reaction')[0]?.label, 'REVERSAL');
  // The player warped up behind it: on the side it was coming from, facing the way it was heading.
  const p = w.player;
  assert.ok((p.x - e.x) * dir.x + (p.z - e.z) * dir.z < 0, 'behind the diver');
  assert.ok(p.y > 1, 'up in the air with it');
  assert.equal(e.state, 'recover');
  ev = run(w, 90);
  assert.equal(e.hp, e.maxHp - REACTIONS.reversal.dmg);
  assert.equal(w.player.hp, PLAYER.maxHp, 'no damage taken');
  assert.ok(!types(ev, 'hurt').length);
  assert.ok(p.onGround, 'landed afterwards');
});

test('DEFLECT: bat a cannonball back for heavy damage', () => {
  const w = quiet();
  const e = place(w, 'plinker', 16);
  let ready = false;
  for (let i = 0; i < 400 && !ready; i++) {
    w.step({});
    w.drainEvents();
    ready = w.player.reaction?.kind === 'deflect';
  }
  assert.ok(ready, 'the prompt appeared');
  const ev = run(w, 120, press('react'));
  assert.equal(types(ev, 'reaction')[0]?.label, 'DEFLECT');
  const hit = types(ev, 'enemy-hit').find((x) => x.kind === 'deflect');
  assert.ok(hit, 'the ball went back and hit');
  assert.equal(hit.amount, Math.round(CANNONBALL.dmg * REACTIONS.deflect.mult));
  assert.equal(w.player.hp, PLAYER.maxHp);
  assert.ok(e.hp < e.maxHp);
});

test('no reaction prompt when nothing is attacking', () => {
  const w = quiet();
  dummy(w, 'rivet', 4);
  dummy(w, 'dartfin', 6);
  run(w, 30);
  assert.equal(w.player.reaction, null);
  const ev = run(w, 10, press('react'));
  assert.equal(types(ev, 'reaction').length, 0);
});

test('deleting a virus teaches its chip; more deletes level it up', () => {
  const w = quiet();
  assert.deepEqual(w.deck, []);
  const learn = [];
  for (let i = 0; i < CHIP_LEVELS[2]; i++) {
    w.killEnemy(dummy(w, 'rivet', 5));
    learn.push(...types(w.drainEvents(), 'chip-learn'));
  }
  assert.deepEqual(learn.map((x) => x.level), [1, 2]);
  assert.equal(learn[0].chip, 'shockwave');
  assert.deepEqual(w.deck, ['shockwave']);
  assert.equal(w.chips.shockwave.level, 2);
  w.killEnemy(dummy(w, 'plinker', 5));
  w.killEnemy(dummy(w, 'dartfin', 5));
  assert.deepEqual(w.deck, ['shockwave', 'cannon', 'findash']);
  assert.equal(chipLevel(0), 0);
  assert.equal(chipLevel(CHIP_LEVELS[3]), 3);
});

function learnAll(w) {
  for (const type of ['rivet', 'plinker', 'dartfin']) w.killEnemy(dummy(w, type, 30));
  run(w, 2);
  w.pickups = [];
}

test('ShockWave chip: a ring that hits every virus around you once', () => {
  const w = quiet();
  learnAll(w);
  const foes = [dummy(w, 'rivet', 4), dummy(w, 'rivet', -4), dummy(w, 'plinker', 0, 5)];
  const ev = run(w, 60, (i) => ({ chip: i === 0 ? 1 : 0 }));
  assert.equal(types(ev, 'chip-use')[0]?.chip, 'shockwave');
  for (const e of foes) assert.equal(e.hp, e.maxHp - CHIPS.shockwave.dmg[1], `${e.type} hit once`);
  // On cooldown: a second press is refused until it recharges.
  const denied = run(w, 2, (i) => ({ chip: i === 0 ? 1 : 0 }));
  assert.equal(types(denied, 'chip-denied').length, 1);
  run(w, Math.ceil(CHIPS.shockwave.cooldown / DT));
  const again = run(w, 2, (i) => ({ chip: i === 0 ? 1 : 0 }));
  assert.equal(types(again, 'chip-use').length, 1, 'usable again after its cooldown');
});

test('Cannon chip: a heavy shot at the locked target that bursts on impact', () => {
  const w = quiet();
  learnAll(w);
  const e = dummy(w, 'plinker', 15, 3);
  const near = dummy(w, 'rivet', 16, 4.5);
  run(w, 2, press('lock'));
  assert.equal(w.player.lock, e.id);
  const ev = run(w, 60, (i) => ({ chip: i === 0 ? 2 : 0 }));
  assert.equal(types(ev, 'shot').length, 0, 'not a buster shot');
  const hit = types(ev, 'enemy-hit').find((x) => x.id === e.id);
  assert.equal(hit?.amount, CHIPS.cannon.dmg[1]);
  assert.ok(near.hp < near.maxHp, 'the burst caught the virus next to it');
});

test('FinDash chip: dive through a line of viruses, invincible on the way', () => {
  const w = quiet();
  learnAll(w);
  const a = dummy(w, 'rivet', 3);
  const b = dummy(w, 'rivet', 6.5);
  const ev = run(w, 3, (i) => ({ chip: i === 0 ? 3 : 0 }));
  assert.equal(types(ev, 'chip-use')[0]?.chip, 'findash');
  assert.ok(w.player.iframes > 0);
  run(w, 40);
  assert.equal(a.hp, a.maxHp - CHIPS.findash.dmg[1]);
  assert.equal(b.hp, b.maxHp - CHIPS.findash.dmg[1]);
  assert.ok(w.player.z > 7, `travelled ${w.player.z.toFixed(1)} m`);
});

test('chips are refused while flinching or dodging, and an empty slot does nothing', () => {
  const w = quiet();
  learnAll(w);
  run(w, 1, { dash: true });
  const ev = run(w, 2, (i) => ({ chip: i === 0 ? 1 : 0 }));
  assert.equal(types(ev, 'chip-denied').length, 1);
  const w2 = quiet();
  const ev2 = run(w2, 2, (i) => ({ chip: i === 0 ? 4 : 0 }));
  assert.equal(ev2.length, 0);
});

test('the chip deck survives being knocked down', () => {
  const w = quiet();
  learnAll(w);
  w.player.hp = 1;
  w.hurtPlayer(50, w.player.x + 1, w.player.z);
  run(w, 240);
  assert.ok(w.player.alive);
  assert.deepEqual(w.deck, ['shockwave', 'cannon', 'findash']);
});

const everything = (rng) => ({
  move: { x: rng.next() * 2 - 1, y: rng.next() * 2 - 1 },
  camYaw: rng.next() * 7,
  aimYaw: rng.next() * 7,
  aimPitch: rng.next() - 0.5,
  attack: rng.chance(0.3),
  shoot: rng.chance(0.2),
  jump: rng.chance(0.05),
  dash: rng.chance(0.04),
  lock: rng.chance(0.02),
  next: rng.chance(0.03),
  prev: rng.chance(0.03),
  react: rng.chance(0.2),
  chip: rng.chance(0.05) ? 1 + rng.int(4) : 0,
});

test('fuzz: mashing every combat button never produces NaN or leaves the play area', () => {
  const rng = new Rng(123);
  const w = new World({ seed: 9 });
  const bad = (o) => ['x', 'y', 'z', 'vx', 'vy', 'vz'].some((k) => !Number.isFinite(o[k]));
  for (let i = 0; i < 9000; i++) {
    w.step(everything(rng));
    w.drainEvents();
    if (i % 1500 === 700) {
      const z = w.zones[(i / 1500) | 0];
      w.player.x = z.x + 15;
      w.player.z = z.z;
      w.player.y = w.terrain.ground(w.player.x, w.player.z);
    }
    assert.ok(!bad(w.player), `player NaN at frame ${i}`);
    for (const e of w.enemies) assert.ok(!bad(e), `enemy NaN at frame ${i}`);
    for (const s of w.shots) assert.ok(Number.isFinite(s.x + s.y + s.z), `shot NaN at frame ${i}`);
    assert.ok(Math.hypot(w.player.x, w.player.z) <= PLAY_RADIUS + 1e-6);
    assert.ok(w.hitstop >= 0 && w.hitstop <= 12);
  }
  assert.ok(w.stats.strikes > 0 && w.stats.kills > 0, `strikes ${w.stats.strikes}, kills ${w.stats.kills}`);
});

test('determinism with combat: the same seed and button mashing replay identically', () => {
  const play = () => {
    const rng = new Rng(77);
    const w = new World({ seed: 21 });
    const z = w.zones[0];
    w.player.x = z.x + 15;
    w.player.z = z.z;
    w.player.y = w.terrain.ground(w.player.x, w.player.z);
    for (let i = 0; i < 3000; i++) {
      w.step(everything(rng));
      w.drainEvents();
    }
    return w;
  };
  const a = play();
  const b = play();
  assert.equal(a.hash(), b.hash());
  assert.deepEqual(a.stats, b.stats);
  assert.ok(a.stats.strikes > 0);
});
