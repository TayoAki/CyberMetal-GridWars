// GridWars Daily's leaderboard, served by tools/serve-dist.mjs:
//   GET  /api/daily/today                         { day, date, next }  (the server's UTC day)
//   GET  /api/daily/:day/board?pid=...            { day, count, top: [...], you }
//   POST /api/daily/:day/runs  { pid, name, folder, run }   -> { ok, id, rank, count, best, entry }
//   GET  /api/runs/:id                            { entry, run }  (for "watch my run" and challenges)
//
// A run is a recorded fight (src/daily/replay.js). The server never takes a client's word for a time: it
// replays the inputs with the game's own engine and keeps what the replay shows, and only wins. Each
// player (a random id the browser keeps) holds one place a day, their best. Ranked by fight time, then
// Busting Level, then HP left, then who got there first.
//
// Storage: <dir>/daily/<day>.jsonl (one line per accepted run) and <dir>/runs/<id>.json (its inputs).
// On a host, <dir> is a persistent volume ($DATA_DIR); every line is re-read at startup.
import { mkdir, appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { dailyRecipe, dayDate, LAUNCH } from '../src/daily/recipe.js';
import { dailyBattle, FOLDERS } from '../src/daily/fight.js';
import { replay, MAX_FRAMES, REPLAY_VERSION } from '../src/daily/replay.js';

const DAY = 86400000;
const MAX_BODY = 160 * 1024;
const TOP = 25;
const BUSTING_ORDER = { S: 11 }; // S above 10; numbers rank as themselves

// Names: 2-12 letters, digits, spaces, dot, dash, underscore; shown upper-case. Words no one should see on
// a public board are refused, matched with look-alike digits folded: anywhere in the name for words no
// innocent name contains, as a whole word for short ones that hide inside others (grape, cockpit).
const BLOCKED_ANYWHERE = ['fuck', 'shit', 'cunt', 'nigg', 'nazi', 'hitler', 'whore', 'retard', 'kike', 'chink', 'pussy', 'penis', 'vagina', 'porn'];
const BLOCKED_WORDS = ['rape', 'fag', 'sex', 'dick', 'cock', 'slut', 'spic', 'tit', 'tits', 'anal'];
const fold = (s) => s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't');
export function cleanName(raw) {
  const name = String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
  if (name.length < 2) return null;
  const whole = fold(name).replace(/[^a-z]/g, '');
  const words = fold(name).split(/[ ._-]+/);
  if (BLOCKED_ANYWHERE.some((w) => whole.includes(w)) || words.some((w) => BLOCKED_WORDS.includes(w))) return null;
  return name;
}

export function serverDay(now = Date.now()) {
  return Math.floor((now - LAUNCH) / DAY) + 1;
}

const better = (a, b) =>
  a.fightFrames - b.fightFrames || bustRank(b.busting) - bustRank(a.busting) || b.hp / b.maxHp - a.hp / a.maxHp || a.at - b.at;
const bustRank = (v) => BUSTING_ORDER[v] ?? (Number(v) || 0);
const publicEntry = (e) => ({ id: e.id, name: e.name, seconds: e.seconds, busting: e.busting, hp: e.hp, maxHp: e.maxHp, counters: e.counters, hitsTaken: e.hitsTaken, folder: e.folder, day: e.day });

