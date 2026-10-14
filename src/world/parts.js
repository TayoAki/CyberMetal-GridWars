import { GROUND_COMBO, AIR_COMBO, LAUNCHER } from './combat.js';

// Parts decide how the mech fights, the way Medabots and Custom Robo do. Four slots:
//   arm  (right arm): what ATTACK does (the combo, its reach and lunge, its finishers)
//   gun  (left arm):  what SHOOT does (tap fire and the charged shot)
//   legs:             how you move (speed, jump, dodges, air dodges, weight)
//   core:             health and a passive
// The starting kit is free. Others are bought with DATA in the garage, and sealing a rift turns one up.
// Pure data and helpers; the World applies them inside its fixed step.

export const SLOTS = ['arm', 'gun', 'legs', 'core'];
export const SLOT_NAMES = { arm: 'ARM', gun: 'GUN', legs: 'LEGS', core: 'CORE' };
export const STARTER = { arm: 'saber', gun: 'buster', legs: 'striders', core: 'standard' };

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- arms: the ATTACK button
// Strikes use the same fields as the saber's (see combat.js). Extra fields:
//   heavy: the hit breaks revenge armor;  charge: { speed, time } the finisher dashes forward hitting
//   everything it passes (once each);  stop: hit-stop frames for ordinary hits.
// `launcher` is the saber's alternative finisher one on one (others always use their own).
const ARMS = {
  saber: { ground: GROUND_COMBO, air: AIR_COMBO, launcher: LAUNCHER, magnet: 9, stop: 3 },
  breaker: {
    ground: [
      { name: 'smash1', dur: 0.46, hit: 0.2, cancel: 0.32, dmg: 16, reach: 2.8, arc: 2.2, push: 4, heavy: true },
      { name: 'smash2', dur: 0.5, hit: 0.22, cancel: 0.34, dmg: 18, reach: 2.8, arc: 2.2, push: 4.5, heavy: true },
      { name: 'quake', dur: 0.72, hit: 0.3, cancel: 0.72, dmg: 30, reach: 4.2, arc: TAU, push: 9, launch: 6, heavy: true, finisher: true },
    ],
    air: [
      { name: 'airSmash', dur: 0.4, hit: 0.18, cancel: 0.3, dmg: 14, reach: 2.8, arc: 2.4, push: 3, heavy: true, air: true },
      { name: 'meteor', dur: 0.6, hit: 0.24, cancel: 0.6, dmg: 26, reach: 3.4, arc: TAU, push: 6, slam: 22, heavy: true, air: true, finisher: true },
    ],
    magnet: 6,
    stop: 5,
  },
  lance: {
    ground: [
      { name: 'thrust1', dur: 0.28, hit: 0.1, cancel: 0.18, dmg: 8, reach: 3.9, arc: 0.9, push: 2 },
      { name: 'thrust2', dur: 0.28, hit: 0.1, cancel: 0.18, dmg: 8, reach: 3.9, arc: 0.9, push: 2 },
      { name: 'thrust3', dur: 0.3, hit: 0.11, cancel: 0.2, dmg: 10, reach: 4.1, arc: 0.9, push: 3 },
      { name: 'pierce', dur: 0.6, hit: 0.1, cancel: 0.6, dmg: 24, reach: 2.2, arc: TAU, push: 7, finisher: true, charge: { speed: 26, time: 0.3 } },
    ],
    air: [
      { name: 'airThrust1', dur: 0.28, hit: 0.1, cancel: 0.18, dmg: 8, reach: 3.8, arc: 1.0, push: 1.5, air: true },
      { name: 'airThrust2', dur: 0.28, hit: 0.1, cancel: 0.18, dmg: 8, reach: 3.8, arc: 1.0, push: 1.5, air: true },
      { name: 'skewer', dur: 0.5, hit: 0.18, cancel: 0.5, dmg: 20, reach: 3.6, arc: 1.4, push: 4, slam: 18, air: true, finisher: true },
    ],
    magnet: 13,
    stop: 3,
  },
  claws: {
    ground: [
      { name: 'rake1', dur: 0.2, hit: 0.07, cancel: 0.12, dmg: 5, reach: 2.3, arc: 2.4, push: 0.8 },
      { name: 'rake2', dur: 0.2, hit: 0.07, cancel: 0.12, dmg: 5, reach: 2.3, arc: 2.4, push: 0.8 },
      { name: 'rake3', dur: 0.2, hit: 0.07, cancel: 0.12, dmg: 5, reach: 2.3, arc: 2.4, push: 0.8 },
      { name: 'rake4', dur: 0.22, hit: 0.08, cancel: 0.14, dmg: 6, reach: 2.4, arc: 2.4, push: 1.2 },
      { name: 'uppercut', dur: 0.44, hit: 0.14, cancel: 0.44, dmg: 16, reach: 2.6, arc: 2.2, push: 2, launch: 13, finisher: true },
    ],
    air: [
      { name: 'airRake1', dur: 0.2, hit: 0.07, cancel: 0.12, dmg: 5, reach: 2.5, arc: 2.6, push: 0.6, air: true },
      { name: 'airRake2', dur: 0.2, hit: 0.07, cancel: 0.12, dmg: 5, reach: 2.5, arc: 2.6, push: 0.6, air: true },
      { name: 'airRake3', dur: 0.2, hit: 0.07, cancel: 0.12, dmg: 5, reach: 2.5, arc: 2.6, push: 0.6, air: true },
      { name: 'rend', dur: 0.42, hit: 0.15, cancel: 0.42, dmg: 16, reach: 3.0, arc: TAU, push: 5, slam: 16, air: true, finisher: true },
    ],
    magnet: 8,
    stop: 2,
  },
};

