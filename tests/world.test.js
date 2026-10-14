import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, PLAYER, BUSTER, CHARGE } from '../src/world/sim.js';
import { makeTerrain, PLAY_RADIUS, WATER_LEVEL } from '../src/world/terrain.js';
import { RING, CANNONBALL, DIVE } from '../src/world/enemies.js';
import { Rng } from '../src/engine/rng.js';
import { quiet, run, place } from './world_helpers.js';

test('terrain is deterministic, flat at the spawn, and keeps rifts and trees out of the lake', () => {
  const a = makeTerrain(5);
  const b = makeTerrain(5);
  assert.equal(a.obstacles.length, b.obstacles.length);
  assert.equal(a.height(37.5, -12.25), b.height(37.5, -12.25));
  assert.notEqual(makeTerrain(6).height(37.5, -12.25), a.height(37.5, -12.25));
  for (const [dx, dz] of [[0, 0], [5, 0], [0, -6], [-4, 4]]) assert.ok(Math.abs(a.height(dx, dz) - a.spawnH) < 0.05, 'spawn clearing is flat');
  assert.equal(a.zones.length, 6);
  for (const z of a.zones) assert.ok(a.height(z.x, z.z) > WATER_LEVEL, 'rifts sit on dry land');
  for (const o of a.obstacles) assert.ok(a.height(o.x, o.z) > WATER_LEVEL, 'no trees or rocks under water');
  assert.ok(a.obstacles.filter((o) => o.type === 'tree').length > 100, 'there is a forest');
});

test('walking: camera-relative movement at running speed, staying on the ground', () => {
  const w = quiet();
  const p = w.player;
  run(w, 60, { move: { x: 0, y: 1 }, camYaw: 0 });
  assert.ok(p.z > 7.5 && p.z < 10, `forward ~9.5 m in 1 s, got ${p.z.toFixed(2)}`);
  assert.ok(Math.abs(p.x) < 1e-6);
  assert.ok(p.onGround && p.y === 0);
  // Camera turned 90 degrees: "forward" is now +x.
  const w2 = quiet();
  run(w2, 30, { move: { x: 0, y: 1 }, camYaw: Math.PI / 2 });
  assert.ok(w2.player.x > 3 && Math.abs(w2.player.z) < 1e-6);
  // Strafing right with the camera facing +z moves toward -x (the camera's right).
  const w3 = quiet();
  run(w3, 30, { move: { x: 1, y: 0 }, camYaw: 0 });
  assert.ok(w3.player.x < -3);
});

test('jumping leaves the ground and lands again; dashing covers ground with invincibility', () => {
  const w = quiet();
  const p = w.player;
  const ev = run(w, 10, (i) => ({ jump: i < 2 }));
  assert.ok(ev.some((e) => e.type === 'jump'));
  assert.ok(p.y > w.terrain.ground(p.x, p.z) + 1, 'airborne');
  run(w, 60);
  assert.ok(p.onGround, 'landed');
  const z0 = p.z;
  const ev2 = run(w, 3, (i) => ({ dash: i === 0, move: { x: 0, y: 1 } }));
  assert.ok(ev2.some((e) => e.type === 'dash'));
  assert.ok(p.iframes > 0, 'dash grants invincibility');
  run(w, 12, { move: { x: 0, y: 1 } });
  assert.ok(p.z - z0 > PLAYER.dashSpeed * PLAYER.dashTime * 0.8, 'dash distance');
});

test('the buster fires on a tap and hits a virus in front; charge shots fire on release', () => {
  const w = quiet();
  const e = place(w, 'rivet', 12, 'recover');
  e.t = 99;
  const aim = { x: e.x, y: e.y + 0.6, z: e.z };
  const ev = run(w, 30, (i) => ({ fire: i === 0, aimPoint: aim, aimYaw: 0 }));
  assert.equal(ev.filter((x) => x.type === 'shot').length, 1, 'one shot per tap');
  const hit = ev.find((x) => x.type === 'enemy-hit');
  assert.ok(hit, 'the shot hits');
  assert.equal(e.hp, e.maxHp - BUSTER.dmg);
  // Hold for a full charge, release: a charge shot with splash.
  const ev2 = run(w, Math.ceil(CHARGE.full * 60) + 2, { fire: true, aimPoint: aim, aimYaw: 0 });
  assert.ok(ev2.some((x) => x.type === 'charge-full'));
  const ev3 = run(w, 30, { fire: false, aimPoint: aim, aimYaw: 0 });
  const shot = ev3.find((x) => x.type === 'shot');
  assert.equal(shot?.kind, 'charge');
  assert.equal(e.hp, e.maxHp - BUSTER.dmg * 2 - CHARGE.dmg[2], 'tap at the start of the hold + charge shot');
});

