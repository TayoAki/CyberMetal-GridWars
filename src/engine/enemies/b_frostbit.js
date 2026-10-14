import { wait, shockwave } from '../combat.js';
import { ELEMENT, PANEL } from '../constants.js';

// Frostbit: a stubby cryo bot that belly-slides up and down its column to line up with the player,
// inhales (counterable) and breathes a freezing gust that rolls along the floor of its row, turning every
// panel it crosses to ice. From level 2 it also freezes the panel under the player as it inhales, so a
// lazy dodge ends in a slide. Mirrors BN3's Pengi family (HP 80/100/130/260, Aqua).

export const FROSTBIT = {
  type: 'frostbit',
  kind: 'virus',
  mirrors: 'Pengi',
  names: ['Frostbit', 'Frostbit2', 'Frostbit3', 'FrostbitΩ'],
  hp: [80, 100, 130, 260],
  element: 'aqua',
  levels: [
    { attack: 20, step: 30, glide: 10, slides: 2, inhale: 36, wave: 8, freeze: false, rest: 80 },
    { attack: 40, step: 26, glide: 9, slides: 2, inhale: 30, wave: 7, freeze: true, rest: 62 },
    { attack: 70, step: 22, glide: 8, slides: 3, inhale: 26, wave: 6, freeze: true, rest: 44 },
    { attack: 110, step: 18, glide: 7, slides: 3, inhale: 22, wave: 5, freeze: true, rest: 36 },
  ],
  *ai(b, e) {
    const s = e.stats;
    e.setAnim('idle');
    yield* wait(b.rng.range(15, 40));
    for (;;) {
      // Line up with the player's row; when the column is blocked, shuffle sideways instead.
      for (let i = 0; i < s.slides && e.row !== b.player.row; i++) {
        const dr = Math.sign(b.player.row - e.row);
        if (!(yield* slide(b, e, 0, dr, s))) {
          const dc = b.rng.chance(0.5) ? 1 : -1;
          if (!(yield* slide(b, e, dc, 0, s))) yield* slide(b, e, -dc, 0, s);
        }
      }
      if (e.row !== b.player.row) {
        yield* wait(10);
        if (b.rng.chance(0.5)) continue;
      }

      e.setAnim('windup');
      e.counterWindow = s.inhale;
      b.emit('sfx', { name: 'wind' });
      if (s.freeze) freezePanel(b, b.player.col, b.player.row, e.level);
      yield* wait(s.inhale);
      e.counterWindow = 0;

      e.setAnim('attack');
      b.emit('sfx', { name: 'wave' });
      const hit = { damage: s.attack, element: ELEMENT.AQUA, flinch: true };
      shockwave(b, e, hit, {
        speed: s.wave,
        type: 'frostbreath',
        onPanel: (sp, c, r) => {
          sp.data.enterT = sp.t;
          sp.data.speed = s.wave;
          freezePanel(b, c, r, 0);
        },
      });
      yield* wait(28);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
};

// Slide one panel (dc, dr) if possible. Returns whether it moved.
function* slide(b, e, dc, dr, s) {
  if (!b.tryStep(e, dc, dr)) return false;
  e.setAnim('move');
  for (let f = 1; f <= s.glide; f++) {
    const k = 1 - f / s.glide;
    e.offsetX = -dc * k * k;
    e.offsetY = -dr * k * k;
    yield;
  }
  e.offsetX = 0;
  e.offsetY = 0;
  e.setAnim('idle');
  yield* wait(Math.max(0, s.step - s.glide));
  return true;
}

// Turn a panel to ice (never a hole). With flashLevel, show the freeze in that level's colours.
function freezePanel(b, c, r, flashLevel) {
  const t = b.field.typeAt(c, r);
  if (t === null || t === PANEL.BROKEN || t === PANEL.ICE) return;
  b.field.setType(c, r, PANEL.ICE);
  if (flashLevel) b.emit('fx', { fx: 'frostflash', col: c, row: r, level: flashLevel });
}