// `engine`: this server's engine fingerprint (tools/engine-hash.mjs); runs stamped with another are refused
// with a request to reload. null accepts any (development).
export async function dailyApi({ dir, now = () => Date.now(), engine = null }) {
  const daysDir = join(dir, 'daily');
  const runsDir = join(dir, 'runs');
  await mkdir(daysDir, { recursive: true });
  await mkdir(runsDir, { recursive: true });
  const boards = new Map(); // day -> { best: Map(pid -> entry), sorted: entry[] }
  const byId = new Map(); // id -> entry (every accepted run)
  const board = (day) => {
    let b = boards.get(day);
    if (!b) boards.set(day, (b = { best: new Map(), sorted: [] }));
    return b;
  };
  const admit = (e) => {
    byId.set(e.id, e);
    const b = board(e.day);
    const old = b.best.get(e.pid);
    if (old && better(old, e) <= 0) return false;
    b.best.set(e.pid, e);
    if (old) b.sorted.splice(b.sorted.indexOf(old), 1);
    let lo = 0;
    let hi = b.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (better(b.sorted[mid], e) <= 0) lo = mid + 1;
      else hi = mid;
    }
    b.sorted.splice(lo, 0, e);
    return true;
  };
  for (const f of (await readdir(daysDir)).filter((n) => /^\d+\.jsonl$/.test(n))) {
    const text = await readFile(join(daysDir, f), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        admit(JSON.parse(line));
      } catch {
        /* a torn last line from a crash: skip it */
      }
    }
  }

  // Requests per address: a few submissions a minute is plenty for a person.
  const hits = new Map();
  const limited = (ip) => {
    const t = now();
    const list = (hits.get(ip) ?? []).filter((x) => t - x < 600000);
    list.push(t);
    hits.set(ip, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (t - v[v.length - 1] > 600000) hits.delete(k);
    return list.length > 40;
  };

  const rankOf = (e) => {
    const b = board(e.day);
    const i = b.sorted.indexOf(b.best.get(e.pid) === e ? e : null);
    if (i >= 0) return i + 1;
    // Not their best: where it would stand.
    return b.sorted.filter((x) => better(x, e) < 0).length + 1;
  };

  async function submit(day, body) {
    const today = serverDay(now());
    if (!Number.isInteger(day) || day < 1 || Math.abs(day - today) > 1) return [400, { ok: false, error: 'that day is closed' }];
    const pid = String(body?.pid ?? '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(pid)) return [400, { ok: false, error: 'bad player id' }];
    const name = cleanName(body?.name);
    if (!name) return [400, { ok: false, error: 'pick another name (2-12 letters or digits)' }];
    const folder = String(body?.folder ?? '');
    if (!FOLDERS.includes(folder)) return [400, { ok: false, error: 'unknown folder' }];
    const run = body?.run;
    if (!run || typeof run !== 'object' || run.v !== REPLAY_VERSION || (engine && run.engine !== engine)) return [409, { ok: false, error: 'the game was updated since this page loaded: reload it to play the new version' }];
    if (!Number.isInteger(run.frames) || run.frames < 1 || run.frames > MAX_FRAMES) return [400, { ok: false, error: 'bad run' }];
    if (typeof run.pads !== 'string' || run.pads.length > 100000 || !/^[A-Za-z0-9_-]*$/.test(run.pads)) return [400, { ok: false, error: 'bad run' }];
    const ops = Array.isArray(run.ops) ? run.ops : [];
    if (ops.length > 4000 || !ops.every((o) => Array.isArray(o) && Number.isInteger(o[0]) && ['s', 'u', 'c', 'a'].includes(o[1]) && (o.length === 2 || (o.length === 3 && Number.isInteger(o[2]))))) return [400, { ok: false, error: 'bad run' }];
    const clean = { v: run.v, day, folder, frames: run.frames, pads: run.pads, ops: ops.map((o) => o.slice(0, 3)) };
    let o;
    try {
      o = replay(dailyBattle(dailyRecipe(day), { folder }), clean);
    } catch {
      return [400, { ok: false, error: 'bad run' }];
    }
    if (!o.won) return [200, { ok: false, error: 'the replay of this run does not win', outcome: o }];
    const id = randomBytes(6).toString('base64url');
    const entry = { id, day, pid, name, folder, fightFrames: o.fightFrames, seconds: Math.round(o.seconds * 100) / 100, busting: o.busting, hp: o.hp, maxHp: o.maxHp, counters: o.counters, hitsTaken: o.hitsTaken, at: now() };
    await writeFile(join(runsDir, `${id}.json`), JSON.stringify(clean));
    await appendFile(join(daysDir, `${day}.jsonl`), JSON.stringify(entry) + '\n');
    const best = admit(entry);
    return [200, { ok: true, id, best, rank: rankOf(entry), count: board(day).sorted.length, entry: publicEntry(entry) }];
  }

  function standings(day, pid) {
    const b = board(day);
    const mine = pid ? b.best.get(pid) : null;
    return {
      day,
      date: dayDate(day),
      count: b.sorted.length,
      top: b.sorted.slice(0, TOP).map((e, i) => ({ rank: i + 1, ...publicEntry(e) })),
      you: mine ? { rank: b.sorted.indexOf(mine) + 1, ...publicEntry(mine) } : null,
    };
  }

  async function runById(id) {
    if (!/^[A-Za-z0-9_-]{6,16}$/.test(id) || !byId.has(id)) return null;
    try {
      return { entry: publicEntry(byId.get(id)), run: JSON.parse(await readFile(join(runsDir, `${id}.json`), 'utf8')) };
    } catch {
      return null;
    }
  }

  // Handle an /api/ request; resolves to false when it isn't one.
  async function handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/api/')) return false;
    const send = (status, obj) => {
      const body = JSON.stringify(obj);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }).end(body);
    };
    try {
      let m;
      if (path === '/api/daily/today' && req.method === 'GET') {
        const day = serverDay(now());
        return send(200, { day, date: dayDate(day), next: LAUNCH + day * DAY }), true;
      }
      if ((m = path.match(/^\/api\/daily\/(\d{1,6})\/board$/)) && req.method === 'GET') {
        return send(200, standings(Number(m[1]), url.searchParams.get('pid'))), true;
      }
      if ((m = path.match(/^\/api\/daily\/(\d{1,6})\/runs$/)) && req.method === 'POST') {
        const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
        if (limited(ip)) return send(429, { ok: false, error: 'too many runs: take a breather' }), true;
        const body = await readBody(req);
        if (body === null) return send(413, { ok: false, error: 'too big' }), true;
        const [status, out] = await submit(Number(m[1]), body);
        return send(status, out), true;
      }
      if ((m = path.match(/^\/api\/runs\/([A-Za-z0-9_-]+)$/)) && req.method === 'GET') {
        const r = await runById(m[1]);
        return send(r ? 200 : 404, r ?? { error: 'no such run' }), true;
      }
      send(404, { error: 'not found' });
    } catch (e) {
      send(500, { error: 'server error' });
      console.error('daily api:', e);
    }
    return true;
  }

  return { handle, submit, standings, runById, entry: (id) => byId.get(id) ?? null, today: () => serverDay(now()) };
}

function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve(null));
  });
}
