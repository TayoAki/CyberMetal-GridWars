import { wait, lob } from '../combat.js';
import { COLS, ROWS } from '../constants.js';
import { leap, adjacentSpot, plusCells, settle } from './a_common.js';

// Bombeetle: a rhino-beetle with a bomb launcher on its back. It scuttles about now and then, rears up
// (counterable) and lobs bombs that land on the panel the player stands on. Lv1 throws one small bomb,
// Lv2 a big one with a plus-shaped blast, Lv3 two (the player's panel and a random neighbour), and the Ω
// beetle three, on a faster arc. Mirrors BN3's Beetle family (HP 90/130/170/220, Null).

export const BOMBEETLE = {
  type: 'bombeetle',
  kind: 'virus',
  mirrors: 'Beetle',
  names: ['Bombeetle', 'Bombeetle2', 'Bombeetle3', 'BombeetleΩ'],
  hp: [90, 130, 170, 220],
  element: 'null',
  levels: [
    // idle: frames between volleys; wander: chance to scuttle first; flight: bomb frames in the air;
    // bombs: bombs per volley; blast: 'single' | 'plus'.
    { attack: 20, idle: 60, wander: 0.5, windup: 30, flight: 36, bombs: 1, blast: 'single', rest: 30 },
    { attack: 40, idle: 52, wander: 0.5, windup: 26, flight: 36, bombs: 1, blast: 'plus', rest: 26 },
    { attack: 70, idle: 44, wander: 0.4, windup: 22, flight: 34, bombs: 2, blast: 'single', rest: 24 },
    { attack: 110, idle: 36, wander: 0.4, windup: 18, flight: 28, bombs: 3, blast: 'single', rest: 20 },
  ],
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    yield* wait(b.rng.range(20, 50));
    for (;;) {
      if (b.rng.chance(s.wander)) {
        const spot = adjacentSpot(b, e);
        if (spot) {
          e.setAnim('move');
          yield* leap(b, e, spot[0], spot[1], 14, 0);
          e.setAnim('idle');
        }
      }
      yield* wait(s.idle);

      // Rear up with a bomb on the launcher: the counter window.
      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;

      e.setAnim('fire');
      const targets = bombTargets(b, e, s.bombs);
      for (let i = 0; i < targets.length; i++) {
        if (i > 0) yield* wait(5);
        const [tc, tr] = targets[i];
        b.emit('sfx', { name: 'throw' });
        const bomb = lob(b, e, { damage: s.attack, flinch: true }, tc, tr, {
          frames: s.flight,
          height: 44,
          type: 'beetlebomb',
          cells: s.blast === 'plus' ? plusCells : undefined,
        });
        bomb.data.level = e.level;
        bomb.data.blast = s.blast;
      }
      yield* wait(18);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
};

// The player's panel, then up to n-1 distinct random neighbours of it (preferring the player's own area).
export function bombTargets(b, e, n) {
  const p = b.player;
  const out = [[p.col, p.row]];
  if (n <= 1) return out;
  const near = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = p.col + dc;
    const r = p.row + dr;
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) near.push([c, r]);
  }
  const theirs = near.filter(([c, r]) => b.field.ownerAt(c, r) !== e.team);
  const pool = b.rng.shuffle(theirs.length >= n - 1 ? theirs : near);
  for (let i = 0; i < pool.length && out.length < n; i++) out.push(pool[i]);
  return out;
}
