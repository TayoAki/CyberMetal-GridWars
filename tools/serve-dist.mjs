// Production server for the built games (Railway, or any Node host): npm run build, then npm start.
// Serves a menu at / (site/index.html), the grid battler at /grid, GridWars Daily at /daily and the open
// world at /world, plus /health for the host's health check, /assets/mecha.glb (the built-in MECH model,
// fetched when picked), the Daily's link-preview images at /og/*.png and its leaderboard API at /api/
// (tools/daily-api.mjs, stored under $DATA_DIR, a persistent volume on the host).
// The pages are single self-contained files, so they are read, hashed and gzipped once at startup; /daily
// gets link-preview tags naming the day's boss (or the run a link shares), cached per variant. Listens on
// $PORT (default 8080) on every interface.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dailyApi } from './daily-api.mjs';
import { engineHash } from './engine-hash.mjs';
import { dailyRecipe } from '../src/daily/recipe.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT ?? 8080);

function pack(raw, type = 'text/html; charset=utf-8', cache = 'no-cache', level = 9) {
  return { raw, type, cache, gz: gzipSync(raw, { level }), etag: `W/"${createHash('sha1').update(raw).digest('base64url')}"` };
}
async function page(file, type, cache) {
  return pack(await readFile(resolve(root, file)), type, cache);
}

const PAGES = {
  '/': await page('site/index.html'),
  '/grid': await page('dist/cybermetal-gridwars.html'),
  '/world': await page('dist/world.html'),
  '/assets/mecha.glb': await page('assets/mecha.glb', 'model/gltf-binary', 'public, max-age=86400'),
};
for (const f of await readdir(resolve(root, 'assets/og')).catch(() => [])) {
  if (f.endsWith('.png')) PAGES[`/og/${f}`] = await page(`assets/og/${f}`, 'image/png', 'public, max-age=86400');
}
const ALIASES = { '/index.html': '/', '/grid/': '/grid', '/world/': '/world', '/daily/': '/daily' };
const HEADERS = {
  vary: 'accept-encoding',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

// The board's data: $DATA_DIR, else the Railway volume's mount, else .data/ (lost on a redeploy).
const DATA = process.env.DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? resolve(root, '.data');
const api = await dailyApi({ dir: DATA, engine: await engineHash(root) });

// /daily with its preview tags: the day's boss, or the run a ?vs= / ?r= link shares.
const dailyHtml = await readFile(resolve(root, 'dist/daily.html'), 'utf8');
const variants = new Map();
// The site's own address for the tags (never the request's Host header: variants are shared).
const ORIGIN = process.env.PUBLIC_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${port}`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
function dailyPage(url) {
  const id = url.searchParams.get('vs') ?? url.searchParams.get('r') ?? '';
  const entry = id ? api.entry(id) : null;
  const day = entry?.day ?? api.today();
  const key = `${day}|${entry?.id ?? ''}`;
  let p = variants.get(key);
  if (p) return p;
  const r = dailyRecipe(day);
  const boss = `${r.name} ${r.tierName}`;
  const title = entry ? `${entry.name} deleted ${boss} in ${clock(entry.seconds)}` : `GridWars Daily #${day}: ${boss}`;
  const desc = entry
    ? `GridWars Daily #${day} · Busting Level ${entry.busting}. Can you beat it? A new boss every day.`
    : `Today's boss: ${r.name}, ${r.title}. Delete it fast and top the board. A new boss every day.`;
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(`${ORIGIN}/daily${entry ? `?vs=${entry.id}` : ''}`)}">`,
    PAGES[`/og/${r.element}.png`] ? `<meta property="og:image" content="${ORIGIN}/og/${r.element}.png">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
  ].join('\n');
  p = pack(Buffer.from(dailyHtml.replace('<!--og-->', tags)), 'text/html; charset=utf-8', 'no-cache', 6);
  if (variants.size > 300) variants.delete(variants.keys().next().value);
  variants.set(key, p);
  return p;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (await api.handle(req, res, url)) return;
  const path = ALIASES[pathname] ?? pathname;
  const p = path === '/daily' ? dailyPage(url) : PAGES[path];
  if (!p || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(p ? 405 : 404, { 'content-type': 'text/plain' }).end(p ? 'method not allowed' : 'not found');
    return;
  }
  // Pages: browsers check for a new version each visit (a 304 when unchanged).
  const headers = { ...HEADERS, 'content-type': p.type, 'cache-control': p.cache, etag: p.etag };
  if (req.headers['if-none-match'] === p.etag) {
    res.writeHead(304, headers).end();
    return;
  }
  const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  const body = gzip ? p.gz : p.raw;
  res.writeHead(200, { ...headers, ...(gzip ? { 'content-encoding': 'gzip' } : {}), 'content-length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(port, '0.0.0.0', () => {
  const kib = (p) => `${(p.gz.length / 1024).toFixed(0)} KiB gzipped`;
  console.log(`CyberMetal GridWars on port ${port}: / (menu), /daily, /grid (${kib(PAGES['/grid'])}), /world (${kib(PAGES['/world'])}); Daily data in ${DATA}`);
});
