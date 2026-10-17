import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { heightOf, screenToZ } from './space.js';
import { mechBytes } from './mechAsset.js';

// Player models: a navi can be a real 3D model instead of AXIOM's sprite (CUSTOMIZE > 3D MODEL): the built-in
// MECH, or any .glb the player brings, such as a character made in Tripo. Models are only looks: the battle
// plays exactly the same.
//
// Loading prepares a model for the battle: a broken auto-rig (Tripo's exports put every bone at the origin) is
// rebuilt from its skin weights, or failing that the model is shown unrigged; textures are cut to 1024 px;
// shiny metal is toned down (there is no environment to reflect); and the model is scaled to AXIOM's height
// with its feet on the floor. Rigged models (Mixamo bone names) swing their arms; every model is animated as
// a whole from the battle state (recoil, lunges, hits), and chips that make a blade or a cannon add one.
//
// The player's own .glb is kept in IndexedDB (in memory where that is unavailable), never uploaded anywhere.

const HEIGHT = 55; // world units: AXIOM's sprite stands about 48 px tall
const MAX_DEPTH = 46; // a model deeper than this (or, unrigged, wider than MAX_SPAN) is scaled down to fit
const MAX_SPAN = 70; // a rigged model's arms come down, so only an unrigged one's span counts
const MAX_TEXTURE = 1024;
export const MAX_FILE = 64 * 1024 * 1024;
const FACING_YAW = 0.96; // facing right, turned 35 degrees toward the camera so the face shows

// ---------------------------------------------------------------- storage

const DB = 'cybermetal-gridwars';
const STORE = 'models';
let memory = null; // { name, bytes } where IndexedDB is unavailable

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function saveCustom(rec) {
  memory = rec;
  try {
    await idb('readwrite', (s) => s.put(rec, 'custom'));
    return true;
  } catch {
    return false; // kept for this visit only
  }
}

async function readCustom() {
  if (memory) return memory;
  try {
    return (memory = (await idb('readonly', (s) => s.get('custom'))) ?? null);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- loading

let draco = null;
function gltfLoader() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Draco-compressed models need Google's decoder, fetched on first use.
  draco ??= new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  return loader;
}

// Parse and prepare a .glb. Returns a template that actors are cloned from.
export async function prepareModel(bytes, name = 'model') {
  if (bytes.byteLength > MAX_FILE) throw new Error(`too big (${Math.round(bytes.byteLength / 1048576)} MB; the limit is ${MAX_FILE / 1048576} MB)`);
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (String.fromCharCode(...head) !== 'glTF') throw new Error('not a .glb file (export your model as GLB)');
  let gltf;
  try {
    gltf = await gltfLoader().parseAsync(bytes, '');
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/KTX2|basisu/i.test(msg)) throw new Error('uses KTX2 textures, which are not supported: export with PNG or JPEG textures');
    throw new Error(`could not read it (${msg.slice(0, 80)})`);
  }
  const scene = gltf.scene ?? gltf.scenes?.[0];
  if (!scene) throw new Error('the file has no scene');
  scene.updateMatrixWorld(true);

  let meshes = 0;
  let triangles = 0;
  const report = { rig: 'none' };
  const skins = new Map(); // skeleton -> meshes
  scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (o.isSkinnedMesh) {
      if (!skins.has(o.skeleton)) skins.set(o.skeleton, []);
      skins.get(o.skeleton).push(o);
    }
  });
  if (!meshes) throw new Error('the file has no meshes');

  // Rigs: keep a working one, rebuild a broken one from its weights, or show the model unrigged.
  for (const [skeleton, list] of skins) {
    if (list.every(rigWorks)) {
      report.rig = report.rig === 'none' ? 'ok' : report.rig;
      continue;
    }
    if (repairRig(skeleton, list) && list.every(rigWorks)) {
      report.rig = 'repaired';
      continue;
    }
    for (const m of list) unskin(m);
    report.rig = 'static';
  }
  scene.updateMatrixWorld(true);

  // Materials and textures.
  const textures = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // posed skins move outside their bounds
    for (const m of [o.material].flat()) {
      if (!m) continue;
      if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.35);
      if ('roughness' in m) m.roughness = Math.max(m.roughness, 0.35);
      if ('transmission' in m) m.transmission = 0;
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  for (const t of textures) shrinkTexture(t);

  // Size: AXIOM's height, feet on the floor, centred over the panel.
  const skinned = skins.size > 0 && report.rig !== 'static';
  const box = modelBox(scene);
  const size = box.getSize(new THREE.Vector3());
  if (!(size.y > 0) || ![size.x, size.y, size.z].every(Number.isFinite)) throw new Error('the model has no size');
  const scale = Math.min(HEIGHT / size.y, MAX_DEPTH / Math.max(size.z, 1e-6), skinned ? Infinity : MAX_SPAN / Math.max(size.x, 1e-6));
  const holder = new THREE.Group();
  holder.add(scene);
  holder.position.set(-((box.min.x + box.max.x) / 2), -box.min.y, -((box.min.z + box.max.z) / 2));
  const fit = new THREE.Group();
  fit.scale.setScalar(scale);
  fit.add(holder);
  fit.updateMatrixWorld(true);
  return { root: fit, scale, height: size.y * scale, name, rig: report.rig, triangles: Math.round(triangles), skinned };
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// The model's box in its rest pose (skinned meshes as skinned).
function modelBox(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let b;
    if (o.isSkinnedMesh) {
      o.computeBoundingBox();
      b = o.boundingBox.clone();
    } else {
      o.geometry.computeBoundingBox();
      b = o.geometry.boundingBox.clone();
    }
    box.union(b.applyMatrix4(o.matrixWorld));
  });
  return box;
}

