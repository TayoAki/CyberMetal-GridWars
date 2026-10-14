import { compatible } from '../engine/custom.js';
import { TEAM, COLS, ROWS } from '../engine/constants.js';

// A simple bot that plays battles: used for the title-screen demo, scripted browser checks and the
// balance sweep. It picks chips on the Custom Screen, keeps off panels that are about to be hit (a
// danger map built from enemy spells, telegraphs and wind-ups), lines up with enemies and attacks.

const key = (c, r) => c * 10 + r;

function dangerMap(b) {
  const d = new Set();
  const add = (c, r) => {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) d.add(key(c, r));
  };
  for (const s of b.spells) {
    if (!s.alive || s.team === TEAM.RED) continue;
    const r = Math.round(s.y);
    if (s.data?.cells) for (const [c, rr] of s.data.cells) add(c, rr);
    // A lob lands on its target; assume a plus-shaped blast to be safe (its cells callback may consume
    // the battle RNG, so it is never called ahead of time).
    if (s.data?.target) {
      const { col: tc, row: tr } = s.data.target;
      for (const [c, rr] of [[tc, tr], [tc + 1, tr], [tc - 1, tr], [tc, tr - 1], [tc, tr + 1]]) add(c, rr);
    }
    if (Array.isArray(s.data?.landing)) for (const [c, rr] of s.data.landing) add(c, rr);
    if (s.data?.delay !== undefined || s.type === 'reticle') {
      add(s.col, s.row);
      if (s.type === 'reticle') for (let c = 0; c < COLS; c++) add(c, s.row);
    }
    if (s.hit && !s.data?.cells && s.data?.delay === undefined && !s.data?.target) {
      // Something moving along a row: the next few panels ahead of it.
      const x = Math.round(s.x);
      for (let k = 0; k <= 3; k++) add(x + k * (s.dir || -1), r);
      add(x, r);
    }
  }
  for (const e of b.entities) {
    if (!e.alive || e.team !== TEAM.BLUE || e.kind === 'object') continue;
    // A wind-up in a row usually means that row is about to be hit; so does a body mid-dash.
    const windup = e.counterWindow > 0 || ['windup', 'aim', 'charge', 'dash'].includes(e.anim) || (e.offsetX ?? 0) !== 0;
    if (windup) for (let c = 0; c < e.col; c++) add(c, e.row);
  }
  return d;
}

export function autopilot(opts = {}) {
  let t = 0;
  let holdB = 0;
  let lastMove = -99;
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
    if (!p.alive) return pad;
    const foes = b.entities.filter((e) => e.alive && !e.removed && e.team === TEAM.BLUE && e.kind !== 'object');
    if (!foes.length) return pad;
    if (b.gaugeFull && t % 20 === 0 && !b.controller.action) {
      pad.r = true;
      return pad;
    }

    const danger = dangerMap(b);
    const hazard = (c, r) => {
      const t = b.field.typeAt(c, r);
      return (t === 'lava' && p.element !== 'fire') || t === 'poison';
    };
    const safe = (c, r) => !danger.has(key(c, r)) && (c === p.col && r === p.row ? true : b.canEnter(p, c, r) && !hazard(c, r));
    const busy = b.controller.action || b.controller.moveTimer > 0 || p.slide;
    const canStep = !busy && t - lastMove > 5;

    const stepTo = (c, r) => {
      if (c < p.col) pad.left = true;
      else if (c > p.col) pad.right = true;
      else if (r < p.row) pad.up = true;
      else if (r > p.row) pad.down = true;
      lastMove = t;
      holdB = 0;
    };
    const neighbours = [[p.col, p.row - 1], [p.col, p.row + 1], [p.col - 1, p.row], [p.col + 1, p.row]];

    // 1. Get out of harm's way: breadth-first search for the nearest safe panel (up to 3 steps), then
    // take the first step of that path even if it crosses danger.
    if (danger.has(key(p.col, p.row)) && canStep) {
      const walkable = (c, r) => b.canEnter(p, c, r) && !hazard(c, r);
      const prev = new Map([[key(p.col, p.row), null]]);
      let frontier = [[p.col, p.row]];
      let goal = null;
      for (let depth = 0; depth < 3 && !goal; depth++) {
        const next = [];
        for (const [c, r] of frontier) {
          for (const [nc, nr] of [[c, r - 1], [c, r + 1], [c - 1, r], [c + 1, r]]) {
            const k = key(nc, nr);
            if (prev.has(k) || !walkable(nc, nr)) continue;
            prev.set(k, key(c, r));
            next.push([nc, nr]);
            if (!danger.has(k) && (!goal || foes.some((f) => f.row === nr))) goal = goal ?? [nc, nr];
          }
        }
        frontier = next;
      }
      if (goal) {
        let k = key(goal[0], goal[1]);
        while (prev.get(k) !== key(p.col, p.row)) k = prev.get(k);
        stepTo(Math.floor(k / 10), k % 10);
        return pad;
      }
    }

    // 2. Line up with an enemy (on a safe panel).
    const inRow = foes.filter((e) => e.row === p.row && e.targetable);
    if (!inRow.length && canStep) {
      const target = foes.reduce((a, e) => (Math.abs(e.row - p.row) < Math.abs(a.row - p.row) ? e : a), foes[0]);
      const r = p.row + Math.sign(target.row - p.row);
      if (r !== p.row && safe(p.col, r)) {
        stepTo(p.col, r);
        return pad;
      }
    }

    // 3. Attack: chips on a rhythm, otherwise buster / charge.
    const next = b.controller.chips[0];
    if (next && inRow.length && t % 30 === 0) {
      pad.a = true;
      return pad;
    }
    if (opts.charge !== false && inRow.length && t % 240 < 140) {
      holdB++;
      pad.b = holdB < 125;
      if (!pad.b) holdB = 0;
      return pad;
    }
    holdB = 0;
    pad.b = inRow.length > 0 && t % 8 < 2;
    return pad;
  };
}
