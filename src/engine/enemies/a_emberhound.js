import { wait, projectile } from '../combat.js';
import { ELEMENT } from '../constants.js';
import { leap, pickSpot, settle } from './a_common.js';

// Emberhound: a fire hound. Prowls its area in a few bounds, plants its feet, rears back (counterable) and
// spits a fireball down its row. Higher levels bound less, pause less and spit faster; the Ω hound spits
// two in a row. Mirrors BN3's Spikey family (HP 90/140/190/260, Fire).

export const EMBERHOUND = {
  type: 'emberhound',
  kind: 'virus',
  mirrors: 'Spikey',
  names: ['Emberhound', 'Emberhnd2', 'Emberhnd3', 'EmberhndΩ'],
  hp: [90, 140, 190, 260],
  element: 'fire',
  levels: [
    // hops: bounds per prowl [min, max]; leap: frames per bound; aim: chance the last bound lines up
    // with the player; speed: fireball frames per panel; shots: fireballs per volley.
    { attack: 20, hops: [2, 3], leap: 12, pause: 34, aim: 0.4, windup: 30, speed: 8, shots: 1, gap: 0, rest: 50 },
    { attack: 50, hops: [2, 3], leap: 11, pause: 26, aim: 0.5, windup: 26, speed: 7, shots: 1, gap: 0, rest: 40 },
    { attack: 80, hops: [1, 3], leap: 10, pause: 20, aim: 0.6, windup: 22, speed: 5, shots: 1, gap: 0, rest: 32 },
    { attack: 120, hops: [1, 2], leap: 9, pause: 14, aim: 0.7, windup: 18, speed: 4, shots: 2, gap: 14, rest: 26 },
  ],
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.setAnim('idle');
    yield* wait(b.rng.range(10, 40));
    for (;;) {
      // Prowl: bound between free panels, pausing to sniff the air.
      const hops = b.rng.range(s.hops[0], s.hops[1]);
      for (let i = 0; i < hops; i++) {
        const spot = pickSpot(b, e, i === hops - 1 ? s.aim : 0);
        if (spot) {
          e.setAnim('move');
          yield* leap(b, e, spot[0], spot[1], s.leap, 10);
        }
        e.setAnim('idle');
        yield* wait(s.pause);
      }

      // Rear back and draw breath: the counter window.
      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;

      for (let k = 0; k < s.shots; k++) {
        if (k > 0) {
          // A quick second breath (not counterable) before the follow-up shot.
          e.setAnim('windup');
          yield* wait(s.gap);
        }
        e.setAnim('fire');
        b.emit('sfx', { name: 'flame' });
        const shot = projectile(b, e, { damage: s.attack, element: ELEMENT.FIRE, flinch: true }, {
          speed: s.speed,
          type: 'emberball',
          onHit: (sp, t, c, r) => b.emit('fx', { fx: 'flame', col: c, row: r }),
        });
        shot.data.level = e.level;
        yield* wait(12);
      }
      yield* wait(10);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
};
