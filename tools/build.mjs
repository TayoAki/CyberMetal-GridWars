// Build self-contained single-file games: node tools/build.mjs
// Each page's script is bundled with esbuild (minified) and inlined into its HTML, so the game runs by
// double-clicking the file: no server, no network. Two pages:
//   dist/cybermetal-gridwars.html  the grid battler (index.html + src/main.js), with three.js bundled for
//                                  its 3D graphics; the built-in MECH model is fetched from assets/ when
//                                  picked (tools/serve-dist.mjs serves it)
//   dist/world.html                the open-world prototype (world/index.html + src/world/main.js), with
//                                  three.js bundled and the player model inlined
// Each also gets an Artifact variant (dist/artifact.html, dist/world-artifact.html): the hosting page
// supplies <html>/<head>/<body>, so it holds only the title, the style and the body content. The grid's
// Artifact carries the MECH model inline, as it has no assets/ beside it.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

// Replace a module with one that carries assets/mecha.glb inline (base64) and exports `name` to read it.
const inlineMech = (filter, name) => ({
  name: `inline-mech-${name}`,
  setup(b) {
    b.onLoad({ filter }, async () => {
      const glb = await readFile(resolve(root, 'assets/mecha.glb'));
      return {
        loader: 'js',
        contents: `const B64 = ${JSON.stringify(glb.toString('base64'))};
export async function ${name}() {
  const s = atob(B64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}`,
      };
    });
  },
});
const inlineModel = inlineMech(/src[\\/]world[\\/]assets\.js$/, 'loadMechaBuffer');
const inlineGridMech = inlineMech(/src[\\/]render3d[\\/]mechAsset\.js$/, 'mechBytes');

async function page({ entry, html, scriptTag, out, artifactOut, format = 'iife', target = 'es2020', plugins = [], artifactPlugins = null, define = {} }) {
  const bundle = async (extra) => {
    const result = await build({
      entryPoints: [resolve(root, entry)],
      bundle: true,
      format,
      minify: true,
      target: [target],
      write: false,
      legalComments: 'none',
      logLevel: 'warning',
      define,
      plugins: [...plugins, ...extra],
    });
    return result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  };
  const js = await bundle([]);
  const artifactJs = artifactPlugins ? await bundle(artifactPlugins) : js;
  const type = format === 'esm' ? ' type="module"' : '';
  let src = await readFile(resolve(root, html), 'utf8');
  if (!src.includes(scriptTag)) throw new Error(`${html}: script tag not found`);
  src = src.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, ''); // dev-only module map
  const full = src.replace(scriptTag, () => `<script${type}>${js}</script>`);
  await writeFile(resolve(dist, out), full);
  const title = src.match(/<title>[\s\S]*?<\/title>/)[0];
  const style = src.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>')).replace(scriptTag, () => `<script${type}>${artifactJs}</script>`);
  const fragment = `${title}\n${style}\n${body.trim()}\n`;
  await writeFile(resolve(dist, artifactOut), fragment);
  console.log(`wrote dist/${out} (${(full.length / 1024).toFixed(1)} KiB) and dist/${artifactOut} (${(fragment.length / 1024).toFixed(1)} KiB)`);
}

await mkdir(dist, { recursive: true });
await page({
  entry: 'src/main.js',
  html: 'index.html',
  scriptTag: '<script type="module" src="./src/main.js"></script>',
  out: 'cybermetal-gridwars.html',
  artifactOut: 'artifact.html',
  target: 'es2022', // three.js
  artifactPlugins: [inlineGridMech],
  // A classic script has no import.meta: three's DRACOLoader resolves its default decoder paths against it at
  // load (the game sets its own path), so give it the page's address.
  define: { 'import.meta.url': 'document.baseURI' },
});
await page({
  entry: 'src/world/main.js',
  html: 'world/index.html',
  scriptTag: '<script type="module" src="../src/world/main.js"></script>',
  out: 'world.html',
  artifactOut: 'world-artifact.html',
  format: 'esm', // top-level await in the boot code
  target: 'es2022',
  plugins: [inlineModel],
});
