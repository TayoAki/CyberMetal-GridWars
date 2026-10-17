import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { project, screenToZ, heightOf, panelBox, COS, PANEL_TOP_PX } from '../src/render3d/space.js';
import { buildVoxels, voxelModel, isSolidPalette } from '../src/render3d/voxels.js';
import { prepareModel, modelName } from '../src/render3d/models.js';
import { sprite, setSpriteSink } from '../src/render/pixel.js';
import { FIELD_Y, PANEL_W, PANEL_H, floorPoint } from '../src/render/layout.js';

// The 3D graphics: the camera space that keeps the 3D scene on the 2D screen's pixels, sprites as voxel
// models, the hook that hands sprites to the 3D view, and loading players' own .glb models.

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('the 3D space projects panels and feet onto the pixels the 2D view uses', () => {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const b = panelBox(c, r);
      const y = FIELD_Y + r * PANEL_H;
      assert.ok(near(project(b.x0, 0, b.zBack).y, y), 'back edge on the panel art top');
      assert.ok(near(project(b.x0, 0, b.zFront).y, y + PANEL_TOP_PX), 'front edge where the face starts');
      assert.equal(b.x1 - b.x0, PANEL_W);
      const f = floorPoint(c, r);
      assert.ok(near(project(f.x, 0, screenToZ(f.y)).y, f.y), 'feet on the floor point');
    }
  }
  // A body point drawn h pixels above the feet sits heightOf(h) above the floor at the feet's depth.
  const f = floorPoint(2, 1);
  assert.ok(near(project(f.x, heightOf(30), screenToZ(f.y)).y, f.y - 30));
});

test('a sprite becomes a voxel model: one column per pixel, rounded in the middle, faces merged', () => {
  const rows = ['aaa', 'aaa', 'aaa'];
  const pal = { a: '#3a6ad0' };
  const m = buildVoxels(rows, pal, false);
  assert.equal(m.width, 3);
  assert.equal(m.rows, 3);
  assert.ok(near(m.height, 3 / COS));
  // Fronts: one merged quad per row; tops: only the top row; sides: the silhouette's, two per row.
  assert.equal(m.quads, 3 + 1 + 6);
  const pos = m.geometry.attributes.position.array;
  assert.ok(pos.every(Number.isFinite));
  const zs = [];
  for (let i = 2; i < pos.length; i += 3) zs.push(pos[i]);
  assert.equal(Math.min(...zs), -3, 'a narrow body is three deep');
  // Colours are linear, from the palette.
  const col = new THREE.Color('#3a6ad0');
  const vc = m.geometry.attributes.color.array;
  assert.ok(near(vc[0], col.r, 1e-6) && near(vc[1], col.g, 1e-6) && near(vc[2], col.b, 1e-6));

  // Bigger bodies bulge toward the camera and run deeper; see-through pixels and blanks are skipped.
  const big = buildVoxels(Array(9).fill('a'.repeat(12)), pal, false);
  const bz = Array.from(big.geometry.attributes.position.array).filter((_, i) => i % 3 === 2);
  assert.ok(Math.max(...bz) >= 2 && Math.min(...bz) <= -5, `depth ${Math.min(...bz)}..${Math.max(...bz)}`);
  const holes = buildVoxels(['a.b', '...'], { a: '#ffffff', b: 'rgba(255,255,255,0.3)' }, false);
  assert.equal(holes.quads, 1 + 1 + 2);

  // Mirroring flips the columns; models are cached per rows, palette and side.
  const lop = buildVoxels(['ab'], { a: '#ff0000', b: '#0000ff' }, true);
  const c = lop.geometry.attributes.color.array;
  assert.ok(c[2] > c[0], 'the blue pixel comes first when flipped');
  assert.equal(voxelModel(rows, pal, false), voxelModel(rows, pal, false));
  assert.notEqual(voxelModel(rows, pal, false), voxelModel(rows, pal, true));
  assert.equal(isSolidPalette({ a: '#fff', b: '#fff' }), true, 'a one-colour palette is a glow or flash');
  assert.equal(isSolidPalette(pal), true);
  assert.equal(isSolidPalette({ a: '#fff', b: '#000' }), false);
});

