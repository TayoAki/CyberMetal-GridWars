// Build a single self-contained HTML file: node tools/build.mjs [out]
// Bundles src/main.js with esbuild (IIFE, minified) and inlines it into index.html, so the game runs by
// double-clicking the file — no server, no network.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] ?? 'dist/cybermetal-gridwars.html');

const result = await build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const tag = '<script type="module" src="./src/main.js"></script>';
if (!html.includes(tag)) throw new Error('index.html script tag not found');
const page = html.replace(tag, () => `<script>${js}</script>`);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(1)} KiB)`);

// Artifact variant: the hosting page supplies <html>/<head>/<body>, so emit only the title, the style
// and the body content (plus the inline script).
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(tag, () => `<script>${js}</script>`);
const artifact = `${title}\n${style}\n${body.trim()}\n`;
const artifactOut = resolve(root, 'dist/artifact.html');
await writeFile(artifactOut, artifact);
console.log(`wrote ${artifactOut} (${(artifact.length / 1024).toFixed(1)} KiB)`);
