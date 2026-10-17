import { World, DT } from './sim.js';
import { createView } from './view.js';
import { loadAvatar } from './avatar.js';
import { readCustom, saveCustom, modelName, MAX_FILE } from '../render3d/glb.js';
import { WorldInput } from './input.js';
import { Hud } from './hud.js';
import { makeBot } from './bot.js';
import { Garage } from './garage.js';
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

// Progress (parts, loadout, DATA, chips) is kept in this browser between visits. Storage can be missing or
// blocked (private windows, sandboxed previews), so every access is guarded and the game works without it.
const SAVE_KEY = 'cybermetal-open-world-v1';
const readSave = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const writeSave = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(world.saveData()));
  } catch {
    // No storage: progress lasts this visit only.
  }
};
if (!auto) world.loadSave(readSave());

// The body: the built-in mech, or the player's own .glb (the garage's BODY tab, or a file dropped on the page).
// The file lives in IndexedDB beside the grid battler's (src/render3d/glb.js), so one character serves both
// games on the same site; which body is in use, and its turn, are kept here.
const BODY_KEY = 'cybermetal-open-world-body';
function readBody() {
  try {
    const b = JSON.parse(localStorage.getItem(BODY_KEY) ?? 'null');
    return { current: b?.current === 'custom' ? 'custom' : 'mech', turn: [0, 1, 2, 3].includes(b?.turn) ? b.turn : 0 };
  } catch {
    return { current: 'mech', turn: 0 };
  }
}
function writeBody() {
  try {
    localStorage.setItem(BODY_KEY, JSON.stringify(body));
  } catch {
    // No storage: the choice lasts this visit only.
  }
}
const body = auto ? { current: 'mech', turn: 0 } : readBody();
let custom = auto ? null : await readCustom(); // { name, bytes }, or null
let mechBuffer = null;
const bodyBytes = async (which) => (which === 'custom' && custom ? custom.bytes : (mechBuffer ??= await loadMechaBuffer()));
if (body.current === 'custom' && !custom) body.current = 'mech';
let bodyProblem = null;
let view;
try {
  view = await createView(canvas, world, await bodyBytes(body.current), { low, turn: body.current === 'custom' ? body.turn : 0 });
} catch (e) {
  // The player's model won't load any more: start in the mech, and say why once the HUD is up.
  bodyProblem = String(e?.message ?? e);
  body.current = 'mech';
  view = await createView(canvas, world, await bodyBytes('mech'), { low });
}
const input = new WorldInput(canvas, document.getElementById('touch'));
input.isLocked = () => world.player.lock != null;
const hud = new Hud(world, view, { input });
const bot = auto ? makeBot(world) : null;
input.onLockFailed = () => hud.toast('MOUSE LOCK UNAVAILABLE · RIGHT-DRAG OR Q/E TO TURN · K TO SHOOT', '#ffd84a', 4);
if (bodyProblem) hud.toast(`YOUR MODEL WOULDN'T LOAD (${bodyProblem.toUpperCase()}) · USING THE MECH`, '#ff6a6a', 5);

// The garage: commands go to the simulation through its input, one per step, so they replay like any input.
const garageCommands = [];
const garage = new Garage(document.getElementById('garage'), world, {
  onCommand: (cmd) => garageCommands.push(cmd),
  onDenied: (text) => {
    hud.toast(text, '#ff6a6a', 1.6);
    audio.play('buzz');
  },
  onClose: () => {
    document.body.classList.remove('garage-open');
    view.showcase = 0;
    input.reset();
    audio.play('cancel');
    canvas.focus();
  },
  // The forge draws the design being edited on the mech.
  onPreview: (design) => {
    view.preview = design;
  },
  // BODY: the mech, your model, load one (a file picker opens only from a click, tap or key), turn it.
  onBody: (choice, { pad }) => {
    if (choice === 'load') {
      if (pad) hud.toast('CLICK LOAD .GLB, OR DROP A .GLB ON THE GAME', '#ffd84a', 3);
      else picker.click();
    } else if (choice === 'turn') useBody('custom', (body.turn + 1) % 4);
    else useBody(choice, body.turn);
  },
});

