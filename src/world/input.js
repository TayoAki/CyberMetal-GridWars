// Controls for the open world: keyboard + mouse (pointer lock when the page allows it, otherwise drag with the
// right button to look), gamepad, and touch (a move stick, drag-to-look and buttons).
// sample() returns held states for one simulation step; consumeLook() returns the look delta since last call.
//
// Kingdom Hearts 2-style layout: attack, shoot (hold to charge), jump, dodge, lock-on, switch target, the
// reaction command, and chip shortcuts (number keys; on a gamepad hold LB and press a face button, like KH2's
// shortcut menu).

const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
// Mouse buttons count as keys named Mouse0 (left), Mouse1 (middle), Mouse2 (right).
const ATTACK_KEYS = ['KeyJ', 'Enter', 'Mouse0'];
const SHOOT_KEYS = ['KeyK', 'Mouse2'];
const JUMP_KEYS = ['Space'];
const DASH_KEYS = ['ShiftLeft', 'ShiftRight'];
const LOCK_KEYS = ['KeyR', 'KeyL', 'Mouse1'];
const REACT_KEYS = ['KeyF'];
const CHIP_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
const TURN_LEFT = ['KeyQ']; // switch target left while locked on
const TURN_RIGHT = ['KeyE'];
// Standard gamepad buttons.
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, left: 14, right: 15 };
// LB + face button -> chip slot (X, Y, B, A like KH2's square, triangle, circle, cross).
const PAD_CHIPS = [PAD.x, PAD.y, PAD.b, PAD.a];

