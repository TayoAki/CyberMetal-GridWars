import { compatible } from '../engine/custom.js';
import { TEAM, COLS, ROWS } from '../engine/constants.js';

// A simple bot that plays battles: used for the title-screen demo, scripted browser checks and the
// balance sweep. It picks chips on the Custom Screen, keeps off panels that are about to be hit (a
// danger map built from enemy spells, telegraphs and wind-ups), lines up with enemies and attacks.

const key = (c, r) => c * 10 + r;

export function dangerMap(b) {
  const d = new Set();
  const add = (c, r) => {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) d.add(key(c, r));
  };
  for (const s of b.spells) {
    if (!s.alive || s.team === TEAM.RED) continue;
    const r = Math.round(s.y);
    if (s.data?.cells) for (const [c, rr] of s.data.cells) add(c, rr);
    // A lob lands on its target. Its cells callback may draw from the battle RNG, so it is never called
    // ahead of time: read the shape the thrower left in data.blast / data.effect, else assume a plus.
    if (s.data?.target) {
      const { col: tc, row: tr } = s.data.target;
      add(tc, tr);
      const single = s.data.blast === 'single' || (s.data.effect !== undefined && s.data.effect !== 'blast');
      if (!single) for (const [c, rr] of [[tc + 1, tr], [tc - 1, tr], [tc, tr - 1], [tc, tr + 1]]) add(c, rr);
    }
    if (Array.isArray(s.data?.landing)) for (const [c, rr] of s.data.landing) add(c, rr);
    if (s.data?.delay !== undefined || s.type === 'reticle') {
      add(s.col, s.row);
      if (s.type === 'reticle') for (let c = 0; c < COLS; c++) add(c, s.row);
    }
    if (s.hit && !s.data?.cells && s.data?.delay === undefined && !s.data?.target) {
      // Something on the move: the next few panels ahead of it (data.dc/dr is the heading of a crawler
      // that can turn, otherwise it runs along its row).
      const x = Math.round(s.x);
      const dc = s.data?.dc ?? (s.dir || -1);
      const dr = s.data?.dr ?? 0;
      for (let k = 0; k <= 3; k++) add(x + k * dc, r + k * dr);
      // A crawler that has not turned yet turns toward anyone standing in the column it is crossing:
      // that whole column is unsafe until it has passed (the dodge is a sidestep, best behind it).
      if (s.data?.dc !== undefined && !s.data.turned && dr === 0) for (let rr = 0; rr < ROWS; rr++) add(s.col, rr);
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

    const press = (dc, dr) => {
      if (dc < 0) pad.left = true;
      else if (dc > 0) pad.right = true;
      else if (dr < 0) pad.up = true;
      else if (dr > 0) pad.down = true;
      lastMove = t;
      holdB = 0;
    };
    // Where one step from (c, r) really ends: ice carries a body on until something stops it.
    const slides = p.grounded && p.element !== 'aqua';
    const land = (c, r, dc, dr) => {
      let nc = c + dc;
      let nr = r + dr;
      if (!b.canEnter(p, nc, nr)) return null;
      while (slides && b.field.typeAt(nc, nr) === 'ice' && b.canEnter(p, nc + dc, nr + dr)) {
        nc += dc;
        nr += dr;
      }
      return [nc, nr];
    };
    const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    // 1. Get out of harm's way: breadth-first search (in real steps, slides included) for the nearest
    // safe panel up to 3 steps away, preferring one in an enemy's row, then take the first step of that
    // path even if it crosses danger. Lava and poison are avoided unless there is no other way out: a
    // burn costs less than a direct hit.
    if (danger.has(key(p.col, p.row)) && canStep) {
      const escape = (allowHazard) => {
        const seen = new Set([key(p.col, p.row)]);
        let frontier = [[p.col, p.row, null]];
        for (let depth = 0; depth < 3; depth++) {
          const next = [];
          for (const [c, r, first] of frontier) {
            for (const [dc, dr] of DIRS) {
              const to = land(c, r, dc, dr);
              if (!to) continue;
              const k = key(to[0], to[1]);
              if (seen.has(k) || (!allowHazard && hazard(to[0], to[1]))) continue;
              seen.add(k);
              next.push([to[0], to[1], first ?? [dc, dr]]);
            }
          }
          const goals = next.filter(([c, r]) => !danger.has(key(c, r)));
          if (goals.length) return (goals.find(([, r]) => foes.some((f) => f.row === r)) ?? goals[0])[2];
          frontier = next;
        }
        return null;
      };
      const step = escape(false) ?? escape(true);
      if (step) {
        press(step[0], step[1]);
        return pad;
      }
    }

    // 2. Line up with an enemy (only if the step really ends on a safe panel).
    const inRow = foes.filter((e) => e.row === p.row && e.targetable);
    if (!inRow.length && canStep) {
      const target = foes.reduce((a, e) => (Math.abs(e.row - p.row) < Math.abs(a.row - p.row) ? e : a), foes[0]);
      const dr = Math.sign(target.row - p.row);
      const to = dr ? land(p.col, p.row, 0, dr) : null;
      if (to && safe(to[0], to[1])) {
        press(0, dr);
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
