import { World } from '../src/world/sim.js';

// Helpers for the open-world tests.

// A world with no glitch zones (so nothing wakes up unasked) on flat, empty ground, so mechanics tests don't
// depend on where hills and trees happen to fall.
export function quiet(seed = 7) {
  const w = new World({ seed });
  w.zones = [];
  Object.assign(w.terrain, { height: () => 0, ground: () => 0, inWater: () => false, slope: () => 0, near: () => [] });
  w.player.y = 0;
  return w;
}

// Step `frames` times with a fixed input or a function of the frame number; returns every event.
export function run(w, frames, input = {}) {
  const events = [];
  for (let i = 0; i < frames; i++) {
    w.step(typeof input === 'function' ? input(i) : input);
    events.push(...w.drainEvents());
  }
  return events;
}

// Put a virus `dist` metres in front of the player (+z), awake and facing it. `dx` shifts it sideways (+x is
// the camera's left when the camera faces +z).
export function place(w, type, dist, state = 'chase', dx = 0) {
  const p = w.player;
  const zone = { id: 99, x: p.x + dx, z: p.z + dist, roster: [type] };
  const e = w.spawnEnemy(type, zone, 0);
  e.x = p.x + dx;
  e.z = p.z + dist;
  e.y = w.terrain.ground(e.x, e.z) + (e.def.hover ?? 0);
  e.spawnT = 0;
  e.yaw = Math.atan2(p.x - e.x, p.z - e.z);
  e.state = state;
  w.drainEvents();
  return e;
}

// A virus that stands still and never attacks (it stays in its recover state).
export function dummy(w, type, dist, dx = 0) {
  const e = place(w, type, dist, 'recover', dx);
  e.t = 1e9;
  return e;
}
