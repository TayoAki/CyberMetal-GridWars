import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The player's mech: the rigged GLB (Mixamo bone names, rest pose = T-pose with identity bone rotations, facing
// +z, the character's left arm along +x), animated procedurally from the simulation state. Every pose is a set
// of bone rotations layered on the T-pose; bones ease toward their targets each frame.

export const AVATAR_HEIGHT = 1.78; // metres

const E = (x = 0, y = 0, z = 0) => ({ x, y, z });
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
    // Feet on the origin, centred, scaled to height.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = AVATAR_HEIGHT / size.y;
    model.scale.setScalar(scale);
    model.position.set(-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale);
    this.group.add(model);
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
  }

  // World position of the right hand (the buster), for effects.
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

  // p: the simulation's player; aimPitch: the camera's pitch; dt: real frame time.
  update(p, aimPitch, dt) {
    this.time += dt;
    this.hurt = Math.max(0, this.hurt - dt);
    this.shootKick = Math.max(0, this.shootKick - dt * 6);
    const run = Math.min(1, p.speed / 9.5);
    this.phase += dt * p.speed * 1.9;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const air = !p.onGround && p.dash <= 0;
    const dash = p.dash > 0;
    const aiming = p.charging || p.aimHold > 0;
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
      // Buster arm straight at the crosshair; the other arm braces; the torso turns into the shot.
      const pitch = Math.max(-0.9, Math.min(0.9, aimPitch));
      t.RightArm = E(-pitch - this.shootKick * 0.25, Math.PI / 2 - 0.08, 0);
      t.RightForeArm = E(0, 0.05 + this.shootKick * 0.3, 0);
      t.LeftArm = E(-0.35, 0, -1.05);
      t.LeftForeArm = E(0, -0.9, 0);
      t.Spine1.y = -0.18;
      t.Spine2.x = -pitch * 0.25;
      t.Head.x = -pitch * 0.5;
    }
    if (this.hurt > 0) {
      const k = this.hurt / 0.45;
      t.Spine.x = -0.5 * k;
      t.Head.x = -0.4 * k;
      t.LeftArm = E(-0.8 * k, 0, -0.6);
      t.RightArm = E(-0.8 * k, 0, 0.6);
    }

    const ease = 1 - Math.exp(-dt * (dash ? 30 : 16));
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
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
