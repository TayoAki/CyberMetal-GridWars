import { wait, source, freePanels, teleport } from '../combat.js';

// Dartfin: a torpedo-shaped glider. Hovers to a row, quivers (counterable), then darts straight across the
// whole field, ramming whatever is in the row, and re-materialises in its own area.
// Mirrors BN3's Fishy family (HP 90/150/240/300; the level-2 variant is Fire).

export const DARTFIN = {
  type: 'dartfin',
  kind: 'virus',
  mirrors: 'Fishy',
  names: ['Dartfin', 'Dartfin2', 'Dartfin3', 'DartfinΩ'],
  hp: [90, 150, 240, 300],
  element: ['null', 'fire', 'null', 'null'],
  flying: true,
  levels: [
    { attack: 30, idle: 70, aim: 30, speed: 5 },
    { attack: 60, idle: 60, aim: 26, speed: 4 },
    { attack: 90, idle: 50, aim: 22, speed: 3 },
    { attack: 150, idle: 40, aim: 18, speed: 2 },
  ],
  *ai(b, e) {
    const s = e.stats;
    e.setAnim('idle');
    yield* wait(b.rng.range(20, 50));
    for (;;) {
      yield* wait(s.idle);
      // Line up: often on the player's row, sometimes anywhere.
      const spots = freePanels(b, e);
      const inRow = spots.filter(([, r]) => r === b.player.row);
      const pick = inRow.length && b.rng.chance(0.75) ? b.rng.pick(inRow) : b.rng.pick(spots);
      if (pick && (pick[0] !== e.col || pick[1] !== e.row)) teleport(b, e, pick[0], pick[1]);
      e.setAnim('aim');
      e.counterWindow = s.aim;
      yield* wait(s.aim);
      e.counterWindow = 0;

      // Dart across the field. The body is untouchable mid-dash, like the original.
      e.setAnim('dash');
      e.hidden = true;
      b.emit('sfx', { name: 'dash' });
      const src = source(e, { damage: s.attack, flinch: true });
      const startCol = e.col;
      for (let c = startCol - 1; c >= -1; c--) {
        for (let f = 0; f < s.speed; f++) {
          e.offsetX = c - startCol + 1 - (f + 1) / s.speed;
          if (c >= 0) b.hitPanel(src, c, e.row);
          yield;
        }
      }
      e.offsetX = 0;
      e.hidden = false;
      e.setAnim('idle');
      const back = freePanels(b, e);
      if (back.length) {
        const [c, r] = b.rng.pick(back);
        if (c !== e.col || r !== e.row) teleport(b, e, c, r);
      }
    }
  },
  onFlinch(b, e) {
    e.hidden = false;
    e.offsetX = 0;
  },
};
