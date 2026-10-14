import * as THREE from 'three';
import { PARTS } from './parts.js';
import { FORM } from './forge.js';

// Procedural meshes for the mech's parts, hung on the rig's bones so they follow every pose. In the T-pose
// (identity bone rotations) the right arm runs along -x, the left arm along +x, the legs point down (-y) and
// the chest faces +z. Shapes are built along +y and turned onto the arm.
//
// Right hand: the arm part (drawn only while attacking, like Battle Network's Sword chips materialising).
// Left hand: the gun part (always there: it is the arm cannon). Feet and calves: the legs part. Chest: the core.
//
// Arm and gun parts come in four shapes each. The stock part is shape 0 in its own colours; a forged design
// (forge.js) picks the shape, a size and its body (metal) and glow (energy) colours.

const glow = (color, opacity = 0.5) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const metal = (color = 0x2c3448) => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.65 });
const lit = (color) => new THREE.MeshStandardMaterial({ color: 0x0c0c10, emissive: color, emissiveIntensity: 1.8, roughness: 0.4 });
const core = (color) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.75) });
const TO_RIGHT_ARM = (g) => g.rotateZ(Math.PI / 2); // +y -> -x
const TO_LEFT_ARM = (g) => g.rotateZ(-Math.PI / 2); // +y -> +x

function mesh(geo, mat, glowing = false) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !glowing;
  m.frustumCulled = false;
  if (glowing) m.renderOrder = 2;
  return m;
}

// A flat blade along +y: a centre line from `y0` running `len`, bending sideways by `bend` at the tip (and
// `hook` more over the last third), `w0` wide at the base and `w1` at the tip, with `teeth` on one edge.
function bladeShape({ y0 = 0.1, len = 1.15, w0 = 0.06, w1 = 0.01, bend = 0, hook = 0, teeth = 0, n = 16 }) {
  const left = [];
  const right = [];
  const at = (t) => bend * t * t + hook * Math.max(0, t - 0.66) ** 2 * 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cx = at(t);
    const y = y0 + len * t;
    const dx = (at(Math.min(1, t + 0.01)) - at(Math.max(0, t - 0.01))) / 0.02;
    const l = Math.hypot(dx, len);
    const nx = len / l;
    const ny = -dx / l;
    const w = w0 + (w1 - w0) * t;
    const wr = teeth && i > 0 && i < n && i % 2 === 1 ? w + teeth : w;
    left.push(new THREE.Vector2(cx - nx * w, y - ny * w));
    right.push(new THREE.Vector2(cx + nx * wr, y + ny * wr));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}
function slab(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -depth / 2);
}
// A blade: a bright core and a soft additive glow around it.
function blade(g, spec, c, toArm = TO_RIGHT_ARM, depth = 0.03) {
  g.add(mesh(toArm(slab(bladeShape(spec), depth)), core(c.glow), true));
  const wide = { ...spec, w0: spec.w0 * 2 + 0.03, w1: spec.w1 * 2 + 0.02, teeth: (spec.teeth ?? 0) * 1.4 };
  g.add(mesh(toArm(slab(bladeShape(wide), depth * 3.5)), glow(c.glow, 0.32), true));
}
// A hilt and guard in the body colour (forged arm weapons only; the stock saber is pure energy).
function hilt(g, c, width = 0.2) {
  if (c.body == null) return;
  g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8).translate(0, 0.02, 0)), metal(c.body)));
  g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(width, 0.04, 0.07).translate(0, 0.1, 0)), metal(c.body)));
}
// An energy rod: a thin bright core in a glowing sheath.
function rod(g, c, { r = 0.05, len = 1.15, y0 = 0.1, z = 0 } = {}) {
  g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(r * 0.28, r, len, 6).translate(0, y0 + len / 2, z)), core(c.glow), true));
  g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(r, r * 2.6, len + 0.05, 10, 1, true).translate(0, y0 + len / 2, z)), glow(c.glow), true));
}