test('a sprite sink takes sprites before they are drawn, with where they would have gone', () => {
  const ctx = {
    m: { a: 1, b: 0, c: 0, d: 1, e: 3, f: 2 },
    globalAlpha: 0.5,
    getTransform() {
      return this.m;
    },
    drawImage() {
      throw new Error('drawn');
    },
  };
  const got = [];
  const prev = setSpriteSink((rows, palette, box) => {
    got.push(box);
    return true;
  });
  try {
    sprite(ctx, ['ab', 'cd'], { a: '#f00', b: '#0f0', c: '#00f', d: '#fff' }, 10, 20, { anchor: 'feet', flip: true, alpha: 0.5, outline: '#000' });
    // Mirrored by the canvas: the box comes back unmirrored, its flip toggled.
    ctx.m = { a: -1, b: 0, c: 0, d: 1, e: 100, f: 0 };
    sprite(ctx, ['ab', 'cd'], { a: '#f00', b: '#0f0', c: '#00f', d: '#fff' }, 10, 20, { anchor: 'feet', flip: true });
  } finally {
    setSpriteSink(prev);
  }
  assert.deepEqual(got[0], { x: 12, y: 20, w: 2, h: 2, flip: true, alpha: 0.25, outline: '#000' });
  assert.deepEqual(got[1], { x: 89, y: 18, w: 2, h: 2, flip: false, alpha: 0.5, outline: null });
});

// ---------------------------------------------------------------- players' own models

const glbFile = () => {
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
  const out = new ArrayBuffer(12 + 8 + js.length + 8 + bin.length);
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

// Node can't decode the texture; the loader says so and goes on without it. (It also looks for `self`.)
globalThis.self ??= globalThis;
async function quietly(fn) {
  const { error, warn } = console;
  console.error = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { error, warn });
  }
}

function boneAt(template, name) {
  let bone = null;
  template.root.traverse((o) => {
    if (o.isBone && o.name.endsWith(name) && !bone) bone = o;
  });
  template.root.updateMatrixWorld(true);
  return bone.getWorldPosition(new THREE.Vector3());
}

test('a .glb is prepared for battle: AXIOM-sized, feet on the floor, rig checked', async () => {
  const t = await quietly(() => prepareModel(glbFile(), 'mech'));
  assert.equal(t.rig, 'ok');
  assert.equal(t.skinned, true);
  assert.ok(near(t.height, 55, 0.01), `height ${t.height}`);
  assert.ok(t.triangles > 1000);
  const feet = boneAt(t, 'LeftFoot');
  const head = boneAt(t, 'Head');
  assert.ok(feet.y > 0 && feet.y < 15 && head.y > 35 && head.y < 56, 'standing on the floor');
  assert.ok(Math.abs(head.x) < 6 && Math.abs(head.z) < 20, 'centred over the panel');

  await assert.rejects(() => prepareModel(new ArrayBuffer(64), 'x'), /not a \.glb/);
  assert.equal(modelName('blue_robotic_mecha_3d_model.glb'), 'blue robotic mecha');
  assert.equal(modelName('My Hero.GLB'), 'My Hero');
});

test("a broken auto-rig (every bone at the origin, garbage bind matrices) is rebuilt from the skin weights", async () => {
  const good = await quietly(() => prepareModel(glbFile(), 'mech'));
  const broken = rewriteGlb(glbFile(), (json, bin) => {
    const skin = json.skins[0];
    for (const j of skin.joints) for (const k of ['translation', 'rotation', 'scale']) delete json.nodes[j][k];
    const acc = json.accessors[skin.inverseBindMatrices];
    const view = json.bufferViews[acc.bufferView];
    const at = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    new Float32Array(bin.buffer, at, acc.count * 16).fill(1e37);
  });
  const t = await quietly(() => prepareModel(broken, 'tripo'));
  assert.equal(t.rig, 'repaired');
  assert.ok(near(t.height, 55, 0.01));
  for (const name of ['Hips', 'Head', 'LeftArm', 'RightHand', 'LeftFoot']) {
    const d = boneAt(t, name).distanceTo(boneAt(good, name));
    assert.ok(d < 0.5, `${name} rebuilt ${d.toFixed(3)} from where the repaired file has it`);
  }
});
