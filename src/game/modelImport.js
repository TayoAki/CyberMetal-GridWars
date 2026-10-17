import { load3d } from '../render/graphics.js';

// Bringing your own 3D model: pick a .glb (CUSTOMIZE > LOAD .GLB) or drop one on the page. It becomes the
// navi's custom model at once; src/render3d/models.js prepares and keeps it.

// Load `file` as the custom model and switch the look to it. Reports how it went with game.notify.
export async function importGlb(game, file) {
  if (!/\.glb$/i.test(file.name ?? '')) {
    game.notify('3D models load from .glb files (in Tripo: Export > GLB).');
    return { ok: false };
  }
  game.notify(`Loading ${file.name}...`, 600);
  const m = await load3d();
  if (!m?.glLayer()) {
    game.notify('3D models need WebGL, which this browser does not offer.');
    return { ok: false };
  }
  const r = await m.importModel(file);
  if (!r.ok) {
    game.notify(`Could not load ${file.name}: ${r.error}.`, 420);
    return r;
  }
  game.save.data.look = Object.freeze({ ...game.save.data.look, model: 'custom' });
  game.save.persist();
  const rig = r.rig === 'repaired' ? ' Its rig was rebuilt.' : r.rig === 'static' ? ' It has no usable rig, so it moves as one piece.' : '';
  const kept = r.stored ? '' : ' It is kept for this visit only (this browser blocks storage).';
  game.notify(`3D model ready: ${r.name}.${rig}${kept}`, 360);
  return r;
}

// Open the file picker. Call it from the key or tap that asked (browsers allow pickers only then).
let input = null;
export function pickGlb(game) {
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,model/gltf-binary';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) importGlb(game, file);
    });
    document.body.appendChild(input);
  }
  input.click();
}
