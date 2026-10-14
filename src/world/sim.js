import { Rng } from '../engine/rng.js';
import { makeTerrain, PLAY_RADIUS, WATER_LEVEL } from './terrain.js';
import { ENEMY_TYPES, AI } from './enemies.js';

// The open-world simulation: a fixed 60 Hz step with no rendering, like the grid game's engine. The view sends
// one input per step and drains events (shots, hits, deletes...) for effects and sound. A seed plus an input
// log replays exactly, so it can be tested headless.
//
// Input per step: { move: {x, y} (camera-relative: x right, y forward, -1..1), camYaw, aimYaw, aimPitch,
//   aimPoint: {x, y, z} | null (what the crosshair is on), fire, jump, dash (held booleans) }.
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
    this.events = [];
    this.enemies = [];
    this.shots = [];
    this.hazards = [];
    this.pickups = [];
    this.nextId = 1;
    this.zones = this.terrain.zones.map((z) => ({ ...z, state: 'dormant', members: [], clears: 0 }));
    this.wave = 1; // sealing every rift starts the next, tougher wave
    this.player = this.newPlayer();
    this.prev = { fire: false, jump: false, dash: false };
    this.stats = { shots: 0, hits: 0, kills: 0, damageTaken: 0, data: 0, counters: 0 };
  }

  newPlayer() {
    const { spawn } = this.terrain;
    return {
      x: spawn.x, y: this.terrain.ground(spawn.x, spawn.z), z: spawn.z, vx: 0, vy: 0, vz: 0, yaw: 0,
      onGround: true, airDash: true, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, alive: true, respawn: 0,
      iframes: 0, flinch: 0, dash: 0, dashDir: { x: 0, z: 1 }, dashCd: 0, fireCd: 0, aimHold: 0,
      charge: 0, charging: false, chargeFull: false, speed: 0, wading: false,
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

  step(input = {}) {
    this.frame++;
    this.t += DT;
    const fire = !!input.fire;
    const jump = !!input.jump;
    const dash = !!input.dash;
    const edges = {
      fire: fire && !this.prev.fire,
      release: !fire && this.prev.fire,
      jump: jump && !this.prev.jump,
      dash: dash && !this.prev.dash,
    };
    this.prev = { fire, jump, dash };
    this.updatePlayer(input, edges);
    this.updateZones();
    for (const e of this.enemies) this.updateEnemy(e);
    this.separateEnemies();
    this.enemies = this.enemies.filter((e) => e.alive || (e.dying -= DT) > 0);
    this.updateShots();
    this.updateHazards();
    this.updatePickups();
  }

  // ------------------------------------------------------------------ player

  updatePlayer(input, edges) {
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

    if (edges.dash && p.dashCd <= 0 && p.flinch <= 0 && (p.onGround || p.airDash)) {
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
    if (p.dash > 0) {
      p.dash -= dt;
      p.vx = p.dashDir.x * PLAYER.dashSpeed;
      p.vz = p.dashDir.z * PLAYER.dashSpeed;
      p.vy = 0;
      if (p.dash <= 0) {
        p.vx *= 0.4;
        p.vz *= 0.4;
      }
    } else if (p.flinch <= 0) {
      const acc = (p.onGround ? PLAYER.accel : PLAYER.airAccel) * dt;
      p.vx = approach(p.vx, dx * top, acc);
      p.vz = approach(p.vz, dz * top, acc);
    } else {
      p.vx = approach(p.vx, 0, 20 * dt);
      p.vz = approach(p.vz, 0, 20 * dt);
    }

    if (edges.jump && p.onGround && p.flinch <= 0) {
      p.vy = PLAYER.jump;
      p.onGround = false;
      this.emit('jump', at(p));
    }
    if (p.dash <= 0 && !p.onGround) p.vy -= PLAYER.gravity * dt;

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
    // World edge and obstacles.
    const d = Math.hypot(p.x, p.z);
    if (d > PLAY_RADIUS) {
      p.x *= PLAY_RADIUS / d;
      p.z *= PLAY_RADIUS / d;
    }
    for (const o of T.near(p.x, p.z, 2)) {
      if (p.y > o.top - 0.3) continue;
      const ox = p.x - o.x;
      const oz = p.z - o.z;
      const od = Math.hypot(ox, oz);
      const min = o.r + PLAYER.radius;
      if (od < min && od > 1e-6) {
        p.x = o.x + (ox / od) * min;
        p.z = o.z + (oz / od) * min;
        const into = p.vx * (ox / od) + p.vz * (oz / od);
        if (into < 0) {
          p.vx -= into * (ox / od);
          p.vz -= into * (oz / od);
        }
      }
    }
    // Vertical: land, or stick to the ground walking downhill.
    p.y += p.vy * dt;
    const g = T.ground(p.x, p.z);
    if (p.y <= g) {
      if (!p.onGround && p.vy < -6) this.emit('land', at(p));
      p.y = g;
      p.vy = 0;
      p.onGround = true;
      p.airDash = true;
    } else if (p.onGround) {
      if (p.y - g < 0.45 && p.vy <= 0) p.y = g;
      else p.onGround = false;
    }

    // Facing: toward the crosshair while shooting or charging, otherwise along the movement.
    const aiming = p.charging || p.aimHold > 0;
    const moveYaw = len > 0.1 ? Math.atan2(dx, dz) : p.yaw;
    const want = aiming ? input.aimYaw ?? cy : p.dash > 0 ? Math.atan2(p.dashDir.x, p.dashDir.z) : moveYaw;
    const diff = wrap(want - p.yaw);
    const rate = (aiming ? 20 : 12) * dt;
    p.yaw = wrap(p.yaw + clamp(diff, -rate, rate));
    p.speed = Math.hypot(p.vx, p.vz);

    // Buster and charge shot.
    if (p.flinch > 0) {
      p.charge = 0;
      p.charging = false;
      p.chargeFull = false;
      return;
    }
    if (edges.fire && p.fireCd <= 0) this.fire(p, input, 0);
    if (input.fire) {
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

  fire(p, input, level) {
    const yaw = input.aimYaw ?? input.camYaw ?? p.yaw;
    const m = this.muzzle(p, yaw);
    let dir;
    if (input.aimPoint) {
      const ax = input.aimPoint.x - m.x;
      const ay = input.aimPoint.y - m.y;
      const az = input.aimPoint.z - m.z;
      const l = Math.hypot(ax, ay, az) || 1;
      dir = { x: ax / l, y: ay / l, z: az / l };
    } else {
      const pitch = input.aimPitch ?? 0;
      dir = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
    }
    const target = this.assistTarget(m, dir, level === 2 ? 0.16 : 0.11, 75);
    if (target) {
      const l = Math.hypot(target.x - m.x, target.y - m.y, target.z - m.z) || 1;
      dir = { x: (target.x - m.x) / l, y: (target.y - m.y) / l, z: (target.z - m.z) / l };
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
      alive: true, dying: 0, state: 'idle', t: 0, cd: 0, flinch: 0, spawnT: 0.9,
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
    const p = this.player;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz);
    if (e.flinch > 0) {
      e.flinch -= DT;
      e.vx *= 0.85;
      e.vz *= 0.85;
    } else {
      AI[e.type](this, e, DT, { dx, dz, dist, sees: p.alive && dist < e.def.aggro });
    }
    // Leash: a virus never strays far from its rift.
    const hx = e.home.x - e.x;
    const hz = e.home.z - e.z;
    const hd = Math.hypot(hx, hz);
    if (hd > 45 && e.state !== 'dive') {
      e.vx = (hx / hd) * e.def.speed;
      e.vz = (hz / hd) * e.def.speed;
      e.yaw = Math.atan2(hx, hz);
    }
    e.x += e.vx * DT;
    e.z += e.vz * DT;
    for (const o of T.near(e.x, e.z, 2)) {
      if (e.y > o.top - 0.3) continue;
      const ox = e.x - o.x;
      const oz = e.z - o.z;
      const od = Math.hypot(ox, oz);
      const min = o.r + e.def.radius;
      if (od < min && od > 1e-6) {
        e.x = o.x + (ox / od) * min;
        e.z = o.z + (oz / od) * min;
      }
    }
    const g = T.ground(e.x, e.z);
    if (e.def.hover) {
      e.y += (e.vy ?? 0) * DT;
      e.y = Math.max(e.y, g + 0.6);
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

  hitEnemy(e, dmg, shot) {
    if (!e.alive) return;
    let amount = dmg;
    const counter = e.state === 'windup';
    if (counter) {
      amount *= 2;
      e.state = 'recover';
      e.t = 0.9;
      this.stats.counters++;
    }
    e.hp -= amount;
    e.flinch = shot.kind === 'charge' ? 0.5 : counter ? 0.6 : 0.1;
    if (shot.kind === 'charge') {
      const l = Math.hypot(shot.vx, shot.vz) || 1;
      e.vx = (shot.vx / l) * 6;
      e.vz = (shot.vz / l) * 6;
    }
    this.stats.hits++;
    this.emit('enemy-hit', { id: e.id, x: e.x, y: e.y + e.def.height * 0.6, z: e.z, amount: Math.round(amount), counter });
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.alive = false;
    e.hp = 0;
    e.dying = 0.6;
    this.stats.kills++;
    this.emit('delete', { id: e.id, enemy: e.type, x: e.x, y: e.y + e.def.height * 0.5, z: e.z });
    for (let i = 0; i < e.def.data; i++) this.dropData(e.x, e.y + 1, e.z, 1);
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
      if (!h.hit && p.alive) {
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
    return (h + this.shots.length * 101 + this.stats.data * 13) | 0;
  }
}