test('aim assist pulls a slightly-off shot onto a virus', () => {
  const w = quiet();
  const e = place(w, 'plinker', 20, 'recover');
  e.t = 99;
  // Right height, but 0.08 rad (4.6 degrees) off to the side.
  const pitch = Math.atan2(e.y + e.def.height * 0.5 - (w.player.y + 1.2), 20);
  const ev = run(w, 40, (i) => ({ fire: i === 0, aimYaw: 0.08, camYaw: 0.08, aimPitch: pitch }));
  assert.ok(ev.some((x) => x.type === 'enemy-hit'), 'a 4.6 degree miss is corrected');
  // Far off (0.3 rad) is not.
  const w2 = quiet();
  const e2 = place(w2, 'plinker', 20, 'recover');
  e2.t = 99;
  const ev2 = run(w2, 40, (i) => ({ fire: i === 0, aimYaw: 0.3, camYaw: 0.3, aimPitch: pitch }));
  assert.ok(!ev2.some((x) => x.type === 'enemy-hit'));
});

test('hitting a virus during its wind-up is a counter: double damage and the attack is cancelled', () => {
  const w = quiet();
  const e = place(w, 'rivet', 6);
  const ev = run(w, 3);
  assert.equal(e.state, 'windup');
  assert.ok(ev.some((x) => x.type === 'telegraph' && x.kind === 'slam'));
  const aim = { x: e.x, y: e.y + 0.6, z: e.z };
  const ev2 = run(w, 20, (i) => ({ fire: i === 0, aimPoint: aim, aimYaw: 0 }));
  const hit = ev2.find((x) => x.type === 'enemy-hit');
  assert.ok(hit?.counter);
  assert.equal(hit.amount, BUSTER.dmg * 2);
  assert.ok(!ev2.some((x) => x.type === 'slam'), 'the slam never comes');
});

test('a rivet slam sends a shockwave that hits a grounded player but can be jumped', () => {
  for (const jump of [false, true]) {
    const w = quiet();
    place(w, 'rivet', 6);
    let slamAt = -1;
    for (let f = 0; f < 150; f++) {
      w.step({ jump: jump && slamAt >= 0 && f >= slamAt + 12 && f <= slamAt + 14 });
      if (slamAt < 0 && w.drainEvents().some((x) => x.type === 'slam')) slamAt = f;
      else w.drainEvents();
    }
    assert.ok(slamAt > 0, 'it slammed');
    const hp = w.player.hp;
    if (jump) assert.equal(hp, PLAYER.maxHp, 'jumped over the ring');
    else assert.equal(hp, PLAYER.maxHp - RING.dmg, 'the ring hit');
  }
});

test('a plinker fires a cannonball at a standing player; a dartfin dives through them', () => {
  const w = quiet();
  place(w, 'plinker', 16);
  const ev = run(w, 300);
  assert.ok(ev.some((x) => x.type === 'enemy-shot' && x.kind === 'cannonball'));
  assert.ok(w.player.hp <= PLAYER.maxHp - CANNONBALL.dmg, 'the cannonball hit');

  const w2 = quiet();
  place(w2, 'dartfin', 9);
  const ev2 = run(w2, 400);
  assert.ok(ev2.some((x) => x.type === 'telegraph' && x.kind === 'dive'));
  assert.ok(ev2.some((x) => x.type === 'hurt' && x.amount === DIVE.dmg), 'the dive hit');
});

test('deleting a virus drops data that the player collects', () => {
  const w = quiet();
  const e = place(w, 'dartfin', 6, 'recover');
  e.t = 99;
  e.y = w.terrain.ground(e.x, e.z) + 1;
  const aim = () => ({ x: e.x, y: e.y + 0.45, z: e.z });
  // Mash the buster until it pops.
  const ev = run(w, 240, (i) => ({ fire: i % 8 === 0, aimPoint: aim(), aimYaw: 0 }));
  assert.ok(ev.some((x) => x.type === 'delete'));
  run(w, 240);
  assert.equal(w.stats.data, e.def.data, 'all its data was magnetised in');
  assert.equal(w.pickups.length, 0);
});

