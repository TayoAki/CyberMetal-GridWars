import * as THREE from 'three';
import { COLS, ROWS, PANEL } from '../engine/constants.js';
import { SCREEN_W, SCREEN_H, PANEL_W, PANEL_H, PANEL_FACE, FIELD_Y, floorPoint } from '../render/layout.js';
import { drawBackground } from '../render/background.js';
import { setSpriteSink, spriteBitmap } from '../render/pixel.js';
import { glLayer } from './gl.js';
import { makeCamera, aimCamera, panelBox, screenToZ, heightOf, PANEL_TOP_PX, PANEL_THICK, SIN, COS, TILT } from './space.js';
import { voxelModel, isSolidPalette } from './voxels.js';
import { actorFor, hideOthers } from './models.js';

// The battle in 3D, drawn under the 2D view's see-through canvas. The 2D BattleView still runs everything:
// it hands each body's and projectile's sprites to the stage instead of drawing them (they become voxel
// models, or the player's own 3D model), and keeps drawing effects, numbers, the HUD and the Custom Screen
// on top, which line up because the camera reproduces the 2D screen (space.js). Panels are lit blocks
// wearing the 2D panel art, the 2D area background is the backdrop, effects light up the scene and a key
// light casts real shadows.
//
// During play the camera is fixed on that exact framing. It moves only when the 2D overlays are put away:
// it swoops in from low at the side as a battle opens, and closes in on the winner at the end.
//
// One stage serves every battle view (the title demo, then each battle): it is built once and rebinds to
// whichever view draws, so GPU resources are made once.

// Lighting. Lambert shading divides by pi: the fill and key below put a front face at about its sprite
// colour, tops a little brighter, the side away from the key in shade, and a cool rim on the far edges.
const FILL = { sky: '#f0f4ff', ground: '#b0b8d8', intensity: 1.9 };
const KEY = { color: '#fff6ea', intensity: 2.5, dir: [-0.45, 0.6, 0.66] };
const RIM = { color: '#86dcff', intensity: 1.3, dir: [0.6, 0.45, -0.66] };
const PANEL_TINT = 0.86; // panels are mostly lit from above: pull them back to their 2D colours

// Light from effects: [colour, strength] by effect name, else by element.
const FX_LIGHT = {
  explosion: ['#ffa040', 1.6], explode: ['#ffa040', 1.6], bigexplode: ['#ffa040', 2], burst: ['#ffd080', 1], darkburst: ['#b050ff', 1.4],
  flame: ['#ff7a2a', 1.1], pyreburst: ['#ff7a2a', 1.4], lavawave: ['#ff6a20', 1.2], emberheal: ['#ffb060', 0.8],
  bubble: ['#4ab8ff', 0.7], tidesplash: ['#4ab8ff', 1], geyser: ['#5ac8ff', 1], bubblepop: ['#7ad0ff', 0.6],
  zap: ['#ffe85a', 1.1], voltburst: ['#ffe85a', 1.4], lampzap: ['#ffe85a', 1],
  ice: ['#a8e8ff', 0.9], frostflash: ['#c8f4ff', 1.2],
  recover: ['#6aff8a', 1], barrierup: ['#7ae0ff', 0.8], barrierhit: ['#7ae0ff', 0.8],
  buster: ['#9ae8ff', 0.5], chargeshot: ['#ff7ae0', 1.2], cannonshot: ['#ffe0a0', 1], gunshot: ['#fff0c0', 0.6], airshot: ['#d0f0ff', 0.6],
  slash: ['#e8f4ff', 0.7], sabreslash: ['#e8f4ff', 0.9], lance: ['#e8f4ff', 0.7], flash: ['#ffffff', 2],
  voidquake: ['#a040ff', 1.2], zeroaura: ['#c040ff', 1], nullburst: ['#e0e0ff', 1.2], eyebeam: ['#ff4a6a', 1],
};
const ELEMENT_LIGHT = { fire: '#ff8a3a', aqua: '#4ab8ff', elec: '#ffe85a', wood: '#7aef6a' };

