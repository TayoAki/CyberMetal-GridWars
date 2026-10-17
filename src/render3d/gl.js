import * as THREE from 'three';

// The 3D layer: one long-lived WebGL renderer on a canvas under the 2D screen (#screen3d below #screen).
// Scenes that draw in 3D render here and leave the matching part of the 2D canvas transparent; the layer is
// hidden on frames that draw nothing in 3D. Created on first use; null where WebGL is unavailable (the game
// then stays in classic 2D).

let layer;

export function glLayer() {
  if (layer !== undefined) return layer;
  layer = null;
  try {
    if (typeof document === 'undefined') return null;
    const screen = document.getElementById('screen');
    if (!screen) return null;
    const canvas = document.createElement('canvas');
    canvas.id = 'screen3d';
    canvas.setAttribute('aria-hidden', 'true');
    screen.parentElement.insertBefore(canvas, screen);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true; // bodies materialise bottom-up at the start of a battle
    layer = new Layer(screen, canvas, renderer);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      layer.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      layer.lost = false;
    });
  } catch (e) {
    console.warn('3D unavailable:', e?.message ?? e);
    layer = null;
  }
  return layer;
}

class Layer {
  constructor(screen, canvas, renderer) {
    this.screen = screen;
    this.canvas = canvas;
    this.renderer = renderer;
    this.drew = false;
    this.shown = false;
    this.lost = false;
    this.w = 0;
    this.h = 0;
    this.ratio = 0;
    canvas.style.visibility = 'hidden';
  }

  // Match the 2D screen's on-page size, at up to 2 device pixels per CSS pixel and about 2.4 megapixels.
  fit() {
    const w = this.screen.clientWidth || 240;
    const h = this.screen.clientHeight || 160;
    const ratio = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(2.4e6 / (w * h)));
    if (w === this.w && h === this.h && ratio === this.ratio) return;
    this.w = w;
    this.h = h;
    this.ratio = ratio;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
  }

  beginFrame() {
    this.drew = false;
  }

  // Render a scene over the whole screen, or into `box` (240x160 screen coordinates).
  render(scene, camera, box = null) {
    if (this.lost) return;
    this.fit();
    const r = this.renderer;
    if (box) {
      const sx = this.w / 240;
      const sy = this.h / 160;
      const x = Math.round(box.x * sx);
      const w = Math.round(box.w * sx);
      const h = Math.round(box.h * sy);
      const y = this.h - Math.round(box.y * sy) - h;
      r.setScissorTest(true);
      r.setScissor(x, y, w, h);
      r.setViewport(x, y, w, h);
    } else {
      r.setScissorTest(false);
      r.setViewport(0, 0, this.w, this.h);
    }
    r.render(scene, camera);
    this.drew = true;
  }

  // Show the layer only on frames that drew in 3D; the 2D screen turns see-through over it.
  endFrame() {
    if (this.drew === this.shown) return;
    this.shown = this.drew;
    this.canvas.style.visibility = this.drew ? 'visible' : 'hidden';
    this.screen.classList.toggle('over3d', this.drew);
  }
}
