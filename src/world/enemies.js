// Viruses that leaked out of the net into the real world. Each one keeps its grid-battle personality but moves
// freely: it wanders near its glitch zone, notices the player, telegraphs its attack with a wind-up (hitting it
// during the wind-up is a counter, as in the grid game) and recovers. AI functions get the world, the enemy,
// dt and the player's relative position, and only set intent (velocity, facing, state); the world integrates.

// Each virus has a Battle Network element (Fire > Wood > Elec > Aqua > Fire): forged weapons of the element
// that beats it deal double damage.
export const ENEMY_TYPES = {
  // Hard-hat virus: walks up and slams the ground, sending out a shockwave ring. Jump it or dash through it.
  rivet: { hp: 60, radius: 0.75, height: 1.3, speed: 3.6, aggro: 32, data: 2, element: 'wood' },
  // Cannon tank: keeps its distance, charges and fires a slow cannonball with a little lead.
  plinker: { hp: 85, radius: 1.0, height: 1.5, speed: 2.2, aggro: 38, data: 3, element: 'fire' },
  // Flying fin drone: circles the player, marks a spot and dives through it.
  dartfin: { hp: 48, radius: 0.8, height: 0.9, speed: 7, aggro: 36, hover: 3.2, data: 2, element: 'aqua' },
};

export const RING = { speed: 11, max: 16, thick: 0.95, dmg: 14 };
export const CANNONBALL = { speed: 20, radius: 0.45, dmg: 16, life: 3 };
export const DIVE = { speed: 28, time: 0.75, dmg: 18, reach: 1.35 };

function turnToward(e, dx, dz, dt, rate) {
  const want = Math.atan2(dx, dz);
  let d = want - e.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  e.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
}

function drive(e, speed) {
  e.vx = Math.sin(e.yaw) * speed;
  e.vz = Math.cos(e.yaw) * speed;
}

function stop(e) {
  e.vx *= 0.8;
  e.vz *= 0.8;
}

function wander(w, e, dt) {
  e.wanderT = (e.wanderT ?? 0) - dt;
  if (e.wanderT <= 0) {
    e.wanderT = 1.5 + w.rng.next() * 2.5;
    e.wanderYaw = w.rng.next() * Math.PI * 2;
    e.wanderGo = w.rng.chance(0.6);
  }
  // Drift back toward the zone when far from it.
  const hx = e.home.x - e.x;
  const hz = e.home.z - e.z;
  if (Math.hypot(hx, hz) > 12) e.wanderYaw = Math.atan2(hx, hz);
  turnToward(e, Math.sin(e.wanderYaw), Math.cos(e.wanderYaw), dt, 3);
  if (e.wanderGo) drive(e, e.def.speed * 0.45);
  else stop(e);
}

