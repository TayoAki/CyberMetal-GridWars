import * as THREE from 'three';
import { PARTS } from './parts.js';

// Procedural meshes for the mech's parts, hung on the rig's bones so they follow every pose. In the T-pose
// (identity bone rotations) the right arm runs along -x, the left arm along +x, the legs point down (-y) and
// the chest faces +z. Shapes are built along +y and turned onto the arm.
//
// Right hand: the arm part (drawn only while attacking, like Battle Network's Sword chips materialising).
// Left hand: the gun part (always there: it is the arm cannon). Feet and calves: the legs part. Chest: the core.

const glow = (color, opacity = 0.5) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const metal = (color = 0x2c3448) => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.65 });
const lit = (color) => new THREE.MeshStandardMaterial({ color: 0x0c0c10, emissive: color, emissiveIntensity: 1.8, roughness: 0.4 });
const TO_RIGHT_ARM = (g) => g.rotateZ(Math.PI / 2); // +y -> -x
const TO_LEFT_ARM = (g) => g.rotateZ(-Math.PI / 2); // +y -> +x

function mesh(geo, mat, glowing = false) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !glowing;
  m.frustumCulled = false;
  if (glowing) m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------- arm parts (right hand, along -x)
// `trail`: where the slash ribbon runs, as distances from the hand along the weapon.
const ARMS = {
  saber: {
    trail: [0.1, 1.25],
    build(color) {
      const g = new THREE.Group();
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.014, 0.05, 1.15, 6).translate(0, 0.675, 0)), new THREE.MeshBasicMaterial({ color: 0xf0ffff }), true));
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.05, 0.13, 1.2, 10, 1, true).translate(0, 0.675, 0)), glow(color), true));
      return g;
    },
  },
  breaker: {
    trail: [0.45, 1.02],
    build(color) {
      const g = new THREE.Group();
      // A handle, and a drum-shaped head across it with glowing faces.
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 8).translate(0, 0.44, 0)), metal(0x3a3f52)));
      const head = () => new THREE.CylinderGeometry(0.16, 0.16, 0.44, 18).rotateZ(Math.PI / 2);
      g.add(mesh(TO_RIGHT_ARM(head().translate(0, 0.88, 0)), metal(0x343a4c)));
      for (const x of [-0.225, 0.225]) g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.165, 0.165, 0.035, 18).rotateZ(Math.PI / 2).translate(x, 0.88, 0)), lit(color)));
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.168, 0.168, 0.06, 18).rotateZ(Math.PI / 2).translate(0, 0.88, 0)), lit(color)));
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 18, 1, true).rotateZ(Math.PI / 2).translate(0, 0.88, 0)), glow(color, 0.2), true));
      return g;
    },
  },
  lance: {
    trail: [1.1, 2.0],
    build(color) {
      const g = new THREE.Group();
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.008, 0.055, 1.9, 8).translate(0, 1.05, 0)), metal(0xc8d4e8)));
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16).translate(0, 0.12, 0)), metal(0x3a4058)));
      g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.02, 0.1, 1.95, 10, 1, true).translate(0, 1.05, 0)), glow(color, 0.35), true));
      return g;
    },
  },
  claws: {
    trail: [0.18, 0.66],
    build(color) {
      const g = new THREE.Group();
      for (const z of [-0.075, 0, 0.075]) {
        const blade = new THREE.BoxGeometry(0.03, 0.5, 0.05).translate(0, 0.41, 0);
        blade.rotateX(z * 1.6); // fan the three blades out a little
        blade.translate(0, 0, z);
        g.add(mesh(TO_RIGHT_ARM(blade), lit(color)));
        const shell = new THREE.BoxGeometry(0.07, 0.52, 0.09).translate(0, 0.41, 0);
        shell.rotateX(z * 1.6);
        shell.translate(0, 0, z);
        g.add(mesh(TO_RIGHT_ARM(shell), glow(color, 0.3), true));
      }
      return g;
    },
  },
};

// ---------------------------------------------------------------- gun parts (left hand, along +x)
// `muzzle`: distance from the hand to where shots and flashes start.
const GUNS = {
  buster: {
    muzzle: 0.37,
    build(color) {
      const g = new THREE.Group();
      g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.075, 0.085, 0.3, 14).translate(0, 0.2, 0)), metal()));
      g.add(mesh(TO_LEFT_ARM(new THREE.TorusGeometry(0.07, 0.018, 8, 18).rotateX(Math.PI / 2).translate(0, 0.35, 0)), lit(color)));
      return g;
    },
  },
  spreader: {
    muzzle: 0.36,
    build(color) {
      const g = new THREE.Group();
      g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.14, 0.065, 0.3, 14, 1, true).translate(0, 0.2, 0)), metal(0x4a4430)));
      g.add(mesh(TO_LEFT_ARM(new THREE.CircleGeometry(0.12, 14).rotateX(-Math.PI / 2).translate(0, 0.3, 0)), lit(color)));
      return g;
    },
  },
  railgun: {
    muzzle: 0.68,
    build(color) {
      const g = new THREE.Group();
      for (const z of [-0.055, 0.055]) g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.04, 0.62, 0.035).translate(0, 0.36, z)), metal(0x30304a)));
      g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.02, 0.58, 0.06).translate(0, 0.36, 0)), lit(color)));
      g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.12, 0.14, 0.14).translate(0, 0.1, 0)), metal(0x30304a)));
      return g;
    },
  },
  bomber: {
    muzzle: 0.33,
    build(color) {
      const g = new THREE.Group();
      g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.11, 0.12, 0.26, 14).translate(0, 0.17, 0)), metal(0x3c3030)));
      g.add(mesh(TO_LEFT_ARM(new THREE.TorusGeometry(0.1, 0.025, 8, 18).rotateX(Math.PI / 2).translate(0, 0.3, 0)), lit(color)));
      return g;
    },
  },
};

