import { wait, zone, marker, freePanels, inside } from '../combat.js';
import { COLS, ELEMENT } from '../constants.js';

// Sporeling: a burrowing toadstool critter. It idles in the open for a while, then burrows (hidden:
// untargetable and invisible), tunnels to the front column of its area in the player's row (or the
// nearest free panel), pops up behind a rumbling mound and, after a counterable wind-up, puffs a spore
// cloud over the two panels in front of it. Then it burrows again and resurfaces somewhere in its area.
// Only one Sporeling tunnels to the front at a time. Mirrors BN3's Mushy family (HP 50/100/160/200, Wood).

export const SPORELING = {
  type: 'sporeling',
  kind: 'virus',
  mirrors: 'Mushy',
  names: ['Sporeling', 'Sporeling2', 'Sporeling3', 'SporelingΩ'],
  hp: [50, 100, 160, 200],
  element: 'wood',
  levels: [
    { attack: 20, rest: 80, under: 40, rumble: 18, windup: 26, puff: 30, after: 24 },
    { attack: 40, rest: 66, under: 34, rumble: 16, windup: 22, puff: 30, after: 20 },
    { attack: 70, rest: 54, under: 28, rumble: 14, windup: 18, puff: 32, after: 16 },
    { attack: 110, rest: 42, under: 22, rumble: 12, windup: 14, puff: 34, after: 12 },
  ],
  *ai(b, e) {
    const s = e.stats;
    e.hidden = false;
    e.setAnim('idle');
    yield* wait(b.rng.range(20, 50));
    for (;;) {
      yield* wait(s.rest);
      if (!b.claimToken('sporeling', e)) continue;

      // Tunnel to the front, telegraphed by a mound, and pop up.
      yield* burrow(b, e);
      yield* wait(s.under);
      const spot = frontSpot(b, e);
      if (spot) relocate(b, e, spot[0], spot[1]);
      marker(b, e, 'sporemound', e.col, e.row, s.rumble);
      yield* wait(s.rumble);
      yield* emerge(b, e);

      // Puff (counterable wind-up).
      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;
      e.setAnim('attack');
      b.emit('sfx', { name: 'wind' });
      const d = e.facing;
      const cells = [[e.col + d, e.row], [e.col + 2 * d, e.row]].filter(([c, r]) => inside(c, r));
      if (cells.length) {
        const cloud = zone(b, e, { damage: s.attack, element: ELEMENT.WOOD, flinch: true }, cells, s.puff, { type: 'sporecloud' });
        cloud.data.frames = s.puff;
      }
      yield* wait(s.after);
      b.releaseToken('sporeling', e);

      // Back underground; resurface somewhere in its own area.
      yield* burrow(b, e);
      yield* wait(s.under >> 1);
      const spots = freePanels(b, e);
      if (spots.length) {
        const [c, r] = b.rng.pick(spots);
        relocate(b, e, c, r);
      }
      yield* emerge(b, e);
    }
  },
  onFlinch(b, e) {
    b.releaseToken('sporeling', e);
  },
  onDelete(b, e) {
    e.hidden = false;
  },
};

function* burrow(b, e) {
  e.setAnim('burrow');
  b.emit('sfx', { name: 'thud' });
  b.emit('fx', { fx: 'burrowdirt', col: e.col, row: e.row });
  yield* wait(12);
  e.hidden = true;
  e.setAnim('hidden');
}

function* emerge(b, e) {
  e.hidden = false;
  e.setAnim('emerge');
  b.emit('fx', { fx: 'burrowdirt', col: e.col, row: e.row });
  yield* wait(10);
  e.setAnim('idle');
}

// Underground travel: no panel effects, nothing breaks behind it.
function relocate(b, e, c, r) {
  if (c === e.col && r === e.row) return;
  if (!b.canEnter(e, c, r)) return;
  b.moveEntity(e, c, r, { noBreak: true, noPanelEffects: true });
}

// The frontmost panel of its own area in the player's row, else the closest free panel to it.
function frontSpot(b, e) {
  const pr = b.player.row;
  let best = null;
  let bestScore = Infinity;
  for (const [c, r] of freePanels(b, e)) {
    const score = Math.abs(r - pr) * 10 + Math.abs(c - frontCol(b, e, r));
    if (score < bestScore) {
      best = [c, r];
      bestScore = score;
    }
  }
  return best;
}

function frontCol(b, e, r) {
  if (e.facing < 0) {
    for (let c = 0; c < COLS; c++) if (b.field.ownerAt(c, r) === e.team) return c;
  } else {
    for (let c = COLS - 1; c >= 0; c--) if (b.field.ownerAt(c, r) === e.team) return c;
  }
  return e.col;
}