// ---------------------------------------------------------------- arm parts (right hand, along -x)
// `body`: the stock metal colour. `trail`: per shape, where the slash ribbon runs, as distances from the hand.
const ARMS = {
  saber: {
    trail: [[0.1, 1.25], [0.1, 1.3], [0.1, 1.22], [0.1, 1.25]],
    shapes: [
      (g, c) => {
        rod(g, c);
        hilt(g, c);
      },
      (g, c) => {
        blade(g, { len: 1.2, w0: 0.065, w1: 0.008, bend: 0.2 }, c);
        hilt(g, c);
      },
      (g, c) => {
        blade(g, { len: 1.1, w0: 0.06, w1: 0.012, teeth: 0.045 }, c);
        hilt(g, c);
      },
      (g, c) => {
        for (const z of [-0.06, 0.06]) rod(g, c, { r: 0.035, len: 1.1, z });
        hilt(g, c, 0.26);
      },
    ],
  },
  breaker: {
    body: 0x343a4c,
    trail: [[0.45, 1.02], [0.45, 1.02], [0.45, 1.05], [0.45, 1.05]],
    shapes: [
      (g, c) => {
        // A handle, and a drum-shaped head across it with glowing faces.
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 8).translate(0, 0.44, 0)), metal(0x3a3f52)));
        const head = () => new THREE.CylinderGeometry(0.16, 0.16, 0.44, 18).rotateZ(Math.PI / 2);
        g.add(mesh(TO_RIGHT_ARM(head().translate(0, 0.88, 0)), metal(c.body)));
        for (const x of [-0.225, 0.225]) g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.165, 0.165, 0.035, 18).rotateZ(Math.PI / 2).translate(x, 0.88, 0)), lit(c.glow)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.168, 0.168, 0.06, 18).rotateZ(Math.PI / 2).translate(0, 0.88, 0)), lit(c.glow)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 18, 1, true).rotateZ(Math.PI / 2).translate(0, 0.88, 0)), glow(c.glow, 0.2), true));
      },
      (g, c) => {
        // A sledge: a long block head with a glowing band.
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 8).translate(0, 0.44, 0)), metal(0x3a3f52)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(0.56, 0.26, 0.26).translate(0, 0.88, 0)), metal(c.body)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(0.58, 0.07, 0.27).translate(0, 0.88, 0)), lit(c.glow)));
        for (const x of [-0.29, 0.29]) g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(0.02, 0.2, 0.2).translate(x, 0.88, 0)), lit(c.glow)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(0.66, 0.34, 0.34).translate(0, 0.88, 0)), glow(c.glow, 0.16), true));
      },
      (g, c) => {
        // A mace: a ball with glowing spikes.
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.035, 0.04, 0.72, 8).translate(0, 0.44, 0)), metal(0x3a3f52)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.IcosahedronGeometry(0.2, 1).translate(0, 0.9, 0)), metal(c.body)));
        const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0, 0.7, 0.7], [0, 0.7, -0.7], [0.6, -0.3, 0.6], [-0.6, -0.3, -0.6]];
        const up = new THREE.Vector3(0, 1, 0);
        for (const [x, y, z] of dirs) {
          const d = new THREE.Vector3(x, y, z).normalize();
          const spike = new THREE.ConeGeometry(0.05, 0.2, 6).translate(0, 0.27, 0);
          spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d)).translate(0, 0.9, 0);
          g.add(mesh(TO_RIGHT_ARM(spike), lit(c.glow)));
        }
        g.add(mesh(TO_RIGHT_ARM(new THREE.SphereGeometry(0.34, 14, 10).translate(0, 0.9, 0)), glow(c.glow, 0.14), true));
      },
      (g, c) => {
        // An axe: a crescent blade on one side of the haft, a spike on the other.
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.035, 0.04, 0.95, 8).translate(0, 0.52, 0)), metal(0x3a3f52)));
        const s = new THREE.Shape();
        s.moveTo(0.02, 0.66);
        s.quadraticCurveTo(0.2, 0.62, 0.36, 0.52);
        s.quadraticCurveTo(0.44, 0.84, 0.36, 1.16);
        s.quadraticCurveTo(0.2, 1.06, 0.02, 1.02);
        s.closePath();
        g.add(mesh(TO_RIGHT_ARM(slab(s, 0.05)), metal(c.body)));
        const edge = new THREE.Shape();
        edge.moveTo(0.33, 0.52);
        edge.quadraticCurveTo(0.47, 0.84, 0.33, 1.16);
        edge.quadraticCurveTo(0.4, 0.84, 0.33, 0.52);
        g.add(mesh(TO_RIGHT_ARM(slab(edge, 0.06)), lit(c.glow)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.ConeGeometry(0.05, 0.22, 6).rotateZ(Math.PI / 2).translate(-0.12, 0.84, 0)), metal(c.body)));
        g.add(mesh(TO_RIGHT_ARM(slab(s, 0.16)), glow(c.glow, 0.14), true));
      },
    ],
  },
  lance: {
    body: 0xc8d4e8,
    trail: [[1.1, 2.0], [1.1, 2.0], [1.1, 2.0], [1.1, 2.05]],
    shapes: [
      (g, c) => {
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.008, 0.055, 1.9, 8).translate(0, 1.05, 0)), metal(c.body)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16).translate(0, 0.12, 0)), metal(0x3a4058)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.02, 0.1, 1.95, 10, 1, true).translate(0, 1.05, 0)), glow(c.glow, 0.35), true));
      },
      (g, c) => {
        // A trident: a shaft and three glowing prongs.
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.03, 0.04, 1.5, 8).translate(0, 0.85, 0)), metal(c.body)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(0.34, 0.05, 0.05).translate(0, 1.58, 0)), metal(c.body)));
        for (const x of [-0.15, 0, 0.15]) {
          const len = x ? 0.4 : 0.5;
          g.add(mesh(TO_RIGHT_ARM(new THREE.ConeGeometry(0.035, len, 6).translate(x, 1.6 + len / 2, 0)), lit(c.glow)));
        }
        g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(0.46, 0.6, 0.14).translate(0, 1.85, 0)), glow(c.glow, 0.14), true));
      },
      (g, c) => {
        // A drill: a long cone with a glowing thread wound round it.
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 8).translate(0, 0.55, 0)), metal(c.body)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.ConeGeometry(0.14, 1.05, 14).translate(0, 1.5, 0)), metal(c.body)));
        const pts = [];
        for (let i = 0; i <= 64; i++) {
          const t = i / 64;
          const r = 0.145 * (1 - t) + 0.005;
          const a = t * Math.PI * 2 * 5;
          pts.push(new THREE.Vector3(Math.cos(a) * r, 0.98 + t * 1.02, Math.sin(a) * r));
        }
        g.add(mesh(TO_RIGHT_ARM(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.014, 5)), lit(c.glow)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.02, 0.24, 1.1, 12, 1, true).translate(0, 1.5, 0)), glow(c.glow, 0.22), true));
      },
      (g, c) => {
        // A glaive: a shaft with a long curved blade.
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.03, 0.04, 1.3, 8).translate(0, 0.75, 0)), metal(c.body)));
        g.add(mesh(TO_RIGHT_ARM(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10).translate(0, 1.4, 0)), metal(c.body)));
        blade(g, { y0: 1.4, len: 0.7, w0: 0.08, w1: 0.01, bend: 0.16 }, c, TO_RIGHT_ARM, 0.035);
      },
    ],
  },
  claws: {
    trail: [[0.18, 0.66], [0.18, 0.76], [0.18, 0.7], [0.18, 0.66]],
    shapes: [
      (g, c) => claws(g, c, [-0.075, 0, 0.075], 1.6, { w: 0.03, len: 0.5 }),
      (g, c) => claws(g, c, [-0.06, 0.06], 1.2, { w: 0.045, len: 0.62 }),
      (g, c) => {
        for (const z of [-0.075, 0, 0.075]) {
          const geo = slab(bladeShape({ y0: 0.16, len: 0.5, w0: 0.03, w1: 0.006, bend: 0.06, hook: 0.08, n: 12 }), 0.035);
          geo.rotateX(z * 1.6).translate(0, 0, z);
          g.add(mesh(TO_RIGHT_ARM(geo), lit(c.glow)));
          const halo = slab(bladeShape({ y0: 0.16, len: 0.5, w0: 0.07, w1: 0.03, bend: 0.06, hook: 0.08, n: 12 }), 0.09);
          halo.rotateX(z * 1.6).translate(0, 0, z);
          g.add(mesh(TO_RIGHT_ARM(halo), glow(c.glow, 0.3), true));
        }
        knuckle(g, c);
      },
      (g, c) => claws(g, c, [-0.13, -0.065, 0, 0.065, 0.13], 2.4, { w: 0.022, len: 0.46 }),
    ],
  },
};

