// A Daily fight as data: the pad on every frame and the Custom Screen picks made by tapping, so the engine
// can play the fight again exactly. Runs are what the leaderboard verifies (the server replays each one
// and records only what the replay shows) and what "watch my run" links play back.
//
//   run: { v, engine, day, folder, frames, pads, ops }
//     pads: base64url of (mask, count) varint pairs: the held buttons, run-length coded
//     ops:  [[frame, kind, arg?], ...]: Custom Screen actions taken between steps, `frame` steps in;
//           kind 's' select hand[arg], 'u' undo the last pick, 'c' OK, 'a' ADD

export const REPLAY_VERSION = 1;
// The engine fingerprint the build stamps in (tools/engine-hash.mjs); 'dev' when run from the sources.
export const ENGINE = typeof __ENGINE__ !== 'undefined' ? __ENGINE__ : 'dev';
export const MAX_FRAMES = 60 * 60 * 10; // ten minutes of steps
const KEYS = ['up', 'down', 'left', 'right', 'a', 'b', 'l', 'r', 'start', 'select'];

export function padMask(held) {
  let m = 0;
  for (let i = 0; i < KEYS.length; i++) if (held[KEYS[i]]) m |= 1 << i;
  return m;
}

export function maskPad(m) {
  const pad = {};
  for (let i = 0; i < KEYS.length; i++) if (m & (1 << i)) pad[KEYS[i]] = true;
  return pad;
}

// Apply a Custom Screen action, only while the Custom Screen is open (a replay can't confirm mid-fight).
// Returns whether it did anything.
export function applyOp(b, kind, arg) {
  const cs = b.custom;
  if (b.phase !== 'custom' || !cs.open) return false;
  if (kind === 's') return cs.select(arg | 0);
  if (kind === 'u') return cs.deselectLast();
  if (kind === 'c') {
    cs.confirm();
    return true;
  }
  if (kind === 'a' && cs.canAdd()) {
    cs.add();
    return true;
  }
  return false;
}

// Records a fight as it is played: pad(held) before each b.step(held), op() for each tap.
export class Recorder {
  constructor() {
    this.runs = [];
    this.ops = [];
    this.mask = -1;
    this.count = 0;
    this.frames = 0;
  }

  pad(held) {
    const m = padMask(held);
    if (m === this.mask) this.count++;
    else {
      if (this.count) this.runs.push(this.mask, this.count);
      this.mask = m;
      this.count = 1;
    }
    this.frames++;
  }

  // Apply a Custom Screen action now and record it.
  op(b, kind, arg) {
    const done = applyOp(b, kind, arg);
    if (done) this.ops.push(arg === undefined ? [b.frame, kind] : [b.frame, kind, arg]);
    return done;
  }

  finish(meta = {}) {
    const runs = this.count ? [...this.runs, this.mask, this.count] : this.runs.slice();
    return { v: REPLAY_VERSION, engine: ENGINE, ...meta, frames: this.frames, pads: encode(runs), ops: this.ops.map((o) => o.slice()) };
  }
}

// Plays a recorded fight into a fresh battle, one step at a time.
export class Playback {
  constructor(b, run) {
    if (run.v !== REPLAY_VERSION) throw new Error(`a run from another version (${run.v})`);
    this.b = b;
    this.runs = decode(run.pads);
    this.ops = (run.ops ?? []).slice().sort((x, y) => x[0] - y[0]);
    this.frames = Math.min(run.frames | 0, MAX_FRAMES);
    this.at = 0; // index into runs (pairs)
    this.left = this.runs[1] ?? 0;
    this.next = 0; // index into ops
  }

  get over() {
    return this.b.frame >= this.frames || this.b.done;
  }

  step() {
    const b = this.b;
    while (this.next < this.ops.length && this.ops[this.next][0] <= b.frame) {
      const [f, kind, arg] = this.ops[this.next++];
      if (f === b.frame) applyOp(b, kind, arg);
    }
    while (this.left <= 0 && this.at + 2 < this.runs.length) {
      this.at += 2;
      this.left = this.runs[this.at + 1];
    }
    const mask = this.left > 0 ? this.runs[this.at] : 0;
    this.left--;
    b.step(maskPad(mask));
  }
}

// Replay a run to its end in `b` (a fresh battle set up as the run's was) and say what happened.
export function replay(b, run) {
  const boss = b.entities.find((e) => e.kind === 'navi');
  const p = new Playback(b, run);
  while (!p.over) p.step();
  // The win and loss banners run on after the last input; let them finish.
  for (let i = 0; i < 600 && !b.done && (b.phase === 'win' || b.phase === 'lose'); i++) b.step({});
  return outcome(b, boss);
}

// What a finished (or abandoned) battle shows: what the leaderboard keeps. `boss`: the boss's body, kept
// from the start (a deleted body leaves the battle's list).
export function outcome(b, boss = b.entities.find((e) => e.kind === 'navi')) {
  return {
    done: b.done,
    won: !!b.result?.won,
    frames: b.frame,
    fightFrames: b.fightFrames,
    seconds: b.fightFrames / 60,
    hp: b.player.hp,
    maxHp: b.player.maxHp,
    bossHp: boss ? Math.max(0, boss.hp) : 0,
    bossMaxHp: boss?.maxHp ?? 0,
    busting: b.result?.won ? b.result.bustingLevel : null,
    hitsTaken: b.stats.hitsTaken,
    counters: b.stats.counters,
  };
}

// ---------------------------------------------------------------- encoding

function encode(nums) {
  const bytes = [];
  for (let n of nums) {
    n = Math.max(0, Math.floor(n));
    while (n >= 0x80) {
      bytes.push((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    bytes.push(n);
  }
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(str) {
  const s = atob(String(str ?? '').replace(/-/g, '+').replace(/_/g, '/'));
  const out = [];
  let n = 0;
  let shift = 1;
  for (let i = 0; i < s.length; i++) {
    const x = s.charCodeAt(i);
    n += (x & 0x7f) * shift;
    if (x & 0x80) shift *= 128;
    else {
      out.push(n);
      n = 0;
      shift = 1;
    }
  }
  if (out.length % 2) out.pop();
  return out;
}