// A rig works when skinning the rest pose leaves the mesh about where its geometry is.
function rigWorks(mesh) {
  const g = mesh.geometry;
  if (!g.attributes.skinIndex || !g.attributes.skinWeight) return false;
  if (!mesh.skeleton.boneInverses.every((m) => m.elements.every((x) => Number.isFinite(x) && Math.abs(x) < 1e6))) return false;
  mesh.updateMatrixWorld(true);
  g.computeBoundingBox();
  try {
    mesh.computeBoundingBox();
  } catch {
    return false;
  }
  const gs = g.boundingBox.getSize(new THREE.Vector3());
  const ss = mesh.boundingBox.getSize(new THREE.Vector3());
  if (![ss.x, ss.y, ss.z].every(Number.isFinite)) return false;
  const gd = gs.length();
  const sd = ss.length();
  return sd > gd * 0.5 && sd < gd * 2 && mesh.boundingBox.getCenter(_v).distanceTo(g.boundingBox.getCenter(_w)) < gd * 0.5;
}

// Rebuild a skeleton from its skin weights (the same method as tools/repair_glb.py): a joint sits where its
// bone's influence blends into its parent's, so it goes at the centroid of the vertices weighted to both.
// The rest pose becomes pure translations, with every bone's frame lined up with the model's.
function repairRig(skeleton, meshes) {
  const bones = skeleton.bones;
  const n = bones.length;
  const parent = bones.map((b) => bones.indexOf(b.parent));
  const T = [0.2, 0.1, 0.03];
  const sums = bones.map(() => T.map(() => [0, 0, 0, 0]));
  const roots = bones.map(() => [0, 0, 0, 0]);
  const p = new THREE.Vector3();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    if (!si || !sw) return false;
    for (let v = 0; v < pos.count; v++) {
      p.fromBufferAttribute(pos, v).applyMatrix4(mesh.bindMatrix);
      for (let a = 0; a < 4; a++) {
        const ia = si.getComponent(v, a);
        const wa = sw.getComponent(v, a);
        if (!(wa > 0) || ia >= n) continue;
        if (parent[ia] < 0) {
          if (wa > 0.35) add(roots[ia], p);
          continue;
        }
        for (let b = 0; b < 4; b++) {
          if (si.getComponent(v, b) !== parent[ia]) continue;
          const wb = sw.getComponent(v, b);
          T.forEach((t, k) => {
            if (wa > t && wb > t) add(sums[ia][k], p);
          });
        }
      }
    }
  }
  const world = bones.map((_, i) => {
    if (parent[i] < 0) return mean(roots[i]);
    for (const s of sums[i]) if (s[3]) return mean(s);
    return null;
  });
  // Bones with no blend zone (finger tips, end bones) sit on their parent.
  for (let pass = 0; pass < n; pass++) for (let i = 0; i < n; i++) if (!world[i] && parent[i] >= 0 && world[parent[i]]) world[i] = world[parent[i]].clone();
  if (world.some((w) => !w)) return false;

  // Rest pose: each bone's world frame is a pure translation to its joint.
  const inv = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const b = bones[i];
    if (parent[i] >= 0) {
      b.position.copy(world[i]).sub(world[parent[i]]);
      b.quaternion.identity();
      b.scale.set(1, 1, 1);
    } else {
      b.parent?.updateWorldMatrix(true, false);
      inv.copy(b.parent ? b.parent.matrixWorld : m.identity()).invert();
      inv.multiply(m.makeTranslation(world[i].x, world[i].y, world[i].z)).decompose(b.position, b.quaternion, b.scale);
    }
  }
  for (const b of bones) b.updateWorldMatrix(true, true);
  skeleton.boneInverses = bones.map((b) => b.matrixWorld.clone().invert());
  return true;

  function add(s, v) {
    s[0] += v.x;
    s[1] += v.y;
    s[2] += v.z;
    s[3]++;
  }
  function mean(s) {
    return s[3] ? new THREE.Vector3(s[0] / s[3], s[1] / s[3], s[2] / s[3]) : null;
  }
}

