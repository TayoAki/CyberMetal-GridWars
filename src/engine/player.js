import { TIMING, PANEL } from './constants.js';
import { runChip } from './chips/behaviors.js';
import { busterShot } from './combat.js';

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
        this.startAction(chargeShot(b, e, this.attack));
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

    if (pad.pressed.b && this.busterCooldown === 0) {
      busterShot(b, e, this.attack);
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

function* chargeShot(b, e, attack) {
  e.setAnim('charged');
  b.emit('sfx', { name: 'chargeshot' });
  busterShot(b, e, attack, true);
  for (let i = 0; i < 16; i++) yield;
}
