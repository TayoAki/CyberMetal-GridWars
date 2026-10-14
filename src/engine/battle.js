import { COLS, ROWS, TEAM, ELEMENT, PANEL, TIMING, LIMITS, PLAYER_BASE_HP } from './constants.js';
import { Rng } from './rng.js';
import { Field } from './field.js';
import { Entity } from './entity.js';
import { Spell } from './spell.js';
import { beats } from './elements.js';
import { PlayerController } from './player.js';
import { CustomScreen } from './custom.js';
import { ENEMIES, makeEnemyStats } from './enemies/index.js';
import { computeBusting } from './busting.js';

// One battle: a deterministic 60 Hz simulation. Drive it with step(pad) where pad is the set of buttons
// held this frame ({ up, down, left, right, a, b, l, r, start, select }). The view reads state and drains
// events(); nothing here touches the DOM.
//
// Phases: intro -> custom -> banner -> fight <-> custom ... -> win -> results | lose -> over.

const EMPTY_PAD = Object.freeze({});
const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r', 'start', 'select'];

export class Battle {
  constructor(config) {
    this.config = config;
    this.rng = new Rng(config.seed ?? 1);
    this.nextId = 1;
    this.frame = 0; // every step
    this.fightFrames = 0; // only frames spent fighting (busting time)
    this.field = new Field(config.encounter?.field ?? null);
    this.entities = [];
    this.spells = [];
    this.events = [];
    this.tokens = new Map(); // shared turn tokens (e.g. one Rivet attacks at a time)
    this.phase = 'intro';
    this.phaseTimer = 0;
    this.banner = null; // { text, timer, kind }
    this.turn = 0;
    this.gauge = 0;
    this.gaugeRate = 1;
    this.paused = false;
    this.encounter = config.encounter ?? { enemies: [] };
    this.isBossBattle = (this.encounter.enemies ?? []).some((en) => ENEMIES[en.type]?.kind === 'navi');
    this.stats = { hitsTaken: 0, moves: 0, counters: 0, deletions: [], damageTaken: 0 };
    this.result = null;
    this.prevPad = {};
    this.pad = { held: {}, pressed: {}, released: {} };

    // Player
    const p = config.player ?? {};
    const maxHp = p.maxHp ?? PLAYER_BASE_HP;
    // BN3 Style Change: an element (changes weakness and the charge shot) and a type (Guts, Custom,
    // Shield, Team).
    this.style = { type: p.style?.type ?? null, element: p.style?.element ?? ELEMENT.NULL };
    this.player = new Entity(this, {
      kind: 'player',
      type: 'player',
      name: p.name ?? 'AXIOM',
      team: TEAM.RED,
      col: 1,
      row: 1,
      hp: Math.min(p.hp ?? maxHp, maxHp),
      maxHp,
      element: this.style.element,
      superArmor: !!p.programs?.superArmor || this.style.type === 'guts',
      floatShoes: !!p.programs?.floatShoes,
      airShoes: !!p.programs?.airShoes,
      underShirt: !!p.programs?.underShirt,
    });
    this.entities.push(this.player);
    this.player.data.style = this.style;
    this.controller = new PlayerController(this, this.player, {
      attack: p.attack ?? 1,
      rapid: p.rapid ?? 1,
      charge: p.charge ?? 1,
      style: this.style,
    });

    // Enemies
    for (const en of this.encounter.enemies ?? []) this.spawnEnemy(en.type, en.level ?? 1, en.col, en.row, en);

    // Custom Screen
    const handBonus = (p.programs?.custom1 ? 1 : 0) + (p.programs?.custom2 ? 2 : 0) + (this.style.type === 'custom' ? 1 : 0);
    this.custom = new CustomScreen(this, p.folder ?? [], Math.min(LIMITS.HAND_MAX, LIMITS.HAND_BASE + handBonus), { shuffle: config.shuffle !== false });
  }

