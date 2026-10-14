import { COLS, ROWS, PANEL, TEAM, TIMING, ELEMENT } from '../constants.js';
import { wait, hitscan, strike, shockwave, projectile, lob, drop, zone, source, inside } from '../combat.js';

// Chip behaviours: one generator per attack family. A behaviour runs as the user's action (the player is
// locked until it returns). `chip` is a resolved queue entry: { key, name, code, damage, element, def, boost }.
// Hit flags carry isChip so a hit during an enemy wind-up counts as a Counter.

function H(chip, extra = {}) {
  return { damage: chip.damage, element: chip.element ?? ELEMENT.NULL, flinch: true, isChip: true, ...extra };
}

function cellsFor(shape, c, r, d) {
  switch (shape) {
    case 'sword':
      return [[c + d, r]];
    case 'wide':
      return [[c + d, r - 1], [c + d, r], [c + d, r + 1]];
    case 'long':
      return [[c + d, r], [c + 2 * d, r]];
    case 'big':
      return [[c + d, r - 1], [c + d, r], [c + d, r + 1], [c + 2 * d, r - 1], [c + 2 * d, r], [c + 2 * d, r + 1]];
    case 'hero':
      return [[c + d, r], [c + 2 * d, r], [c + 3 * d, r]];
    case 'cross':
      return [[c + d, r], [c, r - 1], [c + 2 * d, r - 1], [c, r + 1], [c + 2 * d, r + 1]];
    default:
      return [[c + d, r]];
  }
}

function splashCells(pattern, tc, tr, d) {
  switch (pattern) {
    case 'behind':
      return [[tc + d, tr]];
    case 'diag':
      return [[tc + d, tr - 1], [tc + d, tr + 1]];
    case 'side':
      return [[tc, tr - 1], [tc, tr + 1]];
    case 'all': {
      const out = [];
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) out.push([tc + dc, tr + dr]);
      return out;
    }
    default:
      return [];
  }
}

// Body standing in the user's row nearest in front (for navi chips that home on a target).
function nearestOpponent(b, u) {
  const foes = b.opponentsOf(u.team).filter((e) => e.targetable);
  if (!foes.length) return null;
  foes.sort((a, z) => Math.abs(a.row - u.row) * 10 + Math.abs(a.col - u.col) - (Math.abs(z.row - u.row) * 10 + Math.abs(z.col - u.col)));
  return foes[0];
}

function opponentArea(b, team) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (b.field.ownerAt(c, r) !== team) out.push([c, r]);
  return out;
}

function* swordSlash(b, u, chip, shape, extra = {}) {
  const d = u.facing;
  b.emit('fx', { fx: 'slash', shape, col: u.col, row: u.row, dir: d, element: chip.element });
  b.emit('sfx', { name: 'sword' });
  const hits = strike(b, u, cellsFor(shape, u.col, u.row, d), H(chip, extra));
  return hits;
}

// Move the user forward up to `steps` panels (into enemy territory if free), returning a restore function.
function stepForward(b, u, steps) {
  const home = { col: u.col, row: u.row };
  const d = u.facing;
  let moved = 0;
  for (let i = steps; i >= 1; i--) {
    const c = u.col + d * i;
    if (b.canEnter(u, c, u.row, { ignoreArea: true })) {
      b.moveEntity(u, c, u.row, { noBreak: true, noPanelEffects: true });
      moved = i;
      break;
    }
  }
  return () => {
    if (moved === 0) return;
    if (b.canEnter(u, home.col, home.row)) b.moveEntity(u, home.col, home.row, { noBreak: true, noPanelEffects: true });
    else {
      // Home got taken: land on the nearest free panel of our own area.
      for (let dc = 0; dc < COLS; dc++) {
        for (const c of [home.col - dc * d, home.col + dc * d]) {
          for (let r = 0; r < ROWS; r++) {
            if (b.canEnter(u, c, r)) {
              b.moveEntity(u, c, r, { noBreak: true, noPanelEffects: true });
              return;
            }
          }
        }
      }
    }
  };
}

function* summon(b, u, naviType, frames, body) {
  u.hidden = true;
  b.emit('fx', { fx: 'summon', navi: naviType, col: u.col, row: u.row, dir: u.facing });
  b.emit('sfx', { name: 'summon' });
  u.setAnim('summon');
  u.data.summon = naviType;
  yield* wait(14);
  yield* body();
  yield* wait(frames);
  u.data.summon = null;
  u.hidden = false;
  b.emit('fx', { fx: 'warp', col: u.col, row: u.row });
}