// ---------------------------------------------------------------- guns: the SHOOT button
// Every gun fires on a tap and charges while held (mid and full levels, in seconds held). Shot numbers per
// level are [tap, mid, full].
const GUNS = {
  // Mega Man X's buster: rapid shots, a stronger mid shot and a full shot that bursts.
  buster: { cooldown: 0.11, charge: { delay: 0.28, mid: 0.65, full: 1.25 } },
  // A cone of short-lived pellets: deadly up close, useless far away.
  spreader: {
    cooldown: 0.34, charge: { delay: 0.25, mid: 0.5, full: 1.0 },
    pellets: [5, 7, 11], cone: [0.2, 0.24, 0.32], dmg: [4, 5, 6], speed: 46, life: 0.34, radius: 0.22,
  },
  // Weak needles on a tap; a charged release is an instant beam through everything in a line.
  railgun: {
    cooldown: 0.35, charge: { delay: 0.25, mid: 0.7, full: 1.4 },
    needle: { dmg: 5, speed: 90, life: 1.0, radius: 0.18 }, beam: [0, 24, 58], range: 90, width: 0.55,
  },
  // Lobbed bombs that arc onto the target and burst; a full charge throws three.
  bomber: {
    cooldown: 0.55, charge: { delay: 0.25, mid: 0.6, full: 1.2 },
    dmg: [12, 22, 18], splash: [3.2, 4.5, 3.6], splashDmg: [12, 22, 16], count: [1, 1, 3], radius: [0.35, 0.5, 0.4], gravity: 22, range: 18,
  },
};

// ---------------------------------------------------------------- legs: movement
// weight scales the knockback you take (heavier moves less); steady: hits of at most this much damage don't
// stagger you; glide: holding jump while falling floats you down.
const LEGS = {
  striders: { run: 9.5, accel: 70, airAccel: 22, jump: 12.5, dashSpeed: 25, dashTime: 0.2, dashCooldown: 0.55, airDashes: 1, weight: 1 },
  hover: { run: 8.6, accel: 48, airAccel: 38, jump: 10.5, dashSpeed: 24, dashTime: 0.22, dashCooldown: 0.5, airDashes: 2, weight: 0.8, glide: true },
  sprinters: { run: 12.5, accel: 95, airAccel: 26, jump: 11.5, dashSpeed: 31, dashTime: 0.2, dashCooldown: 0.42, airDashes: 1, weight: 0.9 },
  treads: { run: 7.6, accel: 55, airAccel: 14, jump: 9.5, dashSpeed: 21, dashTime: 0.2, dashCooldown: 0.6, airDashes: 1, weight: 1.7, steady: 12 },
};

// ---------------------------------------------------------------- cores: health and a passive
const CORES = {
  standard: { hp: 120 },
  fortress: { hp: 165, weight: 0.25 },
  link: { hp: 100, chipCd: 0.65, chipDmg: 1.15 },
  overclock: { hp: 110, counter: 3, react: 1.5 },
};

