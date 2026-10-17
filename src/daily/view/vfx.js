import * as THREE from 'three';
import { cellX, cellZ, PANEL_W, PANEL_D } from './stage.js';

// GridWars Daily's effects: every spell the battle holds gets a visual from its shape (a shot along a row,
// a wave along the floor, a lob, a telegraphed drop, a zone, a warning), coloured by element, and the
// bosses' signature attacks get their own looks (saw blades, torpedo fish, fire towers, beams, petals).
// Battle events ('fx', hits, counters) spawn bursts: particles, rings, flashes, slashes and bolts. All
// additive and unlit, so the bloom makes them glow; none carry outlines.

export const PX = PANEL_W / 40; // one pixel of the 2D game's 40-px panels, in world units

const EL = {
  null: '#bfe8ff',
  fire: '#ff7a2a',
  aqua: '#4ad8ff',
  elec: '#ffe14a',
  wood: '#7aff5a',
};
const TYPE_COLOR = {
  voidwave: '#b86aff', voidbeam: '#c86aff', nullshot: '#c86aff', voidwarn: '#ff3a8a', voidland: '#b86aff',
  sabrewave: '#ff4a6a', sawblade: '#e8eef8', piston: '#ffb04a', petals: '#ff8ac8', petalwarn: '#ff8ac8', roots: '#9aff6a',
  arcbolt: '#ffe95a', zapwarn: '#ffe95a', tidebubble: '#7ae8ff', torpedofish: '#5ad8ff', tidegeyser: '#bff4ff',
  firetower2: '#ff6a2a', pyreflame: '#ff8a2a', flamejet: '#ff6a2a', rakewarn: '#ff4a4a', pounce: '#ffffff', briarthorn: '#9aff6a',
  reflect: '#ff5ae0', buster: '#ffe14a',
};
const GROUND = new Set(['shockwave', 'voidwave', 'gloopwave', 'icewave', 'lavawave', 'mudwave', 'wave', 'eruption']);

const additive = (color, opacity = 1) => {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  m.userData.outlineParameters = { visible: false };
  return m;
};

// ---------------------------------------------------------------- particles

