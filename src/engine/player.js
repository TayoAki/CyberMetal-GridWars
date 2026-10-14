import { TIMING, PANEL, ELEMENT, COLS } from './constants.js';
import { runChip } from './chips/behaviors.js';
import { busterShot, hitscan, source, zone, inside } from './combat.js';

// Turns pad input into the player's navi actions, BN-style:
// - a step per direction press, repeating while held; presses during a lock are buffered briefly;
// - B fires the buster at once, holding B charges, releasing at full charge fires the charge shot;
// - A uses the next queued chip; chips and shots lock movement while they play out.

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const BUFFER_FRAMES = 6;

export class PlayerController {
  constructor(b, e, stats) {
    this.b = b;
    this.e = e;
    this.attack = clampLevel(stats.attack);
    this.rapid = clampLevel(stats.rapid);
    this.charge = clampLevel(stats.charge);
    this.chips = [];
    this.action = null;
    this.actionLock = 0; // frames movement is locked after a buster shot
    this.moveTimer = 0;
    this.sinceStep = 99;
    this.buffer = null; // { dir, ttl }
    this.chargeFrames = 0;
    this.busterCooldown = 0;
    this.chipsUsed = 0;
    this.style = stats.style ?? { type: null, element: ELEMENT.NULL };
    this.shieldCooldown = 0;
  }

  get chargeTime() {
    return TIMING.CHARGE_START + TIMING.CHARGE_TIME[this.charge];
  }

  // 0 none, 1 charging, 2 full: a view hint for the aura.
  get chargeState() {
    if (this.chargeFrames >= this.chargeTime) return 2;
    if (this.chargeFrames >= TIMING.CHARGE_START) return 1;
    return 0;
  }

  setChips(chips) {
    this.chips = chips.slice();
  }

  get nextChip() {
    return this.chips[0] ?? null;
  }

  onCustomOpen() {
    // BN discards chips still queued when the Custom Screen reopens.
    this.chips = [];
    this.chargeFrames = 0;
    this.buffer = null;
  }

  canOpenCustom() {
    return !this.action;
  }

  interrupt() {
    this.action = null;
    this.actionLock = 0;
    this.moveTimer = 0;
    this.chargeFrames = 0;
    this.buffer = null;
    this.e.offsetX = 0;
    this.e.offsetY = 0;
    this.e.z = 0;
    this.e.hidden = false;
  }

  update(pad) {
    const e = this.e;
    const b = this.b;
    if (!e.alive) return;
    if (this.busterCooldown > 0) this.busterCooldown--;
    if (this.shieldCooldown > 0) this.shieldCooldown--;
    if (this.actionLock > 0) this.actionLock--;
    if (this.moveTimer > 0) this.moveTimer--;
    this.sinceStep++;

    // Remember direction presses made while busy.
    for (const k of Object.keys(DIRS)) if (pad.pressed[k]) this.buffer = { dir: k, ttl: BUFFER_FRAMES };
    if (this.buffer && --this.buffer.ttl < 0) this.buffer = null;

    if (e.flinchTimer > 0 || e.stunTimer > 0) {
      this.chargeFrames = 0;
      return;
    }

    // A running chip owns the navi until it finishes.
    if (this.action) {
      const r = this.action.next();
      if (r.done) {
        this.action = null;
        e.offsetX = 0;
        e.offsetY = 0;
        e.z = 0;
        if (e.anim !== 'hurt') e.setAnim('idle');
      }
      return;
    }

    // Charge: counts while B is held; release at full charge fires the charge shot.
    if (pad.held.b) {
      const before = this.chargeState;
      this.chargeFrames++;
      if (before < 2 && this.chargeState === 2) b.emit('sfx', { name: 'chargefull' });
      else if (before === 0 && this.chargeState === 1) b.emit('sfx', { name: 'charge' });
    }
    if (pad.released.b) {
      const full = this.chargeFrames >= this.chargeTime;
      this.chargeFrames = 0;
      if (full) {
        this.startAction(chargeShot(b, e, this.attack, this.style.element));
        return;
      }
    }

    if (pad.pressed.a && this.chips.length > 0 && !e.slide) {
      const chip = this.chips.shift();
      this.chipsUsed++;
      this.chargeFrames = 0;
      b.emit('chipuse', { name: chip.name, key: chip.key });
      this.startAction(runChip(b, e, chip));
      return;
    }

    // Shield style: hold Back and press B to raise a reflecting shield.
    const back = e.facing > 0 ? 'left' : 'right';
    if (this.style.type === 'shield' && pad.pressed.b && pad.held[back] && this.shieldCooldown === 0) {
      this.shieldCooldown = 90;
      this.chargeFrames = 0;
      this.startAction(shield(b, e, 10 * this.attack));
      return;
    }

    if (pad.pressed.b && this.busterCooldown === 0) {
      busterShot(b, e, this.style.type === 'guts' ? this.attack * 2 : this.attack);
      this.busterCooldown = TIMING.BUSTER_COOLDOWN[this.rapid];
      this.actionLock = Math.min(8, this.busterCooldown);
      e.setAnim('shoot');
    }

    if (e.slide || this.moveTimer > 0 || this.actionLock > 0) return;
    if (e.anim === 'move' || e.anim === 'shoot') e.setAnim('idle');

    // Movement: a fresh or buffered press steps at once; a held direction repeats.
    let dir = null;
    if (this.buffer) dir = this.buffer.dir;
    else {
      for (const k of Object.keys(DIRS)) {
        if (pad.held[k] && this.sinceStep >= TIMING.MOVE_REPEAT) {
          dir = k;
          break;
        }
      }
    }
    if (dir) {
      this.buffer = null;
      const [dc, dr] = DIRS[dir];
      const fromSand = b.field.typeAt(e.col, e.row) === PANEL.SAND && e.grounded;
      if (b.tryStep(e, dc, dr)) {
        b.stats.moves++;
        this.moveTimer = TIMING.MOVE * (fromSand ? 2 : 1);
        this.sinceStep = 0;
        e.setAnim('move');
        b.emit('sfx', { name: 'step' });
      }
    }
  }

