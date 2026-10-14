import { wait, projectile } from '../combat.js';
import { ELEMENT } from '../constants.js';
import { leap, adjacentSpot, otherSpots, settle } from './a_common.js';

// Volthare: a jittery electric hare. Bounces around its area in a burst of quick hops, the last one
// usually landing in the player's row, crouches (counterable) and lets go a slow crackling ring that
// paralyzes whatever it touches. Mirrors BN3's Bunny family (HP 40/100/160/220, Elec).

export const VOLTHARE = {
  type: 'volthare',
  kind: 'virus',
  mirrors: 'Bunny',
  names: ['Volthare', 'Volthare2', 'Volthare3', 'VolthareΩ'],
  hp: [40, 100, 160, 220],
  element: 'elec',
  levels: [
    // hops: hops per burst [min, max]; leap: frames per hop; aim: chance the last hop lines up with the
    // player; speed: ring frames per panel (slow); stun: paralysis frames.
    { attack: 10, stun: 60, hops: [3, 5], leap: 8, pause: 14, aim: 0.6, windup: 28, speed: 12, rest: 40 },
    { attack: 30, stun: 70, hops: [3, 5], leap: 7, pause: 12, aim: 0.7, windup: 24, speed: 11, rest: 34 },
    { attack: 50, stun: 80, hops: [4, 6], leap: 6, pause: 10, aim: 0.8, windup: 20, speed: 10, rest: 28 },
    { attack: 80, stun: 90, hops: [4, 6], leap: 6, pause: 8, aim: 0.9, windup: 16, speed: 9, rest: 22 },
  ],
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    yield* wait(b.rng.range(10, 30));
    for (;;) {
      const hops = b.rng.range(s.hops[0], s.hops[1]);
      for (let i = 0; i < hops; i++) {
        let spot = null;
        if (i === hops - 1 && b.rng.chance(s.aim)) {
          // Last hop: line up with the player, preferring the nearest such panel.
          if (e.row !== b.player.row) {
            const inRow = otherSpots(b, e, (c, r) => r === b.player.row);
            inRow.sort((p, q) => Math.abs(p[0] - e.col) - Math.abs(q[0] - e.col));
            spot = inRow[0] ?? null;
          }
        } else spot = adjacentSpot(b, e) ?? b.rng.pick(otherSpots(b, e)) ?? null;
        if (spot) {
          e.setAnim('move');
          yield* leap(b, e, spot[0], spot[1], s.leap, 8);
        }
        e.setAnim('idle');
        yield* wait(s.pause);
      }

      // Crouch and build charge between the ears: the counter window.
      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;

      e.setAnim('fire');
      b.emit('sfx', { name: 'zap' });
      const ring = projectile(b, e, { damage: s.attack, element: ELEMENT.ELEC, flinch: false, stun: s.stun }, { speed: s.speed, type: 'voltring' });
      ring.data.level = e.level;
      yield* wait(18);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
};
