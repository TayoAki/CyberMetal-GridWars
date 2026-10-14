// Music voices: gated pulse/triangle instruments (ADSR, delayed vibrato, chiptune arpeggio chords,
// slurs) and a synthesized drum kit. Used by sequencer.js for both live and offline playback.
import { makeOsc, waveLevel, adsrEnv, midiHz, tone, noise, curve } from './synth.js';

// w: wave; v: level; a d s r: envelope; vib: [rateHz, cents, delaySec]; lp: lowpass Hz (or sweep);
// layer: a second oscillator { w, v (relative), mul (frequency ratio), det (cents) } under one envelope;
// arpRate: seconds per step for {chord} arpeggios.
export const INSTRUMENTS = {
  lead: { w: 'p25', v: 0.15, a: 0.006, d: 0.22, s: 0.62, r: 0.06, vib: [5.6, 16, 0.16] },
  lead12: { w: 'p12', v: 0.17, a: 0.005, d: 0.2, s: 0.6, r: 0.05, vib: [5.6, 16, 0.16] },
  leadsq: { w: 'sq', v: 0.12, a: 0.008, d: 0.25, s: 0.6, r: 0.07, vib: [5.2, 14, 0.18] },
  hero: { w: 'p25', v: 0.14, a: 0.01, d: 0.3, s: 0.7, r: 0.08, vib: [5.4, 18, 0.2], layer: { w: 'p12', v: 0.4, mul: 2, det: 6 } },
  pluck: { w: 'p25', v: 0.12, a: 0.002, d: 0.16, s: 0, r: 0.02 },
  pluck12: { w: 'p12', v: 0.13, a: 0.002, d: 0.13, s: 0, r: 0.02 },
  stab: { w: 'p12', v: 0.09, a: 0.002, d: 0.09, s: 0.2, r: 0.02, arpRate: 1 / 40 },
  arp: { w: 'p12', v: 0.085, a: 0.002, d: 0.3, s: 0.45, r: 0.03, arpRate: 1 / 30 },
  pad: { w: 'p37', v: 0.06, a: 0.09, d: 0.6, s: 0.75, r: 0.25, lp: 2400, vib: [4.4, 9, 0.25] },
  choir: { w: 'tri', v: 0.16, a: 0.18, d: 0.8, s: 0.8, r: 0.35, vib: [4.8, 12, 0.3], layer: { w: 'p37', v: 0.22, mul: 1, det: 9 } },
  bell: { w: 'sine', v: 0.18, a: 0.002, d: 0.7, s: 0, r: 0.12, layer: { w: 'tri', v: 0.35, mul: 2 } },
  keys: { w: 'tri', v: 0.18, a: 0.003, d: 0.35, s: 0.25, r: 0.08, layer: { w: 'p12', v: 0.18, mul: 1, det: 5 } },
  bass: { w: 'tri', v: 0.36, a: 0.002, d: 0.1, s: 0.85, r: 0.02, layer: { w: 'p12', v: 0.12, mul: 1 } },
  sub: { w: 'tri', v: 0.4, a: 0.004, d: 0.2, s: 0.9, r: 0.05 },
  fat: { w: 'saw', v: 0.12, a: 0.004, d: 0.2, s: 0.7, r: 0.05, lp: 1200, layer: { w: 'tri', v: 1.8, mul: 1 } },
  epic: { w: 'p25', v: 0.14, a: 0.012, d: 0.3, s: 0.72, r: 0.1, vib: [5.2, 18, 0.22], layer: { w: 'sq', v: 0.35, mul: 0.5, det: 4 } },
};

function vibrato(ctx, osc, vib, t, end) {
  const l = ctx.createOscillator();
  l.frequency.value = vib[0];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0, t + vib[2]);
  g.gain.linearRampToValueAtTime(vib[1], t + vib[2] + 0.12);
  l.connect(g);
  g.connect(osc.detune);
  l.start(t);
  l.stop(end + 0.05);
}

function voice(ctx, dest, w, ev, t, end, gate, spt, mul, inst, main) {
  const osc = makeOsc(ctx, w);
  const f = osc.frequency;
  const hz = (m) => midiHz(m) * mul;
  f.setValueAtTime(hz(ev.midi), t);
  if (ev.pitches) for (const [dt, m] of ev.pitches.slice(1)) f.setTargetAtTime(hz(m), t + dt * spt, 0.012);
  if (ev.arp && ev.arp.length > 1) {
    const step = inst.arpRate ?? 1 / 30;
    for (let k = 1, tt = t + step; tt < t + gate; k++, tt += step) f.setValueAtTime(hz(ev.midi + ev.arp[k % ev.arp.length]), tt);
  }
  if (main && inst.vib && gate > inst.vib[2] + 0.05) vibrato(ctx, osc, inst.vib, t, end);
  let head = osc;
  const lp = main ? inst.lp : null;
  if (lp) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    curve(fl.frequency, lp, t, end);
    osc.connect(fl);
    head = fl;
  }
  head.connect(dest);
  osc.start(t);
  osc.stop(end + 0.02);
  return osc;
}

