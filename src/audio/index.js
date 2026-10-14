// CyberMetal GridWars audio: every sound is synthesized at runtime with Web Audio (no files).
//
//   audio.unlock()                     first user gesture: create/resume the AudioContext (repeat-safe)
//   audio.play(name, { volume })       SFX by name; unknown names are ignored; repeats within 25 ms merge
//   audio.music(track)                 'title' | 'menu' | 'battle' | 'boss' | 'final' | 'victory' | 'gameover' | null
//   audio.setVolume({ master, sfx, music }), audio.setMuted(bool), audio.muted
//   audio.renderOffline(kind, name, seconds[, { from }])  Promise<AudioBuffer|null> via OfflineAudioContext
//
// Graph: sfx bus + music bus -> master gain -> compressor -> safety soft-clipper -> destination.
// Nothing here ever throws: without Web Audio (Node, old browsers) every call is a no-op.
import { SFX, ALIASES, VARY, renderSfx } from './sfx.js';
import { TRACKS } from './tracks/index.js';
import { Sequencer, compiled } from './sequencer.js';

const LOOKAHEAD = 0.15; // seconds scheduled ahead of the audio clock
const TICK_MS = 25; // scheduler interval
const THROTTLE_MS = 25; // same SFX name within this window plays once
const MAX_VOICES = 32; // concurrent SFX cap
const FADE_OUT = 0.25; // music change: old track fade
const TRIM = { master: 0.8, sfx: 1, music: 0.8 }; // fixed headroom under the user volumes
const PREROLL = 0.3; // offline renders: silent lead-in so the compressor is settled (trimmed off)

export const SFX_NAMES = Object.keys(SFX);
export const TRACK_NAMES = Object.keys(TRACKS);

const g = typeof globalThis !== 'undefined' ? globalThis : {};
const AudioCtx = () => g.AudioContext || g.webkitAudioContext || null;
const OfflineCtx = () => g.OfflineAudioContext || g.webkitOfflineAudioContext || null;
const nowMs = () => (g.performance && g.performance.now ? g.performance.now() : Date.now());

const state = {
  ctx: null,
  nodes: null,
  muted: false,
  hidden: false,
  vol: { master: 1, sfx: 0.8, music: 0.55 },
  last: new Map(), // sfx name -> last play time (ms)
  voices: [], // end times of sounding SFX
  track: null, // requested track name
  seq: null, // current Sequencer
  seqId: 0, // increments each time a track (re)starts
  timer: null,
};

let safetyCurve = null;
function safety() {
  if (!safetyCurve) {
    // Linear up to 0.85, then a tanh knee that never exceeds ~0.96: a last-resort clip guard.
    const n = 2049;
    safetyCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      safetyCurve[i] = a <= 0.85 ? x : Math.sign(x) * (0.85 + 0.14 * Math.tanh((a - 0.85) / 0.14));
    }
  }
  return safetyCurve;
}

function buildChain(ctx, vol, muted) {
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : vol.master * TRIM.master;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.knee.value = 6;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  const clip = ctx.createWaveShaper();
  clip.curve = safety();
  master.connect(comp);
  comp.connect(clip);
  clip.connect(ctx.destination);
  const sfx = ctx.createGain();
  sfx.gain.value = vol.sfx * TRIM.sfx;
  sfx.connect(master);
  const music = ctx.createGain();
  music.gain.value = vol.music * TRIM.music;
  music.connect(master);
  return { master, comp, clip, sfx, music };
}

function applyGains() {
  const { ctx, nodes, vol } = state;
  if (!ctx || !nodes) return;
  const t = ctx.currentTime;
  nodes.master.gain.setTargetAtTime(state.muted ? 0 : vol.master * TRIM.master, t, 0.015);
  nodes.sfx.gain.setTargetAtTime(vol.sfx * TRIM.sfx, t, 0.015);
  nodes.music.gain.setTargetAtTime(vol.music * TRIM.music, t, 0.015);
}

const resolveSfx = (name) => {
  const key = typeof name === 'string' ? (SFX[name] ? name : ALIASES[name]) : null;
  return key && SFX[key] ? key : null;
};

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function tick() {
  try {
    const s = state.seq;
    if (!s || !state.ctx) return stopTimer();
    s.advance(state.ctx.currentTime + LOOKAHEAD);
    if (s.finished) stopTimer(); // a jingle has nothing left to schedule
  } catch {
    stopTimer();
  }
}