// Show a skinned mesh unrigged, as modelled.
function unskin(mesh) {
  const m = new THREE.Mesh(mesh.geometry, mesh.material);
  m.name = mesh.name;
  m.position.copy(mesh.position);
  m.quaternion.copy(mesh.quaternion);
  m.scale.copy(mesh.scale);
  mesh.parent.add(m);
  mesh.parent.remove(mesh);
}

// Cut a texture's image to MAX_TEXTURE (a 4K texture is 64 MB of GPU memory).
function shrinkTexture(t) {
  const img = t.image;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  if (Math.max(w, h) <= MAX_TEXTURE) return;
  const k = MAX_TEXTURE / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  t.image = c;
  t.needsUpdate = true;
}

// ---------------------------------------------------------------- the models a look can pick

const templates = new Map(); // 'mech' | 'custom' -> { state: 'loading' | 'ready' | 'error', template, error, name, version }

// The template for a look's model, or null while it loads (or if it can't). Starts loading on first ask.
export function modelTemplate(kind) {
  if (kind !== 'mech' && kind !== 'custom') return null;
  let entry = templates.get(kind);
  if (!entry) {
    entry = { state: 'loading', template: null, error: null, name: kind === 'mech' ? 'MECH' : null, version: 0 };
    templates.set(kind, entry);
    load(kind, entry);
  }
  return entry.state === 'ready' ? entry.template : null;
}

// What the CUSTOMIZE screen shows about a model: { state, name, error, rig, triangles }.
export function modelStatus(kind) {
  modelTemplate(kind);
  const e = templates.get(kind);
  return e ? { state: e.state, name: e.name, error: e.error, rig: e.template?.rig, triangles: e.template?.triangles, version: e.version } : null;
}

async function load(kind, entry) {
  try {
    let bytes;
    if (kind === 'mech') bytes = await mechBytes();
    else {
      const rec = await readCustom();
      if (!rec) throw new Error('no model loaded yet');
      bytes = rec.bytes;
      entry.name = rec.name;
    }
    entry.template = await prepareModel(bytes, entry.name);
    entry.state = 'ready';
  } catch (e) {
    entry.state = 'error';
    entry.error = String(e?.message ?? e);
  }
}

