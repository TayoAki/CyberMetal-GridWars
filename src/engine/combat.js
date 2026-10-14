import { COLS, ROWS, PANEL } from './constants.js';

// Attack primitives shared by chips and enemy AIs. Every helper takes the battle first and returns the
// spell (or what it hit), so AIs read like the attack they perform.

export function* wait(n) {
  for (let i = 0; i < n; i++) yield;
}

// A source for instant attacks (slashes, hitscan): the dedupe set and attribution a spell would carry.
export function source(user, hit, team = user.team) {
  return { team, owner: user, hit, hitIds: new Set() };
}

export function inside(c, r) {
  return c >= 0 && c < COLS && r >= 0 && r < ROWS;
}

// Instant shot down the user's row (Buster, Cannon). Returns the body hit, or null.
export function hitscan(b, user, hit, opts = {}) {
  const dir = opts.dir ?? user.facing;
  const row = opts.row ?? user.row;
  const start = opts.col ?? user.col + dir;
  const target = b.firstTarget(user.team, start, row, dir, { pierceInvis: hit.pierceInvis });
  if (!target) return null;
  const src = source(user, hit);
  const res = b.applyHit(target, hit, src);
  return res.connected ? target : null;
}

export function busterShot(b, user, attack, charged = false) {
  const hit = charged ? { damage: 10 * attack, flinch: true, isCharge: true } : { damage: attack, isBuster: true };
  const target = hitscan(b, user, hit);
  b.emit('fx', {
    fx: charged ? 'chargeshot' : 'buster',
    col: user.col,
    row: user.row,
    dir: user.facing,
    toCol: target ? target.col : user.facing > 0 ? COLS : -1,
    hit: !!target,
  });
  if (!charged) b.emit('sfx', { name: 'buster' });
  return target;
}

// Hit every listed panel at once. Returns the bodies hit.
export function strike(b, user, cells, hit, opts = {}) {
  const src = opts.src ?? source(user, hit, opts.team);
  const hits = [];
  for (const [c, r] of cells) {
    if (!inside(c, r)) continue;
    if (opts.fx) b.emit('fx', { fx: opts.fx, col: c, row: r, dir: user.facing });
    const e = b.hitPanel(src, c, r, hit);
    if (e) hits.push(e);
    if (opts.crack) b.field.crack(c, r, !!b.entityAt(c, r));
    if (opts.breakPanel) b.field.breakPanel(c, r, !!b.entityAt(c, r));
    if (opts.panel) b.field.setType(c, r, opts.panel);
  }
  return hits;
}

// Ground shockwave: crawls one panel every `speed` frames, hits everything it passes, stops at holes.
export function shockwave(b, user, hit, opts = {}) {
  const dir = opts.dir ?? user.facing;
  const row = opts.row ?? user.row;
  const speed = opts.speed ?? 8;
  const start = opts.col ?? user.col + dir;
  const s = b.addSpell({ type: opts.type ?? 'shockwave', team: opts.team ?? user.team, owner: user, col: start, row, dir, hit });
  s.script = (function* () {
    for (let c = start; c >= 0 && c < COLS; c += dir) {
      if (b.field.isHole(c, row)) return;
      s.col = c;
      s.x = c;
      if (opts.crack) b.field.crack(c, row, !!b.entityAt(c, row));
      if (opts.onPanel) opts.onPanel(s, c, row);
      for (let i = 0; i < speed; i++) {
        b.hitPanel(s, c, row);
        if (opts.stopOnHit && s.hitIds.size > 0) return;
        yield;
      }
    }
  })();
  return s;
}

// Straight projectile: advances a panel every `speed` frames, hits the first body it reaches.
export function projectile(b, user, hit, opts = {}) {
  const dir = opts.dir ?? user.facing;
  const row = opts.row ?? user.row;
  const speed = opts.speed ?? 4;
  const start = opts.col ?? user.col + dir;
  const s = b.addSpell({ type: opts.type ?? 'shot', team: opts.team ?? user.team, owner: user, col: start, row, dir, hit });
  s.x = start - dir * 0.5;
  s.script = (function* () {
    for (let c = start; c >= 0 && c < COLS; c += dir) {
      s.col = c;
      for (let i = 0; i < speed; i++) {
        s.x = c - dir * 0.5 + dir * ((i + 1) / speed);
        const e = b.hitPanel(s, c, row);
        if (e) {
          opts.onHit?.(s, e, c, row);
          if (!opts.pierce) return;
        }
        yield;
      }
      if (opts.onPanel?.(s, c, row) === false) return;
    }
    opts.onExit?.(s);
  })();
  return s;
}

