import * as THREE from 'three';
import { Stage } from './view/stage.js';
import { BattleView } from './view/battleView.js';
import { loadNavi } from './view/navi.js';
import { dailyRecipe, dayNumber, dayDate, movesOf, playerFor } from './recipe.js';
import { dailyBattle, suggestedFolder, FOLDERS, AURA_BREAKERS } from './fight.js';
import { Recorder, Playback, outcome } from './replay.js';
import { PRESET_BY_KEY } from '../game/data/folders.js';
import { Input } from '../input/input.js';
import { audio } from '../audio/index.js';
import { Hud, clock } from './hud.js';
import { CustomScreenView } from './customScreen.js';
import { store } from './store.js';
import { net } from './net.js';
import { shareText, timeline, links, resultCard, share, copy, download, EL_EMOJI } from './share.js';
import { saveCustom, modelName, MAX_FILE } from '../render3d/glb.js';
import { autopilot } from '../game/autopilot.js';
import { SLOTS_PER_ROW } from '../engine/custom.js';
import { prepareModel } from '../render3d/models.js';

// GridWars Daily: one boss a day for everyone, a leaderboard of verified runs, and links that pass it on.
// The page has three modes: the lobby (today's boss on show, your navi and folder, the board and your week),
// the battle (the Gauntlet's engine at 60 steps a second, every input recorded) and the results (time,
// Busting Level, rank, and the share buttons). ?vs=<run> races a friend's run; ?r=<run> watches one;
// ?day=N practises an earlier boss.

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TODAY = dayNumber();
const STEP = 1 / 60;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ELEMENT_NAME = { elec: 'ELEC', fire: 'FIRE', aqua: 'AQUA', wood: 'WOOD', null: 'NULL' };

const state = {
  mode: 'boot', // lobby | battle | results | watch
  day: TODAY,
  recipe: null,
  b: null,
  rec: null,
  play: null, // Playback when watching
  watch: null, // { entry, run } of a run being watched
  rival: null, // { entry, run, pace } in a challenge
  paused: false,
  hpTrace: [],
  banner: null,
  result: null,
  navi: null,
  t: 0,
};
window.__daily = state; // for scripted browser checks: state, and tick(n) to run the battle n steps now

const stage = new Stage($('scene'), { quality: params.get('quality') ?? (/Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? 'medium' : 'high') });
const hud = new Hud(stage);
const customView = new CustomScreenView((kind, arg) => op(kind, arg));
let view = null;

// ---------------------------------------------------------------- input

const keys = new EventTarget();
const input = new Input(keys);
for (const type of ['keydown', 'keyup']) {
  window.addEventListener(type, (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    audio.unlock();
    if (type === 'keydown' && !e.repeat) {
      if (state.mode === 'battle' && (e.code === 'Escape' || (e.code === 'Enter' && state.b?.phase !== 'custom'))) {
        togglePause();
        e.preventDefault();
        return;
      }
      if (state.mode === 'lobby' && e.code === 'Enter') {
        e.preventDefault();
        startBattle();
        return;
      }
    }
    if (state.mode !== 'battle') return;
    const ev = new KeyboardEvent(type, { code: e.code, key: e.key, repeat: e.repeat });
    Object.defineProperty(ev, 'preventDefault', { value: () => e.preventDefault() });
    keys.dispatchEvent(ev);
  });
}
window.addEventListener('blur', () => input.releaseAll());
for (const el of document.querySelectorAll('[data-btn]')) {
  const btn = el.dataset.btn;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    audio.unlock();
    el.setPointerCapture?.(e.pointerId);
    input.touchDown(btn);
  });
  const up = () => input.touchUp(btn);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'battle' && !state.paused) togglePause();
});
$('pauseBtn').onclick = () => togglePause();

function togglePause() {
  if (state.mode !== 'battle' || !state.b || state.watch) return;
  state.paused = !state.paused;
  input.releaseAll();
  toast(state.paused ? 'PAUSED · tap ▶ or press Enter to go on' : 'GO!', state.paused ? 60000 : 600);
  $('pauseBtn').textContent = state.paused ? '▶' : 'II';
}