// A file name as a model name: 'blue_robotic_mecha_3d_model.glb' -> 'blue robotic mecha'.
export function modelName(file) {
  const base = String(file ?? '')
    .replace(/\.glb$/i, '')
    .replace(/[_\s-]+/g, ' ')
    .replace(/\s*\b3d model\b\s*$/i, '')
    .trim();
  return base.slice(0, 28) || 'model';
}

// Take a .glb the player picked or dropped: prepare it, keep it, and make it the custom model.
// Resolves to { ok, name, error, stored }.
export async function importModel(file) {
  const name = modelName(file.name);
  try {
    if (file.size > MAX_FILE) throw new Error(`too big (${Math.round(file.size / 1048576)} MB; the limit is ${MAX_FILE / 1048576} MB)`);
    const bytes = await file.arrayBuffer();
    const template = await prepareModel(bytes, name);
    const stored = await saveCustom({ name, bytes, size: bytes.byteLength, added: Date.now() });
    const old = templates.get('custom');
    templates.set('custom', { state: 'ready', template, error: null, name, version: (old?.version ?? 0) + 1 });
    retire(old?.template);
    return { ok: true, name, stored, rig: template.rig };
  } catch (e) {
    return { ok: false, name, error: String(e?.message ?? e) };
  }
}

// Free a replaced template's GPU resources once its actors are gone.
function retire(template) {
  if (!template) return;
  battleActors.delete(template);
  for (const a of actors) {
    if (a.template !== template) continue;
    a.root.removeFromParent();
    actors.delete(a);
  }
  template.root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    for (const m of [o.material].flat()) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      m.dispose();
    }
  });
}

// ---------------------------------------------------------------- actors

const actors = new Set();
const battleActors = new Map(); // template -> the actor battles use

// The model standing in for `e` in a battle, or null for its sprite (summons, enemies, no model, still
// loading).
export function actorFor(e, info) {
  if (info.summon || e.kind !== 'player') return null;
  const look = e.data?.look;
  const template = modelTemplate(look?.model);
  if (!template) return null;
  let a = battleActors.get(template);
  if (!a) battleActors.set(template, (a = new ModelActor(template)));
  a.turn = look.turn ?? 0;
  return a;
}

const ARM_DOWN = 1.15; // radians below the shoulder
const E = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const UP = new THREE.Vector3(0, 1, 0);

