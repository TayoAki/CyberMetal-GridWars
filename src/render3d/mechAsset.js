// The built-in MECH model (assets/mecha.glb): fetched next to the page when first picked. The single-file
// Artifact build replaces this module with one that carries the model inline (tools/build.mjs).
export async function mechBytes() {
  const res = await fetch(new URL('assets/mecha.glb', document.baseURI));
  if (!res.ok) throw new Error(`could not fetch the mech (HTTP ${res.status})`);
  return res.arrayBuffer();
}