// A Custom Screen tap, recorded with the run.
function op(kind, arg) {
  const b = state.b;
  if (!b || !state.rec || state.watch) return;
  if (state.rec.op(b, kind, arg)) {
    const sfx = { s: 'select', u: 'deselect', c: 'confirm', a: 'confirm' }[kind];
    if (sfx) audio.play(sfx);
    customView.update(b);
  } else audio.play('buzz');
}

// ---------------------------------------------------------------- boot

async function boot() {
  // A shared run picks its own day.
  const id = params.get('r') ?? params.get('vs');
  let shared = null;
  if (id) {
    shared = await net.run(id);
    if (!shared?.run) {
      toast('That run link has expired or is not on this server: here is today\'s boss.', 4000);
      shared = null;
    }
  }
  const asked = Number(params.get('day'));
  state.day = shared?.entry.day ?? (asked >= 1 && asked <= TODAY ? asked : TODAY);
  state.recipe = dailyRecipe(state.day);
  if (shared && params.get('r')) state.watch = shared;
  else if (shared) state.rival = { ...shared, pace: paceOf(shared.run, state.recipe) };
  document.documentElement.style.setProperty('--accent', state.recipe.arena.accent);
  view = new BattleView(stage, state.recipe);
  await setNavi(store.setting('navi') ?? 'custom');
  $('loading').hidden = true;
  showLobby();
  requestAnimationFrame(loop);
}

async function setNavi(kind) {
  try {
    const n = await loadNavi(kind);
    n.actor.turn = store.setting('turn') ?? 0;
    state.navi = n;
    view.setNavi(n.actor);
    store.setting('navi', n.kind);
  } catch (e) {
    toast(`Couldn't load that model: ${e.message}`, 4000);
    if (kind !== 'mech') return setNavi('mech');
  }
  renderNavi();
}

// The boss's HP at each moment of a run (every 6 fight frames), for the challenge's pace bar.
function paceOf(run, recipe) {
  const b = dailyBattle(recipe, { folder: run.folder });
  const boss = b.entities.find((e) => e.kind === 'navi');
  const p = new Playback(b, run);
  const hp = [1];
  while (!p.over) {
    p.step();
    const i = Math.floor(b.fightFrames / 6);
    while (hp.length <= i) hp.push(Math.max(0, boss.hp) / boss.maxHp);
  }
  hp.push(0);
  return Float32Array.from(hp);
}

// ---------------------------------------------------------------- lobby

function showLobby() {
  state.mode = state.watch ? 'watch' : 'lobby';
  state.b = null;
  view.attach(null);
  hud.show(false);
  customView.show(false);
  $('touch').hidden = true;
  $('results').hidden = true;
  $('lobby').hidden = false;
  audio.music('menu');
  renderLobby();
  refreshBoard();
}

function renderLobby() {
  const r = state.recipe;
  const wd = WEEKDAYS[new Date(dayDate(r.day)).getUTCDay()];
  $('dayLabel').textContent = `#${r.day} · ${wd} ${r.date}${r.day !== TODAY ? ' · PRACTICE' : ''}`;
  const tier = $('bossTier');
  tier.textContent = r.tierName;
  tier.className = `tier t${r.tier}`;
  const el = $('bossEl');
  el.className = `tag el el-${r.element}`;
  el.textContent = `${EL_EMOJI[r.element]} ${ELEMENT_NAME[r.element]}${r.weakness ? ` · weak to ${ELEMENT_NAME[r.weakness]}` : ''}`;
  $('bossHp').textContent = `HP ${r.hp}`;
  $('bossName').textContent = r.name;
  $('bossTitle').textContent = r.title;
  $('bossArena').textContent = `Arena: ${r.arena.name}`;
  const moves = $('bossMoves');
  moves.textContent = '';
  for (const m of movesOf(r)) {
    const d = document.createElement('div');
    d.className = `move el-${m.element}`;
    d.innerHTML = '<i></i><b></b><small></small>';
    d.querySelector('i').textContent = EL_EMOJI[m.element] ?? '';
    d.querySelector('b').textContent = m.name;
    d.querySelector('small').textContent = m.desc;
    moves.append(d);
  }
  const warns = [];
  if (r.moves.includes('zeroday.aura')) warns.push(`Dark Aura: it shrugs off hits under ${r.tune.zeroday.aura} until one hit that size breaks it: any attack chip, or a fully charged shot.`);
  if (r.superArmor) warns.push('Super Armor: it never flinches. Read its tells and hit it while it recovers.');
  if (r.mover === 'sabre') warns.push('It guards when you shoot: wait for the shield to drop.');
  $('bossWarn').hidden = !warns.length;
  $('bossWarn').textContent = warns.join(' ');
  const ch = $('challenge');
  if (state.rival) {
    ch.hidden = false;
    ch.textContent = `⚔️ ${state.rival.entry.name} deleted ${r.name} in ${clock(state.rival.entry.seconds * 60)}. Beat that! Their pace shows under the boss's bar.`;
  } else if (state.watch) {
    ch.hidden = false;
    ch.textContent = `▶ ${state.watch.entry.name}'s run: ${clock(state.watch.entry.seconds * 60)}, Busting ${state.watch.entry.busting}. Press WATCH.`;
  } else ch.hidden = true;
  $('fightBtn').textContent = state.watch ? 'WATCH ▶' : store.result(r.day) ? 'FIGHT AGAIN!' : 'FIGHT!';
  const name = $('nameInput');
  if (document.activeElement !== name) name.value = store.name;
  renderFolders();
  renderNavi();
  renderWeek();
}

