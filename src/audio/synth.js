// Shared synthesis primitives (pure Web Audio, no sample files).
// Every function takes the BaseAudioContext explicitly, so live playback and OfflineAudioContext
// renders run exactly the same code.

const stores = new WeakMap();
function store(ctx) {
  let s = stores.get(ctx);
  if (!s) stores.set(ctx, (s = { waves: new Map(), bufs: new Map(), seed: 1, metalPeriod: 93 }));
  return s;
}

/** Small deterministic PRNG (xorshift32), floats in [0, 1). */
export function rng(seed = 1) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}

export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

const DUTY = { p12: 0.125, p25: 0.25, p37: 0.375, sq: 0.5 };
// Built-in oscillator types peak at +-1; pulses are built with peak-to-peak 1 like a hardware
// pulse channel. These factors keep a given `v` roughly equally loud across waves.
const LEVEL = { tri: 0.7, sine: 0.6, saw: 0.42 };

/** Band-limited pulse wave with the given duty, peak-to-peak 1 for every duty. */
export function pulseWave(ctx, duty) {
  const s = store(ctx);
  const key = 'p' + duty;
  let w = s.waves.get(key);
  if (!w) {
    const N = 96;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let n = 1; n < N; n++) {
      const k = 2 * Math.PI * n * duty;
      re[n] = Math.sin(k) / (Math.PI * n);
      im[n] = (1 - Math.cos(k)) / (Math.PI * n);
    }
    w = ctx.createPeriodicWave(re, im, { disableNormalization: true });
    s.waves.set(key, w);
  }
  return w;
}

export function makeOsc(ctx, w) {
  const o = ctx.createOscillator();
  if (w === 'tri') o.type = 'triangle';
  else if (w === 'sine') o.type = 'sine';
  else if (w === 'saw') o.type = 'sawtooth';
  else o.setPeriodicWave(pulseWave(ctx, DUTY[w] ?? 0.5));
  return o;
}

export const waveLevel = (w) => LEVEL[w] ?? 1;

/**
 * Looping noise buffers:
 * - white:  plain white noise;
 * - crunch: sample-and-hold noise (8-sample steps); slow playback gives the lo-fi "8-bit explosion" grit;
 * - metal:  a short-mode 15-bit LFSR loop (a ~93-step periodic pattern): pitched, metallic, buzzy.
 */
export function noiseBuffer(ctx, kind = 'white') {
  const s = store(ctx);
  let b = s.bufs.get(kind);
  if (b) return b;
  const sr = ctx.sampleRate;
  let data;
  if (kind === 'metal') {
    const seq = [];
    let reg = 1;
    do {
      const fb = (reg ^ (reg >> 6)) & 1;
      reg = (reg >> 1) | (fb << 14);
      seq.push(reg & 1 ? 0.8 : -0.8);
    } while (reg !== 1 && seq.length < 40000);
    s.metalPeriod = seq.length;
    const reps = Math.max(1, Math.ceil(sr / 4 / seq.length));
    data = new Float32Array(seq.length * reps);
    for (let i = 0; i < data.length; i++) data[i] = seq[i % seq.length];
  } else {
    const r = rng(kind === 'crunch' ? 777 : 12345);
    const hold = kind === 'crunch' ? 8 : 1;
    data = new Float32Array(sr);
    let v = 0;
    for (let i = 0; i < data.length; i++) {
      if (i % hold === 0) v = r() * 2 - 1;
      data[i] = v;
    }
  }
  b = ctx.createBuffer(1, data.length, sr);
  b.getChannelData(0).set(data);
  s.bufs.set(kind, b);
  return b;
}

/** playbackRate that makes the metal LFSR loop sound at `hz`. */
export function metalRate(ctx, hz) {
  noiseBuffer(ctx, 'metal');
  return (hz * store(ctx).metalPeriod) / ctx.sampleRate;
}

/**
 * Automate `param` along `spec`: a number (constant), or [a, b, ...] breakpoints joined by
 * exponential ramps spread evenly over [t, end]. Values must be > 0 for ramps.
 */
export function curve(param, spec, t, end, mul = 1) {
  if (typeof spec === 'number') {
    param.setValueAtTime(spec * mul, t);
    return;
  }
  param.setValueAtTime(spec[0] * mul, t);
  const n = spec.length - 1;
  for (let i = 1; i <= n; i++) param.exponentialRampToValueAtTime(Math.max(spec[i] * mul, 1e-4), t + ((end - t) * i) / n);
}

/** Percussive envelope: linear attack, hold, exponential decay to -60 dB. Returns the end time. */
export function percEnv(param, t, v, a, h, d) {
  const end = t + a + h + d;
  param.setValueAtTime(0, t);
  if (v <= 0) return end;
  param.linearRampToValueAtTime(v, t + a);
  if (h > 0) param.setValueAtTime(v, t + a + h);
  param.exponentialRampToValueAtTime(v * 0.001, end);
  param.linearRampToValueAtTime(0, end + 0.005);
  return end + 0.005;
}

/**
 * ADSR envelope for gated notes: attack a, exponential decay d to sustain s (fraction of v), held
 * until the gate closes, then a linear release r. Returns the time the note is silent.
 */
