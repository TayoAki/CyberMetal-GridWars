import * as THREE from 'three';
import { WORLD_SIZE, WATER_LEVEL } from './terrain.js';
import { DT } from './sim.js';
import { Particles, glowSprite, SlashTrail, reticleTexture } from './fx.js';
import { makeEnemyModel } from './models.js';
import { loadAvatar } from './avatar.js';
import { CHIPS } from './combat.js';
import { PARTS } from './parts.js';
import { ELEMENTS, FORM } from './forge.js';

// The open world's view: reads the simulation and draws it with three.js. It owns everything purely visual
// (camera, effects, telegraph markers) and never changes the simulation. It also turns the camera into the
// aim the simulation needs: the yaw/pitch of the crosshair and the point it is on.

const SUN_DIR = new THREE.Vector3(-0.45, 0.82, 0.35).normalize();
const SKY_TOP = new THREE.Color(0x3b7fd6);
const SKY_HORIZON = new THREE.Color(0xc4e4ff);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const FINISH_COLOR = 0xffd84a;
// Shot looks by kind: core colour, glow colour, glow size (in shot radii).
const SHOT_LOOK = {
  buster: [0xe8ffff, 0x40d8ff, 5], mid: [0xd8ffff, 0x5ae8ff, 5], charge: [0xffffff, 0xff5ae0, 5], cannon: [0xfffbe8, 0xffc83a, 5],
  pellet: [0xfff6c0, 0xffd84a, 4], blast: [0xffffff, 0xffb83a, 4.5], needle: [0xf4ecff, 0xb08aff, 5], bomb: [0x2a1a14, 0xff7a3a, 4],
};
const TRAIL_COLOR = { charge: 0xff7ae8, cannon: 0xffc83a, pellet: 0xffd84a, blast: 0xffb83a, needle: 0xb08aff, bomb: 0xff7a3a };
// How a forged weapon's element shows: embers rise off Fire, droplets fall off Aqua, sparks jump off Elec and
// motes drift off Wood. [colours, rise speed, gravity, size, life, jitter]
const ELEMENT_FX = {
  fire: [[0xff6a2a, 0xffa03a, 0xffe08a], 2.2, -1.5, 0.2, 0.42, 0.6],
  aqua: [[0x3ab8ff, 0x9ae0ff, 0xe0f6ff], -0.4, 7, 0.13, 0.55, 0.4],
  elec: [[0xffe14a, 0xfff6c0, 0xffffff], 0, 0, 0.15, 0.12, 6],
  wood: [[0x5ae06a, 0xa8f05a, 0xd8ffb0], 0.7, -0.2, 0.17, 0.75, 0.5],
};
const designKey = (d) => (d ? `${d.base}/${d.form.shape}/${d.form.size}/${d.form.color}/${d.form.glow}/${d.element}` : '-');
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function createView(canvas, world, avatarBuffer, opts = {}) {
  const view = new WorldView(canvas, world, opts);
  view.avatar = await loadAvatar(avatarBuffer);
  view.scene.add(view.avatar.group);
  return view;
}