// Claw blades fanned around the hand at offsets `zs` (spread `fan`).
function claws(g, c, zs, fan, { w, len }) {
  for (const z of zs) {
    const b = new THREE.BoxGeometry(w, len, 0.05).translate(0, 0.16 + len / 2, 0);
    b.rotateX(z * fan);
    b.translate(0, 0, z);
    g.add(mesh(TO_RIGHT_ARM(b), lit(c.glow)));
    const shell = new THREE.BoxGeometry(w + 0.04, len + 0.02, 0.09).translate(0, 0.16 + len / 2, 0);
    shell.rotateX(z * fan);
    shell.translate(0, 0, z);
    g.add(mesh(TO_RIGHT_ARM(shell), glow(c.glow, 0.3), true));
  }
  knuckle(g, c);
}
// A knuckle plate in the body colour (forged claws only).
function knuckle(g, c) {
  if (c.body == null) return;
  g.add(mesh(TO_RIGHT_ARM(new THREE.BoxGeometry(0.1, 0.08, 0.26).translate(0, 0.12, 0)), metal(c.body)));
}

// ---------------------------------------------------------------- gun parts (left hand, along +x)
// `muzzle`: distance from the hand to where shots and flashes start. Each gun's stock look; the shapes below
// build on it.
const GUNS = {
  buster: {
    muzzle: 0.37,
    body: 0x2c3448,
    build(c) {
      const g = new THREE.Group();
      g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.075, 0.085, 0.3, 14).translate(0, 0.2, 0)), metal(c.body)));
      g.add(mesh(TO_LEFT_ARM(new THREE.TorusGeometry(0.07, 0.018, 8, 18).rotateX(Math.PI / 2).translate(0, 0.35, 0)), lit(c.glow)));
      return g;
    },
  },
  spreader: {
    muzzle: 0.36,
    body: 0x4a4430,
    build(c) {
      const g = new THREE.Group();
      g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.14, 0.065, 0.3, 14, 1, true).translate(0, 0.2, 0)), metal(c.body)));
      g.add(mesh(TO_LEFT_ARM(new THREE.CircleGeometry(0.12, 14).rotateX(-Math.PI / 2).translate(0, 0.3, 0)), lit(c.glow)));
      return g;
    },
  },
  railgun: {
    muzzle: 0.68,
    body: 0x30304a,
    build(c) {
      const g = new THREE.Group();
      for (const z of [-0.055, 0.055]) g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.04, 0.62, 0.035).translate(0, 0.36, z)), metal(c.body)));
      g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.02, 0.58, 0.06).translate(0, 0.36, 0)), lit(c.glow)));
      g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.12, 0.14, 0.14).translate(0, 0.1, 0)), metal(c.body)));
      return g;
    },
  },
  bomber: {
    muzzle: 0.33,
    body: 0x3c3030,
    build(c) {
      const g = new THREE.Group();
      g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.11, 0.12, 0.26, 14).translate(0, 0.17, 0)), metal(c.body)));
      g.add(mesh(TO_LEFT_ARM(new THREE.TorusGeometry(0.1, 0.025, 8, 18).rotateX(Math.PI / 2).translate(0, 0.3, 0)), lit(c.glow)));
      return g;
    },
  },
};