/** Play one compiled note event at time `t`. Returns the time it falls silent. */
export function playNote(ctx, dest, ev, t, spt, chanVol, instName) {
  const inst = INSTRUMENTS[instName] || INSTRUMENTS.lead;
  const gate = ((ev.ticks * ev.q) / 8) * spt;
  const v = inst.v * waveLevel(inst.w) * chanVol * (ev.vol / 12);
  const g = ctx.createGain();
  const end = adsrEnv(g.gain, t, gate, v, inst.a, inst.d, inst.s, inst.r);
  voice(ctx, g, inst.w, ev, t, end, gate, spt, 1, inst, true);
  const L = inst.layer;
  if (L) {
    const lg = ctx.createGain();
    lg.gain.value = (L.v * waveLevel(L.w)) / waveLevel(inst.w);
    const o = voice(ctx, lg, L.w, ev, t, end, gate, spt, L.mul ?? 1, inst, false);
    if (L.det) o.detune.value = L.det;
    lg.connect(g);
  }
  g.connect(dest);
  return end;
}

// Drum kit. Each takes (ctx, dest, t, v) with v the hit's volume (1 = nominal).
export const DRUMS = {
  // kick
  b: (c, d, t, v) => {
    tone(c, d, t, { w: 'sine', f: [170, 46], ft: 0.08, v: 0.95 * v, h: 0.02, d: 0.2 });
    tone(c, d, t, { w: 'tri', f: [480, 70], ft: 0.025, v: 0.3 * v, d: 0.03 });
  },
  // deep boss kick
  k: (c, d, t, v) => {
    tone(c, d, t, { w: 'sine', f: [140, 34], ft: 0.12, v: 1.0 * v, h: 0.03, d: 0.35 });
    noise(c, d, t, { c: 'crunch', rate: 0.5, v: 0.18 * v, d: 0.03, lp: 2500 });
  },
  // snare
  s: (c, d, t, v) => {
    noise(c, d, t, { c: 'crunch', rate: 1, v: 0.4 * v, d: 0.14, hp: 1100 });
    tone(c, d, t, { w: 'tri', f: [240, 150], ft: 0.05, v: 0.42 * v, d: 0.08 });
  },
  // crunchy chip snare (brighter, longer)
  n: (c, d, t, v) => {
    noise(c, d, t, { c: 'crunch', rate: 0.8, v: 0.36 * v, d: 0.2, bp: 2200, q: 0.8 });
    noise(c, d, t, { v: 0.16 * v, d: 0.12, hp: 5000 });
    tone(c, d, t, { w: 'sq', f: [330, 160], ft: 0.04, v: 0.12 * v, d: 0.05 });
  },
  // closed / open hat, crash
  h: (c, d, t, v) => noise(c, d, t, { v: 0.15 * v, d: 0.035, hp: 7500 }),
  o: (c, d, t, v) => noise(c, d, t, { v: 0.12 * v, d: 0.22, hp: 6500 }),
  c: (c, d, t, v) => {
    noise(c, d, t, { v: 0.17 * v, d: 1.0, hp: 3500 });
    noise(c, d, t, { c: 'metal', hz: 3400, v: 0.05 * v, d: 0.6, hp: 5000 });
  },
  // toms: low, mid, high
  t: (c, d, t, v) => {
    tone(c, d, t, { w: 'tri', f: [190, 85], ft: 0.15, v: 0.55 * v, d: 0.22 });
    noise(c, d, t, { c: 'crunch', rate: 0.4, v: 0.1 * v, d: 0.05, lp: 1200 });
  },
  m: (c, d, t, v) => {
    tone(c, d, t, { w: 'tri', f: [260, 120], ft: 0.13, v: 0.5 * v, d: 0.2 });
    noise(c, d, t, { c: 'crunch', rate: 0.5, v: 0.1 * v, d: 0.05, lp: 1500 });
  },
  u: (c, d, t, v) => {
    tone(c, d, t, { w: 'tri', f: [350, 170], ft: 0.11, v: 0.45 * v, d: 0.18 });
    noise(c, d, t, { c: 'crunch', rate: 0.6, v: 0.1 * v, d: 0.05, lp: 1800 });
  },
  // clap, rim click, riser sweep
  x: (c, d, t, v) => {
    for (const dt of [0, 0.011, 0.022]) noise(c, d, t + dt, { v: 0.26 * v, d: 0.02, bp: 1500, q: 1.5 });
    noise(c, d, t + 0.033, { v: 0.26 * v, d: 0.13, bp: 1500, q: 1.5 });
  },
  i: (c, d, t, v) => {
    tone(c, d, t, { w: 'p12', f: 1700, v: 0.12 * v, d: 0.015 });
    noise(c, d, t, { v: 0.1 * v, d: 0.02, hp: 4000 });
  },
  z: (c, d, t, v) => noise(c, d, t, { v: 0.12 * v, a: 0.3, d: 0.04, hp: [700, 6000] }),
};

export function playDrum(ctx, dest, key, t, v) {
  const fn = DRUMS[key];
  if (fn) fn(ctx, dest, t, v);
}