const PARTICLE_VERT = `attribute float size; attribute float alpha; attribute vec3 tint; varying float vAlpha; varying vec3 vTint;
void main() { vAlpha = alpha; vTint = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PARTICLE_FRAG = `varying float vAlpha; varying vec3 vTint;
void main() { vec2 p = gl_PointCoord - 0.5; float d = dot(p, p); if (d > 0.25) discard; float k = smoothstep(0.25, 0.0, d); gl_FragColor = vec4(vTint * (0.6 + 1.6 * k), vAlpha * k); }`;

class Particles {
  constructor(scene, max = 3000) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    const geo = (this.geo = new THREE.BufferGeometry());
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.sizeA = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.alphaA = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.tintA = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    for (const a of [this.pos, this.sizeA, this.alphaA, this.tintA]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('size', this.sizeA);
    geo.setAttribute('alpha', this.alphaA);
    geo.setAttribute('tint', this.tintA);
    const mat = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.userData.outlineParameters = { visible: false };
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.c = new THREE.Color();
  }

  emit(x, y, z, { n = 12, speed = 2, up = 1, color = '#ffffff', size = 0.18, life = 0.5, gravity = 4, spread = 1, dir = null } = {}) {
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      if (this.n >= this.max) return;
      const k = this.n++;
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI * 0.5 * spread;
      const s = speed * (0.4 + Math.random() * 0.8);
      let vx = Math.cos(a) * Math.cos(e) * s;
      let vz = Math.sin(a) * Math.cos(e) * s * 0.6;
      let vy = (Math.sin(e) * s + up * (0.5 + Math.random()));
      if (dir) {
        vx = dir[0] * s + (Math.random() - 0.5) * s * 0.4;
        vy = dir[1] * s + (Math.random() - 0.5) * s * 0.4;
        vz = dir[2] * s + (Math.random() - 0.5) * s * 0.4;
      }
      this.p.set([x, y, z], k * 3);
      this.v.set([vx, vy, vz], k * 3);
      this.life[k] = life * (0.6 + Math.random() * 0.7);
      this.age[k] = 0;
      this.size0[k] = size * (0.6 + Math.random() * 0.8);
      this.grav[k] = gravity;
      this.tintA.setXYZ(k, this.c.r, this.c.g, this.c.b);
    }
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      if (w !== i) {
        this.p.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.v.copyWithin(w * 3, i * 3, i * 3 + 3);
        this.life[w] = this.life[i];
        this.age[w] = this.age[i];
        this.size0[w] = this.size0[i];
        this.grav[w] = this.grav[i];
        this.tintA.setXYZ(w, this.tintA.getX(i), this.tintA.getY(i), this.tintA.getZ(i));
      }
      const j = w * 3;
      this.v[j + 1] -= this.grav[w] * dt;
      this.v[j] *= 0.97;
      this.v[j + 2] *= 0.97;
      this.p[j] += this.v[j] * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += this.v[j + 2] * dt;
      const k = this.age[w] / this.life[w];
      this.pos.setXYZ(w, this.p[j], this.p[j + 1], this.p[j + 2]);
      this.sizeA.setX(w, this.size0[w] * (1 - k * 0.6));
      this.alphaA.setX(w, 1 - k);
      w++;
    }
    this.n = w;
    this.geo.setDrawRange(0, w);
    for (const a of [this.pos, this.sizeA, this.alphaA, this.tintA]) a.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- one-shot shapes

class Burst {
  constructor(obj, life, update) {
    this.obj = obj;
    this.life = life;
    this.age = 0;
    this.update = update;
  }
}

// ---------------------------------------------------------------- spells

const geo = {
  orb: new THREE.SphereGeometry(1, 16, 12),
  ring: new THREE.RingGeometry(0.8, 1, 32),
  disc: new THREE.CircleGeometry(1, 32),
  quad: new THREE.PlaneGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true),
  cone: new THREE.ConeGeometry(1, 1, 16, 1, true),
  saw: (() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = i % 2 ? 0.78 : 1;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.25, 0, Math.PI * 2, true);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
  })(),
  crescent: new THREE.RingGeometry(0.6, 1, 24, 1, -Math.PI / 2.2, Math.PI / 1.1),
  petal: new THREE.PlaneGeometry(0.14, 0.09),
};

function colorOf(s) {
  return TYPE_COLOR[s.type] ?? EL[s.element] ?? EL.null;
}

// A visual for one spell. update(s, t, dt) each frame; end() when the spell is gone (it fades out).
class SpellView {
  constructor(vfx, s) {
    this.vfx = vfx;
    this.group = new THREE.Group();
    vfx.scene.add(this.group);
    this.color = colorOf(s);
    this.kind = kindOf(s);
    this.parts = [];
    this.fade = 0;
    this.build(s);
  }

  add(geometry, color, opacity = 1) {
    const m = new THREE.Mesh(geometry, additive(color, opacity));
    this.group.add(m);
    this.parts.push(m);
    return m;
  }

  build(s) {
    const c = this.color;
    switch (this.kind) {
      case 'saw':
        this.core = new THREE.Mesh(geo.saw, new THREE.MeshToonMaterial({ color: '#dfe6f2', emissive: '#40485a' }));
        this.core.scale.setScalar(0.32);
        this.group.add(this.core);
        this.halo = this.add(geo.ring, '#ffffff', 0.5);
        this.halo.scale.setScalar(0.42);
        break;
      case 'fish': {
        this.core = new THREE.Group();
        const body = new THREE.Mesh(geo.orb, new THREE.MeshToonMaterial({ color: '#3a9ad8', emissive: '#103a5a' }));
        body.scale.set(0.42, 0.16, 0.14);
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), new THREE.MeshToonMaterial({ color: '#ffd25a' }));
        fin.rotation.z = Math.PI / 2;
        fin.position.x = -0.44;
        const eye = new THREE.Mesh(geo.orb, additive('#ffffff'));
        eye.scale.setScalar(0.035);
        eye.position.set(0.28, 0.04, 0.1);
        this.core.add(body, fin, eye);
        this.group.add(this.core);
        break;
      }
      case 'pillar':
        this.core = this.add(geo.cyl, c, 0.8);
        this.inner = this.add(geo.cyl, '#ffe9a8', 0.9);
        break;
      case 'beam':
        this.core = this.add(geo.box, c, 0.32);
        this.inner = this.add(geo.box, '#ffd8ff', 0.55);
        break;
      case 'crescent':
        this.core = this.add(geo.crescent, c, 0.95);
        this.core.scale.set(0.5, 0.7, 1);
        break;
      case 'ground':
        this.core = this.add(geo.cone, c, 0.85);
        this.core.scale.set(0.32, 0.55, 0.32);
        break;
      case 'lob':
        this.core = this.add(geo.orb, c, 1);
        this.core.scale.setScalar(0.16);
        this.mark = this.add(geo.ring, c, 0.8);
        this.mark.rotation.x = -Math.PI / 2;
        break;
      case 'drop':
        this.mark = this.add(geo.ring, c, 0.9);
        this.mark.rotation.x = -Math.PI / 2;
        this.dot = this.add(geo.disc, c, 0.25);
        this.dot.rotation.x = -Math.PI / 2;
        this.core = this.add(s.type === 'piston' ? geo.box : geo.orb, s.type === 'piston' ? '#ffb04a' : c, 1);
        this.core.visible = false;
        break;
      case 'zone':
      case 'warn': {
        this.tiles = [];
        for (const [cc, rr] of s.data.cells ?? [[s.col, s.row]]) {
          const tile = this.add(geo.quad, c, this.kind === 'warn' ? 0.35 : 0.5);
          tile.rotation.x = -Math.PI / 2;
          tile.scale.set(PANEL_W * 0.92, PANEL_D * 0.92, 1);
          tile.position.set(cellX(cc), 0.03, cellZ(rr));
          this.tiles.push(tile);
        }
        break;
      }
      case 'claw':
        this.core = this.add(geo.quad, '#ff4a4a', 0.0);
        this.core.rotation.x = -Math.PI / 2;
        this.core.scale.set(PANEL_W * 0.9, PANEL_D * 0.9, 1);
        break;
      case 'dash':
        this.core = this.add(geo.box, '#ffffff', 0.6);
        this.core.scale.set(1.2, 0.5, 0.25);
        break;
      default: {
        // A shot: a bright core in a coloured glow, trailing.
        const big = /cannon|charge|plasma|bubble|tide|meteor|ball|bomb/.test(s.type);
        const r = big ? 0.17 : 0.11;
        this.core = this.add(geo.orb, '#ffffff', 1);
        this.core.scale.setScalar(r * 0.6);
        this.halo = this.add(geo.orb, c, 0.55);
        this.halo.scale.setScalar(r);
        this.tail = this.add(geo.quad, c, 0.4);
        this.tail.scale.set(0.55, r * 1.2, 1);
        break;
      }
    }
  }

  update(s, t, dt) {
    const x = cellX(s.x ?? s.col);
    const z = cellZ(s.y ?? s.row);
    const y = (s.z ?? 0) * PX;
    const k = s.data?.progress ?? 0;
    switch (this.kind) {
      case 'saw':
        this.group.position.set(x, 0.75, z);
        this.core.rotation.z = t * 22 * (s.dir ?? 1);
        this.halo.rotation.z = -t * 4;
        if (Math.random() < 0.5) this.vfx.particles.emit(x, 0.45, z, { n: 1, speed: 2.5, color: '#ffd25a', size: 0.08, life: 0.25, gravity: 8 });
        break;
      case 'fish':
        this.group.position.set(x, s.data.phase === 'surface' ? 0.15 + Math.sin(t * 30) * 0.04 : 0.32, z);
        this.core.scale.x = s.dir < 0 ? -1 : 1;
        if (s.data.phase === 'dash' && Math.random() < 0.8) this.vfx.particles.emit(x - (s.dir ?? -1) * 0.4, 0.3, z, { n: 1, speed: 0.6, color: '#bff4ff', size: 0.12, life: 0.4, gravity: -1 });
        break;
      case 'pillar': {
        const rise = s.data.phase === 'rise' ? k : 1;
        const h = 2.2 * rise;
        this.group.position.set(cellX(s.col), 0, cellZ(s.y ?? s.row));
        this.core.scale.set(0.42, h, 0.42);
        this.core.position.y = h / 2;
        this.inner.scale.set(0.2, h * 1.02, 0.2);
        this.inner.position.y = h / 2;
        this.core.rotation.y = t * 6;
        if (Math.random() < 0.9) this.vfx.particles.emit(this.group.position.x, 0.3, this.group.position.z, { n: 2, speed: 0.8, up: 3, color: rise < 1 ? '#ffb03a' : '#ff6a2a', size: 0.22, life: 0.5, gravity: -2 });
        break;
      }
      case 'beam': {
        const from = s.data.fromCol ?? s.col;
        const dir = s.data.dir ?? -1;
        const end = dir < 0 ? -0.5 : 5.5;
        const len = Math.abs(cellX(end) - cellX(from));
        const flick = 0.85 + 0.15 * Math.sin(t * 60);
        this.group.position.set((cellX(from) + cellX(end)) / 2, 0.75, cellZ(s.row));
        this.core.scale.set(len, 0.46 * flick, 0.46 * flick);
        this.inner.scale.set(len, 0.13, 0.13);
        if (Math.random() < 0.9) this.vfx.particles.emit(cellX(end) + (Math.random() - 0.5) * len, 0.75, cellZ(s.row), { n: 2, speed: 2, color: this.color, size: 0.2, life: 0.35, gravity: 0 });
        break;
      }
      case 'crescent':
        this.group.position.set(x, 0.75, z);
        this.core.rotation.y = s.dir < 0 ? Math.PI : 0;
        this.core.rotation.z = Math.sin(t * 20) * 0.1;
        break;
      case 'ground':
        this.group.position.set(cellX(s.col), 0.25, z);
        this.core.position.x = 0;
        this.core.scale.y = 0.55 + Math.sin(t * 40) * 0.08;
        if (Math.random() < 0.7) this.vfx.particles.emit(cellX(s.col), 0.1, z, { n: 1, speed: 1.2, up: 1.5, color: this.color, size: 0.18, life: 0.4 });
        break;
      case 'lob':
        this.core.position.set(x, 0.3 + y, z);
        if (s.data.target) this.mark.position.set(cellX(s.data.target.col), 0.04, cellZ(s.data.target.row));
        this.mark.scale.setScalar(0.35 + 0.1 * Math.sin(t * 12));
        if (Math.random() < 0.6) this.vfx.particles.emit(x, 0.3 + y, z, { n: 1, speed: 0.2, color: this.color, size: 0.1, life: 0.3, gravity: 0 });
        break;
      case 'drop': {
        const px = cellX(s.col);
        const pz = cellZ(s.row);
        this.mark.position.set(px, 0.04, pz);
        this.dot.position.set(px, 0.035, pz);
        const r = 0.65 - 0.4 * k;
        this.mark.scale.setScalar(Math.max(0.2, r));
        this.mark.rotation.z = t * 3;
        this.dot.scale.setScalar(0.25 + 0.4 * k);
        this.dot.material.opacity = 0.15 + 0.35 * k;
        if (s.type === 'piston' || s.type === 'nullshot' || s.type === 'meteor' || s.type === 'kitemeteor') {
          // The thing falling: visible over the last stretch of the telegraph.
          const fall = Math.max(0, (k - 0.55) / 0.45);
          this.core.visible = !s.data.landed && fall > 0;
          this.core.position.set(px, 0.3 + (1 - fall) * 4, pz);
          this.core.scale.setScalar(s.type === 'piston' ? 0.32 : 0.2);
        }
        if (s.data.landed && !this.landed) {
          this.landed = true;
          this.vfx.impact(s, px, pz, this.color);
        }
        break;
      }
      case 'zone':
      case 'warn': {
        const pulse = this.kind === 'warn' ? 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 18)) : 0.4 + 0.2 * Math.sin(t * 25);
        for (const tile of this.tiles) tile.material.opacity = pulse;
        if (this.kind === 'zone') {
          for (const tile of this.tiles) {
            if (Math.random() < 0.6) {
              const type = s.type;
              const opts = type === 'petals'
                ? { n: 2, speed: 2.4, up: 1, color: Math.random() < 0.5 ? '#ff8ac8' : '#ffd0e8', size: 0.16, life: 0.6, gravity: 0 }
                : type === 'voidbeam'
                  ? { n: 1, speed: 1, color: '#c86aff', size: 0.2, life: 0.3, gravity: 0 }
                  : { n: 2, speed: 0.8, up: 2.6, color: Math.random() < 0.5 ? this.color : '#ffd25a', size: 0.24, life: 0.5, gravity: -2 };
              this.vfx.particles.emit(tile.position.x + (Math.random() - 0.5) * 0.8, 0.15, tile.position.z + (Math.random() - 0.5) * 0.5, opts);
            }
          }
        }
        break;
      }
      case 'claw': {
        this.group.position.set(cellX(s.col), 0.03, cellZ(s.row));
        this.core.material.opacity = s.data.struck ? 0 : 0.15 + 0.5 * k;
        if (s.data.struck && !this.struck) {
          this.struck = true;
          this.vfx.slash(cellX(s.col), 0.6, cellZ(s.row), '#ff5a5a', -1);
        }
        break;
      }
      case 'dash':
        this.group.position.set(x, 0.7, z);
        if (Math.random() < 0.9) this.vfx.particles.emit(x, 0.7, z, { n: 2, speed: 0.5, color: '#ffffff', size: 0.2, life: 0.25, gravity: 0 });
        break;
      default: {
        this.group.position.set(x, 0.72 + y, z);
        this.tail.position.x = -(s.dir ?? 1) * 0.3;
        this.tail.lookAt(this.vfx.camera.position);
        this.tail.position.x = -(s.dir ?? 1) * 0.3;
        this.halo.scale.setScalar(this.halo.scale.x * 0.9 + (0.13 + 0.03 * Math.sin(t * 40)) * 0.1);
        if (Math.random() < 0.4) this.vfx.particles.emit(this.group.position.x, this.group.position.y, z, { n: 1, speed: 0.3, color: this.color, size: 0.12, life: 0.25, gravity: 0 });
        break;
      }
    }
  }

  end() {
    this.group.removeFromParent();
    for (const p of this.parts) p.material.dispose();
    this.core?.material?.dispose?.();
  }
}

function kindOf(s) {
  const t = s.type;
  if (t === 'sawblade') return 'saw';
  if (t === 'torpedofish') return 'fish';
  if (t === 'firetower2' || t === 'firetower' || t === 'tidegeyser_') return 'pillar';
  if (t === 'voidbeam' || t === 'eyebeam') return 'beam';
  if (t === 'sabrewave') return 'crescent';
  if (t === 'rakewarn') return 'claw';
  if (t === 'pounce') return 'dash';
  if (GROUND.has(t)) return 'ground';
  if (s.data?.target) return 'lob';
  if (s.data?.delay !== undefined) return 'drop';
  if (s.data?.cells) return s.hit ? 'zone' : 'warn';
  if (!s.hit) return 'warn';
  if (t === 'flamejet' || t === 'pyreflame' || t === 'petals' || t === 'flames' || t === 'sporecloud' || t === 'tornado') return 'zone';
  return 'shot';
}

// ---------------------------------------------------------------- the effects layer

const FX = {
  explosion: { color: '#ffb04a', n: 26, speed: 3.2, ring: '#ffd27a', flash: '#fff2c8', smoke: true },
  explode: { color: '#ffb04a', n: 22, speed: 3, ring: '#ffd27a', flash: '#fff2c8' },
  bigexplode: { color: '#ff8a3a', n: 40, speed: 4.5, ring: '#ffd27a', flash: '#ffffff', shake: 4 },
  burst: { color: '#ffffff', n: 14, speed: 2.4, flash: '#ffffff' },
  arcstrike: { color: '#ffe95a', n: 20, speed: 3.4, bolt: true, flash: '#fffbd0' },
  zap: { color: '#ffe95a', n: 12, speed: 3, bolt: true },
  lampzap: { color: '#ffe95a', n: 10, speed: 3, flash: '#fffbd0' },
  voltburst: { color: '#ffe95a', n: 30, speed: 4, ring: '#fff6a0', flash: '#ffffff' },
  flash: { screen: '#ffffff' },
  tidesplash: { color: '#7ae8ff', n: 22, speed: 2.6, up: 3, ring: '#bff4ff' },
  bubblepop: { color: '#bff4ff', n: 10, speed: 2, ring: '#bff4ff' },
  pyreburst: { color: '#ff7a2a', n: 26, speed: 3, up: 2, flash: '#ffd25a' },
  emberheal: { color: '#8aff7a', n: 14, speed: 1, up: 2.5, gravity: -1 },
  recover: { color: '#8aff7a', n: 22, speed: 0.8, up: 3, gravity: -1.5 },
  briarbloom: { color: '#ff8ac8', n: 12, speed: 1.6, up: 2 },
  rootburst: { color: '#9aff6a', n: 22, speed: 2.4, up: 3, ring: '#c8ff9a' },
  pistonhit: { color: '#ffd27a', n: 26, speed: 3.4, ring: '#ffffff', flash: '#ffffff', shake: 5 },
  ironquake: { color: '#c8b48a', n: 16, speed: 2.6, ring: '#ffe0a8', shake: 3 },
  ironsteam: { color: '#e8eef8', n: 14, speed: 1.2, up: 1.5, gravity: -0.5 },
  nullburst: { color: '#c86aff', n: 16, speed: 2.6, ring: '#e0a8ff' },
  voidquake: { color: '#b86aff', n: 40, speed: 4, ring: '#e0a8ff', flash: '#f0d8ff', shake: 6 },
  zeroaura: { color: '#c86aff', n: 30, speed: 1.6, ring: '#c86aff' },
  aurablock: { color: '#c86aff', n: 8, speed: 2, ring: '#e0a8ff' },
  aurabreak: { color: '#ffffff', n: 40, speed: 4.5, ring: '#ffffff', flash: '#ffffff', shake: 4 },
  guard: { color: '#7af4ff', n: 10, speed: 2, ring: '#7af4ff' },
  warp: { color: '#7af4ff', n: 14, speed: 1.6, up: 0.5, ring: '#bff8ff', gravity: 0 },
  rakeclaw: { color: '#ff5a5a', n: 8, speed: 2, slash: '#ff8a8a' },
  sabreslash: { color: '#ff5a7a', n: 12, speed: 2.6, slash: '#ffb0c0' },
  slash: { color: '#ffffff', n: 10, speed: 2.4, slash: '#bff4ff' },
  howlwave: { color: '#ffffff', n: 0, ring: '#ffffff' },
  stun: { color: '#ffe95a', n: 10, speed: 1, up: 1.5, gravity: 0 },
  panelfall: { color: '#ff5a7a', n: 8, speed: 1.2, up: 1 },
  default: { color: '#bfe8ff', n: 12, speed: 2.2 },
};

export class Vfx {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.particles = new Particles(this.scene);
    this.views = new Map(); // spell id -> SpellView
    this.bursts = [];
    this.screen = null; // { color, k }
  }

  sync(b, t, dt) {
    const live = new Set();
    for (const s of b.spells) {
      if (!s.alive) continue;
      live.add(s.id);
      let v = this.views.get(s.id);
      if (!v) this.views.set(s.id, (v = new SpellView(this, s)));
      v.update(s, t, dt);
    }
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      v.end();
      this.views.delete(id);
    }
    this.tick(dt);
  }

  tick(dt) {
    this.particles.update(dt);
    for (const bu of this.bursts) {
      bu.age += dt;
      bu.update(Math.min(1, bu.age / bu.life), bu.obj);
    }
    this.bursts = this.bursts.filter((bu) => {
      if (bu.age < bu.life) return true;
      bu.obj.removeFromParent();
      bu.obj.material?.dispose();
      return false;
    });
  }

  clear() {
    for (const v of this.views.values()) v.end();
    this.views.clear();
    for (const bu of this.bursts) bu.obj.removeFromParent();
    this.bursts = [];
    this.particles.n = 0;
  }

  // ---- shapes

  ring(x, y, z, color, size = 1, life = 0.35, flat = true) {
    const m = new THREE.Mesh(geo.ring, additive(color, 0.9));
    m.position.set(x, y, z);
    if (flat) m.rotation.x = -Math.PI / 2;
    else m.lookAt(this.camera.position);
    this.scene.add(m);
    this.bursts.push(new Burst(m, life, (k, o) => {
      o.scale.setScalar(0.2 + size * k);
      o.material.opacity = 0.9 * (1 - k);
    }));
  }

  flash(x, y, z, color, size = 0.6, life = 0.18) {
    const m = new THREE.Mesh(geo.orb, additive(color, 1));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.bursts.push(new Burst(m, life, (k, o) => {
      o.scale.setScalar(size * (0.4 + k));
      o.material.opacity = 1 - k;
    }));
  }

  slash(x, y, z, color, dir = 1) {
    const m = new THREE.Mesh(geo.crescent, additive(color, 1));
    m.position.set(x, y, z);
    m.rotation.set(0, dir < 0 ? Math.PI : 0, -0.6);
    this.scene.add(m);
    this.bursts.push(new Burst(m, 0.22, (k, o) => {
      o.scale.set(0.5 + 0.3 * k, 0.8, 1);
      o.rotation.z = -0.6 + 1.6 * k;
      o.material.opacity = 1 - k;
    }));
  }

  bolt(x, z, color) {
    // A jagged column of light from the sky.
    const pts = [];
    let px = x;
    let pz = z;
    for (let i = 0; i <= 8; i++) {
      pts.push(new THREE.Vector3(px, 5 - i * 0.62, pz));
      px = x + (Math.random() - 0.5) * 0.5;
      pz = z + (Math.random() - 0.5) * 0.3;
    }
    pts[pts.length - 1].set(x, 0.05, z);
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 24, 0.05, 5);
    const m = new THREE.Mesh(g, additive(color, 1));
    this.scene.add(m);
    this.bursts.push(new Burst(m, 0.2, (k, o) => {
      o.material.opacity = 1 - k;
      if (k >= 1) o.geometry.dispose();
    }));
  }

  beamShot(c0, c1, row, color, width = 0.08) {
    const x0 = cellX(c0) + 0.4 * Math.sign(c1 - c0);
    const x1 = cellX(Math.max(-0.5, Math.min(5.5, c1)));
    const m = new THREE.Mesh(geo.box, additive(color, 1));
    m.position.set((x0 + x1) / 2, 0.8, cellZ(row));
    m.scale.set(Math.abs(x1 - x0), width, width);
    this.scene.add(m);
    this.bursts.push(new Burst(m, 0.12, (k, o) => {
      o.scale.y = o.scale.z = width * (1 - k);
      o.material.opacity = 1 - k;
    }));
  }

  impact(s, x, z, color) {
    if (s.type === 'arcbolt') this.bolt(x, z, '#fff6a0');
    if (s.type === 'roots') for (let i = 0; i < 5; i++) this.spike(x + (Math.random() - 0.5) * 0.9, z + (Math.random() - 0.5) * 0.6, '#9aff6a');
    if (s.type === 'tidegeyser') this.geyser(x, z);
    this.flash(x, 0.3, z, color, 0.7);
    this.ring(x, 0.05, z, color, 1.1);
  }

  spike(x, z, color) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7, 5), new THREE.MeshToonMaterial({ color: '#3a7a2a', emissive: color, emissiveIntensity: 0.3 }));
    m.position.set(x, 0, z);
    this.scene.add(m);
    this.bursts.push(new Burst(m, 0.9, (k, o) => {
      o.position.y = k < 0.2 ? (k / 0.2) * 0.35 : 0.35 - Math.max(0, k - 0.7) * 1.2;
      if (k >= 1) o.geometry.dispose();
    }));
  }

  geyser(x, z) {
    const m = new THREE.Mesh(geo.cyl, additive('#bff4ff', 0.8));
    m.position.set(x, 0, z);
    this.scene.add(m);
    this.bursts.push(new Burst(m, 0.5, (k, o) => {
      const h = 2.4 * Math.sin(k * Math.PI);
      o.scale.set(0.3, Math.max(0.01, h), 0.3);
      o.position.y = h / 2;
      o.material.opacity = 0.8 * (1 - k * 0.5);
    }));
    this.particles.emit(x, 0.2, z, { n: 24, speed: 1.4, up: 6, color: '#bff4ff', size: 0.2, life: 0.7, gravity: 9 });
  }

  // A battle event at panel (col, row).
  fx(ev) {
    const name = ev.fx;
    if (name === 'buster' || name === 'chargeshot') {
      const charged = name === 'chargeshot';
      this.beamShot(ev.col, ev.toCol, ev.row, charged ? '#ff8ae8' : '#ffe14a', charged ? 0.26 : 0.07);
      this.flash(cellX(ev.col) + 0.45 * (ev.dir ?? 1), 0.8, cellZ(ev.row), charged ? '#ff8ae8' : '#fff2a0', charged ? 0.5 : 0.25, 0.1);
      if (ev.hit) this.particles.emit(cellX(ev.toCol), 0.8, cellZ(ev.row), { n: charged ? 18 : 6, speed: 2.5, color: charged ? '#ff8ae8' : '#ffe14a', size: 0.12, life: 0.3 });
      return;
    }
    if (ev.col === undefined || ev.row === undefined) {
      if (name === 'flash') this.screen = { color: '#ffffff', k: 1 };
      return;
    }
    const st = FX[name] ?? FX.default;
    const x = cellX(ev.col);
    const z = cellZ(ev.row);
    const y = 0.5;
    if (st.n) this.particles.emit(x, y, z, { n: st.n, speed: st.speed ?? 2, up: st.up ?? 1, color: st.color, size: 0.2, life: 0.5, gravity: st.gravity ?? 4 });
    if (st.ring) this.ring(x, 0.06, z, st.ring, 1.0);
    if (st.flash) this.flash(x, y, z, st.flash, 0.6);
    if (st.slash) this.slash(x, 0.7, z, st.slash, ev.dir ?? -1);
    if (st.bolt) this.bolt(x, z, '#fff6a0');
    if (st.smoke) this.particles.emit(x, 0.3, z, { n: 8, speed: 0.6, up: 1.4, color: '#5a4a6a', size: 0.4, life: 0.8, gravity: -0.5 });
    if (st.shake) this.stage.shake = Math.max(this.stage.shake, st.shake);
    if (st.screen) this.screen = { color: st.screen, k: 1 };
  }

  hit(x, y, z, color = '#ffffff', big = false) {
    this.particles.emit(x, y, z, { n: big ? 18 : 8, speed: big ? 3.4 : 2.2, color, size: 0.14, life: 0.3 });
    this.flash(x, y, z, color, big ? 0.55 : 0.3, 0.12);
  }
}
