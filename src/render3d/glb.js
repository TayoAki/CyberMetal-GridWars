import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Players' own 3D characters (a .glb, such as a model made in Tripo), shared by the grid battler and the open
// world: reading the file, making its rig usable, and keeping it in the browser. Each game then sizes and
// animates the model its own way (src/render3d/models.js, src/world/avatar.js).
//
// Reading fixes what generated models get wrong: a broken auto-rig (Tripo's exports put every bone at the
// origin, with garbage bind matrices) is rebuilt from its skin weights, or failing that the model is shown
// unrigged; textures are cut to 1024 px; transmission is turned off and shiny metal toned down.
//
// The file is kept in IndexedDB (in memory where that is blocked) under one key both games read, so a
// character loaded in one game is there in the other on the same site. It is never uploaded anywhere.

export const MAX_FILE = 64 * 1024 * 1024;
const MAX_TEXTURE = 1024;

// ---------------------------------------------------------------- storage

const DB = 'cybermetal-gridwars';
const STORE = 'models';
let memory = null; // { name, bytes, size, added } where IndexedDB is unavailable

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

// Keep the player's model. Resolves to whether it was stored (false: kept for this visit only).
export async function saveCustom(rec) {
  memory = rec;
  try {
    await idb('readwrite', (s) => s.put(rec, 'custom'));
    return true;
  } catch {
    return false;
  }
}

// The player's model ({ name, bytes, size, added }), or null.
export async function readCustom() {
  if (memory) return memory;
  try {
    return (memory = (await idb('readonly', (s) => s.get('custom'))) ?? null);
  } catch {
    return null;
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

// ---------------------------------------------------------------- reading

let draco = null;
function gltfLoader() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Draco-compressed models need Google's decoder, fetched on first use.
  draco ??= new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  return loader;
}

// Read a .glb and make it usable. Resolves to { scene, rig, skinned, triangles }: rig is 'none' (no skin),
// 'ok', 'repaired' (rebuilt from the weights) or 'static' (shown unrigged). Throws an Error whose message
// says what is wrong in words a player can act on.
export async function readGlb(bytes) {
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
  let rig = 'none';
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
      if (rig === 'none') rig = 'ok';
      continue;
    }
    if (repairRig(skeleton, list) && list.every(rigWorks)) {
      rig = 'repaired';
      continue;
    }
    for (const m of list) unskin(m);
    rig = 'static';
  }
  scene.updateMatrixWorld(true);

  // Materials and textures.
  const textures = new Set();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [o.material].flat()) {
      if (!m) continue;
      if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.35);
      if ('roughness' in m) m.roughness = Math.max(m.roughness, 0.35);
      if ('transmission' in m) m.transmission = 0;
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
    }
  });
  for (const t of textures) shrinkTexture(t);
  return { scene, rig, skinned: skins.size > 0 && rig !== 'static', triangles: Math.round(triangles) };
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

// A model's box in its rest pose (skinned meshes as skinned).
export function modelBox(root) {
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
