import * as THREE from 'three';

// Visual effects for the open world: a pooled particle system (one draw call, additive soft points) and a glow
// texture drawn in code. Particles are simulated on the CPU at render rate; they are pure decoration and never
// feed back into the simulation.

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function glowSprite(color, size) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

const MAX = 2400;

export class Particles {
  // additive: glowing sparks and energy; otherwise normal alpha blending (dust, smoke).
  constructor(scene, { additive = true } = {}) {
    this.n = 0;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.size0 = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('color', this.aCol);
    geo.setAttribute('size', this.aSize);
    geo.setAttribute('alpha', this.aAlpha);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; uniform float scale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive
        ? `varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);
        }`
        : `varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5)) * 0.55;
          gl_FragColor = vec4(vColor, a * vAlpha);
        }`,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.color = new THREE.Color();
  }

  setViewportHeight(h) {
    this.points.material.uniforms.scale.value = h * 0.9;
  }

  emit(x, y, z, vx, vy, vz, color, size, life, { grav = 0, drag = 1.5, grow = 0 } = {}) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.color.set(color);
    this.col.set([this.color.r, this.color.g, this.color.b], i * 3);
    this.size0[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.grow[i] = grow;
  }

  // A spherical burst.
  burst(x, y, z, count, color, { speed = 6, size = 0.35, life = 0.6, grav = 0, up = 0, drag = 2.5, grow = 0, jitter = 0.2 } = {}) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.emit(
        x + (Math.random() - 0.5) * jitter, y + (Math.random() - 0.5) * jitter, z + (Math.random() - 0.5) * jitter,
        r * Math.cos(a) * sp, u * sp + up, r * Math.sin(a) * sp,
        color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), { grav, drag, grow },
      );
    }
  }

  // A flat ring of dust kicked out along the ground.
  ring(x, y, z, count, color, { speed = 6, size = 0.5, life = 0.5 } = {}) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.3;
      const sp = speed * (0.7 + Math.random() * 0.5);
      this.emit(x, y + 0.1, z, Math.cos(a) * sp, 0.6 + Math.random(), Math.sin(a) * sp, color, size, life, { drag: 4, grow: 1.2 });
    }
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i] - dt;
      if (life <= 0) continue;
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      const vx = this.vel[i3] * d;
      const vy = (this.vel[i3 + 1] - this.grav[i] * dt) * d;
      const vz = this.vel[i3 + 2] * d;
      const k = life / this.maxLife[i];
      // Compact the live particles to the front.
      const w3 = w * 3;
      this.pos[w3] = this.pos[i3] + vx * dt;
      this.pos[w3 + 1] = this.pos[i3 + 1] + vy * dt;
      this.pos[w3 + 2] = this.pos[i3 + 2] + vz * dt;
      this.vel[w3] = vx;
      this.vel[w3 + 1] = vy;
      this.vel[w3 + 2] = vz;
      this.col[w3] = this.col[i3];
      this.col[w3 + 1] = this.col[i3 + 1];
      this.col[w3 + 2] = this.col[i3 + 2];
      this.life[w] = life;
      this.maxLife[w] = this.maxLife[i];
      this.grav[w] = this.grav[i];
      this.drag[w] = this.drag[i];
      this.grow[w] = this.grow[i];
      this.size0[w] = this.size0[i];
      this.size[w] = this.size0[i] * (1 + this.grow[i] * (1 - k));
      this.alpha[w] = Math.min(1, k * 1.6);
      w++;
    }
    this.n = w;
    const geo = this.points.geometry;
    geo.setDrawRange(0, w);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, w * a.itemSize);
    }
  }
}

// A sword trail: a ribbon between the blade's base and tip over the last few frames, fading with age. Samples
// are subdivided (Catmull-Rom between frames) so a fast swing still draws a smooth arc.
const TRAIL_MAX = 48;
const TRAIL_LIFE = 0.17; // s a sample stays visible

export class SlashTrail {
  constructor(scene) {
    this.samples = []; // newest first: { b: Vector3, t: Vector3, age }
    this.pos = new Float32Array(TRAIL_MAX * 2 * 3);
    this.fade = new Float32Array(TRAIL_MAX * 2);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aFade = new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('fade', this.aFade);
    const idx = [];
    for (let i = 0; i < TRAIL_MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.color = new THREE.Color(0x6ae8ff);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { color: { value: this.color } },
      vertexShader: 'attribute float fade; varying float vF; void main(){ vF = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // White-hot near the newest edge, the blade colour further back.
      fragmentShader: 'uniform vec3 color; varying float vF; void main(){ float a = vF * vF; gl_FragColor = vec4(mix(color, vec3(1.0), a * 0.6) * a * 1.4, a); }',
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.last = null;
  }

  setColor(hex) {
    this.color.setHex(hex);
  }

  // Add the blade's current base and tip (world space); call once per rendered frame while swinging.
  push(base, tip) {
    const s = this.samples;
    if (s.length >= 2) {
      // Two in-between samples on a curve through the previous points.
      const [p1, p0] = [s[0], s[1]];
      for (const k of [1 / 3, 2 / 3]) {
        s.unshift({ b: catmull(p0.b, p1.b, base, base, k), t: catmull(p0.t, p1.t, tip, tip, k), age: p1.age * (1 - k) });
      }
    }
    s.unshift({ b: base.clone(), t: tip.clone(), age: 0 });
    if (s.length > TRAIL_MAX) s.length = TRAIL_MAX;
  }

  // Stop joining the next swing onto this one.
  cut() {
    this.samples.length = 0;
  }

  update(dt) {
    const s = this.samples;
    for (const p of s) p.age += dt;
    while (s.length && s[s.length - 1].age > TRAIL_LIFE) s.pop();
    const n = s.length;
    for (let i = 0; i < n; i++) {
      const p = s[i];
      const f = Math.max(0, 1 - p.age / TRAIL_LIFE);
      this.pos.set([p.b.x, p.b.y, p.b.z, p.t.x, p.t.y, p.t.z], i * 6);
      this.fade[i * 2] = f * 0.35; // the base edge is fainter than the tip
      this.fade[i * 2 + 1] = f;
    }
    this.aPos.needsUpdate = true;
    this.aFade.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, n >= 2 ? (n - 1) * 6 : 0);
  }
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return new THREE.Vector3(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z));
}

// The lock-on reticle: a ring with four inward ticks, drawn once into a texture and shown as a sprite.
let reticleTex = null;
export function reticleTexture() {
  if (reticleTex) return reticleTex;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.translate(N / 2, N / 2);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.lineWidth = 6;
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 4;
  for (let k = 0; k < 4; k++) {
    g.save();
    g.rotate((k * Math.PI) / 2);
    g.beginPath();
    g.arc(0, 0, 44, 0.25, Math.PI / 2 - 0.25);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -60);
    g.lineTo(-9, -46);
    g.lineTo(9, -46);
    g.closePath();
    g.fill();
    g.restore();
  }
  reticleTex = new THREE.CanvasTexture(c);
  reticleTex.colorSpace = THREE.SRGBColorSpace;
  return reticleTex;
}
