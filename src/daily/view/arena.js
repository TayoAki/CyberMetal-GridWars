import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PANEL_W, PANEL_D, cellX, cellZ, toon, glow } from './stage.js';

// The arena: the 6x3 grid of battle panels (BN's red and blue areas) floating over a themed void. Panel
// tops are drawn on canvases, one per kind of panel and side; the neon edge shows who owns each panel.
// update() follows the field every frame: stolen panels change colour, cracked ones crack, broken ones
// open into a pit, grass and ice and lava appear and go.

const SIDE = { red: '#ff3d63', blue: '#3d7bff' };
const THICK = 0.34;

// ---------------------------------------------------------------- panel tops

const tops = new Map();
function top(type, side) {
  const key = `${type}|${side}`;
  if (tops.has(key)) return tops.get(key);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d');
  const tint = SIDE[side];
  const base = {
    normal: ['#2a3256', '#1a1f3a'],
    cracked: ['#2a3256', '#1a1f3a'],
    grass: ['#2f7a2a', '#1d4f1b'],
    ice: ['#bfe9ff', '#7fc4ef'],
    lava: ['#ff6a1a', '#a8250a'],
    poison: ['#8a3ab8', '#4a1670'],
    holy: ['#ffe9a8', '#e0b04a'],
    sand: ['#d9c08a', '#a8905a'],
    metal: ['#9aa4b8', '#5a6278'],
  }[type] ?? ['#2a3256', '#1a1f3a'];
  const grad = g.createLinearGradient(0, 0, 0, 192);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(1, base[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 192);
  // The BN tile: an inner plate inset from a coloured frame.
  g.lineWidth = 12;
  g.strokeStyle = tint;
  g.globalAlpha = type === 'normal' || type === 'cracked' ? 0.95 : 0.55;
  g.strokeRect(10, 10, 236, 172);
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(34, 32, 188, 128);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fillRect(34, 32, 188, 10);
  const rnd = mulberry(type.length * 97 + side.length);
  if (type === 'normal' || type === 'cracked') {
    g.fillStyle = tint;
    g.globalAlpha = 0.28;
    g.fillRect(52, 52, 152, 88);
    g.globalAlpha = 1;
  }
  if (type === 'cracked') {
    g.strokeStyle = '#05060f';
    g.lineWidth = 6;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      let x = 128;
      let y = 96;
      g.moveTo(x, y);
      for (let i = 0; i < 5; i++) {
        x += (rnd() - 0.5) * 70;
        y += (rnd() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  if (type === 'grass') {
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = rnd() < 0.5 ? '#7ae05a' : '#4ab83a';
      g.lineWidth = 3;
      const x = 20 + rnd() * 216;
      const y = 20 + rnd() * 152;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 10, y - 12 - rnd() * 10);
      g.stroke();
    }
  }
  if (type === 'ice') {
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(40 + i * 60, 150);
      g.lineTo(90 + i * 60, 40);
      g.stroke();
    }
  }
  if (type === 'lava') {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = rnd() < 0.5 ? '#ffd23f' : '#ff9a2a';
      g.beginPath();
      g.arc(30 + rnd() * 196, 30 + rnd() * 132, 6 + rnd() * 14, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (type === 'poison') {
    for (let i = 0; i < 16; i++) {
      g.strokeStyle = '#d88aff';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(30 + rnd() * 196, 30 + rnd() * 132, 5 + rnd() * 10, 0, Math.PI * 2);
      g.stroke();
    }
  }
  if (type === 'holy') {
    g.fillStyle = '#fffbe0';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = i % 2 ? 26 : 60;
      g.lineTo(128 + Math.cos(a) * rr * 1.2, 96 + Math.sin(a) * rr * 0.9);
    }
    g.fill();
  }
  if (type === 'metal') {
    g.fillStyle = '#d8dee8';
    for (const [x, y] of [[40, 38], [216, 38], [40, 154], [216, 154]]) {
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tops.set(key, tex);
  return tex;
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the grid

class Panel {
  constructor(arena, c, r) {
    this.c = c;
    this.r = r;
    const g = (this.group = new THREE.Group());
    g.position.set(cellX(c), 0, cellZ(r));
    this.block = new THREE.Mesh(arena.blockGeo, arena.blockMat);
    this.block.position.y = -THICK / 2 - 0.02;
    this.block.receiveShadow = true;
    this.topMat = toon({ map: top('normal', 'red'), emissive: '#000000' });
    this.top = new THREE.Mesh(arena.topGeo, this.topMat);
    this.top.rotation.x = -Math.PI / 2;
    this.top.position.y = 0.002;
    this.top.receiveShadow = true;
    this.edgeMat = glow(SIDE.red);
    this.edge = new THREE.Mesh(arena.edgeGeo, this.edgeMat);
    this.edge.position.set(0, -0.07, PANEL_D / 2 - 0.02);
    // A hole: a dark pit with a glowing lip, shown when the panel breaks.
    this.pit = new THREE.Mesh(arena.pitGeo, arena.pitMat);
    this.pit.rotation.x = -Math.PI / 2;
    this.pit.position.y = 0.004;
    this.pit.visible = false;
    g.add(this.block, this.top, this.edge, this.pit);
    this.key = '';
    this.flash = 0;
  }

  update(p, t) {
    const side = p.owner === 'red' ? 'red' : 'blue';
    const type = p.type;
    const key = `${type}|${side}`;
    if (key !== this.key) {
      const was = this.key;
      this.key = key;
      if (type === 'broken') {
        this.top.visible = false;
        this.pit.visible = true;
      } else {
        this.top.visible = true;
        this.pit.visible = false;
        this.topMat.map = top(type, side);
        this.topMat.needsUpdate = true;
      }
      this.edgeMat.color.set(SIDE[side]);
      if (was) this.flash = 1;
    }
    if (p.flash > 0) this.flash = Math.max(this.flash, p.flash / 12);
    const lava = type === 'lava' ? 0.35 + 0.15 * Math.sin(t * 3 + this.c + this.r * 2) : 0;
    const k = Math.max(this.flash, lava);
    this.topMat.emissive.setRGB(k, k * (type === 'lava' ? 0.45 : 1), k * (type === 'lava' ? 0.1 : 1));
    this.flash *= 0.9;
  }
}

// ---------------------------------------------------------------- the backdrop

const SKY_VERT = `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = `uniform vec3 top; uniform vec3 bottom; uniform vec3 glowColor; uniform float time; varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 0.8 + 0.35, 0.0, 1.0);
  vec3 c = mix(bottom, top, h);
  float band = smoothstep(0.08, 0.0, abs(vDir.y + 0.02));
  c += glowColor * band * 0.35;
  float grid = step(0.985, fract(atan(vDir.z, vDir.x) * 24.0 / 6.2831 + time * 0.01)) * smoothstep(0.5, 0.0, abs(vDir.y)) * 0.25;
  c += glowColor * grid;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Arena {
  constructor(stage, theme) {
    this.stage = stage;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.blockGeo = new RoundedBoxGeometry(PANEL_W - 0.04, THICK, PANEL_D - 0.04, 3, 0.06);
    this.topGeo = new THREE.PlaneGeometry(PANEL_W - 0.1, PANEL_D - 0.1);
    this.edgeGeo = new THREE.BoxGeometry(PANEL_W - 0.16, 0.05, 0.03);
    this.pitGeo = new THREE.PlaneGeometry(PANEL_W - 0.1, PANEL_D - 0.1);
    this.blockMat = toon({ color: '#3a4268' });
    this.pitMat = new THREE.MeshBasicMaterial({ color: '#05030c' });
    this.panels = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const p = new Panel(this, c, r);
      this.panels.push(p);
      this.group.add(p.group);
    }
    // The slab the grid floats on, with a glowing line round its top edge.
    const W = 6 * PANEL_W + 0.4;
    const D = 3 * PANEL_D + 0.4;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(W, 0.6, D, 3, 0.1), toon({ color: '#1c2140' }));
    slab.position.y = -THICK - 0.32;
    slab.receiveShadow = true;
    this.trim = glow(theme.glow);
    this.group.add(slab);
    for (const [w, d, x, z] of [[W + 0.04, 0.05, 0, D / 2], [W + 0.04, 0.05, 0, -D / 2], [0.05, D, W / 2, 0], [0.05, D, -W / 2, 0]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), this.trim);
      bar.position.set(x, -THICK - 0.05, z);
      this.group.add(bar);
    }
    this.setTheme(theme);
  }

  setTheme(theme) {
    this.theme = theme;
    const s = this.stage;
    s.scene.background = new THREE.Color(theme.sky[0]);
    s.scene.fog = new THREE.Fog(theme.sky[0], 26, 90);
    this.trim.color.set(theme.glow);
    this.sky?.removeFromParent();
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(theme.sky[0]) }, bottom: { value: new THREE.Color(theme.sky[1]) }, glowColor: { value: new THREE.Color(theme.accent) }, time: { value: 0 } },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
      }),
    );
    this.sky.material.userData.outlineParameters = { visible: false };
    s.scene.add(this.sky);
    this.props?.removeFromParent();
    this.props = buildProps(theme);
    s.scene.add(this.props);
    this.motes?.removeFromParent();
    this.motes = buildMotes(theme);
    s.scene.add(this.motes);
  }

  update(field, t) {
    if (field) for (const p of this.panels) p.update(field.panels[p.r][p.c], t);
    this.sky.material.uniforms.time.value = t;
    this.props.userData.update?.(t);
    const m = this.motes.geometry.attributes.position;
    for (let i = 0; i < m.count; i++) {
      let y = m.getY(i) + 0.006 + (i % 5) * 0.001;
      if (y > 9) y = -3;
      m.setY(i, y);
    }
    m.needsUpdate = true;
  }
}