// Gun shapes: Standard, Long (an extra barrel), Twin (two side by side), Heavy (thicker, with a shroud).
// Returns the group and its muzzle distance.
function buildGun(base, shape, c) {
  const def = GUNS[base];
  const g = new THREE.Group();
  const m = def.muzzle;
  if (shape === 1) {
    g.add(def.build(c));
    g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.042, 0.055, 0.36, 12).translate(0, m + 0.16, 0)), metal(c.body)));
    g.add(mesh(TO_LEFT_ARM(new THREE.TorusGeometry(0.05, 0.014, 8, 16).rotateX(Math.PI / 2).translate(0, m + 0.33, 0)), lit(c.glow)));
    return { g, muzzle: m + 0.36 };
  }
  if (shape === 2) {
    for (const z of [-0.08, 0.08]) {
      const s = def.build(c);
      s.scale.setScalar(0.78);
      s.position.z = z;
      g.add(s);
    }
    g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.06, 0.08, 0.26).translate(0, 0.1, 0)), metal(c.body)));
    return { g, muzzle: m * 0.78 };
  }
  if (shape === 3) {
    const s = def.build(c);
    s.scale.set(1.08, 1.35, 1.35);
    g.add(s);
    g.add(mesh(TO_LEFT_ARM(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 16, 1, true).translate(0, 0.12, 0)), metal(c.body)));
    for (const z of [-1, 1]) g.add(mesh(TO_LEFT_ARM(new THREE.BoxGeometry(0.02, 0.24, 0.1).translate(0, 0.17, z * 0.17)), lit(c.glow)));
    return { g, muzzle: m * 1.08 };
  }
  g.add(def.build(c));
  return { g, muzzle: m };
}

