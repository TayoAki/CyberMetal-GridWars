// Graphics mode: classic 2D, or 3D battles. The 3D renderer (src/render3d) carries three.js, so it loads on
// first use. Battle views ask stage3d() every frame, so the mode can change in the middle of a battle.

let mode = '2d';
let mod = null;
let loading = null;
let failed = false;

export function setGraphics(m) {
  mode = m === '3d' ? '3d' : '2d';
  if (mode === '3d') load3d();
  return mode;
}

export const graphicsMode = () => mode;

// Load the 3D renderer (once). Resolves to it, or to null where it can't load.
export function load3d() {
  loading ??= import('../render3d/index.js').then(
    (m) => {
      mod = m;
      return m;
    },
    (e) => {
      failed = true;
      console.warn('3D graphics unavailable:', e?.message ?? e);
      return null;
    },
  );
  return loading;
}

// The loaded 3D renderer, or null.
export const renderer3d = () => mod;

// Whether 3D works here: true, false, or null while that isn't known yet.
export function has3d() {
  if (failed) return false;
  return mod ? !!mod.glLayer() : null;
}

// The 3D battle stage when 3D is on and ready, else null (the view draws in 2D, as it also does while the
// browser has taken the WebGL context away).
export function stage3d() {
  if (mode !== '3d' || !mod) return null;
  const layer = mod.glLayer();
  return layer && !layer.lost ? mod.battleStage() : null;
}

// Bracket each displayed frame: the 3D layer shows only on frames that drew in 3D.
export function beginFrame() {
  mod?.glLayer()?.beginFrame();
}
export function endFrame() {
  mod?.glLayer()?.endFrame();
}