// Arcing throw: flies over everything and lands on (tc, tr) after `frames`, then strikes `cells`.
export function lob(b, user, hit, tc, tr, opts = {}) {
  const frames = opts.frames ?? 36;
  const fromX = opts.fromX ?? user.col;
  const fromY = opts.fromY ?? user.row;
  const s = b.addSpell({ type: opts.type ?? 'bomb', team: opts.team ?? user.team, owner: user, col: tc, row: tr, hit });
  s.x = fromX;
  s.y = fromY;
  s.data.target = { col: tc, row: tr };
  s.data.landing = opts.cells ? opts.cells(tc, tr) : [[tc, tr]]; // where it will land (for telegraph-aware logic)
  s.script = (function* () {
    for (let t = 1; t <= frames; t++) {
      const k = t / frames;
      s.x = fromX + (tc - fromX) * k;
      s.y = fromY + (tr - fromY) * k;
      s.z = (opts.height ?? 40) * 4 * k * (1 - k);
      yield;
    }
    s.x = tc;
    s.y = tr;
    s.z = 0;
    if (!inside(tc, tr)) return;
    const cells = opts.cells ? opts.cells(tc, tr) : [[tc, tr]];
    for (const [c, r] of cells) {
      if (!inside(c, r)) continue;
      b.emit('fx', { fx: opts.landFx ?? 'explosion', col: c, row: r });
      b.hitPanel(s, c, r);
      if (opts.crack) b.field.crack(c, r, !!b.entityAt(c, r));
      if (opts.breakPanel) b.field.breakPanel(c, r, !!b.entityAt(c, r));
      if (opts.panel && b.field.typeAt(c, r) !== PANEL.BROKEN) b.field.setType(c, r, opts.panel);
    }
    b.emit('sfx', { name: opts.sfx ?? 'explode' });
    opts.onLand?.(s, tc, tr);
  })();
  return s;
}

// Telegraphed drop (meteor, lightning, fist): a marker shows for `delay` frames, then the panel is struck.
export function drop(b, user, hit, c, r, opts = {}) {
  const delay = opts.delay ?? 40;
  const s = b.addSpell({ type: opts.type ?? 'meteor', team: opts.team ?? user.team, owner: user, col: c, row: r, hit });
  s.data.delay = delay;
  s.data.landing = [[c, r]];
  s.script = (function* () {
    for (let t = 0; t < delay; t++) {
      s.data.progress = t / delay;
      yield;
    }
    s.data.landed = true;
    b.emit('fx', { fx: opts.landFx ?? 'explosion', col: c, row: r });
    b.emit('sfx', { name: opts.sfx ?? 'explode' });
    b.hitPanel(s, c, r);
    if (opts.crack) b.field.crack(c, r, !!b.entityAt(c, r));
    if (opts.breakPanel) b.field.breakPanel(c, r, !!b.entityAt(c, r));
    if (opts.panel && b.field.typeAt(c, r) !== PANEL.BROKEN) b.field.setType(c, r, opts.panel);
    opts.onLand?.(s, c, r);
    for (let t = 0; t < (opts.linger ?? 6); t++) yield;
  })();
  return s;
}

// A hitbox that sits on some panels for `frames`, hitting each body once (flames, tornado, poison mist).
// With opts.rehit = N, a body standing in it is hit again every N frames.
export function zone(b, user, hit, cells, frames, opts = {}) {
  const [c0, r0] = cells[0] ?? [user.col, user.row];
  const s = b.addSpell({ type: opts.type ?? 'zone', team: opts.team ?? user.team, owner: user, col: c0, row: r0, hit });
  s.data.cells = cells;
  s.script = (function* () {
    for (let t = 0; t < frames; t++) {
      if (opts.rehit && t % opts.rehit === 0) s.hitIds.clear();
      for (const [c, r] of cells) if (inside(c, r)) b.hitPanel(s, c, r);
      yield;
    }
  })();
  return s;
}

// A short-lived marker with no hit (reticles, warnings). Purely a view hint the AI controls.
export function marker(b, user, type, c, r, frames) {
  const s = b.addSpell({ type, team: user.team, owner: user, col: c, row: r, hit: null });
  s.script = (function* () {
    for (let t = 0; t < frames; t++) {
      s.data.progress = t / frames;
      yield;
    }
  })();
  return s;
}

export function teleport(b, e, c, r, opts = {}) {
  if (!b.canEnter(e, c, r, opts)) return false;
  b.emit('fx', { fx: 'warp', col: e.col, row: e.row });
  b.moveEntity(e, c, r, { noBreak: !!opts.noBreak });
  b.emit('fx', { fx: 'warp', col: c, row: r });
  return true;
}

// Free panels a body could stand on in its own area.
export function freePanels(b, e, filter = null) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((c === e.col && r === e.row) || b.canEnter(e, c, r)) {
        if (!filter || filter(c, r)) out.push([c, r]);
      }
    }
  }
  return out;
}

export function sign(n) {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}