  // ---------------------------------------------------------------- bodies

  spawnEnemy(type, level, col, row, extra = {}) {
    const fam = ENEMIES[type];
    if (!fam) throw new Error(`unknown enemy type ${type}`);
    const stats = makeEnemyStats(fam, level);
    const e = new Entity(this, {
      kind: fam.kind ?? 'virus',
      type,
      name: stats.name,
      team: extra.team ?? TEAM.BLUE,
      col,
      row,
      hp: stats.hp,
      element: stats.element,
      level,
      flying: fam.flying ?? false,
      superArmor: fam.superArmor ?? false,
      data: { stats },
    });
    e.def = fam;
    e.stats = stats;
    this.entities.push(e);
    fam.onSpawn?.(this, e);
    return e;
  }

  spawnObject(o) {
    const e = new Entity(this, { kind: 'object', team: o.team ?? TEAM.NONE, immovable: true, ...o });
    e.def = o.def ?? null;
    this.entities.push(e);
    o.def?.onSpawn?.(this, e);
    return e;
  }

  addSpell(o) {
    const s = new Spell(this, o);
    this.spells.push(s);
    return s;
  }

  entityAt(c, r) {
    for (const e of this.entities) if (e.alive && !e.removed && e.col === c && e.row === r) return e;
    return null;
  }

  livingEnemies(team = TEAM.BLUE) {
    return this.entities.filter((e) => e.alive && !e.removed && e.team === team && e.kind !== 'object');
  }

  opponentsOf(team) {
    return this.entities.filter((e) => e.alive && !e.removed && e.team !== team && e.team !== TEAM.NONE && e.kind !== 'object');
  }

  enemyTeam(team) {
    return team === TEAM.RED ? TEAM.BLUE : TEAM.RED;
  }

  // Can `e` step onto (c, r)? Viruses and navis stay in their own area; holes need AirShoes or flight.
  canEnter(e, c, r, opts = {}) {
    if (!this.field.inBounds(c, r)) return false;
    const p = this.field.get(c, r);
    if (!opts.ignoreArea && e.team !== TEAM.NONE && p.owner !== e.team) return false;
    if (p.type === PANEL.BROKEN && !(e.airShoes || e.flying || opts.ignoreHoles)) return false;
    const occ = this.entityAt(c, r);
    if (occ && occ !== e) return false;
    return true;
  }

  // Place `e` on (c, r) at once (no area check). Handles cracked-panel breaking, lava and ice.
  moveEntity(e, c, r, opts = {}) {
    const oc = e.col;
    const or = e.row;
    if (oc === c && or === r) return;
    e.col = c;
    e.row = r;
    if (e.grounded && e.kind !== 'object' && !opts.noBreak) this.field.onLeave(oc, or);
    if (!opts.noPanelEffects) this.onEnterPanel(e, c - oc, r - or);
  }

  tryStep(e, dc, dr, opts = {}) {
    const c = e.col + dc;
    const r = e.row + dr;
    if (!this.canEnter(e, c, r, opts)) return false;
    this.moveEntity(e, c, r, opts);
    e.lastMoveDir = dc !== 0 ? Math.sign(dc) : e.lastMoveDir;
    return true;
  }

  onEnterPanel(e, dc, dr) {
    if (!e.grounded || e.kind === 'object') return;
    const type = this.field.typeAt(e.col, e.row);
    if (type === PANEL.LAVA && e.element !== ELEMENT.FIRE) {
      this.field.setType(e.col, e.row, PANEL.NORMAL);
      this.emit('fx', { fx: 'flame', col: e.col, row: e.row });
      this.applyHit(e, { damage: 50, element: ELEMENT.FIRE, flinch: true, source: 'lava' }, null);
    } else if (type === PANEL.ICE && e.element !== ELEMENT.AQUA && (dc !== 0 || dr !== 0)) {
      e.slide = { dc: Math.sign(dc), dr: Math.sign(dr), timer: 3 };
    }
  }