export const AI = {
  rivet(w, e, dt, { dx, dz, dist, sees }) {
    e.t -= dt;
    switch (e.state) {
      case 'idle':
        wander(w, e, dt);
        if (sees) e.state = 'chase';
        break;
      case 'chase':
        if (!sees) {
          e.state = 'idle';
          break;
        }
        turnToward(e, dx, dz, dt, 7);
        if (dist > 7.5) drive(e, e.def.speed);
        else {
          stop(e);
          e.state = 'windup';
          e.t = 0.75;
          w.emit('telegraph', { id: e.id, kind: 'slam', x: e.x, y: e.y, z: e.z, time: e.t });
        }
        break;
      case 'windup':
        stop(e);
        turnToward(e, dx, dz, dt, 3);
        if (e.t <= 0) {
          e.state = 'recover';
          e.t = 1.4;
          w.hazards.push({ kind: 'ring', x: e.x, y: e.y, z: e.z, r: 0.6, ...RING, dmg: Math.round(RING.dmg * e.power), hit: false, owner: e.id });
          w.emit('slam', { id: e.id, x: e.x, y: e.y, z: e.z });
        }
        break;
      default: // recover
        stop(e);
        if (e.t <= 0) e.state = sees ? 'chase' : 'idle';
    }
  },

  plinker(w, e, dt, { dx, dz, dist, sees }) {
    e.t -= dt;
    e.cd = (e.cd ?? 1.2) - dt;
    switch (e.state) {
      case 'idle':
        wander(w, e, dt);
        if (sees) e.state = 'chase';
        break;
      case 'chase': {
        if (!sees) {
          e.state = 'idle';
          break;
        }
        turnToward(e, dx, dz, dt, 4);
        if (dist < 12) {
          drive(e, -e.def.speed); // back away while facing the player
        } else if (dist > 24) drive(e, e.def.speed);
        else {
          // Strafe slowly around the player.
          const side = e.orbit;
          e.vx = Math.cos(e.yaw) * side * e.def.speed * 0.6;
          e.vz = -Math.sin(e.yaw) * side * e.def.speed * 0.6;
        }
        if (e.cd <= 0 && dist < 32) {
          e.state = 'windup';
          e.t = 0.9;
          w.emit('telegraph', { id: e.id, kind: 'aim', x: e.x, y: e.y, z: e.z, time: e.t });
        }
        break;
      }
      case 'windup':
        stop(e);
        turnToward(e, dx, dz, dt, 5);
        if (e.t <= 0) {
          const p = w.player;
          const mouth = { x: e.x + Math.sin(e.yaw) * 1.1, y: e.y + 1.05, z: e.z + Math.cos(e.yaw) * 1.1 };
          const flight = dist / CANNONBALL.speed;
          const tx = p.x + p.vx * flight * 0.5;
          const ty = p.y + 0.9;
          const tz = p.z + p.vz * flight * 0.5;
          const l = Math.hypot(tx - mouth.x, ty - mouth.y, tz - mouth.z) || 1;
          w.addShot({
            team: 'enemy', kind: 'cannonball', ownerId: e.id, ...mouth, r: CANNONBALL.radius, dmg: Math.round(CANNONBALL.dmg * e.power), life: CANNONBALL.life,
            vx: ((tx - mouth.x) / l) * CANNONBALL.speed, vy: ((ty - mouth.y) / l) * CANNONBALL.speed, vz: ((tz - mouth.z) / l) * CANNONBALL.speed,
          });
          w.emit('enemy-shot', { id: e.id, kind: 'cannonball', ...mouth });
          e.state = 'recover';
          e.t = 0.5;
          e.cd = 2.0 + w.rng.next() * 0.8;
        }
        break;
      default:
        stop(e);
        if (e.t <= 0) e.state = sees ? 'chase' : 'idle';
    }
  },

  dartfin(w, e, dt, { dx, dz, dist, sees }) {
    e.t -= dt;
    const p = w.player;
    const hoverY = w.terrain.ground(e.x, e.z) + e.def.hover + Math.sin(w.t * 2 + e.id) * 0.3;
    switch (e.state) {
      case 'idle':
        wander(w, e, dt);
        e.vy = (hoverY - e.y) * 3;
        if (sees) {
          e.state = 'orbit';
          e.cd = 2 + w.rng.next() * 1.5;
        }
        break;
      case 'orbit': {
        if (!sees) {
          e.state = 'idle';
          break;
        }
        e.cd -= dt;
        // Aim for a point on a circle of radius 10 around the player, a little ahead in the orbit direction.
        const a = Math.atan2(e.x - p.x, e.z - p.z) + e.orbit * 0.5;
        const gx = p.x + Math.sin(a) * 10 - e.x;
        const gz = p.z + Math.cos(a) * 10 - e.z;
        const gl = Math.hypot(gx, gz) || 1;
        e.vx = (gx / gl) * Math.min(e.def.speed, gl * 2);
        e.vz = (gz / gl) * Math.min(e.def.speed, gl * 2);
        e.vy = (hoverY - e.y) * 3;
        turnToward(e, dx, dz, dt, 6);
        if (e.cd <= 0) {
          e.state = 'windup';
          e.t = 0.65;
          e.target = { x: p.x, y: w.terrain.ground(p.x, p.z) + 0.9, z: p.z };
          w.emit('telegraph', { id: e.id, kind: 'dive', x: e.x, y: e.y, z: e.z, to: e.target, time: e.t });
        }
        break;
      }
      case 'windup':
        stop(e);
        e.vy = (hoverY + 0.6 - e.y) * 3;
        turnToward(e, e.target.x - e.x, e.target.z - e.z, dt, 10);
        if (e.t <= 0) {
          e.state = 'dive';
          e.t = DIVE.time;
          const tx = e.target.x - e.x;
          const ty = e.target.y - e.y;
          const tz = e.target.z - e.z;
          const l = Math.hypot(tx, ty, tz) || 1;
          e.vx = (tx / l) * DIVE.speed;
          e.vy = (ty / l) * DIVE.speed;
          e.vz = (tz / l) * DIVE.speed;
          e.hitPlayer = false;
          w.emit('dive', { id: e.id, x: e.x, y: e.y, z: e.z });
        }
        break;
      case 'dive':
        if (!e.hitPlayer && p.alive && Math.hypot(p.x - e.x, p.y + 0.9 - e.y, p.z - e.z) < DIVE.reach) {
          e.hitPlayer = true;
          w.hurtPlayer(Math.round(DIVE.dmg * e.power), e.x, e.z);
        }
        if (e.t <= 0) {
          e.state = 'recover';
          e.t = 1.0;
        }
        break;
      default:
        stop(e);
        e.vy = (hoverY - e.y) * 2.5;
        if (e.t <= 0) {
          e.state = sees ? 'orbit' : 'idle';
          e.cd = 2.5 + w.rng.next() * 2;
        }
    }
  },
};
