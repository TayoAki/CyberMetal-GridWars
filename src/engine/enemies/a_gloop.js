import { wait, shockwave, marker, freePanels } from '../combat.js';
import { settle } from './a_common.js';

// Gloop: a gelatinous blob. It melts into the floor (hidden: untargetable and not drawn), slithers under
// its area to the front panel of the player's row, bubbles there for a moment (a telegraph), oozes back
// up, shudders (counterable) and sends a rolling wave of jelly down the row that passes through
// everything; then it sinks again. Mirrors BN3's Jelly family (170 Aqua / 220 Fire / 270 Wood / 370 Aqua).

export const GLOOP = {
  type: 'gloop',
  kind: 'virus',
  mirrors: 'Jelly',
  names: ['Gloop', 'Gloop2', 'Gloop3', 'GloopΩ'],
  hp: [170, 220, 270, 370],
  element: ['aqua', 'fire', 'wood', 'aqua'],
  levels: [
    // under: frames submerged before moving; bubble: telegraph frames at the emergence panel;
    // speed: wave frames per panel; rest: frames sitting on the surface after an attack.
    { attack: 30, under: 40, bubble: 26, windup: 30, speed: 12, rest: 44 },
    { attack: 60, under: 34, bubble: 24, windup: 26, speed: 10, rest: 36 },
    { attack: 90, under: 28, bubble: 22, windup: 22, speed: 9, rest: 30 },
    { attack: 140, under: 22, bubble: 18, windup: 18, speed: 7, rest: 24 },
  ],
  *ai(b, e) {
    const s = e.stats;
    settle(e);
    e.hidden = false;
    e.setAnim('idle');
    yield* wait(b.rng.range(20, 50));
    for (;;) {
      // Melt into the floor. Still solid (and hittable) until it is gone.
      e.setAnim('sink');
      yield* wait(16);
      e.hidden = true;
      yield* wait(s.under);

      // Slither to the front of the player's row (or anywhere free), then bubble as a warning.
      const dest = emergeSpot(b, e);
      // Underground, so it neither cracks the panel it leaves nor triggers the one it reaches.
      if (dest && (dest[0] !== e.col || dest[1] !== e.row)) b.moveEntity(e, dest[0], dest[1], { noBreak: true, noPanelEffects: true });
      const bubble = marker(b, e, 'gloopbubble', e.col, e.row, s.bubble);
      bubble.data.level = e.level;
      bubble.data.element = e.element;
      e.data.bubble = bubble;
      yield* wait(s.bubble);
      e.data.bubble = null;

      // Ooze back up and shudder: the counter window.
      e.hidden = false;
      e.setAnim('rise');
      yield* wait(14);
      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;

      e.setAnim('fire');
      b.emit('sfx', { name: 'wave' });
      const wave = shockwave(b, e, { damage: s.attack, element: e.element, flinch: true }, { speed: s.speed, type: 'gloopwave' });
      wave.data.level = e.level;
      yield* wait(22);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
  onFlinch(b, e) {
    e.hidden = false;
    e.data.bubble?.kill();
    e.data.bubble = null;
  },
  onDelete(b, e) {
    e.hidden = false; // let the deletion play where it was (poison can finish it off underground)
    e.data.bubble?.kill();
    e.data.bubble = null;
  },
};

// The front panel of e's area in the player's row (the one nearest the player) if it is free, else any
// free panel of its area.
export function emergeSpot(b, e) {
  const row = b.player.row;
  const cols = [0, 1, 2, 3, 4, 5];
  if (e.facing > 0) cols.reverse();
  for (const c of cols) {
    if (b.field.ownerAt(c, row) !== e.team) continue;
    if ((c === e.col && row === e.row) || b.canEnter(e, c, row)) return [c, row];
    break;
  }
  const spots = freePanels(b, e);
  return spots.length ? b.rng.pick(spots) : null;
}