// Swapping bodies. Only one load at a time; the garage shows LOADING meanwhile.
let swapping = false;
function syncBody(busy = false) {
  garage.body = { current: body.current, turn: body.turn, custom: custom?.name ?? null, busy };
  garage.render();
}
syncBody();
async function useBody(which, turn) {
  if (swapping || (which === body.current && turn === body.turn)) return;
  swapping = true;
  syncBody(true);
  try {
    view.setAvatar(await loadAvatar(await bodyBytes(which), { turn: which === 'custom' ? turn : 0 }));
    body.current = which;
    body.turn = turn;
    writeBody();
    audio.play('select');
  } catch (e) {
    hud.toast(`CAN'T USE THAT BODY: ${String(e?.message ?? e).toUpperCase()}`, '#ff6a6a', 4);
    audio.play('buzz');
  }
  swapping = false;
  syncBody();
}
// A .glb picked in BODY or dropped on the page becomes your body (and your navi in the grid battler).
async function importBody(file) {
  if (!/\.glb$/i.test(file?.name ?? '')) {
    hud.toast('3D MODELS LOAD FROM .GLB FILES (TRIPO: EXPORT > GLB)', '#ffd84a', 3);
    return;
  }
  if (file.size > MAX_FILE) {
    hud.toast(`THAT FILE IS TOO BIG (${Math.round(file.size / 1048576)} MB; ${MAX_FILE / 1048576} MB AT MOST)`, '#ff6a6a', 4);
    return;
  }
  if (swapping) return;
  swapping = true;
  syncBody(true);
  hud.toast(`LOADING ${file.name.toUpperCase()}…`, '#7ae8ff', 3);
  try {
    const bytes = await file.arrayBuffer();
    const next = await loadAvatar(bytes);
    const name = modelName(file.name);
    const stored = await saveCustom({ name, bytes, size: bytes.byteLength, added: Date.now() });
    custom = { name, bytes };
    view.setAvatar(next);
    body.current = 'custom';
    body.turn = 0;
    writeBody();
    const rig = next.rig === 'repaired' ? ' · RIG REBUILT' : next.rigged ? '' : ' · NO USABLE RIG: IT MOVES AS ONE PIECE';
    hud.toast(`BODY: ${name.toUpperCase()}${rig}${stored ? '' : ' · KEPT FOR THIS VISIT ONLY'}`, '#7ae8ff', 4.5);
    audio.play('confirm');
  } catch (e) {
    hud.toast(`CAN'T USE ${file.name.toUpperCase()}: ${String(e?.message ?? e).toUpperCase()}`, '#ff6a6a', 5);
    audio.play('buzz');
  }
  swapping = false;
  syncBody();
}
const picker = document.createElement('input');
picker.type = 'file';
picker.accept = '.glb,model/gltf-binary';
picker.hidden = true;
picker.addEventListener('change', () => {
  const file = picker.files?.[0];
  picker.value = '';
  if (file) importBody(file);
});
document.body.append(picker);
addEventListener('dragover', (e) => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
addEventListener('drop', (e) => {
  const files = [...(e.dataTransfer?.files ?? [])];
  if (!files.length) return;
  e.preventDefault();
  if (!auto) importBody(files.find((f) => /\.glb$/i.test(f.name)) ?? files[0]);
});
// The garage menu sits beside the mech (to the right on wide screens, below on tall ones), and the camera
// frames the mech in the space left over.
function frameShowcase() {
  const portrait = canvas.clientHeight > canvas.clientWidth * 1.05;
  view.showcaseFrame = portrait ? { x: 0, y: 0.58, dist: 6.2 } : { x: -0.5, y: 0, dist: 3.8 };
}
frameShowcase();
addEventListener('resize', frameShowcase);
function toggleGarage() {
  if (garage.open) return garage.close();
  if (!started || auto) return;
  if (!world.canGarage()) {
    hud.toast('VIRUSES NEARBY · FINISH THE FIGHT FIRST', '#ff6a6a', 2);
    audio.play('buzz');
    return;
  }
  document.exitPointerLock?.();
  view.showcase = 1;
  document.body.classList.add('garage-open');
  garage.show();
  audio.play('customopen');
}
const typing = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyG' && !garage.open && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) toggleGarage();
});
document.getElementById('garageBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleGarage();
});
let padBack = false;