  // ---------------------------------------------------------------- targeting

  // First body of another team (or a neutral object) in row `r`, scanning from column c0 in `dir`.
  firstTarget(team, c0, r, dir, opts = {}) {
    for (let c = c0; c >= 0 && c < COLS; c += dir) {
      const e = this.entityAt(c, r);
      if (!e || !e.targetable || e.team === team) continue;
      if (!opts.pierceInvis && e.invisTimer > 0) continue;
      if (e.iframes > 0 && !opts.ignoreIframes) continue;
      if (!e.blocks && !opts.hitNonBlocking) continue;
      return e;
    }
    return null;
  }

  // ---------------------------------------------------------------- damage

  // Hit whatever stands on (c, r) with spell/attack `src` (once per body per src). Returns the body or null.
  hitPanel(src, c, r, hit = src.hit) {
    const e = this.entityAt(c, r);
    if (!e || !e.targetable) return null;
    if (e.team === src.team) return null;
    if (src.hitIds.has(e.id)) return null;
    const res = this.applyHit(e, hit, src);
    if (!res.connected) return null;
    src.hitIds.add(e.id);
    return e;
  }

  // hit: { damage, element, flinch, stun, push, pierceInvis, breaksGuard, ignoreIframes, ignoreHoly,
  //        isChip, isCharge, noCounter, source }
  applyHit(target, hit, src) {
    const res = { connected: false, dealt: 0, blocked: false, reflected: false };
    if (!target.targetable) return res;
    if (target.iframes > 0 && !hit.ignoreIframes) return res;
    if (target.invisTimer > 0 && !hit.pierceInvis) return res;
    res.connected = true;
    const attacker = src?.owner ?? null;

    if (target.guardTimer > 0 && target.guard && !hit.breaksGuard) {
      res.blocked = true;
      res.reflected = true;
      this.emit('fx', { fx: 'guard', col: target.col, row: target.row });
      this.emit('sfx', { name: 'guard' });
      if (target.guard.reflect > 0) this.reflectShot(target, target.guard.reflect);
      return res;
    }

    if (target.auraPower > 0) {
      res.blocked = true;
      if ((hit.damage ?? 0) >= target.auraPower) {
        target.auraPower = 0;
        this.emit('fx', { fx: 'aurabreak', col: target.col, row: target.row });
        this.emit('sfx', { name: 'barrierbreak' });
      } else {
        this.emit('fx', { fx: 'aurablock', col: target.col, row: target.row });
        this.emit('sfx', { name: 'guard' });
      }
      return res;
    }

    let dmg = Math.max(0, Math.floor(hit.damage ?? 0));
    const panel = this.field.get(target.col, target.row);
    const element = hit.element ?? ELEMENT.NULL;
    let doubled = beats(element, target.element);
    if (target.grounded && panel) {
      if (panel.type === PANEL.GRASS && element === ELEMENT.FIRE) {
        doubled = true;
        this.field.setType(target.col, target.row, PANEL.NORMAL);
      } else if (panel.type === PANEL.ICE && element === ELEMENT.ELEC) {
        doubled = true;
      }
    }
    if (doubled) dmg *= 2;
    if (panel && panel.type === PANEL.HOLY && target.grounded && !hit.ignoreHoly) dmg = Math.floor(dmg / 2);

    if (target.barrierHp > 0 && dmg > 0) {
      const absorbed = Math.min(target.barrierHp, dmg);
      target.barrierHp -= absorbed;
      dmg -= absorbed;
      this.emit('fx', { fx: target.barrierHp > 0 ? 'barrierhit' : 'barrierbreak', col: target.col, row: target.row });
      this.emit('sfx', { name: target.barrierHp > 0 ? 'guard' : 'barrierbreak' });
      if (dmg === 0) {
        res.blocked = true;
        return res;
      }
    }

    const before = target.hp;
    target.hp = Math.max(0, target.hp - dmg);
    if (target.underShirt && before > 1 && target.hp === 0) target.hp = 1;
    res.dealt = before - target.hp;
    if (res.dealt > 0) {
      this.emit('hurt', { id: target.id, amount: res.dealt, col: target.col, row: target.row, doubled, element, by: attacker?.type ?? hit.source ?? null });
      if (target === this.player) this.stats.damageTaken += res.dealt;
    }

    // Counter hit: a chip or charge shot landing while the enemy winds up an attack.
    let countered = false;
    if (target.counterWindow > 0 && (hit.isChip || hit.isCharge) && !hit.noCounter && target.team === TEAM.BLUE && target.hp > 0) {
      countered = true;
      target.counterWindow = 0;
      this.stats.counters++;
      this.emit('counter', { id: target.id, col: target.col, row: target.row });
      this.emit('sfx', { name: 'counter' });
    }

    if (target === this.player && (res.dealt > 0 || hit.flinch)) this.stats.hitsTaken++;

    if (target.hp <= 0) {
      this.kill(target, attacker);
      return res;
    }

    if (hit.stun && target.kind !== 'object') {
      target.stunTimer = Math.max(target.stunTimer, hit.stun);
      this.emit('fx', { fx: 'stun', col: target.col, row: target.row });
    } else if (countered) {
      target.stunTimer = Math.max(target.stunTimer, TIMING.COUNTER_STUN);
    }
    if (hit.flinch && !target.superArmor && target.kind !== 'object') this.flinch(target);
    if (hit.push && !target.immovable && target.alive) {
      const dir = Math.sign(hit.push);
      for (let i = 0; i < Math.abs(hit.push); i++) if (!this.tryStep(target, dir, 0)) break;
    }
    if (target.kind !== 'object') this.emit('sfx', { name: target === this.player ? 'hurt' : 'hit' });
    target.def?.onHit?.(this, target, hit, res);
    return res;
  }

