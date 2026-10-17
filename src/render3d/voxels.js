import * as THREE from 'three';
import { COS } from './space.js';

// Pixel sprites as voxel models. Each solid pixel becomes a column of voxels: interior pixels bulge toward the
// camera and wide rows (a torso) run deeper behind than narrow ones (a wrist), so a sprite reads as a rounded
// toy rather than a flat cut-out. Only faces the camera can see from in front and above are built (fronts, tops, the silhouette's
// sides and the steps between columns of different depth), runs of same-coloured faces are merged, and each
// sprite frame is built once and cached.
//
// Local space: x from the sprite's left edge (1 unit per pixel), y down from its top (1/cos(tilt) per pixel,
// so it projects back to one screen pixel), z = 0 at the sprite's plane, + toward the camera.

const K = 1 / COS; // world height of one pixel row

const colorCache = new Map();
// A palette colour as linear RGB, or null when it shouldn't become a voxel (mostly transparent glow).
function parseColor(css) {
  let c = colorCache.get(css);
  if (c !== undefined) return c;
  c = null;
  if (typeof css === 'string') {
    const a = css.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
    if (!a || Number(a[1]) >= 0.5) {
      const col = new THREE.Color();
      col.setStyle(css.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)'));
      c = [col.r, col.g, col.b];
    }
  }
  colorCache.set(css, c);
  return c;
}

// The solid pixels of a sprite: colour (or null) per cell, mirrored when flipped.
function grid(rows, palette, flip) {
  const H = rows.length;
  const W = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cells = new Array(W * H).fill(null);
  for (let j = 0; j < H; j++) {
    const r = rows[j];
    for (let i = 0; i < W; i++) {
      const ch = r[flip ? W - 1 - i : i];
      if (ch === undefined || ch === '.' || ch === ' ') continue;
      const css = palette[ch];
      if (css === undefined) continue;
      cells[j * W + i] = parseColor(css);
    }
  }
  return { W, H, cells };
}

// Chebyshev distance from each solid pixel to the nearest empty one (1 on the silhouette).
function distances(W, H, cells) {
  const d = new Int16Array(W * H);
  const big = 1000;
  for (let i = 0; i < W * H; i++) d[i] = cells[i] ? big : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i]);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!d[k]) continue;
      d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1, at(i + 1, j - 1) + 1);
    }
  }
  for (let j = H - 1; j >= 0; j--) {
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i;
      if (!d[k]) continue;
      d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1, at(i - 1, j + 1) + 1);
    }
  }
  return d;
}

// Build the geometry. Returns { geometry, width, rows, height } (height in world units).
export function buildVoxels(rows, palette, flip = false) {
  const { W, H, cells } = grid(rows, palette, flip);
  const dist = distances(W, H, cells);
  const front = new Float32Array(W * H);
  const back = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; ) {
      if (!cells[j * W + i]) {
        i++;
        continue;
      }
      let e = i;
      while (e < W && cells[j * W + e]) e++;
      const depth = -(3 + Math.min(7, Math.floor((e - i) / 5)));
      for (let x = i; x < e; x++) {
        front[j * W + x] = Math.min(4, Math.floor((dist[j * W + x] - 1) / 2));
        back[j * W + x] = depth;
      }
      i = e;
    }
  }
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const quad = (a, b, c, d, n, rgb) => {
    const v = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) {
      nor.push(...n);
      col.push(...rgb);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  };
  const solid = (i, j) => i >= 0 && j >= 0 && i < W && j < H && cells[j * W + i] !== null;
  const same = (a, b) => a === b || (a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

  for (let j = 0; j < H; j++) {
    const y0 = -j * K;
    const y1 = -(j + 1) * K;
    // Front faces, merged along runs of one colour at one depth.
    for (let i = 0; i < W; ) {
      const k = j * W + i;
      if (!cells[k]) {
        i++;
        continue;
      }
      let e = i + 1;
      while (e < W && cells[j * W + e] && same(cells[j * W + e], cells[k]) && front[j * W + e] === front[k]) e++;
      const z = front[k];
      quad([i, y1, z], [e, y1, z], [e, y0, z], [i, y0, z], [0, 0, 1], cells[k]);
      i = e;
    }
    // Top faces: where the pixel above is empty, or sits further back (its front is behind ours).
    for (let i = 0; i < W; ) {
      const k = j * W + i;
      const zTop = (ii) => {
        const kk = j * W + ii;
        if (!cells[kk]) return null;
        const above = j > 0 && cells[(j - 1) * W + ii] ? front[(j - 1) * W + ii] : back[kk];
        return above < front[kk] ? above : null;
      };
      const z0 = zTop(i);
      if (z0 === null) {
        i++;
        continue;
      }
      let e = i + 1;
      while (e < W && cells[j * W + e] && same(cells[j * W + e], cells[k]) && zTop(e) === z0 && front[j * W + e] === front[k]) e++;
      const z1 = front[k];
      quad([i, y0, z1], [e, y0, z1], [e, y0, z0], [i, y0, z0], [0, 1, 0], cells[k]);
      i = e;
    }
    // Sides: the silhouette's, and the steps where a neighbour's front sits further back than ours.
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!cells[k]) continue;
      const zl = solid(i - 1, j) ? front[k - 1] : back[k];
      const zr = solid(i + 1, j) ? front[k + 1] : back[k];
      if (zl < front[k]) quad([i, y1, zl], [i, y1, front[k]], [i, y0, front[k]], [i, y0, zl], [-1, 0, 0], cells[k]);
      if (zr < front[k]) quad([i + 1, y1, front[k]], [i + 1, y1, zr], [i + 1, y0, zr], [i + 1, y0, front[k]], [1, 0, 0], cells[k]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return { geometry: g, width: W, rows: H, height: H * K, quads: idx.length / 6 };
}

// Cached per (rows, palette, flip): sprite rows and palettes are stable objects, so each frame is built once.
// The least recently drawn models are dropped (and their GPU buffers freed) past MAX_MODELS.
const MAX_MODELS = 360;
const ids = new WeakMap();
let nextId = 1;
const idOf = (o) => {
  let id = ids.get(o);
  if (!id) ids.set(o, (id = nextId++));
  return id;
};
const cache = new Map();
export function voxelModel(rows, palette, flip) {
  const key = `${idOf(rows)}:${idOf(palette)}:${flip ? 1 : 0}`;
  let m = cache.get(key);
  if (m) {
    cache.delete(key);
    cache.set(key, m);
    return m;
  }
  m = buildVoxels(rows, palette, flip);
  cache.set(key, m);
  if (cache.size > MAX_MODELS) {
    const [oldest, old] = cache.entries().next().value;
    cache.delete(oldest);
    old.geometry.dispose();
  }
  return m;
}

// A palette that paints every key one colour (hit flashes, glows) is an overlay, not a body.
const solidCheck = new WeakMap();
export function isSolidPalette(palette) {
  let s = solidCheck.get(palette);
  if (s === undefined) {
    const vals = new Set(Object.values(palette));
    s = vals.size <= 1;
    solidCheck.set(palette, s);
  }
  return s;
}
