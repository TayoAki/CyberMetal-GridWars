import { wait, shockwave } from '../combat.js';

// Rivet: a hard-hatted construction bot. Drifts to the player's row, winds up its hammer (counterable)
// and sends a ground shockwave across the field. Only one Rivet attacks at a time — they take turns.
// Mirrors BN3's Mettaur family (HP 40/60/120/160, Null).

export const RIVET = {
  type: 'rivet',
  kind: 'virus',
  mirrors: 'Mettaur',
  names: ['Rivet', 'Rivet2', 'Rivet3', 'RivetΩ'],
  hp: [40, 60, 120, 160],
  element: 'null',
  levels: [
    { attack: 10, step: 34, windup: 30, wave: 12, rest: 50 },
    { attack: 30, step: 28, windup: 26, wave: 10, rest: 40 },
    { attack: 60, step: 22, windup: 22, wave: 8, rest: 32 },
    { attack: 100, step: 16, windup: 18, wave: 6, rest: 24 },
  ],
  *ai(b, e) {
    const s = e.stats;
    e.setAnim('idle');
    yield* wait(b.rng.range(10, 40));
    for (;;) {
      const p = b.player;
      if (p.row !== e.row) {
        const dr = Math.sign(p.row - e.row);
        if (b.tryStep(e, 0, dr)) e.setAnim('move');
        yield* wait(s.step);
        e.setAnim('idle');
        continue;
      }
      if (!b.claimToken('rivet', e)) {
        yield* wait(8);
        continue;
      }
      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;
      e.setAnim('swing');
      b.emit('sfx', { name: 'shockwave' });
      shockwave(b, e, { damage: s.attack, flinch: true }, { speed: s.wave });
      yield* wait(24);
      e.setAnim('idle');
      yield* wait(12);
      b.releaseToken('rivet', e);
      yield* wait(s.rest);
    }
  },
};
