// Maps keyboard, gamepads and on-screen touch buttons onto the GBA-style pad the game reads:
// { up, down, left, right, a, b, l, r, start, select } — "held" booleans sampled once per frame.

export const BUTTONS = ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r', 'start', 'select'];

export const DEFAULT_KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyX: 'a',
  KeyK: 'a',
  KeyZ: 'b',
  KeyJ: 'b',
  KeyQ: 'l',
  KeyE: 'r',
  ShiftLeft: 'l',
  ShiftRight: 'r',
  Enter: 'start',
  Escape: 'start',
  Backspace: 'select',
  Tab: 'select',
};

export const KEY_HELP = [
  ['Move', 'Arrows / WASD'],
  ['Buster (hold to charge)', 'Z or J'],
  ['Use chip / confirm', 'X or K'],
  ['Custom Screen', 'Q / E (or Shift)'],
  ['Pause', 'Enter'],
];

export class Input {
  constructor(target = window) {
    // Keyboard and touch are tracked as a queue of transitions per button. Each sample replays at most
    // one transition per button, so a press and release that both land between two frames (slow or
    // stalled frames) are still seen as a press followed by a release — no tap is ever lost or merged.
    this.count = {}; // physical keys/touches currently holding each button
    this.queue = {}; // pending held-state transitions per button
    this.state = {}; // replayed held state per button
    this.listeners = [];
    this.lastDevice = 'keyboard';
    this.onFirstInput = null;
    this.down = new Set(); // codes currently down, to ignore auto-repeat and stray keyups
    const keydown = (e) => {
      const btn = DEFAULT_KEYS[e.code];
      if (btn) {
        e.preventDefault();
        this.lastDevice = 'keyboard';
        if (!this.down.has(e.code)) {
          this.down.add(e.code);
          this.change(btn, +1);
        }
      }
      this.fireFirst();
    };
    const keyup = (e) => {
      const btn = DEFAULT_KEYS[e.code];
      if (btn) {
        e.preventDefault();
        if (this.down.delete(e.code)) this.change(btn, -1);
      }
    };
    const blur = () => this.releaseAll();
    target.addEventListener('keydown', keydown);
    target.addEventListener('keyup', keyup);
    target.addEventListener('blur', blur);
    this.listeners.push(() => {
      target.removeEventListener('keydown', keydown);
      target.removeEventListener('keyup', keyup);
      target.removeEventListener('blur', blur);
    });
  }

  change(btn, delta) {
    const before = (this.count[btn] ?? 0) > 0;
    this.count[btn] = Math.max(0, (this.count[btn] ?? 0) + delta);
    const after = this.count[btn] > 0;
    if (before !== after) (this.queue[btn] ??= []).push(after);
  }

  releaseAll() {
    for (const b of BUTTONS) {
      if ((this.count[b] ?? 0) > 0) (this.queue[b] ??= []).push(false);
      this.count[b] = 0;
    }
    this.down.clear();
  }

  get keys() {
    return new Set([...this.down]);
  }

  fireFirst() {
    if (this.onFirstInput) {
      const f = this.onFirstInput;
      this.onFirstInput = null;
      f();
    }
  }

  // On-screen buttons call these.
  touchDown(btn) {
    this.change(btn, +1);
    this.lastDevice = 'touch';
    this.fireFirst();
  }

  touchUp(btn) {
    this.change(btn, -1);
  }

  sample() {
    const held = {};
    for (const b of BUTTONS) {
      const q = this.queue[b];
      if (q && q.length) this.state[b] = q.shift();
      held[b] = !!this.state[b];
    }
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const p = (i) => !!gp.buttons[i]?.pressed;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      const any = p(0) || p(1) || p(2) || p(3) || p(4) || p(5) || p(6) || p(7) || p(8) || p(9) || p(12) || p(13) || p(14) || p(15) || Math.abs(ax) > 0.5 || Math.abs(ay) > 0.5;
      if (any) {
        this.lastDevice = 'gamepad';
        this.fireFirst();
      }
      held.a ||= p(0) || p(3);
      held.b ||= p(1) || p(2);
      held.l ||= p(4) || p(6);
      held.r ||= p(5) || p(7);
      held.select ||= p(8);
      held.start ||= p(9);
      held.up ||= p(12) || ay < -0.5;
      held.down ||= p(13) || ay > 0.5;
      held.left ||= p(14) || ax < -0.5;
      held.right ||= p(15) || ax > 0.5;
    }
    return held;
  }

  destroy() {
    for (const f of this.listeners) f();
  }
}

// Edge detection for scenes that read menus (the battle engine does its own).
export class PadEdges {
  constructor() {
    this.prev = {};
    this.repeat = {};
  }

  // Returns { held, pressed, released, repeat } where `repeat` also fires every few frames while held
  // (for menu scrolling).
  update(held) {
    const pressed = {};
    const released = {};
    const rep = {};
    for (const k of BUTTONS) {
      pressed[k] = !!held[k] && !this.prev[k];
      released[k] = !held[k] && !!this.prev[k];
      if (held[k]) this.repeat[k] = (this.repeat[k] ?? 0) + 1;
      else this.repeat[k] = 0;
      const n = this.repeat[k];
      rep[k] = pressed[k] || (n > 18 && n % 5 === 0);
    }
    this.prev = { ...held };
    return { held, pressed, released, repeat: rep };
  }
}
