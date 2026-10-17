// A fingerprint of everything that decides how a GridWars Daily fight plays out: the battle engine, the
// day's recipe, the duel's set-up, the replay format and the folders. The build stamps it into the Daily
// page (tools/build.mjs) and the server computes its own at startup (tools/serve-dist.mjs): a run recorded
// by a page from another version would replay differently, so the server asks that player to reload
// instead of misjudging the run.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const FILES = ['src/engine', 'src/daily/recipe.js', 'src/daily/fight.js', 'src/daily/replay.js', 'src/game/data/folders.js'];

async function list(root, path) {
  const full = join(root, path);
  if (path.endsWith('.js')) return [full];
  const out = [];
  for (const e of await readdir(full, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...(await list(root, join(path, e.name))));
    else if (e.name.endsWith('.js')) out.push(join(full, e.name));
  }
  return out;
}

export async function engineHash(root) {
  const files = [];
  for (const p of FILES) files.push(...(await list(root, p)));
  files.sort();
  const h = createHash('sha1');
  for (const f of files) {
    h.update(relative(root, f).replace(/\\/g, '/'));
    h.update(await readFile(f));
  }
  return h.digest('base64url').slice(0, 12);
}