const FIELD_H = ROWS * PANEL_H + PANEL_FACE; // the 2D field art: three rows and the front edge

// Camera poses: what it looks at, from which side (yaw) and height (pitch), how near, how much it frames.
const PLAY_POSE = { target: [120, 0, 0], yaw: 0, pitch: TILT, dist: 20000, halfH: 80 };
const INTRO_POSE = { target: [112, 16, 52], yaw: -0.6, pitch: 0.2, dist: 230, halfH: 56 };
const INTRO_FRAMES = 96;
const WIN_FRAMES = 64;

const smoother = (k) => k * k * k * (k * (k * 6 - 15) + 10);
const lerp = (a, b, k) => a + (b - a) * k;
function blendPose(a, b, k) {
  return {
    target: a.target.map((v, i) => lerp(v, b.target[i], k)),
    yaw: lerp(a.yaw, b.yaw, k),
    pitch: lerp(a.pitch, b.pitch, k),
    dist: 1 / lerp(1 / a.dist, 1 / b.dist, k), // perspective fades evenly
    halfH: lerp(a.halfH, b.halfH, k),
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pixelTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

const v3 = (a) => new THREE.Vector3(...a).normalize();

// One panel block, in local space from its front-left top corner: the top runs back to -z, the face hangs
// below the front edge. UVs map the panel's art in the field atlas (top rows 0-17, face rows 18-22).
// The sides, seen as the camera swoops in, wear the panel's edge colour.
function panelGeometry(c, r) {
  const depth = PANEL_TOP_PX / SIN;
  const u0 = (c * PANEL_W) / SCREEN_W;
  const u1 = ((c + 1) * PANEL_W) / SCREEN_W;
  const ue = (c * PANEL_W + 0.5) / SCREEN_W;
  const v = (row) => 1 - (r * PANEL_H + row) / FIELD_H;
  const W = PANEL_W;
  const T = PANEL_THICK;
  const D = -depth;
  const top = PANEL_TOP_PX;
  const face = PANEL_TOP_PX + PANEL_FACE;
  const pos = [];
  const uv = [];
  const nor = [];
  const idx = [];
  const quad = (p, t, n) => {
    const i = pos.length / 3;
    pos.push(...p);
    uv.push(...t);
    for (let k = 0; k < 4; k++) nor.push(...n);
    idx.push(i, i + 3, i + 2, i, i + 2, i + 1);
  };
  quad([0, 0, D, W, 0, D, W, 0, 0, 0, 0, 0], [u0, v(0), u1, v(0), u1, v(top), u0, v(top)], [0, 1, 0]);
  quad([0, 0, 0, W, 0, 0, W, -T, 0, 0, -T, 0], [u0, v(top), u1, v(top), u1, v(face), u0, v(face)], [0, 0, 1]);
  quad([0, 0, D, 0, 0, 0, 0, -T, 0, 0, -T, D], [ue, v(top), ue, v(top), ue, v(face), ue, v(face)], [-1, 0, 0]);
  quad([W, 0, 0, W, 0, D, W, -T, D, W, -T, 0], [ue, v(top), ue, v(top), ue, v(face), ue, v(face)], [1, 0, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// The field's front edge under the front row (the atlas rows below the front row's face).
function edgeGeometry() {
  const r0 = (ROWS - 1) * PANEL_H + PANEL_TOP_PX + PANEL_FACE;
  const H = heightOf(FIELD_H - r0);
  const v = (row) => 1 - row / FIELD_H;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, SCREEN_W, 0, 0, SCREEN_W, -H, 0, 0, -H, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, v(r0), 1, v(r0), 1, v(FIELD_H), 0, v(FIELD_H)], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 3, 2, 0, 2, 1]);
  return g;
}

// A soft dark disc for contact shadows.
function blobTexture() {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// Voxel bodies: vertex-coloured, and every face casts a shadow (the models are open shells).
const bodyMaterial = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, shadowSide: THREE.DoubleSide, ...opts });

// The one colour a solid palette paints.
const soleColor = (palette) => Object.values(palette)[0];

let stage;
// The shared stage, or null where WebGL is unavailable.
export function battleStage() {
  if (stage === undefined) {
    const gl = glLayer();
    stage = gl ? new Stage(gl) : null;
  }
  return stage;
}

class Stage {
  constructor(gl) {
    this.gl = gl;
    this.scene = new THREE.Scene();
    this.camera = makeCamera(THREE);
    this.free = new THREE.PerspectiveCamera(30, SCREEN_W / SCREEN_H, 1, 30000);
    this.settled = true; // the camera holds the 2D framing (the 2D overlays line up)
    // Where the view draws its anchored 2D art while the camera moves: a canvas nobody sees.
    this.scratch = canvas(SCREEN_W, SCREEN_H).getContext('2d');
    this.view = null;
    this.records = [];
    this.placed = [];
    this.shakeX = 0;
    this.shakeY = 0;
    this.actorFor = actorFor; // (entity, info) -> a 3D model standing in for its sprites (models.js)

    // Backdrop: the 2D area background.
    this.bgCanvas = canvas(SCREEN_W, SCREEN_H);
    this.bgCtx = this.bgCanvas.getContext('2d');
    this.bgTex = pixelTexture(this.bgCanvas);
    this.scene.background = this.bgTex;

    this.scene.add(new THREE.HemisphereLight(FILL.sky, FILL.ground, FILL.intensity));
    const target = new THREE.Vector3(120, 0, 54);
    const key = new THREE.DirectionalLight(KEY.color, KEY.intensity);
    key.position.copy(target).addScaledVector(v3(KEY.dir), 420);
    key.target.position.copy(target);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 50, far: 900 });
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.5;
    key.shadow.radius = 2;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(RIM.color, RIM.intensity);
    rim.position.copy(target).addScaledVector(v3(RIM.dir), 420);
    rim.target.position.copy(target);
    this.scene.add(rim, rim.target);

    // The field: one atlas of the 2D panel art, one block per panel.
    this.fieldCanvas = canvas(SCREEN_W, FIELD_H);
    this.fieldCtx = this.fieldCanvas.getContext('2d');
    this.fieldTex = pixelTexture(this.fieldCanvas);
    const fieldMat = new THREE.MeshLambertMaterial({ map: this.fieldTex, color: new THREE.Color(PANEL_TINT, PANEL_TINT, PANEL_TINT) });
    this.panels = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const mesh = new THREE.Mesh(panelGeometry(c, r), fieldMat);
        const box = panelBox(c, r);
        mesh.position.set(box.x0, 0, box.zFront);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.panels.push({ c, r, mesh });
      }
    }
    const front = panelBox(0, ROWS - 1).zFront;
    const edge = new THREE.Mesh(edgeGeometry(), fieldMat);
    edge.position.set(0, -PANEL_THICK, front);
    this.scene.add(edge);
    // A dark floor far below, seen through holes and the gaps between rows.
    const back = panelBox(0, 0).zBack;
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, front - back + 40), new THREE.MeshBasicMaterial({ color: '#04050b' }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(SCREEN_W / 2, -PANEL_THICK - 18, (front + back) / 2);
    this.scene.add(pit);

    // Bodies: pooled voxel meshes and contact shadows.
    this.bodyMat = bodyMaterial();
    this.flashMat = bodyMaterial({ emissive: '#ffffff', emissiveIntensity: 0.8 });
    this.ghostMats = new Map();
    this.glowMats = new Map();
    this.revealMats = new Map();
    this.pool = [];
    this.blobs = [];
    this.blobGeo = new THREE.PlaneGeometry(1, 1);
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    // Materialising bodies: a bright ring sweeps up them.
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.72, 1, 32).rotateX(-Math.PI / 2);

    // Effect lights, pooled, and the buster's charge glow.
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 160, 1);
      l.userData = { life: 0, max: 0, power: 0 };
      this.scene.add(l);
      this.lights.push(l);
    }
    this.chargeLight = new THREE.PointLight('#5ab8ff', 0, 90, 1);
    this.scene.add(this.chargeLight);
    this.seenFx = new WeakSet();
  }

  // ---------------------------------------------------------------- a frame, driven by the 2D view

  // Start a frame for `view` (whose canvas transform is shifted by the screen shake). Afterwards `settled`
  // says whether the camera holds the 2D framing; while it doesn't, the view draws its anchored 2D art into
  // `scratch`.
  begin(view, shakeX, shakeY) {
    if (view !== this.view) {
      this.view = view;
      this.seenFx = new WeakSet();
      this.revealMats.forEach((m) => m.dispose());
      this.revealMats.clear();
      for (const l of this.lights) l.userData = { life: 0, max: 0, power: 0 };
    }
    this.b = view.b;
    this.pose = this.cameraPose();
    this.settled = !this.pose;
    this.shakeX = this.settled ? shakeX : 0;
    this.shakeY = this.settled ? shakeY : 0;
    this.records.length = 0;
    this.placed.length = 0;
  }

  // The moving camera's pose this frame, or null for the fixed 2D framing.
  cameraPose() {
    const v = this.view;
    const b = this.b;
    let pose = null;
    if (v.t < INTRO_FRAMES && !v.calm) pose = blendPose(INTRO_POSE, PLAY_POSE, smoother(v.t / INTRO_FRAMES));
    const won = b.phase === 'win' || (b.phase === 'results' && b.result?.won);
    const p = b.player;
    if (won && p && !v.calm) {
      const k = b.phase === 'results' ? 1 : Math.max(0, Math.min(1, (b.phaseTimer - 30) / WIN_FRAMES));
      if (k > 0) {
        const fp = floorPoint(p.col + (p.offsetX ?? 0), p.row + (p.offsetY ?? 0));
        const close = { target: [fp.x + 8, 24, screenToZ(fp.y) - 2], yaw: 0.42 + 0.08 * Math.sin(v.t / 70), pitch: 0.26, dist: 240, halfH: 40 };
        pose = blendPose(PLAY_POSE, close, smoother(k));
      }
    }
    return pose;
  }

  aim() {
    const p = this.pose;
    if (!p) {
      aimCamera(this.camera, this.shakeX, this.shakeY);
      return this.camera;
    }
    const cam = this.free;
    const [tx, ty, tz] = p.target;
    const cp = Math.cos(p.pitch);
    cam.position.set(tx + p.dist * cp * Math.sin(p.yaw), ty + p.dist * Math.sin(p.pitch), tz + p.dist * cp * Math.cos(p.yaw));
    cam.up.set(0, 1, 0);
    cam.lookAt(tx, ty, tz);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(p.halfH / p.dist));
    cam.near = Math.max(1, p.dist - 700);
    cam.far = p.dist + 700;
    cam.updateProjectionMatrix();
    return cam;
  }

  // Run `draw` (the 2D view drawing `e`'s sprite on ctx) with its sprites routed here. info: { x, floor }
  // (the feet on screen), and optionally body (the entity it stands for), flash, reveal (px shown, bottom
  // up), shadow ('small' or false).
  capture(ctx, e, info, draw) {
    const key = info.body ?? e;
    const actor = this.actorFor(e, info);
    if (actor) {
      // A 3D model stands in for the body: swallow its body sprites (their opacity carries over), keep any
      // 2D effects drawn with them.
      let drew = false;
      this.run(draw, (rows, palette, box) => {
        if (isSolidPalette(palette)) return false;
        info.alpha = Math.min(info.alpha ?? 1, box.alpha);
        drew = true;
        return true;
      });
      if (drew) this.placed.push({ actor, key, info, e });
      return;
    }
    const start = this.records.length;
    let glow = null;
    const held = [];
    this.run(draw, (rows, palette, box) => {
      if (!isSolidPalette(palette)) {
        this.records.push({ rows, palette, box, key, info, layer: this.records.length - start, glow: null });
        return true;
      }
      // One-colour silhouettes: drawn over the body they stay 2D tints; behind it (a halo) the body glows.
      if (this.records.length > start) return false;
      glow = { color: soleColor(palette), alpha: box.alpha };
      held.push({ rows, palette, box });
      return true;
    });
    if (this.records.length > start) {
      for (let i = start; i < this.records.length; i++) this.records[i].glow = glow;
      return;
    }
    // Nothing became 3D after all: draw the held silhouettes in 2D where they were.
    for (const h of held) {
      const bmp = spriteBitmap(h.rows, h.palette, h.box.flip, h.box.outline);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = h.box.alpha;
      ctx.drawImage(bmp.canvas, Math.round(h.box.x) - bmp.pad, Math.round(h.box.y) - bmp.pad);
      ctx.restore();
    }
  }

  run(draw, sink) {
    const prev = setSpriteSink(sink);
    try {
      draw();
    } finally {
      setSpriteSink(prev);
    }
  }

  // Draw the 3D frame, once the 2D view has handed over this frame's bodies.
  render() {
    const v = this.view;
    drawBackground(this.bgCtx, v.theme, v.t);
    this.bgTex.needsUpdate = true;
    this.updateField();
    this.updateLights();
    this.updateBodies();
    this.gl.render(this.scene, this.aim());
  }

  updateField() {
    const g = this.fieldCtx;
    g.save();
    g.clearRect(0, 0, SCREEN_W, FIELD_H);
    g.translate(0, -FIELD_Y);
    this.view.drawField(g);
    g.restore();
    this.fieldTex.needsUpdate = true;
    const f = this.b.field;
    // Holes drop out of the floor.
    for (const p of this.panels) p.mesh.position.y = f.get(p.c, p.r).type === PANEL.BROKEN ? -14 : 0;
  }

  spawnLight(x, y, z, color, power, life) {
    const l = this.lights.reduce((a, c) => (c.userData.life < a.userData.life ? c : a), this.lights[0]);
    l.position.set(x, y, z);
    l.color.set(color);
    l.userData = { life, max: life, power };
  }

  updateLights() {
    const calm = this.view.calm ? 0.4 : 1;
    for (const l of this.lights) {
      const d = l.userData;
      if (d.life > 0) d.life--;
      l.intensity = d.max ? d.power * 120 * calm * (d.life / d.max) : 0;
    }
    // New effects light up where they happen.
    for (const f of this.view.fx) {
      if (f.age < 1 || this.seenFx.has(f)) continue;
      this.seenFx.add(f);
      const ev = f.ev;
      const [color, power] = FX_LIGHT[ev.fx] ?? [ELEMENT_LIGHT[ev.element], 0.8];
      if (!color) continue;
      const p = floorPoint(ev.col ?? 2.5, ev.row ?? 1);
      this.spawnLight(p.x + (ev.ox ?? 0), 22, screenToZ(p.y) + 10, color, power, Math.min(24, Math.max(10, f.dur)));
    }
    // The buster glows while it charges.
    const p = this.b.player;
    const charge = p?.alive && !p.data?.summon ? (this.b.controller?.chargeState ?? 0) : 0;
    if (charge > 0) {
      const fp = floorPoint(p.col + (p.offsetX ?? 0), p.row + (p.offsetY ?? 0));
      this.chargeLight.position.set(fp.x + 18 * (p.facing ?? 1), 24, screenToZ(fp.y) + 10);
      this.chargeLight.color.set(charge >= 2 ? '#ff6ae0' : '#4ab0ff');
      this.chargeLight.intensity = (charge >= 2 ? 70 : 40) * calm * (0.8 + 0.2 * Math.sin(this.view.t / 3));
    } else this.chargeLight.intensity = 0;
  }

  // Place this frame's bodies.
  updateBodies() {
    let n = 0;
    let blobs = 0;
    const grounded = new Set();
    const blob = (info, key) => {
      if (grounded.has(key) || info.shadow === false) return;
      grounded.add(key);
      const small = info.shadow === 'small' || key.flying;
      if (!small && key.kind && this.b.field.get(key.col, key.row)?.type === PANEL.BROKEN) return;
      const m = this.blobs[blobs] ?? this.addBlob();
      blobs++;
      m.visible = true;
      m.scale.set(small ? 18 : 28, small ? 9 : 14, 1);
      m.position.set(info.x, 0.15, screenToZ(info.floor) - 3);
    };
    for (const rec of this.records) {
      const { box, info } = rec;
      blob(info, rec.key);
      const model = voxelModel(rec.rows, rec.palette, box.flip);
      const m = this.pool[n] ?? this.addBody();
      n++;
      m.geometry = model.geometry;
      // Later sprites of one body sit a little nearer the camera (raised to project to the same pixels),
      // as the 2D view draws them over the earlier ones.
      const dz = rec.layer * 4;
      const s = box.w / model.width;
      m.scale.set(s, box.h / model.rows, s);
      m.position.set(box.x - this.shakeX, heightOf(info.floor - (box.y - this.shakeY)) + (dz * SIN) / COS, screenToZ(info.floor) + dz);
      m.material = this.materialFor(rec);
      m.castShadow = box.alpha > 0.6;
      m.visible = true;
    }
    for (const p of this.placed) {
      blob(p.info, p.key);
      p.actor.place(this, p.info, p.e, this.view.t);
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
    for (let i = blobs; i < this.blobs.length; i++) this.blobs[i].visible = false;
    // Scan rings on bodies still materialising, until they pass the top of the body.
    const revealing = new Map();
    const reach = (key, info, top) => {
      if (info.reveal === undefined) return;
      const r = revealing.get(key);
      if (!r) revealing.set(key, { info, top });
      else r.top = Math.max(r.top, top);
    };
    for (const rec of this.records) reach(rec.key, rec.info, heightOf(rec.info.floor - (rec.box.y - this.shakeY)));
    for (const p of this.placed) reach(p.key, p.info, p.actor.height ?? 60);
    let rings = 0;
    for (const [key, { info, top }] of revealing) {
      const h = heightOf(info.reveal);
      if (h >= top) continue;
      const m = this.rings[rings] ?? this.addRing();
      rings++;
      m.visible = true;
      m.material.color.set(key.team === 'red' ? '#7ae8ff' : '#ff9ab8');
      m.scale.setScalar(13);
      m.position.set(info.x, h, screenToZ(info.floor) - 3);
    }
    for (let i = rings; i < this.rings.length; i++) this.rings[i].visible = false;
    hideOthers(this.placed);
  }

  materialFor(rec) {
    const a = rec.box.alpha;
    if (rec.info.flash) return this.flashMat;
    if (a < 0.95) {
      const k = Math.max(1, Math.round(a * 10));
      let m = this.ghostMats.get(k);
      if (!m) this.ghostMats.set(k, (m = bodyMaterial({ transparent: true, opacity: k / 10, depthWrite: false })));
      return m;
    }
    if (rec.glow) {
      let m = this.glowMats.get(rec.glow.color);
      if (!m) this.glowMats.set(rec.glow.color, (m = bodyMaterial({ emissive: rec.glow.color })));
      m.emissiveIntensity = 0.25 + 0.6 * rec.glow.alpha;
      return m;
    }
    if (rec.info.reveal !== undefined) {
      let m = this.revealMats.get(rec.key);
      if (!m) {
        m = bodyMaterial({ clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)], clipShadows: true });
        this.revealMats.set(rec.key, m);
      }
      m.clippingPlanes[0].constant = heightOf(rec.info.reveal);
      return m;
    }
    return this.bodyMat;
  }

  addBody() {
    const m = new THREE.Mesh(undefined, this.bodyMat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.scene.add(m);
    this.pool.push(m);
    return m;
  }

  addRing() {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.scene.add(m);
    this.rings.push(m);
    return m;
  }

  addBlob() {
    const m = new THREE.Mesh(this.blobGeo, this.blobMat);
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    this.scene.add(m);
    this.blobs.push(m);
    return m;
  }
}
