// Production server for the built games (Railway, or any Node host): npm run build, then npm start.
// Serves a menu at / (site/index.html), the grid battler at /grid and the open world at /world, plus /health
// for the host's health check. The pages are single self-contained files, so they are read, hashed and
// gzipped once at startup. Listens on $PORT (default 8080) on every interface.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT ?? 8080);

async function page(file) {
  const raw = await readFile(resolve(root, file));
  return { raw, gz: gzipSync(raw, { level: 9 }), etag: `W/"${createHash('sha1').update(raw).digest('base64url')}"` };
}

const PAGES = {
  '/': await page('site/index.html'),
  '/grid': await page('dist/cybermetal-gridwars.html'),
  '/world': await page('dist/world.html'),
};
const ALIASES = { '/index.html': '/', '/grid/': '/grid', '/world/': '/world' };
const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-cache', // browsers check for a new version each visit (a 304 when unchanged)
  vary: 'accept-encoding',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  const p = PAGES[ALIASES[pathname] ?? pathname];
  if (!p || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(p ? 405 : 404, { 'content-type': 'text/plain' }).end(p ? 'method not allowed' : 'not found');
    return;
  }
  const headers = { ...HEADERS, etag: p.etag };
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
  console.log(`CyberMetal GridWars on port ${port}: / (menu), /grid (${kib(PAGES['/grid'])}), /world (${kib(PAGES['/world'])})`);
});