// The catalog the garage shows. `color` tints the part on the mech and in the menus.
export const PARTS = {
  saber: { slot: 'arm', name: 'Saber', price: 0, color: 0x4adfff, desc: 'Three slashes and a finisher: a spin when crowded, a launcher one on one.' },
  breaker: { slot: 'arm', name: 'Breaker', price: 90, color: 0xff9a3a, desc: 'Two heavy smashes and a ground quake. Every hit breaks revenge armor.' },
  lance: { slot: 'arm', name: 'Lance', price: 60, color: 0xbfe6ff, desc: 'Long thrusts that lunge from 13 m, and a charge that pierces a whole line.' },
  claws: { slot: 'arm', name: 'Claws', price: 70, color: 0xff5ae0, desc: 'Four fast rakes and an uppercut, and the longest air combo.' },
  buster: { slot: 'gun', name: 'Buster', price: 0, color: 0x6ae8ff, desc: 'Rapid shots; hold for a charge shot that bursts.' },
  spreader: { slot: 'gun', name: 'Spreader', price: 50, color: 0xffd84a, desc: 'A cone of pellets that shreds up close. Charge for a wider blast.' },
  railgun: { slot: 'gun', name: 'Railgun', price: 90, color: 0xb08aff, desc: 'Weak needles; charge for a beam that pierces everything in a line.' },
  bomber: { slot: 'gun', name: 'Bomber', price: 70, color: 0xff7a3a, desc: 'Lobs bombs onto your target, over cover. A full charge throws three.' },
  striders: { slot: 'legs', name: 'Striders', price: 0, color: 0x8ab0ff, desc: 'All-round legs: one air dodge.' },
  hover: { slot: 'legs', name: 'Hover', price: 70, color: 0x5af0ff, desc: 'Hold jump to glide; two air dodges. Light, so hits knock you further.' },
  sprinters: { slot: 'legs', name: 'Sprinters', price: 50, color: 0xffe36a, desc: 'Fastest on foot, with a long, quick dodge.' },
  treads: { slot: 'legs', name: 'Treads', price: 80, color: 0xd08a4a, desc: 'Slow and heavy: light hits don\'t stagger you, and knockback barely moves you.' },
  standard: { slot: 'core', name: 'Standard', price: 0, color: 0x6ae8ff, desc: '120 HP.' },
  fortress: { slot: 'core', name: 'Fortress', price: 90, color: 0xff9a3a, desc: '165 HP, and heavier.' },
  link: { slot: 'core', name: 'Link', price: 60, color: 0x6affa0, desc: '100 HP. Chips recharge 35% faster and hit 15% harder.' },
  overclock: { slot: 'core', name: 'Overclock', price: 80, color: 0xff5ae0, desc: '110 HP. Counters deal ×3 and reaction commands ×1.5.' },
};
const TABLE = { arm: ARMS, gun: GUNS, legs: LEGS, core: CORES };

export const partsIn = (slot) => Object.keys(PARTS).filter((k) => PARTS[k].slot === slot);

// Everything the simulation needs from a loadout, merged into one object.
export function buildKit(loadout) {
  const arm = ARMS[loadout.arm];
  const gun = GUNS[loadout.gun];
  const legs = LEGS[loadout.legs];
  const core = CORES[loadout.core];
  return {
    loadout: { ...loadout },
    arm, gun, legs, core,
    gunKind: loadout.gun,
    hp: core.hp,
    weight: legs.weight + (core.weight ?? 0),
    chipCd: core.chipCd ?? 1,
    chipDmg: core.chipDmg ?? 1,
    counter: core.counter ?? 2,
    react: core.react ?? 1,
  };
}

// A loadout is valid when every slot holds a part made for that slot.
export function validLoadout(loadout) {
  return !!loadout && SLOTS.every((s) => PARTS[loadout[s]]?.slot === s && TABLE[s][loadout[s]]);
}

const FINISHER_NAMES = { finisher: 'spin or launcher', quake: 'ground quake', pierce: 'piercing charge', uppercut: 'uppercut launcher' };

// Numbers the garage shows for a part (labels and values), computed from the data above.
export function partStats(key) {
  const part = PARTS[key];
  if (!part) return [];
  const d = TABLE[part.slot][key];
  if (part.slot === 'arm') {
    const fin = d.ground.at(-1);
    const total = d.ground.reduce((n, s) => n + s.dmg, 0);
    return [['Hits', `${d.ground.length - 1} + finisher`], ['Combo dmg', String(total)], ['Reach', `${Math.max(...d.ground.map((s) => s.reach)).toFixed(1)} m`], ['Lunge', `${d.magnet} m`], ['Air hits', String(d.air.length)], ['Finisher', FINISHER_NAMES[fin.name] ?? fin.name]];
  }
  if (part.slot === 'gun') {
    if (key === 'buster') return [['Tap', '6 dmg, rapid'], ['Charge', '18 / 46 + burst'], ['Range', 'long']];
    if (key === 'spreader') return [['Tap', `${d.pellets[0]} × ${d.dmg[0]} dmg`], ['Charge', `${d.pellets[2]} × ${d.dmg[2]} dmg`], ['Range', 'short']];
    if (key === 'railgun') return [['Tap', `${d.needle.dmg} dmg needle`], ['Charge', `${d.beam[1]} / ${d.beam[2]} beam, pierces`], ['Range', `${d.range} m`]];
    return [['Tap', `${d.dmg[0]} + ${d.splashDmg[0]} burst`], ['Charge', `${d.dmg[1]} + ${d.splashDmg[1]} / 3 bombs`], ['Range', `${d.range} m arc`]];
  }
  if (part.slot === 'legs') return [['Speed', `${d.run} m/s`], ['Jump', d.jump.toFixed(1)], ['Dodge', `${d.dashSpeed} m/s`], ['Air dodges', String(d.airDashes)], ['Weight', d.weight.toFixed(1)]];
  const passive = d.chipCd ? `chips ×${d.chipDmg} dmg, recharge ×${d.chipCd}` : d.counter ? `counters ×${d.counter}, reactions ×${d.react}` : d.weight ? `weight +${d.weight}` : 'none';
  return [['HP', String(d.hp)], ['Passive', passive]];
}
