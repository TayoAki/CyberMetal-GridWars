import { wait, hitscan, marker } from '../combat.js';
import { COLS } from '../constants.js';

// Plinker: a stationary turret. When the player enters its row a reticle locks on; once the lock
// completes it fires a cannon round down the row. Mirrors BN3's Canodumb family (HP 60/90/130/180).

export const PLINKER = {
  type: 'plinker',
  kind: 'virus',
  mirrors: 'Canodumb',
  names: ['Plinker', 'Plinker2', 'Plinker3', 'PlinkerΩ'],
  hp: [60, 90, 130, 180],
  element: 'null',
  immovable: true,
  levels: [
    { attack: 10, lock: 50, rest: 60 },
    { attack: 40, lock: 40, rest: 50 },
    { attack: 80, lock: 30, rest: 40 },
    { attack: 120, lock: 22, rest: 30 },
  ],
  onSpawn(b, e) {
    e.immovable = true;
  },
  *ai(b, e) {
    const s = e.stats;
    e.setAnim('idle');
    yield* wait(b.rng.range(10, 30));
    for (;;) {
      if (b.player.row !== e.row) {
        yield;
        continue;
      }
      e.setAnim('aim');
      e.counterWindow = s.lock;
      e.data.reticle = marker(b, e, 'reticle', b.player.col, e.row, s.lock);
      for (let t = 0; t < s.lock; t++) {
        // The reticle tracks the player along the row.
        if (e.data.reticle) e.data.reticle.col = e.data.reticle.x = b.player.row === e.row ? b.player.col : e.data.reticle.col;
        yield;
      }
      e.counterWindow = 0;
      e.setAnim('fire');
      b.emit('sfx', { name: 'cannon' });
      const t = hitscan(b, e, { damage: s.attack, flinch: true });
      b.emit('fx', { fx: 'cannonshot', col: e.col, row: e.row, dir: e.facing, toCol: t ? t.col : -1, enemy: true });
      if (t) b.emit('fx', { fx: 'explosion', col: t.col, row: t.row });
      yield* wait(20);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
  onFlinch(b, e) {
    if (e.data.reticle) e.data.reticle.kill();
  },
};

export { COLS };