// ---------------------------------------------------------------- legs parts (feet and calves)
const LEGS = {
  striders: { build: () => ({}) },
  hover: {
    build(color) {
      const out = {};
      for (const side of ['Left', 'Right']) {
        const g = new THREE.Group();
        g.add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.04, 18).translate(0, -0.1, 0.05), metal(0x2c3a50)));
        g.add(mesh(new THREE.CircleGeometry(0.13, 18).rotateX(Math.PI / 2).translate(0, -0.125, 0.05), lit(color)));
        out[`${side}Foot`] = g;
      }
      return out;
    },
  },
  sprinters: {
    build(color) {
      const out = {};
      for (const side of ['Left', 'Right']) {
        const g = new THREE.Group();
        for (const x of [-0.05, 0.05]) {
          const fin = new THREE.BoxGeometry(0.02, 0.26, 0.16).translate(x, -0.18, -0.12);
          fin.rotateX(-0.35);
          g.add(mesh(fin, lit(color)));
        }
        out[`${side}Leg`] = g;
      }
      return out;
    },
  },
  treads: {
    build(color) {
      const out = {};
      for (const side of ['Left', 'Right']) {
        const g = new THREE.Group();
        g.add(mesh(new THREE.BoxGeometry(0.22, 0.15, 0.42).translate(0, -0.05, 0.06), metal(0x2a2a30)));
        g.add(mesh(new THREE.BoxGeometry(0.235, 0.03, 0.43).translate(0, -0.03, 0.06), lit(color)));
        out[`${side}Foot`] = g;
      }
      return out;
    },
  },
};

// ---------------------------------------------------------------- core (a gem on the chest)
function coreGem(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.OctahedronGeometry(0.06).translate(0, 0.04, 0.17), lit(color)));
  g.add(mesh(new THREE.OctahedronGeometry(0.1).translate(0, 0.04, 0.17), glow(color, 0.35), true));
  return g;
}

// The look of an arm or gun part: the stock part's, or a forged design's.
function lookOf(base, design, stockBody) {
  if (!design) return { shape: 0, size: 1, c: { glow: PARTS[base].color, body: stockBody } };
  return { shape: design.form.shape, size: design.form.size, c: { glow: FORM.palette[design.form.glow], body: FORM.palette[design.form.color] } };
}
const lookKey = (base, l) => `${base}/${l.shape}/${l.size}/${l.c.glow}/${l.c.body}`;

function dispose(obj) {
  obj.parent?.remove(obj);
  obj.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}