  flinch(target) {
    if (target === this.player) {
      target.flinchTimer = TIMING.FLINCH;
      target.iframes = TIMING.PLAYER_IFRAMES;
      this.controller.interrupt();
    } else {
      target.flinchTimer = TIMING.ENEMY_FLINCH;
      target.script = null; // AI restarts after the stagger
      target.counterWindow = 0;
      target.offsetX = 0;
      target.offsetY = 0;
      target.z = 0;
      target.hidden = false;
      target.def?.onFlinch?.(this, target);
    }
    target.setAnim('hurt');
  }

  // Guard / CrsShld reflection: a shockwave-style shot back along the row.
  reflectShot(from, damage) {
    const dir = from.facing;
    const s = this.addSpell({ type: 'reflect', team: from.team, owner: from, col: from.col + dir, row: from.row, dir, hit: { damage, flinch: true, isChip: true } });
    s.script = (function* (b, sp) {
      for (let c = from.col + dir; c >= 0 && c < COLS; c += dir) {
        sp.col = c;
        sp.x = c;
        if (b.hitPanel(sp, c, sp.row)) break;
        for (let i = 0; i < 4; i++) yield;
      }
      sp.kill();
    })(this, s);
  }

  heal(e, amount) {
    if (!e.alive) return 0;
    const before = e.hp;
    e.hp = Math.min(e.maxHp, e.hp + amount);
    if (e.hp > before) this.emit('heal', { id: e.id, amount: e.hp - before, col: e.col, row: e.row });
    return e.hp - before;
  }

