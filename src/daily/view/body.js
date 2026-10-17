import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glow } from './stage.js';

// Daily bosses' bodies, built in code from the recipe (src/daily/recipe.js `body`): a build (slender,
// beast, diver, brute, knight, golem, duelist, phantom), a head, a weapon and the boss's colours. Toon
// shaded like everything else, with glowing eyes, cores and trims for the bloom.
//
// A body is a jointed rig facing +z: hips > spine > chest > neck/head and shoulders > upper arm > forearm >
// hand, hips > thigh > shin > foot. pose() eases the joints toward the pose for the battle's animation name
// (dozens of names across the eight families map onto a dozen poses), so every move reads at a glance.

const BUILDS = {
  //          leg  thigh  torso  chestW chestD headR armU  armF  limb  hover
  slender: { leg: 0.78, torso: 0.52, w: 0.34, d: 0.24, head: 0.237, armU: 0.36, armF: 0.36, limb: 0.06, hover: 0 },
  beast: { leg: 0.6, torso: 0.48, w: 0.44, d: 0.36, head: 0.25, armU: 0.34, armF: 0.38, limb: 0.085, hover: 0 },
  diver: { leg: 0.46, torso: 0.62, w: 0.56, d: 0.5, head: 0.35, armU: 0.3, armF: 0.3, limb: 0.1, hover: 0 },
  brute: { leg: 0.5, torso: 0.62, w: 0.74, d: 0.48, head: 0.213, armU: 0.36, armF: 0.4, limb: 0.13, hover: 0 },
  knight: { leg: 0.72, torso: 0.56, w: 0.46, d: 0.32, head: 0.25, armU: 0.34, armF: 0.34, limb: 0.08, hover: 0 },
  golem: { leg: 0.44, torso: 0.7, w: 0.86, d: 0.6, head: 0.225, armU: 0.36, armF: 0.42, limb: 0.15, hover: 0 },
  duelist: { leg: 0.76, torso: 0.5, w: 0.38, d: 0.26, head: 0.225, armU: 0.36, armF: 0.36, limb: 0.065, hover: 0 },
  phantom: { leg: 0, torso: 0.62, w: 0.5, d: 0.36, head: 0.25, armU: 0.38, armF: 0.4, limb: 0.07, hover: 0.62 },
};

const POSE_OF = {
  idle: 'idle', move: 'move', warp: 'warp', land: 'land', catch: 'land',
  charge: 'windup', windup: 'windup', sawwind: 'windup', barragewind: 'windup', aim: 'aim', crouch: 'crouch',
  stompwind: 'lift', plant: 'raise', call: 'raise', flashcharge: 'raise', howl: 'raise', roar: 'raise', bloom: 'raise', grow: 'raise', aura: 'raise', tide: 'raise',
  cast: 'release', shoot: 'release', blast: 'release', launch: 'release', barrage: 'release', beam: 'release', zap: 'release', flash: 'burst',
  throw: 'throw', rake: 'strike', slam: 'strike', stab: 'strike', smash: 'strike', slash: 'strike', stomp: 'stomp', thrust: 'thrust',
  storm: 'spin', pounce: 'pounce', leap: 'leap', guard: 'guard', hurt: 'hurt', taunt: 'taunt',
};

