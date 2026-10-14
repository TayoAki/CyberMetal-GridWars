import { freePanels } from '../combat.js';

// Shared movement helpers for virus pack A. Pure sim code: randomness comes from b.rng only, and the
// offsetX/offsetY/z writes are view hints the sim never reads back.

// Leap to (c, r). The body registers on the new panel at once (so occupancy and area rules stay exact),
// while the view hints arc it over from the old panel. Returns false if the panel can't be entered.
export function* leap(b, e, c, r, frames, height = 8) {
  if (!b.canEnter(e, c, r)) return false;
  const fc = e.col;
  const fr = e.row;
  b.moveEntity(e, c, r);
  for (let i = 1; i <= frames; i++) {
    const k = i / frames;
    // A slide off an ice panel can carry the body on; the arc then simply ends where it is.
    e.offsetX = e.col === c && e.row === r ? (fc - c) * (1 - k) : 0;
    e.offsetY = e.col === c && e.row === r ? (fr - r) * (1 - k) : 0;
    e.z = Math.round(height * 4 * k * (1 - k));
    yield;
  }
  e.offsetX = 0;
  e.offsetY = 0;
  e.z = 0;
  return true;
}

// Free panels of e's own area other than the one it stands on.
export function otherSpots(b, e, filter = null) {
  return freePanels(b, e, filter).filter(([c, r]) => c !== e.col || r !== e.row);
}

// A random free panel; with probability `aimBias` it is one in the player's row (when there is one).
export function pickSpot(b, e, aimBias = 0) {
  const spots = otherSpots(b, e);
  if (!spots.length) return null;
  if (aimBias > 0 && b.rng.chance(aimBias)) {
    const inRow = spots.filter(([, r]) => r === b.player.row);
    if (inRow.length) return b.rng.pick(inRow);
  }
  return b.rng.pick(spots);
}

// A random free panel next to e (4-neighbours), or null.
export function adjacentSpot(b, e) {
  const out = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (b.canEnter(e, e.col + dc, e.row + dr)) out.push([e.col + dc, e.row + dr]);
  }
  return out.length ? b.rng.pick(out) : null;
}

// Panels in a plus around (c, r), centre first.
export function plusCells(c, r) {
  return [[c, r], [c + 1, r], [c - 1, r], [c, r - 1], [c, r + 1]];
}

// Clear the view hints a leap or dash may have left behind (the AI restarts after a flinch).
export function settle(e) {
  e.offsetX = 0;
  e.offsetY = 0;
  e.z = 0;
}
