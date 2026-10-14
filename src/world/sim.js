import { Rng } from '../engine/rng.js';
import { makeTerrain, PLAY_RADIUS, WATER_LEVEL } from './terrain.js';
import { ENEMY_TYPES, AI } from './enemies.js';
import {
  GROUND_COMBO, AIR_COMBO, LAUNCHER, CROWD, MELEE, HITSTOP, LOCK, COMBO_GRACE, REACTIONS, CHIPS, CHIP_OF, CHIP_FINISH, DECK_SIZE,
  chipLevel, pickTarget, switchTarget, onScreen,
} from './combat.js';

// The open-world simulation: a fixed 60 Hz step with no rendering, like the grid game's engine. The view sends
// one input per step and drains events (shots, hits, deletes...) for effects and sound. A seed plus an input
// log replays exactly, so it can be tested headless.
//
// Input per step (held booleans unless noted):
//   move: {x, y} camera-relative (x right, y forward, -1..1); camYaw, aimYaw, aimPitch; aimPoint {x,y,z} | null
//   attack (melee combo), shoot (buster; hold to charge; `fire` is accepted as an alias), jump, dash,
//   lock (toggle lock-on), next / prev (switch target), react (reaction command), chip: 0..4 (deck slot held)
// Yaw 0 faces +z; a facing yaw points along (sin yaw, cos yaw).

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
const BUTTONS = ['shoot', 'attack', 'jump', 'dash', 'lock', 'next', 'prev', 'react'];
const HEAVY = new Set(['charge', 'cannon', 'deflect']); // shots that knock back

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
    this.player = this.newPlayer();
    this.prev = {};
    this.prevChip = 0;
    this.stats = { shots: 0, hits: 0, kills: 0, damageTaken: 0, data: 0, counters: 0, reactions: 0, chipsUsed: 0, chipFinishes: 0, strikes: 0 };
  }

  newPlayer() {
    const { spawn } = this.terrain;
    return {
      x: spawn.x, y: this.terrain.ground(spawn.x, spawn.z), z: spawn.z, vx: 0, vy: 0, vz: 0, yaw: 0,
      onGround: true, airDash: true, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, alive: true, respawn: 0,
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
    const top = (p.wading ? PLAYER.wadeRun : PLAYER.run) * (p.charging ? 0.8 : 1);

    // Dodge: also cancels a strike once it has landed, or its wind-down.
    const canCancel = !p.action || (p.action.kind === 'melee' && p.action.hitDone);
    if (edges.dash && canCancel && p.dashCd <= 0 && p.flinch <= 0 && (p.onGround || p.airDash)) {
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
      p.dash = PLAYER.dashTime;
      p.dashCd = PLAYER.dashCooldown;
      if (!p.onGround) p.airDash = false;
      p.iframes = Math.max(p.iframes, PLAYER.dashTime + 0.05);
      p.vy = Math.max(0, p.vy);
      this.emit('dash', { ...at(p), dx: p.dashDir.x, dz: p.dashDir.z });
    }
    let gravity = PLAYER.gravity;
    if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dashDir.x * PLAYER.dashSpeed;
      p.vz = p.dashDir.z * PLAYER.dashSpeed;
      p.vy = 0;
      if (p.dash <= 0) {
        p.vx *= 0.4;
        p.vz *= 0.4;
      }
    } else if (p.action) {
      gravity = this.updateAction(input);
    } else if (p.flinch <= 0) {
      const acc = (p.onGround ? PLAYER.accel : PLAYER.airAccel) * dt;
      p.vx = approach(p.vx, dx * top, acc);
      p.vz = approach(p.vz, dz * top, acc);
    } else {
      p.vx = approach(p.vx, 0, 20 * dt);
      p.vz = approach(p.vz, 0, 20 * dt);
    }

    if (edges.jump && p.onGround && p.flinch <= 0 && (!p.action || (p.action.kind === 'melee' && p.action.hitDone))) {
      p.action = null;
      p.comboT = 0;
      p.vy = PLAYER.jump;
      p.onGround = false;
      this.emit('jump', at(p));
    }
    if (p.dash <= 0 && !p.onGround) p.vy -= gravity * dt;

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
      p.airDash = true;
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
    if (held.shoot) {
      p.charge += dt;
      if (!p.charging && p.charge >= CHARGE.delay) {
        p.charging = true;
        this.emit('charge-start', at(p));
      }
      if (!p.chargeFull && p.charge >= CHARGE.full) {
        p.chargeFull = true;
        this.emit('charge-full', at(p));
      }
    } else if (edges.release) {
      const level = p.charge >= CHARGE.full ? 2 : p.charge >= CHARGE.mid ? 1 : 0;
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
      if (p.airCombo >= AIR_COMBO.length) return; // the air combo is spent until you land
      this.startStrike(p.airCombo, true, input);
    } else this.startStrike(p.comboT > 0 && p.comboNext < GROUND_COMBO.length ? p.comboNext : 0, false, input);
    p.comboT = 0;
  }

  // The strike's target: the lock-on target, else the nearest virus roughly in front (camera or facing).
  meleeTarget(input) {
    const p = this.player;
    const locked = this.lockTarget();
    if (locked && Math.hypot(locked.x - p.x, locked.z - p.z) <= MELEE.magnet + 1) return locked;
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
      if (d > MELEE.magnet) continue;
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
    const list = air ? AIR_COMBO : GROUND_COMBO;
    let s = list[step];
    const target = this.meleeTarget(input);
    if (s.finisher && !air) {
      // Crowded: the spin; one on one: the launcher.
      const near = this.enemies.filter((e) => e.alive && e.spawnT <= 0 && Math.hypot(e.x - p.x, e.z - p.z) < CROWD.radius).length;
      if (near < CROWD.count) s = LAUNCHER;
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
        a.lunge = clamp(gap / MELEE.lungeSpeed, 0.06, MELEE.lungeMax);
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
        this.strikeHit(s);
      }
      const list = a.air ? AIR_COMBO : GROUND_COMBO;
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
          this.hitEnemy(e, a.dmg, { kind: 'chip', dirX: a.dx, dirZ: a.dz, push: 7 });
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
      this.hitEnemy(e, s.dmg, { kind: s.finisher ? 'finisher' : 'melee', dirX: dx / (d || 1), dirZ: dz / (d || 1), push: s.push, launch: s.launch, slam: s.slam });
      hits++;
    }
    if (p.action?.kind === 'melee') p.action.hits = hits;
    this.emit('strike', { name: s.name, hits, finisher: !!s.finisher, air: !!s.air, x: p.x + fx * 1.4, y: p.y + 1.1, z: p.z + fz * 1.4 });
    if (hits) this.hitstop = Math.max(this.hitstop, s.finisher ? HITSTOP.finisher : HITSTOP.slash);
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
      s.dmg = Math.round(s.dmg * REACTIONS.deflect.mult);
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
    this.hitEnemy(e, r.dmg, { kind: 'react', stun: r.stun, dirX: (e.x - p.x) / d, dirZ: (e.z - p.z) / d, push: 4 });
    this.hitstop = HITSTOP.reaction;
    this.emit('reaction', { kind, label: r.label, x: e.x, y: e.y + e.def.height * 0.5, z: e.z });
  }

  // ------------------------------------------------------------------ chips

  learnFrom(e) {
    const key = CHIP_OF[e.type];
    if (!key) return;
    const c = (this.chips[key] ??= { deletes: 0, level: 0 });
    c.deletes++;
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
    const finish = !!cut && cut.hits > 0 && cut.step === (cut.air ? 1 : 2);
    const comboNext = cut && !cut.air && !finish && cut.hits > 0 && cut.step + 1 < GROUND_COMBO.length ? cut.step + 1 : 0;
    const dmg = Math.round(def.dmg[c.level] * (finish ? CHIP_FINISH : 1));
    if (finish) this.stats.chipFinishes++;
    const target = this.lockTarget() ?? this.meleeTarget(input) ?? null;
    this.chipCd[key] = def.cooldown;
    this.stats.chipsUsed++;
    if (key === 'shockwave') {
      p.action = { kind: 'chip', name: key, t: 0, dur: 0.5, comboNext };
      this.hazards.push({ kind: 'ring', team: 'player', x: p.x, y: p.y, z: p.z, r: 0.8, speed: 14, max: 9 + 2 * c.level, thick: 1.4, dmg, hitIds: new Set() });
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
      this.addShot({ team: 'player', kind: 'cannon', ...m, vx: dir.x * 36, vy: dir.y * 36, vz: dir.z * 36, r: 0.55, dmg, splash: 3, splashDmg: Math.round(dmg * 0.5), life: 2 });
    } else if (key === 'findash') {
      let dx = Math.sin(p.yaw);
      let dz = Math.cos(p.yaw);
      if (target) {
        const l = Math.hypot(target.x - p.x, target.z - p.z) || 1;
        dx = (target.x - p.x) / l;
        dz = (target.z - p.z) / l;
      }
      p.yaw = Math.atan2(dx, dz);
      p.action = { kind: 'chip', name: key, t: 0, dur: 0.4, dx, dz, dmg, hitIds: new Set(), comboNext };
      p.iframes = Math.max(p.iframes, 0.5);
    }
    this.emit('chip-use', { chip: key, level: c.level, name: def.name, finish, ...at(p) });
  }

  // ------------------------------------------------------------------ shooting

  muzzle(p, yaw) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // The buster is on the right arm: the character's right is (-cos yaw, sin yaw).
    return {
      x: p.x - Math.cos(yaw) * MUZZLE.side + fx * MUZZLE.forward,
      y: p.y + MUZZLE.up,
      z: p.z + Math.sin(yaw) * MUZZLE.side + fz * MUZZLE.forward,
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
    const kind = ['buster', 'mid', 'charge'][level];
    const speed = level ? CHARGE.speed : BUSTER.speed;
    const shot = this.addShot({
      team: 'player', kind, ...m, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed,
      r: level ? CHARGE.radius[level] : BUSTER.radius, dmg: level ? CHARGE.dmg[level] : BUSTER.dmg,
      splash: CHARGE.splash[level], splashDmg: CHARGE.splashDmg[level], life: level ? 1.8 : BUSTER.life,
    });
    p.fireCd = BUSTER.cooldown;
    p.aimHold = 0.6;
    this.stats.shots++;
    this.emit('shot', { id: shot.id, kind, ...m, dx: dir.x, dy: dir.y, dz: dir.z });
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
    p.iframes = PLAYER.iframes;
    p.flinch = PLAYER.flinch;
    p.dash = 0;
    p.action = null;
    p.comboT = 0;
    this.stats.damageTaken += dmg;
    const dx = p.x - fromX;
    const dz = p.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    p.vx = (dx / l) * 7;
    p.vz = (dz / l) * 7;
    p.vy = 4;
    p.onGround = false;
    this.emit('hurt', { amount: dmg, x: p.x, y: p.y + 1.2, z: p.z });
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
    if (e.flinch > 0) {
      e.flinch -= DT;
      e.vx *= 0.88;
      e.vz *= 0.88;
    } else {
      AI[e.type](this, e, DT, { dx, dz, dist, sees: p.alive && dist < e.def.aggro });
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
    e.x += e.vx * DT;
    e.z += e.vz * DT;
    this.keepInWorld(e, e.def.radius);
    const g = T.ground(e.x, e.z);
    if (e.def.hover) {
      e.y += (e.vy ?? 0) * DT;
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
    let amount = dmg;
    const counter = e.state === 'windup';
    if (counter) {
      amount *= 2;
      e.state = 'recover';
      e.t = 0.9;
      this.stats.counters++;
      this.hitstop = Math.max(this.hitstop, HITSTOP.counter);
    }
    e.hp -= amount;
    // Revenge value: a virus that keeps getting hit shrugs off flinching for a moment.
    e.comboHits = this.t - e.lastHitT < 1.2 ? e.comboHits + 1 : 1;
    e.lastHitT = this.t;
    if (e.comboHits >= MELEE.armorAfter && e.armor <= 0) {
      e.armor = MELEE.armorTime;
      e.comboHits = 0;
      this.emit('armor', { id: e.id, x: e.x, y: e.y + e.def.height, z: e.z });
    }
    const armored = e.armor > 0 && src.kind !== 'react';
    const kind = src.kind;
    let flinch = { charge: 0.5, cannon: 0.6, deflect: 0.8, finisher: 0.7, melee: 0.3, chip: 0.5, react: src.stun ?? 1.4 }[kind] ?? 0.1;
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
    this.stats.hits++;
    this.emit('enemy-hit', { id: e.id, x: e.x, y: e.y + e.def.height * 0.6, z: e.z, amount: Math.round(amount), counter, kind, armored });
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
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
      const steps = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy, s.vz) * DT) / 0.5));
      for (let k = 0; k < steps && !s.dead; k++) {
        s.x += (s.vx * DT) / steps;
        s.y += (s.vy * DT) / steps;
        s.z += (s.vz * DT) / steps;
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
        if (s.team === 'player') {
          for (const e of this.enemies) {
            if (!e.alive || e.spawnT > 0) continue;
            if (Math.hypot(s.x - e.x, s.y - (e.y + e.def.height * 0.5), s.z - e.z) < s.r + e.def.radius) {
              this.hitEnemy(e, s.dmg, s);
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
      for (const e of this.enemies) {
        if (!e.alive || e === direct || e.spawnT > 0) continue;
        if (Math.hypot(x - e.x, y - (e.y + e.def.height * 0.5), z - e.z) < s.splash + e.def.radius) this.hitEnemy(e, s.splashDmg, s);
      }
    }
    this.emit('impact', { x, y, z, kind: s.kind, team: s.team, surface });
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
            this.hitEnemy(e, h.dmg, { kind: 'chip', dirX: (e.x - h.x) / d, dirZ: (e.z - h.z) / d, push: 5, launch: 5 });
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
    h = (h + (p.lock ?? 0) * 7 + this.deck.length * 5 + this.stats.strikes * 3) | 0;
    return (h + this.shots.length * 101 + this.stats.data * 13) | 0;
  }
}
