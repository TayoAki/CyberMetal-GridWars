import * as THREE from 'three';
import { prepareModel, ModelActor } from '../../render3d/models.js';
import { readCustom } from '../../render3d/glb.js';
import { mechBytes } from '../assets.js';
import { toon, toonGradient, addRim } from './stage.js';

// The player's navi in GridWars Daily: their own .glb (loaded in the grid game, the open world or here,
// kept in the browser and shared by all three) or the built-in MECH. The grid game's ModelActor poses it
// from the battle state (recoil, slashes, hits, rigged arms); here it is scaled to the arena, stood in
// profile and re-shaded with the arena's toon look, so a Tripo model sits in the scene like the boss does.

export const NAVI_HEIGHT = 1.5;

// Load the navi: 'custom' (falling back to the mech when none is kept) or 'mech'. Resolves to
// { actor, name, kind, rig }.
export async function loadNavi(kind = 'custom') {
  let bytes = null;
  let name = 'MECH';
  if (kind === 'custom') {
    const rec = await readCustom().catch(() => null);
    if (rec) {
      bytes = rec.bytes;
      name = rec.name;
    } else kind = 'mech';
  }
  if (!bytes) bytes = await mechBytes();
  const template = await prepareModel(bytes, name);
  return { actor: makeActor(template), name, kind, rig: template.rig };
}

export function makeActor(template) {
  const actor = new ModelActor(template);
  actor.facingYaw = Math.PI / 2 - 0.42; // profile, turned a little toward the camera so the face reads
  actor.root.scale.setScalar(NAVI_HEIGHT / template.height);
  toonify(actor);
  return actor;
}

// Swap a model's lit materials for toon ones with the same textures and colours.
function toonify(actor) {
  const swap = new Map();
  const make = (m) => {
    if (swap.has(m)) return swap.get(m);
    if (m.isMeshBasicMaterial || m.isShaderMaterial) return m;
    const t = new THREE.MeshToonMaterial({
      gradientMap: toonGradient(),
      color: m.color ?? new THREE.Color('#ffffff'),
      map: m.map ?? null,
      emissive: m.emissive ?? new THREE.Color('#000000'),
      emissiveMap: m.emissiveMap ?? null,
      emissiveIntensity: m.emissiveIntensity ?? 1,
      normalMap: m.normalMap ?? null,
      alphaMap: m.alphaMap ?? null,
      transparent: m.transparent,
      opacity: m.opacity,
      alphaTest: m.alphaTest,
      side: m.side,
    });
    addRim(t);
    t.userData = { ...m.userData, baseEmissive: t.emissive.clone(), baseIntensity: t.emissiveIntensity, baseOpacity: t.opacity, baseTransparent: t.transparent };
    swap.set(m, t);
    return t;
  };
  actor.model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(make) : make(o.material);
  });
  actor.materials = actor.materials.map(make);
  // The chip props (blade, cannon) keep their glow but get outlines too.
  for (const p of Object.values(actor.props)) {
    p.traverse((o) => {
      if (o.isMesh && o.material.emissive && o.material.emissiveIntensity > 1) o.material.userData.outlineParameters = { visible: false };
      else if (o.isMesh) o.material = toon({ color: o.material.color });
    });
  }
}