// Sounds from the grid game's synth, mapped onto open-world events (a name, [name, options], or a list).
const SWING_PITCH = [1, 1.12, 1.24, 0.85];
const SFX = {
  shot: (e) => ({ buster: 'buster', needle: 'buster', pellet: 'gun', blast: 'cannon', bomb: 'throw' })[e.kind] ?? 'chargeshot',
  'charge-start': 'charge',
  'charge-full': 'chargefull',
  impact: (e) => (e.team === 'enemy' || ['charge', 'cannon', 'deflect'].includes(e.kind) ? 'explode' : e.surface === 'enemy' ? 'hit' : null),
  'enemy-hit': (e) => {
    if (e.kind === 'burn') return ['flame', { volume: 0.35 }];
    const hit = e.counter ? 'counter' : e.kind === 'finisher' || e.kind === 'react' ? 'hammer' : e.kind === 'melee' ? 'punch' : null;
    // A weakness hit adds its element's sound (Battle Network's flame, bubble, zap and wind).
    const el = e.weak && { fire: 'flame', aqua: 'bubble', elec: 'zap', wood: 'wind' }[e.element];
    return el ? [...(hit ? [hit] : []), [el, { volume: 0.7 }]] : hit;
  },
  swing: (e) => {
    const arm = world.loadout.arm;
    if (arm === 'breaker') return ['hammer', { pitch: e.finisher ? 0.8 : 1 }];
    if (arm === 'lance') return ['throw', { pitch: 1.3 + 0.08 * e.step }];
    if (arm === 'claws') return ['claw', { pitch: 1.1 + 0.07 * e.step }];
    return ['sword', { pitch: e.finisher ? 0.85 : SWING_PITCH[e.step] ?? 1 }];
  },
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
  beam: (e) => (e.level === 2 ? 'beam' : 'laser'),
  charge: 'lance',
  'armor-break': 'objbreak',
  'part-found': 'recover',
  'part-bought': 'confirm',
  'part-equipped': 'select',
  'garage-denied': 'buzz',
  'design-saved': ['confirm', 'pa'],
  'design-deleted': 'deselect',
  'program-unlocked': 'gaugefull',
  'mod-ready': 'pa',
  dummies: 'summon',
  burst: 'explode',
  arc: ['zap', { pitch: 1.4 }],
  stun: 'zap',
  'wave-cast': 'wave',
  leech: (e) => (e.amount >= 3 ? 'recover' : null),
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
  const single = (x) => typeof x === 'string' || (Array.isArray(x) && typeof x[0] === 'string' && x[1] && typeof x[1] === 'object' && !Array.isArray(x[1]));
  if (single(out)) out = [out];
  for (const one of out) {
    const [name, opts] = typeof one === 'string' ? [one, {}] : one;
    audio.play(name, { ...opts, volume: volume * (opts.volume ?? 1) });
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

// Every simulation event goes to the view, the HUD, the sound and, when it changes progress, the save.
function handle(ev) {
  view.onEvent(ev);
  hud.onEvent(ev);
  sound(ev);
  if (ev.type === 'respawn') view.faceCamera(0);
  if (ev.type === 'dummies') view.faceCamera(world.player.yaw); // look at the training dummies
  if (SAVE_ON.has(ev.type)) dirty = true;
  garage.onEvent(ev);
}

// Save a few seconds after progress changes, and when the page is hidden.
const SAVE_ON = new Set(['part-found', 'part-bought', 'part-equipped', 'chip-learn', 'pickup', 'delete', 'design-saved', 'design-deleted', 'program-unlocked']);
let dirty = false;
let saveT = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && dirty && !auto) writeSave();
});

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
  // Gamepad Back toggles the garage; inside it, the pad navigates the menu.
  const pad = input.pad();
  const back = !!pad?.buttons[8]?.pressed;
  if (back && !padBack && !garage.open) toggleGarage();
  padBack = back;
  garage.pollPad(pad);
  if (garage.open && !world.canGarage()) {
    garage.close();
    hud.toast('VIRUSES NEARBY · FINISH THE FIGHT FIRST', '#ff6a6a', 2);
  }
  if (!stopped) {
    if (!garage.open) view.applyLook(input.consumeLook(dt));
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      const aim = view.aimInfo();
      const controls = bot ? bot(view) : started && !garage.open ? input.sample() : { move: { x: 0, y: 0 } };
      view.beforeStep();
      world.step({ ...controls, ...aim, garage: garageCommands.shift() });
      for (const ev of world.drainEvents()) handle(ev);
      acc -= DT;
      steps++;
    }
    if (steps === 5) acc = 0;
    music(dt);
    saveT += dt;
    if (dirty && saveT > 3 && !auto) {
      writeSave();
      dirty = false;
      saveT = 0;
    }
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
    const controls = given ?? (bot ? bot(view) : started && !garage.open ? input.sample() : { move: { x: 0, y: 0 } });
    view.beforeStep();
    world.step({ ...controls, ...aim, garage: controls.garage ?? garageCommands.shift() });
    for (const ev of world.drainEvents()) handle(ev);
    view.render(1, DT);
    hud.update(DT);
  }
}

window.__world = {
  world, view, input, hud, garage, toggleGarage,
  hold: (v) => {
    held = v;
    last = performance.now();
  },
  advance,
};
window.__ready = true;