// Floating props around the arena, by the theme's kind.
function buildProps(theme) {
  const g = new THREE.Group();
  const rnd = mulberry(theme.key.length * 131 + theme.props.length);
  const main = toon({ color: shade(theme.sky[1], 0.55) });
  const lit = glow(theme.accent);
  const hot = glow(theme.glow);
  const spots = [];
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (9 + rnd() * 10);
    const z = -9 - rnd() * 16;
    spots.push([x, z, rnd()]);
  }
  for (const [x, z, k] of spots) {
    const h = 1.2 + k * 2.6;
    let m;
    switch (theme.props) {
      case 'pylons':
      case 'spires': {
        m = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, h, 6), main);
        body.position.y = h / 2;
        const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), k > 0.5 ? lit : hot);
        tip.position.y = h + 0.5;
        tip.userData.spin = 1;
        m.add(body, tip);
        break;
      }
      case 'coral':
      case 'trees':
      case 'bamboo': {
        m = new THREE.Group();
        const n = theme.props === 'bamboo' ? 3 : 5;
        for (let j = 0; j < n; j++) {
          const stalk = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 + k * 0.1, h * (0.5 + j * 0.12), 4, 8), j % 2 ? main : toon({ color: theme.accent }));
          stalk.position.set((j - n / 2) * 0.4, h * 0.4, (j % 2) * 0.3);
          stalk.rotation.z = (j - n / 2) * 0.18;
          m.add(stalk);
        }
        const bud = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), lit);
        bud.position.y = h * 0.95;
        m.add(bud);
        break;
      }
      case 'ice':
      case 'shards': {
        m = new THREE.Mesh(new THREE.OctahedronGeometry(0.8 + k * 1.4, 0), theme.props === 'ice' ? toon({ color: '#c8f0ff' }) : lit);
        m.position.y = 2 + k * 4;
        m.scale.y = 1.8;
        m.userData.spin = 0.3;
        break;
      }
      case 'gears': {
        m = new THREE.Mesh(new THREE.TorusGeometry(0.9 + k, 0.28, 6, 10), main);
        m.position.y = 2 + k * 3;
        m.userData.spin = 0.5;
        break;
      }
      case 'lanterns': {
        m = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, h, 6), main);
        pole.position.y = h / 2;
        const lamp = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.4, 4, 8), hot);
        lamp.position.y = h + 0.3;
        m.add(pole, lamp);
        break;
      }
      case 'anvils':
      case 'rocks':
      default: {
        m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + k * 1.2, 0), main);
        m.position.y = 1 + k * 3;
        const ember = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), hot);
        ember.position.y = 1.2;
        m.add(ember);
        m.userData.bob = 1;
        break;
      }
    }
    m.position.x = x;
    m.position.z = z;
    m.position.y += -2.2 - k * 1.5;
    m.userData.base = m.position.y;
    m.userData.phase = k * 10;
    g.add(m);
  }
  g.userData.update = (t) => {
    for (const m of g.children) {
      m.position.y = m.userData.base + Math.sin(t * 0.6 + m.userData.phase) * 0.25;
      m.traverse((o) => {
        if (o.userData.spin) o.rotation.y = t * o.userData.spin;
      });
    }
  };
  return g;
}

let moteTex = null;
function buildMotes(theme) {
  if (!moteTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    moteTex = new THREE.CanvasTexture(c);
  }
  const n = 160;
  const pos = new Float32Array(n * 3);
  const rnd = mulberry(7);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * 40;
    pos[i * 3 + 1] = -3 + rnd() * 12;
    pos[i * 3 + 2] = -18 + rnd() * 22;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: moteTex, color: theme.accent, size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  mat.userData.outlineParameters = { visible: false };
  return new THREE.Points(geo, mat);
}

export function shade(hex, k) {
  const c = new THREE.Color(hex);
  return `#${c.multiplyScalar(k).getHexString()}`;
}
