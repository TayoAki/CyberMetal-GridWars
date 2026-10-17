// The built-in MECH model (assets/mecha.glb), fetched from the site root. The single-file Artifact build
// replaces this module with one that carries the model inline (tools/build.mjs).
export async function mechBytes() {
  const res = await fetch(new URL('/assets/mecha.glb', location.href));
  if (!res.ok) throw new Error(`could not fetch the mech (HTTP ${res.status})`);
  return res.arrayBuffer();
}
