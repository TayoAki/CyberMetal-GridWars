import { compatible } from '../engine/custom.js';
import { TEAM } from '../engine/constants.js';

// A simple bot that plays battles: used for the title-screen demo and scripted browser checks.
// It picks chips on the Custom Screen, lines up with enemies, shoots, uses chips and sidesteps
// incoming row attacks. It drives the battle through pad input (plus the Custom Screen model).

export function autopilot(opts = {}) {
  let t = 0;
  let holdB = 0;
  let lastMove = 0;
  return (b) => {
    t++;
    const pad = {};
    if (b.phase === 'custom') {
      const cs = b.custom;
      if (t % 6 !== 0) return pad;
      if (cs.selected.length < Math.min(3, cs.hand.length)) {
        const sel = cs.selectedChips();
        const i = cs.hand.findIndex((c, k) => !cs.selected.includes(k) && compatible([...sel, c]));
        if (i >= 0) {
          cs.select(i);
          return pad;
        }
      }
      cs.cursor = { x: 5, y: 0 };
      pad.a = true;
      return pad;
    }
    if (b.phase !== 'fight') return pad;
    const p = b.player;
    const foes = b.entities.filter((e) => e.alive && !e.removed && e.team === TEAM.BLUE && e.kind !== 'object');
    if (!foes.length) return pad;

    // Danger: an enemy spell in our row closing in.
    const danger = b.spells.some((s) => s.team === TEAM.BLUE && Math.round(s.y) === p.row && s.x >= p.col - 0.5 && s.x - p.col < 2.2 && s.hit);
    if (danger && t - lastMove > 6) {
      const dr = p.row === 0 ? 1 : p.row === 2 ? -1 : (t >> 5) % 2 ? 1 : -1;
      pad[dr > 0 ? 'down' : 'up'] = true;
      lastMove = t;
      return pad;
    }
    const inRow = foes.filter((e) => e.row === p.row && e.targetable);
    if (!inRow.length) {
      const target = foes.reduce((a, e) => (Math.abs(e.row - p.row) < Math.abs(a.row - p.row) ? e : a), foes[0]);
      if (t - lastMove > 8) {
        pad[target.row > p.row ? 'down' : 'up'] = true;
        lastMove = t;
      }
      return pad;
    }
    // Use chips on a rhythm, otherwise buster / charge.
    const next = b.controller.chips[0];
    if (next && t % 40 === 0) {
      pad.a = true;
      return pad;
    }
    if (opts.charge !== false && t % 240 < 120) {
      holdB++;
      pad.b = holdB < 125;
      if (!pad.b) holdB = 0;
      return pad;
    }
    holdB = 0;
    pad.b = t % 8 < 2;
    return pad;
  };
}