export const BEHAVIORS = {
  *cannon(b, u, chip) {
    u.setAnim('cannon');
    yield* wait(8);
    b.emit('sfx', { name: 'cannon' });
    const t = hitscan(b, u, H(chip));
    b.emit('fx', { fx: 'cannonshot', col: u.col, row: u.row, dir: u.facing, toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
    if (t) b.emit('fx', { fx: 'explosion', col: t.col, row: t.row });
    yield* wait(22);
  },

  *airshot(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(5);
    b.emit('sfx', { name: 'airshot' });
    const t = hitscan(b, u, H(chip, { push: u.facing }));
    b.emit('fx', { fx: 'airshot', col: u.col, row: u.row, dir: u.facing, toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
    yield* wait(16);
  },

  *lavacannon(b, u, chip) {
    u.setAnim('cannon');
    yield* wait(10);
    b.emit('sfx', { name: 'cannon' });
    const t = hitscan(b, u, H(chip));
    b.emit('fx', { fx: 'cannonshot', col: u.col, row: u.row, dir: u.facing, element: 'fire', toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
    if (t) {
      b.emit('fx', { fx: 'flame', col: t.col, row: t.row });
      if (b.field.typeAt(t.col, t.row) !== PANEL.BROKEN) b.field.setType(t.col, t.row, PANEL.LAVA);
    }
    yield* wait(22);
  },

  *gun(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(6);
    const p = chip.def.params;
    b.emit('sfx', { name: p.fx === 'bubble' ? 'bubble' : 'gun' });
    const hit = H(chip, { flinch: true });
    const src = source(u, hit);
    const t = b.firstTarget(u.team, u.col + u.facing, u.row, u.facing);
    b.emit('fx', { fx: 'gunshot', col: u.col, row: u.row, dir: u.facing, element: chip.element, toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
    if (t) {
      const tc = t.col;
      const tr = t.row;
      b.hitPanel(src, tc, tr, hit);
      b.emit('fx', { fx: p.fx ?? 'burst', col: tc, row: tr });
      for (const [c, r] of splashCells(p.splash, tc, tr, u.facing)) {
        if (!inside(c, r)) continue;
        b.emit('fx', { fx: p.fx ?? 'burst', col: c, row: r });
        b.hitPanel(src, c, r, hit);
      }
    }
    yield* wait(18);
  },

  *bomb(b, u, chip) {
    const p = chip.def.params;
    u.setAnim('throw');
    yield* wait(10);
    b.emit('sfx', { name: 'throw' });
    const tc = u.col + 3 * u.facing;
    const blast = p.blast === 'plus' ? (c, r) => [[c, r], [c + 1, r], [c - 1, r], [c, r - 1], [c, r + 1]] : (c, r) => [[c, r]];
    for (const dr of p.rows ?? [0]) {
      const tr = u.row + dr;
      if (tr < 0 || tr >= ROWS) continue;
      lob(b, u, H(chip), tc, tr, { type: p.fx === 'rock' ? 'cannonball' : p.fx === 'ice' ? 'iceball' : p.fx === 'flame' ? 'lavaball' : 'bomb', frames: 34, cells: blast, breakPanel: !!p.breakPanel, panel: p.panel, landFx: p.fx === 'ice' ? 'ice' : p.fx === 'flame' ? 'flame' : 'explosion' });
    }
    yield* wait(16);
  },

  *blackbomb(b, u, chip) {
    u.setAnim('throw');
    yield* wait(8);
    const c = u.col + 3 * u.facing;
    const r = u.row;
    if (inside(c, r) && !b.field.isHole(c, r) && !b.entityAt(c, r)) {
      const team = u.team;
      const bomb = b.spawnObject({ type: 'blackbomb', name: 'BlkBomb', col: c, row: r, hp: 1, team: TEAM.NONE });
      bomb.def = {
        onDelete(bb, self) {
          bb.emit('sfx', { name: 'bigexplode' });
          const cells = [];
          for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) cells.push([self.col + dc, self.row + dr]);
          strike(bb, u, cells, H(chip), { team, fx: 'flame' });
        },
      };
      bomb.data.life = 600;
      bomb.def.ai = function* (bb, self) {
        while (--self.data.life > 0) yield;
        self.removed = true;
      };
    }
    yield* wait(14);
  },

  *sword(b, u, chip) {
    const p = chip.def.params;
    let damage = chip.damage;
    if (p.gaugeDamage) damage = Math.max(10, Math.round((p.gaugeDamage * b.gauge) / TIMING.GAUGE_FULL)) + chip.boost;
    if (p.lostHpDamage) damage = Math.max(1, Math.min(999, u.maxHp - u.hp)) + chip.boost;
    u.setAnim('sword');
    yield* wait(5);
    yield* swordSlash(b, u, { ...chip, damage }, p.shape, p.push ? { push: u.facing } : {});
    yield* wait(16);
  },

  *stepsword(b, u, chip) {
    u.setAnim('dash');
    yield* wait(4);
    const back = stepForward(b, u, 2);
    yield* wait(3);
    u.setAnim('sword');
    yield* swordSlash(b, u, chip, chip.def.params.shape);
    yield* wait(14);
    back();
    yield* wait(4);
  },

  *shockwave(b, u, chip) {
    const p = chip.def.params;
    u.setAnim('swing');
    yield* wait(10);
    b.emit('sfx', { name: 'shockwave' });
    shockwave(b, u, H(chip), { speed: p.speed ?? 7, crack: !!p.crack });
    yield* wait(22);
  },

  *punch(b, u, chip) {
    const p = chip.def.params;
    u.setAnim('punch');
    yield* wait(6);
    b.emit('sfx', { name: 'punch' });
    if ((p.range ?? 1) === 1) {
      strike(b, u, [[u.col + u.facing, u.row]], H(chip, { push: p.push ? u.facing : 0 }), { fx: 'punch' });
    } else {
      const s = projectile(b, u, H(chip, { push: p.push ? u.facing : 0 }), { type: 'fist', speed: 3 });
      s.data.range = p.range;
      let n = 0;
      const base = s.script;
      s.script = (function* () {
        while (n++ < p.range * 3) {
          const r = base.next();
          if (r.done) return;
          yield;
        }
      })();
    }
    yield* wait(18);
  },

  *dash(b, u, chip) {
    u.setAnim('dash');
    const src = source(u, H(chip));
    const d = u.facing;
    // Run to the far edge and back; the body stays registered on its home panel.
    const far = d > 0 ? COLS - 1 - u.col : u.col;
    for (let i = 1; i <= far; i++) {
      for (let f = 0; f < 3; f++) {
        u.offsetX = d * (i - 1 + (f + 1) / 3);
        yield;
      }
      b.hitPanel(src, u.col + d * i, u.row);
    }
    b.emit('sfx', { name: 'dash' });
    for (let i = far; i >= 0; i--) {
      u.offsetX = d * i;
      yield;
      yield;
    }
    u.offsetX = 0;
    yield* wait(6);
  },

  *burner(b, u, chip) {
    u.setAnim('burner');
    b.emit('sfx', { name: 'flame' });
    const cells = [];
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (dc || dr) cells.push([u.col + dc, u.row + dr]);
    zone(b, u, H(chip), cells, 36, { type: 'flames' });
    yield* wait(40);
  },

  *ratton(b, u, chip) {
    u.setAnim('throw');
    yield* wait(6);
    ratton(b, u, H(chip), chip.def.params.speed ?? 5, 'ratton');
    yield* wait(12);
  },

  *wave(b, u, chip) {
    const p = chip.def.params;
    u.setAnim('swing');
    yield* wait(10);
    b.emit('sfx', { name: 'wave' });
    const start = b.field.grabColumn(u.team);
    if (start >= 0) {
      const s = shockwave(b, u, H(chip, { pierceInvis: false }), { col: start, speed: 10, type: p.fx ?? 'wave' });
      const base = s.script;
      let n = 0;
      s.script = (function* () {
        for (;;) {
          const r = base.next();
          if (r.done || ++n > (p.panels ?? 3) * 10) return;
          yield;
        }
      })();
    }
    yield* wait(20);
  },

  *hammer(b, u, chip) {
    u.setAnim('hammer');
    yield* wait(12);
    b.emit('sfx', { name: 'hammer' });
    const c = u.col + u.facing;
    strike(b, u, [[c, u.row]], H(chip), { fx: 'quake' });
    b.field.breakPanel(c, u.row, !!b.entityAt(c, u.row));
    yield* wait(18);
  },

  *tornado(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(6);
    b.emit('sfx', { name: 'wind' });
    const hits = chip.def.params.hits ?? 8;
    zone(b, u, H(chip, { flinch: false }), [[u.col + 2 * u.facing, u.row]], hits * 4, { type: 'tornado', rehit: 4 });
    yield* wait(24);
  },

  *zapring(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(6);
    b.emit('sfx', { name: 'zap' });
    projectile(b, u, H(chip, { flinch: false, stun: chip.def.params.stun ?? 90 }), { type: 'zapring', speed: 4 });
    yield* wait(16);
  },

  *yoyo(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(6);
    b.emit('sfx', { name: 'yoyo' });
    yoyo(b, u, H(chip, { flinch: false }), u.row);
    yield* wait(40);
  },

  *lance(b, u, chip) {
    u.setAnim('point');
    yield* wait(10);
    b.emit('sfx', { name: 'lance' });
    const c = u.facing > 0 ? COLS - 1 : 0;
    strike(b, u, [[c, 0], [c, 1], [c, 2]], H(chip), { fx: 'lance' });
    yield* wait(20);
  },

  *boomer(b, u, chip) {
    u.setAnim('throw');
    yield* wait(8);
    b.emit('sfx', { name: 'boomer' });
    const d = u.facing;
    const path = [];
    const edge = d > 0 ? COLS - 1 : 0;
    for (let c = u.col + d; c !== edge + d; c += d) path.push([c, 2]);
    path.push([edge, 1], [edge, 0]);
    for (let c = edge - d; c !== u.col; c -= d) path.push([c, 0]);
    const s = b.addSpell({ type: 'boomer', team: u.team, owner: u, col: path[0][0], row: 2, hit: H(chip) });
    s.script = (function* () {
      for (const [c, r] of path) {
        s.col = c;
        s.row = r;
        for (let f = 0; f < 3; f++) {
          s.x += (c - s.x) * 0.5;
          s.y += (r - s.y) * 0.5;
          b.hitPanel(s, c, r);
          yield;
        }
        s.x = c;
        s.y = r;
      }
    })();
    yield* wait(16);
  },

  *meteors(b, u, chip) {
    u.setAnim('point');
    const area = opponentArea(b, u.team);
    const n = chip.def.params.count ?? 8;
    for (let i = 0; i < n; i++) {
      const foes = b.opponentsOf(u.team);
      // Half the meteors home on a foe, the rest scatter.
      const [c, r] = i % 2 === 0 && foes.length ? [foes[i % foes.length].col, foes[i % foes.length].row] : b.rng.pick(area);
      drop(b, u, H(chip), c, r, { delay: 30, type: 'meteor', crack: true });
      yield* wait(8);
    }
    yield* wait(20);
  },

  *icewave(b, u, chip) {
    u.setAnim('swing');
    yield* wait(10);
    b.emit('sfx', { name: 'wave' });
    const r2 = u.row === ROWS - 1 ? u.row - 1 : u.row + 1;
    for (const row of [u.row, r2]) {
      shockwave(b, u, H(chip), { row, speed: 6, type: 'icewave', onPanel: (s, c, r) => b.field.typeAt(c, r) !== PANEL.BROKEN && b.field.setType(c, r, PANEL.ICE) });
    }
    yield* wait(20);
  },

  *plasma(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(6);
    b.emit('sfx', { name: 'zap' });
    let t = b.firstTarget(u.team, u.col + u.facing, u.row, u.facing);
    if (t && Math.abs(t.col - u.col) <= 3) {
      zone(b, u, H(chip, { flinch: false }), [[t.col, t.row]], 24, { type: 'plasma', rehit: 8 });
    } else {
      zone(b, u, H(chip, { flinch: false }), [[u.col + 2 * u.facing, u.row]], 24, { type: 'plasma', rehit: 8 });
    }
    yield* wait(26);
  },

  *timebomb(b, u, chip) {
    u.setAnim('throw');
    yield* wait(8);
    plantTimeBomb(b, u, H(chip), chip.def.params.fuse ?? 180, 'timebomb');
    yield* wait(12);
  },

  *mine(b, u, chip) {
    u.setAnim('point');
    yield* wait(6);
    const area = opponentArea(b, u.team).filter(([c, r]) => !b.entityAt(c, r) && !b.field.isHole(c, r));
    if (area.length) {
      const [c, r] = b.rng.pick(area);
      const s = b.addSpell({ type: 'mine', team: u.team, owner: u, col: c, row: r, hit: H(chip) });
      s.data.hidden = true;
      s.script = (function* () {
        for (let t = 0; t < 60 * 60; t++) {
          const e = b.entityAt(c, r);
          if (e && e.team !== u.team && e.team !== TEAM.NONE && e.targetable) {
            b.emit('fx', { fx: 'explosion', col: c, row: r });
            b.emit('sfx', { name: 'bigexplode' });
            b.hitPanel(s, c, r);
            b.field.breakPanel(c, r, true);
            return;
          }
          yield;
        }
      })();
    }
    yield* wait(12);
  },

  *geyser(b, u, chip) {
    u.setAnim('point');
    yield* wait(6);
    drop(b, u, H(chip), u.col + 3 * u.facing, u.row, { delay: 24, type: 'geyser', landFx: 'geyser', sfx: 'wave' });
    yield* wait(30);
  },

  *volcano(b, u, chip) {
    u.setAnim('point');
    yield* wait(8);
    const c = u.col + 3 * u.facing;
    for (let r = 0; r < ROWS; r++) drop(b, u, H(chip), c, r, { delay: 20 + r * 6, type: 'eruption', landFx: 'flame', panel: PANEL.LAVA, sfx: 'flame' });
    yield* wait(40);
  },

  *burning(b, u, chip) {
    u.setAnim('point');
    yield* wait(8);
    b.emit('sfx', { name: 'flame' });
    const c = u.col + 2 * u.facing;
    const r = u.row;
    zone(b, u, H(chip), [[c, r], [c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]], 30, { type: 'flames' });
    yield* wait(34);
  },

  // ------------------------------------------------------------ support

  *guard(b, u, chip) {
    const p = chip.def.params;
    u.setAnim('guard');
    u.guardTimer = p.frames ?? 60;
    u.guard = { reflect: chip.damage, bite: !!p.bite };
    b.emit('sfx', { name: 'guardup' });
    yield* wait(p.frames ?? 60);
    u.guardTimer = 0;
    u.guard = null;
  },

  *panelout(b, u, chip) {
    u.setAnim('point');
    yield* wait(6);
    const c = u.col + u.facing;
    const rows = chip.def.params.width === 3 ? [u.row - 1, u.row, u.row + 1] : [u.row];
    for (const r of rows) {
      if (!inside(c, r)) continue;
      const occ = b.entityAt(c, r);
      if (occ && occ.team !== u.team) b.applyHit(occ, H(chip, { flinch: false }), source(u, H(chip)));
      b.field.breakPanel(c, r, !!occ);
      b.emit('fx', { fx: 'quake', col: c, row: r });
    }
    b.emit('sfx', { name: 'panelbreak' });
    yield* wait(14);
  },

  *recover(b, u, chip) {
    u.setAnim('recover');
    b.emit('sfx', { name: 'recover' });
    b.emit('fx', { fx: 'recover', col: u.col, row: u.row });
    b.heal(u, chip.damage);
    yield* wait(20);
  },

  *panelgrab(b, u, chip) {
    u.setAnim('point');
    const d = u.facing;
    let target = -1;
    for (let c = u.col + d; c >= 0 && c < COLS; c += d) {
      if (b.field.ownerAt(c, u.row) !== u.team) {
        target = c;
        break;
      }
    }
    if (target >= 0) {
      b.emit('fx', { fx: 'panelfall', col: target, row: u.row });
      yield* wait(18);
      grabPanel(b, u, chip, target, u.row);
    }
    yield* wait(10);
  },

  *areagrab(b, u, chip) {
    u.setAnim('point');
    const c = b.field.grabColumn(u.team);
    if (c >= 0) {
      for (let r = 0; r < ROWS; r++) b.emit('fx', { fx: 'panelfall', col: c, row: r });
      yield* wait(18);
      for (let r = 0; r < ROWS; r++) grabPanel(b, u, chip, c, r);
      b.emit('sfx', { name: 'areagrab' });
    }
    yield* wait(10);
  },

  *stage(b, u, chip) {
    const p = chip.def.params;
    u.setAnim('point');
    b.emit('sfx', { name: 'stage' });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = b.field.typeAt(c, r);
        const occ = b.entityAt(c, r);
        if (p.ownOnly && b.field.ownerAt(c, r) !== u.team) continue;
        if (p.mode === 'crackall') b.field.crack(c, r, true);
        else if (p.mode === 'breakall') {
          if (!occ) b.field.breakPanel(c, r, false);
        } else if (p.mode === 'poisonall') {
          if (t !== PANEL.BROKEN) b.field.setType(c, r, PANEL.POISON);
        } else if (p.panel && t !== PANEL.BROKEN) b.field.setType(c, r, p.panel);
      }
    }
    b.emit('fx', { fx: 'stage', panel: p.panel ?? p.mode });
    yield* wait(24);
  },

  *rockcube(b, u, chip) {
    u.setAnim('point');
    const c = u.col + u.facing;
    if (inside(c, u.row) && !b.entityAt(c, u.row) && !b.field.isHole(c, u.row)) {
      b.spawnObject({ type: 'rockcube', name: 'RockCube', col: c, row: u.row, hp: chip.damage });
      b.emit('sfx', { name: 'thud' });
    }
    yield* wait(14);
  },

  *wind(b, u, chip) {
    u.setAnim('point');
    b.emit('sfx', { name: 'wind' });
    const dir = u.facing * (chip.def.params.dir ?? 1);
    const foes = b.opponentsOf(u.team).sort((a, z) => (z.col - a.col) * dir);
    for (const f of foes) {
      if (f.immovable) continue;
      while (b.tryStep(f, dir, 0)) {}
    }
    b.emit('fx', { fx: dir === u.facing ? 'wind' : 'fan', dir });
    yield* wait(30);
  },

  *gauge(b, u, chip) {
    b.gaugeRate = chip.def.params.rate;
    b.emit('sfx', { name: 'stage' });
    yield* wait(10);
  },

  *repair(b, u) {
    u.setAnim('point');
    b.emit('sfx', { name: 'recover' });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = b.field.get(c, r);
        if (p.owner === u.team && p.type !== PANEL.NORMAL && !(p.type === PANEL.BROKEN && p.brokenTimer === Infinity)) {
          p.type = PANEL.NORMAL;
          p.brokenTimer = 0;
          p.flash = 10;
        }
      }
    }
    yield* wait(16);
  },

  *invis(b, u, chip) {
    u.invisTimer = chip.def.params.frames ?? 240;
    b.emit('sfx', { name: 'invis' });
    yield* wait(8);
  },

  *airshoes(b, u) {
    u.airShoes = true;
    b.emit('sfx', { name: 'stage' });
    yield* wait(8);
  },

  *barrier(b, u, chip) {
    u.barrierHp = chip.damage;
    b.emit('sfx', { name: 'barrier' });
    b.emit('fx', { fx: 'barrierup', col: u.col, row: u.row });
    yield* wait(10);
  },

  *aura(b, u, chip) {
    u.auraPower = chip.damage;
    b.emit('sfx', { name: 'barrier' });
    yield* wait(10);
  },

  *holypanel(b, u) {
    u.setAnim('point');
    const c = u.col + u.facing;
    const tc = inside(c, u.row) && b.field.ownerAt(c, u.row) === u.team && !b.field.isHole(c, u.row) ? c : u.col;
    b.field.setType(tc, u.row, PANEL.HOLY);
    b.emit('sfx', { name: 'stage' });
    yield* wait(14);
  },

  *fullcust(b) {
    b.gauge = TIMING.GAUGE_FULL;
    b.emit('sfx', { name: 'gaugefull' });
    yield* wait(8);
  },

  *boost() {},

  // ------------------------------------------------------------ navi chips

  *navi_volt(b, u, chip) {
    yield* summon(b, u, 'voltframe', 24, function* () {
      b.emit('fx', { fx: 'flash' });
      b.emit('sfx', { name: 'flash' });
      yield* wait(10);
      for (const f of b.opponentsOf(u.team)) b.applyHit(f, H(chip, { flinch: false, stun: 120, pierceInvis: true }), source(u, H(chip)));
    });
  },

  *navi_feral(b, u, chip) {
    yield* summon(b, u, 'feralis', 16, function* () {
      const c = u.col + 3 * u.facing;
      for (let k = 0; k < 2; k++) {
        b.emit('sfx', { name: 'claw' });
        strike(b, u, [[c, u.row - 1], [c, u.row], [c, u.row + 1]], H(chip), { fx: 'claw' });
        yield* wait(14);
      }
    });
  },

  *navi_tide(b, u, chip) {
    yield* summon(b, u, 'tidecaller', 14, function* () {
      const shots = chip.def.params.shots ?? 8;
      for (let i = 0; i < shots; i++) {
        b.emit('sfx', { name: 'bubble' });
        const t = hitscan(b, u, H(chip, { flinch: i === shots - 1 }));
        b.emit('fx', { fx: 'gunshot', col: u.col, row: u.row, dir: u.facing, element: 'aqua', toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
        if (t) b.emit('fx', { fx: 'bubble', col: t.col, row: t.row });
        yield* wait(5);
      }
    });
  },

  *navi_pyre(b, u, chip) {
    yield* summon(b, u, 'pyreclaw', 20, function* () {
      const c = b.field.grabColumn(u.team);
      if (c >= 0) {
        b.emit('sfx', { name: 'flame' });
        zone(b, u, H(chip), [[c, 0], [c, 1], [c, 2]], 30, { type: 'firetower' });
        yield* wait(10);
        zone(b, u, H(chip), [[c + u.facing, 0], [c + u.facing, 1], [c + u.facing, 2]], 30, { type: 'firetower' });
      }
      yield* wait(20);
    });
  },

  *navi_iron(b, u, chip) {
    yield* summon(b, u, 'ironclad', 20, function* () {
      const t = nearestOpponent(b, u);
      if (t) {
        drop(b, u, H(chip), t.col, t.row, { delay: 26, type: 'fist', breakPanel: true, landFx: 'quake', sfx: 'hammer' });
        yield* wait(34);
      }
    });
  },

  *navi_sabre(b, u, chip) {
    yield* summon(b, u, 'sabre', 16, function* () {
      const t = nearestOpponent(b, u);
      if (t) {
        b.emit('fx', { fx: 'slash', shape: 'wide', col: t.col - u.facing, row: t.row, dir: u.facing });
        b.emit('sfx', { name: 'sword' });
        strike(b, u, [[t.col, t.row - 1], [t.col, t.row], [t.col, t.row + 1]], H(chip));
        yield* wait(10);
      }
    });
  },

  *navi_mender(b, u, chip) {
    yield* summon(b, u, 'mender', 14, function* () {
      const t = nearestOpponent(b, u);
      if (t) {
        b.emit('sfx', { name: 'punch' });
        b.applyHit(t, H(chip), source(u, H(chip)));
        b.emit('fx', { fx: 'burst', col: t.col, row: t.row });
      }
      yield* wait(14);
      b.heal(u, chip.def.params.heal ?? 40);
      b.emit('sfx', { name: 'recover' });
      b.emit('fx', { fx: 'recover', col: u.col, row: u.row });
    });
  },

  *navi_crusher(b, u, chip) {
    yield* summon(b, u, 'crusher', 18, function* () {
      const c = b.field.grabColumn(u.team);
      if (c >= 0) {
        b.emit('sfx', { name: 'hammer' });
        strike(b, u, [[c, 0], [c, 1], [c, 2]], H(chip), { fx: 'quake', crack: true });
      }
      yield* wait(16);
    });
  },

  *navi_zeroday(b, u, chip) {
    yield* summon(b, u, 'zeroday', 20, function* () {
      const area = opponentArea(b, u.team);
      for (let wave = 0; wave < 3; wave++) {
        b.emit('sfx', { name: 'bigexplode' });
        const src = source(u, H(chip));
        for (const [c, r] of area) {
          b.emit('fx', { fx: 'darkburst', col: c, row: r });
          b.hitPanel(src, c, r);
        }
        yield* wait(16);
      }
    });
  },

  // ------------------------------------------------------------ program advances

  *pa_cannonade(b, u, chip) {
    u.setAnim('cannon');
    const shots = chip.def.params.shots ?? 6;
    yield* wait(6);
    for (let i = 0; i < shots; i++) {
      b.emit('sfx', { name: 'cannon' });
      const t = hitscan(b, u, H(chip));
      b.emit('fx', { fx: 'cannonshot', col: u.col, row: u.row, dir: u.facing, toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
      if (t) b.emit('fx', { fx: 'explosion', col: t.col, row: t.row });
      yield* wait(7);
    }
    yield* wait(14);
  },

  *pa_rushpunch(b, u, chip) {
    u.setAnim('punch');
    const n = chip.def.params.punches ?? 5;
    const range = chip.def.params.range ?? 1;
    for (let i = 0; i < n; i++) {
      b.emit('sfx', { name: 'punch' });
      const cells = range === 2 ? [[u.col + u.facing, u.row], [u.col + 2 * u.facing, u.row]] : [[u.col + u.facing, u.row]];
      strike(b, u, cells, H(chip, { push: i === n - 1 ? u.facing : 0, flinch: true }), { fx: 'punch' });
      yield* wait(7);
    }
    yield* wait(12);
  },

  *pa_stepcombo(b, u, chip) {
    u.setAnim('dash');
    yield* wait(4);
    const back = stepForward(b, u, 2);
    for (let i = 0; i < (chip.def.params.cuts ?? 3); i++) {
      u.setAnim('sword');
      yield* swordSlash(b, u, chip, i === 1 ? 'cross' : 'wide');
      yield* wait(10);
    }
    back();
    yield* wait(6);
  },

  *pa_doombomb(b, u, chip) {
    u.setAnim('throw');
    yield* wait(8);
    plantTimeBomb(b, u, H(chip), chip.def.params.fuse ?? 150, 'doombomb');
    yield* wait(12);
  },

  *pa_supernova(b, u, chip) {
    u.setAnim('shoot');
    for (let i = 0; i < (chip.def.params.bursts ?? 3); i++) {
      b.emit('sfx', { name: 'gun' });
      const hit = H(chip);
      const src = source(u, hit);
      const t = b.firstTarget(u.team, u.col + u.facing, u.row, u.facing);
      b.emit('fx', { fx: 'gunshot', col: u.col, row: u.row, dir: u.facing, toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
      if (t) {
        b.hitPanel(src, t.col, t.row, hit);
        for (const [c, r] of splashCells('all', t.col, t.row, u.facing)) {
          if (!inside(c, r)) continue;
          b.emit('fx', { fx: 'burst', col: c, row: r });
          b.hitPanel(src, c, r, hit);
        }
        b.emit('fx', { fx: 'explosion', col: t.col, row: t.row });
      }
      yield* wait(12);
    }
    yield* wait(10);
  },

  *pa_bigspread(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(8);
    const hit = H(chip);
    const src = source(u, hit);
    const t = b.firstTarget(u.team, u.col + u.facing, u.row, u.facing);
    b.emit('sfx', { name: chip.def.params.fx === 'bubble' ? 'bubble' : 'flame' });
    b.emit('fx', { fx: 'gunshot', col: u.col, row: u.row, dir: u.facing, element: chip.element, toCol: t ? t.col : u.facing > 0 ? COLS : -1 });
    if (t) {
      const cells = [[t.col, t.row], ...splashCells('all', t.col, t.row, u.facing)];
      for (const [c, r] of cells) {
        if (!inside(c, r)) continue;
        b.emit('fx', { fx: chip.def.params.fx ?? 'burst', col: c, row: r });
        b.hitPanel(src, c, r, hit);
      }
    }
    yield* wait(24);
  },

  *pa_lifesaber(b, u, chip) {
    u.setAnim('sword');
    yield* wait(8);
    yield* swordSlash(b, u, chip, 'big');
    yield* wait(24);
  },

  *pa_prismsaber(b, u, chip) {
    u.setAnim('sword');
    for (const element of [ELEMENT.FIRE, ELEMENT.AQUA, ELEMENT.ELEC, ELEMENT.WOOD]) {
      yield* wait(5);
      yield* swordSlash(b, u, { ...chip, element }, 'wide');
      yield* wait(5);
    }
    yield* wait(14);
  },

  *pa_megarat(b, u, chip) {
    u.setAnim('throw');
    yield* wait(8);
    ratton(b, u, H(chip), 4, 'megarat');
    yield* wait(14);
  },

  *pa_yoyostorm(b, u, chip) {
    u.setAnim('shoot');
    yield* wait(6);
    b.emit('sfx', { name: 'yoyo' });
    for (let r = 0; r < ROWS; r++) yoyo(b, u, H(chip, { flinch: false }), r);
    yield* wait(42);
  },
};

function grabPanel(b, u, chip, c, r) {
  const occ = b.entityAt(c, r);
  if (occ && occ.team !== u.team) {
    b.applyHit(occ, H(chip, { flinch: true }), source(u, H(chip)));
    b.emit('fx', { fx: 'burst', col: c, row: r });
    return false;
  }
  if (occ) return false;
  return b.field.steal(c, r, u.team);
}

function ratton(b, u, hit, speed, type) {
  const s = b.addSpell({ type, team: u.team, owner: u, col: u.col + u.facing, row: u.row, dir: u.facing, hit });
  s.x = u.col;
  s.script = (function* () {
    let dc = u.facing;
    let dr = 0;
    let turned = false;
    let c = u.col + u.facing;
    let r = u.row;
    while (inside(c, r) && !b.field.isHole(c, r)) {
      s.col = c;
      s.row = r;
      for (let f = 0; f < speed; f++) {
        s.x += (c - s.x) / (speed - f);
        s.y += (r - s.y) / (speed - f);
        if (b.hitPanel(s, c, r)) {
          b.emit('fx', { fx: 'explosion', col: c, row: r });
          b.emit('sfx', { name: 'explode' });
          return;
        }
        yield;
      }
      if (!turned && dr === 0) {
        const foe = b.opponentsOf(u.team).find((e) => e.col === c && e.row !== r && e.targetable);
        if (foe) {
          turned = true;
          dc = 0;
          dr = Math.sign(foe.row - r);
          s.data.turned = dr;
        }
      }
      c += dc;
      r += dr;
    }
  })();
  return s;
}

function yoyo(b, u, hit, row) {
  const d = u.facing;
  const s = b.addSpell({ type: 'yoyo', team: u.team, owner: u, col: u.col + d, row, hit });
  s.x = u.col;
  s.y = row;
  s.script = (function* () {
    const path = [u.col + d, u.col + 2 * d, u.col + 3 * d].filter((c) => c >= 0 && c < COLS);
    for (const c of path) {
      s.col = c;
      for (let f = 0; f < 4; f++) {
        s.x += (c - s.x) / (4 - f);
        b.hitPanel(s, c, row);
        yield;
      }
    }
    for (let k = 0; k < 3; k++) {
      s.hitIds.clear();
      for (let f = 0; f < 8; f++) {
        b.hitPanel(s, s.col, row);
        yield;
      }
    }
    s.hitIds.clear();
    for (const c of path.slice().reverse()) {
      s.col = c;
      for (let f = 0; f < 3; f++) {
        s.x += (c - s.x) / (3 - f);
        b.hitPanel(s, c, row);
        yield;
      }
    }
  })();
  return s;
}

function plantTimeBomb(b, u, hit, fuse, type) {
  const spots = [];
  const d = u.facing;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (b.field.ownerAt(c, r) !== u.team && !b.entityAt(c, r) && !b.field.isHole(c, r)) spots.push([c, r]);
  if (!spots.length) return null;
  // Prefer the panel 3 ahead, else the nearest free enemy panel.
  spots.sort((a, z) => Math.abs(a[0] - (u.col + 3 * d)) + Math.abs(a[1] - u.row) - (Math.abs(z[0] - (u.col + 3 * d)) + Math.abs(z[1] - u.row)));
  const [c, r] = spots[0];
  const bomb = b.spawnObject({ type, name: 'TimeBomb', col: c, row: r, hp: 40, team: u.team });
  bomb.data.fuse = fuse;
  bomb.data.fuseMax = fuse;
  bomb.def = {
    ai: function* (bb, self) {
      while (self.data.fuse > 0) {
        self.data.fuse--;
        if (self.data.fuse % 60 === 0) bb.emit('sfx', { name: 'tick' });
        yield;
      }
      bb.emit('fx', { fx: 'flash' });
      bb.emit('sfx', { name: 'bigexplode' });
      const src = source(u, hit);
      for (const f of bb.opponentsOf(u.team)) {
        bb.emit('fx', { fx: 'explosion', col: f.col, row: f.row });
        bb.applyHit(f, hit, src);
      }
      self.removed = true;
      self.alive = false;
    },
  };
  return bomb;
}

export function* runChip(b, user, chip) {
  const gen = BEHAVIORS[chip.def.behavior];
  if (!gen) throw new Error(`no behavior ${chip.def.behavior}`);
  yield* gen(b, user, chip);
}
