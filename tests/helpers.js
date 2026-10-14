import { Battle } from '../src/engine/battle.js';

// Test helpers: build a battle, skip to the fight, and drive it with scripted pads.

export function folderOf(...specs) {
  // specs: 'cannon:A' strings, repeated to fill 30 if needed
  const out = specs.map((s) => {
    const [key, code] = s.split(':');
    return { key, code: code ?? '*' };
  });
  return out;
}

export function makeBattle({ enemies = [], folder = [], seed = 7, player = {}, field = null, shuffle = false } = {}) {
  return new Battle({
    seed,
    shuffle,
    encounter: { enemies, field },
    player: { folder, ...player },
  });
}

export function run(b, frames, pad = {}) {
  for (let i = 0; i < frames; i++) b.step(pad);
}

// Advance until the Custom Screen is open.
export function toCustom(b) {
  let n = 0;
  while (b.phase !== 'custom' && n++ < 1000) b.step({});
  if (b.phase !== 'custom') throw new Error(`never reached custom (phase ${b.phase})`);
}

export function press(b, button, holdFrames = 1) {
  for (let i = 0; i < holdFrames; i++) b.step({ [button]: true });
  b.step({});
}

// Confirm the Custom Screen with nothing selected, then run until fighting.
export function toFight(b) {
  toCustom(b);
  b.custom.confirm();
  let n = 0;
  while (b.phase !== 'fight' && n++ < 1000) b.step({});
  if (b.phase !== 'fight') throw new Error(`never reached fight (phase ${b.phase})`);
}

// Select hand indices (in order) and confirm; then run until fighting.
export function pickAndFight(b, indices) {
  toCustom(b);
  for (const i of indices) {
    if (!b.custom.select(i)) throw new Error(`could not select hand[${i}] ${JSON.stringify(b.custom.hand[i])}`);
  }
  b.custom.confirm();
  let n = 0;
  while (b.phase !== 'fight' && n++ < 1000) b.step({});
}

export function enemy(b, type) {
  return b.entities.find((e) => e.type === type);
}
