// Controls for the open world: keyboard + mouse (pointer lock when the page allows it, otherwise drag with the
// right or middle button to look), gamepad, and touch (a move stick, drag-to-look and buttons).
// sample() returns held states for one simulation step; consumeLook() returns the look delta since last call.

const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
const FIRE_KEYS = ['KeyJ', 'KeyF', 'Enter'];
const JUMP_KEYS = ['Space', 'KeyK'];
const DASH_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyL'];
const TURN_LEFT = ['KeyQ'];
const TURN_RIGHT = ['KeyE'];

export class WorldInput {
  constructor(canvas, touchRoot = null) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseFire = false;
    this.dragLook = false;
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.locked = false;
    this.lockFailed = false;
    this.touch = { move: null, look: null, fire: false, jump: false, dash: false, stick: { x: 0, y: 0 } };
    this.usedTouch = false;
    this.usedPad = false;

    const isGameKey = (code) => [...Object.values(MOVE_KEYS).flat(), ...FIRE_KEYS, ...JUMP_KEYS, ...DASH_KEYS, ...TURN_LEFT, ...TURN_RIGHT].includes(code);
    addEventListener('keydown', (e) => {
      if (isGameKey(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = false;
      this.dragLook = false;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      canvas.focus();
      if (e.button === 0) {
        if (!this.locked && !this.lockFailed) this.requestLock();
        this.mouseFire = true;
      } else this.dragLook = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
      else this.dragLook = false;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked || this.dragLook) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.mouseFire = false;
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });

    if (touchRoot) this.bindTouch(touchRoot);
  }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && typeof r.catch === 'function') r.catch(() => (this.lockFailed = true));
    } catch {
      this.lockFailed = true;
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
      const on = (e) => {
        e.preventDefault();
        this.usedTouch = true;
        this.touch[name] = true;
        btn.classList.add('on');
      };
      const off = () => {
        this.touch[name] = false;
        btn.classList.remove('on');
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    }
  }

  any(codes) {
    return codes.some((c) => this.keys.has(c));
  }

  pad() {
    const pads = navigator.getGamepads?.() ?? [];
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
    let fire = this.mouseFire || this.any(FIRE_KEYS) || this.touch.fire;
    let jump = this.any(JUMP_KEYS) || this.touch.jump;
    let dash = this.any(DASH_KEYS) || this.touch.dash;
    const pad = this.pad();
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(pad.axes[0] ?? 0);
      const ly = dz(pad.axes[1] ?? 0);
      if (lx || ly) this.usedPad = true;
      mx += lx;
      my -= ly;
      const b = (i) => !!pad.buttons[i]?.pressed;
      fire = fire || b(2) || b(7) || b(5); // X, right trigger, right bumper
      jump = jump || b(0); // A
      dash = dash || b(1) || b(4) || b(6); // B, left bumper, left trigger
    }
    return { move: { x: mx, y: my }, fire, jump, dash };
  }

  consumeLook(dt) {
    const out = { dx: this.look.dx, dy: this.look.dy, zoom: this.zoom };
    this.look.dx = 0;
    this.look.dy = 0;
    this.zoom = 0;
    // Keyboard and right-stick turning, scaled to feel like mouse pixels.
    const turn = (this.any(TURN_RIGHT) ? 1 : 0) - (this.any(TURN_LEFT) ? 1 : 0);
    out.dx += turn * 420 * dt;
    const pad = this.pad();
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      out.dx += dz(pad.axes[2] ?? 0) * 900 * dt;
      out.dy += dz(pad.axes[3] ?? 0) * 600 * dt;
    }
    return out;
  }
}