export class ModelActor {
  constructor(template) {
    this.template = template;
    this.height = template.height;
    this.turn = 0;
    // root (feet) > face (facing and twists) > tilt (leans, about the hips) > turn (the look's turn) > model
    this.root = new THREE.Group();
    this.face = new THREE.Group();
    this.tilt = new THREE.Group();
    this.spin = new THREE.Group();
    this.tilt.position.y = this.height * 0.45;
    this.spin.position.y = -this.height * 0.45;
    this.model = template.skinned ? cloneRig(template.root) : template.root.clone(true);
    this.root.add(this.face);
    this.face.add(this.tilt);
    this.tilt.add(this.spin);
    this.spin.add(this.model);
    // Own materials, so flashes and fades touch only this actor.
    this.materials = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map((m) => this.own(m)) : this.own(o.material);
    });
    this.findBones();
    this.makeProps();
    this.state = '';
    this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    actors.add(this);
  }

  own(m) {
    const c = m.clone();
    c.userData.baseEmissive = c.emissive ? c.emissive.clone() : null;
    c.userData.baseIntensity = c.emissiveIntensity ?? 1;
    c.userData.baseOpacity = c.opacity;
    c.userData.baseTransparent = c.transparent;
    this.materials.push(c);
    return c;
  }

  // Mixamo-named bones (any prefix) of a rig whose rest frames line up with the model (as rebuilt ones do).
  findBones() {
    this.bones = null;
    if (!this.template.skinned) return;
    const want = ['Hips', 'Spine', 'Spine1', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];
    const found = {};
    this.model.traverse((o) => {
      if (!o.isBone) return;
      const short = o.name.replace(/^.*[:_]/, '').replace(/^mixamorig/, '');
      if (want.includes(short) && !found[short]) found[short] = o;
    });
    if (!found.LeftArm || !found.RightArm || !found.LeftForeArm || !found.RightForeArm) return;
    const aligned = Object.values(found).every((b) => Math.abs(b.quaternion.w) > 0.995);
    if (!aligned) return;
    this.bones = found;
    // Each arm's rest direction (shoulder to elbow), in its parent's frame.
    this.rest = {
      left: found.LeftForeArm.position.clone().normalize(),
      right: found.RightForeArm.position.clone().normalize(),
      rightHand: (found.RightHand ?? found.RightForeArm).position.clone().normalize(),
    };
    for (const b of Object.values(found)) b.userData.rest = b.quaternion.clone();
  }

  // Chip props: an arm blade and an arm cannon, on the right hand (or beside the body when unrigged).
  makeProps() {
    const s = 1 / this.template.scale;
    const glow = new THREE.MeshLambertMaterial({ color: '#bff4ff', emissive: '#7ae8ff', emissiveIntensity: 1.4 });
    const metal = new THREE.MeshLambertMaterial({ color: '#5a6a8a' });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 26), glow);
    blade.position.z = 13;
    const cannon = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 15, 12).rotateX(Math.PI / 2), metal);
    barrel.position.z = 7;
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1, 12).rotateX(Math.PI / 2), glow);
    muzzle.position.z = 14.6;
    cannon.add(barrel, muzzle);
    this.props = { blade: new THREE.Group(), cannon: new THREE.Group() };
    this.props.blade.add(blade);
    this.props.cannon.add(cannon);
    const hand = this.bones?.RightHand ?? this.bones?.RightForeArm;
    for (const p of Object.values(this.props)) {
      p.visible = false;
      p.traverse((o) => o.isMesh && (o.castShadow = true));
      if (hand) {
        // Along the forearm, in the hand bone's units.
        p.scale.setScalar(s);
        p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.rest.rightHand);
        hand.add(p);
      } else {
        // Beside the body: out in front of the right side at chest height.
        p.position.set(-this.height * 0.22, this.height * 0.08, this.height * 0.12);
        this.tilt.add(p);
      }
    }
  }

  // Stand where the battle has the body this frame. info: from Stage.capture (feet on screen at x, floor;
  // drawn at y, lifted by jumps); e: the entity.
  place(stage, info, e, t) {
    if (this.root.parent !== stage.scene) stage.scene.add(this.root);
    this.root.visible = true;
    const lift = heightOf(info.floor - (info.y ?? info.floor));
    this.root.position.set(info.x, lift, screenToZ(info.floor) - 3);
    this.pose(e, t, info);
  }

  hide() {
    this.root.visible = false;
  }

  // Pose from the entity's animation: whole-body motion, arms when rigged, props, and material effects.
  pose(e, t, info = {}) {
    const f = (e.facing ?? 1) < 0 ? -1 : 1;
    const anim = e.anim ?? 'idle';
    const k = e.animT ?? 0;
    const H = this.height;
    let dx = 0;
    let dy = 0;
    let lean = 0;
    let twist = 0;
    let squash = 1;
    let spinY = 0;
    let glow = null;
    let prop = null;
    let aim = null; // the right arm's direction in the model's frame, when rigged
    let guard = false;
    const decay = (n) => Math.max(0, 1 - k / n);
    switch (anim) {
      case 'shoot':
        lean = -0.1 * decay(6);
        aim = E(-0.05, 0.02, 1);
        break;
      case 'charged':
        lean = -0.22 * decay(10);
        dx = -3 * decay(10);
        aim = E(-0.05, 0.02, 1);
        break;
      case 'cannon':
        prop = 'cannon';
        aim = E(-0.08, 0.02, 1);
        lean = k < 8 ? 0.06 : -0.24 * Math.max(0, 1 - (k - 8) / 10);
        dx = k < 8 ? 0 : -3 * Math.max(0, 1 - (k - 8) / 10);
        break;
      case 'sword':
      case 'swing': {
        prop = 'blade';
        const s = Math.min(1, k / 10);
        twist = -0.5 + 1.3 * s;
        lean = 0.18 * Math.sin(s * Math.PI);
        dx = 7 * Math.sin(s * Math.PI);
        aim = E(-0.3 + 0.9 * s, 0.55 - 1.0 * s, 0.75);
        break;
      }
      case 'hammer':
        lean = k < 12 ? -0.18 : 0.32 * decay(26);
        dy = k < 12 ? 3 : 0;
        aim = k < 12 ? E(-0.1, 1, 0.15) : E(-0.1, -0.6, 0.8);
        break;
      case 'punch':
        dx = 6 * Math.sin(Math.min(1, k / 8) * Math.PI);
        lean = 0.2 * Math.sin(Math.min(1, k / 8) * Math.PI);
        aim = E(0, 0.05, 1);
        break;
      case 'throw':
        twist = k < 9 ? -0.45 : 0.35 * decay(20);
        aim = k < 9 ? E(-0.4, 0.6, -0.6) : E(0, 0.4, 1);
        break;
      case 'guard':
        lean = -0.08;
        squash = 0.96;
        guard = true;
        break;
      case 'point':
        lean = 0.08;
        aim = E(0, 0.15, 1);
        break;
      case 'recover':
        dy = 2 + Math.sin(k / 4);
        glow = ['#6aff8a', 0.35 + 0.25 * Math.sin(k / 3)];
        break;
      case 'dash':
        lean = 0.42;
        dx = 4;
        break;
      case 'burner':
        spinY = (k / 4) % (Math.PI * 2);
        glow = ['#ff8a3a', 0.4];
        break;
      case 'hurt':
        lean = -0.35 * decay(14);
        dx = -4 * decay(14);
        break;
      case 'delete':
        squash = Math.max(0.05, 1 - k / 40);
        dy = -k * 0.2;
        glow = ['#ffffff', Math.min(1, k / 10)];
        break;
      case 'summon':
        squash = Math.max(0.05, 1 - k / 14);
        glow = ['#bff4ff', Math.min(1, k / 6)];
        break;
      case 'move':
        if (k < 4) {
          squash = 0.4 + 0.15 * k;
          glow = ['#bff4ff', 0.8 - 0.2 * k];
        }
        break;
      default:
        dy = 0.6 * Math.sin(t / 14);
        lean = 0.025 * Math.sin(t / 23);
        break;
    }
    const charge = anim === 'hurt' || anim === 'delete' ? 0 : (e.data?.charge ?? 0);
    if (charge > 0 && !glow) glow = [charge >= 2 ? '#ff6ae0' : '#4ab0ff', 0.18 + 0.12 * Math.sin(t / 2)];
    if (info.flash) glow = ['#ffffff', 0.85];

    this.face.rotation.y = f * FACING_YAW + twist * f;
    this.face.position.set(dx * f, dy, 0);
    this.tilt.rotation.set(lean, 0, 0);
    this.tilt.scale.set(1, squash, 1);
    this.spin.rotation.y = (this.turn * Math.PI) / 2 + spinY;
    for (const [name, p] of Object.entries(this.props)) p.visible = name === prop;
    this.poseArms(t, aim, guard, anim);
    this.paint(glow, info.alpha ?? 1, info.reveal);
  }

  poseArms(t, aim, guard, anim) {
    const b = this.bones;
    if (!b) return;
    for (const bone of Object.values(b)) bone.quaternion.copy(bone.userData.rest);
    const sway = anim === 'idle' || !anim ? 0.05 * Math.sin(t / 20) : 0;
    const down = (side) => E(side * Math.cos(ARM_DOWN) * 0.55, -Math.sin(ARM_DOWN), 0.12 + sway * side);
    b.LeftArm.quaternion.setFromUnitVectors(this.rest.left, guard ? E(0.25, 0.35, 0.9) : down(1));
    b.RightArm.quaternion.setFromUnitVectors(this.rest.right, guard ? E(-0.25, 0.4, 0.9) : (aim ?? down(-1)));
    // Elbows bend forward a little at rest.
    if (!aim && !guard) {
      b.LeftForeArm.quaternion.setFromAxisAngle(UP, -0.3);
      b.RightForeArm.quaternion.setFromAxisAngle(UP, 0.3);
    }
  }

  // Material effects: a glow (flash, heal, charge), see-through, and the clip that materialises the body.
  paint(glow, alpha, reveal) {
    const ghost = alpha < 0.95;
    const clip = reveal !== undefined;
    const key = `${ghost ? Math.round(alpha * 10) : 'x'}|${clip}`;
    if (clip) this.clip.constant = this.root.position.y + heightOf(reveal);
    for (const m of this.materials) {
      if (m.emissive) {
        if (glow) {
          m.emissive.set(glow[0]);
          m.emissiveIntensity = glow[1];
        } else if (m.userData.baseEmissive) {
          m.emissive.copy(m.userData.baseEmissive);
          m.emissiveIntensity = m.userData.baseIntensity;
        }
      }
      if (key === this.state) continue;
      m.transparent = ghost || m.userData.baseTransparent;
      m.opacity = ghost ? alpha * m.userData.baseOpacity : m.userData.baseOpacity;
      m.depthWrite = !ghost;
      m.clippingPlanes = clip ? [this.clip] : null;
      m.clipShadows = clip;
      m.needsUpdate = true;
    }
    this.state = key;
  }
}

