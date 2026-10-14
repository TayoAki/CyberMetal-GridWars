// Kingdom Hearts 2-style close combat for the open world, plus the Battle Network idea that a deleted virus
// teaches you its skill as a chip. Pure data and helpers; the World runs them inside its fixed step.

// Ground combo: three strikes and a finisher. Air combo: two strikes and a finisher that slams the target down.
// `hit` is when the blade connects (s), `cancel` when a buffered press may start the next strike, `reach`/`arc`
// the hit area in front of the player (arc in radians; 2*PI is all around), `push`/`launch` the knockback.
// Every strike lunges at the target when it is out of reach (magnetism). As in KH2, a strike that hits nothing
// ends the combo, and the finisher depends on the situation: a spin when viruses crowd you, otherwise a rising
// slash that launches the target for an air combo.
export const GROUND_COMBO = [
  { name: 'slash1', dur: 0.3, hit: 0.11, cancel: 0.2, dmg: 9, reach: 2.6, arc: 2.3, push: 1.5 },
  { name: 'slash2', dur: 0.3, hit: 0.11, cancel: 0.2, dmg: 9, reach: 2.6, arc: 2.3, push: 1.5 },
  { name: 'slash3', dur: 0.34, hit: 0.13, cancel: 0.24, dmg: 11, reach: 2.8, arc: 2.6, push: 2.5 },
  { name: 'finisher', dur: 0.56, hit: 0.22, cancel: 0.56, dmg: 24, reach: 3.3, arc: Math.PI * 2, push: 9, launch: 7, finisher: true },
];
export const LAUNCHER = { name: 'launcher', dur: 0.5, hit: 0.16, cancel: 0.5, dmg: 26, reach: 3.0, arc: 2.2, push: 2, launch: 12, finisher: true };
export const CROWD = { radius: 4.5, count: 2 }; // this many viruses this close: the spinning finisher
export const AIR_COMBO = [
  { name: 'air1', dur: 0.28, hit: 0.1, cancel: 0.18, dmg: 8, reach: 2.7, arc: 2.6, push: 1, air: true },
  { name: 'air2', dur: 0.28, hit: 0.1, cancel: 0.18, dmg: 8, reach: 2.7, arc: 2.6, push: 1, air: true },
  { name: 'airFinisher', dur: 0.5, hit: 0.2, cancel: 0.5, dmg: 20, reach: 3.3, arc: Math.PI * 2, push: 8, slam: 14, air: true, finisher: true },
];
export const MELEE = {
  magnet: 9, // metres: how far a strike will lunge to reach its target
  lungeSpeed: 24, // sets the lunge's duration (gap / lungeSpeed, within 0.06-0.2 s)
  lungeMax: 0.2, // s
  lungeTop: 40, // m/s cap while homing in on a moving target
  vertical: 2.8, // metres of height difference a strike still reaches (a hovering Dartfin, from the ground)
  armorAfter: 7, // hits in a row before a virus shrugs off flinching (KH2's "revenge value")
  armorTime: 1.4,
};
export const HITSTOP = { slash: 3, finisher: 6, counter: 8, reaction: 9 };
// Lock-on reach; when the target is deleted the lock moves to the nearest virus on screen within `retarget` m
// (`view` radians either side of the camera's forward), otherwise it lets go.
export const LOCK = { range: 40, keep: 50, retarget: 15, view: 1.1 };
export const COMBO_GRACE = 0.3; // s after a strike (or a chip that cut into the combo) in which a press continues the combo

// Reaction commands: context prompts that appear when an enemy's attack can be turned around.
export const REACTIONS = {
  break: { label: 'BREAK', dmg: 30, stun: 1.4 }, // a Rivet winding up its slam: smash it first
  reversal: { label: 'REVERSAL', dmg: 26, stun: 1.6 }, // a Dartfin diving at you: warp behind and strike
  deflect: { label: 'DEFLECT', mult: 2.5 }, // a cannonball about to hit: bat it back
};

// Chips: each virus family's signature attack, learned by deleting it. Levels come from more deletes.
// Cooldowns follow Birth by Sleep's command deck (light commands reload in about 10 s), a little quicker.
export const CHIPS = {
  shockwave: { short: 'Shock', color: 0xffb040, name: 'ShockWave', from: 'rivet', cooldown: 8, dmg: [0, 30, 42, 56], desc: 'Slam the ground: a shockwave ring hits every virus around you.' },
  cannon: { short: 'Cannon', color: 0xffd84a, name: 'Cannon', from: 'plinker', cooldown: 7, dmg: [0, 45, 62, 80], desc: 'A heavy cannonball at your target that bursts on impact.' },
  findash: { short: 'FinDash', color: 0x5af0ff, name: 'FinDash', from: 'dartfin', cooldown: 6, dmg: [0, 28, 38, 50], desc: 'Dive through enemies in a line, invincible on the way.' },
};
export const CHIP_OF = Object.fromEntries(Object.entries(CHIPS).map(([k, c]) => [c.from, k]));
export const CHIP_LEVELS = [0, 1, 5, 15]; // deletes needed for level 1, 2, 3
// A chip that cuts in after the third strike of a combo has landed is a finisher (like KH2's spell finishers).
export const CHIP_FINISH = 2;
export const DECK_SIZE = 4;

export const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function chipLevel(deletes) {
  let level = 0;
  for (let l = 1; l < CHIP_LEVELS.length; l++) if (deletes >= CHIP_LEVELS[l]) level = l;
  return level;
}

// Angle of an enemy around the player as seen from the camera: 0 straight ahead, positive to the left.
export function viewAngle(p, e, camYaw) {
  return wrap(Math.atan2(e.x - p.x, e.z - p.z) - camYaw);
}

// Is `e` within `limit` radians of the camera's forward (roughly on screen)?
export function onScreen(p, e, camYaw, limit = LOCK.view) {
  return Math.abs(viewAngle(p, e, camYaw)) <= limit;
}

// Lock-on choice: favour what the camera faces, then what is close.
export function pickTarget(enemies, p, camYaw) {
  let best = null;
  let bestScore = Infinity;
  for (const e of enemies) {
    if (!e.alive || e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d > LOCK.range) continue;
    const a = Math.abs(viewAngle(p, e, camYaw));
    if (a > 1.4 && d > 12) continue; // behind the camera and not close
    const score = a * 14 + d;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

// Next target to the right (dir = 1) or left (dir = -1) of the current one, as seen from the camera.
export function switchTarget(enemies, p, current, camYaw, dir) {
  const list = enemies
    .filter((e) => e.alive && e.spawnT <= 0 && e !== current && Math.hypot(e.x - p.x, e.z - p.z) <= LOCK.range)
    .map((e) => ({ e, a: viewAngle(p, e, camYaw) }));
  if (!list.length) return current;
  const a0 = current ? viewAngle(p, current, camYaw) : 0;
  // Right means a smaller angle. Pick the nearest one on that side, else wrap around.
  const side = list.filter((x) => (dir > 0 ? x.a < a0 : x.a > a0));
  if (side.length) return side.reduce((b, x) => (Math.abs(x.a - a0) < Math.abs(b.a - a0) ? x : b)).e;
  return list.reduce((b, x) => (dir > 0 ? (x.a > b.a ? x : b) : x.a < b.a ? x : b)).e;
}
