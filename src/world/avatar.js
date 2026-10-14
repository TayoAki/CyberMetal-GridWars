import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Gear } from './gear.js';

// The player's mech: the rigged GLB (Mixamo bone names, rest pose = T-pose with identity bone rotations, facing
// +z, the character's left arm along +x), animated procedurally from the simulation state. Every pose is a set
// of bone rotations layered on the T-pose; bones ease toward their targets each frame.
//
// Parts (gear.js) hang on the bones: the arm part's weapon in the right hand, drawn while attacking; the gun
// part on the left arm. A weapon-arm direction is written as [around, up]: `around` sweeps it horizontally
// (0 = out to the right, PI/2 = straight ahead, PI = across to the left) and `up` raises it; see swingArm().

export const AVATAR_HEIGHT = 1.78; // metres
const PIVOT_Y = 0.95; // spins and flips turn around the hips

// Each strike sweeps the sword arm from `from` to `to` as the strike's clock passes its hit time, turning the
// torso through `twist`. `spin`: whole-body turns; `flip`: front flips; `hop`: a little lift.
const SWINGS = {
  slash1: { from: [0.3, 0.75], to: [2.3, -0.55], twist: [-0.45, 0.5] },
  slash2: { from: [2.3, -0.45], to: [0.25, 0.7], twist: [0.5, -0.45] },
  slash3: { from: [1.25, -0.95], to: [1.75, 1.35], twist: [0.15, -0.2], hop: 0.18 },
  finisher: { from: [0.35, 0.05], to: [0.35, 0.05], twist: [0, 0], spin: 1 },
  launcher: { from: [1.35, -1.1], to: [1.75, 1.5], twist: [0.25, -0.3], hop: 0.55 },
  air1: { from: [0.3, 0.8], to: [2.3, -0.5], twist: [-0.45, 0.5] },
  air2: { from: [2.3, -0.45], to: [0.3, 0.75], twist: [0.5, -0.45] },
  airFinisher: { from: [1.57, 1.5], to: [1.57, -1.05], twist: [0, 0], flip: 1 },
  // Breaker: overhead smashes, a sweeping blow, a jumping ground quake.
  smash1: { from: [1.57, 1.45], to: [1.57, -0.85], twist: [0, 0.1], hop: 0.12 },
  smash2: { from: [0.15, 0.3], to: [2.5, -0.2], twist: [-0.6, 0.6] },
  quake: { from: [1.57, 1.55], to: [1.57, -1.2], twist: [0, 0], hop: 0.6 },
  airSmash: { from: [1.57, 1.35], to: [1.57, -0.9], twist: [0, 0] },
  meteor: { from: [1.57, 1.5], to: [1.57, -1.1], twist: [0, 0], flip: 1 },
  // Lance: jabs from the side into a straight thrust, a charge, a plunging skewer.
  thrust1: { from: [0.75, 0.05], to: [1.57, 0.05], twist: [-0.35, 0.15], lean: 0.3 },
  thrust2: { from: [2.2, 0.05], to: [1.57, 0.0], twist: [0.35, -0.1], lean: 0.3 },
  thrust3: { from: [1.1, -0.35], to: [1.57, 0.2], twist: [-0.2, 0.1], lean: 0.4 },
  pierce: { from: [1.57, 0.0], to: [1.57, 0.0], twist: [0, 0], lean: 0.85 },
  airThrust1: { from: [0.8, 0.0], to: [1.57, -0.1], twist: [-0.35, 0.15], lean: 0.2 },
  airThrust2: { from: [2.2, 0.0], to: [1.57, -0.15], twist: [0.35, -0.1], lean: 0.2 },
  skewer: { from: [1.57, 0.4], to: [1.57, -1.15], twist: [0, 0], lean: 0.6 },
  // Claws: quick rakes back and forth, an uppercut, a spinning rend.
  rake1: { from: [0.5, 0.65], to: [2.1, -0.45], twist: [-0.3, 0.35] },
  rake2: { from: [2.1, -0.4], to: [0.5, 0.6], twist: [0.35, -0.3] },
  rake3: { from: [0.6, -0.35], to: [2.0, 0.55], twist: [-0.3, 0.3] },
  rake4: { from: [2.0, 0.6], to: [0.5, -0.4], twist: [0.3, -0.35] },
  uppercut: { from: [1.4, -1.1], to: [1.7, 1.5], twist: [0.25, -0.3], hop: 0.5 },
  airRake1: { from: [0.5, 0.7], to: [2.1, -0.4], twist: [-0.3, 0.35] },
  airRake2: { from: [2.1, -0.4], to: [0.5, 0.65], twist: [0.35, -0.3] },
  airRake3: { from: [0.6, -0.3], to: [2.0, 0.6], twist: [-0.3, 0.3] },
  rend: { from: [0.4, 0.15], to: [0.4, -0.2], twist: [0, 0], spin: 1 },
  // Reaction commands.
  break: { from: [1.57, 1.45], to: [1.57, -0.9], twist: [0, 0], hop: 0.35 },
  reversal: { from: [0.3, 0.1], to: [0.3, 0.1], twist: [0, 0], spin: -1 },
  deflect: { from: [2.4, 0.1], to: [0.3, 0.35], twist: [0.55, -0.5] },
};
const REACT_HIT = 0.1; // where in a reaction the blade connects (s)