function startTrack(name) {
  const ctx = state.ctx;
  if (state.seq) {
    state.seq.stop(FADE_OUT);
    state.seq = null;
  }
  if (!name) return stopTimer();
  const seq = new Sequencer(ctx, state.nodes.music, TRACKS[name], ctx.currentTime + 0.06, { live: true, fadeIn: 0.02 });
  state.seq = seq;
  state.seqId++;
  seq.advance(ctx.currentTime + LOOKAHEAD);
  if (!state.timer) state.timer = setInterval(tick, TICK_MS);
}

function quietly(p) {
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function watchVisibility() {
  const doc = g.document;
  if (!doc || !doc.addEventListener) return;
  doc.addEventListener('visibilitychange', () => {
    const ctx = state.ctx;
    if (!ctx) return;
    try {
      state.hidden = !!doc.hidden;
      if (doc.hidden) {
        if (ctx.state === 'running') quietly(ctx.suspend());
      } else quietly(ctx.resume());
    } catch {
      /* ignore */
    }
  });
}

function startRendering(ctx) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (buf) => {
      if (!done) {
        done = true;
        resolve(buf || null);
      }
    };
    ctx.oncomplete = (e) => finish(e && e.renderedBuffer);
    try {
      const p = ctx.startRendering();
      if (p && typeof p.then === 'function') p.then(finish, () => finish(null));
    } catch {
      finish(null);
    }
  });
}

/** Timing facts about a track (for tests and tools): bpm, intro/loop length, channel lengths. */
export function trackInfo(name) {
  const def = TRACKS[name];
  if (!def) return null;
  try {
    const c = compiled(def);
    return {
      name,
      title: def.title,
      key: def.key,
      bpm: def.bpm,
      loop: def.loop !== false,
      introSec: c.introSec,
      loopSec: c.loopSec,
      introBars: c.introTicks / 96,
      loopBars: c.loopTicks / 96,
      channels: c.chans.map((ch) => ch.name),
      mismatch: c.mismatch,
    };
  } catch (e) {
    return { name, error: String(e && e.message ? e.message : e) };
  }
}

