import { Input, PadEdges } from './input/input.js';
import { SCREEN_W, SCREEN_H } from './render/layout.js';
import { audio } from './audio/index.js';
import { Game } from './game/game.js';
import { autopilot } from './game/autopilot.js';

// Boot: canvas scaling, the fixed 60 Hz loop, input/audio wiring and the touch controls.

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

function fit() {
  const touch = document.body.classList.contains('touch');
  const availW = window.innerWidth - 32;
  const availH = window.innerHeight - (touch ? 230 : 60);
  let scale = Math.min(availW / SCREEN_W, availH / SCREEN_H);
  if (scale >= 2) scale = Math.floor(scale);
  scale = Math.max(1, scale);
  canvas.style.width = `${Math.floor(SCREEN_W * scale)}px`;
  canvas.style.height = `${Math.floor(SCREEN_H * scale)}px`;
}

const input = new Input(window);
const params = new URLSearchParams(location.search);
const game = new Game({ input, audio, params, storage: safeStorage() });

// Touch controls: show them on touch devices (or with ?touch=1).
const isTouch = params.get('touch') === '1' || (params.get('touch') !== '0' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches);
if (isTouch) document.body.classList.add('touch');
for (const btn of document.querySelectorAll('#touch [data-btn]')) {
  const name = btn.dataset.btn;
  const on = (e) => {
    e.preventDefault();
    btn.classList.add('on');
    btn.setPointerCapture?.(e.pointerId);
    input.touchDown(name);
  };
  const off = (e) => {
    e.preventDefault();
    btn.classList.remove('on');
    input.touchUp(name);
  };
  btn.addEventListener('pointerdown', on);
  btn.addEventListener('pointerup', off);
  btn.addEventListener('pointercancel', off);
  btn.addEventListener('pointerleave', off);
}

// Keyboard focus: inside an embedding frame keys only arrive once the page has focus.
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
try {
  canvas.focus({ preventScroll: true });
} catch {
  /* focus may be refused before interaction */
}

// Audio needs a user gesture.
const unlock = () => audio.unlock();
input.onFirstInput = unlock;
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

window.addEventListener('resize', fit);
fit();

// Fixed-step loop: the sim always advances in 1/60 s steps; drawing happens once per animation frame.
const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;
const edges = new PadEdges();
function frame(now) {
  acc += Math.min(250, now - last);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    const held = input.sample();
    game.step(held, edges.update(held));
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  game.draw(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Pause when hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.onHidden?.();
  last = performance.now();
  acc = 0;
});

// Test hooks for scripted browser runs.
window.__game = game;
window.__autopilot = autopilot;
window.__ready = true;

function safeStorage() {
  try {
    const k = '__cmgw_probe';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
}
