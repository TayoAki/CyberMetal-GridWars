import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadAvatar } from '../src/world/avatar.js';

// The open world's body: the built-in mech or the player's own .glb (garage > BODY). A rigged body poses its
// limbs; one without a usable rig moves as one piece, with stand-in joints for its parts.

globalThis.self ??= globalThis; // the glTF loader looks for it (Node can't decode the texture: it goes on)
async function quietly(fn) {
  const { error, warn } = console;
  console.error = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { error, warn });
  }
}

const mech = () => {
  const b = readFileSync(new URL('../assets/mecha.glb', import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// Edit a GLB's JSON and binary chunks and pack it again.
function rewriteGlb(buf, edit) {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  const bin = new Uint8Array(buf.slice(20 + jsonLen + 8, 20 + jsonLen + 8 + binLen));
  edit(json, bin);
  let js = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(js.length / 4) * 4).fill(0x20);
  padded.set(js);
  js = padded;
  const out = new ArrayBuffer(28 + js.length + bin.length);
  const o = new DataView(out);
  o.setUint32(0, 0x46546c67, true);
  o.setUint32(4, 2, true);
  o.setUint32(8, out.byteLength, true);
  o.setUint32(12, js.length, true);
  o.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, js.length).set(js);
  o.setUint32(20 + js.length, bin.length, true);
  o.setUint32(24 + js.length, 0x004e4942, true);
  new Uint8Array(out, 28 + js.length, bin.length).set(bin);
  return out;
}

// Tripo's auto-rig as it comes: every bone at the origin, garbage inverse bind matrices.
const brokenRig = () =>
  rewriteGlb(mech(), (json, bin) => {
    const skin = json.skins[0];
    for (const j of skin.joints) for (const k of ['translation', 'rotation', 'scale']) delete json.nodes[j][k];
    const acc = json.accessors[skin.inverseBindMatrices];
    const at = (json.bufferViews[acc.bufferView].byteOffset ?? 0) + (acc.byteOffset ?? 0);
    new Float32Array(bin.buffer, at, acc.count * 16).fill(1e37);
  });

// A model exported without a rig.
const unrigged = () =>
  rewriteGlb(mech(), (json) => {
    delete json.skins;
    for (const n of json.nodes) delete n.skin;
    for (const m of json.meshes) for (const p of m.primitives) {
      delete p.attributes.JOINTS_0;
      delete p.attributes.WEIGHTS_0;
    }
  });

const LOADOUT = { arm: 'saber', gun: 'buster', legs: 'hover', core: 'standard' };
const player = (o = {}) => ({ speed: 0, onGround: true, dash: 0, action: null, charging: false, aimHold: 0, vy: 0, gliding: false, ...o });

// Run the body through standing, running, a dash, a jump and a hit; every transform stays finite.
function exercise(av) {
  av.setLoadout(LOADOUT);
  const frames = [player(), player({ speed: 9.5 }), player({ speed: 9.5, dash: 0.2 }), player({ onGround: false, vy: 3 }), player()];
  for (const [i, p] of frames.entries()) {
    if (i === 4) av.onHurt();
    for (let k = 0; k < 20; k++) av.update(p, 0.1, 1 / 60);
  }
  av.group.updateMatrixWorld(true);
  let finite = true;
  av.group.traverse((o) => {
    if (!o.matrixWorld.elements.every(Number.isFinite)) finite = false;
  });
  return finite;
}

const height = (av) => {
  av.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  av.group.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position || o.geometry.attributes.position.count < 1000) return; // the body, not its parts
    if (o.isSkinnedMesh) {
      o.computeBoundingBox();
      box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
    } else {
      o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    }
  });
  return box;
};

test('the built-in mech and a broken Tripo auto-rig both come out rigged, mech-sized, and pose cleanly', async () => {
  for (const [label, bytes, rig] of [['mech', mech(), 'ok'], ['broken rig', brokenRig(), 'repaired']]) {
    const av = await quietly(() => loadAvatar(bytes));
    assert.equal(av.rig, rig, label);
    assert.equal(av.rigged, true, `${label}: the limbs pose`);
    const box = height(av);
    assert.ok(Math.abs(box.max.y - box.min.y - 1.78) < 0.02 && Math.abs(box.min.y) < 0.02, `${label}: 1.78 m, feet on the ground`);
    assert.ok(av.gear.arm === null && exercise(av), `${label}: poses stay finite`);
    assert.ok(av.gear.arm?.obj && av.gear.gun?.obj, `${label}: the weapon and gun hang on the hands`);
  }
});

test('a model without a rig moves as one piece, its parts on stand-in joints, and a turn faces it round', async () => {
  const av = await quietly(() => loadAvatar(unrigged()));
  assert.equal(av.rigged, false);
  assert.ok(exercise(av), 'motion stays finite');
  assert.ok(av.gear.arm?.obj && av.gear.gun?.obj && av.gear.legs.hover.length === 2, 'parts hang on the stand-ins');
  // Running leans it into the run; it still stands 1.78 m tall at rest.
  for (let k = 0; k < 30; k++) av.update(player({ speed: 9.5 }), 0, 1 / 60);
  assert.ok(av.pivot.rotation.x > 0.08, `leans forward (${av.pivot.rotation.x.toFixed(2)})`);
  for (let k = 0; k < 60; k++) av.update(player(), 0, 1 / 60);
  const box = height(av);
  assert.ok(Math.abs(box.max.y - box.min.y - 1.78) < 0.05);

  // TURN: a half turn puts the model's front where its back was.
  const front = async (turn) => {
    const a = await quietly(() => loadAvatar(unrigged(), { turn }));
    a.group.updateMatrixWorld(true);
    let head = null;
    a.group.traverse((o) => {
      if (o.isMesh && o.geometry.attributes.position.count > 1000 && !head) head = o;
    });
    // The model's centre of mass in z: the chest and face sit forward of the back.
    const g = head.geometry.attributes.position;
    let z = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < g.count; i += 7) z += v.fromBufferAttribute(g, i).applyMatrix4(head.matrixWorld).z;
    return z / Math.ceil(g.count / 7);
  };
  const z0 = await front(0);
  const z2 = await front(2);
  assert.ok(Math.sign(z0) !== Math.sign(z2) || Math.abs(z0 + z2) < Math.abs(z0) * 0.2, `turned round (${z0.toFixed(3)} vs ${z2.toFixed(3)})`);
});

test('a file that is not a model is refused with a reason', async () => {
  await assert.rejects(() => loadAvatar(new ArrayBuffer(64)), /not a \.glb/);
});