const E = (x = 0, y = 0, z = 0) => ({ x, y, z });
const smooth = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const mix = (a, b, k) => a + (b - a) * k;
const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

export async function loadAvatar(buffer) {
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  return new Avatar(gltf.scene);
}

class Avatar {
  constructor(model) {
    this.group = new THREE.Group();
    this.model = model;
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds don't follow the pose
        if (o.material) {
          o.material.roughness = 0.5;
          o.material.metalness = 0.25;
        }
      }
    });
    // Feet on the origin, centred, scaled to height. The model hangs from a pivot at the hips so spins and
    // flips turn around the body's centre.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = AVATAR_HEIGHT / size.y;
    model.scale.setScalar(scale);
    model.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale - PIVOT_Y, -((box.min.z + box.max.z) / 2) * scale);
    this.pivot = new THREE.Group();
    this.pivot.position.y = PIVOT_Y;
    this.pivot.add(model);
    this.group.add(this.pivot);
    this.bones = {};
    for (const name of BONES) this.bones[name] = model.getObjectByName('mixamorig' + name) ?? model.getObjectByName('mixamorig:' + name);
    for (const b of Object.values(this.bones)) if (b) b.userData.target = new THREE.Quaternion();
    this.meshes = [];
    model.traverse((o) => o.isMesh && this.meshes.push(o));
    this.phase = 0;
    this.time = 0;
    this.hurt = 0;
    this.shootKick = 0;
    this.hipsBase = this.bones.Hips ? this.bones.Hips.position.clone() : new THREE.Vector3();
    this.tmpE = new THREE.Euler();
    this.tmpQ = new THREE.Quaternion();
    this.weaponK = 0; // the arm part's weapon: 0 put away .. 1 fully drawn
    this.showcase = false; // the garage's pose
    this.ahead = 0;
    this.gear = new Gear(this.bones, this.group);
  }

  // Show the equipped parts, with forged designs ({ arm, gun }) drawn in place of their stock parts.
  setLoadout(loadout, designs = {}) {
    this.gear.setLoadout(loadout, designs);
  }

  // World positions of the weapon's slash-trail base and tip; false while it is put away.
  bladeEnds(base, tip) {
    return this.gear.trailEnds(base, tip);
  }

  // World position of the gun's muzzle (on the left arm), for flashes and the charge glow.
  gunMuzzle(out = new THREE.Vector3()) {
    return this.gear.muzzle(out) ?? this.group.getWorldPosition(out).add(new THREE.Vector3(0, 1.2, 0));
  }

  // Weapon arm pointing [around, up] (see the top of the file), elbow nearly straight.
  swingArm(t, around, up) {
    // Rz raises/lowers the arm from the T-pose, then Ry sweeps it around the body (Euler order XYZ applies Z
    // first): direction = (-cos(up) cos(around), sin(up), cos(up) sin(around)).
    t.RightArm = E(0, around, -up);
    t.RightForeArm = E(0, 0.12, 0);
    t.RightHand = E(0, 0, 0);
  }

  // Pose for a strike, reaction or chip in progress. Returns { spin, flip, hop, blade } extras.
  actionPose(t, a) {
    const out = { spin: 0, flip: 0, hop: 0, blade: false, fast: true };
    if (a.kind === 'melee' || a.kind === 'react') {
      const name = a.kind === 'melee' ? a.def.name : a.name;
      const sw = SWINGS[name];
      if (!sw) return out;
      const hit = a.kind === 'melee' ? a.def.hit : REACT_HIT;
      const time = a.t + this.ahead;
      out.blade = true;
      if (time < 0) {
        // Lunging in: lean forward, sword drawn back.
        t.Spine.x = 0.45;
        t.Spine1.x = 0.1;
        this.swingArm(t, sw.from[0] - 0.3, sw.from[1] * 0.5);
        t.LeftArm = E(0.8, 0, -1.0);
        t.LeftUpLeg.x = -0.6;
        t.LeftLeg.x = 0.8;
        t.RightUpLeg.x = 0.5;
        t.RightLeg.x = 0.4;
        return out;
      }
      // Wind-up to the start, a fast sweep through the hit, then follow-through.
      const k = smooth((time - hit * 0.45) / (hit * 1.0));
      const around = mix(sw.from[0], sw.to[0], k);
      const up = mix(sw.from[1], sw.to[1], k);
      this.swingArm(t, around, up);
      t.Spine1.y = mix(sw.twist[0], sw.twist[1], k);
      t.Spine.x = 0.12 + 0.12 * Math.sin(k * Math.PI) + (sw.lean ?? 0) * k;
      // The free arm balances against the swing; legs brace in a wide stance.
      t.LeftArm = E(-0.2, 0, -0.75 - 0.3 * k);
      t.LeftForeArm = E(0, -0.6, 0);
      t.LeftUpLeg = E(-0.35, 0, -0.12);
      t.LeftLeg.x = 0.45;
      t.RightUpLeg = E(0.25, 0, 0.12);
      t.RightLeg.x = 0.25;
      if (a.air || (a.kind === 'react' && name === 'reversal')) {
        t.LeftUpLeg.x = -0.8;
        t.LeftLeg.x = 1.2;
        t.RightUpLeg.x = -0.3;
        t.RightLeg.x = 0.9;
      }
      if (sw.spin) out.spin = sw.spin * Math.PI * 2 * smooth((time - hit * 0.2) / (hit * 1.6));
      if (sw.flip) out.flip = Math.PI * 2 * smooth((time - hit * 0.1) / (hit * 1.3));
      if (sw.hop) out.hop = sw.hop * Math.sin(Math.min(1, time / (hit * 2)) * Math.PI);
      return out;
    }
    if (a.kind === 'chip') {
      const time = a.t + this.ahead;
      if (a.name === 'shockwave') {
        // Arms up, then both fists slam the ground.
        const k = smooth(time / 0.12);
        const up = mix(1.4, -1.25, k);
        t.RightArm = E(0, Math.PI / 2 - 0.2, -up);
        t.LeftArm = E(0, -(Math.PI / 2 - 0.2), up);
        t.Spine.x = mix(-0.1, 0.65, k);
        t.LeftUpLeg.x = -0.9 * k;
        t.RightUpLeg.x = -0.9 * k;
        t.LeftLeg.x = 1.5 * k;
        t.RightLeg.x = 1.5 * k;
        out.hop = -0.32 * k;
      } else if (a.name === 'cannon') {
        // Both hands on the gun arm, big recoil.
        const kick = Math.max(0, 1 - time / 0.25);
        t.LeftArm = E(0.25 * kick, -(Math.PI / 2 - 0.05), 0);
        t.LeftForeArm = E(0, -0.3 * kick, 0);
        t.RightArm = E(0, Math.PI / 2 + 0.35, -0.05); // reaching across to steady it
        t.RightForeArm = E(0, 0.5, 0);
        t.Spine.x = -0.25 * kick;
        t.Spine1.y = 0.3;
      } else if (a.name === 'findash') {
        // A Dartfin's dive: body flat, saber out in front like a fin.
        out.blade = true;
        t.Spine.x = 0.9;
        t.Spine1.x = 0.2;
        t.Head.x = -0.6;
        this.swingArm(t, Math.PI / 2, 0.15);
        t.LeftArm = E(0.9, 0, -1.1);
        t.LeftUpLeg.x = 0.35;
        t.RightUpLeg.x = 0.5;
        t.LeftLeg.x = 0.2;
        t.RightLeg.x = 0.3;
      }
    }
    return out;
  }

  // World position of the right hand (the arm part), for effects.
  handPosition(out = new THREE.Vector3()) {
    const h = this.bones.RightHand;
    return h ? h.getWorldPosition(out) : this.group.getWorldPosition(out).add(new THREE.Vector3(0, 1.2, 0));
  }

  onShot() {
    this.shootKick = 1;
  }

  onHurt() {
    this.hurt = 0.45;
  }

  // p: the simulation's player; aimPitch: the camera's pitch; dt: real frame time; ahead: how far (s) the
  // render is past the last simulation step, so fast swings draw smoothly between steps.
  update(p, aimPitch, dt, ahead = 0) {
    this.time += dt;
    this.ahead = ahead;
    this.hurt = Math.max(0, this.hurt - dt);
    this.shootKick = Math.max(0, this.shootKick - dt * 6);
    const run = Math.min(1, p.speed / 9.5);
    this.phase += dt * p.speed * 1.9;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const air = !p.onGround && p.dash <= 0;
    const dash = p.dash > 0;
    const act = p.action;
    const aiming = (p.charging || p.aimHold > 0) && !act;
    const t = {};
    for (const n of BONES) t[n] = E();

    // Base: arms relaxed at the sides, a slight bend in the elbows.
    t.LeftArm = E(0, 0, -1.22);
    t.RightArm = E(0, 0, 1.22);
    t.LeftForeArm = E(0, -0.25, 0);
    t.RightForeArm = E(0, 0.25, 0);
    // Idle breathing.
    t.Spine.x = 0.03 + Math.sin(this.time * 2.2) * 0.02;
    t.Head.x = -0.04;

    if (run > 0.05 && p.onGround && !dash) {
      // Run cycle: legs swing, knees bend on the back swing, arms counter-swing, torso twists and leans.
      t.LeftUpLeg.x = -s * 0.85 * run;
      t.RightUpLeg.x = s * 0.85 * run;
      t.LeftLeg.x = Math.max(0, c) * 1.25 * run + 0.1;
      t.RightLeg.x = Math.max(0, -c) * 1.25 * run + 0.1;
      t.LeftArm.x = s * 0.7 * run;
      t.RightArm.x = -s * 0.7 * run;
      t.LeftForeArm.y = -0.25 - 0.6 * run;
      t.RightForeArm.y = 0.25 + 0.6 * run;
      t.Spine.x += 0.16 * run;
      t.Spine1.y = s * 0.12 * run;
    }
    if (air) {
      // Tuck: knees up, arms out for balance; stretch out while falling.
      const rising = p.vy > 0;
      t.LeftUpLeg.x = rising ? -0.9 : -0.35;
      t.RightUpLeg.x = rising ? -0.55 : -0.15;
      t.LeftLeg.x = rising ? 1.3 : 0.5;
      t.RightLeg.x = rising ? 1.0 : 0.35;
      t.LeftArm = E(-0.3, 0, -0.7);
      t.RightArm = E(-0.3, 0, 0.7);
    }
    if (dash) {
      // Boost: lean hard, arms swept back, one leg trailing.
      t.Spine.x = 0.5;
      t.Spine1.x = 0.15;
      t.LeftArm = E(0.9, 0, -1.0);
      t.RightArm = E(0.9, 0, 1.0);
      t.LeftUpLeg.x = -0.5;
      t.LeftLeg.x = 0.9;
      t.RightUpLeg.x = 0.55;
      t.RightLeg.x = 0.3;
    }
    if (aiming) {
      // Gun arm (the left) straight at the crosshair; the other arm braces; the torso turns into the shot.
      const pitch = Math.max(-0.9, Math.min(0.9, aimPitch));
      t.LeftArm = E(-pitch - this.shootKick * 0.25, -(Math.PI / 2 - 0.08), 0);
      t.LeftForeArm = E(0, -0.05 - this.shootKick * 0.3, 0);
      t.RightArm = E(-0.35, 0, 1.05);
      t.RightForeArm = E(0, 0.9, 0);
      t.Spine1.y = 0.18;
      t.Spine2.x = -pitch * 0.25;
      t.Head.x = -pitch * 0.5;
    }
    if (p.gliding) {
      // Hover glide: arms out, legs together, a slight forward tilt.
      t.LeftArm = E(-0.1, 0, -0.25);
      t.RightArm = E(-0.1, 0, 0.25);
      t.LeftUpLeg.x = -0.15;
      t.RightUpLeg.x = -0.1;
      t.LeftLeg.x = 0.3;
      t.RightLeg.x = 0.25;
      t.Spine.x = 0.2;
    }
    let extra = { spin: 0, flip: 0, hop: 0, blade: false, fast: false };
    if (act) extra = this.actionPose(t, act);
    else if (this.showcase) {
      // In the garage: weapon drawn and held out, gun arm raised, a confident stance.
      extra.blade = true;
      this.swingArm(t, 1.15, 0.3);
      t.LeftArm = E(-0.25, -(Math.PI / 2 - 0.6), 0.25);
      t.LeftForeArm = E(0, -0.5, 0);
      t.LeftUpLeg = E(-0.1, 0, -0.12);
      t.RightUpLeg = E(0.05, 0, 0.12);
    }
    if (this.hurt > 0) {
      const k = this.hurt / 0.45;
      t.Spine.x = -0.5 * k;
      t.Head.x = -0.4 * k;
      t.LeftArm = E(-0.8 * k, 0, -0.6);
      t.RightArm = E(-0.8 * k, 0, 0.6);
    }

    const ease = 1 - Math.exp(-dt * (extra.fast ? 55 : dash ? 30 : 16));
    for (const n of BONES) {
      const b = this.bones[n];
      if (!b) continue;
      const e = t[n];
      b.userData.target.setFromEuler(this.tmpE.set(e.x, e.y, e.z, 'XYZ'));
      b.quaternion.slerp(b.userData.target, ease);
    }
    // A little bounce in the step.
    if (this.bones.Hips) {
      const bob = p.onGround && !dash ? Math.abs(s) * 0.012 * run : 0;
      this.bones.Hips.position.y = this.hipsBase.y + bob;
    }
    // Spins, flips and hops turn the whole body around the hips.
    this.pivot.rotation.set(extra.flip, extra.spin, 0);
    this.pivot.position.y = PIVOT_Y + extra.hop;
    // The arm part's weapon: drawn for strikes, lingering a moment after.
    this.weaponLinger = extra.blade ? 0.3 : Math.max(0, (this.weaponLinger ?? 0) - dt);
    const want = extra.blade || this.weaponLinger > 0 ? 1 : 0;
    this.weaponK += (want - this.weaponK) * (1 - Math.exp(-dt * (want ? 40 : 14)));
    this.gear.showWeapon(this.weaponK);
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