$('nameInput').addEventListener('input', (e) => {
  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').slice(0, 12);
  if (v !== e.target.value) e.target.value = v;
  store.name = v.trim();
});
$('fightBtn').onclick = () => {
  audio.unlock();
  startBattle();
};

function folderOf(day) {
  return store.data.folders?.[day] ?? suggestedFolder(state.recipe);
}

function renderFolders() {
  const box = $('folders');
  box.textContent = '';
  const pick = folderOf(state.day);
  const best = suggestedFolder(state.recipe);
  for (const key of FOLDERS) {
    const f = PRESET_BY_KEY[key];
    const b = document.createElement('button');
    b.className = `opt${key === pick ? ' on' : ''}`;
    b.innerHTML = `${key === best ? '<span class="star">★</span> ' : ''}`;
    b.append(document.createTextNode(f.name));
    b.onclick = () => {
      (store.data.folders ??= {})[state.day] = key;
      store.save();
      renderFolders();
    };
    box.append(b);
  }
  const f = PRESET_BY_KEY[pick];
  const aura = state.recipe.moves.includes('zeroday.aura') && !AURA_BREAKERS.includes(pick) ? ' Few of its chips can break a Dark Aura.' : '';
  $('folderDesc').textContent = `${f.desc}${pick === best ? ' (suggested for today)' : ''}${aura}`;
}

function renderNavi() {
  const kind = state.navi?.kind ?? 'mech';
  $('naviMech').classList.toggle('on', kind === 'mech');
  $('naviCustom').classList.toggle('on', kind === 'custom');
  $('naviNote').textContent = kind === 'custom' ? `Your model: ${state.navi.name}${state.navi.rig === 'static' ? ' (no rig: it moves as one piece)' : ''}` : 'Load your own .glb (a Tripo model works) to fight as it. It stays in this browser.';
}
$('naviMech').onclick = () => setNavi('mech');
$('naviCustom').onclick = () => setNavi('custom');
$('naviTurn').onclick = () => {
  const t = ((store.setting('turn') ?? 0) + 1) % 4;
  store.setting('turn', t);
  if (state.navi) state.navi.actor.turn = t;
};
$('naviLoad').onclick = () => {
  const f = document.createElement('input');
  f.type = 'file';
  f.accept = '.glb,model/gltf-binary';
  f.onchange = () => f.files[0] && importFile(f.files[0]);
  f.click();
};
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...(e.dataTransfer?.files ?? [])].find((x) => /\.glb$/i.test(x.name));
  if (file && state.mode !== 'battle') importFile(file);
});

async function importFile(file) {
  if (file.size > MAX_FILE) return toast(`That file is too big (limit ${MAX_FILE / 1048576} MB).`, 4000);
  toast('Loading your model…', 20000);
  try {
    const bytes = await file.arrayBuffer();
    await prepareModel(bytes.slice(0), modelName(file.name)); // refuse a file that can't be shown
    await saveCustom({ name: modelName(file.name), bytes, size: bytes.byteLength, added: Date.now() });
    await setNavi('custom');
    toast(`${modelName(file.name)} is your navi now.`, 2500);
  } catch (e) {
    toast(`Couldn't use that model: ${e.message}`, 5000);
  }
}