export class WorldInput {
  // win: the window to listen on (a stand-in in tests).
  constructor(canvas, touchRoot = null, win = globalThis) {
    this.canvas = canvas;
    this.keys = new Set(); // held keys and mouse buttons
    this.tapped = new Set(); // pressed since the last sample: a tap that ends between two steps still counts
    this.dragLook = false;
    this.isLocked = () => false; // set by the game: is the player locked on? (Q/E and the wheel switch targets)
    this.pulse = { next: 0, prev: 0 }; // queued one-step presses from the wheel and stick flicks
    this.pulsed = { next: false, prev: false }; // pressed by a pulse last step (so the next one releases first)
    this.flick = 0;
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.locked = false;
    this.lockFailed = false;
    this.touch = { move: null, look: null, held: new Set(), chip: 0, stick: { x: 0, y: 0 } };
    this.usedTouch = false;
    this.usedPad = false;

    const GAME_KEYS = new Set([...Object.values(MOVE_KEYS).flat(), ...ATTACK_KEYS, ...SHOOT_KEYS, ...JUMP_KEYS, ...DASH_KEYS, ...LOCK_KEYS, ...REACT_KEYS, ...CHIP_KEYS, ...TURN_LEFT, ...TURN_RIGHT]);
    const isGameKey = (code) => GAME_KEYS.has(code);
    const press = (code) => {
      this.keys.add(code);
      this.tapped.add(code);
    };
    win.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts (reload, find...) alone
      if (isGameKey(e.code)) e.preventDefault();
      if (e.repeat) return;
      press(e.code);
    });
    win.addEventListener('keyup', (e) => this.keys.delete(e.code));
    win.addEventListener('blur', () => {
      this.keys.clear();
      this.dragLook = false;
    });

    // Left button attacks, middle locks on. The right button shoots while the mouse is captured; without
    // capture it drags the camera instead (K still shoots).
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      canvas.focus?.();
      if (e.button === 0) {
        if (!this.locked && !this.lockFailed) this.requestLock();
        press('Mouse0');
      } else if (e.button === 1) {
        e.preventDefault();
        press('Mouse1');
      } else if (this.locked) press('Mouse2');
      else this.dragLook = true;
    });
    win.addEventListener('mouseup', (e) => {
      this.keys.delete(`Mouse${Math.min(2, e.button)}`);
      if (e.button >= 2) this.dragLook = false;
    });
    win.addEventListener('mousemove', (e) => {
      if (this.locked || this.dragLook) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      // Locked on, the wheel switches targets (down = right); otherwise it zooms.
      if (this.isLocked()) this.pulse[e.deltaY > 0 ? 'next' : 'prev']++;
      else this.zoom += Math.sign(e.deltaY);
    }, { passive: false });
    const doc = win.document;
    doc?.addEventListener('pointerlockchange', () => {
      this.locked = doc.pointerLockElement === canvas;
      if (!this.locked) for (const b of ['Mouse0', 'Mouse1', 'Mouse2']) this.keys.delete(b);
    });
    doc?.addEventListener('pointerlockerror', () => {
      if (this.lockFailed) return;
      this.lockFailed = true;
      this.onLockFailed?.();
    });

    if (touchRoot) this.bindTouch(touchRoot);
  }

  requestLock() {
    const fail = () => {
      if (this.lockFailed) return;
      this.lockFailed = true;
      this.onLockFailed?.();
    };
    if (!this.canvas.requestPointerLock) return fail();
    try {
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(fail);
    } catch {
      fail();
    }
  }

  bindTouch(root) {
    const stickZone = root.querySelector('[data-stick]');
    const knob = root.querySelector('[data-knob]');
    const lookZone = root.querySelector('[data-look]');
    const RADIUS = 46;
    stickZone?.addEventListener('pointerdown', (e) => {
      this.usedTouch = true;
      this.touch.move = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      try {
        stickZone.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic event has no live pointer to capture.
      }
    });
    stickZone?.addEventListener('pointermove', (e) => {
      const m = this.touch.move;
      if (!m || m.id !== e.pointerId) return;
      let dx = e.clientX - m.x0;
      let dy = e.clientY - m.y0;
      const l = Math.hypot(dx, dy);
      if (l > RADIUS) {
        dx *= RADIUS / l;
        dy *= RADIUS / l;
      }
      this.touch.stick = { x: dx / RADIUS, y: -dy / RADIUS };
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const endStick = (e) => {
      if (this.touch.move?.id !== e.pointerId) return;
      this.touch.move = null;
      this.touch.stick = { x: 0, y: 0 };
      if (knob) knob.style.transform = '';
    };
    stickZone?.addEventListener('pointerup', endStick);
    stickZone?.addEventListener('pointercancel', endStick);

    lookZone?.addEventListener('pointerdown', (e) => {
      this.usedTouch = true;
      this.touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    lookZone?.addEventListener('pointermove', (e) => {
      const l = this.touch.look;
      if (!l || l.id !== e.pointerId) return;
      this.look.dx += (e.clientX - l.x) * 1.6;
      this.look.dy += (e.clientY - l.y) * 1.6;
      l.x = e.clientX;
      l.y = e.clientY;
    });
    const endLook = (e) => {
      if (this.touch.look?.id === e.pointerId) this.touch.look = null;
    };
    lookZone?.addEventListener('pointerup', endLook);
    lookZone?.addEventListener('pointercancel', endLook);

    for (const btn of root.querySelectorAll('[data-btn]')) {
      const name = btn.dataset.btn;
      const chip = Number(btn.dataset.chip) || 0;
      const on = (e) => {
        e.preventDefault();
        this.usedTouch = true;
        if (chip) this.touch.chip = chip;
        else {
          this.touch.held.add(name);
          this.tapped.add(`Touch:${name}`);
        }
        btn.classList.add('on');
      };
      const off = () => {
        if (chip) {
          if (this.touch.chip === chip) this.touch.chip = 0;
        } else this.touch.held.delete(name);
        btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    }
  }

  // Forget everything held or tapped (when a menu closes, so its key presses don't leak into the game).
  reset() {
    this.keys.clear();
    this.tapped.clear();
    this.touch.held.clear();
    this.touch.chip = 0;
    this.pulse = { next: 0, prev: 0 };
    this.pulsed = { next: false, prev: false };
    this.dragLook = false;
  }

  // Held now, or pressed since the last sample.
  any(codes) {
    return codes.some((c) => this.keys.has(c) || this.tapped.has(c));
  }

  touched(name) {
    return this.touch.held.has(name) || this.tapped.has(`Touch:${name}`);
  }

  pad() {
    const pads = globalThis.navigator?.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  sample() {
    let mx = 0;
    let my = 0;
    if (this.any(MOVE_KEYS.left)) mx -= 1;
    if (this.any(MOVE_KEYS.right)) mx += 1;
    if (this.any(MOVE_KEYS.up)) my += 1;
    if (this.any(MOVE_KEYS.down)) my -= 1;
    mx += this.touch.stick.x;
    my += this.touch.stick.y;
    const t = this.touch;
    const lockedOn = this.isLocked();
    const out = {
      attack: this.any(ATTACK_KEYS) || this.touched('attack'),
      shoot: this.any(SHOOT_KEYS) || this.touched('shoot'),
      jump: this.any(JUMP_KEYS) || this.touched('jump'),
      dash: this.any(DASH_KEYS) || this.touched('dash'),
      lock: this.any(LOCK_KEYS) || this.touched('lock'),
      react: this.any(REACT_KEYS) || this.touched('react'),
      next: (lockedOn && this.any(TURN_RIGHT)) || this.touched('next'),
      prev: lockedOn && this.any(TURN_LEFT),
      chip: t.chip || CHIP_KEYS.findIndex((k) => this.keys.has(k) || this.tapped.has(k)) + 1,
    };
    this.tapped.clear();
    const pad = this.pad();
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(pad.axes[0] ?? 0);
      const ly = dz(pad.axes[1] ?? 0);
      if (lx || ly) this.usedPad = true;
      mx += lx;
      my -= ly;
      const b = (i) => !!pad.buttons[i]?.pressed;
      if (pad.buttons.some((x) => x?.pressed)) this.usedPad = true;
      const shortcut = b(PAD.lb); // KH2's shortcut menu: hold LB, press a face button for a chip
      if (shortcut) {
        const slot = PAD_CHIPS.findIndex((i) => b(i));
        if (slot >= 0) out.chip = slot + 1;
      } else {
        out.attack ||= b(PAD.x);
        out.jump ||= b(PAD.a);
        out.dash ||= b(PAD.b);
        out.react ||= b(PAD.y);
      }
      out.dash ||= b(PAD.lt);
      out.shoot ||= b(PAD.rt);
      out.lock ||= b(PAD.rb);
      out.next ||= b(PAD.right);
      out.prev ||= b(PAD.left);
      // Locked on, a flick of the right stick switches targets.
      const rx = pad.axes[2] ?? 0;
      if (lockedOn && Math.abs(rx) > 0.65 && this.flick === 0) {
        this.flick = Math.sign(rx);
        this.pulse[rx > 0 ? 'next' : 'prev']++;
      } else if (Math.abs(rx) < 0.3) this.flick = 0;
    }
    // A queued wheel tick or flick is pressed for one step and released for the next, so each one counts.
    for (const k of ['next', 'prev']) {
      if (this.pulsed[k]) this.pulsed[k] = false;
      else if (this.pulse[k] > 0) {
        this.pulse[k]--;
        this.pulsed[k] = true;
        out[k] = true;
      }
    }
    if (!lockedOn) this.pulse = { next: 0, prev: 0 };
    out.move = { x: mx, y: my };
    return out;
  }

  consumeLook(dt) {
    const out = { dx: this.look.dx, dy: this.look.dy, zoom: this.zoom };
    this.look.dx = 0;
    this.look.dy = 0;
    this.zoom = 0;
    // Keyboard and right-stick turning, scaled to feel like mouse pixels. Locked on, the camera frames the
    // target by itself and the same inputs switch targets instead.
    const lockedOn = this.isLocked();
    const turn = lockedOn ? 0 : (this.any(TURN_RIGHT) ? 1 : 0) - (this.any(TURN_LEFT) ? 1 : 0);
    out.dx += turn * 420 * dt;
    const pad = this.pad();
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      if (!lockedOn) out.dx += dz(pad.axes[2] ?? 0) * 900 * dt;
      out.dy += dz(pad.axes[3] ?? 0) * 600 * dt;
    }
    return out;
  }
}
