// Build self-contained single-file games: node tools/build.mjs
// Each page's script is bundled with esbuild (minified) and inlined into its HTML, so the game runs by
// double-clicking the file: no server, no network. Two pages:
//   dist/cybermetal-gridwars.html  the grid battler (index.html + src/main.js)
//   dist/world.html                the open-world prototype (world/index.html + src/world/main.js), with
//                                  three.js bundled and the player model inlined
// Each also gets an Artifact variant (dist/artifact.html, dist/world-artifact.html): the hosting page
// supplies <html>/<head>/<body>, so it holds only the title, the style and the body content.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

// Replace src/world/assets.js with a module that carries the model inline (base64).
const inlineModel = {
  name: 'inline-model',
  setup(b) {
    b.onLoad({ filter: /src[\\/]world[\\/]assets\.js$/ }, async () => {
      const glb = await readFile(resolve(root, 'assets/mecha.glb'));
      return {
        loader: 'js',
        contents: `const B64 = ${JSON.stringify(glb.toString('base64'))};
export async function loadMechaBuffer() {
  const s = atob(B64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}`,
      };
    });
  },
};

async function page({ entry, html, scriptTag, out, artifactOut, format = 'iife', target = 'es2020', plugins = [] }) {
  const result = await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    format,
    minify: true,
    target: [target],
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
    plugins,
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const type = format === 'esm' ? ' type="module"' : '';
  let src = await readFile(resolve(root, html), 'utf8');
  if (!src.includes(scriptTag)) throw new Error(`${html}: script tag not found`);
  src = src.replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, ''); // dev-only module map
  const full = src.replace(scriptTag, () => `<script${type}>${js}</script>`);
  await writeFile(resolve(dist, out), full);
  const title = src.match(/<title>[\s\S]*?<\/title>/)[0];
  const style = src.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = src.slice(src.indexOf('<body>') + 6, src.indexOf('</body>')).replace(scriptTag, () => `<script${type}>${js}</script>`);
  const fragment = `${title}\n${style}\n${body.trim()}\n`;
  await writeFile(resolve(dist, artifactOut), fragment);
  console.log(`wrote dist/${out} (${(full.length / 1024).toFixed(1)} KiB) and dist/${artifactOut}`);
}

await mkdir(dist, { recursive: true });
await page({
  entry: 'src/main.js',
  html: 'index.html',
  scriptTag: '<script type="module" src="./src/main.js"></script>',
  out: 'cybermetal-gridwars.html',
  artifactOut: 'artifact.html',
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
