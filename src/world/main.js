import { World, DT } from './sim.js';
import { createView } from './view.js';
import { WorldInput } from './input.js';
import { Hud } from './hud.js';
import { makeBot } from './bot.js';
import { loadMechaBuffer } from './assets.js';
import { audio } from '../audio/index.js';

// Boot the open-world prototype: a fixed 60 Hz simulation stepped from requestAnimationFrame, the three.js
// view drawn every frame with the player interpolated between steps.

const canvas = document.getElementById('view');
const startPanel = document.getElementById('start');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || 2026;
const auto = params.get('auto') === '1';
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const low = params.get('low') === '1' || coarse;
if (coarse) document.body.classList.add('touch');

const world = new World({ seed });
const view = await createView(canvas, world, await loadMechaBuffer(), { low });
const input = new WorldInput(canvas, document.getElementById('touch'));
input.isLocked = () => world.player.lock != null;
const hud = new Hud(world, view, { input });
const bot = auto ? makeBot(world) : null;
input.onLockFailed = () => hud.toast('MOUSE LOCK UNAVAILABLE · RIGHT-DRAG OR Q/E TO TURN · K TO SHOOT', '#ffd84a', 4);

// Sounds from the grid game's synth, mapped onto open-world events (a name, [name, options], or a list).
const SWING_PITCH = [1, 1.12, 1.24, 0.85];
const SFX = {
  shot: (e) => (e.kind === 'buster' ? 'buster' : 'chargeshot'),
  'charge-start': 'charge',
  'charge-full': 'chargefull',
  impact: (e) => (e.team === 'enemy' || ['charge', 'cannon', 'deflect'].includes(e.kind) ? 'explode' : e.surface === 'enemy' ? 'hit' : null),
  'enemy-hit': (e) => (e.counter ? 'counter' : e.kind === 'finisher' || e.kind === 'react' ? 'hammer' : e.kind === 'melee' ? 'punch' : null),
  swing: (e) => ['sword', { pitch: e.finisher ? 0.85 : SWING_PITCH[e.step] ?? 1 }],
  lock: (e) => (e.auto ? null : 'cursor'),
  unlock: (e) => (e.auto ? null : 'deselect'),
  'lock-none': 'cancel',
  reaction: ['flash', 'counter'],
  armor: 'guardup',
  'chip-learn': (e) => (e.level === 1 ? 'pa' : 'gaugefull'),
  'chip-use': (e) => {
    const s = { shockwave: 'shockwave', cannon: 'cannon', findash: 'lance' }[e.chip];
    return e.finish ? [s, 'pa'] : s; // a chip finisher gets Battle Network's Program Advance fanfare
  },
  'chip-denied': 'buzz',
  delete: 'delete',
  hurt: 'hurt',
  down: 'playerdelete',
  respawn: 'spawn',
  jump: 'step',
  land: 'thud',
  dash: 'dash',
  evade: 'invis',
  slam: 'shockwave',
  'enemy-shot': 'cannon',
  dive: 'claw',
  telegraph: 'tick',
  pickup: 'select',
  spawn: 'summon',
  'zone-wake': 'battlestart',
  'zone-clear': 'win',
};
function sound(ev) {
  const s = SFX[ev.type];
  let out = typeof s === 'function' ? s(ev) : s;
  if (!out) return;
  // Distant enemy events are quieter.
  const p = world.player;
  const d = ev.x !== undefined ? Math.hypot(ev.x - p.x, ev.z - p.z) : 0;
  const volume = Math.max(0.15, 1 - d / 60);
  if (typeof out === 'string' || (Array.isArray(out) && typeof out[1] === 'object')) out = [out];
  for (const one of out) {
    const [name, opts] = typeof one === 'string' ? [one, {}] : one;
    audio.play(name, { volume, ...opts });
  }
}

// Exploration music, switching to battle music while viruses are close.
let battleT = 0;
let track = null;
function music(dt) {
  const p = world.player;
  const near = world.enemies.some((e) => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 40);
  battleT = near ? 5 : Math.max(0, battleT - dt);
  const want = battleT > 0 ? 'battle' : 'menu';
  if (want !== track) {
    track = want;
    audio.music(want);
  }
}

let started = auto;
if (!auto) {
  startPanel.hidden = false;
  const go = () => {
    if (started) return;
    started = true;
    startPanel.hidden = true;
    audio.unlock();
    canvas.focus();
  };
  startPanel.addEventListener('click', go);
  addEventListener('keydown', go, { once: true });
  document.getElementById('touch')?.addEventListener('pointerdown', go, { once: true });
} else startPanel.hidden = true;

const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => view.resize()) : null;
ro?.observe(canvas);
addEventListener('resize', () => view.resize());

let paused = false;
let held = false; // paused from outside (window.__world.hold), for scripted captures
document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
});

// Frame-rate watch: F3 shows FPS; sustained slow frames lower the render resolution.
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:absolute;right:12px;bottom:12px;font:700 12px ui-monospace,Menlo,monospace;color:#6ae8ff;text-shadow:0 1px 0 #000;display:none';
document.getElementById('app').appendChild(fpsEl);
addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    fpsEl.style.display = fpsEl.style.display === 'none' ? 'block' : 'none';
  }
});
let fpsAcc = 0;
let fpsFrames = 0;
let slowFor = 0;

let acc = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    const fps = fpsFrames / fpsAcc;
    fpsEl.textContent = `${fps.toFixed(0)} FPS · ${view.renderer.getPixelRatio().toFixed(2)}x`;
    slowFor = started && !paused && fps < 40 ? slowFor + fpsAcc : 0;
    if (slowFor >= 2 && !auto) {
      slowFor = 0;
      view.lowerResolution();
    }
    fpsAcc = 0;
    fpsFrames = 0;
  }
  const stopped = paused || held;
  if (!stopped) {
    view.applyLook(input.consumeLook(dt));
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      const aim = view.aimInfo();
      const pad = bot ? bot(view) : started ? input.sample() : { move: { x: 0, y: 0 } };
      view.beforeStep();
      world.step({ ...pad, ...aim });
      for (const ev of world.drainEvents()) {
        view.onEvent(ev);
        hud.onEvent(ev);
        sound(ev);
        if (ev.type === 'respawn') view.faceCamera(0);
      }
      acc -= DT;
      steps++;
    }
    if (steps === 5) acc = 0;
    music(dt);
  }
  if (!held) {
    view.render(acc / DT, stopped ? 0 : dt);
    hud.update(stopped ? 0 : dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Scripted capture: hold the loop, then advance exactly n steps (one render each, at 60 fps) with the given
// input, or else what the loop would use (the bot, or the real controls), handling events as the loop does.
function advance(n, given = null) {
  for (let i = 0; i < n; i++) {
    const aim = view.aimInfo();
    const pad = given ?? (bot ? bot(view) : started ? input.sample() : { move: { x: 0, y: 0 } });
    view.beforeStep();
    world.step({ ...pad, ...aim });
    for (const ev of world.drainEvents()) {
      view.onEvent(ev);
      hud.onEvent(ev);
      if (ev.type === 'respawn') view.faceCamera(0);
    }
    view.render(1, DT);
    hud.update(DT);
  }
}

window.__world = {
  world, view, input, hud,
  hold: (v) => {
    held = v;
    last = performance.now();
  },
  advance,
};
window.__ready = true;
