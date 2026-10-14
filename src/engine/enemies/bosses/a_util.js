import { wait, freePanels } from '../../combat.js';
import { COLS, ROWS, TEAM } from '../../constants.js';

// Shared helpers for boss pack A (Voltframe, Feralis, Tidecaller, Pyreclaw). Pure sim code: randomness
// comes from b.rng only; offsetX/offsetY/z/anim writes are view hints the sim never reads back.

// Count a move in e.data.moves (tests and tuning read it) and remember it as the last one.
export function noteMove(e, name) {
  const m = e.data.moves ?? (e.data.moves = {});
  m[name] = (m[name] ?? 0) + 1;
  e.data.lastMove = name;
}

// Weighted move choice with b.rng. options: [[name, weight], ...]; weight 0 = unavailable.
// e.data.forceMove (set by tests or scripted fights) overrides the roll once.
export function pickMove(b, e, options) {
  const forced = e.data.forceMove;
  if (forced) {
    e.data.forceMove = null;
    return forced;
  }
  const avail = options.filter(([, w]) => w > 0);
  let total = 0;
  for (const [, w] of avail) total += w;
  let roll = b.rng.next() * total;
  for (const [name, w] of avail) {
    roll -= w;
    if (roll < 0) return name;
  }
  return avail[avail.length - 1][0];
}

// Wind-up pose with a counter window: a chip or charge hit now is a Counter (and cancels the move).
export function* windup(e, anim, frames) {
  e.setAnim(anim);
  e.counterWindow = frames;
  yield* wait(frames);
  e.counterWindow = 0;
}

// Hold a pose for n frames.
export function* pose(e, anim, frames) {
  e.setAnim(anim);
  yield* wait(frames);
}

// Panels currently owned by `team`, optionally only in one row.
export function ownedCells(b, team, row = null) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    if (row !== null && r !== row) continue;
    for (let c = 0; c < COLS; c++) if (b.field.ownerAt(c, r) === team) out.push([c, r]);
  }
  return out;
}

// The panel of `team`'s area in `row` nearest the enemy (front) or farthest from it (back), or -1.
export function rowEdge(b, team, row, side) {
  const cols = [];
  for (let c = 0; c < COLS; c++) if (b.field.ownerAt(c, row) === team) cols.push(c);
  if (!cols.length) return -1;
  const towardEnemy = team === TEAM.RED ? Math.max(...cols) : Math.min(...cols);
  const away = team === TEAM.RED ? Math.min(...cols) : Math.max(...cols);
  return side === 'front' ? towardEnemy : away;
}

// Free panels of e's area other than its own.
export function otherSpots(b, e, filter = null) {
  return freePanels(b, e, filter).filter(([c, r]) => c !== e.col || r !== e.row);
}

// Step toward (c, r) one panel at a time (rows first), `frames` per step. Stops when blocked.
export function* walkTo(b, e, c, r, frames, anim = 'move', maxSteps = 6) {
  for (let i = 0; i < maxSteps && (e.col !== c || e.row !== r); i++) {
    const dr = Math.sign(r - e.row);
    const dc = Math.sign(c - e.col);
    let moved = false;
    if (dr !== 0) moved = b.tryStep(e, 0, dr);
    if (!moved && dc !== 0) moved = b.tryStep(e, dc, 0);
    if (!moved) return false;
    e.setAnim(anim);
    yield* wait(frames);
  }
  return e.col === c && e.row === r;
}

// Clear dash/leap view hints (the AI restarts from scratch after a flinch).
export function settle(e) {
  e.offsetX = 0;
  e.offsetY = 0;
  e.z = 0;
}

// Leap to (c, r): the body registers on the new panel at once (occupancy stays exact) while the view
// hints arc it over from the old one. Returns false if the panel can't be entered.
export function* leap(b, e, c, r, frames, height = 10) {
  if (!b.canEnter(e, c, r)) return false;
  const fc = e.col;
  const fr = e.row;
  b.moveEntity(e, c, r);
  for (let i = 1; i <= frames; i++) {
    const k = i / frames;
    // An ice slide can carry the body on; the arc then just ends where it is.
    const there = e.col === c && e.row === r;
    e.offsetX = there ? (fc - c) * (1 - k) : 0;
    e.offsetY = there ? (fr - r) * (1 - k) : 0;
    e.z = Math.round(height * 4 * k * (1 - k));
    yield;
  }
  settle(e);
  return true;
}

// ---------------------------------------------------------------- objects a boss places ("pets")

// Spawn an object on the boss's team (so the boss's own spells pass through it, the player's hit it).
// The battle is won once every non-object blue body is gone, so pets never hold a fight open; the boss's
// onDelete still clears them so nothing keeps ticking on the results screen.
export function spawnPet(b, boss, o) {
  const pet = b.spawnObject({
    team: boss.team,
    level: boss.level,
    element: 'null',
    ...o,
    data: { owner: boss, ...(o.data ?? {}) },
  });
  boss.data.pets = [...livePets(boss), pet]; // drop broken ones as we go
  b.emit('fx', { fx: 'warp', col: pet.col, row: pet.row });
  return pet;
}

export function livePets(boss, type = null) {
  return (boss.data.pets ?? []).filter((p) => p.alive && !p.removed && (!type || p.type === type));
}

export function clearPets(b, boss) {
  for (const p of livePets(boss)) b.kill(p);
  boss.data.pets = [];
}

// Free panels a pet could be placed on in the boss's area (empty, not a hole).
export function petSpots(b, boss, filter = null) {
  const out = [];
  for (const [c, r] of ownedCells(b, boss.team)) {
    if (b.entityAt(c, r) || b.field.isHole(c, r)) continue;
    if (!filter || filter(c, r)) out.push([c, r]);
  }
  return out;
}