  kill(e) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    e.script = null;
    e.deleteTimer = TIMING.DELETE;
    e.setAnim('delete');
    this.emit('delete', { id: e.id, col: e.col, row: e.row, kind: e.kind, type: e.type });
    this.emit('sfx', { name: e.kind === 'object' ? 'objbreak' : 'delete' });
    if (e.team === TEAM.BLUE && e.kind !== 'object') this.stats.deletions.push(this.fightFrames);
    for (const [k, holder] of this.tokens) if (holder === e) this.tokens.delete(k);
    e.def?.onDelete?.(this, e);
    if (e === this.player) {
      this.phase = 'lose';
      this.phaseTimer = 0;
      this.controller.interrupt();
      this.emit('sfx', { name: 'playerdelete' });
    }
  }

  // ---------------------------------------------------------------- shared helpers for AIs

  claimToken(key, e) {
    const holder = this.tokens.get(key);
    if (holder && holder !== e && holder.alive && !holder.removed) return false;
    this.tokens.set(key, e);
    return true;
  }

  releaseToken(key, e) {
    if (this.tokens.get(key) === e) this.tokens.delete(key);
  }

  emit(type, data = {}) {
    this.events.push({ type, frame: this.frame, ...data });
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  setBanner(text, timer, kind = 'info') {
    this.banner = { text, timer, kind, t: 0 };
  }

  // ---------------------------------------------------------------- custom screen flow

  get gaugeFull() {
    return this.gauge >= TIMING.GAUGE_FULL;
  }

  openCustom() {
    this.phase = 'custom';
    this.turn++;
    this.controller.onCustomOpen();
    this.custom.openTurn();
    this.emit('sfx', { name: 'customopen' });
    this.emit('custom', { open: true });
  }

  // Called by CustomScreen when OK is confirmed. chips: resolved queue (PA-merged, boosts applied).
  onCustomConfirm(chips, pa) {
    this.controller.setChips(chips);
    this.gauge = 0;
    this.emit('custom', { open: false });
    if (this.turn === 1) {
      this.phase = 'banner';
      this.setBanner('BATTLE START!', TIMING.BANNER, 'start');
      this.emit('sfx', { name: 'battlestart' });
    } else if (pa) {
      this.phase = 'banner';
      this.setBanner(pa.name, TIMING.PA_BANNER, 'pa');
      this.emit('sfx', { name: 'pa' });
    } else {
      this.phase = 'fight';
    }
    if (pa && this.turn === 1) this.pendingPaBanner = pa;
  }

  // ---------------------------------------------------------------- main loop

  readPad(held) {
    const pressed = {};
    const released = {};
    for (const k of BUTTONS) {
      const now = !!held[k];
      const was = !!this.prevPad[k];
      pressed[k] = now && !was;
      released[k] = !now && was;
    }
    this.prevPad = { ...held };
    this.pad = { held, pressed, released };
    return this.pad;
  }

  step(held = EMPTY_PAD) {
    const pad = this.readPad(held);
    this.frame++;
    this.phaseTimer++;
    if (this.banner) {
      this.banner.t++;
      if (this.banner.t >= this.banner.timer) this.banner = null;
    }

    switch (this.phase) {
      case 'intro':
        if (this.phaseTimer >= TIMING.INTRO) this.openCustom();
        break;
      case 'custom':
        this.custom.handleInput(pad);
        break;
      case 'banner':
        if (!this.banner) {
          if (this.pendingPaBanner) {
            this.setBanner(this.pendingPaBanner.name, TIMING.PA_BANNER, 'pa');
            this.emit('sfx', { name: 'pa' });
            this.pendingPaBanner = null;
          } else this.phase = 'fight';
        }
        break;
      case 'fight':
        if (pad.pressed.start) {
          this.paused = !this.paused;
          this.emit('sfx', { name: 'pause' });
        }
        if (this.paused) break;
        this.fightStep(pad);
        break;
      case 'win':
        this.tickWorld(false);
        if (this.phaseTimer >= TIMING.WIN_BANNER) {
          this.phase = 'results';
          this.result = { won: true, ...computeBusting(this) };
        }
        break;
      case 'lose':
        this.tickWorld(false);
        if (this.phaseTimer >= TIMING.LOSE_TIME) {
          this.phase = 'over';
          this.result = { won: false };
        }
        break;
      default:
        break;
    }
  }

  fightStep(pad) {
    this.fightFrames++;
    if (this.gauge < TIMING.GAUGE_FULL) {
      this.gauge = Math.min(TIMING.GAUGE_FULL, this.gauge + this.gaugeRate);
      if (this.gauge >= TIMING.GAUGE_FULL) this.emit('sfx', { name: 'gaugefull' });
    }
    if (this.gaugeFull && (pad.pressed.l || pad.pressed.r) && this.controller.canOpenCustom()) {
      this.openCustom();
      return;
    }
    this.controller.update(pad);
    this.tickWorld(true);
    if (this.phase === 'fight' && this.livingEnemies(TEAM.BLUE).length === 0 && this.entities.some((e) => e.team === TEAM.BLUE && e.kind !== 'object')) {
      this.phase = 'win';
      this.phaseTimer = 0;
      this.setBanner('ENEMY DELETED!', TIMING.WIN_BANNER, 'win');
      this.emit('sfx', { name: 'win' });
    }
  }

  // Advance bodies, spells and the field one frame. `live` is false during win/lose wind-down, when only
  // animations and deletions progress.
  tickWorld(live) {
    for (const e of this.entities) {
      if (e.removed) continue;
      e.animT++;
      if (!e.alive) {
        if (--e.deleteTimer <= 0) e.removed = true;
        continue;
      }
      if (!live) continue;
      this.updateBody(e);
    }
    if (live) {
      for (const s of this.spells) {
        if (!s.alive) continue;
        s.t++;
        if (s.script) {
          const r = s.script.next();
          if (r.done) s.alive = false;
        } else s.alive = false;
      }
      this.spells = this.spells.filter((s) => s.alive);
      this.field.update((c, r) => this.entityAt(c, r)?.team ?? null);
    }
    this.entities = this.entities.filter((e) => !e.removed || e === this.player);
  }

  updateBody(e) {
    if (e.iframes > 0) e.iframes--;
    if (e.invisTimer > 0) e.invisTimer--;
    if (e.guardTimer > 0 && --e.guardTimer === 0) e.guard = null;
    if (e.counterWindow > 0) e.counterWindow--;

    // Floor effects on grounded bodies.
    if (e.grounded && e.kind !== 'object') {
      const t = this.field.typeAt(e.col, e.row);
      if (t === PANEL.POISON && this.fightFrames % TIMING.POISON_TICK === 0) {
        e.hp = Math.max(0, e.hp - 1);
        if (e.hp === 0) this.kill(e);
      } else if (t === PANEL.GRASS && e.element === ELEMENT.WOOD && this.fightFrames % TIMING.GRASS_HEAL_TICK === 0) {
        if (e.hp < e.maxHp) e.hp++;
      }
      if (!e.alive) return;
    }

    // Ice slides carry a body until it hits something.
    if (e.slide) {
      if (--e.slide.timer <= 0) {
        const { dc, dr } = e.slide;
        e.slide = null;
        if (this.canEnter(e, e.col + dc, e.row + dr)) {
          this.moveEntity(e, e.col + dc, e.row + dr);
          if (e === this.player) this.stats.moves++;
        }
      }
    }

    if (e.flinchTimer > 0) {
      e.flinchTimer--;
      if (e.flinchTimer === 0 && e.anim === 'hurt') e.setAnim('idle');
      return;
    }
    if (e.stunTimer > 0) {
      e.stunTimer--;
      return;
    }
    if (e === this.player) return; // the controller drives the player

    if (!e.script && e.def?.ai) e.script = e.def.ai(this, e);
    if (e.script) {
      const r = e.script.next();
      if (r.done) e.script = null;
    }
  }

  get done() {
    return this.phase === 'results' || this.phase === 'over';
  }
}

export { ROWS, COLS };
