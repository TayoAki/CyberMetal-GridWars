import * as THREE from 'three';
import { glowSprite } from './fx.js';

// Low-poly virus models built from primitives (flat-shaded, toy-like), each with a small animation hook driven
// by the simulation state: bobbing, walking, and a clear telegraph glow during its wind-up.

const mats = new Map();
function mat(color, { emissive = 0x000000, rough = 0.6, metal = 0.1 } = {}) {
  const key = `${color}|${emissive}|${rough}|${metal}`;
  if (!mats.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, emissive, roughness: rough, metalness: metal, flatShading: true });
    m.userData.shared = true;
    mats.set(key, m);
  }
  return mats.get(key);
}
function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
// A per-instance glowing material (telegraphs flash per enemy).
function glowMat(color) {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 1, roughness: 0.4, flatShading: true });
}

function rivet() {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.5, 12, 9), mat(0x23264a), 0, 0.5, 0);
  body.scale.set(1, 0.85, 1);
  const hatMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, emissive: 0x000000, roughness: 0.45, metalness: 0.15, flatShading: true });
  const hat = mesh(new THREE.SphereGeometry(0.6, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), hatMat, 0, 0.66, 0);
  const brim = mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.07, 18), hatMat, 0, 0.66, 0.05);
  const stripe = mesh(new THREE.TorusGeometry(0.5, 0.04, 6, 18), mat(0x2a2a2a), 0, 0.86, 0);
  stripe.rotation.x = Math.PI / 2;
  const eyeMat = glowMat(0x7af6ff);
  const eyeL = mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeMat, 0.17, 0.52, 0.42);
  const eyeR = mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeMat, -0.17, 0.52, 0.42);
  const footL = mesh(new THREE.BoxGeometry(0.22, 0.14, 0.32), mat(0x14162c), 0.22, 0.07, 0.05);
  const footR = mesh(new THREE.BoxGeometry(0.22, 0.14, 0.32), mat(0x14162c), -0.22, 0.07, 0.05);
  // Pickaxe on the right, pivoting at the shoulder.
  const arm = new THREE.Group();
  arm.position.set(-0.52, 0.55, 0.1);
  const handle = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), mat(0x8a5a2e), 0, 0, 0.42);
  handle.rotation.x = Math.PI / 2;
  const head = mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), mat(0xb8c0cc, { metal: 0.6, rough: 0.3 }), 0, 0, 0.86);
  arm.add(handle, head);
  g.add(body, hat, brim, stripe, eyeL, eyeR, footL, footR, arm);
  return {
    group: g,
    update(e, time) {
      const windup = e.state === 'windup';
      hatMat.emissive.setHex(windup ? (Math.floor(time * 16) % 2 ? 0xff3020 : 0x801008) : 0x000000);
      const walk = Math.min(1, Math.hypot(e.vx, e.vz) / 3);
      footL.position.z = 0.05 + Math.sin(time * 12) * 0.12 * walk;
      footR.position.z = 0.05 - Math.sin(time * 12) * 0.12 * walk;
      body.position.y = 0.5 + Math.abs(Math.sin(time * 12)) * 0.04 * walk;
      // Raise the pick during the wind-up, slam it down after.
      const target = windup ? -1.9 : e.state === 'recover' && e.t > 1.1 ? 0.55 : -0.3;
      arm.rotation.x += (target - arm.rotation.x) * 0.25;
    },
  };
}

function plinker() {
  const g = new THREE.Group();
  const tread = mat(0x1d2230);
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 1.45), tread, 0.58, 0.21, 0));
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 1.45), tread, -0.58, 0.21, 0));
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.5, 1.25), mat(0x4a6890, { metal: 0.35, rough: 0.45 }), 0, 0.6, 0));
  const turret = new THREE.Group();
  turret.position.set(0, 0.95, 0);
  turret.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.38, 10), mat(0x5d80aa, { metal: 0.35, rough: 0.45 })));
  const barrel = mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.05, 10), mat(0x2b3242, { metal: 0.6, rough: 0.35 }), 0, 0.08, 0.6);
  barrel.rotation.x = Math.PI / 2;
  const tipMat = glowMat(0xff8a2a);
  const tip = mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 12), tipMat, 0, 0.08, 1.12);
  const visor = mesh(new THREE.BoxGeometry(0.42, 0.07, 0.05), glowMat(0xff3a3a), 0, 0.06, 0.42);
  const charge = glowSprite(0xff9a40, 0.01);
  charge.position.set(0, 0.08, 1.2);
  turret.add(barrel, tip, visor, charge);
  g.add(turret);
  return {
    group: g,
    update(e, time) {
      const windup = e.state === 'windup';
      const k = windup ? Math.min(1, 1 - e.t / 0.9) : 0;
      charge.scale.setScalar(0.01 + k * 1.4);
      tipMat.emissiveIntensity = 0.6 + k * 3;
      turret.position.y = 0.95 + (e.state === 'recover' && e.t > 0.35 ? -0.06 : 0);
    },
  };
}