function renderWeek() {
  const box = $('week');
  box.textContent = '';
  for (const d of store.week(TODAY)) {
    const c = document.createElement('div');
    c.className = `day${d.done ? ' done' : ''}${d.today ? ' today' : ''}`;
    const wd = WEEKDAYS[new Date(dayDate(d.day)).getUTCDay()];
    c.innerHTML = `<b></b>`;
    c.querySelector('b').textContent = d.future ? '?' : d.done ? '✓' : d.tier;
    c.append(document.createTextNode(wd));
    if (!d.future && d.day >= 1 && d.day !== state.day) {
      c.style.cursor = 'pointer';
      c.title = `Practise day #${d.day}`;
      c.onclick = () => (location.href = `${location.pathname}?day=${d.day}`);
    }
    box.append(c);
  }
  const s = store.streak(TODAY);
  $('streak').textContent = `🔥 ${s} day${s === 1 ? '' : 's'}`;
}

async function refreshBoard() {
  const table = $('boardTable');
  if (!net.online) {
    table.innerHTML = '<tbody><tr><td class="muted">The board lives on the game\'s site. Your best is kept here.</td></tr></tbody>';
    $('boardCount').textContent = '';
    return;
  }
  const res = await net.board(state.day, store.pid);
  if (!res?.top) {
    table.innerHTML = '<tbody><tr><td class="muted">Couldn\'t reach the board.</td></tr></tbody>';
    return;
  }
  $('boardCount').textContent = res.count ? `${res.count} cleared` : '';
  const rows = res.top.slice(0, 10);
  if (res.you && !rows.some((e) => e.id === res.you.id)) rows.push(res.you);
  const body = document.createElement('tbody');
  if (!rows.length) body.innerHTML = '<tr><td class="muted">Nobody has deleted it yet. Be first!</td></tr>';
  for (const e of rows) {
    const tr = document.createElement('tr');
    if (res.you && e.id === res.you.id) tr.className = 'me';
    tr.innerHTML = '<td class="r"></td><td class="n"></td><td class="bl"></td><td class="t"></td>';
    tr.children[0].textContent = `#${e.rank}`;
    tr.children[1].textContent = e.name;
    tr.children[2].textContent = e.busting;
    tr.children[2].className = `bl bl-${e.busting}`;
    tr.children[3].textContent = clock(e.seconds * 60);
    tr.style.cursor = 'pointer';
    tr.title = `Race ${e.name}'s run`;
    tr.onclick = () => (location.href = `${location.pathname}?vs=${e.id}`);
    body.append(tr);
  }
  table.textContent = '';
  table.append(body);
}

// ---------------------------------------------------------------- battle

function startBattle() {
  if (state.mode !== 'lobby' && state.mode !== 'watch' && state.mode !== 'results') return;
  const r = state.recipe;
  const watching = !!state.watch;
  const folder = watching ? state.watch.run.folder : folderOf(state.day);
  const b = dailyBattle(r, { folder, name: store.name || 'NAVI' });
  state.b = b;
  state.folder = folder;
  state.rec = watching ? null : new Recorder();
  state.bot = params.has('bot') && !watching ? autopilot() : null;
  if (state.bot) {
    // The autopilot picks chips by calling the Custom Screen directly: record those picks too, so its
    // runs replay (and ?bot=submit can test the board on a development server).
    const cs = b.custom;
    const select = cs.select.bind(cs);
    cs.select = (i) => {
      const ok = select(i);
      if (ok) state.rec.ops.push([b.frame, 's', i]);
      return ok;
    };
  }
  state.play = watching ? new Playback(b, state.watch.run) : null;
  state.paused = false;
  state.hpTrace = [b.player.hp];
  state.banner = null;
  state.acc = 0;
  state.intro = 0;
  state.mode = 'battle';
  view.attach(b);
  hud.start(b, r, watching ? state.watch.entry.name : store.name || 'NAVI', state.rival ? { name: state.rival.entry.name, hp: state.rival.pace, seconds: state.rival.entry.seconds } : null);
  hud.show(true);
  $('lobby').hidden = true;
  $('results').hidden = true;
  $('touch').hidden = watching || !('ontouchstart' in window || navigator.maxTouchPoints > 0);
  $('pauseBtn').hidden = watching;
  input.releaseAll();
  audio.music(r.tier === 4 ? 'final' : 'boss');
  if (!watching && innerWidth < innerHeight && !state.rotateTip) {
    state.rotateTip = true;
    toast('Tip: turn your phone sideways for a bigger arena.', 2600);
  }
}

