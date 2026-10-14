import { wait, hitscan } from '../combat.js';
import { COLS, ELEMENT } from '../constants.js';

// Watcher: a sentinel eye hovering over a tesla pylon. It never moves. When the player steps into its row
// the eye opens and charges (counterable); when the charge completes it fires an instant elec beam down
// the row. It commits to the row once charging, so leaving the row mid-charge is the dodge. The Ω beam
// also paralyses. Mirrors BN3's KillerEye family (HP 140/190/240/300, Elec).

export const WATCHER = {
  type: 'watcher',
  kind: 'virus',
  mirrors: 'KillerEye',
  names: ['Watcher', 'Watcher2', 'Watcher3', 'WatcherΩ'],
  hp: [140, 190, 240, 300],
  element: 'elec',
  immovable: true,
  levels: [
    { attack: 30, charge: 40, recoil: 22, rest: 80, stun: 0 },
    { attack: 60, charge: 32, recoil: 20, rest: 66, stun: 0 },
    { attack: 90, charge: 26, recoil: 18, rest: 54, stun: 0 },
    { attack: 130, charge: 20, recoil: 16, rest: 44, stun: 40 },
  ],
  onSpawn(b, e) {
    e.immovable = true;
    e.data.look = 0;
  },
  *ai(b, e) {
    const s = e.stats;
    e.setAnim('idle');
    yield* wait(b.rng.range(20, 45));
    for (;;) {
      const p = b.player;
      // Idle: the eye follows the player up and down (a view hint for the sprite).
      e.data.look = Math.sign(p.row - e.row);
      if (p.row !== e.row) {
        yield;
        continue;
      }
      e.data.look = 0;
      e.setAnim('windup');
      e.counterWindow = s.charge;
      b.emit('sfx', { name: 'charge' });
      yield* wait(s.charge);
      e.counterWindow = 0;

      e.setAnim('attack');
      b.emit('sfx', { name: 'zap' });
      const hit = { damage: s.attack, element: ELEMENT.ELEC, flinch: true };
      if (s.stun) hit.stun = s.stun;
      const t = hitscan(b, e, hit);
      b.emit('fx', {
        fx: 'eyebeam',
        col: e.col,
        row: e.row,
        dir: e.facing,
        toCol: t ? t.col : e.facing > 0 ? COLS : -1,
        hit: !!t,
        level: e.level,
      });
      yield* wait(s.recoil);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
};
