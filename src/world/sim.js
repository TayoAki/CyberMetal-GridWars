import { Rng } from '../engine/rng.js';
import { makeTerrain, PLAY_RADIUS, WATER_LEVEL } from './terrain.js';
import { ENEMY_TYPES, AI } from './enemies.js';
import {
  CROWD, MELEE, HITSTOP, LOCK, COMBO_GRACE, REACTIONS, CHIPS, CHIP_OF, CHIP_FINISH, DECK_SIZE, chipLevel, pickTarget, switchTarget, onScreen,
} from './combat.js';
import { PARTS, SLOTS, STARTER, buildKit, validLoadout } from './parts.js';
import { ELEMENTS, STATUS, MODS, MOD_KEYS, STARTER_MODS, MAX_DESIGNS, normalizeDesign, applyDesign } from './forge.js';

// The open-world simulation: a fixed 60 Hz step with no rendering, like the grid game's engine. The view sends
// one input per step and drains events (shots, hits, deletes...) for effects and sound. A seed plus an input
// log replays exactly, so it can be tested headless.
//
// Input per step (held booleans unless noted):
//   move: {x, y} camera-relative (x right, y forward, -1..1); camYaw, aimYaw, aimPitch; aimPoint {x,y,z} | null
//   attack (melee combo), shoot (buster; hold to charge; `fire` is accepted as an alias), jump, dash,
//   lock (toggle lock-on), next / prev (switch target), react (reaction command), chip: 0..4 (deck slot held)
//   garage: a one-off command from the garage menu: { op: 'buy' | 'equip', part }, or for the forge
//     { op: 'forge', design }, { op: 'equip-design' | 'delete-design', id }, { op: 'unlock', mod },
//     { op: 'dummy' } (training dummies to test weapons on)
// Yaw 0 faces +z; a facing yaw points along (sin yaw, cos yaw).
//
// The equipped parts (see parts.js) decide the moveset: the arm part the combo, the gun part what SHOOT
// fires, the legs part the movement and the core part the health and a passive. PLAYER, BUSTER and CHARGE
// below are the starting kit's numbers (Striders, Buster, Standard core).

export const DT = 1 / 60;
export const PLAYER = {
  radius: 0.5, maxHp: 120, run: 9.5, wadeRun: 5, accel: 70, airAccel: 22, gravity: 32, jump: 12.5,
  dashSpeed: 25, dashTime: 0.2, dashCooldown: 0.55, iframes: 1.0, flinch: 0.3,
};
export const BUSTER = { cooldown: 0.11, speed: 58, dmg: 6, radius: 0.28, life: 1.3 };
// Mega Man X rules: a tap fires the buster; holding charges; releasing fires a mid (after `mid` s) or full
// (after `full` s) charge shot. The full shot bursts on impact.
export const CHARGE = { delay: 0.28, mid: 0.65, full: 1.25, speed: 44, dmg: [0, 18, 46], splash: [0, 0, 3.4], splashDmg: [0, 0, 24], radius: [0, 0.45, 0.75] };
export const MUZZLE = { up: 1.2, side: 0.28, forward: 0.85 };
export const GARAGE_SAFE = 30; // metres: the garage only opens with no virus this close
const BUTTONS = ['shoot', 'attack', 'jump', 'dash', 'lock', 'next', 'prev', 'react'];
const HEAVY = new Set(['charge', 'cannon', 'deflect', 'blast', 'rail', 'bomb']); // shots that knock back
// How much a hit builds a virus's revenge value (KH2): a combo strike counts 1; pellets and rapid shots less.
const REVENGE = { pellet: 0.15, blast: 0.3, buster: 0.4, needle: 0.4, heavy: 0.5, arc: 0.3, burst: 0.3, burn: 0 };
const CHAIN = { range: 6, share: 0.5 }; // Chain mod: a second virus within range takes this share
const WAVE = { speed: 18, life: 0.8, share: 0.5 }; // Wave mod: the finisher's ground wave
const BURST = { radius: 3.2, share: 0.5, shotRadius: 2.2 }; // Burst mod
const DUMMY = { hp: 9999, life: 120, leash: 45 }; // training dummies
const HOMING = { turn: 10, cone: 0.6, range: 60 }; // Homing mod: steering per second, and how far off aim it picks a target