export function adsrEnv(param, t, gate, v, a, d, s, r) {
  const sus = Math.max(v * s, v * 0.001, 1e-5);
  param.setValueAtTime(0, t);
  const off = t + Math.max(gate, 0.004);
  if (off <= t + a) {
    const peak = (v * (off - t)) / a;
    param.linearRampToValueAtTime(peak, off);
  } else {
    param.linearRampToValueAtTime(v, t + a);
    if (off >= t + a + d) {
      param.exponentialRampToValueAtTime(sus, t + a + d);
      param.setValueAtTime(sus, off);
    } else {
      const x = v * Math.pow(sus / v, (off - t - a) / d);
      param.exponentialRampToValueAtTime(x, off);
    }
  }
  param.linearRampToValueAtTime(0, off + r);
  return off + r;
}

const FILTER_TYPES = { lp: 'lowpass', hp: 'highpass', bp: 'bandpass' };

/** Chain the optional lp/hp/bp filters of `o` after `node`; returns the new chain head. */
export function filters(ctx, node, o, t, end) {
  let head = node;
  for (const key of ['hp', 'bp', 'lp']) {
    const spec = o[key];
    if (spec == null) continue;
    const f = ctx.createBiquadFilter();
    f.type = FILTER_TYPES[key];
    f.Q.value = o.q ?? (key === 'bp' ? 3 : 0.75);
    curve(f.frequency, spec, t, o.fend ?? end);
    head.connect(f);
    head = f;
  }
  return head;
}

function lfo(ctx, param, rate, depth, t, end, delay = 0) {
  const l = ctx.createOscillator();
  l.frequency.value = rate;
  const g = ctx.createGain();
  if (delay > 0) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(depth, t + delay);
  } else g.gain.value = depth;
  l.connect(g);
  g.connect(param);
  l.start(t);
  l.stop(end + 0.05);
}

/** Final stage shared by tone() and noise(): optional tremolo and pan, then into dest. */
function finish(ctx, g, dest, o, t, end) {
  let head = g;
  if (o.trem) {
    const tg = ctx.createGain();
    const depth = o.trem[1];
    tg.gain.value = 1 - depth / 2;
    lfo(ctx, tg.gain, o.trem[0], depth / 2, t, end);
    head.connect(tg);
    head = tg;
  }
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    head.connect(p);
    head = p;
  }
  head.connect(dest);
}

/**
 * One synthesized percussive tone. Times are absolute context seconds; returns the end time.
 *   w      wave: p12 p25 p37 sq tri sine saw
 *   f      Hz, or [a, b, ...] glide breakpoints over `ft` seconds (default: the whole sound)
 *   fs     [[dt, Hz], ...] hard pitch steps (arpeggios)
 *   v a h d  peak gain, attack, hold, exponential decay time
 *   vib    [rateHz, cents, delay]; trem [rateHz, depth]; lp/hp/bp filter Hz or sweep; q; pan; det (cents)
 *   p      pitch multiplier applied to every frequency
 */
export function tone(ctx, dest, t, o) {
  const a = o.a ?? 0.002;
  const h = o.h ?? 0;
  const d = o.d ?? 0.1;
  const p = o.p ?? 1;
  const osc = makeOsc(ctx, o.w || 'sq');
  const g = ctx.createGain();
  const end = percEnv(g.gain, t, (o.v ?? 0.3) * waveLevel(o.w), a, h, d);
  curve(osc.frequency, o.f ?? 440, t, t + (o.ft ?? end - t), p);
  if (o.fs) for (const [dt, hz] of o.fs) osc.frequency.setValueAtTime(hz * p, t + dt);
  if (o.det) osc.detune.value = o.det;
  if (o.vib) lfo(ctx, osc.detune, o.vib[0], o.vib[1], t, end, o.vib[2] ?? 0);
  filters(ctx, osc, o, t, end).connect(g);
  finish(ctx, g, dest, o, t, end);
  osc.start(t);
  osc.stop(end + 0.02);
  return end;
}

/**
 * One noise burst. Same envelope/filter options as tone(), plus:
 *   c      'white' | 'crunch' | 'metal'
 *   rate   playbackRate (number or sweep); for 'metal', `hz` sets the pitch instead
 */
export function noise(ctx, dest, t, o) {
  const a = o.a ?? 0.002;
  const h = o.h ?? 0;
  const d = o.d ?? 0.1;
  const kind = o.c || 'white';
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind);
  src.loop = true;
  const g = ctx.createGain();
  const end = percEnv(g.gain, t, o.v ?? 0.3, a, h, d);
  if (kind === 'metal' && o.hz) {
    const hz = typeof o.hz === 'number' ? [o.hz] : o.hz;
    curve(src.playbackRate, hz.length === 1 ? hz[0] : hz, t, t + (o.ft ?? end - t), metalRate(ctx, 1) * (o.p ?? 1));
  } else {
    curve(src.playbackRate, o.rate ?? 1, t, t + (o.ft ?? end - t), o.p ?? 1);
  }
  filters(ctx, src, o, t, end).connect(g);
  finish(ctx, g, dest, o, t, end);
  const s = store(ctx);
  s.seed = (s.seed * 16807) % 2147483647;
  src.start(t, (s.seed / 2147483647) * src.buffer.duration * 0.9);
  src.stop(end + 0.02);
  return end;
}