function dartfin() {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x2fb5a8, emissive: 0x000000, roughness: 0.4, metalness: 0.2, flatShading: true });
  const body = mesh(new THREE.SphereGeometry(0.45, 10, 8), skinMat, 0, 0, 0);
  body.scale.set(0.85, 0.75, 1.6);
  const belly = mesh(new THREE.SphereGeometry(0.4, 10, 6), mat(0xd8f4ee), 0, -0.1, 0.05);
  belly.scale.set(0.7, 0.45, 1.4);
  const tail = mesh(new THREE.ConeGeometry(0.34, 0.6, 4), skinMat, 0, 0, -0.85);
  tail.rotation.x = -Math.PI / 2;
  const dorsal = mesh(new THREE.BoxGeometry(0.05, 0.36, 0.5), mat(0x1d7f76), 0, 0.36, -0.05);
  dorsal.rotation.x = -0.4;
  const finL = mesh(new THREE.BoxGeometry(0.55, 0.04, 0.3), mat(0x1d7f76), 0.42, -0.05, 0.05);
  finL.rotation.z = -0.35;
  const finR = mesh(new THREE.BoxGeometry(0.55, 0.04, 0.3), mat(0x1d7f76), -0.42, -0.05, 0.05);
  finR.rotation.z = 0.35;
  const eyeMat = glowMat(0xffe14a);
  g.add(body, belly, tail, dorsal, finL, finR,
    mesh(new THREE.SphereGeometry(0.08, 6, 5), eyeMat, 0.2, 0.08, 0.55), mesh(new THREE.SphereGeometry(0.08, 6, 5), eyeMat, -0.2, 0.08, 0.55));
  const jet = glowSprite(0x60ffe8, 0.9);
  jet.position.set(0, 0, -1.15);
  g.add(jet);
  return {
    group: g,
    update(e, time) {
      const windup = e.state === 'windup';
      skinMat.emissive.setHex(windup ? (Math.floor(time * 18) % 2 ? 0xff2a2a : 0x400a0a) : e.state === 'dive' ? 0x803010 : 0x000000);
      finL.rotation.z = -0.35 + Math.sin(time * 14) * 0.25;
      finR.rotation.z = 0.35 - Math.sin(time * 14) * 0.25;
      tail.rotation.y = Math.sin(time * 9) * 0.3;
      jet.scale.setScalar(e.state === 'dive' ? 1.8 : 0.9);
      // Pitch toward the dive.
      const pitch = e.state === 'dive' ? Math.atan2(-(e.vy ?? 0), Math.hypot(e.vx, e.vz)) : 0;
      g.rotation.x += (pitch - g.rotation.x) * 0.3;
    },
  };
}

const BUILDERS = { rivet, plinker, dartfin };

// An HP bar that faces the camera; hidden at full health.
function hpBar(width) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.11), new THREE.MeshBasicMaterial({ color: 0x0a0c18, transparent: true, opacity: 0.75, depthWrite: false }));
  const fillGeo = new THREE.PlaneGeometry(width - 0.04, 0.07);
  fillGeo.translate((width - 0.04) / 2, 0, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xff5a5a, depthWrite: false }));
  fill.position.set(-(width - 0.04) / 2, 0, 0.001);
  g.add(bg, fill);
  g.renderOrder = 10;
  return { group: g, set: (k) => fill.scale.set(Math.max(0.001, k), 1, 1) };
}

export function makeEnemyModel(type, def) {
  const m = BUILDERS[type]();
  const root = new THREE.Group();
  root.add(m.group);
  const bar = hpBar(Math.max(0.9, def.radius * 1.6));
  bar.group.position.y = def.height + 0.55 + (def.hover ? 0.2 : 0);
  root.add(bar.group);
  // White hit flash: give this enemy its own copy of the shared (cached) materials so it can flash alone;
  // materials the builder made for this instance (telegraph glows) are already its own.
  const flashMats = new Set();
  m.group.traverse((o) => {
    if (o.isMesh && o.material.isMeshStandardMaterial) {
      if (o.material.userData.shared) {
        o.material = o.material.clone();
        o.material.userData.shared = false;
      }
      flashMats.add(o.material);
    }
  });
  let flash = 0;
  return {
    root,
    model: m.group,
    bar,
    hit() {
      flash = 0.09;
    },
    update(e, time, dt, camera) {
      m.update(e, time, dt);
      flash = Math.max(0, flash - dt);
      for (const fm of flashMats) {
        if (flash > 0) {
          fm.userData.saved ??= fm.emissive.getHex();
          fm.emissive.setHex(0xffffff);
        } else if (fm.userData.saved !== undefined) {
          fm.emissive.setHex(fm.userData.saved);
          fm.userData.saved = undefined;
        }
      }
      const k = e.hp / e.maxHp;
      bar.set(k);
      bar.group.visible = e.alive && k < 0.999;
      bar.group.quaternion.copy(camera.quaternion);
    },
  };
}