// Shows the equipped parts. Legs and cores are built once; the arm and gun are built for the look they need
// (a stock part or a forged design, which the forge previews as you edit) and thrown away when it changes.
// `bones` maps Mixamo names to bone objects.
export class Gear {
  constructor(bones, root) {
    root.updateMatrixWorld(true);
    const ref = bones.Hips ?? Object.values(bones).find(Boolean);
    this.scale = 1 / (ref ? ref.getWorldScale(new THREE.Vector3()).x || 1 : 1);
    this.bones = bones;
    this.legs = {};
    this.cores = {};
    for (const [k, d] of Object.entries(LEGS)) {
      this.legs[k] = Object.entries(d.build(PARTS[k].color)).map(([bone, obj]) => this.hang(bone, obj)).filter(Boolean);
    }
    for (const k of ['standard', 'fortress', 'link', 'overclock']) this.cores[k] = this.hang('Spine2', coreGem(PARTS[k].color));
    this.arm = null; // { key, obj, trail, size }
    this.gun = null; // { key, obj, muzzle }
    this.loadout = null;
    this.weaponK = 0;
  }

  hang(boneName, obj) {
    const b = this.bones[boneName];
    if (!b) return null;
    obj.scale.setScalar(this.scale);
    obj.visible = false;
    b.add(obj);
    return obj;
  }

  // Show the loadout; `designs` ({ arm, gun }) are forged designs to draw instead of the stock parts (each
  // only if its base is the equipped part).
  setLoadout(loadout, designs = {}) {
    this.loadout = { ...loadout };
    for (const [k, list] of Object.entries(this.legs)) for (const g of list) g.visible = k === loadout.legs;
    for (const [k, g] of Object.entries(this.cores)) if (g) g.visible = k === loadout.core;
    const arm = ARMS[loadout.arm];
    if (arm) {
      const l = lookOf(loadout.arm, designs.arm?.base === loadout.arm ? designs.arm : null, arm.body ?? null);
      const key = lookKey(loadout.arm, l);
      if (this.arm?.key !== key) {
        if (this.arm?.obj) dispose(this.arm.obj);
        const g = new THREE.Group();
        arm.shapes[l.shape](g, l.c);
        this.arm = { key, obj: this.hang('RightHand', g), trail: arm.trail[l.shape], size: FORM.scale[l.size] };
        this.showWeapon(this.weaponK);
      }
    }
    const gun = GUNS[loadout.gun];
    if (gun) {
      const l = lookOf(loadout.gun, designs.gun?.base === loadout.gun ? designs.gun : null, gun.body);
      const key = lookKey(loadout.gun, l);
      if (this.gun?.key !== key) {
        if (this.gun?.obj) dispose(this.gun.obj);
        const { g, muzzle } = buildGun(loadout.gun, l.shape, l.c);
        this.gun = { key, obj: this.hang('LeftHand', g), muzzle };
        if (this.gun.obj) {
          this.gun.obj.scale.setScalar(this.scale * FORM.scale[l.size]);
          this.gun.obj.visible = true;
        }
      }
    }
  }

  get weapon() {
    return this.arm?.obj ?? null;
  }

  // Draw the weapon in (k = 0..1): it grows out of the hand along the arm.
  showWeapon(k) {
    this.weaponK = k;
    const w = this.weapon;
    if (!w) return;
    w.visible = k > 0.03;
    const s = this.scale * this.arm.size;
    w.scale.set(s * k, s * (0.6 + 0.4 * k), s * (0.6 + 0.4 * k));
  }

  // World positions of the slash ribbon's base and tip; false while the weapon is away.
  trailEnds(base, tip) {
    const w = this.weapon;
    if (!w || this.weaponK < 0.5) return false;
    const [b, t] = this.arm.trail;
    w.updateMatrixWorld(true);
    base.set(-b, 0, 0).applyMatrix4(w.matrixWorld);
    tip.set(-t, 0, 0).applyMatrix4(w.matrixWorld);
    return true;
  }

  // World position of the gun's muzzle.
  muzzle(out) {
    const g = this.gun?.obj;
    if (!g) return null;
    g.updateMatrixWorld(true);
    return out.set(this.gun.muzzle, 0, 0).applyMatrix4(g.matrixWorld);
  }
}