// ---------------------------------------------------------------- legs parts (feet and calves)
const LEGS = {
  striders: { build: () => ({}) },
  hover: {
    build(color) {
      const out = {};
      for (const side of ['Left', 'Right']) {
        const g = new THREE.Group();
        g.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.04, 18).translate(0, -0.1, 0.05), metal(0x2c3a50)));
        g.add(mesh(new THREE.CircleGeometry(0.13, 18).rotateX(Math.PI / 2).translate(0, -0.125, 0.05), lit(color)));
        out[`${side}Foot`] = g;
      }
      return out;
    },
  },
  sprinters: {
    build(color) {
      const out = {};
      for (const side of ['Left', 'Right']) {
        const g = new THREE.Group();
        for (const x of [-0.05, 0.05]) {
          const fin = new THREE.BoxGeometry(0.02, 0.26, 0.16).translate(x, -0.18, -0.12);
          fin.rotateX(-0.35);
          g.add(mesh(fin, lit(color)));
        }
        out[`${side}Leg`] = g;
      }
      return out;
    },
  },
  treads: {
    build(color) {
      const out = {};
      for (const side of ['Left', 'Right']) {
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(0.22, 0.15, 0.42).translate(0, -0.05, 0.06), metal(0x2a2a30)));
        g.add(mesh(new THREE.BoxGeometry(0.235, 0.03, 0.43).translate(0, -0.03, 0.06), lit(color)));
        out[`${side}Foot`] = g;
      }
      return out;
    },
  },
};

// ---------------------------------------------------------------- core (a gem on the chest)
function coreGem(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.OctahedronGeometry(0.06).translate(0, 0.04, 0.17), lit(color)));
  g.add(mesh(new THREE.OctahedronGeometry(0.1).translate(0, 0.04, 0.17), glow(color, 0.35), true));
  return g;
}

// Builds every part once and shows the equipped ones. `bones` maps Mixamo names to bone objects.
export class Gear {
  constructor(bones, root) {
    root.updateMatrixWorld(true);
    const ref = bones.Hips ?? Object.values(bones).find(Boolean);
    this.scale = 1 / (ref ? ref.getWorldScale(new THREE.Vector3()).x || 1 : 1);
    this.bones = bones;
    this.arms = {};
    this.guns = {};
    this.legs = {};
    this.cores = {};
    const hang = (boneName, obj) => {
      const b = bones[boneName];
      if (!b) return null;
      obj.scale.setScalar(this.scale);
      obj.visible = false;
      b.add(obj);
      return obj;
    };
    for (const [k, d] of Object.entries(ARMS)) this.arms[k] = hang('RightHand', d.build(PARTS[k].color));
    for (const [k, d] of Object.entries(GUNS)) this.guns[k] = hang('LeftHand', d.build(PARTS[k].color));
    for (const [k, d] of Object.entries(LEGS)) {
      this.legs[k] = Object.entries(d.build(PARTS[k].color)).map(([bone, obj]) => hang(bone, obj)).filter(Boolean);
    }
    for (const k of ['standard', 'fortress', 'link', 'overclock']) this.cores[k] = hang('Spine2', coreGem(PARTS[k].color));
    this.loadout = null;
    this.weaponK = 0;
  }

  setLoadout(loadout) {
    this.loadout = { ...loadout };
    for (const [k, g] of Object.entries(this.guns)) if (g) g.visible = k === loadout.gun;
    for (const [k, list] of Object.entries(this.legs)) for (const g of list) g.visible = k === loadout.legs;
    for (const [k, g] of Object.entries(this.cores)) if (g) g.visible = k === loadout.core;
    for (const [k, g] of Object.entries(this.arms)) if (g && k !== loadout.arm) g.visible = false;
  }

  get weapon() {
    return this.arms[this.loadout?.arm] ?? null;
  }

  // Draw the weapon in (k = 0..1): it grows out of the hand along the arm.
  showWeapon(k) {
    this.weaponK = k;
    const w = this.weapon;
    if (!w) return;
    w.visible = k > 0.03;
    const s = this.scale;
    w.scale.set(s * k, s * (0.6 + 0.4 * k), s * (0.6 + 0.4 * k));
  }

  // World positions of the slash ribbon's base and tip; false while the weapon is away.
  trailEnds(base, tip) {
    const w = this.weapon;
    if (!w || this.weaponK < 0.5) return false;
    const [b, t] = ARMS[this.loadout.arm].trail;
    w.updateMatrixWorld(true);
    base.set(-b, 0, 0).applyMatrix4(w.matrixWorld);
    tip.set(-t, 0, 0).applyMatrix4(w.matrixWorld);
    return true;
  }

  // World position of the gun's muzzle.
  muzzle(out) {
    const g = this.guns[this.loadout?.gun];
    if (!g) return null;
    g.updateMatrixWorld(true);
    return out.set(GUNS[this.loadout.gun].muzzle, 0, 0).applyMatrix4(g.matrixWorld);
  }
}