function tick() {
  const b = state.b;
  if (state.play) {
    if (state.play.over) {
      if (!b.done && (b.phase === 'win' || b.phase === 'lose')) b.step({});
    } else state.play.step();
  } else if (state.bot) {
    // ?bot: the autopilot plays (for checking the view; ?bot=submit sends its runs to a development
    // board). On the Custom Screen it moves the cursor itself, which isn't an input: its OK is recorded as
    // a tap instead, and none of its keys reach the screen.
    let pad = state.bot(b);
    if (b.phase === 'custom') {
      if (pad.a && b.custom.cursor.x === SLOTS_PER_ROW) state.rec.op(b, 'c');
      pad = {};
    }
    state.rec.pad(pad);
    b.step(pad);
  } else {
    const held = input.sample();
    const pad = { ...held };
    if (b.phase !== 'custom') delete pad.start;
    delete pad.select;
    state.rec.pad(pad);
    b.step(pad);
  }
  if (b.fightFrames % 30 === 0 && b.phase === 'fight') state.hpTrace.push(b.player.hp);
  onEvents(b.drainEvents());
  if (b.banner && b.banner !== state.banner) {
    state.banner = b.banner;
    hud.banner(b.banner.text, b.banner.kind === 'pa' ? 'counter' : '', (b.banner.timer / 60) * 1000);
  }
  if (b.done || (state.play?.over && !b.done && b.phase !== 'win' && b.phase !== 'lose')) finish();
}

state.tick = (n = 1) => {
  for (let i = 0; i < n && state.mode === 'battle'; i++) tick();
  return { phase: state.b?.phase, frame: state.b?.frame, fight: state.b?.fightFrames };
};

function onEvents(list) {
  const b = state.b;
  view.events(list);
  for (const ev of list) {
    if (ev.type === 'sfx') audio.play(ev.name);
    else if (ev.type === 'hurt' && ev.amount > 0) hud.damage(ev.amount, ev.col, ev.row, { me: ev.id === b.player.id, big: ev.amount >= 100 || ev.doubled });
    else if (ev.type === 'counter') hud.banner('COUNTER!', 'counter', 900);
    else if (ev.type === 'bossmove') hud.banner(ev.name.toUpperCase(), 'callout', 1400);
    else if (ev.type === 'fx' && ev.fx === 'flash') hud.flash('#ffffff');
  }
}

// ---------------------------------------------------------------- results

async function finish() {
  const b = state.b;
  const boss = view.bossEntity;
  const o = outcome(b, boss);
  if (!o.bossMaxHp) o.bossMaxHp = state.recipe.hp;
  state.mode = 'results';
  hud.show(false);
  customView.show(false);
  $('touch').hidden = true;
  audio.music(o.won ? 'victory' : 'gameover');
  const r = state.recipe;
  const res = { outcome: o, rank: null, count: null, id: null, best: false, submitting: false, error: null };
  state.result = res;
  if (state.watch) return renderResults();
  const run = state.rec.finish({ day: r.day, folder: state.folder });
  res.run = run;
  res.best = store.record(r.day, { won: o.won, seconds: o.seconds, busting: o.busting, hp: o.hp, maxHp: o.maxHp });
  res.strip = timeline([...state.hpTrace, b.player.hp], b.player.maxHp);
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (o.won && net.online && (!state.bot || (params.get('bot') === 'submit' && local))) {
    res.submitting = true;
    renderResults();
    const sent = await net.submit(r.day, { pid: store.pid, name: store.name || 'NAVI', folder: state.folder, run });
    res.submitting = false;
    if (sent?.ok) {
      res.id = sent.id;
      res.rank = sent.rank;
      res.count = sent.count;
      res.boardBest = sent.best;
      store.setRunId(r.day, sent.id);
    } else res.error = sent?.error ?? (r.day === TODAY ? 'Couldn\'t reach the board.' : 'Practice run: the board is for today\'s boss.');
  }
  renderResults();
  renderWeek();
}

