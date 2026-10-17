import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';

// GridWars Daily's 3D stage: a cel-shaded, outlined scene with bloom on everything that glows. The 6x3 grid
// sits at the origin, columns along x (the player's side at -x), rows along z (row 0 at the back), and the
// camera looks on from the front, so the two navis face each other in profile.
//
// One look for everything (toon shading, ink outlines, a rim light in the arena's colour) is what lets a
// player's own model stand beside a procedural boss without looking out of place.

export const PANEL_W = 1.5;
export const PANEL_D = 1.1;
export const cellX = (c) => (c - 2.5) * PANEL_W;
export const cellZ = (r) => (r - 1) * PANEL_D;

// Toon shading: three bands of light.
let gradient = null;
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 170, 255]);
  gradient = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

// A rim light every toon material shares: the arena's colour, brightest at grazing angles.
export const RIM = { color: { value: new THREE.Color('#7af4ff') }, power: { value: 2.6 }, strength: { value: 0.55 } };

export function toon(params = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
  addRim(m);
  return m;
}

export function addRim(m) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = RIM.color;
    shader.uniforms.rimPower = RIM.power;
    shader.uniforms.rimStrength = RIM.strength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;\nuniform float rimStrength;')
      .replace(
        '#include <opaque_fragment>',
        'float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), rimPower);\noutgoingLight += rimColor * rimK * rimStrength;\n#include <opaque_fragment>',
      );
  };
  m.customProgramCacheKey = () => 'rim';
  return m;
}

// Glowing parts: unlit, bright enough for the bloom, no outline.
export function glow(color, params = {}) {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, ...params });
  m.userData.outlineParameters = { visible: false };
  return m;
}

// Renders the scene and its outlines into the composer's buffer.
class OutlinedRender extends Pass {
  constructor(effect, scene, camera) {
    super();
    this.effect = effect;
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    if (this.outlines) this.effect.render(this.scene, this.camera);
    else renderer.render(this.scene, this.camera);
  }
}

export class Stage {
  constructor(canvas, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
    this.lookAt = new THREE.Vector3(0, 0.75, 0.1);
    this.view = { elevation: 0.5, azimuth: 0, distance: 10, extra: 0 }; // radians, units
    this.shake = 0;
    this.punch = 0;

    // Light: a warm key from the upper left (the player's side), a cool fill, the sky's ambience.
    this.hemi = new THREE.HemisphereLight('#dfe8ff', '#30264a', 1.1);
    this.key = new THREE.DirectionalLight('#fff4e6', 2.4);
    this.key.position.set(-6, 12, 9);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
    Object.assign(this.key.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5, near: 1, far: 40 });
    this.key.shadow.bias = -0.0008;
    this.key.shadow.normalBias = 0.02;
    this.fill = new THREE.DirectionalLight('#9ab8ff', 0.7);
    this.fill.position.set(8, 5, 6);
    this.scene.add(this.hemi, this.key, this.fill, this.key.target);

    this.effect = new OutlineEffect(renderer, { defaultThickness: 0.0042, defaultColor: [0.03, 0.02, 0.07] });
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: quality === 'low' ? 0 : 4 });
    this.composer = new EffectComposer(renderer, target);
    this.main = new OutlinedRender(this.effect, this.scene, this.camera);
    this.main.outlines = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.85, 0.55, 0.82);
    this.composer.addPass(this.main);
    if (quality !== 'low') this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set((w * dpr) / 2, (h * dpr) / 2);
    this.camera.aspect = w / h;
    this.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Center the picture on a part of the screen (CSS pixels from the top left), or on all of it (null).
  frameIn(cx = null, cy = null) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (cx === null) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.camera.updateProjectionMatrix();
  }

  // How far back the camera must sit to fit the whole grid (and the navis standing on it).
  fitDistance() {
    const v = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const h = v * this.aspect;
    const halfWidth = 3 * PANEL_W + 0.6;
    return Math.max(halfWidth / h, 2.2 / v) + this.view.extra;
  }

  // Place the camera: the battle view, or a framing the caller sets (view.target, view.distance).
  aim(t) {
    const v = this.view;
    const dist = v.distance ?? this.fitDistance();
    const target = v.target ?? this.lookAt;
    const ce = Math.cos(v.elevation);
    const shake = this.shake > 0 ? this.shake * 0.08 : 0;
    this.camera.position.set(
      target.x + Math.sin(v.azimuth) * ce * dist + (shake ? Math.sin(t * 91) * shake : 0),
      target.y + Math.sin(v.elevation) * dist + (shake ? Math.cos(t * 73) * shake : 0),
      target.z + Math.cos(v.azimuth) * ce * dist - this.punch,
    );
    this.camera.lookAt(target);
    this.shake = Math.max(0, this.shake - 0.06);
    this.punch *= 0.85;
  }

  render(t) {
    this.aim(t);
    this.composer.render();
  }

  dispose() {
    this.ro.disconnect();
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}