// Joint targets per pose: [hipsY, lean, twist, head, armL [x, z, elbow], armR [x, z, elbow], legs [thigh, knee]].
function target(pose, k, t, b) {
  const s = Math.sin;
  const p = { y: 0, lean: 0, twist: 0, head: 0, aL: [0.1, 0.18, -0.35], aR: [0.1, -0.18, -0.35], lL: [0, 0], lR: [0, 0], glow: 0, scale: 1 };
  switch (pose) {
    case 'idle':
      p.y = 0.02 * s(t * 2.2);
      p.lean = 0.04 * s(t * 1.1);
      p.head = 0.05 * s(t * 1.7);
      p.aL = [0.1 + 0.08 * s(t * 2.2), 0.22, -0.4];
      p.aR = [0.1 - 0.08 * s(t * 2.2), -0.22, -0.4];
      break;
    case 'move':
      p.y = k < 6 ? -0.08 : 0.04;
      p.lean = 0.2;
      p.aL = [0.5, 0.3, -0.6];
      p.aR = [0.5, -0.3, -0.6];
      p.lL = [-0.5, 0.8];
      p.lR = [0.3, 0.4];
      break;
    case 'warp':
      p.scale = Math.max(0.05, 1 - k / 8);
      p.glow = 1;
      break;
    case 'land':
      p.y = -0.12 * Math.max(0, 1 - k / 10);
      p.lL = [-0.5, 0.9];
      p.lR = [-0.5, 0.9];
      break;
    case 'windup':
      p.y = -0.05;
      p.lean = -0.18;
      p.twist = 0.35;
      p.aL = [-0.7, 0.2, -0.4];
      p.aR = [0.9, -0.25, -1.4];
      p.lL = [-0.3, 0.4];
      p.lR = [0.25, 0.2];
      p.glow = 0.6 + 0.4 * s(t * 18);
      break;
    case 'aim':
      p.lean = 0.05;
      p.aR = [-1.5, -0.05, 0];
      p.aL = [-0.4, 0.3, -0.8];
      p.glow = 0.5 + 0.5 * s(t * 14);
      break;
    case 'crouch':
      p.y = -0.2;
      p.lean = 0.35;
      p.aL = [0.6, 0.35, -0.9];
      p.aR = [0.6, -0.35, -0.9];
      p.lL = [-0.9, 1.5];
      p.lR = [-0.9, 1.5];
      p.glow = 0.5;
      break;
    case 'lift':
      p.lean = -0.1;
      p.lL = [-1.2, 1.2];
      p.aL = [-0.4, 0.6, -0.6];
      p.aR = [-0.4, -0.6, -0.6];
      p.glow = 0.6;
      break;
    case 'raise':
      p.y = 0.04;
      p.lean = -0.15;
      p.head = -0.25;
      p.aL = [-2.7, 0.35, -0.2];
      p.aR = [-2.7, -0.35, -0.2];
      p.glow = 0.7 + 0.3 * s(t * 12);
      break;
    case 'release':
      p.lean = 0.12 - 0.12 * Math.max(0, 1 - k / 6);
      p.twist = -0.2;
      p.aR = [-1.55, -0.05, 0];
      p.aL = [0.3, 0.35, -0.6];
      p.glow = Math.max(0.4, 1 - k / 20);
      break;
    case 'burst':
      p.lean = -0.2;
      p.aL = [-1.2, 1.1, 0];
      p.aR = [-1.2, -1.1, 0];
      p.glow = 1;
      break;
    case 'throw':
      p.twist = k < 8 ? 0.5 : -0.4;
      p.aR = k < 8 ? [1.2, -0.3, -1.2] : [-1.4, -0.1, 0];
      p.lean = k < 8 ? -0.1 : 0.2;
      break;
    case 'strike': {
      const a = Math.min(1, k / 7);
      p.lean = 0.35 * a;
      p.twist = 0.3 - 0.6 * a;
      p.aR = [-2.7 + 2.2 * a, -0.2, -0.2];
      p.aL = [-0.3, 0.4, -0.7];
      p.y = -0.06 * a;
      p.lL = [-0.5 * a, 0.6 * a];
      p.glow = 1 - a * 0.5;
      break;
    }
    case 'stomp':
      p.y = -0.1;
      p.lean = 0.2;
      p.lL = [-0.2, 0.3];
      p.aL = [0.6, 0.7, -0.5];
      p.aR = [0.6, -0.7, -0.5];
      break;
    case 'thrust':
      p.lean = 0.45;
      p.aR = [-1.6, 0, 0];
      p.aL = [0.8, 0.4, -0.5];
      p.lL = [-0.9, 0.5];
      p.lR = [0.6, 0.2];
      break;
    case 'spin':
      p.twist = s(t * 16) * 0.8;
      p.aL = [-1.6, 1.2, 0];
      p.aR = [-1.6, -1.2, 0];
      p.glow = 0.8;
      break;
    case 'pounce':
    case 'leap':
      p.y = 0.1;
      p.lean = 0.6;
      p.aL = [1.2, 0.3, -0.4];
      p.aR = [1.2, -0.3, -0.4];
      p.lL = [-1.2, 1.8];
      p.lR = [-0.6, 1.2];
      break;
    case 'guard':
      p.lean = -0.1;
      p.aL = [-1.3, -0.5, -1.2];
      p.aR = [-1.3, 0.5, -1.2];
      p.glow = 0.8;
      break;
    case 'hurt':
      p.lean = -0.45 * Math.max(0.3, 1 - k / 16);
      p.head = -0.3;
      p.aL = [-0.6, 0.9, -0.2];
      p.aR = [-0.6, -0.9, -0.2];
      break;
    case 'taunt':
      p.y = 0.04 * Math.abs(s(t * 8));
      p.head = 0.2 * s(t * 4);
      p.aL = [0.2, 0.7, -2.0];
      p.aR = [-2.4, -0.4, -0.3];
      break;
    default:
      break;
  }
  if (b.hover) {
    p.lL = [0, 0];
    p.lR = [0, 0];
  }
  return p;
}