test('getting close to a rift wakes its viruses; clearing it is reported', () => {
  const w = new World({ seed: 3 });
  const zone = w.zones[0];
  const p = w.player;
  p.x = zone.x + 30;
  p.z = zone.z;
  p.y = w.terrain.ground(p.x, p.z);
  const ev = run(w, 2);
  assert.ok(ev.some((x) => x.type === 'zone-wake' && x.id === zone.id));
  assert.equal(zone.state, 'active');
  assert.equal(w.enemies.length, zone.roster.length);
  for (const e of zone.members) w.killEnemy(e);
  const ev2 = run(w, 2);
  assert.ok(ev2.some((x) => x.type === 'zone-clear' && x.id === zone.id));
  assert.equal(zone.state, 'cleared');
});

test('the player is knocked down at 0 HP and respawns at the clearing', () => {
  const w = quiet();
  w.player.hp = 5;
  w.hurtPlayer(10, w.player.x + 1, w.player.z);
  assert.equal(w.player.alive, false);
  const ev = run(w, 200);
  assert.ok(ev.some((x) => x.type === 'respawn'));
  assert.equal(w.player.hp, PLAYER.maxHp);
  assert.ok(Math.hypot(w.player.x, w.player.z) < 1);
});

test('determinism: the same seed and inputs replay identically', () => {
  const script = (i) => ({
    move: { x: Math.sin(i / 50), y: 1 },
    camYaw: (i / 400) % (Math.PI * 2),
    aimYaw: (i / 400) % (Math.PI * 2),
    fire: i % 37 < 20,
    jump: i % 90 === 0,
    dash: i % 150 === 75,
  });
  const a = new World({ seed: 11 });
  const b = new World({ seed: 11 });
  run(a, 2400, script);
  run(b, 2400, script);
  assert.equal(a.hash(), b.hash());
  assert.ok(a.stats.shots > 0);
});

test('fuzz: random input never produces NaN or leaves the play area', () => {
  const rng = new Rng(99);
  const w = new World({ seed: 4 });
  const bad = (o) => ['x', 'y', 'z'].some((k) => !Number.isFinite(o[k]));
  for (let i = 0; i < 6000; i++) {
    w.step({
      move: { x: rng.next() * 2 - 1, y: rng.next() * 2 - 1 },
      camYaw: rng.next() * 7,
      aimYaw: rng.next() * 7,
      aimPitch: rng.next() - 0.5,
      fire: rng.chance(0.4),
      jump: rng.chance(0.05),
      dash: rng.chance(0.03),
    });
    w.drainEvents();
    // Teleport around now and then so rifts wake up.
    if (i % 1000 === 500) {
      const z = w.zones[(i / 1000) | 0];
      w.player.x = z.x + 20;
      w.player.z = z.z;
      w.player.y = w.terrain.ground(w.player.x, w.player.z);
    }
    assert.ok(!bad(w.player), `player NaN at frame ${i}`);
    for (const e of w.enemies) assert.ok(!bad(e), `enemy NaN at frame ${i}`);
    assert.ok(Math.hypot(w.player.x, w.player.z) <= PLAY_RADIUS + 1e-6);
  }
});

test('sealed rifts stay sealed; sealing all six starts a tougher wave', () => {
  const w = new World({ seed: 3 });
  const p = w.player;
  let waveEvent = null;
  for (const zone of w.zones) {
    p.x = zone.x + 30;
    p.z = zone.z;
    p.y = w.terrain.ground(p.x, p.z);
    run(w, 2);
    // Neighbouring rifts may wake too: clear everything that is awake.
    for (const e of w.enemies) if (e.alive) w.killEnemy(e);
    const ev = run(w, 2);
    waveEvent = ev.find((x) => x.type === 'wave') ?? waveEvent;
    if (zone !== w.zones[w.zones.length - 1]) assert.equal(zone.state, 'cleared', 'stays sealed');
  }
  assert.equal(waveEvent?.wave, 2);
  assert.ok(w.zones.every((z) => z.state !== 'cleared'), 'all rifts reopen for wave 2');
  // A rift near the player wakes straight away, with wave-2 viruses.
  const zone = w.zones.find((z) => z.state === 'active');
  assert.ok(zone);
  const e = zone.members[0];
  assert.equal(e.maxHp, Math.round(e.def.hp * 1.4));
  assert.equal(e.power, 1.25);
});