// Hide the actors that weren't placed this frame (the 2D view skipped drawing the body: blinking, gone).
export function hideOthers(placed) {
  for (const a of actors) if (!placed.some((p) => p.actor === a) && a.root.parent && !a.preview) a.hide();
}

// ---------------------------------------------------------------- the CUSTOMIZE preview

let preview = null;

// Draw the look's model turning on a panel inside `box` (240x160 screen coordinates), posed as `pose`
// ({ anim, animT }). Returns false when there is nothing to draw yet (still loading, failed).
export function drawPreview(layer, look, pose, box, t) {
  const template = modelTemplate(look.model);
  if (!template || !layer) return false;
  preview ??= makePreview();
  if (preview.template !== template) {
    preview.actor?.root.removeFromParent();
    if (preview.actor) actors.delete(preview.actor);
    preview.actor = new ModelActor(template);
    preview.actor.preview = true;
    preview.scene.add(preview.actor.root);
    preview.template = template;
  }
  const a = preview.actor;
  a.turn = look.turn ?? 0;
  a.root.position.set(0, 0, 0);
  a.root.visible = true;
  a.pose({ anim: pose.anim, animT: pose.animT, facing: 1, data: {} }, t, {});
  a.face.rotation.y += Math.sin(t / 90) * 0.5; // a slow look around
  const cam = preview.camera;
  cam.aspect = box.w / box.h;
  const h = template.height;
  cam.position.set(0, h * 0.62, h * 2.6);
  cam.lookAt(0, h * 0.45, 0);
  cam.updateProjectionMatrix();
  layer.render(preview.scene, cam, box);
  return true;
}

function makePreview() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a1028');
  scene.add(new THREE.HemisphereLight('#f0f4ff', '#40486a', 2));
  const key = new THREE.DirectionalLight('#fff6ea', 2.6);
  key.position.set(-60, 120, 110);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 80, bottom: -20, near: 10, far: 400 });
  key.shadow.normalBias = 0.4;
  const rim = new THREE.DirectionalLight('#86dcff', 1.6);
  rim.position.set(80, 60, -120);
  scene.add(key, rim);
  // A red battle panel to stand on.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(46, 5, 34), new THREE.MeshLambertMaterial({ color: '#e05454' }));
  panel.position.y = -2.5;
  panel.receiveShadow = true;
  const inner = new THREE.Mesh(new THREE.BoxGeometry(36, 0.4, 24), new THREE.MeshLambertMaterial({ color: '#ee7070' }));
  inner.position.y = 0.2;
  inner.receiveShadow = true;
  scene.add(panel, inner);
  return { scene, camera: new THREE.PerspectiveCamera(30, 1, 5, 1000), actor: null, template: null };
}
