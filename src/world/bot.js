// A demo pilot for the open world (?auto=1): heads for the nearest open rift and fights what comes out the way
// a player would: locks on, closes in and mashes combos, shoots from range, uses its chips, takes every
// reaction command it is offered, jumps shockwaves and dodges dives. Between fights it visits the garage:
// it buys parts it can afford and tries each new part it owns, then forges a few weapons of its own (unlocking
// their mods with DATA) and wears each in turn, so the demo shows them all in time. Used for
// the attract demo, browser smoke tests and showcase clips. It steers the camera while roaming; locked on, the
// view frames the target itself.

import { PARTS, STARTER } from './parts.js';
import { MODS, MAX_DESIGNS } from './forge.js';

// Weapons the demo pilot forges once it owns the base.
const PRESETS = [
  { name: 'Ember Edge', slot: 'arm', base: 'saber', form: { shape: 1, size: 1, color: 11, glow: 5 }, element: 'fire', mods: ['heavy', 'burst'] },
  { name: 'Leaf Buster', slot: 'gun', base: 'buster', form: { shape: 2, size: 1, color: 8, glow: 7 }, element: 'wood', mods: ['swift', 'homing'] },
  { name: 'Volt Pike', slot: 'arm', base: 'lance', form: { shape: 1, size: 2, color: 2, glow: 6 }, element: 'elec', mods: ['reach', 'chain'] },
  { name: 'Tide Fan', slot: 'gun', base: 'spreader', form: { shape: 3, size: 1, color: 1, glow: 9 }, element: 'aqua', mods: ['split'] },
  { name: 'Quake Axe', slot: 'arm', base: 'breaker', form: { shape: 3, size: 2, color: 4, glow: 5 }, element: 'fire', mods: ['wave'] },
  { name: 'Storm Rail', slot: 'gun', base: 'railgun', form: { shape: 1, size: 1, color: 2, glow: 6 }, element: 'elec', mods: ['quick', 'split'] },
];

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function makeBot(world, { garage = true } = {}) {
  let t = 0;
  let chargeUntil = 0;
  const tried = new Set(Object.values(STARTER));
  const wore = new Set();
  return (view) => {
    t++;
    const p = world.player;
    const out = { move: { x: 0, y: 0 }, attack: false, shoot: false, jump: false, dash: false, lock: false, react: false, chip: 0 };
    if (!p.alive) return out;
    // The garage, out of combat now and then: try a new part, else buy one.
    if (garage && t % 90 === 0 && world.canGarage()) {
      const fresh = Object.keys(PARTS).find((k) => world.owned.has(k) && !tried.has(k));
      if (fresh) {
        tried.add(fresh);
        out.garage = { op: 'equip', part: fresh };
        return out;
      }
      const buy = Object.keys(PARTS).find((k) => !world.owned.has(k) && PARTS[k].price <= world.wallet);
      if (buy) {
        out.garage = { op: 'buy', part: buy };
        return out;
      }
      // The forge: wear each weapon it has forged, then make the next preset it can (unlocking its mods
      // first, once the viruses have taught them).
      const wear = world.designs.find((d) => !wore.has(d.id));
      if (wear) {
        wore.add(wear.id);
        out.garage = { op: 'equip-design', id: wear.id };
        return out;
      }
      const preset = PRESETS.find((d) => world.owned.has(d.base) && !world.designs.some((x) => x.name === d.name));
      const locked = preset?.mods.find((m) => !world.programs.has(m));
      if (preset && locked && world.modLearned(locked) && MODS[locked].price <= world.wallet) {
        out.garage = { op: 'unlock', mod: locked };
        return out;
      }
      if (preset && !locked && world.designs.length < MAX_DESIGNS) {
        out.garage = { op: 'forge', design: preset };
        return out;
      }
    }
    const foes = world.enemies.filter((e) => e.alive && e.spawnT <= 0);
    let foe = null;
    let best = 48;
    for (const e of foes) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < best) {
        best = d;
        foe = e;
      }
    }
    const target = world.lockTarget() ?? foe;
    const dist = target ? Math.hypot(target.x - p.x, target.z - p.z) : Infinity;
    let tx;
    let tz;
    if (target) {
      tx = target.x;
      tz = target.z;
    } else {
      const open = world.zones.filter((z) => z.state !== 'cleared');
      const goal = (open.length ? open : world.zones).reduce((a, z) => (Math.hypot(z.x - p.x, z.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? z : a));
      tx = goal.x;
      tz = goal.z;
    }
    if (p.lock == null) {
      const want = Math.atan2(tx - p.x, tz - p.z);
      view.cam.yaw += wrap(want - view.cam.yaw) * (target ? 0.12 : 0.05);
      view.cam.pitch += (-0.18 - view.cam.pitch) * 0.05;
      // Lock on once something is close (one press every few frames until it takes).
      if (foe && best < 30 && t % 12 === 0) out.lock = true;
    }
    if (target) {
      if (dist > 8) {
        // Run in, popping the buster; charge a shot now and then.
        out.move.y = 1;
        if (t % 300 === 0) chargeUntil = t + 80;
        out.shoot = t < chargeUntil || t % 10 < 2;
      } else {
        out.move.x = Math.sin(t / 70) * 0.4;
        out.attack = t % 8 < 4; // mash: every press past the first is buffered into the combo
      }
      // Chips when viruses are close and the chip is ready.
      if (dist < 12) {
        world.deck.forEach((k, i) => {
          if ((world.chipCd[k] ?? 0) <= 0 && t % 45 === i * 15) out.chip = i + 1;
        });
      }
    } else out.move.y = 1;
    // Reaction commands whenever offered; otherwise jump shockwaves and dodge dives.
    if (p.reaction) out.react = t % 2 === 0;
    for (const h of world.hazards) {
      if (h.team === 'player') continue;
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d - h.r > 0 && d - h.r < 2.2) out.jump = true;
    }
    if (!p.reaction) {
      for (const e of foes) {
        if (e.type === 'dartfin' && e.state === 'windup' && e.t < 0.15) {
          out.dash = true;
          out.move.x = 1;
        }
      }
    }
    // Hop over small rises and out of water now and then.
    if (p.wading && t % 40 === 0) out.jump = true;
    return out;
  };
}