// Turn a direction around the vertical axis by `a` radians (positive turns left).
function turnDir(d, a) {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return { x: d.x * c + d.z * sn, y: d.y, z: -d.x * sn + d.z * c };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const at = (o) => ({ x: o.x, y: o.y, z: o.z });

export class World {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.terrain = makeTerrain(seed);
    this.t = 0;
    this.frame = 0;
    this.hitstop = 0; // frames the whole world freezes after a solid hit
    this.pending = null; // presses that land during a hit-stop, applied after it
    this.events = [];
    this.enemies = [];
    this.shots = [];
    this.hazards = [];
    this.pickups = [];
    this.nextId = 1;
    this.zones = this.terrain.zones.map((z) => ({ ...z, state: 'dormant', members: [], clears: 0 }));
    this.wave = 1; // sealing every rift starts the next, tougher wave
    // Chips survive being knocked down: they belong to the save, not the body.
    this.chips = {}; // key -> { deletes, level }
    this.deck = []; // up to DECK_SIZE chip keys, in the order learned
    this.chipCd = {}; // key -> seconds of cooldown left
    // Parts: the equipped loadout, what has been bought or found, and DATA to spend.
    this.loadout = { ...STARTER };
    this.owned = new Set(Object.values(STARTER));
    this.wallet = 0;
    // The forge: saved weapon designs, unlocked mods (programs), and which design each weapon slot uses.
    this.designs = [];
    this.programs = new Set(STARTER_MODS);
    this.equipped = { arm: null, gun: null };
    this.critCount = 0;
    this.leech = 0; // Wood's healing not paid out yet (under 1 HP)
    this.kit = this.makeKit();
    this.player = this.newPlayer();
    this.prev = {};
    this.prevChip = 0;
    this.stats = { shots: 0, hits: 0, kills: 0, damageTaken: 0, data: 0, counters: 0, reactions: 0, chipsUsed: 0, chipFinishes: 0, strikes: 0 };
  }

  newPlayer() {
    const { spawn } = this.terrain;
    return {
      x: spawn.x, y: this.terrain.ground(spawn.x, spawn.z), z: spawn.z, vx: 0, vy: 0, vz: 0, yaw: 0,
      onGround: true, airDashes: this.kit.legs.airDashes, hp: this.kit.hp, maxHp: this.kit.hp, alive: true, respawn: 0, gliding: false,
      iframes: 0, flinch: 0, dash: 0, dashDir: { x: 0, z: 1 }, dashCd: 0, fireCd: 0, aimHold: 0,
      charge: 0, charging: false, chargeFull: false, speed: 0, wading: false,
      lock: null, soft: null, action: null, airCombo: 0, reaction: null, attackQueue: 0, comboNext: 0, comboT: 0,
    };
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  addShot(s) {
    const shot = { id: this.nextId++, vx: 0, vy: 0, vz: 0, splash: 0, splashDmg: 0, gravity: 0, ...s };
    this.shots.push(shot);
    return shot;
  }

  enemy(id) {
    return id == null ? null : this.enemies.find((e) => e.id === id) ?? null;
  }

  lockTarget() {
    const e = this.enemy(this.player.lock);
    return e && e.alive ? e : null;
  }

  step(input = {}) {
    this.frame++;
    const held = {};
    for (const b of BUTTONS) held[b] = !!input[b];
    held.shoot = !!(input.shoot ?? input.fire);
    const edges = {};
    for (const b of BUTTONS) edges[b] = held[b] && !this.prev[b];
    edges.release = !held.shoot && !!this.prev.shoot;
    const chip = input.chip | 0;
    edges.chip = chip && chip !== this.prevChip ? chip : 0;
    this.prev = held;
    this.prevChip = chip;
    if (this.pending) {
      for (const k of Object.keys(this.pending)) edges[k] ||= this.pending[k];
      this.pending = null;
    }
    if (input.garage) this.garage(input.garage);
    // Hit-stop: everything holds still for a few frames; presses wait for it to end.
    if (this.hitstop > 0) {
      this.hitstop--;
      this.pending = edges;
      return;
    }
    this.t += DT;
    this.updatePlayer(input, held, edges);
    this.updateZones();
    for (const e of this.enemies) this.updateEnemy(e);
    this.separateEnemies();
    this.enemies = this.enemies.filter((e) => e.alive || (e.dying -= DT) > 0);
    this.updateShots();
    this.updateHazards();
    this.updatePickups();
    for (const k of Object.keys(this.chipCd)) this.chipCd[k] = Math.max(0, this.chipCd[k] - DT);
  }

  // ------------------------------------------------------------------ player

  updatePlayer(input, held, edges) {
    const p = this.player;
    const T = this.terrain;
    const dt = DT;
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) {
        Object.assign(p, this.newPlayer());
        this.emit('respawn', at(p));
      }
      return;
    }
    p.iframes = Math.max(0, p.iframes - dt);
    p.flinch = Math.max(0, p.flinch - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.aimHold = Math.max(0, p.aimHold - dt);
    if (p.flinch > 0 && p.action) p.action = null;

    this.updateLock(input, edges);
    this.updateReaction(edges);
    if (edges.chip) this.useChip(edges.chip, input);
    p.attackQueue = Math.max(0, p.attackQueue - dt);
    if (!p.action) p.comboT = Math.max(0, p.comboT - dt);
    if (edges.attack && p.flinch <= 0) this.attack(input);
    else if (p.attackQueue > 0 && p.dash <= 0 && !p.action && p.flinch <= 0) {
      p.attackQueue = 0;
      this.attack(input);
    }

    // Camera-relative movement.
    const cy = input.camYaw ?? 0;
    const mx = clamp(input.move?.x ?? 0, -1, 1);
    const my = clamp(input.move?.y ?? 0, -1, 1);
    let dx = -Math.cos(cy) * mx + Math.sin(cy) * my;
    let dz = Math.sin(cy) * mx + Math.cos(cy) * my;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    p.wading = T.inWater(p.x, p.z);
    const L = this.kit.legs;
    const top = (p.wading ? Math.min(PLAYER.wadeRun, L.run) : L.run) * (p.charging ? 0.8 : 1);

    // Dodge: also cancels a strike once it has landed, or its wind-down.
    const canCancel = !p.action || (p.action.kind === 'melee' && p.action.hitDone);
    if (edges.dash && canCancel && p.dashCd <= 0 && p.flinch <= 0 && (p.onGround || p.airDashes > 0)) {
      p.action = null;
      p.comboT = 0; // dodging ends the combo
      let ddx = dx;
      let ddz = dz;
      if (len < 0.2) {
        ddx = Math.sin(p.yaw);
        ddz = Math.cos(p.yaw);
      }
      const l = Math.hypot(ddx, ddz) || 1;
      p.dashDir = { x: ddx / l, z: ddz / l };
      p.dash = L.dashTime;
      p.dashCd = L.dashCooldown;
      if (!p.onGround) p.airDashes--;
      p.iframes = Math.max(p.iframes, L.dashTime + 0.05);
      p.vy = Math.max(0, p.vy);
      this.emit('dash', { ...at(p), dx: p.dashDir.x, dz: p.dashDir.z });
    }
    let gravity = PLAYER.gravity;
    if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dashDir.x * L.dashSpeed;
      p.vz = p.dashDir.z * L.dashSpeed;
      p.vy = 0;
      if (p.dash <= 0) {
        p.vx *= 0.4;
        p.vz *= 0.4;
      }
    } else if (p.action) {
      gravity = this.updateAction(input);
    } else if (p.flinch <= 0) {
      const acc = (p.onGround ? L.accel : L.airAccel) * dt;
      p.vx = approach(p.vx, dx * top, acc);
      p.vz = approach(p.vz, dz * top, acc);
    } else {
      p.vx = approach(p.vx, 0, 20 * dt);
      p.vz = approach(p.vz, 0, 20 * dt);
    }

    if (edges.jump && p.onGround && p.flinch <= 0 && (!p.action || (p.action.kind === 'melee' && p.action.hitDone))) {
      p.action = null;
      p.comboT = 0;
      p.vy = L.jump;
      p.onGround = false;
      this.emit('jump', at(p));
    }
    // Hover legs glide: holding jump while falling floats you down.
    p.gliding = !!L.glide && held.jump && !p.onGround && p.vy < 0 && p.dash <= 0 && !p.action && p.flinch <= 0;
    if (p.gliding) p.vy = Math.max(p.vy - gravity * 0.25 * dt, -3.5);
    else if (p.dash <= 0 && !p.onGround) p.vy -= gravity * dt;

    // Horizontal move, refusing to walk up cliffs.
    const nx = p.x + p.vx * dt;
    const nz = p.z + p.vz * dt;
    const run = Math.hypot(nx - p.x, nz - p.z);
    const g0 = T.ground(p.x, p.z);
    const g1 = T.ground(nx, nz);
    if (run > 0 && (g1 - g0) / run > 1.4 && g1 > p.y + 0.15) {
      p.vx *= 0.2;
      p.vz *= 0.2;
    } else {
      p.x = nx;
      p.z = nz;
    }
    this.keepInWorld(p);
    // Vertical: land, or stick to the ground walking downhill.
    p.y += p.vy * dt;
    const g = T.ground(p.x, p.z);
    if (p.y <= g) {
      if (!p.onGround && p.vy < -6) this.emit('land', at(p));
      p.y = g;
      p.vy = 0;
      p.onGround = true;
      p.airDashes = L.airDashes;
      p.airCombo = 0;
    } else if (p.onGround) {
      if (p.y - g < 0.45 && p.vy <= 0) p.y = g;
      else p.onGround = false;
    }

    // Facing: toward the target or the crosshair while fighting, otherwise along the movement.
    const target = this.lockTarget();
    const aiming = p.charging || p.aimHold > 0;
    if (!p.action) {
      const moveYaw = len > 0.1 ? Math.atan2(dx, dz) : p.yaw;
      let want = moveYaw;
      if (p.dash > 0) want = Math.atan2(p.dashDir.x, p.dashDir.z);
      else if (aiming) want = target ? Math.atan2(target.x - p.x, target.z - p.z) : input.aimYaw ?? cy;
      const diff = wrap(want - p.yaw);
      const rate = (aiming ? 20 : 12) * dt;
      p.yaw = wrap(p.yaw + clamp(diff, -rate, rate));
    }
    p.speed = Math.hypot(p.vx, p.vz);
    // KH2's soft target: what the next strike would home in on when nothing is locked (the view marks it).
    p.soft = p.lock ? null : this.meleeTarget(input)?.id ?? null;

    // Buster and charge shot (not mid-strike).
    if (p.flinch > 0) {
      p.charge = 0;
      p.charging = false;
      p.chargeFull = false;
      return;
    }
    if (p.action) return;
    if (edges.shoot && p.fireCd <= 0) this.fire(p, input, 0);
    const C = this.kit.gun.charge;
    if (held.shoot) {
      p.charge += dt;
      if (!p.charging && p.charge >= C.delay) {
        p.charging = true;
        this.emit('charge-start', at(p));
      }
      if (!p.chargeFull && p.charge >= C.full) {
        p.chargeFull = true;
        this.emit('charge-full', at(p));
      }
    } else if (edges.release) {
      const level = p.charge >= C.full ? 2 : p.charge >= C.mid ? 1 : 0;
      if (level) this.fire(p, input, level);
      p.charge = 0;
      p.charging = false;
      p.chargeFull = false;
    }
  }

  keepInWorld(o, radius = PLAYER.radius) {
    const d = Math.hypot(o.x, o.z);
    if (d > PLAY_RADIUS) {
      o.x *= PLAY_RADIUS / d;
      o.z *= PLAY_RADIUS / d;
    }
    for (const ob of this.terrain.near(o.x, o.z, 2)) {
      if (o.y > ob.top - 0.3) continue;
      const ox = o.x - ob.x;
      const oz = o.z - ob.z;
      const od = Math.hypot(ox, oz);
      const min = ob.r + radius;
      if (od < min && od > 1e-6) {
        o.x = ob.x + (ox / od) * min;
        o.z = ob.z + (oz / od) * min;
        const into = o.vx * (ox / od) + o.vz * (oz / od);
        if (into < 0) {
          o.vx -= into * (ox / od);
          o.vz -= into * (oz / od);
        }
      }
    }
  }

  // ------------------------------------------------------------------ lock-on

  updateLock(input, edges) {
    const p = this.player;
    const camYaw = input.camYaw ?? 0;
    let target = this.enemy(p.lock);
    if (edges.lock) {
      if (p.lock) {
        p.lock = null;
        this.emit('unlock', {});
      } else {
        const t = pickTarget(this.enemies, p, camYaw);
        if (t) {
          p.lock = t.id;
          this.emit('lock', { id: t.id });
        } else this.emit('lock-none', {});
      }
      return;
    }
    if (!p.lock) return;
    if (!target || !target.alive || Math.hypot(target.x - p.x, target.z - p.z) > LOCK.keep) {
      // Carry the lock to the nearest virus on screen close by (never one behind the camera), otherwise let go.
      let near = null;
      let nd = LOCK.retarget;
      for (const e of this.enemies) {
        if (!e.alive || e.spawnT > 0 || !onScreen(p, e, camYaw)) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < nd) {
          nd = d;
          near = e;
        }
      }
      if (near) {
        p.lock = near.id;
        target = near;
        this.emit('lock', { id: near.id, auto: true });
      } else {
        p.lock = null;
        this.emit('unlock', { auto: true });
        return;
      }
    }
    if (edges.next || edges.prev) {
      const n = switchTarget(this.enemies, p, target, camYaw, edges.next ? 1 : -1);
      if (n && n !== target) {
        p.lock = n.id;
        this.emit('lock', { id: n.id, switched: true });
      }
    }
  }

  // ------------------------------------------------------------------ melee

  attack(input) {
    const p = this.player;
    if (p.action) {
      if (p.action.kind === 'melee') p.action.buffered = true;
      return;
    }
    if (p.dash > 0) {
      p.attackQueue = 0.2; // swing as soon as the dodge ends
      return;
    }
    if (!p.onGround) {
      if (p.airCombo >= this.kit.arm.air.length) return; // the air combo is spent until you land
      this.startStrike(p.airCombo, true, input);
    } else this.startStrike(p.comboT > 0 && p.comboNext < this.kit.arm.ground.length ? p.comboNext : 0, false, input);
    p.comboT = 0;
  }

  // The strike's target: the lock-on target, else the nearest virus roughly in front (camera or facing).
  meleeTarget(input) {
    const p = this.player;
    const locked = this.lockTarget();
    const magnet = this.kit.arm.magnet;
    if (locked && Math.hypot(locked.x - p.x, locked.z - p.z) <= magnet + 1) return locked;
    // Directions that count as "in front": the camera's, the facing, and where the stick is pushed.
    const cy = input.camYaw ?? p.yaw;
    const dirs = [cy, p.yaw];
    const mx = input.move?.x ?? 0;
    const my = input.move?.y ?? 0;
    if (Math.hypot(mx, my) > 0.3) dirs.push(Math.atan2(-Math.cos(cy) * mx + Math.sin(cy) * my, Math.sin(cy) * mx + Math.cos(cy) * my));
    let best = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > magnet) continue;
      const toward = Math.atan2(e.x - p.x, e.z - p.z);
      let a = Infinity;
      for (const dir of dirs) a = Math.min(a, Math.abs(wrap(toward - dir)));
      if (a > 1.0 && d > 2.5) continue;
      const score = d + a * 3;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  startStrike(step, air, input) {
    const p = this.player;
    const arm = this.kit.arm;
    const list = air ? arm.air : arm.ground;
    let s = list[step];
    const target = this.meleeTarget(input);
    if (s.finisher && !air && arm.launcher) {
      // The saber's finisher: the spin when crowded, the launcher one on one.
      const near = this.enemies.filter((e) => e.alive && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.z - p.z) < CROWD.radius).length;
      if (near < CROWD.count) s = arm.launcher;
    }
    const a = { kind: 'melee', step, air, def: s, t: 0, hitDone: false, hits: 0, buffered: false, target: target?.id ?? null, lunge: 0 };
    p.action = a;
    if (air) {
      p.airCombo = step + 1;
      p.vy = Math.max(p.vy, 2.5);
    }
    if (target) {
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      p.yaw = Math.atan2(dx, dz);
      const gap = d - (s.reach * 0.55 + target.def.radius);
      if (gap > 0.2) {
        // Close the gap first (KH2's magnetism); the swing's own timing starts when the lunge ends.
        // Longer-reaching arms (the Lance) get proportionally longer to close in.
        a.lunge = clamp(gap / MELEE.lungeSpeed, 0.06, MELEE.lungeMax * Math.max(1, arm.magnet / MELEE.magnet));
        a.t = -a.lunge;
      }
    } else if (input.move && Math.hypot(input.move.x ?? 0, input.move.y ?? 0) > 0.2) {
      const cy = input.camYaw ?? 0;
      p.yaw = Math.atan2(-Math.cos(cy) * input.move.x + Math.sin(cy) * input.move.y, Math.sin(cy) * input.move.x + Math.cos(cy) * input.move.y);
    }
    this.stats.strikes++;
    this.emit('swing', { name: s.name, step, air, finisher: !!s.finisher, x: p.x, y: p.y, z: p.z });
  }

  // Advance the current action; returns the gravity to use this frame.
  updateAction(input) {
    const p = this.player;
    const a = p.action;
    a.t += DT;
    if (a.kind === 'melee') {
      const s = a.def;
      if (a.lunge > 0) {
        const t = this.enemy(a.target);
        if (t?.alive) {
          const dx = t.x - p.x;
          const dz = t.z - p.z;
          const d = Math.hypot(dx, dz) || 1;
          const gap = d - (s.reach * 0.55 + t.def.radius);
          const left = Math.max(a.lunge, DT);
          const v = gap > 0.05 ? Math.min(MELEE.lungeTop, gap / left) : 0;
          p.vx = (dx / d) * v;
          p.vz = (dz / d) * v;
          if (a.air) p.vy = clamp((t.y + t.def.height * 0.5 - (p.y + 1)) / left, -12, 12);
        }
        a.lunge -= DT;
        if (a.lunge <= 0) {
          p.vx *= 0.15;
          p.vz *= 0.15;
          if (a.air) p.vy *= 0.2;
        }
      } else {
        p.vx = approach(p.vx, 0, 60 * DT);
        p.vz = approach(p.vz, 0, 60 * DT);
      }
      const target = this.enemy(a.target);
      if (!a.hitDone && target?.alive) p.yaw = Math.atan2(target.x - p.x, target.z - p.z);
      if (!a.hitDone && a.t >= s.hit) {
        a.hitDone = true;
        if (s.charge) {
          // A charging finisher (the Lance's pierce): dash ahead, hitting everything on the way once.
          a.charging = s.charge.time;
          a.hitIds = new Set();
          a.dir = p.yaw;
          this.emit('charge', { name: s.name, x: p.x, y: p.y, z: p.z, yaw: p.yaw });
        } else this.strikeHit(s);
      }
      if (a.charging > 0) this.chargeStep(a, s);
      const list = a.air ? this.kit.arm.air : this.kit.arm.ground;
      // On the ground, a strike that hit nothing ends the combo (KH2): the next press starts over.
      const next = a.air || a.hits ? a.step + 1 : 0;
      if (a.buffered && a.t >= s.cancel && a.step + 1 < list.length) {
        if (a.air && p.onGround) this.startStrike(0, false, input);
        else this.startStrike(next, a.air, input);
        return a.air ? PLAYER.gravity * 0.2 : PLAYER.gravity;
      }
      if (a.t >= s.dur) {
        p.action = null;
        if (!a.air && next < list.length && next > 0) {
          p.comboNext = next;
          p.comboT = COMBO_GRACE;
        }
      }
      if (a.air) {
        // Air strikes hang in the air; the air finisher drops you after the hit.
        if (s.finisher && a.hitDone) return PLAYER.gravity * 1.4;
        p.vy = Math.max(p.vy, -2.5);
        return PLAYER.gravity * 0.2;
      }
      return PLAYER.gravity;
    }
    if (a.kind === 'chip' && a.name === 'findash') {
      const moving = a.t < a.dur - 0.08;
      p.vx = moving ? a.dx * 32 : p.vx * 0.5;
      p.vz = moving ? a.dz * 32 : p.vz * 0.5;
      p.vy = Math.max(p.vy, 0);
      for (const e of this.enemies) {
        if (!e.alive || e.spawnT > 0 || a.hitIds.has(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y + e.def.height * 0.5 - (p.y + 1), e.z - p.z) < 1.9 + e.def.radius) {
          a.hitIds.add(e.id);
          this.hitEnemy(e, a.dmg, { kind: 'chip', dirX: a.dx, dirZ: a.dz, push: 7, element: a.element });
        }
      }
    } else {
      p.vx = approach(p.vx, 0, 60 * DT);
      p.vz = approach(p.vz, 0, 60 * DT);
    }
    if (a.t >= a.dur) {
      p.action = null;
      if (a.comboNext) {
        // A chip that cut into a combo keeps it going (BBS): the next press picks up where it left off.
        p.comboNext = a.comboNext;
        p.comboT = COMBO_GRACE;
      }
    }
    return a.kind === 'chip' && a.name === 'findash' ? 0 : PLAYER.gravity;
  }

  strikeHit(s) {
    const p = this.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > s.reach + e.def.radius) continue;
      if (Math.abs(e.y + e.def.height * 0.5 - (p.y + 1)) > MELEE.vertical + e.def.height * 0.5) continue;
      if (s.arc < Math.PI * 2 && d > 0.3 && Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) > s.arc / 2) continue;
      this.hitEnemy(e, s.dmg, { kind: s.finisher ? 'finisher' : 'melee', dirX: dx / (d || 1), dirZ: dz / (d || 1), push: s.push, launch: s.launch, slam: s.slam, heavy: s.heavy, fx: this.kit.armFx });
      hits++;
    }
    if (p.action?.kind === 'melee') p.action.hits = hits;
    this.emit('strike', { name: s.name, hits, finisher: !!s.finisher, air: !!s.air, x: p.x + fx * 1.4, y: p.y + 1.1, z: p.z + fz * 1.4 });
    if (hits) this.hitstop = Math.max(this.hitstop, s.finisher ? HITSTOP.finisher : this.kit.arm.stop);
    if (s.finisher) this.finisherMods(s, p.x + fx * 1.4, p.y + 1.1, p.z + fz * 1.4);
  }

  // A forged arm weapon's finisher extras: Burst explodes at the strike, Wave sends a shockwave ahead.
  finisherMods(s, x, y, z) {
    const fx = this.kit.armFx;
    if (!fx) return;
    if (fx.burst) this.burstAt(x, y, z, BURST.radius, Math.round(s.dmg * BURST.share), fx);
    if (fx.wave) {
      const p = this.player;
      const dx = Math.sin(p.yaw);
      const dz = Math.cos(p.yaw);
      const wx = p.x + dx * 1.2;
      const wz = p.z + dz * 1.2;
      this.addShot({
        team: 'player', kind: 'swordwave', x: wx, y: this.surfaceY(wx, wz) + 0.55, z: wz, vx: dx * WAVE.speed, vz: dz * WAVE.speed,
        r: 1.0, dmg: Math.round(s.dmg * WAVE.share), life: WAVE.life, ground: true, pierce: true, hitIds: new Set(), fx: { element: fx.element },
      });
      this.emit('wave-cast', { x: wx, y: p.y, z: wz, dx, dz, element: fx.element });
    }
  }

  // An explosion (Burst mod): every virus within `radius` of the point takes `dmg` once.
  burstAt(x, y, z, radius, dmg, fx) {
    for (const e of [...this.enemies]) {
      if (!e.alive || e.spawnT > 0) continue;
      if (Math.hypot(e.x - x, e.y + e.def.height * 0.5 - y, e.z - z) > radius + e.def.radius) continue;
      const d = Math.hypot(e.x - x, e.z - z) || 1;
      this.hitEnemy(e, dmg, { kind: 'burst', fx: { element: fx?.element ?? null }, dirX: (e.x - x) / d, dirZ: (e.z - z) / d, push: 5 });
    }
    this.emit('burst', { x, y, z, radius, element: fx?.element ?? null });
  }

  // Ground height, or the water's surface over the lake.
  surfaceY(x, z) {
    return Math.max(this.terrain.height(x, z), WATER_LEVEL);
  }

  // One step of a charging finisher.
  chargeStep(a, s) {
    const p = this.player;
    const dx = Math.sin(a.dir);
    const dz = Math.cos(a.dir);
    p.vx = dx * s.charge.speed;
    p.vz = dz * s.charge.speed;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0 || a.hitIds.has(e.id)) continue;
      if (Math.hypot(e.x - p.x, e.z - p.z) > 1.6 + e.def.radius) continue;
      if (Math.abs(e.y + e.def.height * 0.5 - (p.y + 1)) > MELEE.vertical + e.def.height * 0.5) continue;
      a.hitIds.add(e.id);
      this.hitEnemy(e, s.dmg, { kind: 'finisher', dirX: dx, dirZ: dz, push: s.push, heavy: s.heavy, fx: this.kit.armFx });
      this.hitstop = Math.max(this.hitstop, HITSTOP.finisher);
    }
    a.hits = a.hitIds.size;
    a.charging -= DT;
    if (a.charging <= 0) {
      p.vx *= 0.2;
      p.vz *= 0.2;
      this.emit('strike', { name: s.name, hits: a.hits, finisher: true, air: false, x: p.x + dx * 1.4, y: p.y + 1.1, z: p.z + dz * 1.4 });
      this.finisherMods(s, p.x + dx * 1.4, p.y + 1.1, p.z + dz * 1.4);
    }
  }

  // ------------------------------------------------------------------ reaction commands

  updateReaction(edges) {
    const p = this.player;
    p.reaction = null;
    if (!p.alive || p.flinch > 0 || (p.action && p.action.kind !== 'melee')) return;
    let best = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      let kind = null;
      if (e.type === 'rivet' && e.state === 'windup' && d < 7) kind = 'break';
      else if (e.type === 'dartfin' && Math.hypot(e.x - p.x, e.y - (p.y + 1), e.z - p.z) < 13) {
        const incoming = (p.x - e.x) * e.vx + (p.z - e.z) * e.vz > 0;
        if ((e.state === 'windup' && e.t < 0.4) || (e.state === 'dive' && incoming)) kind = 'reversal';
      }
      if (!kind) continue;
      const score = d - (e.id === p.lock ? 5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { kind, id: e.id };
      }
    }
    if (!best) {
      for (const s of this.shots) {
        if (s.team !== 'enemy') continue;
        const dx = p.x - s.x;
        const dy = p.y + 0.9 - s.y;
        const dz = p.z - s.z;
        if (Math.hypot(dx, dy, dz) < 8 && dx * s.vx + dy * s.vy + dz * s.vz > 0) {
          best = { kind: 'deflect', id: s.id };
          break;
        }
      }
    }
    p.reaction = best ? { ...best, label: REACTIONS[best.kind].label } : null;
    if (best && edges.react) this.react(best);
  }

  react({ kind, id }) {
    const p = this.player;
    p.action = { kind: 'react', name: kind, t: 0, dur: 0.42 };
    p.dash = 0;
    p.iframes = Math.max(p.iframes, 0.6);
    p.charge = 0;
    p.charging = false;
    p.chargeFull = false;
    this.stats.reactions++;
    if (kind === 'deflect') {
      const s = this.shots.find((x) => x.id === id);
      if (!s) return;
      const target = this.lockTarget() ?? this.enemy(s.ownerId) ?? this.enemies.find((e) => e.alive);
      p.yaw = Math.atan2(s.x - p.x, s.z - p.z);
      s.team = 'player';
      s.kind = 'deflect';
      s.dmg = Math.round(s.dmg * REACTIONS.deflect.mult * this.kit.react);
      s.life = 2.2;
      s.splash = 2.4;
      s.splashDmg = Math.round(s.dmg * 0.4);
      if (target) {
        const tx = target.x - s.x;
        const ty = target.y + target.def.height * 0.5 - s.y;
        const tz = target.z - s.z;
        const l = Math.hypot(tx, ty, tz) || 1;
        s.vx = (tx / l) * 42;
        s.vy = (ty / l) * 42;
        s.vz = (tz / l) * 42;
      } else {
        s.vx *= -1.4;
        s.vy *= -1.4;
        s.vz *= -1.4;
      }
      p.action.dur = 0.3;
      this.hitstop = HITSTOP.reaction;
      this.emit('reaction', { kind, label: REACTIONS.deflect.label, x: s.x, y: s.y, z: s.z });
      return;
    }
    const e = this.enemy(id);
    if (!e) return;
    const r = REACTIONS[kind];
    if (kind === 'break') {
      // Dash in and smash it before the slam lands.
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      p.x = e.x - (dx / d) * (e.def.radius + 1.1);
      p.z = e.z - (dz / d) * (e.def.radius + 1.1);
      p.yaw = Math.atan2(dx, dz);
    } else {
      // Warp up behind the diver and strike its back.
      const l = Math.hypot(e.vx, e.vz);
      const bx = l > 0.5 ? e.vx / l : Math.sin(e.yaw);
      const bz = l > 0.5 ? e.vz / l : Math.cos(e.yaw);
      p.x = e.x - bx * 2.4;
      p.z = e.z - bz * 2.4;
      p.y = e.y - 1;
      p.vy = 3;
      p.yaw = Math.atan2(bx, bz);
    }
    this.keepInWorld(p);
    const g = this.terrain.ground(p.x, p.z);
    p.y = Math.max(p.y, g);
    p.onGround = p.y - g < 0.05;
    p.vx = 0;
    p.vz = 0;
    e.state = 'recover';
    e.t = r.stun;
    e.vx = 0;
    e.vz = 0;
    if (e.def.hover) e.vy = -8;
    const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
    this.hitEnemy(e, Math.round(r.dmg * this.kit.react), { kind: 'react', stun: r.stun, dirX: (e.x - p.x) / d, dirZ: (e.z - p.z) / d, push: 4 });
    this.hitstop = HITSTOP.reaction;
    this.emit('reaction', { kind, label: r.label, x: e.x, y: e.y + e.def.height * 0.5, z: e.z });
  }

  // ------------------------------------------------------------------ chips

  learnFrom(e) {
    const key = CHIP_OF[e.type];
    if (!key) return;
    const c = (this.chips[key] ??= { deletes: 0, level: 0 });
    c.deletes++;
    // Enough deletes of this family teach a forge mod (it still costs DATA to unlock).
    for (const m of MOD_KEYS) {
      if (MODS[m].learn?.from === e.type && MODS[m].learn.deletes === c.deletes && !this.programs.has(m)) this.emit('mod-ready', { mod: m });
    }
    const level = chipLevel(c.deletes);
    if (level > c.level) {
      c.level = level;
      if (!this.deck.includes(key) && this.deck.length < DECK_SIZE) this.deck.push(key);
      this.emit('chip-learn', { chip: key, level, name: CHIPS[key].name });
    }
  }

  useChip(slot, input) {
    const p = this.player;
    const key = this.deck[slot - 1];
    const c = key && this.chips[key];
    if (!c || c.level < 1) return;
    if (!p.alive || p.flinch > 0 || p.dash > 0 || (this.chipCd[key] ?? 0) > 0) {
      this.emit('chip-denied', { chip: key });
      return;
    }
    const cut = p.action;
    if (cut && !(cut.kind === 'melee' && cut.hitDone)) return;
    const def = CHIPS[key];
    // Cutting in after the third strike (or the second in the air) landed: a chip finisher. Earlier in the
    // combo, the combo carries on after the chip.
    const arm = this.kit.arm;
    const finish = !!cut && cut.hits > 0 && cut.step === (cut.air ? arm.air.length : arm.ground.length) - 2;
    const comboNext = cut && !cut.air && !finish && cut.hits > 0 && cut.step + 1 < arm.ground.length ? cut.step + 1 : 0;
    const dmg = Math.round(def.dmg[c.level] * (finish ? CHIP_FINISH : 1) * this.kit.chipDmg);
    if (finish) this.stats.chipFinishes++;
    const target = this.lockTarget() ?? this.meleeTarget(input) ?? null;
    this.chipCd[key] = def.cooldown * this.kit.chipCd;
    this.stats.chipsUsed++;
    if (key === 'shockwave') {
      p.action = { kind: 'chip', name: key, t: 0, dur: 0.5, comboNext };
      this.hazards.push({ kind: 'ring', team: 'player', x: p.x, y: p.y, z: p.z, r: 0.8, speed: 14, max: 9 + 2 * c.level, thick: 1.4, dmg, hitIds: new Set(), element: def.element });
    } else if (key === 'cannon') {
      p.action = { kind: 'chip', name: key, t: 0, dur: 0.35, comboNext };
      const yaw = target ? Math.atan2(target.x - p.x, target.z - p.z) : input.aimYaw ?? p.yaw;
      p.yaw = yaw;
      const m = this.muzzle(p, yaw);
      let dir;
      if (target) {
        const tx = target.x - m.x;
        const ty = target.y + target.def.height * 0.5 - m.y;
        const tz = target.z - m.z;
        const l = Math.hypot(tx, ty, tz) || 1;
        dir = { x: tx / l, y: ty / l, z: tz / l };
      } else dir = this.aimDir(m, input, yaw);
      this.addShot({ team: 'player', kind: 'cannon', ...m, vx: dir.x * 36, vy: dir.y * 36, vz: dir.z * 36, r: 0.55, dmg, splash: 3, splashDmg: Math.round(dmg * 0.5), life: 2, element: def.element });
    } else if (key === 'findash') {
      let dx = Math.sin(p.yaw);
      let dz = Math.cos(p.yaw);
      if (target) {
        const l = Math.hypot(target.x - p.x, target.z - p.z) || 1;
        dx = (target.x - p.x) / l;
        dz = (target.z - p.z) / l;
      }
      p.yaw = Math.atan2(dx, dz);
      p.action = { kind: 'chip', name: key, t: 0, dur: 0.4, dx, dz, dmg, hitIds: new Set(), comboNext, element: def.element };
      p.iframes = Math.max(p.iframes, 0.5);
    }
    this.emit('chip-use', { chip: key, level: c.level, name: def.name, finish, ...at(p) });
  }

  // ------------------------------------------------------------------ shooting

  muzzle(p, yaw) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // The gun part is on the left arm (the arm part on the right): the character's left is (cos yaw, -sin yaw).
    return {
      x: p.x + Math.cos(yaw) * MUZZLE.side + fx * MUZZLE.forward,
      y: p.y + MUZZLE.up,
      z: p.z - Math.sin(yaw) * MUZZLE.side + fz * MUZZLE.forward,
    };
  }

  aimDir(m, input, yaw) {
    if (input.aimPoint) {
      const ax = input.aimPoint.x - m.x;
      const ay = input.aimPoint.y - m.y;
      const az = input.aimPoint.z - m.z;
      const l = Math.hypot(ax, ay, az) || 1;
      return { x: ax / l, y: ay / l, z: az / l };
    }
    const pitch = input.aimPitch ?? 0;
    return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  }

  fire(p, input, level) {
    const locked = this.lockTarget();
    const yaw = locked ? Math.atan2(locked.x - p.x, locked.z - p.z) : input.aimYaw ?? input.camYaw ?? p.yaw;
    const m = this.muzzle(p, yaw);
    let dir;
    if (locked) {
      const tx = locked.x - m.x;
      const ty = locked.y + locked.def.height * 0.5 - m.y;
      const tz = locked.z - m.z;
      const l = Math.hypot(tx, ty, tz) || 1;
      dir = { x: tx / l, y: ty / l, z: tz / l };
    } else {
      dir = this.aimDir(m, input, yaw);
      const target = this.assistTarget(m, dir, level === 2 ? 0.16 : 0.11, 75);
      if (target) {
        const l = Math.hypot(target.x - m.x, target.y - m.y, target.z - m.z) || 1;
        dir = { x: (target.x - m.x) / l, y: (target.y - m.y) / l, z: (target.z - m.z) / l };
      }
    }
    const gun = this.kit.loadout.gun;
    if (gun === 'spreader') this.fireSpread(m, dir, level);
    else if (gun === 'railgun') this.fireRail(m, dir, level);
    else if (gun === 'bomber') this.fireBombs(m, dir, level, locked, input);
    else {
      const kind = ['buster', 'mid', 'charge'][level];
      const [shot] = this.gunShot({
        team: 'player', kind, ...m, speed: level ? CHARGE.speed : BUSTER.speed,
        r: level ? CHARGE.radius[level] : BUSTER.radius, dmg: level ? CHARGE.dmg[level] : BUSTER.dmg,
        splash: CHARGE.splash[level], splashDmg: CHARGE.splashDmg[level], life: level ? 1.8 : BUSTER.life,
      }, dir, locked);
      this.emit('shot', { id: shot.id, kind, gun, level, ...m, dx: dir.x, dy: dir.y, dz: dir.z });
    }
    p.fireCd = this.kit.gun.cooldown;
    p.aimHold = 0.6;
    this.stats.shots++;
  }

  // One projectile from the gun (plus side shots for the Split mod), carrying a forged gun's effects: Heavy
  // damage, Pierce, Homing, Burst and its element. `spec` is a shot with a `speed`; returns the shots.
  gunShot(spec, dir, locked = null, { split = true } = {}) {
    const fx = this.kit.gunFx ?? null;
    const { speed, ...rest } = spec;
    const dirs = fx?.split && split ? [dir, turnDir(dir, 0.14), turnDir(dir, -0.14)] : [dir];
    const homing = fx?.homing ? (locked ?? this.homingTarget(rest, dir)) : null;
    return dirs.map((d, i) => {
      const shot = this.addShot({ ...rest, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed, dmg: Math.max(1, Math.round(rest.dmg * (fx?.heavy ? 1.3 : 1) * (i ? 0.6 : 1))), fx });
      if (fx?.pierce) {
        shot.pierce = true;
        shot.hitIds = new Set();
      }
      if (homing && i === 0) shot.homing = homing.id; // Split's side shots fly straight
      if (fx?.burst) {
        if (shot.splash > 0) shot.splash *= 1.35;
        else {
          shot.splash = BURST.shotRadius;
          shot.splashDmg = Math.max(1, Math.round(shot.dmg * BURST.share));
        }
      }
      return shot;
    });
  }

  // The virus a homing shot chases when nothing is locked: the one nearest the aim line, within reason.
  homingTarget(m, dir) {
    let best = null;
    let bestA = HOMING.cone;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const vx = e.x - m.x;
      const vy = e.y + e.def.height * 0.5 - m.y;
      const vz = e.z - m.z;
      const d = Math.hypot(vx, vy, vz);
      if (d > HOMING.range || d < 1e-3) continue;
      const a = Math.acos(clamp((vx * dir.x + vy * dir.y + vz * dir.z) / d, -1, 1));
      if (a < bestA) {
        bestA = a;
        best = e;
      }
    }
    return best;
  }

  // Spreader: a fan of short-lived pellets around the aim direction (Split adds pellets and widens it).
  fireSpread(m, dir, level) {
    const g = this.kit.gun;
    const wide = this.kit.gunFx?.split ? 1.25 : 1;
    const n = g.pellets[level] + (this.kit.gunFx?.split ? 4 : 0);
    const kind = level === 2 ? 'blast' : 'pellet';
    const flat = Math.hypot(dir.x, dir.z) || 1;
    // Sideways (horizontal) axis for the fan.
    const sx = dir.z / flat;
    const sz = -dir.x / flat;
    for (let i = 0; i < n; i++) {
      const k = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      const off = Math.tan(g.cone[level] * wide * k);
      const lift = (i % 2 ? 1 : -1) * 0.03 * (level + 1);
      let vx = dir.x + sx * off;
      let vy = dir.y + lift;
      let vz = dir.z + sz * off;
      const l = Math.hypot(vx, vy, vz) || 1;
      vx /= l;
      vy /= l;
      vz /= l;
      this.gunShot({ team: 'player', kind, ...m, speed: g.speed, r: g.radius, dmg: g.dmg[level], life: g.life }, { x: vx, y: vy, z: vz }, null, { split: false });
    }
    this.emit('shot', { kind, gun: 'spreader', level, count: n, ...m, dx: dir.x, dy: dir.y, dz: dir.z });
  }

  // Railgun: a needle on a tap; a charged release is an instant beam through every virus in line, stopped
  // only by the ground and trees or rocks.
  fireRail(m, dir, level) {
    const g = this.kit.gun;
    if (!level) {
      const n = g.needle;
      const [shot] = this.gunShot({ team: 'player', kind: 'needle', ...m, speed: n.speed, r: n.radius, dmg: n.dmg, life: n.life }, dir);
      this.emit('shot', { id: shot.id, kind: 'needle', gun: 'railgun', level, ...m, dx: dir.x, dy: dir.y, dz: dir.z });
      return;
    }
    // Split fans out two more beams at 60%.
    const fx = this.kit.gunFx ?? null;
    const beams = fx?.split ? [[dir, 1], [turnDir(dir, 0.12), 0.6], [turnDir(dir, -0.12), 0.6]] : [[dir, 1]];
    for (const [d, share] of beams) this.beam(m, d, Math.round(g.beam[level] * share * (fx?.heavy ? 1.3 : 1)), level, fx);
  }

  // One railgun beam from `m` along `dir`.
  beam(m, dir, dmg, level, fx) {
    const g = this.kit.gun;
    const T = this.terrain;
    let len = g.range;
    for (let t = 1; t < g.range; t += 0.5) {
      const x = m.x + dir.x * t;
      const y = m.y + dir.y * t;
      const z = m.z + dir.z * t;
      if (y < T.height(x, z) || T.near(x, z, 1).some((o) => y < o.top && Math.hypot(x - o.x, z - o.z) < o.r)) {
        len = t;
        break;
      }
    }
    const hit = [];
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const cx = e.x - m.x;
      const cy = e.y + e.def.height * 0.5 - m.y;
      const cz = e.z - m.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > len + e.def.radius) continue;
      const r = e.def.radius + g.width;
      if (cx * cx + cy * cy + cz * cz - t * t <= r * r) hit.push(e);
    }
    for (const e of hit) this.hitEnemy(e, dmg, { kind: 'rail', vx: dir.x, vz: dir.z, fx });
    this.emit('beam', { level, hits: hit.length, element: fx?.element ?? null, x0: m.x, y0: m.y, z0: m.z, x1: m.x + dir.x * len, y1: m.y + dir.y * len, z1: m.z + dir.z * len });
    if (fx?.burst) this.burstAt(m.x + dir.x * len, m.y + dir.y * len, m.z + dir.z * len, 2.5, Math.round(dmg * BURST.share), fx);
  }

  // Bomber: bombs lobbed on an arc onto the target (the lock-on target, else the crosshair's point, at most
  // `range` metres out). A full charge throws three, fanned around the target.
  fireBombs(m, dir, level, locked, input) {
    const g = this.kit.gun;
    let tx;
    let ty;
    let tz;
    if (locked) {
      tx = locked.x;
      ty = locked.y;
      tz = locked.z;
    } else {
      const ap = input.aimPoint;
      const flat = Math.hypot(dir.x, dir.z) || 1;
      const reach = ap ? Math.min(g.range, Math.hypot(ap.x - m.x, ap.z - m.z)) : g.range;
      tx = m.x + (dir.x / flat) * reach;
      tz = m.z + (dir.z / flat) * reach;
      ty = this.terrain.ground(tx, tz);
    }
    const n = g.count[level] + (this.kit.gunFx?.split ? 2 : 0);
    const side = { x: tz - m.z, z: -(tx - m.x) };
    const sl = Math.hypot(side.x, side.z) || 1;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i - (n - 1) / 2) * 2.4 : 0;
      const bx = tx + (side.x / sl) * off;
      const bz = tz + (side.z / sl) * off;
      const dx = bx - m.x;
      const dz = bz - m.z;
      const flight = clamp(Math.hypot(dx, dz) / 16, 0.45, 1.1);
      const vy = (ty - m.y + 0.5 * g.gravity * flight * flight) / flight;
      const speed = Math.hypot(dx / flight, vy, dz / flight);
      const [shot] = this.gunShot({
        team: 'player', kind: 'bomb', ...m, speed, gravity: g.gravity,
        r: g.radius[level], dmg: g.dmg[level], splash: g.splash[level], splashDmg: g.splashDmg[level], life: 3,
      }, { x: dx / flight / speed, y: vy / speed, z: dz / flight / speed }, locked, { split: false });
      if (i === 0) this.emit('shot', { id: shot.id, kind: 'bomb', gun: 'bomber', level, count: n, ...m, dx: dir.x, dy: dir.y, dz: dir.z });
    }
  }

  // Soft aim assist: the enemy closest to the aim line within `cone` radians and `range` metres.
  assistTarget(m, dir, cone, range) {
    let best = null;
    let bestAngle = cone;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const c = { x: e.x, y: e.y + e.def.height * 0.5, z: e.z };
      const vx = c.x - m.x;
      const vy = c.y - m.y;
      const vz = c.z - m.z;
      const d = Math.hypot(vx, vy, vz);
      if (d > range || d < 1e-3) continue;
      const angle = Math.acos(clamp((vx * dir.x + vy * dir.y + vz * dir.z) / d, -1, 1));
      if (angle < bestAngle) {
        bestAngle = angle;
        best = c;
      }
    }
    return best;
  }

  hurtPlayer(dmg, fromX, fromZ) {
    const p = this.player;
    if (!p.alive) return false;
    if (p.iframes > 0) {
      if (p.dash > 0) this.emit('evade', at(p));
      return false;
    }
    p.hp = Math.max(0, p.hp - dmg);
    this.stats.damageTaken += dmg;
    const steady = dmg <= (this.kit.legs.steady ?? 0) && p.hp > 0;
    if (steady) {
      // Treads: a light hit doesn't stagger you or break your combo.
      p.iframes = 0.5;
    } else {
      p.iframes = PLAYER.iframes;
      p.flinch = PLAYER.flinch;
      p.dash = 0;
      p.action = null;
      p.comboT = 0;
      const w = this.kit.weight;
      const dx = p.x - fromX;
      const dz = p.z - fromZ;
      const l = Math.hypot(dx, dz) || 1;
      p.vx = ((dx / l) * 7) / w;
      p.vz = ((dz / l) * 7) / w;
      p.vy = 4 / w;
      p.onGround = false;
    }
    this.emit('hurt', { amount: dmg, steady, x: p.x, y: p.y + 1.2, z: p.z });
    if (p.hp <= 0) {
      p.alive = false;
      p.respawn = 3;
      p.charge = 0;
      p.charging = false;
      p.lock = null;
      this.emit('down', at(p));
    }
    return true;
  }

  // ------------------------------------------------------------------ zones and enemies

  updateZones() {
    const p = this.player;
    for (const zn of this.zones) {
      const d = Math.hypot(p.x - zn.x, p.z - zn.z);
      if (zn.state === 'dormant') {
        if (p.alive && d < 60) {
          zn.state = 'active';
          zn.members = zn.roster.map((type, i) => this.spawnEnemy(type, zn, i));
          this.emit('zone-wake', { id: zn.id, x: zn.x, z: zn.z });
        }
      } else if (zn.state === 'active') {
        if (zn.members.every((e) => !e.alive)) {
          zn.state = 'cleared';
          zn.clears++;
          const y = this.terrain.ground(zn.x, zn.z);
          for (let i = 0; i < 6; i++) this.dropData(zn.x, y + 1.5, zn.z, 1);
          this.emit('zone-clear', { id: zn.id, x: zn.x, y, z: zn.z });
          this.findPart(zn.x, y + 2, zn.z);
        }
      }
    }
    if (this.zones.length && this.zones.every((z) => z.state === 'cleared')) {
      this.wave++;
      for (const z of this.zones) z.state = 'dormant';
      this.emit('wave', { wave: this.wave });
    }
  }

  spawnEnemy(type, zone, i) {
    const def = ENEMY_TYPES[type];
    const a = (i / zone.roster.length) * Math.PI * 2 + this.rng.next();
    const r = 4 + this.rng.next() * 6;
    const x = zone.x + Math.cos(a) * r;
    const z = zone.z + Math.sin(a) * r;
    // Each wave adds 40% HP and 25% damage.
    const hp = Math.round(def.hp * (1 + 0.4 * (this.wave - 1)));
    const e = {
      id: this.nextId++, type, def, x, y: this.terrain.ground(x, z) + (def.hover ?? 0), z, power: 1 + 0.25 * (this.wave - 1),
      vx: 0, vy: 0, vz: 0, yaw: this.rng.next() * Math.PI * 2, hp, maxHp: hp,
      alive: true, dying: 0, state: 'idle', t: 0, cd: 0, flinch: 0, spawnT: 0.9, air: false, armor: 0, comboHits: 0, lastHitT: -9,
      zone: zone.id, home: { x: zone.x, z: zone.z }, orbit: this.rng.chance(0.5) ? 1 : -1,
    };
    this.enemies.push(e);
    this.emit('spawn', { id: e.id, enemy: type, x, y: e.y, z });
    return e;
  }

  updateEnemy(e) {
    if (!e.alive) return;
    const T = this.terrain;
    if (e.spawnT > 0) {
      e.spawnT -= DT;
      return;
    }
    e.armor = Math.max(0, e.armor - DT);
    const p = this.player;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    if (e.dummy) {
      // Training dummies pack up after a while, or when you walk away.
      e.dummyT -= DT;
      if (e.dummyT <= 0 || dist > DUMMY.leash) {
        e.alive = false;
        e.dying = 0.3;
        return;
      }
    }
    // Status effects. Burn counts whole ticks (with a little slack for float sums), so a burn always deals
    // the same damage.
    if (e.burn > 0) {
      e.burnTick -= DT;
      if (e.burnTick <= 1e-9) {
        e.burnTick += STATUS.burn.every;
        e.burn--;
        this.burnTick(e);
        if (!e.alive) return;
      }
    }
    const soaked = e.soak > 0;
    if (soaked) e.soak -= DT;
    if (e.shockImmune > 0) e.shockImmune -= DT;
    if (e.flinch > 0) {
      e.flinch -= DT;
      e.vx *= 0.88;
      e.vz *= 0.88;
    } else {
      // Soaked viruses think and attack slower.
      AI[e.type](this, e, soaked ? DT * STATUS.soak.clock : DT, { dx, dz, dist, sees: p.alive && dist < e.def.aggro });
    }
    // Leash: a virus never strays far from its rift.
    const hx = e.home.x - e.x;
    const hz = e.home.z - e.z;
    const hd = Math.hypot(hx, hz);
    if (hd > 45 && e.state !== 'dive' && e.flinch <= 0) {
      e.vx = (hx / hd) * e.def.speed;
      e.vz = (hz / hd) * e.def.speed;
      e.yaw = Math.atan2(hx, hz);
    }
    const speed = soaked ? STATUS.soak.speed : 1;
    e.x += e.vx * DT * speed;
    e.z += e.vz * DT * speed;
    this.keepInWorld(e, e.def.radius);
    const g = T.ground(e.x, e.z);
    if (e.def.hover) {
      e.y += (e.vy ?? 0) * DT * speed;
      if (e.flinch > 0) e.vy *= 0.95;
      e.y = Math.max(e.y, g + 0.6);
    } else if (e.air) {
      // Launched by a finisher: fly, fall, land.
      e.vy -= 30 * DT;
      e.y += e.vy * DT;
      if (e.y <= g) {
        e.y = g;
        e.vy = 0;
        e.air = false;
      }
    } else e.y = g;
  }

  separateEnemies() {
    const list = this.enemies.filter((e) => e.alive);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = a.def.radius + b.def.radius;
        if (d < min && d > 1e-6) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
  }

  // src: a shot (kind, vx, vz) or a strike ({ kind, dirX, dirZ, push, launch, slam, stun }).
  hitEnemy(e, dmg, src) {
    if (!e.alive) return;
    const fx = src.fx ?? null;
    const element = fx?.element ?? src.element ?? null;
    // Bonuses add up rather than multiply (as Battle Network 4-6 changed it): a weakness is +100%, a critical
    // +100%, a counter +100% (+200% with the Overclock core). So a weak critical counter is ×4, not ×8.
    let bonus = 0;
    // Elements (Battle Network): the element that beats the virus's own deals double damage.
    const weak = !!element && ELEMENTS[element].beats === e.def.element;
    if (weak) bonus += 1;
    // Critical mod: every fourth hit from a forged weapon with it deals double.
    let crit = false;
    if (fx?.crit && ++this.critCount % 4 === 0) {
      bonus += 1;
      crit = true;
    }
    const counter = e.state === 'windup';
    if (counter) bonus += this.kit.counter - 1;
    const amount = dmg * (1 + bonus);
    if (counter) {
      e.state = 'recover';
      e.t = 0.9;
      this.stats.counters++;
      this.hitstop = Math.max(this.hitstop, HITSTOP.counter);
    }
    e.hp -= amount;
    // Revenge value: a virus that keeps getting hit shrugs off flinching for a moment. Heavy hits (the
    // Breaker) build it slowly and shatter the armor instead.
    const weight = src.heavy ? REVENGE.heavy : REVENGE[src.kind] ?? 1;
    e.comboHits = (this.t - e.lastHitT < 1.2 ? e.comboHits : 0) + weight;
    e.lastHitT = this.t;
    if (src.heavy && e.armor > 0) {
      e.armor = 0;
      e.comboHits = 0;
      this.emit('armor-break', { id: e.id, x: e.x, y: e.y + e.def.height, z: e.z });
    } else if (e.comboHits >= MELEE.armorAfter && e.armor <= 0) {
      e.armor = MELEE.armorTime;
      e.comboHits = 0;
      this.emit('armor', { id: e.id, x: e.x, y: e.y + e.def.height, z: e.z });
    }
    const armored = e.armor > 0 && src.kind !== 'react';
    const kind = src.kind;
    let flinch = { charge: 0.5, cannon: 0.6, deflect: 0.8, finisher: 0.7, melee: src.heavy ? 0.5 : 0.3, chip: 0.5, rail: 0.5, bomb: 0.45, blast: 0.35, react: src.stun ?? 1.4 }[kind] ?? 0.1;
    if (counter) flinch = Math.max(flinch, 0.6);
    if (!armored) e.flinch = Math.max(e.flinch, flinch);
    if (!armored && src.push) {
      e.vx = (src.dirX ?? 0) * src.push;
      e.vz = (src.dirZ ?? 0) * src.push;
    }
    if (!armored && HEAVY.has(kind)) {
      const l = Math.hypot(src.vx ?? 0, src.vz ?? 0) || 1;
      e.vx = ((src.vx ?? 0) / l) * 6;
      e.vz = ((src.vz ?? 0) / l) * 6;
    }
    if (!armored && src.launch && !e.def.hover) {
      e.air = true;
      e.vy = src.launch;
    }
    if (src.slam) e.vy = -src.slam;
    // A forged weapon's element also leaves a status effect.
    if (fx && element) this.applyStatus(e, element, amount);
    this.stats.hits++;
    this.emit('enemy-hit', { id: e.id, x: e.x, y: e.y + e.def.height * 0.6, z: e.z, amount: Math.round(amount), counter, kind, armored, element, weak, crit });
    // Chain mod: the hit arcs to the nearest other virus close by (arcs and splash hits don't chain again).
    if (fx?.chain && !src.arc && !src.splashHit) {
      let other = null;
      let best = CHAIN.range;
      for (const o of this.enemies) {
        if (o === e || !o.alive || o.spawnT > 0) continue;
        const d = Math.hypot(o.x - e.x, o.y - e.y, o.z - e.z);
        if (d < best) {
          best = d;
          other = o;
        }
      }
      if (other) {
        this.emit('arc', { from: e.id, to: other.id, element, x0: e.x, y0: e.y + e.def.height * 0.5, z0: e.z, x1: other.x, y1: other.y + other.def.height * 0.5, z1: other.z });
        const d = best || 1;
        this.hitEnemy(other, Math.max(1, Math.round(dmg * CHAIN.share)), { kind: 'arc', arc: true, fx: { element }, dirX: (other.x - e.x) / d, dirZ: (other.z - e.z) / d, push: 1.5 });
      }
    }
    if (e.dummy) {
      if (e.hp < 1) e.hp = e.maxHp; // training dummies never break
    } else if (e.hp <= 0) this.killEnemy(e);
  }

  // Status effects (forged elements): Fire burns, Aqua soaks, Elec builds to a stun, Wood heals the player.
  applyStatus(e, element, amount) {
    if (element === 'fire') {
      if (!(e.burn > 0)) e.burnTick = STATUS.burn.every;
      e.burn = STATUS.burn.ticks;
    } else if (element === 'aqua') e.soak = STATUS.soak.time;
    else if (element === 'elec') {
      // Shock pips build to a stun; then the virus resists for a while and needs more hits next time.
      if (e.shockImmune > 0) return;
      const { hits, stun, immune } = STATUS.shock;
      e.shock = (e.shock ?? 0) + 1;
      if (e.shock >= hits[Math.min(e.shockLevel ?? 0, hits.length - 1)]) {
        e.shock = 0;
        e.shockLevel = (e.shockLevel ?? 0) + 1;
        e.shockImmune = stun + immune;
        e.flinch = Math.max(e.flinch, stun); // a stun gets through revenge armor
        if (e.state === 'windup') {
          e.state = 'recover';
          e.t = 0.8;
        }
        this.emit('stun', { id: e.id, x: e.x, y: e.y + e.def.height, z: e.z });
      }
    } else if (element === 'wood') {
      const p = this.player;
      if (!p.alive || p.hp >= p.maxHp) return;
      this.leech += amount * STATUS.leech;
      const heal = Math.min(Math.floor(this.leech), p.maxHp - p.hp);
      if (heal <= 0) return;
      this.leech -= heal;
      p.hp += heal;
      this.emit('leech', { amount: heal, x: p.x, y: p.y + 1.6, z: p.z });
    }
  }

  // One tick of burning.
  burnTick(e) {
    e.hp -= STATUS.burn.dmg;
    this.emit('enemy-hit', { id: e.id, x: e.x, y: e.y + e.def.height * 0.6, z: e.z, amount: STATUS.burn.dmg, counter: false, kind: 'burn', armored: false, element: 'fire', weak: false, crit: false });
    if (e.dummy) {
      if (e.hp < 1) e.hp = e.maxHp;
    } else if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    if (e.dummy) return;
    e.alive = false;
    e.hp = 0;
    e.dying = 0.6;
    this.stats.kills++;
    this.emit('delete', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.def.height * 0.5, z: e.z });
    for (let i = 0; i < e.def.data; i++) this.dropData(e.x, e.y + 1, e.z, 1);
    this.learnFrom(e);
  }

  dropData(x, y, z, value) {
    this.pickups.push({
      id: this.nextId++, x, y, z, value, t: 0,
      vx: (this.rng.next() - 0.5) * 4, vy: 6 + this.rng.next() * 3, vz: (this.rng.next() - 0.5) * 4,
    });
  }

  // ------------------------------------------------------------------ parts and the garage

  // A part turns up in a sealed rift (Medabots-style spoils): one you don't have yet, else some DATA.
  findPart(x, y, z) {
    const missing = Object.keys(PARTS).filter((k) => !this.owned.has(k));
    if (!missing.length) {
      this.wallet += 20;
      this.emit('part-found', { part: null, data: 20, x, y, z });
      return;
    }
    const part = missing[this.rng.int(missing.length)];
    this.owned.add(part);
    this.emit('part-found', { part, x, y, z });
  }

  // The garage only opens out of combat: alive, with no virus within GARAGE_SAFE metres.
  canGarage() {
    const p = this.player;
    return p.alive && !this.enemies.some((e) => e.alive && !e.dummy && Math.hypot(e.x - p.x, e.z - p.z) < GARAGE_SAFE);
  }

  garage(cmd = {}) {
    const { op, part } = cmd;
    if (['forge', 'equip-design', 'delete-design', 'unlock', 'dummy'].includes(op)) return this.forgeCommand(cmd);
    const def = PARTS[part];
    if (!def || (op !== 'buy' && op !== 'equip')) return;
    if (!this.canGarage()) return this.emit('garage-denied', { reason: 'combat', part });
    if (op === 'buy') {
      if (this.owned.has(part)) return this.emit('garage-denied', { reason: 'owned', part });
      if (this.wallet < def.price) return this.emit('garage-denied', { reason: 'data', part });
      this.wallet -= def.price;
      this.owned.add(part);
      this.emit('part-bought', { part, price: def.price });
      return;
    }
    if (!this.owned.has(part)) return this.emit('garage-denied', { reason: 'locked', part });
    if (this.loadout[def.slot] === part && !this.equipped[def.slot]) return;
    this.loadout[def.slot] = part;
    if (this.equipped[def.slot] !== undefined) this.equipped[def.slot] = null; // back to the plain part
    this.applyKit();
    this.emit('part-equipped', { part, slot: def.slot });
  }

  // The forge's commands (out of combat, like the rest of the garage).
  forgeCommand(cmd) {
    const deny = (reason, extra = {}) => this.emit('garage-denied', { reason, ...extra });
    if (!this.canGarage()) return deny('combat');
    const { op } = cmd;
    if (op === 'dummy') return this.spawnDummies();
    if (op === 'unlock') {
      const mod = MODS[cmd.mod];
      if (!mod || this.programs.has(cmd.mod)) return;
      if (!this.modLearned(cmd.mod)) return deny('learn', { mod: cmd.mod, from: mod.learn.from, need: mod.learn.deletes - this.deletesOf(mod.learn.from) });
      if (this.wallet < mod.price) return deny('data', { mod: cmd.mod });
      this.wallet -= mod.price;
      this.programs.add(cmd.mod);
      return this.emit('program-unlocked', { mod: cmd.mod, price: mod.price });
    }
    if (op === 'forge') {
      const { design, error } = normalizeDesign(cmd.design);
      if (error) return deny('design', { message: error });
      if (!this.owned.has(design.base)) return deny('locked', { part: design.base });
      const missing = design.mods.find((m) => !this.programs.has(m));
      if (missing) return deny('program', { mod: missing });
      const at = this.designs.findIndex((d) => d.id === design.id);
      if (at >= 0) {
        if (this.designs[at].slot !== design.slot) return deny('design', { message: 'a weapon keeps its slot' });
        this.designs[at] = design;
      } else {
        if (this.designs.length >= MAX_DESIGNS) return deny('full');
        let id = 1;
        while (this.designs.some((d) => d.id === id)) id++;
        design.id = id;
        this.designs.push(design);
      }
      if (this.equipped[design.slot] === design.id) this.applyKit();
      return this.emit('design-saved', { id: design.id, name: design.name, slot: design.slot });
    }
    const design = this.designs.find((d) => d.id === cmd.id);
    if (!design) return deny('design', { message: 'no such weapon' });
    if (op === 'equip-design') {
      if (!this.owned.has(design.base)) return deny('locked', { part: design.base });
      this.loadout[design.slot] = design.base;
      this.equipped[design.slot] = design.id;
      this.applyKit();
      return this.emit('part-equipped', { part: design.base, slot: design.slot, design: design.id, name: design.name });
    }
    if (op === 'delete-design') {
      this.designs = this.designs.filter((d) => d !== design);
      if (this.equipped[design.slot] === design.id) {
        this.equipped[design.slot] = null;
        this.applyKit();
      }
      return this.emit('design-deleted', { id: design.id, name: design.name });
    }
  }

  // How many of a virus family the player has deleted (the chips keep count).
  deletesOf(type) {
    return this.chips[CHIP_OF[type]]?.deletes ?? 0;
  }

  // Has the player deleted enough of the right viruses to unlock this mod with DATA?
  modLearned(mod) {
    const learn = MODS[mod]?.learn;
    return !learn || this.deletesOf(learn.from) >= learn.deletes;
  }

  // The kit from the loadout, with the equipped forged designs applied.
  makeKit() {
    const kit = buildKit(this.loadout);
    for (const slot of ['arm', 'gun']) {
      const d = this.designs.find((x) => x.id === this.equipped[slot]);
      if (d && d.base === this.loadout[slot]) applyDesign(kit, d);
      else this.equipped[slot] = null;
    }
    return kit;
  }

  // Training dummies to try a weapon on: one of each virus (so each element's weakness shows), standing in a
  // row ahead, out of the way of rifts. They never break, never fight back, and pack up after a while.
  spawnDummies() {
    for (const e of this.enemies) if (e.dummy) e.alive = false;
    const p = this.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const ids = [];
    ['rivet', 'plinker', 'dartfin'].forEach((type, i) => {
      const side = (i - 1) * 3.2;
      const x = p.x + fx * 7.5 - fz * side;
      const z = p.z + fz * 7.5 + fx * side;
      const e = this.spawnEnemy(type, { id: -1, x, z, roster: [type] }, 0);
      Object.assign(e, { x, z, y: this.terrain.ground(x, z) + (e.def.hover ?? 0), dummy: true, dummyT: DUMMY.life, hp: DUMMY.hp, maxHp: DUMMY.hp, state: 'recover', t: 1e9, spawnT: 0.4, home: { x, z }, yaw: Math.atan2(p.x - x, p.z - z) });
      ids.push(e.id);
    });
    this.emit('dummies', { ids });
  }

  // Rebuild the kit from the loadout and carry the player's state over (HP keeps its fraction).
  applyKit() {
    const p = this.player;
    const k = (this.kit = this.makeKit());
    const frac = p.maxHp ? p.hp / p.maxHp : 1;
    p.maxHp = k.hp;
    if (p.alive) p.hp = Math.max(1, Math.round(k.hp * frac));
    p.airDashes = p.onGround ? k.legs.airDashes : Math.min(p.airDashes, k.legs.airDashes);
    p.action = null;
    p.charge = 0;
    p.charging = false;
    p.chargeFull = false;
    p.comboT = 0;
  }

  // Progress that outlives a session: parts, the loadout, DATA and chips.
  saveData() {
    return {
      v: 2, loadout: { ...this.loadout }, owned: [...this.owned], wallet: this.wallet,
      chips: Object.fromEntries(Object.entries(this.chips).map(([k, c]) => [k, { deletes: c.deletes }])), deck: [...this.deck],
      designs: this.designs.map((d) => ({ ...d, form: { ...d.form }, mods: [...d.mods] })), programs: [...this.programs], equipped: { ...this.equipped },
    };
  }

  // Restore a save (from browser storage, so check everything). Returns whether it was applied.
  loadSave(save) {
    if (!save || (save.v !== 1 && save.v !== 2)) return false;
    const owned = new Set([...Object.values(STARTER), ...(Array.isArray(save.owned) ? save.owned.filter((k) => PARTS[k]) : [])]);
    const loadout = validLoadout(save.loadout) && SLOTS.every((slot) => owned.has(save.loadout[slot])) ? { ...save.loadout } : { ...STARTER };
    this.owned = owned;
    this.loadout = Object.fromEntries(SLOTS.map((slot) => [slot, loadout[slot]]));
    this.wallet = Math.max(0, Math.floor(Number(save.wallet) || 0));
    this.chips = {};
    for (const [k, c] of Object.entries(save.chips ?? {})) {
      const deletes = Math.max(0, Math.floor(Number(c?.deletes) || 0));
      if (CHIPS[k] && deletes > 0) this.chips[k] = { deletes, level: chipLevel(deletes) };
    }
    this.deck = (Array.isArray(save.deck) ? save.deck : []).filter((k, i, all) => this.chips[k]?.level >= 1 && all.indexOf(k) === i).slice(0, DECK_SIZE);
    for (const k of Object.keys(this.chips)) if (this.chips[k].level >= 1 && !this.deck.includes(k) && this.deck.length < DECK_SIZE) this.deck.push(k);
    this.programs = new Set([...STARTER_MODS, ...(Array.isArray(save.programs) ? save.programs.filter((k) => MODS[k]) : [])]);
    this.designs = [];
    for (const raw of Array.isArray(save.designs) ? save.designs.slice(0, MAX_DESIGNS) : []) {
      const { design } = normalizeDesign(raw);
      if (design && design.id && !this.designs.some((d) => d.id === design.id)) this.designs.push(design);
    }
    const eq = save.equipped ?? {};
    this.equipped = {
      arm: this.designs.some((d) => d.id === eq.arm && d.slot === 'arm') ? eq.arm : null,
      gun: this.designs.some((d) => d.id === eq.gun && d.slot === 'gun') ? eq.gun : null,
    };
    this.applyKit();
    this.player.hp = this.player.maxHp;
    return true;
  }

  // ------------------------------------------------------------------ shots, hazards, pickups

  updateShots() {
    const T = this.terrain;
    const p = this.player;
    for (const s of this.shots) {
      s.life -= DT;
      if (s.life <= 0) {
        s.dead = true;
        continue;
      }
      s.vy -= s.gravity * DT;
      if (s.homing) this.steer(s);
      const steps = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy, s.vz) * DT) / 0.5));
      for (let k = 0; k < steps && !s.dead; k++) {
        s.x += (s.vx * DT) / steps;
        s.y += (s.vy * DT) / steps;
        s.z += (s.vz * DT) / steps;
        if (s.ground) {
          // A ground wave rides the surface and passes through trees.
          s.y = this.surfaceY(s.x, s.z) + 0.55;
        } else {
          const h = T.height(s.x, s.z);
          if (s.y < WATER_LEVEL && h < WATER_LEVEL) {
            this.impact(s, s.x, WATER_LEVEL, s.z, 'water');
            break;
          }
          if (s.y < h) {
            this.impact(s, s.x, h, s.z, 'ground');
            break;
          }
          for (const o of T.near(s.x, s.z, 1)) {
            if (s.y < o.top && Math.hypot(s.x - o.x, s.z - o.z) < o.r + s.r * 0.5) {
              this.impact(s, s.x, s.y, s.z, o.type);
              break;
            }
          }
          if (s.dead) break;
        }
        if (s.team === 'player') {
          for (const e of this.enemies) {
            if (!e.alive || e.spawnT > 0 || s.hitIds?.has(e.id)) continue;
            if (Math.hypot(s.x - e.x, s.y - (e.y + e.def.height * 0.5), s.z - e.z) < s.r + e.def.radius) {
              this.hitEnemy(e, s.dmg, s);
              if (s.pierce) {
                // Pierce: keep going, and hit each virus once.
                s.hitIds.add(e.id);
                this.emit('impact', { x: s.x, y: s.y, z: s.z, kind: s.kind, team: s.team, surface: 'enemy', pass: true, element: s.fx?.element ?? null });
                continue;
              }
              this.impact(s, s.x, s.y, s.z, 'enemy', e);
              break;
            }
          }
        } else if (p.alive && Math.hypot(s.x - p.x, s.y - (p.y + 0.9), s.z - p.z) < s.r + 0.6) {
          const hurt = this.hurtPlayer(s.dmg, s.x, s.z);
          if (hurt || p.dash <= 0) this.impact(s, s.x, s.y, s.z, 'player');
        }
      }
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }

  impact(s, x, y, z, surface, direct = null) {
    s.dead = true;
    if (s.splash > 0) {
      const src = { ...s, splashHit: true }; // splash hits don't set off Chain
      for (const e of [...this.enemies]) {
        if (!e.alive || e === direct || e.spawnT > 0) continue;
        if (Math.hypot(x - e.x, y - (e.y + e.def.height * 0.5), z - e.z) < s.splash + e.def.radius) this.hitEnemy(e, s.splashDmg, src);
      }
    }
    this.emit('impact', { x, y, z, kind: s.kind, team: s.team, surface, element: s.fx?.element ?? s.element ?? null, splash: s.splash || 0 });
  }

  // Homing mod: turn a shot toward its target, keeping its speed (a lobbed bomb only turns sideways).
  steer(s) {
    const t = this.enemy(s.homing);
    if (!t?.alive) return;
    const tx = t.x - s.x;
    const ty = t.y + t.def.height * 0.5 - s.y;
    const tz = t.z - s.z;
    const k = Math.min(1, HOMING.turn * DT);
    if (s.gravity) {
      const sp = Math.hypot(s.vx, s.vz) || 1;
      const l = Math.hypot(tx, tz) || 1;
      let vx = s.vx / sp + (tx / l - s.vx / sp) * k;
      let vz = s.vz / sp + (tz / l - s.vz / sp) * k;
      const n = Math.hypot(vx, vz) || 1;
      s.vx = (vx / n) * sp;
      s.vz = (vz / n) * sp;
      return;
    }
    const sp = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const l = Math.hypot(tx, ty, tz) || 1;
    const vx = s.vx / sp + (tx / l - s.vx / sp) * k;
    const vy = s.vy / sp + (ty / l - s.vy / sp) * k;
    const vz = s.vz / sp + (tz / l - s.vz / sp) * k;
    const n = Math.hypot(vx, vy, vz) || 1;
    s.vx = (vx / n) * sp;
    s.vy = (vy / n) * sp;
    s.vz = (vz / n) * sp;
  }

  updateHazards() {
    const p = this.player;
    for (const h of this.hazards) {
      h.r += h.speed * DT;
      if (h.r > h.max) {
        h.dead = true;
        continue;
      }
      if (h.team === 'player') {
        // The player's ShockWave: hits each virus near the ring once.
        for (const e of this.enemies) {
          if (!e.alive || e.spawnT > 0 || h.hitIds.has(e.id)) continue;
          if (Math.abs(Math.hypot(e.x - h.x, e.z - h.z) - h.r) < h.thick + e.def.radius && e.y - h.y < 3) {
            h.hitIds.add(e.id);
            const d = Math.hypot(e.x - h.x, e.z - h.z) || 1;
            this.hitEnemy(e, h.dmg, { kind: 'chip', dirX: (e.x - h.x) / d, dirZ: (e.z - h.z) / d, push: 5, launch: 5, element: h.element });
          }
        }
      } else if (!h.hit && p.alive) {
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        const grounded = p.y - this.terrain.ground(p.x, p.z) < 0.6;
        if (grounded && Math.abs(d - h.r) < h.thick && this.hurtPlayer(h.dmg, h.x, h.z)) h.hit = true;
      }
    }
    this.hazards = this.hazards.filter((h) => !h.dead);
  }

  updatePickups() {
    const p = this.player;
    for (const k of this.pickups) {
      k.t += DT;
      const dx = p.x - k.x;
      const dy = p.y + 0.9 - k.y;
      const dz = p.z - k.z;
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      if (p.alive && k.t > 0.5 && d < 10) {
        const pull = Math.min(1, 6 * DT);
        k.vx += ((dx / d) * 16 - k.vx) * pull;
        k.vy += ((dy / d) * 16 - k.vy) * pull;
        k.vz += ((dz / d) * 16 - k.vz) * pull;
      } else k.vy -= 20 * DT;
      k.x += k.vx * DT;
      k.y += k.vy * DT;
      k.z += k.vz * DT;
      const g = this.terrain.ground(k.x, k.z) + 0.35;
      if (k.y < g) {
        k.y = g;
        k.vy = Math.abs(k.vy) * 0.35;
        k.vx *= 0.7;
        k.vz *= 0.7;
      }
      if (p.alive && k.t > 0.3 && d < 1.2) {
        k.dead = true;
        this.stats.data += k.value;
        this.wallet += k.value;
        p.hp = Math.min(p.maxHp, p.hp + 3);
        this.emit('pickup', { x: k.x, y: k.y, z: k.z, value: k.value });
      } else if (k.t > 40) k.dead = true;
    }
    this.pickups = this.pickups.filter((k) => !k.dead);
  }

  // A cheap fingerprint of the state, for determinism tests.
  hash() {
    const p = this.player;
    let h = Math.round(p.x * 1000) * 31 + Math.round(p.z * 1000) * 17 + Math.round(p.y * 1000) + p.hp;
    for (const e of this.enemies) h = (h * 33 + Math.round(e.x * 100) + Math.round(e.z * 100) * 7 + e.hp) | 0;
    h = (h + (p.lock ?? 0) * 7 + this.deck.length * 5 + this.stats.strikes * 3 + this.wallet * 11) | 0;
    for (const slot of SLOTS) for (const ch of this.loadout[slot]) h = (h * 31 + ch.charCodeAt(0)) | 0;
    h = (h + this.designs.length * 17 + (this.equipped.arm ?? 0) * 3 + (this.equipped.gun ?? 0) * 5 + this.critCount + Math.round(this.leech * 100)) | 0;
    for (const e of this.enemies) h = (h * 7 + Math.round((e.burn ?? 0) * 10) + Math.round((e.soak ?? 0) * 10) + (e.shock ?? 0) * 3 + (e.shockLevel ?? 0) * 5 + Math.round((e.shockImmune ?? 0) * 10)) | 0;
    return (h + this.shots.length * 101 + this.stats.data * 13) | 0;
  }
}