// ---------------------------------------------------------------- parts

export class BossBody {
  constructor(recipe) {
    const body = recipe.body;
    const build = BUILDS[body.build] ?? BUILDS.duelist;
    this.build = build;
    this.kind = body.build;
    const col = body.colors;
    this.mats = {
      main: toon({ color: col.main }),
      trim: toon({ color: col.trim }),
      dark: toon({ color: darken(col.main, 0.45) }),
      glow: glow(col.glow),
      eye: glow('#ffffff'),
    };
    this.glowColor = new THREE.Color(col.glow);
    this.extra = []; // more materials that flash with the body
    const S = body.size ?? 1;
    this.root = new THREE.Group();
    this.rig = new THREE.Group(); // scaled body
    this.rig.scale.setScalar(S * 1.12);
    this.root.add(this.rig);
    const B = build;
    this.hips = new THREE.Group();
    this.hips.position.y = B.leg + B.hover;
    this.rig.add(this.hips);
    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    this.chest = new THREE.Group();
    this.chest.position.y = B.torso * 0.5;
    this.spine.add(this.chest);
    this.buildTorso();
    this.neck = new THREE.Group();
    this.neck.position.y = B.torso * 0.55 + B.head * 0.7;
    this.chest.add(this.neck);
    this.buildHead(body.head);
    this.arms = {};
    for (const side of [1, -1]) this.arms[side] = this.buildArm(side);
    this.legs = {};
    if (!B.hover) for (const side of [1, -1]) this.legs[side] = this.buildLeg(side);
    else this.buildCloak();
    this.buildWeapon(body.weapon, -1);
    if (body.extras?.[0]) this.buildWeapon(body.extras[0], 1);
    this.buildBack();
    this.rig.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = !o.material.userData.outlineParameters;
        o.receiveShadow = false;
      }
    });
    this.height = (B.leg + B.hover + B.torso * 1.05 + B.head * 2.2) * S * 1.12;
    this.cur = target('idle', 0, 0, B);
    this.shield = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 6, 1, true).rotateX(Math.PI / 2), glow(col.glow, { transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    this.shield.position.set(0, B.leg + B.torso * 0.6, 0.45);
    this.shield.visible = false;
    this.rig.add(this.shield);
  }

  // The main colour, seen from both sides (cloth).
  cloth() {
    const m = toon({ color: this.mats.main.color, side: THREE.DoubleSide });
    this.extra.push(m);
    return m;
  }

  mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  buildTorso() {
    const B = this.build;
    const { main, trim, dark, glow: g } = this.mats;
    const k = this.kind;
    if (k === 'diver') {
      this.mesh(new THREE.SphereGeometry(B.w * 0.55, 24, 16), main, this.chest, 0, 0.02, 0).scale.set(1, 1.05, 0.92);
      this.mesh(new THREE.TorusGeometry(B.w * 0.42, 0.045, 8, 24).rotateX(Math.PI / 2), trim, this.chest, 0, -0.06, 0);
      this.mesh(new THREE.CircleGeometry(0.1, 16), g, this.chest, 0, 0.06, B.d * 0.5 + 0.01);
    } else if (k === 'golem' || k === 'brute') {
      this.mesh(new RoundedBoxGeometry(B.w, B.torso, B.d, 3, 0.1), main, this.chest);
      this.mesh(new RoundedBoxGeometry(B.w * 1.06, B.torso * 0.18, B.d * 1.04, 2, 0.05), trim, this.chest, 0, B.torso * 0.32, 0);
      // The furnace in its chest.
      this.core = this.mesh(new THREE.CircleGeometry(B.w * 0.16, 6), g, this.chest, 0, 0.02, B.d / 2 + 0.005);
      this.mesh(new THREE.TorusGeometry(B.w * 0.17, 0.03, 6, 6), dark, this.chest, 0, 0.02, B.d / 2 + 0.01);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) this.mesh(new THREE.SphereGeometry(0.035, 8, 6), trim, this.chest, sx * B.w * 0.38, sy * B.torso * 0.36, B.d / 2);
    } else if (k === 'phantom') {
      this.mesh(new THREE.SphereGeometry(B.w * 0.5, 20, 14), main, this.chest).scale.set(1, 1.15, 0.8);
      this.core = this.mesh(new THREE.SphereGeometry(0.075, 16, 12), g, this.chest, 0, 0.02, B.d * 0.36);
      this.mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), trim, this.chest, 0, 0.02, B.d * 0.33);
    } else {
      // A tapered torso: broad chest over a narrow waist.
      this.mesh(new RoundedBoxGeometry(B.w, B.torso * 0.62, B.d, 3, 0.07), main, this.chest, 0, B.torso * 0.12, 0);
      this.mesh(new RoundedBoxGeometry(B.w * 0.66, B.torso * 0.4, B.d * 0.86, 2, 0.06), dark, this.chest, 0, -B.torso * 0.3, 0);
      this.mesh(new RoundedBoxGeometry(B.w * 0.5, 0.06, 0.02, 1, 0.01), g, this.chest, 0, B.torso * 0.1, B.d / 2 + 0.005);
      if (k === 'knight') {
        // A tabard down the front.
        this.mesh(new THREE.BoxGeometry(B.w * 0.5, B.torso * 0.9, 0.03), trim, this.chest, 0, -B.torso * 0.45, B.d / 2 + 0.02);
      }
      if (k === 'beast') this.spine.rotation.x = 0.25;
    }
    // Hips.
    this.mesh(new RoundedBoxGeometry(B.w * 0.7, 0.16, B.d * 0.8, 2, 0.05), dark, this.hips, 0, 0, 0);
  }

  buildHead(kind) {
    const B = this.build;
    const { main, trim, dark, glow: g, eye } = this.mats;
    const h = new THREE.Group();
    this.head = h;
    this.neck.add(h);
    const R = B.head;
    const eyes = (y = 0, z = R * 0.9, spread = R * 0.38, size = R * 0.16) => {
      for (const sx of [-1, 1]) this.mesh(new THREE.SphereGeometry(size, 10, 8), eye, h, sx * spread, y, z).scale.set(1, 0.7, 0.4);
    };
    switch (kind) {
      case 'lamp': {
        this.mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.9, R * 0.7, 16), dark, h, 0, -R * 0.2, 0);
        this.mesh(new THREE.SphereGeometry(R * 0.85, 20, 14), g, h, 0, R * 0.45, 0);
        this.mesh(new THREE.TorusGeometry(R * 0.86, R * 0.08, 6, 20).rotateX(Math.PI / 2), trim, h, 0, R * 0.15, 0);
        break;
      }
      case 'dome': {
        this.mesh(new THREE.SphereGeometry(R * 0.7, 16, 12), dark, h);
        eyes(0, R * 0.62, R * 0.28, R * 0.14);
        const glass = toon({ color: '#9ad8ff', transparent: true, opacity: 0.28, depthWrite: false });
        glass.userData.outlineParameters = { thickness: 0.003 };
        this.mesh(new THREE.SphereGeometry(R * 1.05, 24, 16), glass, h);
        this.mesh(new THREE.TorusGeometry(R * 1.02, R * 0.1, 8, 24).rotateX(Math.PI / 2), trim, h, 0, -R * 0.6, 0);
        break;
      }
      case 'snout': {
        this.mesh(new RoundedBoxGeometry(R * 1.5, R * 1.3, R * 1.5, 2, R * 0.3), main, h);
        this.mesh(new RoundedBoxGeometry(R * 1.0, R * 0.7, R * 1.0, 2, R * 0.2), main, h, 0, -R * 0.25, R * 0.8);
        eyes(R * 0.2, R * 0.76, R * 0.36);
        for (const sx of [-1, 1]) this.mesh(new THREE.ConeGeometry(R * 0.25, R * 0.8, 4), trim, h, sx * R * 0.5, R * 0.9, -R * 0.1).rotation.z = -sx * 0.3;
        break;
      }
      case 'horned':
      case 'crest':
      case 'crown':
      case 'helm':
      case 'visor':
      case 'antenna':
      default: {
        this.mesh(new RoundedBoxGeometry(R * 1.6, R * 1.7, R * 1.6, 3, R * 0.45), main, h);
        // The visor: a glowing band where the eyes are.
        this.mesh(new RoundedBoxGeometry(R * 1.3, R * 0.34, R * 0.2, 2, R * 0.1), g, h, 0, R * 0.1, R * 0.74);
        if (kind === 'helm') this.mesh(new THREE.BoxGeometry(R * 0.2, R * 0.9, R * 0.2), g, h, 0, -R * 0.2, R * 0.74);
        if (kind === 'horned') for (const sx of [-1, 1]) {
          const horn = this.mesh(new THREE.ConeGeometry(R * 0.22, R * 1.2, 8), trim, h, sx * R * 0.7, R * 0.95, 0);
          horn.rotation.z = -sx * 0.5;
        }
        if (kind === 'crest') this.mesh(new THREE.BoxGeometry(R * 0.14, R * 0.8, R * 1.6), trim, h, 0, R * 1.0, -R * 0.1).rotation.x = -0.2;
        if (kind === 'crown') for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          this.mesh(new THREE.ConeGeometry(R * 0.14, R * 0.55, 6), i % 2 ? trim : g, h, Math.sin(a) * R * 0.6, R * 1.05, Math.cos(a) * R * 0.6);
        }
        if (kind === 'antenna') for (const sx of [-1, 1]) {
          this.mesh(new THREE.CylinderGeometry(R * 0.04, R * 0.04, R * 1.0, 6), dark, h, sx * R * 0.55, R * 1.2, 0);
          this.mesh(new THREE.SphereGeometry(R * 0.14, 10, 8), g, h, sx * R * 0.55, R * 1.72, 0);
        }
        break;
      }
      case 'hood': {
        // A cowl open at the front, a void for a face, and two burning eyes.
        const cloth = this.cloth();
        this.mesh(new THREE.SphereGeometry(R * 1.12, 22, 14, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.72), cloth, h, 0, R * 0.05, 0);
        const tip = this.mesh(new THREE.ConeGeometry(R * 0.5, R * 1.1, 10), this.mats.main, h, 0, R * 0.95, -R * 0.55);
        tip.rotation.x = -0.9;
        this.mesh(new THREE.SphereGeometry(R * 0.9, 16, 12), new THREE.MeshBasicMaterial({ color: '#05020c' }), h, 0, -R * 0.05, R * 0.05);
        for (const sx of [-1, 1]) {
          const e = this.mesh(new THREE.SphereGeometry(R * 0.17, 10, 8), this.mats.glow, h, sx * R * 0.34, R * 0.02, R * 0.82);
          e.scale.set(1.3, 0.6, 0.5);
          e.rotation.z = sx * 0.35;
        }
        break;
      }
    }
  }

  buildArm(side) {
    const B = this.build;
    const { main, trim, dark } = this.mats;
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (B.w * 0.5 + B.limb * 0.6), B.torso * 0.3, 0);
    this.chest.add(shoulder);
    // The pauldron.
    const big = this.kind === 'golem' || this.kind === 'brute' || this.kind === 'knight';
    if (this.kind === 'phantom' || this.kind === 'beast') {
      const spike = this.mesh(new THREE.ConeGeometry(B.limb * 1.5, B.limb * 4, 6), trim, shoulder, side * B.limb * 0.4, B.limb * 1.2, 0);
      spike.rotation.z = -side * 0.6;
    } else this.mesh(new THREE.SphereGeometry(B.limb * (big ? 2.1 : 1.5), 14, 10), trim, shoulder).scale.set(1, 0.85, 1);
    const upper = new THREE.Group();
    shoulder.add(upper);
    this.mesh(new THREE.CapsuleGeometry(B.limb, B.armU * 0.7, 4, 10), main, upper, 0, -B.armU / 2, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -B.armU;
    upper.add(elbow);
    this.mesh(new THREE.SphereGeometry(B.limb * 1.05, 10, 8), dark, elbow);
    const fore = this.kind === 'brute' || this.kind === 'golem' ? new THREE.CapsuleGeometry(B.limb * 1.5, B.armF * 0.6, 4, 10) : new THREE.CapsuleGeometry(B.limb * 0.95, B.armF * 0.7, 4, 10);
    this.mesh(fore, main, elbow, 0, -B.armF / 2, 0);
    const hand = new THREE.Group();
    hand.position.y = -B.armF;
    elbow.add(hand);
    this.mesh(new RoundedBoxGeometry(B.limb * 2.1, B.limb * 2, B.limb * 2.1, 2, B.limb * 0.5), dark, hand, 0, -B.limb * 0.6, 0);
    return { shoulder, upper, elbow, hand };
  }

  buildLeg(side) {
    const B = this.build;
    const { main, dark, trim } = this.mats;
    const hip = new THREE.Group();
    hip.position.set(side * B.w * 0.24, 0, 0);
    this.hips.add(hip);
    const thigh = new THREE.Group();
    hip.add(thigh);
    const L = B.leg / 2;
    this.mesh(new THREE.CapsuleGeometry(B.limb * 1.2, L * 0.7, 4, 10), main, thigh, 0, -L / 2, 0);
    const knee = new THREE.Group();
    knee.position.y = -L;
    thigh.add(knee);
    this.mesh(new THREE.SphereGeometry(B.limb * 1.25, 10, 8), trim, knee);
    this.mesh(new THREE.CapsuleGeometry(B.limb * 1.05, L * 0.7, 4, 10), main, knee, 0, -L / 2, 0);
    const foot = this.mesh(new RoundedBoxGeometry(B.limb * 2.4, B.limb * 1.4, B.limb * 3.6, 2, B.limb * 0.5), dark, knee, 0, -L + B.limb * 0.4, B.limb * 0.6);
    if (this.kind === 'beast') knee.rotation.x = 0.5;
    return { thigh, knee, foot };
  }

  // A floating body's tattered cloak: a flared skirt whose hem hangs in points.
  buildCloak() {
    const B = this.build;
    const H = 0.56;
    const geo = new THREE.CylinderGeometry(B.w * 0.46, B.w * 0.95, H, 16, 3, true);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > -H / 2 + 0.01) continue;
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const seg = Math.round(((a + Math.PI) / (Math.PI * 2)) * 16);
      pos.setY(i, y - (seg % 2 ? 0.1 : 0));
    }
    geo.computeVertexNormals();
    const cloth = this.cloth();
    this.cloak = this.mesh(geo, cloth, this.hips, 0, -H / 2 + 0.08, 0);
    this.mesh(new THREE.TorusGeometry(B.w * 0.47, 0.035, 6, 18).rotateX(Math.PI / 2), this.mats.trim, this.hips, 0, 0.06, 0);
  }

  buildWeapon(kind, side) {
    const arm = this.arms[side];
    if (!arm) return;
    const { trim, dark, glow: g } = this.mats;
    const B = this.build;
    const h = arm.hand;
    switch (kind) {
      case 'orb': {
        this.orb = this.mesh(new THREE.SphereGeometry(0.12, 16, 12), g, h, 0, -0.2, 0.1);
        break;
      }
      case 'claws':
        for (let i = -1; i <= 1; i++) this.mesh(new THREE.ConeGeometry(0.03, 0.26, 6), trim, h, i * B.limb * 0.7, -B.limb * 2.2, 0.05).rotation.x = Math.PI;
        break;
      case 'staff': {
        const staff = this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 8), dark, h, 0, -0.05, 0.05);
        staff.rotation.x = Math.PI / 2 - 0.2;
        this.mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), g, staff, 0, 0.7, 0);
        break;
      }
      case 'gauntlets':
        this.mesh(new RoundedBoxGeometry(B.limb * 3.2, B.limb * 3, B.limb * 3.2, 2, B.limb * 0.8), trim, h, 0, -B.limb * 0.8, 0);
        this.mesh(new THREE.BoxGeometry(B.limb * 2.6, B.limb * 0.5, 0.02), g, h, 0, -B.limb * 0.4, B.limb * 1.62);
        break;
      case 'lance': {
        const lance = this.mesh(new THREE.ConeGeometry(0.07, 1.4, 10), trim, h, 0, -0.1, 0.55);
        lance.rotation.x = Math.PI / 2;
        this.mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), g, h, 0, -0.1, 0.0);
        break;
      }
      case 'piston': {
        const p = this.mesh(new THREE.CylinderGeometry(B.limb * 1.5, B.limb * 1.7, 0.5, 12), dark, h, 0, -0.18, 0);
        this.fist = this.mesh(new RoundedBoxGeometry(B.limb * 3.4, B.limb * 2.8, B.limb * 3.4, 2, B.limb * 0.7), trim, p, 0, -0.32, 0);
        this.mesh(new THREE.TorusGeometry(B.limb * 1.7, 0.02, 6, 14).rotateX(Math.PI / 2), g, p, 0, 0.1, 0);
        break;
      }
      case 'blade':
      default: {
        const blade = this.mesh(new THREE.BoxGeometry(0.035, 0.08, 0.95), g, h, 0, -0.12, 0.45);
        blade.rotation.x = -0.08;
        this.mesh(new THREE.BoxGeometry(0.16, 0.05, 0.06), dark, h, 0, -0.12, 0.0);
        break;
      }
    }
  }

  buildBack() {
    const B = this.build;
    const { main, trim, glow: g } = this.mats;
    if (this.kind === 'beast') {
      // A cable tail.
      let parent = this.hips;
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group();
        seg.position.set(0, i === 0 ? 0 : -0.02, i === 0 ? -B.d * 0.4 : -0.14);
        seg.rotation.x = 0.35;
        parent.add(seg);
        this.mesh(new THREE.SphereGeometry(0.06 - i * 0.008, 8, 6), i === 4 ? g : main, seg);
        parent = seg;
      }
    }
    if (this.kind === 'duelist' || this.kind === 'knight') {
      const capeMat = toon({ color: this.mats.trim.color, side: THREE.DoubleSide });
      this.extra.push(capeMat);
      this.cape = this.mesh(new THREE.PlaneGeometry(B.w * 0.9, B.torso * 1.5, 1, 4), capeMat, this.chest, 0, -B.torso * 0.35, -B.d / 2 - 0.02);
    }
    if (this.kind === 'slender' || this.kind === 'diver') {
      // A power cord / air hose.
      const cord = this.mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 16, Math.PI), this.mats.dark, this.chest, 0, -0.05, -B.d / 2 - 0.12);
      cord.rotation.y = Math.PI / 2;
    }
    if (this.kind === 'golem' || this.kind === 'brute') {
      for (const sx of [-1, 1]) this.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.36, 8), this.mats.dark, this.chest, sx * B.w * 0.25, B.torso * 0.45, -B.d * 0.4);
      this.vents = this.mesh(new THREE.BoxGeometry(B.w * 0.5, 0.04, 0.02), g, this.chest, 0, B.torso * 0.2, -B.d / 2 - 0.005);
    }
  }

  // Pose for the battle's animation name. dt: seconds since the last frame; t: seconds.
  pose(anim, animT, t, dt, info = {}) {
    const key = POSE_OF[anim] ?? 'idle';
    const want = target(key, animT ?? 0, t, this.build);
    const c = this.cur;
    const k = 1 - Math.exp(-dt * (key === 'strike' || key === 'release' || key === 'thrust' ? 30 : 16));
    const mix = (a, b) => a + (b - a) * k;
    c.y = mix(c.y, want.y);
    c.lean = mix(c.lean, want.lean);
    c.twist = mix(c.twist, want.twist);
    c.head = mix(c.head, want.head);
    c.glow = mix(c.glow, want.glow);
    c.scale = key === 'warp' ? want.scale : mix(c.scale, want.scale);
    for (const j of ['aL', 'aR', 'lL', 'lR']) for (let i = 0; i < want[j].length; i++) c[j][i] = mix(c[j][i], want[j][i]);
    const B = this.build;
    this.hips.position.y = B.leg + B.hover + c.y + (B.hover ? 0.06 * Math.sin(t * 2) : 0);
    this.spine.rotation.x = (this.kind === 'beast' ? 0.25 : 0) + c.lean;
    this.spine.rotation.y = c.twist;
    this.head.rotation.x = c.head;
    const arm = (a, v) => {
      a.upper.rotation.set(v[0], 0, v[1]);
      a.elbow.rotation.set(v[2], 0, 0);
    };
    arm(this.arms[1], c.aL);
    arm(this.arms[-1], c.aR);
    if (this.legs[1]) {
      this.legs[1].thigh.rotation.x = c.lL[0];
      this.legs[1].knee.rotation.x = (this.kind === 'beast' ? 0.5 : 0) + c.lL[1];
      this.legs[-1].thigh.rotation.x = c.lR[0];
      this.legs[-1].knee.rotation.x = (this.kind === 'beast' ? 0.5 : 0) + c.lR[1];
    }
    if (this.cloak) this.cloak.rotation.y = Math.sin(t * 1.5) * 0.1;
    if (this.cape) this.cape.rotation.x = 0.15 + 0.08 * Math.sin(t * 3) + Math.max(0, c.lean) * 0.5;
    this.rig.scale.y = this.rig.scale.x * c.scale;
    this.shield.visible = key === 'guard';
    if (this.orb) this.orb.position.y = -0.2 + 0.03 * Math.sin(t * 4);
    // Glowing parts brighten as it powers up.
    const g = 1 + c.glow * 1.6;
    this.mats.glow.color.copy(this.glowColor).multiplyScalar(g);
    const flash = info.flash ? 0.55 : 0;
    for (const m of [this.mats.main, this.mats.trim, this.mats.dark, ...this.extra]) m.emissive.setScalar(flash);
  }
}

function darken(hex, k) {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}