  startAction(gen) {
    this.action = gen;
    // Run the first frame now so a press reacts on the frame it lands.
    const r = this.action.next();
    if (r.done) {
      this.action = null;
      if (this.e.anim !== 'hurt') this.e.setAnim('idle');
    }
  }
}

function clampLevel(n) {
  return Math.max(1, Math.min(5, n | 0 || 1));
}

// The charge shot follows the Style element, as in BN3: Heat breathes fire 3 panels ahead, Aqua fires
// a bursting bubble, Elec a paralysing zap, Wood a tornado 2 panels ahead. Null is the plain blast.
function* chargeShot(b, e, attack, element = ELEMENT.NULL) {
  e.setAnim('charged');
  b.emit('sfx', { name: 'chargeshot' });
  const damage = 10 * attack;
  const d = e.facing;
  const hit = { damage, element, flinch: true, isCharge: true };
  switch (element) {
    case ELEMENT.FIRE: {
      b.emit('sfx', { name: 'flame' });
      zone(b, e, hit, [[e.col + d, e.row], [e.col + 2 * d, e.row], [e.col + 3 * d, e.row]], 22, { type: 'flames' });
      break;
    }
    case ELEMENT.AQUA: {
      b.emit('sfx', { name: 'bubble' });
      const t = b.firstTarget(e.team, e.col + d, e.row, d);
      b.emit('fx', { fx: 'gunshot', col: e.col, row: e.row, dir: d, element, toCol: t ? t.col : d > 0 ? COLS : -1 });
      if (t) {
        const src = source(e, hit);
        for (const [c, r] of [[t.col, t.row], [t.col + d, t.row]]) {
          if (!inside(c, r)) continue;
          b.emit('fx', { fx: 'bubble', col: c, row: r });
          b.hitPanel(src, c, r, hit);
        }
      }
      break;
    }
    case ELEMENT.ELEC: {
      b.emit('sfx', { name: 'zap' });
      const t = hitscan(b, e, { ...hit, flinch: false, stun: 60 });
      b.emit('fx', { fx: 'chargeshot', col: e.col, row: e.row, dir: d, element, toCol: t ? t.col : d > 0 ? COLS : -1, hit: !!t });
      break;
    }
    case ELEMENT.WOOD: {
      b.emit('sfx', { name: 'wind' });
      zone(b, e, { ...hit, damage: Math.ceil(damage / 2), flinch: false }, [[e.col + 2 * d, e.row]], 24, { type: 'tornado', rehit: 8 });
      break;
    }
    default:
      busterShot(b, e, attack, true);
  }
  for (let i = 0; i < 16; i++) yield;
}

function* shield(b, e, reflect) {
  e.setAnim('guard');
  e.guardTimer = 36;
  e.guard = { reflect };
  b.emit('sfx', { name: 'guardup' });
  for (let i = 0; i < 36; i++) yield;
  e.guardTimer = 0;
  e.guard = null;
}
