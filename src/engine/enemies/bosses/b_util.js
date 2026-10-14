import { wait, freePanels } from '../../combat.js';
import { COLS, ROWS, TEAM, PANEL } from '../../constants.js';

// Shared helpers for boss pack B (Ironclad, Sabre, ZeroDay, Briarix). Pure sim code: randomness comes
// from b.rng only, and anim/offset/z writes are view hints the sim never reads back.

// ---------------------------------------------------------------- bookkeeping

// Count a move in e.data.moves (tests and tuning read it) and remember the recent history.
export function noteMove(e, name) {
  const m = e.data.moves ?? (e.data.moves = {});
  m[name] = (m[name] ?? 0) + 1;
  const h = e.data.history ?? (e.data.history = []);
  h.push(name);
  if (h.length > 4) h.shift();
  e.data.lastMove = name;
}

// Weighted move choice with b.rng. options: [[name, weight], ...]; weight 0 = unavailable. The same move is
// never picked three times running while another is available. e.data.forceMove (tests, scripted fights)
// overrides the roll once.
export function pickMove(b, e, options) {
  const forced = e.data.forceMove;
  if (forced) {
    e.data.forceMove = null;
    return forced;
  }
  let avail = options.filter(([, w]) => w > 0);
  const h = e.data.history ?? [];
  if (h.length >= 2 && h[h.length - 1] === h[h.length - 2]) {
    const other = avail.filter(([n]) => n !== h[h.length - 1]);
    if (other.length) avail = other;
  }
  if (!avail.length) return null;
  let total = 0;
  for (const [, w] of avail) total += w;
  let roll = b.rng.next() * total;
  for (const [name, w] of avail) {
    roll -= w;
    if (roll < 0) return name;
  }
  return avail[avail.length - 1][0];
}

// Clear view hints and per-move flags. The AI restarts from scratch after a flinch, so every ai() starts here.
export function settle(e) {
  e.offsetX = 0;
  e.offsetY = 0;
  e.z = 0;
  e.hidden = false;
  e.counterWindow = 0;
  e.data.winding = false;
  e.data.countered = false;
}

// ---------------------------------------------------------------- wind-ups and counters

// A counterable wind-up: holds `anim` with a counter window for `frames`. A chip or charge hit during it
// is a Counter; the engine stuns (and usually flinches) the body, and this returns false so the move is
// called off — even for super-armored bodies that don't flinch. `each(t)` runs every frame (may return
// true to end the wind-up early, still successfully).
export function* windup(b, e, anim, frames, each = null) {
  e.setAnim(anim);
  e.counterWindow = frames;
  e.data.winding = true;
  e.data.countered = false;
  for (let t = 0; t < frames; t++) {
    if (each && each(t) === true) break;
    yield;
    if (e.data.countered) break;
  }
  const ok = !e.data.countered;
  e.data.winding = false;
  e.data.countered = false;
  e.counterWindow = 0;
  return ok;
}

// Call from a family's onHit. Mirrors the engine's counter rule (it has already cleared counterWindow).
export function markCounter(b, e, hit) {
  if (!e.data.winding || !(hit.isChip || hit.isCharge) || hit.noCounter) return false;
  if (e.counterWindow > 0) return false;
  e.data.countered = true;
  // A super-armored body doesn't flinch: show the stagger while the counter stun holds it.
  if (e.superArmor && e.alive) e.setAnim('hurt');
  return true;
}

// Hold a pose for n frames.
export function* pose(e, anim, frames) {
  e.setAnim(anim);
  yield* wait(frames);
}

// ---------------------------------------------------------------- the grid

// Panels owned by the opponents of `e` (for a blue boss: the player's area), optionally one row only.
export function foeArea(b, e, row = null) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    if (row !== null && r !== row) continue;
    for (let c = 0; c < COLS; c++) {
      const o = b.field.ownerAt(c, r);
      if (o !== e.team && o !== TEAM.NONE) out.push([c, r]);
    }
  }
  return out;
}

export function ownArea(b, e) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (b.field.ownerAt(c, r) === e.team) out.push([c, r]);
  return out;
}

// How deep a column is inside e's area, counted from the enemy side (0 = the far enemy edge).
export function depth(e, c) {
  return e.facing < 0 ? c : COLS - 1 - c;
}

// The column of e's area nearest the enemy in `row`, if e can stand there (or already does); else null.
export function frontCol(b, e, row) {
  for (let k = 0; k < COLS; k++) {
    const c = e.facing < 0 ? k : COLS - 1 - k;
    if (b.field.ownerAt(c, row) !== e.team) continue;
    if ((c === e.col && row === e.row) || b.canEnter(e, c, row)) return c;
    return null;
  }
  return null;
}

// The deepest panel of e's area in `row` that e can stand on (or already does); else null.
export function backCol(b, e, row) {
  for (let k = COLS - 1; k >= 0; k--) {
    const c = e.facing < 0 ? k : COLS - 1 - k;
    if (b.field.ownerAt(c, row) !== e.team) continue;
    if ((c === e.col && row === e.row) || b.canEnter(e, c, row)) return c;
  }
  return null;
}

// Free panels of e's area other than its own.
export function otherSpots(b, e, filter = null) {
  return freePanels(b, e, filter).filter(([c, r]) => c !== e.col || r !== e.row);
}

// Empty, intact panels of e's area (where it could plant an object).
export function plantSpots(b, e, filter = null) {
  return ownArea(b, e).filter(([c, r]) => !b.entityAt(c, r) && !b.field.isHole(c, r) && (!filter || filter(c, r)));
}

export function isGrass(b, c, r) {
  return b.field.typeAt(c, r) === PANEL.GRASS;
}

// A no-hit spell covering `cells` for `frames` (a telegraph the view draws); data.progress runs 0..1.
export function warning(b, e, type, cells, frames, data = {}) {
  const [c0, r0] = cells[0] ?? [e.col, e.row];
  const s = b.addSpell({ type, team: e.team, owner: e, col: c0, row: r0, hit: null });
  s.data.cells = cells;
  s.data.level = e.level;
  Object.assign(s.data, data);
  s.script = (function* () {
    for (let t = 0; t < frames; t++) {
      s.data.progress = t / frames;
      yield;
    }
  })();
  return s;
}

// ---------------------------------------------------------------- objects a boss places

// Spawn an object on the boss's team (its own spells pass through it, the player's hit it). The battle is
// won once every non-object blue body is gone, so these never hold a fight open; the boss's onDelete
// still clears them so nothing lingers on the results screen.
export function spawnPet(b, boss, o) {
  const pet = b.spawnObject({ team: boss.team, level: boss.level, element: 'null', ...o, data: { owner: boss, ...(o.data ?? {}) } });
  (boss.data.pets ?? (boss.data.pets = [])).push(pet);
  return pet;
}

export function livePets(boss, type = null) {
  return (boss.data.pets ?? []).filter((p) => p.alive && !p.removed && (!type || p.type === type));
}

export function clearPets(b, boss) {
  for (const p of livePets(boss)) b.kill(p);
  boss.data.pets = [];
}