export const audio = {
  unlock() {
    try {
      if (!state.ctx) {
        const AC = AudioCtx();
        if (!AC) return;
        let ctx;
        try {
          ctx = new AC({ latencyHint: 'interactive' });
        } catch {
          ctx = new AC();
        }
        state.ctx = ctx;
        state.nodes = buildChain(ctx, state.vol, state.muted);
        watchVisibility();
        try {
          // A silent one-sample buffer started inside the gesture unlocks older iOS Safari.
          const src = ctx.createBufferSource();
          src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          src.connect(ctx.destination);
          src.start(0);
        } catch {
          /* fine */
        }
        if (state.track) startTrack(state.track);
      }
      if (state.ctx.state !== 'running' && !state.hidden) quietly(state.ctx.resume());
    } catch {
      /* never throw */
    }
  },

  play(name, opts = {}) {
    try {
      const ctx = state.ctx;
      if (!ctx || !state.nodes || ctx.state !== 'running') return;
      const key = resolveSfx(name);
      if (!key) return;
      const now = nowMs();
      const last = state.last.get(key);
      if (last !== undefined && now - last < THROTTLE_MS) return;
      state.last.set(key, now);
      const t = ctx.currentTime;
      state.voices = state.voices.filter((e) => e > t);
      if (state.voices.length >= MAX_VOICES) return;
      const vary = VARY[key] || 0;
      const pitch = opts && Number.isFinite(opts.pitch) ? opts.pitch : vary ? 1 + (Math.random() * 2 - 1) * vary : 1;
      const volume = opts && Number.isFinite(opts.volume) ? opts.volume : 1;
      const r = renderSfx(ctx, state.nodes.sfx, key, t + 0.005, { volume, pitch });
      if (!r) return;
      state.voices.push(r.end);
      setTimeout(() => {
        try {
          r.node.disconnect();
        } catch {
          /* gone */
        }
      }, (r.end - t + 0.3) * 1000);
    } catch {
      /* never throw */
    }
  },

  music(track) {
    try {
      const name = track == null ? null : String(track);
      if (name !== null && !TRACKS[name]) return;
      if (name === state.track) {
        // Same track: never restart a playing one. A finished jingle may be played again.
        if (name === null || !state.ctx || (state.seq && state.seq.playing)) return;
      }
      state.track = name;
      if (state.ctx && state.nodes) startTrack(name);
    } catch {
      /* never throw */
    }
  },

  setVolume(v = {}) {
    try {
      if (!v || typeof v !== 'object') return;
      for (const k of ['master', 'sfx', 'music']) {
        if (!(k in v)) continue;
        const x = Number(v[k]);
        if (Number.isFinite(x)) state.vol[k] = Math.max(0, Math.min(1, x));
      }
      applyGains();
    } catch {
      /* never throw */
    }
  },

  setMuted(m) {
    try {
      state.muted = !!m;
      applyGains();
    } catch {
      /* never throw */
    }
  },

  get muted() {
    return state.muted;
  },

  /** Name of the requested music track (or null). */
  get track() {
    return state.track;
  },

  /**
   * Snapshot for tools/tests: context state and time, current track, whether it is playing, a counter
   * of track starts, sounding SFX voices, and the output level (an analyser is attached on first call).
   */
  debug() {
    const ctx = state.ctx;
    const out = { available: !!AudioCtx(), state: ctx ? ctx.state : 'none', time: ctx ? ctx.currentTime : 0, track: state.track };
    try {
      out.playing = !!(state.seq && state.seq.playing);
      out.seqId = state.seqId;
      out.voices = ctx ? state.voices.filter((e) => e > ctx.currentTime).length : 0;
      if (ctx && state.nodes) {
        if (!state.nodes.meter) {
          state.nodes.meter = ctx.createAnalyser();
          state.nodes.meter.fftSize = 2048;
          state.nodes.clip.connect(state.nodes.meter);
        }
        const buf = new Float32Array(state.nodes.meter.fftSize);
        state.nodes.meter.getFloatTimeDomainData(buf);
        let sum = 0;
        let peak = 0;
        for (const x of buf) {
          sum += x * x;
          peak = Math.max(peak, Math.abs(x));
        }
        out.level = { rms: Math.sqrt(sum / buf.length), peak };
      }
    } catch {
      /* best effort */
    }
    return out;
  },

  sfxNames: SFX_NAMES,
  trackNames: TRACK_NAMES,
  trackInfo,

  /**
   * Render a sound offline (for tests): kind 'sfx' | 'music'. Uses the same bus/compressor chain and
   * the same Sequencer as live playback (volumes as currently set; mute ignored).
   * opts.from: start a music render this many seconds into the song.
   * Resolves to an AudioBuffer, or null when unavailable or the name is unknown.
   */
  renderOffline(kind, name, seconds, opts = {}) {
    try {
      const OAC = OfflineCtx();
      if (!OAC) return Promise.resolve(null);
      const dur = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 600) : kind === 'music' ? 8 : 1.5;
      const sr = (opts && opts.sampleRate) || 44100;
      const isMusic = kind === 'music';
      const key = isMusic ? (TRACKS[name] ? name : null) : kind === 'sfx' ? resolveSfx(name) : null;
      if (!key) return Promise.resolve(null);
      // The compressor starts out fully attenuated and settles within ~0.2 s; live playback never
      // hears that (the context runs continuously), so render a silent pre-roll and trim it off.
      const len = Math.ceil(sr * dur);
      const pre = Math.ceil(sr * PREROLL);
      const ctx = new OAC(2, len + pre, sr);
      const nodes = buildChain(ctx, state.vol, false);
      const t0 = pre / sr;
      if (isMusic) new Sequencer(ctx, nodes.music, TRACKS[key], t0, { from: (opts && opts.from) || 0 }).advance(t0 + dur);
      else renderSfx(ctx, nodes.sfx, key, t0, { volume: opts && Number.isFinite(opts.volume) ? opts.volume : 1 });
      return startRendering(ctx).then((buf) => {
        if (!buf) return null;
        const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
        for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(pre, pre + len));
        return out;
      }).catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  },
};

// Belt and braces: unlock on the first gesture even if the shell forgets to.
if (g.addEventListener && g.document) {
  const auto = () => {
    audio.unlock();
    if (state.ctx && state.ctx.state === 'running') {
      for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) g.removeEventListener(ev, auto, true);
    }
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) g.addEventListener(ev, auto, true);
}

export default audio;
