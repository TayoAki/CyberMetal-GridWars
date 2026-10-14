// The player mech: a model the project owner generated with Tripo AI, its skeleton rebuilt and its texture
// slimmed by tools/repair_glb.py. In development it is fetched next to the sources; the single-file build
// replaces this module with one that carries the model inline (see tools/build.mjs).
export async function loadMechaBuffer() {
  const res = await fetch(new URL('../../assets/mecha.glb', import.meta.url));
  if (!res.ok) throw new Error(`mecha.glb: HTTP ${res.status}`);
  return res.arrayBuffer();
}
