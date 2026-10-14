import { Rng } from '../engine/rng.js';

// The open world's ground: a seeded height field of rolling hills in a bowl of mountains, with a lake, a flat
// clearing where the player starts, trees and rocks, and the "glitch zones" where viruses leak out of the net.
// Pure functions of the seed: the simulation and the view both read the same terrain.

export const WORLD_SIZE = 384; // metres across
export const HALF = WORLD_SIZE / 2;
export const WATER_LEVEL = -2.2;
export const PLAY_RADIUS = HALF * 0.78; // the mountain rim starts beyond this

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Value noise on a seeded lattice, smoothly interpolated; fbm adds octaves.
function makeNoise(seed) {
  const rng = new Rng(seed);
  const p = rng.shuffle([...Array(256).keys()]);
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = rng.next() * 2 - 1;
  const at = (ix, iz) => val[perm[(ix & 255) + perm[iz & 255]]];
  const noise = (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = at(ix, iz);
    const b = at(ix + 1, iz);
    const c = at(ix, iz + 1);
    const d = at(ix + 1, iz + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, z, octaves = 4) => {
    let sum = 0;
    let amp = 1;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f, z * f);
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
  return { noise, fbm };
}

export function makeTerrain(seed = 1) {
  const rng = new Rng(seed ^ 0x5eed);
  const { fbm } = makeNoise(seed);
  const spawn = { x: 0, z: 0 };
  const lakeAngle = rng.next() * Math.PI * 2;
  const lake = { x: Math.cos(lakeAngle) * HALF * 0.34, z: Math.sin(lakeAngle) * HALF * 0.34, r: 24 };

  const base = (x, z) => {
    const d = Math.hypot(x, z);
    let h = 7 * fbm(x / 70, z / 70, 4) + 2.2 * fbm(x / 22 + 31, z / 22 - 17, 3);
    h += smoothstep(PLAY_RADIUS * 0.92, HALF * 0.98, d) * (30 + 18 * fbm(x / 40 + 5, z / 40 + 9, 3));
    const dl = Math.hypot(x - lake.x, z - lake.z);
    h -= 10 * Math.exp(-(dl * dl) / (2 * lake.r * lake.r));
    return h;
  };
  const spawnH = Math.max(base(spawn.x, spawn.z), WATER_LEVEL + 1.5);
  const height = (x, z) => {
    const h = base(x, z);
    const flat = 1 - smoothstep(10, 26, Math.hypot(x - spawn.x, z - spawn.z));
    return h * (1 - flat) + spawnH * flat;
  };
  // Surface the player stands on: the ground, or the wading depth in the lake.
  const ground = (x, z) => Math.max(height(x, z), WATER_LEVEL - 0.9);
  const inWater = (x, z) => height(x, z) < WATER_LEVEL - 0.1;
  const slope = (x, z) => {
    const e = 0.75;
    return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
  };

  // Glitch zones: a ring of rifts at mid distance, away from the lake.
  const zones = [];
  const rosters = [
    ['rivet', 'rivet', 'rivet'],
    ['rivet', 'plinker', 'rivet'],
    ['dartfin', 'dartfin', 'rivet'],
    ['plinker', 'plinker', 'dartfin'],
    ['rivet', 'dartfin', 'plinker', 'rivet'],
    ['dartfin', 'plinker', 'dartfin', 'plinker'],
  ];
  const turn = rng.next() * Math.PI * 2;
  for (let i = 0; zones.length < rosters.length && i < 60; i++) {
    const a = turn + (zones.length / rosters.length) * Math.PI * 2 + (rng.next() - 0.5) * 0.4;
    const dist = HALF * (0.32 + 0.3 * rng.next()) + i;
    const x = Math.cos(a) * dist;
    const z = Math.sin(a) * dist;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r * 1.8 || height(x, z) < WATER_LEVEL + 0.5) continue;
    zones.push({ id: zones.length, x, z, r: 14, roster: rosters[zones.length] });
  }

  // Trees and rocks on a jittered grid.
  const obstacles = [];
  const CELL = 9;
  for (let gx = -HALF; gx < HALF; gx += CELL) {
    for (let gz = -HALF; gz < HALF; gz += CELL) {
      const x = gx + rng.next() * CELL;
      const z = gz + rng.next() * CELL;
      const roll = rng.next();
      const scale = 0.75 + rng.next() * 0.6;
      const h = height(x, z);
      const d = Math.hypot(x, z);
      if (d > HALF * 0.97 || h < WATER_LEVEL + 0.4) continue;
      if (Math.hypot(x - spawn.x, z - spawn.z) < 15) continue;
      if (zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + 3)) continue;
      const forest = fbm(x / 55 + 70, z / 55 - 40, 2); // clumps trees into woods and meadows
      if (roll < 0.2 + Math.max(0, forest) * 0.9 && slope(x, z) < 0.8) {
        obstacles.push({ type: 'tree', x, z, r: 0.45 * scale, top: h + 7 * scale, scale, y: h });
      } else if (roll > 0.93) {
        obstacles.push({ type: 'rock', x, z, r: 1.1 * scale + 0.6, top: h + 1.6 * scale, scale, y: h, spin: rng.next() * Math.PI * 2 });
      }
    }
  }

  // Spatial hash so collision checks only look at nearby obstacles.
  const BUCKET = 12;
  const buckets = new Map();
  const keyOf = (bx, bz) => bx * 4096 + bz;
  for (const o of obstacles) {
    const k = keyOf(Math.floor(o.x / BUCKET), Math.floor(o.z / BUCKET));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  }
  const near = (x, z, radius) => {
    const out = [];
    const b0x = Math.floor((x - radius - 3) / BUCKET);
    const b1x = Math.floor((x + radius + 3) / BUCKET);
    const b0z = Math.floor((z - radius - 3) / BUCKET);
    const b1z = Math.floor((z + radius + 3) / BUCKET);
    for (let bx = b0x; bx <= b1x; bx++) for (let bz = b0z; bz <= b1z; bz++) for (const o of buckets.get(keyOf(bx, bz)) ?? []) out.push(o);
    return out;
  };

  return { seed, spawn, spawnH, lake, zones, obstacles, height, ground, inWater, slope, near };
}