class WorldView {
  constructor(canvas, world, { low = false } = {}) {
    this.world = world;
    this.canvas = canvas;
    this.low = low;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY_HORIZON, 80, 290);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.cam = { yaw: 0, pitch: -0.2, dist: 6.4, pos: new THREE.Vector3(), ready: false, shake: 0, lockK: 0 };
    this.time = 0;
    this.prevPlayer = { x: world.player.x, y: world.player.y, z: world.player.z };
    this.particles = new Particles(this.scene);
    this.dust = new Particles(this.scene, { additive: false });
    this.enemyViews = new Map();
    this.shotViews = new Map();
    this.pickupViews = new Map();
    this.hazardViews = new Map();
    this.hazardIds = new WeakMap(); // sim hazard -> view key, without touching the sim's objects
    this.telegraphs = new Map();
    this.tmp = new THREE.Vector3();
    this.tb = new THREE.Vector3();
    this.tt = new THREE.Vector3();
    this.trail = new SlashTrail(this.scene);
    this.trailAction = null;
    this.flashes = []; // pooled glow pops for hits
    this.reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture(), color: 0xffd84a, depthTest: false, depthWrite: false, transparent: true }));
    this.reticle.renderOrder = 10;
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    this.reticleK = 0;
    this.reticleId = null;
    this.beams = []; // railgun beams fading out
    this.sphereGeos = new Map(); // shot spheres by radius, shared so shots don't leak geometry
    this.shotMats = new Map();
    this.loadoutKey = '';
    this.showcase = 0; // 0..1: the garage's slow orbit around the mech
    // Where the mech sits on screen in the garage ({ x, y } in -1..1, and the camera distance), so the menu
    // can sit beside it; and the forge's design being edited, drawn on the mech instead of the equipped one.
    this.showcaseFrame = { x: 0, y: 0, dist: 3.6 };
    this.preview = null;
    this.arcs = []; // Chain mod lightning, fading out
    this.stunned = new Map(); // virus id -> time its Elec stun ends (for sparks)
    this.waveGeo = new THREE.CylinderGeometry(1, 1.15, 0.9, 20, 1, true, -0.95, 1.9).translate(0, 0.1, -0.7);
    // KH2's soft target: a small pale marker on the virus the next strike will home in on.
    this.softMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: reticleTexture(), color: 0xf4ecd0, depthTest: false, depthWrite: false, transparent: true, opacity: 0.55 }));
    this.softMark.renderOrder = 9;
    this.softMark.visible = false;
    this.scene.add(this.softMark);
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildFlora();
    this.buildRifts();
    this.buildPlayerFx();
    this.resize();
  }

  // ------------------------------------------------------------------ world building

  buildSky() {
    const geo = new THREE.SphereGeometry(700, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON }, sun: { value: SUN_DIR } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 sun;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sun), 0.0);
          c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
          c = mix(c, horizon * 0.92, clamp(-vDir.y * 4.0, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xd2e8ff, 0x4f5f34, 0.95));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d6, 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.low ? 1024 : 2048, this.low ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 240 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target);
  }

  buildTerrain() {
    const T = this.world.terrain;
    const SEG = this.low ? 128 : 192;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grassA = new THREE.Color(0x67b34a);
    const grassB = new THREE.Color(0x3f8b3c);
    const dirt = new THREE.Color(0x8d7048);
    const sand = new THREE.Color(0xd9c98f);
    const rock = new THREE.Color(0x7c8088);
    const snow = new THREE.Color(0xeef3f8);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = T.height(x, z);
      pos.setY(i, h);
      const sl = T.slope(x, z);
      const n = Math.sin(x * 0.11 + Math.cos(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 - x * 0.05) * 0.5;
      if (h < WATER_LEVEL + 0.6) c.copy(sand);
      else if (h > 26) c.copy(snow);
      else if (sl > 0.85 || h > 19) c.copy(rock).lerp(grassB, clamp(1.2 - sl, 0, 0.4));
      else {
        c.copy(grassA).lerp(grassB, clamp(0.5 + n * 0.5, 0, 1));
        if (n > 0.82) c.lerp(dirt, (n - 0.82) * 3);
      }
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 1.6, WORLD_SIZE * 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3a96d4, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.8 }),
    );
    water.position.y = WATER_LEVEL;
    water.receiveShadow = true;
    this.scene.add(water);
    this.water = water;
  }

  buildFlora() {
    const T = this.world.terrain;
    const trees = T.obstacles.filter((o) => o.type === 'tree');
    const rocks = T.obstacles.filter((o) => o.type === 'rock');
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    const inst = (geo, material, list, place, colorOf) => {
      const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
      im.count = list.length;
      list.forEach((o, i) => {
        place(o, i);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
        if (colorOf) im.setColorAt(i, colorOf(o, i));
      });
      im.castShadow = true;
      this.scene.add(im);
      return im;
    };
    const flat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 1, 6).translate(0, 0.5, 0);
    inst(trunkGeo, flat(0x6b4a2e), trees, (o) => {
      q.identity();
      p.set(o.x, o.y - 0.2, o.z);
      s.set(o.scale, 2.6 * o.scale, o.scale);
    });
    const pines = trees.filter((_, i) => i % 3 !== 0);
    const rounds = trees.filter((_, i) => i % 3 === 0);
    const leaf = (o, i) => col.setHSL(0.28 + ((i * 37) % 10) * 0.007, 0.48, 0.27 + ((i * 53) % 10) * 0.012);
    const coneGeo = new THREE.ConeGeometry(1.5, 3.2, 7).translate(0, 1.6, 0);
    inst(coneGeo, flat(0xffffff), pines, (o) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, o.x);
      p.set(o.x, o.y + 1.7 * o.scale, o.z);
      s.setScalar(o.scale);
    }, leaf);
    inst(coneGeo, flat(0xffffff), pines, (o) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, o.z);
      p.set(o.x, o.y + 3.6 * o.scale, o.z);
      s.setScalar(o.scale * 0.72);
    }, (o, i) => leaf(o, i + 3).offsetHSL(0, 0, 0.04));
    const blobGeo = new THREE.IcosahedronGeometry(1.7, 0);
    inst(blobGeo, flat(0xffffff), rounds, (o) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, o.x * 3);
      p.set(o.x, o.y + 3.4 * o.scale, o.z);
      s.set(o.scale * 1.15, o.scale, o.scale * 1.15);
    }, (o, i) => col.setHSL(0.24 + ((i * 29) % 10) * 0.008, 0.5, 0.33));
    inst(new THREE.DodecahedronGeometry(1, 0), flat(0xffffff), rocks, (o) => {
      q.setFromEuler(new THREE.Euler(o.spin, o.spin * 2, 0));
      p.set(o.x, o.y - 0.15 * o.r, o.z);
      s.set(o.r * 0.9, o.r * 0.68, o.r * 0.85);
    }, (o, i) => col.setHSL(0.6, 0.06, 0.42 + ((i * 31) % 10) * 0.012));

    // Grass tufts with a little wind.
    const blade = new THREE.BufferGeometry();
    const verts = [];
    const shade = [];
    // Five thin blades leaning out from the centre.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const ox = Math.cos(a) * 0.05;
      const oz = Math.sin(a) * 0.05;
      const wx = -Math.sin(a) * 0.035;
      const wz = Math.cos(a) * 0.035;
      const h = 0.3 + (k % 3) * 0.08;
      const lean = 0.12 + (k % 2) * 0.06;
      verts.push(ox - wx, 0, oz - wz, ox + wx, 0, oz + wz, Math.cos(a) * lean, h, Math.sin(a) * lean);
      shade.push(0.65, 0.65, 1.25);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
    blade.computeVertexNormals();
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x86cc5a, side: THREE.DoubleSide, roughness: 1 });
    this.windTime = { value: 0 };
    grassMat.onBeforeCompile = (shader) => {
      shader.uniforms.windTime = this.windTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float shade; varying float vShade; uniform float windTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vShade = shade;
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(windTime * 2.1 + wp.x * 0.35 + wp.z * 0.27) * 0.12 * position.y;
          transformed.x += sway; transformed.z += sway * 0.6;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vShade;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vShade, opacity );');
    };
    const N = this.low ? 5000 : 14000;
    const tufts = [];
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let tries = 0; tufts.length < N && tries < N * 6; tries++) {
      const x = (rnd() - 0.5) * WORLD_SIZE * 0.82;
      const z = (rnd() - 0.5) * WORLD_SIZE * 0.82;
      const h = T.height(x, z);
      if (h < WATER_LEVEL + 0.7 || h > 18 || T.slope(x, z) > 0.6) continue;
      tufts.push({ x, z, y: h, s: 0.8 + rnd() * 0.7, a: rnd() * 6.28 });
    }
    const grass = new THREE.InstancedMesh(blade, grassMat, tufts.length);
    tufts.forEach((t, i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.a);
      p.set(t.x, t.y - 0.02, t.z);
      s.setScalar(t.s);
      m4.compose(p, q, s);
      grass.setMatrixAt(i, m4);
    });
    grass.receiveShadow = true;
    this.scene.add(grass);
  }

  buildRifts() {
    const T = this.world.terrain;
    this.riftViews = this.world.zones.map((zn) => {
      const y = T.ground(zn.x, zn.z);
      const g = new THREE.Group();
      g.position.set(zn.x, y, zn.z);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3ad8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(zn.r - 0.5, zn.r, 72).rotateX(-Math.PI / 2), ringMat);
      ring.position.y = 0.12;
      const beamMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
        uniforms: { color: { value: new THREE.Color(0xff3ad8) }, time: { value: 0 }, strength: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec2 vUv; uniform vec3 color; uniform float time; uniform float strength;
          void main(){
            float fade = pow(1.0 - vUv.y, 1.6);
            float bands = 0.65 + 0.35 * sin(vUv.y * 90.0 - time * 6.0);
            gl_FragColor = vec4(color * fade * bands * strength, fade * bands * 0.8 * strength);
          }`,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 90, 20, 1, true).translate(0, 45, 0), beamMat);
      const crystalMat = new THREE.MeshStandardMaterial({ color: 0x2a0a30, emissive: 0xff3ad8, emissiveIntensity: 1.6, flatShading: true, roughness: 0.3 });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), crystalMat);
      crystal.position.y = 4;
      crystal.castShadow = true;
      const bits = new THREE.Group();
      for (let k = 0; k < 8; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), crystalMat);
        const a = (k / 8) * Math.PI * 2;
        b.position.set(Math.cos(a) * 2.4, 3.2 + (k % 3) * 0.8, Math.sin(a) * 2.4);
        bits.add(b);
      }
      g.add(ring, beam, crystal, bits);
      this.scene.add(g);
      return { zone: zn, group: g, ringMat, beamMat, crystal, crystalMat, bits };
    });
  }

  buildPlayerFx() {
    this.chargeGlow = glowSprite(0x6ae8ff, 0.01);
    this.muzzle = glowSprite(0xbff8ff, 0.01);
    this.scene.add(this.chargeGlow, this.muzzle);
    this.muzzleT = 0;
  }

  // ------------------------------------------------------------------ camera and aim

  // Drop the render resolution when frames are slow (it can't go back up without a reload, to avoid flicker).
  lowerResolution() {
    const r = this.renderer.getPixelRatio();
    if (r <= 0.75) return false;
    this.renderer.setPixelRatio(Math.max(0.75, r - 0.35));
    this.resize();
    return true;
  }

  resize() {
    const w = this.canvas.clientWidth || 960;
    const h = this.canvas.clientHeight || 540;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setViewportHeight(h * this.renderer.getPixelRatio());
    this.dust.setViewportHeight(h * this.renderer.getPixelRatio());
  }

  applyLook({ dx = 0, dy = 0, zoom = 0 }) {
    this.cam.yaw -= dx * 0.0032;
    this.cam.pitch = clamp(this.cam.pitch - dy * 0.0026, -1.0, 0.6);
    this.cam.dist = clamp(this.cam.dist + zoom * 0.7, 3.6, 12);
  }

  // Locked on, the camera turns to keep the target ahead (KH2-style); the mouse can still nudge it. It aims from
  // over the player's shoulder, so the target sits in the middle of the screen with the player to its left,
  // and looks down a little so the target shows above the player's head.
  updateLockCamera(px, py, pz, dt) {
    const t = this.world.lockTarget();
    if (!t) return;
    const side = this.shoulder();
    let ox = px - Math.cos(this.cam.yaw) * side;
    let oz = pz + Math.sin(this.cam.yaw) * side;
    let dx = t.x - ox;
    let dz = t.z - oz;
    if (Math.hypot(dx, dz) < 2) {
      // Too close to aim from the shoulder: aim from the player.
      ox = px;
      oz = pz;
      dx = t.x - px;
      dz = t.z - pz;
    }
    const d = Math.hypot(dx, dz);
    if (d < 0.6) return;
    // Ease toward the target, but never faster than ~240 degrees a second, so the view doesn't spin.
    const rate = 5 * clamp(d / 5, 0.3, 1);
    const turn = wrap(Math.atan2(dx, dz) - this.cam.yaw) * (1 - Math.exp(-dt * rate));
    this.cam.yaw += clamp(turn, -4.2 * dt, 4.2 * dt);
    const dy = t.y + t.def.height * 0.5 - (py + 1.55);
    const want = clamp(Math.atan2(dy, Math.max(d, 3)) - 0.22, -0.75, 0.4);
    this.cam.pitch += (want - this.cam.pitch) * (1 - Math.exp(-dt * 4));
  }

  // How far right of the player the camera's pivot sits (further while locked on).
  shoulder() {
    return 0.7 + this.cam.lockK * 0.9;
  }

  // Swing the camera behind the player (used on respawn).
  faceCamera(yaw) {
    this.cam.yaw = yaw;
    this.cam.pitch = -0.2;
  }

  cameraBasis() {
    const { yaw, pitch } = this.cam;
    return {
      fwd: new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)),
      right: new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw)),
    };
  }

  updateCamera(px, py, pz, dt) {
    const { fwd, right } = this.cameraBasis();
    // Locked on, pull back, up and further over the shoulder so the target stays in view past the player.
    const k = (this.cam.lockK += ((this.world.lockTarget() ? 1 : 0) - this.cam.lockK) * (1 - Math.exp(-dt * 4)));
    // In the garage the camera closes in on the mech, centred, and circles it slowly.
    const sk = (this.showK = (this.showK ?? 0) + (this.showcase - (this.showK ?? 0)) * (1 - Math.exp(-dt * 3)));
    if (this.showcase) {
      this.cam.yaw += dt * 0.45;
      this.cam.pitch += (-0.12 - this.cam.pitch) * (1 - Math.exp(-dt * 3));
    }
    // In the garage, slide the camera so the mech sits where the menu leaves room (showcaseFrame).
    // Long weapons (a Lance, a large size) get the camera pulled back so they stay in frame.
    const g = this.avatar?.gear?.arm;
    const reach = g ? g.trail[1] * g.size : 1.3;
    const f = { ...this.showcaseFrame, dist: this.showcaseFrame.dist + Math.max(0, reach - 1.3) * 1.3 };
    const half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * f.dist;
    const side = -f.x * half * this.camera.aspect * sk;
    const pivot = new THREE.Vector3(px, py + 1.55 + k * 0.45 - sk * 0.45 - f.y * half * sk, pz).addScaledVector(right, this.shoulder() * (1 - sk) + side);
    const want = pivot.clone().addScaledVector(fwd, -(this.cam.dist + k * 1.6 - sk * (this.cam.dist - f.dist)));
    // Keep the camera out of the ground (check a few points back from the pivot).
    for (let k = 0.5; k <= 1.001; k += 0.25) {
      const x = pivot.x + (want.x - pivot.x) * k;
      const z = pivot.z + (want.z - pivot.z) * k;
      const floor = this.world.terrain.height(x, z) + 0.6;
      const y = pivot.y + (want.y - pivot.y) * k;
      if (y < floor) want.y += floor - y;
    }
    if (!this.cam.ready) {
      this.cam.pos.copy(want);
      this.cam.ready = true;
    } else this.cam.pos.lerp(want, 1 - Math.exp(-dt * 22));
    this.camera.position.copy(this.cam.pos);
    if (this.cam.shake > 0 && !reduceMotion) {
      const k = this.cam.shake;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
      this.cam.shake = Math.max(0, k - dt * 1.8);
    }
    this.camera.lookAt(pivot.addScaledVector(fwd, 30));
  }

  // The crosshair: camera yaw/pitch and the first thing along the screen-centre ray (a virus or the ground).
  aimInfo() {
    const origin = this.camera.position;
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    let best = 180;
    let target = null;
    for (const e of this.world.enemies) {
      if (!e.alive || e.spawnT > 0) continue;
      const cx = e.x - origin.x;
      const cy = e.y + e.def.height * 0.5 - origin.y;
      const cz = e.z - origin.z;
      const tc = cx * dir.x + cy * dir.y + cz * dir.z;
      if (tc <= 0) continue;
      const d2 = cx * cx + cy * cy + cz * cz - tc * tc;
      const r = e.def.radius + 0.15;
      if (d2 > r * r) continue;
      const t = tc - Math.sqrt(r * r - d2);
      if (t > 0 && t < best) {
        best = t;
        target = e;
      }
    }
    // March the ray over the terrain.
    const T = this.world.terrain;
    let prev = 1;
    for (let t = 2; t < best; t += 1.5) {
      const y = origin.y + dir.y * t;
      if (y < T.height(origin.x + dir.x * t, origin.z + dir.z * t)) {
        let lo = prev;
        let hi = t;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) / 2;
          if (origin.y + dir.y * mid < T.height(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        best = hi;
        target = null;
        break;
      }
      prev = t;
    }
    this.aimTarget = target;
    this.lastAimPitch = Math.asin(clamp(dir.y, -1, 1));
    return {
      camYaw: this.cam.yaw,
      aimYaw: this.cam.yaw,
      aimPitch: this.lastAimPitch,
      aimPoint: { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best },
    };
  }

  // 3D point to canvas pixels (for the HUD); null when behind the camera.
  project(x, y, z) {
    const v = this.tmp.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight };
  }

  // Called after each simulation step, before its events, to remember where the player was.
  beforeStep() {
    const p = this.world.player;
    this.prevPlayer.x = p.x;
    this.prevPlayer.y = p.y;
    this.prevPlayer.z = p.z;
  }

  // ------------------------------------------------------------------ events

  onEvent(ev) {
    const P = this.particles;
    switch (ev.type) {
      case 'shot': {
        this.avatar.onShot();
        this.muzzleT = ev.kind === 'buster' || ev.kind === 'needle' ? 0.07 : 0.14;
        this.muzzleSize = { buster: 1.1, needle: 0.9, mid: 1.8, pellet: 1.9, blast: 3.2, bomb: 1.5 }[ev.kind] ?? 3;
        this.muzzle.material.color.setHex(PARTS[ev.gun]?.color ?? 0xbff8ff);
        break;
      }
      case 'beam': {
        // The railgun's beam: a bright line that fades, sparks along it.
        this.avatar.onShot();
        this.addBeam(ev);
        this.muzzleT = 0.12;
        this.muzzleSize = ev.level === 2 ? 3.4 : 2.2;
        const len = Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0, ev.z1 - ev.z0);
        for (let i = 0; i < Math.min(60, len * 1.2); i++) {
          const t = Math.random();
          P.emit(ev.x0 + (ev.x1 - ev.x0) * t, ev.y0 + (ev.y1 - ev.y0) * t, ev.z0 + (ev.z1 - ev.z0) * t, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0xc8a8ff, 0.35, 0.3);
        }
        P.burst(ev.x1, ev.y1, ev.z1, 16, 0xd8c0ff, { speed: 6, size: 0.45, life: 0.35 });
        if (ev.level === 2) this.cam.shake = Math.max(this.cam.shake, 0.18);
        break;
      }
      case 'charge':
        // The Lance's pierce: a burst of speed.
        this.dust.ring(ev.x, ev.y, ev.z, 14, 0xb8ad90, { speed: 6, size: 0.8, life: 0.45 });
        P.burst(ev.x, ev.y + 1, ev.z, 18, PARTS.lance.color, { speed: 6, size: 0.4, life: 0.3 });
        break;
      case 'arc':
        this.addArc(ev);
        break;
      case 'burst': {
        // Burst mod: a blast in the weapon's element (white if Null).
        const color = ELEMENTS[ev.element]?.color ?? 0xf4f8ff;
        P.burst(ev.x, ev.y, ev.z, 40, color, { speed: ev.radius * 3.5, size: 0.6, life: 0.45 });
        P.burst(ev.x, ev.y, ev.z, 12, 0xffffff, { speed: 4, size: 1.2, life: 0.22 });
        P.ring(ev.x, ev.y - 0.6, ev.z, 26, color, { speed: ev.radius * 3, size: 0.6, life: 0.4 });
        this.flash(ev.x, ev.y, ev.z, color, ev.radius * 1.6, 0.18);
        this.shakeAt(ev, 0.25);
        break;
      }
      case 'wave-cast': {
        const color = ELEMENTS[ev.element]?.color ?? this.armGlow();
        this.dust.ring(ev.x, ev.y, ev.z, 16, 0xb8ad90, { speed: 6, size: 0.8, life: 0.45 });
        P.burst(ev.x, ev.y + 0.5, ev.z, 20, color, { speed: 7, size: 0.45, life: 0.35 });
        break;
      }
      case 'stun':
        this.stunned.set(ev.id, this.time + 1);
        P.burst(ev.x, ev.y, ev.z, 26, ELEMENTS.elec.color, { speed: 7, size: 0.3, life: 0.3, jitter: 1 });
        this.flash(ev.x, ev.y, ev.z, 0xfff6c0, 2.6, 0.12);
        break;
      case 'leech': {
        // Wood: motes drift from the hit back into the player.
        const p = this.world.player;
        for (let k = 0; k < 6; k++) P.emit(p.x + (Math.random() - 0.5) * 0.8, p.y + 0.4 + Math.random() * 1.4, p.z + (Math.random() - 0.5) * 0.8, 0, 1.2, 0, ELEMENTS.wood.color, 0.25, 0.5);
        break;
      }
      case 'dummies':
        for (const id of ev.ids) {
          const e = this.world.enemy(id);
          if (e) for (let k = 0; k < 24; k++) P.emit(e.x + (Math.random() - 0.5), e.y + Math.random() * 2, e.z + (Math.random() - 0.5), 0, 3 + Math.random() * 3, 0, 0x6ae8ff, 0.45, 0.8);
        }
        break;
      case 'design-saved': {
        // A sparkle on the mech when a weapon is forged.
        const p = this.world.player;
        P.burst(p.x, p.y + 1.2, p.z, 40, 0xffd84a, { speed: 5, size: 0.35, life: 0.6 });
        break;
      }
      case 'armor-break':
        P.burst(ev.x, ev.y, ev.z, 30, 0xffb060, { speed: 10, size: 0.55, life: 0.45 });
        this.flash(ev.x, ev.y, ev.z, 0xffd8a0, 4, 0.16);
        break;
      case 'part-found':
        if (ev.part) P.burst(ev.x, ev.y, ev.z, 50, PARTS[ev.part].color, { speed: 9, size: 0.7, life: 1.0, up: 3 });
        break;
      case 'impact': {
        const enemy = ev.team === 'enemy';
        const big = ['charge', 'cannonball', 'cannon', 'deflect', 'bomb'].includes(ev.kind);
        const color = enemy ? 0xff9a3a : ELEMENTS[ev.element]?.color ?? TRAIL_COLOR[ev.kind] ?? 0x7af0ff;
        const small = ev.kind === 'pellet' || ev.kind === 'needle';
        if (ev.splash > 0 && !enemy && !big) P.ring(ev.x, ev.y, ev.z, 18, color, { speed: ev.splash * 3, size: 0.5, life: 0.35 });
        P.burst(ev.x, ev.y, ev.z, big ? 46 : ev.kind === 'mid' ? 18 : small ? 4 : 9, color, { speed: big ? 11 : 6, size: big ? 0.7 : small ? 0.25 : 0.35, life: big ? 0.7 : 0.35 });
        if (big) {
          P.burst(ev.x, ev.y, ev.z, 14, 0xffffff, { speed: 4, size: 1.2, life: 0.25 });
          P.ring(ev.x, ev.y, ev.z, 20, enemy ? 0xffc080 : 0xd0a0ff, { speed: 9, size: 0.6, life: 0.4 });
          this.shakeAt(ev, 0.3);
        }
        if (ev.surface === 'water') P.burst(ev.x, ev.y, ev.z, 14, 0xcfefff, { speed: 4, size: 0.4, life: 0.6, up: 4, grav: 14 });
        if (ev.surface === 'ground') this.dust.burst(ev.x, ev.y, ev.z, 6, 0x9a8a6a, { speed: 3, size: 0.6, life: 0.6, up: 2, grav: 6, grow: 1.2 });
        break;
      }
      case 'enemy-hit': {
        this.enemyViews.get(ev.id)?.hit();
        const elColor = ELEMENTS[ev.element]?.color;
        if (['melee', 'finisher', 'react', 'chip', 'swordwave'].includes(ev.kind)) {
          const big = ev.kind === 'finisher' || ev.kind === 'react';
          P.burst(ev.x, ev.y, ev.z, big ? 34 : 16, ev.armored ? 0xffa050 : elColor ?? 0xd8fbff, { speed: big ? 12 : 8, size: big ? 0.6 : 0.4, life: 0.3 });
          this.flash(ev.x, ev.y, ev.z, big ? 0xffe9a0 : 0xffffff, big ? 4.2 : 2.6, 0.12);
          if (big) this.shakeAt(ev, 0.3);
        }
        // A weakness hit bursts in the element's colour, bigger.
        if (ev.weak && elColor) {
          P.burst(ev.x, ev.y, ev.z, 22, elColor, { speed: 9, size: 0.5, life: 0.4 });
          this.flash(ev.x, ev.y, ev.z, elColor, 3.4, 0.16);
        }
        if (ev.crit) this.flash(ev.x, ev.y, ev.z, 0xffd84a, 3.8, 0.16);
        if (ev.kind === 'burn') P.burst(ev.x, ev.y, ev.z, 8, ELEMENTS.fire.color, { speed: 3, size: 0.3, life: 0.4, up: 2 });
        if (ev.counter) this.flash(ev.x, ev.y, ev.z, 0xffd84a, 5, 0.18);
        break;
      }
      case 'reaction': {
        // A flash of gold where the reaction lands; BREAK and REVERSAL warp the player, so don't slide there.
        P.burst(ev.x, ev.y, ev.z, 36, 0xffd84a, { speed: 12, size: 0.5, life: 0.45 });
        P.ring(ev.x, ev.y, ev.z, 24, 0xffffff, { speed: 11, size: 0.4, life: 0.3 });
        this.flash(ev.x, ev.y, ev.z, 0xffffff, 4.5, 0.18);
        this.cam.shake = Math.max(this.cam.shake, 0.35);
        if (ev.kind !== 'deflect') {
          const o = this.prevPlayer;
          for (let k = 0; k < 20; k++) P.emit(o.x + (Math.random() - 0.5), o.y + Math.random() * 1.8, o.z + (Math.random() - 0.5), 0, 2, 0, 0x6ae8ff, 0.45, 0.4);
          const p = this.world.player;
          Object.assign(this.prevPlayer, { x: p.x, y: p.y, z: p.z });
          this.trail.cut();
        }
        break;
      }
      case 'armor':
        P.ring(ev.x, ev.y, ev.z, 24, 0xff7a3a, { speed: 6, size: 0.5, life: 0.4 });
        break;
      case 'chip-use': {
        P.burst(ev.x, ev.y + 1, ev.z, 26, CHIPS[ev.chip]?.color ?? 0xffffff, { speed: 6, size: 0.45, life: 0.45 });
        if (ev.chip === 'shockwave') {
          this.dust.ring(ev.x, ev.y, ev.z, 26, 0xb8ad90, { speed: 10, size: 1.0, life: 0.6 });
          P.ring(ev.x, ev.y + 0.2, ev.z, 30, 0x6ae8ff, { speed: 13, size: 0.6, life: 0.5 });
          this.cam.shake = Math.max(this.cam.shake, 0.3);
        } else if (ev.chip === 'cannon') {
          this.avatar.onShot();
          this.muzzleT = 0.16;
          this.muzzleSize = 3.4;
        }
        break;
      }
      case 'chip-learn': {
        // Data swirls into the player.
        const p = this.world.player;
        for (let k = 0; k < 60; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = 2.5 + Math.random();
          const ox = Math.cos(a) * r;
          const oz = Math.sin(a) * r;
          const oy = Math.random() * 2.4;
          P.emit(p.x + ox, p.y + oy, p.z + oz, -ox * 3, (1 - oy) * 1.5, -oz * 3, CHIPS[ev.chip]?.color ?? 0xffffff, 0.4, 0.5, { drag: 0 });
        }
        break;
      }
      case 'delete':
        P.burst(ev.x, ev.y, ev.z, 50, 0xffa040, { speed: 10, size: 0.8, life: 0.7 });
        P.burst(ev.x, ev.y, ev.z, 24, 0xffffff, { speed: 6, size: 1.1, life: 0.25 });
        P.burst(ev.x, ev.y, ev.z, 26, 0x6af0ff, { speed: 7, size: 0.3, life: 1.1, up: 3, grav: 6 });
        this.dust.burst(ev.x, ev.y, ev.z, 10, 0xb8bcc8, { speed: 2, size: 0.9, life: 0.9, up: 1.5, grow: 1.4, drag: 1.5 });
        this.shakeAt(ev, 0.35);
        break;
      case 'hurt':
        this.avatar.onHurt();
        P.burst(ev.x, ev.y, ev.z, 22, 0xff4a4a, { speed: 7, size: 0.4, life: 0.4 });
        this.cam.shake = Math.max(this.cam.shake, 0.35);
        break;
      case 'down':
        P.burst(ev.x, ev.y + 1, ev.z, 90, 0x6ae8ff, { speed: 13, size: 0.7, life: 1 });
        P.burst(ev.x, ev.y + 1, ev.z, 30, 0xffffff, { speed: 6, size: 1.4, life: 0.4 });
        this.cam.shake = 0.6;
        break;
      case 'respawn':
        for (let k = 0; k < 40; k++) P.emit(ev.x + (Math.random() - 0.5) * 1.2, ev.y + Math.random() * 0.4, ev.z + (Math.random() - 0.5) * 1.2, 0, 4 + Math.random() * 5, 0, 0x6ae8ff, 0.4, 0.8);
        this.cam.ready = false;
        break;
      case 'jump':
        this.dust.ring(ev.x, ev.y, ev.z, 10, 0xb8ad90, { speed: 3, size: 0.6, life: 0.4 });
        break;
      case 'land':
        this.dust.ring(ev.x, ev.y, ev.z, 14, 0xb8ad90, { speed: 4.5, size: 0.7, life: 0.5 });
        break;
      case 'dash':
        for (let k = 0; k < 18; k++) P.emit(ev.x + (Math.random() - 0.5) * 0.6, ev.y + 0.3 + Math.random() * 1.3, ev.z + (Math.random() - 0.5) * 0.6, -ev.dx * 6, 0, -ev.dz * 6, 0x6ae8ff, 0.5, 0.35);
        break;
      case 'evade':
        P.burst(ev.x, ev.y + 1, ev.z, 12, 0xffffff, { speed: 4, size: 0.4, life: 0.3 });
        break;
      case 'slam':
        P.ring(ev.x, ev.y, ev.z, 26, 0xffc070, { speed: 11, size: 0.7, life: 0.5 });
        this.dust.ring(ev.x, ev.y, ev.z, 20, 0xa09070, { speed: 8, size: 1.1, life: 0.7 });
        this.shakeAt(ev, 0.25);
        break;
      case 'enemy-shot':
        P.burst(ev.x, ev.y, ev.z, 14, 0xffb050, { speed: 5, size: 0.5, life: 0.3 });
        break;
      case 'telegraph':
        this.telegraphs.set(ev.id, { ...ev, born: this.time });
        break;
      case 'pickup': {
        const p = this.world.player;
        P.burst(p.x, p.y + 1, p.z, 8, 0x8affc8, { speed: 3, size: 0.35, life: 0.4 });
        break;
      }
      case 'spawn':
        for (let k = 0; k < 24; k++) P.emit(ev.x + (Math.random() - 0.5), ev.y + Math.random() * 2, ev.z + (Math.random() - 0.5), 0, 3 + Math.random() * 3, 0, 0xff5ae0, 0.5, 0.9);
        break;
      case 'wave':
        for (const rv of this.riftViews) this.particles.burst(rv.zone.x, rv.group.position.y + 4, rv.zone.z, 40, 0xff5ae0, { speed: 10, size: 0.8, life: 0.9 });
        break;
      case 'zone-wake':
      case 'zone-clear': {
        const rv = this.riftViews.find((r) => r.zone.id === ev.id);
        if (rv) {
          const y = rv.group.position.y + 4;
          P.burst(rv.zone.x, y, rv.zone.z, 60, ev.type === 'zone-clear' ? 0x6affa0 : 0xff5ae0, { speed: 12, size: 0.8, life: 0.9 });
        }
        break;
      }
      default:
    }
  }

  // The equipped (or previewed) arm weapon's glow colour: a forged design's, else the part's.
  armGlow() {
    const d = this.drawn?.arm;
    return d ? FORM.palette[d.form.glow] : PARTS[this.world.loadout.arm].color;
  }

  // One particle of an element's effect at `at` (see ELEMENT_FX).
  emitElement(element, at, scale = 1) {
    const [colors, rise, grav, size, life, jitter] = ELEMENT_FX[element];
    const j = () => (Math.random() - 0.5) * jitter;
    this.particles.emit(at.x + (Math.random() - 0.5) * 0.12, at.y + (Math.random() - 0.5) * 0.12, at.z + (Math.random() - 0.5) * 0.12,
      j(), rise + j(), j(), colors[Math.floor(Math.random() * colors.length)], size * scale * (0.7 + Math.random() * 0.6), life * (0.7 + Math.random() * 0.6), { grav, drag: element === 'elec' ? 6 : 1.2 });
  }

  // Chain mod: a jagged bolt between two viruses that flickers out.
  addArc(ev) {
    const color = ELEMENTS[ev.element]?.color ?? 0xbff4ff;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.frustumCulled = false;
    line.renderOrder = 5;
    this.scene.add(line);
    this.arcs.push({ line, ev, age: 0, life: 0.22 });
    this.flash(ev.x1, ev.y1, ev.z1, color, 2.2, 0.14);
  }

  updateArcs(dt) {
    for (const a of this.arcs) {
      a.age += dt;
      const pos = a.line.geometry.attributes.position;
      const { x0, y0, z0, x1, y1, z1 } = a.ev;
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        const wob = i === 0 || i === 9 ? 0 : 0.45;
        pos.setXYZ(i, x0 + (x1 - x0) * t + (Math.random() - 0.5) * wob, y0 + (y1 - y0) * t + (Math.random() - 0.5) * wob, z0 + (z1 - z0) * t + (Math.random() - 0.5) * wob);
      }
      pos.needsUpdate = true;
      a.line.material.opacity = Math.max(0, 1 - a.age / a.life);
    }
    for (const a of this.arcs.filter((x) => x.age >= x.life)) {
      this.scene.remove(a.line);
      a.line.geometry.dispose();
      a.line.material.dispose();
    }
    this.arcs = this.arcs.filter((x) => x.age < x.life);
  }

  // A brief glow pop (hit flashes).
  flash(x, y, z, color, size, life) {
    let f = this.flashes.find((x) => x.age >= x.life);
    if (!f) {
      f = { sprite: glowSprite(color, 0.01), age: 0, life };
      f.sprite.renderOrder = 4;
      this.scene.add(f.sprite);
      this.flashes.push(f);
    }
    f.sprite.material.color.setHex(color);
    f.sprite.position.set(x, y, z);
    f.age = 0;
    f.life = life;
    f.size = size;
  }

  updateFlashes(dt) {
    for (const f of this.flashes) {
      if (f.age >= f.life) {
        f.sprite.visible = false;
        continue;
      }
      f.age += dt;
      const k = Math.min(1, f.age / f.life);
      f.sprite.visible = true;
      f.sprite.scale.setScalar(f.size * (0.6 + 0.7 * k));
      f.sprite.material.opacity = 1 - k;
    }
  }

  // The lock-on reticle: pops onto a new target, spins, and turns red while the target winds up an attack.
  updateReticle(dt) {
    const soft = this.world.player.soft != null ? this.world.enemy(this.world.player.soft) : null;
    this.softMark.visible = !!soft?.alive && this.world.player.alive;
    if (this.softMark.visible) {
      this.softMark.position.set(soft.x, soft.y + soft.def.height * 0.5, soft.z);
      this.softMark.scale.setScalar(soft.def.radius * 1.9 + 0.4);
      this.softMark.material.rotation = 0.785; // turned 45 degrees: reads as a different mark from the lock
    }
    const t = this.world.lockTarget();
    const sp = this.reticle;
    if (!t) {
      this.reticleK = Math.max(0, this.reticleK - dt * 8);
      sp.material.opacity = this.reticleK;
      sp.visible = this.reticleK > 0;
      if (!sp.visible) this.reticleId = null;
      return;
    }
    if (t.id !== this.reticleId) {
      this.reticleId = t.id;
      this.reticleK = 0;
    }
    this.reticleK = Math.min(1, this.reticleK + dt * 6);
    const danger = t.state === 'windup';
    sp.visible = true;
    sp.position.set(t.x, t.y + t.def.height * 0.5, t.z);
    sp.scale.setScalar((t.def.radius * 2.4 + 0.6) * (1 + (1 - this.reticleK) * 1.5));
    sp.material.rotation += dt * (danger ? 5 : 1.6);
    sp.material.color.setHex(danger ? 0xff4a4a : 0xffd84a);
    sp.material.opacity = this.reticleK;
  }

  shakeAt(ev, amount) {
    const p = this.world.player;
    const d = Math.hypot(ev.x - p.x, ev.z - p.z);
    if (d < 25) this.cam.shake = Math.max(this.cam.shake, amount * (1 - d / 25));
  }

  // ------------------------------------------------------------------ per frame

  render(alpha, dt) {
    this.time += dt;
    const w = this.world;
    const p = w.player;
    const a = clamp(alpha, 0, 1);
    const px = this.prevPlayer.x + (p.x - this.prevPlayer.x) * a;
    const py = this.prevPlayer.y + (p.y - this.prevPlayer.y) * a;
    const pz = this.prevPlayer.z + (p.z - this.prevPlayer.z) * a;

    // Player. During hit-stop the pose holds still with the world.
    const frozen = w.hitstop > 0;
    const av = this.avatar;
    // The parts and forged designs to draw (the forge's preview stands in for its slot while editing).
    const loadout = { ...w.loadout };
    const designs = { arm: w.kit.armDesign ?? null, gun: w.kit.gunDesign ?? null };
    const pv = this.showcase ? this.preview : null;
    if (pv) {
      loadout[pv.slot] = pv.base;
      designs[pv.slot] = pv;
    }
    this.drawn = designs;
    const key = `${Object.values(loadout).join()}|${designKey(designs.arm)}|${designKey(designs.gun)}`;
    if (key !== this.loadoutKey) {
      this.loadoutKey = key;
      av.setLoadout(loadout, designs);
    }
    av.group.position.set(px, py, pz);
    av.group.rotation.y = p.yaw;
    const act = p.action;
    av.showcase = this.showcase > 0;
    const blink = p.iframes > 0 && p.dash <= 0 && !act && Math.floor(this.time * 18) % 2 === 0;
    av.setVisible(p.alive && !blink);
    av.update(p, this.lastAimPitch ?? 0, frozen ? dt * 0.05 : dt, frozen ? 0 : a * DT);
    this.updateLockCamera(px, py, pz, dt);
    this.updateCamera(px, py, pz, dt);
    av.group.updateMatrixWorld(true);
    // Saber trail: one ribbon per strike, gold for finishers and reactions.
    const swinging = act && ((act.kind === 'melee' && act.t >= 0) || act.kind === 'react' || (act.kind === 'chip' && act.name === 'findash'));
    if (swinging && !frozen && av.bladeEnds(this.tb, this.tt)) {
      if (act !== this.trailAction) {
        this.trail.cut();
        this.trailAction = act;
        const gold = act.kind === 'react' || act.def?.finisher;
        this.trail.setColor(gold ? FINISH_COLOR : act.kind === 'chip' ? CHIPS.findash.color : this.armGlow());
      }
      this.trail.push(this.tb, this.tt);
    }
    this.trail.update(frozen ? 0 : dt);
    // A forged weapon's element streams off the blade while it is out (and off the gun now and then).
    const armEl = this.drawn.arm?.element;
    if (ELEMENT_FX[armEl] && !frozen && av.bladeEnds(this.tb, this.tt)) {
      const n = swinging ? 3 : Math.random() < dt * 40 ? 1 : 0;
      for (let k = 0; k < n; k++) this.emitElement(armEl, this.tmp.lerpVectors(this.tb, this.tt, 0.25 + Math.random() * 0.75), 1);
    }
    // FinDash leaves fins of light behind.
    if (act?.kind === 'chip' && act.name === 'findash' && !frozen) {
      for (let k = 0; k < 3; k++) this.particles.emit(px + (Math.random() - 0.5) * 0.8, py + 0.6 + Math.random() * 0.9, pz + (Math.random() - 0.5) * 0.8, -p.vx * 0.15, 0.5, -p.vz * 0.15, 0x5af0ff, 0.5, 0.3);
    }
    const hand = av.gunMuzzle(this.tmp.clone());
    const gunEl = this.drawn.gun?.element;
    if (ELEMENT_FX[gunEl] && !frozen && p.alive && Math.random() < dt * (this.showcase ? 24 : 6)) this.emitElement(gunEl, hand, 0.7);
    // Hover legs: jets under the feet while airborne, a soft trail while gliding.
    if (p.alive && w.loadout.legs === 'hover' && !p.onGround && !frozen && Math.random() < (p.gliding ? 0.9 : 0.5)) {
      this.particles.emit(px + (Math.random() - 0.5) * 0.5, py - 0.05, pz + (Math.random() - 0.5) * 0.5, 0, -3 - Math.random() * 2, 0, PARTS.hover.color, 0.45, 0.3, { drag: 2 });
    }
    // Charge glow and particles spiralling into the gun.
    if (p.alive && p.charging) {
      const full = p.chargeFull;
      const pulse = 1 + Math.sin(this.time * (full ? 30 : 16)) * 0.15;
      this.chargeGlow.position.copy(hand);
      this.chargeGlow.scale.setScalar((full ? 1.6 : 0.6 + Math.min(1, p.charge / 1.25) * 0.8) * pulse);
      this.chargeGlow.material.color.setHex(full ? 0xff7ae8 : 0x6ae8ff);
      if (Math.random() < 0.7) {
        const ang = Math.random() * Math.PI * 2;
        const r = 0.9;
        const ox = Math.cos(ang) * r;
        const oy = (Math.random() - 0.5) * r;
        const oz = Math.sin(ang) * r;
        this.particles.emit(hand.x + ox, hand.y + oy, hand.z + oz, -ox * 4, -oy * 4, -oz * 4, full ? 0xff9af0 : 0x9af6ff, 0.25, 0.22, { drag: 0 });
      }
    } else this.chargeGlow.scale.setScalar(0.001);
    this.muzzleT = Math.max(0, this.muzzleT - dt);
    this.muzzle.position.copy(hand);
    this.muzzle.scale.setScalar(this.muzzleT > 0 ? this.muzzleSize * (0.6 + Math.random() * 0.5) : 0.001);
    // Footstep dust.
    if (p.alive && p.onGround && p.speed > 6 && Math.random() < dt * 14) {
      const sys = p.wading ? this.particles : this.dust;
      sys.emit(px + (Math.random() - 0.5) * 0.5, py + 0.1, pz + (Math.random() - 0.5) * 0.5, -p.vx * 0.1, 0.8, -p.vz * 0.1, p.wading ? 0x9ad8ff : 0xc8bc9a, 0.38, 0.4, { grow: 1.4, drag: 3 });
    }

    this.updateEnemies(dt);
    this.updateShots(alpha);
    this.updatePickups();
    this.updateHazards();
    this.updateTelegraphs();
    this.updateRifts(dt);
    this.updateReticle(dt);
    this.updateFlashes(dt);
    this.updateBeams(dt);
    this.updateArcs(dt);
    this.particles.update(dt);
    this.dust.update(dt);

    // Sun and shadows follow the player.
    this.sun.position.set(px + SUN_DIR.x * 120, py + SUN_DIR.y * 120, pz + SUN_DIR.z * 120);
    this.sun.target.position.set(px, py, pz);
    this.sky.position.copy(this.camera.position);
    this.water.position.x = px;
    this.water.position.z = pz;
    this.windTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
  }

  updateEnemies(dt) {
    const seen = new Set();
    for (const e of this.world.enemies) {
      seen.add(e.id);
      let v = this.enemyViews.get(e.id);
      if (!v) {
        v = makeEnemyModel(e.type, e.def);
        this.scene.add(v.root);
        this.enemyViews.set(e.id, v);
      }
      v.root.position.set(e.x, e.y, e.z);
      v.root.rotation.y = e.yaw;
      // Materialise, then pop when deleted.
      const grow = e.spawnT > 0 ? 1 - e.spawnT / 0.9 : 1;
      const shrink = e.alive ? 1 : Math.max(0.01, e.dying / 0.6);
      v.model.scale.setScalar(Math.max(0.01, grow * shrink));
      v.model.visible = e.spawnT <= 0 || Math.floor(this.time * 20) % 2 === 0;
      v.update(e, this.time, dt, this.camera);
      // Status effects from forged weapons, and a hologram ring under training dummies.
      if (e.alive && dt > 0) {
        const at = this.tmp.set(e.x + (Math.random() - 0.5) * e.def.radius * 1.4, e.y + Math.random() * e.def.height, e.z + (Math.random() - 0.5) * e.def.radius * 1.4);
        if (e.burn > 0 && Math.random() < dt * 30) this.emitElement('fire', at, 1.4);
        if (e.soak > 0 && Math.random() < dt * 14) this.emitElement('aqua', at.setY(e.y + e.def.height), 1.2);
        if ((this.stunned.get(e.id) ?? 0) > this.time && Math.random() < dt * 40) this.emitElement('elec', at.setY(e.y + e.def.height + 0.2), 1.3);
      }
      if (e.dummy && !v.dummyRing) {
        v.dummyRing = new THREE.Mesh(new THREE.RingGeometry(e.def.radius + 0.2, e.def.radius + 0.35, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x6ae8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
        v.dummyRing.position.y = 0.06 - (e.def.hover ?? 0);
        v.root.add(v.dummyRing);
      }
      if (v.dummyRing) v.dummyRing.material.opacity = 0.45 + 0.25 * Math.sin(this.time * 4 + e.id);
    }
    for (const [id, v] of this.enemyViews) {
      if (!seen.has(id)) {
        this.scene.remove(v.root);
        this.enemyViews.delete(id);
      }
    }
  }

  updateShots(alpha) {
    const seen = new Set();
    const lead = clamp(alpha, 0, 1) * DT;
    for (const s of this.world.shots) {
      seen.add(s.id);
      let v = this.shotViews.get(s.id);
      if (v && v.userData.look !== s.team + s.kind) {
        this.scene.remove(v); // a deflected cannonball changes sides
        this.dropShot(v);
        v = null;
      }
      if (!v) {
        v = this.makeShot(s);
        this.shotViews.set(s.id, v);
        this.scene.add(v);
      }
      v.position.set(s.x + s.vx * lead, s.y + s.vy * lead, s.z + s.vz * lead);
      if (s.kind === 'swordwave') {
        // The Wave mod's crescent skims the ground, kicking up dust and its element.
        v.rotation.y = Math.atan2(s.vx, s.vz);
        v.children[0].material.opacity = Math.min(0.8, s.life * 2);
        if (Math.random() < 0.6) this.dust.emit(v.position.x, v.position.y - 0.45, v.position.z, (Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2, 0xb8ad90, 0.6, 0.4, { grow: 1.2, drag: 3 });
        if (ELEMENT_FX[s.fx?.element]) this.emitElement(s.fx.element, v.position, 1.6);
        continue;
      }
      // Trail: a forged gun's shots trail its element.
      const color = s.team === 'enemy' ? 0xff8a30 : ELEMENTS[s.fx?.element]?.color ?? TRAIL_COLOR[s.kind] ?? 0x6ae8ff;
      const n = s.kind === 'pellet' ? (Math.random() < 0.4 ? 1 : 0) : s.kind === 'buster' || s.kind === 'needle' ? 1 : 3;
      for (let k = 0; k < n; k++) this.particles.emit(v.position.x, v.position.y, v.position.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, color, s.r * 2.2, 0.18, { drag: 4 });
      if (s.kind === 'bomb') v.children[1].material.opacity = Math.floor(this.time * 10) % 2 ? 1 : 0.45; // blinking fuse
    }
    for (const [id, v] of this.shotViews) {
      if (!seen.has(id)) {
        this.scene.remove(v);
        this.dropShot(v);
        this.shotViews.delete(id);
      }
    }
  }

  // Free what a shot view owns (its glow sprites' materials; spheres and their materials are shared).
  dropShot(v) {
    v.userData.own?.dispose();
    for (const c of v.children) if (c.isSprite) c.material.dispose();
  }

  // A shared sphere for a radius and a shared flat material for a colour (shots come and go all the time).
  sphere(r, color) {
    const key = Math.round(r * 1000);
    if (!this.sphereGeos.has(key)) this.sphereGeos.set(key, new THREE.SphereGeometry(r, 10, 8));
    if (!this.shotMats.has(color)) this.shotMats.set(color, new THREE.MeshBasicMaterial({ color }));
    return new THREE.Mesh(this.sphereGeos.get(key), this.shotMats.get(color));
  }

  makeShot(s) {
    const g = new THREE.Group();
    g.userData.look = s.team + s.kind;
    if (s.team === 'enemy' || s.kind === 'deflect') {
      // A cannonball: dark iron in an orange glow, or a cyan one once it has been batted back.
      g.add(this.sphere(s.r * 0.85, s.team === 'enemy' ? 0x3a1c10 : 0x10283a));
      g.add(glowSprite(s.team === 'enemy' ? 0xff7a20 : 0x6ae8ff, s.r * (s.team === 'enemy' ? 4 : 5.5)));
    } else if (s.kind === 'swordwave') {
      const color = ELEMENTS[s.fx?.element]?.color ?? this.armGlow();
      if (!this.shotMats.has(`wave${color}`)) {
        this.shotMats.set(`wave${color}`, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      }
      const m = new THREE.Mesh(this.waveGeo, this.shotMats.get(`wave${color}`).clone());
      m.renderOrder = 3;
      g.userData.own = m.material; // its own material (it fades on its own)
      g.add(m, glowSprite(color, 2.6));
    } else {
      const [core, base, size] = SHOT_LOOK[s.kind] ?? [0xffffff, 0x6ae8ff, 5];
      // A forged gun's shots glow in its glow colour.
      const d = this.world.kit.gunDesign;
      const glow = s.fx && d ? FORM.palette[d.form.glow] : base;
      g.add(this.sphere(s.r * (s.kind === 'bomb' ? 0.9 : 0.6), core));
      g.add(glowSprite(glow, s.r * size));
      if (s.kind === 'charge') g.add(glowSprite(0x9a8bff, s.r * 7.5));
      if (s.kind === 'cannon') g.add(glowSprite(0xff8a3a, s.r * 7));
    }
    return g;
  }

  // Railgun beams: a bright core and a wide glow between the muzzle and where the beam stopped, fading.
  addBeam(ev) {
    const from = new THREE.Vector3(ev.x0, ev.y0, ev.z0);
    const to = new THREE.Vector3(ev.x1, ev.y1, ev.z1);
    const len = from.distanceTo(to);
    const width = ev.level === 2 ? 0.2 : 0.11;
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const halo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: PARTS.railgun.color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(width * 0.4, width * 0.4, len);
    halo.scale.set(width * 1.6, width * 1.6, len);
    g.add(core, halo);
    g.position.copy(from);
    g.lookAt(to);
    this.scene.add(g);
    this.beams.push({ g, geo, age: 0, life: ev.level === 2 ? 0.35 : 0.22, width });
  }

  updateBeams(dt) {
    for (const b of this.beams) {
      b.age += dt;
      const k = 1 - b.age / b.life;
      for (const m of b.g.children) m.material.opacity = Math.max(0, k) * (m === b.g.children[0] ? 1 : 0.55);
      b.g.children[1].scale.x = b.g.children[1].scale.y = b.width * (1.6 + (1 - k) * 1.5);
    }
    for (const b of this.beams.filter((x) => x.age >= x.life)) {
      this.scene.remove(b.g);
      b.geo.dispose();
      for (const m of b.g.children) m.material.dispose();
    }
    this.beams = this.beams.filter((x) => x.age < x.life);
  }

  updatePickups() {
    const seen = new Set();
    for (const k of this.world.pickups) {
      seen.add(k.id);
      let v = this.pickupViews.get(k.id);
      if (!v) {
        v = new THREE.Group();
        v.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0x0a3a2a, emissive: 0x5affb0, emissiveIntensity: 1.3, flatShading: true })));
        v.add(glowSprite(0x5affb0, 0.9));
        this.pickupViews.set(k.id, v);
        this.scene.add(v);
      }
      v.position.set(k.x, k.y + Math.sin(this.time * 4 + k.id) * 0.08, k.z);
      v.children[0].rotation.y = this.time * 3 + k.id;
    }
    for (const [id, v] of this.pickupViews) {
      if (!seen.has(id)) {
        this.scene.remove(v);
        this.pickupViews.delete(id);
      }
    }
  }

  updateHazards() {
    const live = new Set();
    for (const h of this.world.hazards) {
      if (!this.hazardIds.has(h)) this.hazardIds.set(h, Symbol('ring'));
      const vid = this.hazardIds.get(h);
      live.add(vid);
      let v = this.hazardViews.get(vid);
      if (!v) {
        const mine = h.team === 'player';
        const ringMat = new THREE.MeshBasicMaterial({ color: mine ? 0x8af4ff : 0xffb040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const wallMat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { color: { value: new THREE.Color(mine ? 0x40c8ff : 0xff9a30) }, fade: { value: 1 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'varying vec2 vUv; uniform vec3 color; uniform float fade; void main(){ float a = pow(1.0 - vUv.y, 1.5) * fade * 1.6; gl_FragColor = vec4(color * a, a); }',
        });
        v = new THREE.Group();
        v.add(new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64).rotateX(-Math.PI / 2), ringMat));
        v.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.1, 48, 1, true).translate(0, 0.55, 0), wallMat));
        v.userData = { ringMat, wallMat };
        this.hazardViews.set(vid, v);
        this.scene.add(v);
      }
      v.position.set(h.x, h.y + 0.08, h.z);
      v.scale.set(h.r, 1, h.r);
      const fade = 1 - h.r / h.max;
      v.userData.ringMat.opacity = fade;
      v.userData.wallMat.uniforms.fade.value = fade;
    }
    for (const [vid, v] of this.hazardViews) {
      if (!live.has(vid)) {
        this.scene.remove(v);
        this.hazardViews.delete(vid);
      }
    }
  }

  // Red floor and laser markers for the attacks that are winding up.
  updateTelegraphs() {
    const T = this.world.terrain;
    for (const [id, tg] of this.telegraphs) {
      const e = this.world.enemies.find((x) => x.id === id);
      const active = e && e.alive && e.state === 'windup';
      if (!active) {
        if (tg.view) this.scene.remove(tg.view);
        this.telegraphs.delete(id);
        continue;
      }
      if (!tg.view) {
        const red = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const g = new THREE.Group();
        if (tg.kind === 'slam') {
          g.add(new THREE.Mesh(new THREE.RingGeometry(1.8, 2.3, 48).rotateX(-Math.PI / 2), red));
        } else if (tg.kind === 'dive') {
          const to = tg.to;
          const dx = to.x - tg.x;
          const dz = to.z - tg.z;
          const len = Math.hypot(dx, dz) + 4;
          const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len).rotateX(-Math.PI / 2).translate(0, 0, len / 2), red);
          strip.position.set(tg.x, T.ground(tg.x, tg.z) + 0.1, tg.z);
          strip.rotation.y = Math.atan2(dx, dz);
          const mark = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 32).rotateX(-Math.PI / 2), red);
          mark.position.set(to.x, T.ground(to.x, to.z) + 0.12, to.z);
          g.add(strip, mark);
          g.userData.world = true;
        } else if (tg.kind === 'aim') {
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, 0.5, 0).rotateX(Math.PI / 2), red);
          g.add(beam);
          g.userData.beam = beam;
        }
        tg.view = g;
        tg.red = red;
        this.scene.add(g);
      }
      const k = Math.min(1, (this.time - tg.born) / (tg.time || 0.8));
      tg.red.opacity = 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(this.time * 30));
      if (tg.kind === 'slam') {
        tg.view.position.set(e.x, T.ground(e.x, e.z) + 0.1, e.z);
        tg.view.scale.setScalar(0.6 + k * 0.6);
      } else if (tg.kind === 'aim') {
        const p = this.world.player;
        const from = new THREE.Vector3(e.x + Math.sin(e.yaw) * 1.1, e.y + 1.05, e.z + Math.cos(e.yaw) * 1.1);
        const to = new THREE.Vector3(p.x, p.y + 0.9, p.z);
        tg.view.position.copy(from);
        tg.view.lookAt(to);
        tg.view.userData.beam.scale.set(1, 1, from.distanceTo(to));
      }
    }
  }

  updateRifts(dt) {
    for (const r of this.riftViews) {
      const cleared = r.zone.state === 'cleared';
      const color = cleared ? 0x5aff9a : r.zone.state === 'active' ? 0xff3a7a : 0xff3ad8;
      r.ringMat.color.setHex(color);
      r.beamMat.uniforms.color.value.setHex(color);
      r.beamMat.uniforms.time.value = this.time;
      r.beamMat.uniforms.strength.value += ((cleared ? 0.25 : 1) - r.beamMat.uniforms.strength.value) * Math.min(1, dt * 2);
      r.crystalMat.emissive.setHex(color);
      r.crystal.rotation.y += dt * (cleared ? 0.4 : 1.6);
      r.crystal.position.y = 4 + Math.sin(this.time * 1.7 + r.zone.id) * 0.35;
      r.bits.rotation.y -= dt * (cleared ? 0.2 : 0.9);
    }
  }
}