function renderResults() {
  const res = state.result;
  const o = res.outcome;
  const r = state.recipe;
  const card = $('resCard');
  $('results').hidden = false;
  const watching = !!state.watch;
  const rival = state.rival?.entry;
  const best = store.result(r.day);
  let rankLine = '';
  if (res.submitting) rankLine = 'Checking your run with the board…';
  else if (res.rank) rankLine = `#${res.rank} of ${res.count} today${res.count > 4 ? ` · TOP ${Math.max(1, Math.ceil((100 * res.rank) / res.count))}%` : ''}${res.boardBest === false ? ' (your best still stands)' : ''}`;
  else if (res.error) rankLine = res.error;
  const vs = rival && o.won ? (o.seconds < rival.seconds ? `⚔️ You beat ${rival.name} by ${(rival.seconds - o.seconds).toFixed(2)} s!` : `⚔️ ${rival.name} was ${(o.seconds - rival.seconds).toFixed(2)} s faster. Again!`) : '';
  card.innerHTML = `
    <h2>${o.won ? 'ENEMY DELETED!' : 'DELETED…'}</h2>
    <div class="muted">${esc(watching ? `${state.watch.entry.name}'s run · ` : '')}${esc(r.name)} ${r.tierName} · Daily #${r.day}</div>
    ${o.won ? `<div class="row" style="justify-content:center;gap:16px"><div class="big">${clock(o.fightFrames)}</div><div class="bust">${o.busting}</div></div>` : `<div class="big" style="color:var(--bad)">${Math.round((100 * o.bossHp) / Math.max(1, o.bossMaxHp))}% left</div>`}
    ${res.strip ? `<div class="emoji">${res.strip}</div>` : ''}
    <div class="stats">
      <div><b>${o.hp}</b><small>HP left</small></div>
      <div><b>${o.hitsTaken}</b><small>hits taken</small></div>
      <div><b>${o.counters}</b><small>counters</small></div>
    </div>
    <div class="rank">${esc(rankLine)}</div>
    ${vs ? `<div class="rank">${esc(vs)}</div>` : ''}
    ${!watching && best?.won ? `<div class="muted">Your best today: ${clock(best.seconds * 60)} · ${best.tries} tr${best.tries === 1 ? 'y' : 'ies'}</div>` : ''}
    <div class="grid2" id="resShare"></div>
    <div class="grid2"><button class="btn primary" id="resAgain">${watching ? 'PLAY IT ▶' : 'RETRY'}</button><button class="btn" id="resLobby">LOBBY</button></div>`;
  const shareBox = card.querySelector('#resShare');
  const id = res.id ?? (watching ? state.watch.entry.id : null);
  const l = links(id);
  const addBtn = (label, fn, cls = '') => {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.onclick = fn;
    shareBox.append(b);
  };
  if (!watching) {
    addBtn('SHARE', async () => {
      const text = shareText({ recipe: r, outcome: o, strip: res.strip, streak: store.streak(TODAY), link: res.id ? l.challenge : l.home, rival });
      const how = await share({ text });
      toast(how === 'copied' ? 'Copied! Paste it anywhere.' : how === 'shared' ? 'Shared!' : how === 'cancelled' ? 'Not shared.' : 'Couldn\'t share.', 1800);
    }, 'primary');
    addBtn('RESULT CARD', async () => {
      const blob = await resultCard({ snapshot: stage.canvas, recipe: r, outcome: o, name: store.name || 'NAVI', rank: res.rank });
      const file = new File([blob], `gridwars-daily-${r.day}.png`, { type: 'image/png' });
      const text = shareText({ recipe: r, outcome: o, strip: res.strip, streak: store.streak(TODAY), link: res.id ? l.challenge : l.home, rival });
      const how = await share({ text, file });
      if (how !== 'shared' && how !== 'cancelled') download(blob, file.name);
    });
    if (res.id) {
      addBtn('CHALLENGE LINK', async () => toast((await copy(l.challenge)) ? 'Challenge link copied: send it to a friend!' : l.challenge, 2400));
      addBtn('REPLAY LINK', async () => toast((await copy(l.replay)) ? 'Replay link copied.' : l.replay, 2400));
    }
  } else {
    addBtn('WATCH AGAIN', () => {
      state.mode = 'watch';
      startBattle();
    });
    addBtn('COPY LINK', async () => toast((await copy(l.replay)) ? 'Replay link copied.' : l.replay, 2000));
  }
  card.querySelector('#resAgain').onclick = () => {
    if (watching) location.href = `${location.pathname}?vs=${state.watch.entry.id}`;
    else startBattle();
  };
  card.querySelector('#resLobby').onclick = () => showLobby();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// ---------------------------------------------------------------- the frame loop

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  state.t += dt;
  const b = state.b;
  if (state.mode === 'battle' && b && !state.paused) {
    state.acc = Math.min(state.acc + dt, STEP * 6);
    while (state.acc >= STEP && state.mode === 'battle') {
      tick();
      state.acc -= STEP;
    }
  }
  if (state.mode === 'battle' && b) {
    hud.update();
    customView.show(b.phase === 'custom');
    if (b.phase === 'custom') customView.update(b);
    $('touchCustom').hidden = !b.gaugeFull;
  }
  view.frame(state.t, dt);
  aimCamera(dt);
  stage.render(state.t);
  updateCountdown();
  requestAnimationFrame(loop);
}

const camTarget = new THREE.Vector3();
function aimCamera(dt) {
  const v = stage.view;
  const w = stage.canvas.clientWidth;
  const h = stage.canvas.clientHeight;
  const narrow = w <= 900 || w / h < 1;
  const k = 1 - Math.exp(-dt * 3);
  if (state.mode === 'lobby' || state.mode === 'watch') {
    // Today's boss on show, slowly circling it.
    // The boss stands so many pixels tall: most of the middle on a wide screen, the strip above the
    // boss card on a phone.
    const f = view.bossFocus();
    camTarget.lerp(f, k);
    v.target = camTarget;
    const px = narrow ? Math.min(h * 0.26, 230) : h * 0.5;
    const tan = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
    const want = (view.boss.height * 1.15 * (h / px)) / (2 * tan);
    v.distance = THREE.MathUtils.lerp(v.distance ?? want, want, k);
    v.elevation = THREE.MathUtils.lerp(v.elevation, 0.16, k);
    v.azimuth = THREE.MathUtils.lerp(v.azimuth, -0.55 + Math.sin(state.t * 0.25) * 0.18, k);
    if (narrow) stage.frameIn(w / 2, Math.min(h * 0.15 + px * 0.5, 60 + px * 0.55));
    else stage.frameIn(w / 2, h * 0.47);
    return;
  }
  // The battle: the whole grid, from the front.
  camTarget.lerp(stage.lookAt, k * 1.4);
  v.target = camTarget;
  const want = state.mode === 'results' && state.result?.outcome.won === false ? stage.fitDistance() * 0.8 : stage.fitDistance();
  v.distance = THREE.MathUtils.lerp(v.distance ?? want, want, k * 1.4);
  v.elevation = THREE.MathUtils.lerp(v.elevation, narrow ? 0.62 : 0.5, k * 1.4);
  v.azimuth = THREE.MathUtils.lerp(v.azimuth, 0, k * 1.4);
  if (narrow) stage.frameIn(w / 2, h * 0.47);
  else stage.frameIn(null);
}

let lastCount = '';
function updateCountdown() {
  if (state.mode !== 'lobby' && state.mode !== 'watch') return;
  const now = new Date();
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((mid - now) / 1000));
  const txt = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  if (txt !== lastCount) {
    lastCount = txt;
    $('countdown').textContent = txt;
    if (s === 0) setTimeout(() => location.reload(), 1500);
  }
}

let toastTimer = 0;
function toast(text, ms = 1600) {
  const t = $('toast');
  t.textContent = text;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.opacity = '0'), ms);
}

boot().catch((e) => {
  console.error(e);
  $('loading').textContent = `Something went wrong: ${e.message}`;
});
