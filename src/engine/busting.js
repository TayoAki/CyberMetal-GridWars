import { FPS, TIMING } from './constants.js';

// Busting Level, scored the BN3 way: deletion time, hits taken, steps moved and multi-deletes.
// (Thresholds are community-documented; see MODLOG.md "Not measured".)

export function groupDeletions(frames, window = TIMING.DOUBLE_DELETE_WINDOW) {
  const sorted = frames.slice().sort((a, z) => a - z);
  const groups = [];
  for (const f of sorted) {
    const g = groups[groups.length - 1];
    if (g && f - g[g.length - 1] <= window) g.push(f);
    else groups.push([f]);
  }
  let double = 0;
  let triple = 0;
  for (const g of groups) {
    if (g.length >= 3) triple++;
    else if (g.length === 2) double++;
  }
  return { double, triple };
}

export function computeBusting(b) {
  const seconds = b.fightFrames / FPS;
  const lines = [];
  let pts = 0;
  let t;
  if (b.isBossBattle) t = seconds <= 30 ? 10 : seconds <= 40 ? 8 : seconds <= 50 ? 6 : 4;
  else t = seconds <= 5 ? 7 : seconds <= 12 ? 6 : seconds <= 36 ? 5 : 4;
  pts += t;
  lines.push(['Time', t]);

  const hits = b.stats.hitsTaken;
  const h = hits === 0 ? 1 : hits === 1 ? 0 : hits === 2 ? -1 : hits === 3 ? -2 : -3;
  pts += h;
  lines.push(['Hits taken', h]);

  const m = b.stats.moves <= 2 ? 1 : 0;
  pts += m;
  lines.push(['Steps', m]);

  const { double, triple } = groupDeletions(b.stats.deletions);
  const md = double * 2 + triple * 4;
  if (md) lines.push([triple ? 'Triple delete' : 'Double delete', md]);
  pts += md;

  const level = Math.max(1, pts);
  return {
    bustingLevel: level > 10 ? 'S' : level,
    bustingPoints: pts,
    seconds,
    lines,
    hitsTaken: hits,
    double,
    triple,
    counters: b.stats.counters,
  };
}
