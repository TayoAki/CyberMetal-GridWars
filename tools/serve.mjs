// Minimal static file server for development: node tools/serve.mjs [port]
// Serves the repo root so ES modules load without a build step, and GridWars Daily's leaderboard API
// (tools/daily-api.mjs, data in .data-dev/).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dailyApi } from './daily-api.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8123);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
};

const api = await dailyApi({ dir: process.env.DATA_DIR ?? resolve(root, '.data-dev') });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await api.handle(req, res, url)) return;
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    const s = await stat(path).catch(() => null);
    if (s?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
