// Sound effects: every sound is a small recipe of tone()/noise() layers (see synth.js for options).
// `x.tone(o, dt)` / `x.noise(o, dt)` start a layer `dt` seconds after the sound's start time;
// `x.r()` is a PRNG seeded per sound name, so random-looking sounds are the same every time.
import { tone, noise, rng } from './synth.js';

const boom = (x, { v = 0.42, rate = [0.6, 0.15], lp = [4500, 200], d = 0.5, sub = [130, 36], sv = 0.55, dt = 0 } = {}) => {
  x.noise({ c: 'crunch', rate, v, d, lp }, dt);
  x.tone({ w: 'sine', f: sub, ft: d * 0.5, v: sv, h: 0.03, d: d * 0.7 }, dt);
};

export const SFX = {
  // --- buster and charge ---------------------------------------------------------------------
  buster: (x) => {
    x.tone({ w: 'p12', f: [1760, 680], v: 0.24, d: 0.07 });
    x.tone({ w: 'sq', f: [3500, 2400], v: 0.05, d: 0.025 });
  },
  charge: (x) => {
    x.tone({ w: 'p25', f: [180, 760], v: 0.11, a: 0.03, h: 0.32, d: 0.14, trem: [28, 0.5], lp: 2600 });
    x.tone({ w: 'tri', f: [90, 380], v: 0.18, a: 0.03, h: 0.32, d: 0.14 });
    x.noise({ v: 0.03, a: 0.2, h: 0.12, d: 0.12, bp: [800, 3000], q: 4 });
  },
  chargefull: (x) => {
    [1568, 2093, 2637, 3136].forEach((f, i) => x.tone({ w: i % 2 ? 'p25' : 'sq', f, v: 0.1, d: 0.28 - i * 0.03 }, i * 0.028));
    x.noise({ c: 'metal', hz: 2600, v: 0.04, d: 0.18, hp: 4000 }, 0.02);
  },
  chargeshot: (x) => {
    x.tone({ w: 'saw', f: [700, 70], ft: 0.32, v: 0.3, d: 0.38, lp: [5000, 400] });
    x.tone({ w: 'sine', f: [160, 38], ft: 0.25, v: 0.6, h: 0.04, d: 0.32 });
    x.noise({ c: 'crunch', rate: [1, 0.25], v: 0.36, d: 0.42, lp: [7000, 300] });
    x.tone({ w: 'p12', f: [2400, 600], v: 0.1, d: 0.08 });
  },

  // --- shots and weapons -----------------------------------------------------------------------
  cannon: (x) => {
    boom(x, { v: 0.42, rate: [0.7, 0.2], lp: [4500, 200], d: 0.45, sub: [150, 40], sv: 0.62 });
    x.tone({ w: 'sq', f: [520, 90], ft: 0.06, v: 0.14, d: 0.07 });
  },
  airshot: (x) => {
    x.noise({ v: 0.22, a: 0.04, d: 0.12, bp: [500, 3500], q: 2.5 });
    x.tone({ w: 'sine', f: [1100, 260], v: 0.4, d: 0.07 }, 0.07);
    x.tone({ w: 'p25', f: [800, 300], v: 0.06, d: 0.05 }, 0.07);
  },
  gun: (x) => {
    x.noise({ v: 0.3, d: 0.07, hp: 1800 });
    x.tone({ w: 'sq', f: [1100, 180], v: 0.16, d: 0.06 });
    x.noise({ c: 'crunch', rate: 0.5, v: 0.18, d: 0.09, lp: 2500 });
  },
  bubble: (x) => {
    x.tone({ w: 'sine', f: [280, 1300], v: 0.42, d: 0.08 });
    x.tone({ w: 'sine', f: [420, 1800], v: 0.3, d: 0.06 }, 0.06);
    x.tone({ w: 'tri', f: [600, 2000], v: 0.12, d: 0.05 }, 0.11);
    x.noise({ v: 0.05, d: 0.04, bp: 2500, q: 6 });
  },
  flame: (x) => {
    x.noise({ c: 'crunch', rate: [0.35, 0.6, 0.3], v: 0.34, a: 0.03, h: 0.12, d: 0.4, lp: [900, 2600, 700], q: 1.2 });
    x.noise({ v: 0.12, a: 0.02, h: 0.1, d: 0.3, bp: [1500, 3500, 1200], q: 1.5, trem: [18, 0.6] });
    x.tone({ w: 'saw', f: [70, 110, 60], v: 0.16, a: 0.03, h: 0.1, d: 0.35, lp: 500, vib: [9, 60] });
  },
  zap: (x) => {
    const fs = [];
    for (let i = 0; i < 14; i++) fs.push([i * 0.018, 300 + x.r() * 2600]);
    x.tone({ w: 'sq', f: 1200, fs, v: 0.13, h: 0.18, d: 0.08, hp: 300 });
    x.noise({ v: 0.14, h: 0.16, d: 0.08, hp: 3000, trem: [45, 1] });
    x.tone({ w: 'p12', f: [2200, 700], v: 0.08, d: 0.25, trem: [60, 0.9] });
  },
  sword: (x) => {
    x.noise({ v: 0.3, a: 0.03, d: 0.13, bp: [900, 6500, 2500], q: 2.2 });
    x.tone({ w: 'p12', f: [600, 2600], v: 0.05, a: 0.02, d: 0.1 });
    x.noise({ c: 'metal', hz: 2900, v: 0.04, d: 0.12, hp: 3500 }, 0.07);
  },
  shockwave: (x) => {
    x.noise({ c: 'crunch', rate: [0.18, 0.12], v: 0.4, a: 0.02, h: 0.42, d: 0.25, lp: [700, 300], trem: [11, 0.8] });
    x.tone({ w: 'tri', f: [90, 55], v: 0.32, a: 0.02, h: 0.4, d: 0.25, trem: [11, 0.6] });
    x.tone({ w: 'sine', f: [140, 40], ft: 0.12, v: 0.4, d: 0.18 });
  },
  punch: (x) => {
    x.tone({ w: 'sine', f: [220, 55], ft: 0.08, v: 0.6, d: 0.14 });
    x.noise({ c: 'crunch', rate: 0.6, v: 0.3, d: 0.08, lp: 2200 });
    x.tone({ w: 'sq', f: [300, 90], v: 0.1, d: 0.05 });
  },
  hammer: (x) => {
    x.noise({ c: 'metal', hz: [1150, 1100], v: 0.2, d: 0.55, bp: 1400, q: 2 });
    x.tone({ w: 'sq', f: 523, v: 0.08, d: 0.45, det: 12 });
    x.tone({ w: 'p25', f: 831, v: 0.06, d: 0.35 });
    x.tone({ w: 'sine', f: [130, 38], ft: 0.12, v: 0.6, d: 0.25 });
    x.noise({ c: 'crunch', rate: 0.5, v: 0.3, d: 0.1, lp: 3000 });
  },
  throw: (x) => {
    x.noise({ v: 0.2, a: 0.05, d: 0.1, bp: [500, 2600], q: 3 });
    x.tone({ w: 'tri', f: [300, 700], v: 0.1, a: 0.03, d: 0.08 });
  },
  wind: (x) => {
    x.noise({ v: 0.2, a: 0.15, h: 0.25, d: 0.3, bp: [400, 1400, 600], q: 3 });
    x.noise({ v: 0.1, a: 0.2, h: 0.2, d: 0.3, bp: [1500, 900, 2000], q: 5, trem: [5, 0.5] });
  },
  yoyo: (x) => {
    x.tone({ w: 'p25', f: [500, 900, 500], v: 0.08, h: 0.25, d: 0.12, vib: [16, 250], lp: 2500 });
    x.noise({ v: 0.08, h: 0.25, d: 0.12, bp: 1800, q: 4, trem: [16, 0.9] });
  },
  lance: (x) => {
    x.noise({ v: 0.22, d: 0.1, hp: [800, 5000] });
    x.tone({ w: 'saw', f: [250, 1600], ft: 0.07, v: 0.15, d: 0.12, lp: 4000 });
    x.noise({ c: 'metal', hz: 2400, v: 0.08, d: 0.2, hp: 3000 }, 0.07);
    x.tone({ w: 'sine', f: 2900, v: 0.1, d: 0.18 }, 0.07);
  },
  boomer: (x) => {
    x.noise({ v: 0.16, a: 0.05, h: 0.25, d: 0.15, bp: [700, 2200, 700], q: 4, trem: [12, 0.85] });
    x.tone({ w: 'tri', f: [300, 600, 280], v: 0.12, a: 0.05, h: 0.25, d: 0.15, trem: [12, 0.7] });
  },
  wave: (x) => {
    x.noise({ v: 0.24, a: 0.12, h: 0.18, d: 0.35, lp: [300, 2400, 500], q: 2 });
    x.noise({ c: 'crunch', rate: [0.2, 0.4, 0.15], v: 0.15, a: 0.1, h: 0.15, d: 0.3, lp: 1500 });
    [0.05, 0.16, 0.27].forEach((dt, i) => x.tone({ w: 'sine', f: [250 + i * 90, 800 + i * 200], v: 0.15, d: 0.07 }, dt));
  },
  dash: (x) => {
    x.noise({ v: 0.2, d: 0.13, bp: [2500, 500], q: 2 });
    x.tone({ w: 'p12', f: [500, 1400], v: 0.07, d: 0.07 });
  },
  claw: (x) => {
    for (let i = 0; i < 3; i++) {
      x.noise({ v: 0.2, a: 0.01, d: 0.05, bp: [5000, 1800], q: 3 }, i * 0.05);
      x.tone({ w: 'saw', f: [1800, 900], v: 0.05, d: 0.04 }, i * 0.05);
    }
  },
  flash: (x) => {
    x.noise({ v: 0.3, d: 0.4, hp: [2000, 6000] });
    x.tone({ w: 'sq', f: [3200, 700], v: 0.1, d: 0.3, trem: [50, 0.9] });
    x.noise({ c: 'crunch', rate: 1, v: 0.2, d: 0.2, hp: 1500 });
    x.tone({ w: 'sine', f: [180, 50], v: 0.35, d: 0.2 });
  },
  beam: (x) => {
    x.tone({ w: 'sq', f: 880, v: 0.09, a: 0.02, h: 0.4, d: 0.15, vib: [28, 40] });
    x.tone({ w: 'saw', f: 886, v: 0.12, a: 0.02, h: 0.4, d: 0.15, lp: 3000 });
    x.noise({ v: 0.08, a: 0.02, h: 0.4, d: 0.15, bp: 2500, q: 2, trem: [30, 0.6] });
  },
  laser: (x) => {
    x.tone({ w: 'p12', f: [2800, 280], v: 0.16, d: 0.16 });
    x.tone({ w: 'sq', f: [1400, 140], v: 0.07, d: 0.14, det: 20 });
  },
  meteor: (x) => {
    x.tone({ w: 'sine', f: [2400, 300], ft: 0.5, v: 0.14, a: 0.1, h: 0.3, d: 0.12 });
    x.noise({ v: 0.1, a: 0.3, h: 0.1, d: 0.1, bp: [3000, 500], q: 2 });
    boom(x, { v: 0.42, rate: [0.5, 0.1], lp: [4500, 200], d: 0.5, sub: [120, 30], sv: 0.55, dt: 0.5 });
  },
  ice: (x) => {
    for (let i = 0; i < 6; i++) x.tone({ w: 'sine', f: 2600 + x.r() * 3000, v: 0.09, d: 0.12 }, i * 0.035);
    x.noise({ v: 0.14, a: 0.02, d: 0.35, hp: [3000, 8000] });
    x.noise({ c: 'crunch', rate: 1.3, v: 0.08, d: 0.25, hp: 4000, trem: [35, 0.9] });
  },
  roar: (x) => {
    x.tone({ w: 'saw', f: [140, 170, 90], v: 0.22, a: 0.08, h: 0.35, d: 0.35, lp: [500, 1800, 400], vib: [9, 90] });
    x.tone({ w: 'sq', f: [70, 85, 45], v: 0.1, a: 0.08, h: 0.35, d: 0.35, lp: 900 });
    x.noise({ c: 'crunch', rate: [0.25, 0.4, 0.15], v: 0.24, a: 0.08, h: 0.3, d: 0.35, lp: 1600, trem: [24, 0.6] });
  },

  // --- impacts, damage and deletion ------------------------------------------------------------
  explode: (x) => {
    boom(x, { v: 0.45, rate: [0.5, 0.12], lp: [5000, 180], d: 0.55, sub: [110, 32], sv: 0.55 });
    x.noise({ v: 0.12, d: 0.12, hp: 2000 });
  },
  bigexplode: (x) => {
    boom(x, { v: 0.45, rate: [0.45, 0.08], lp: [5000, 150], d: 0.9, sub: [90, 24], sv: 0.6 });
    x.noise({ c: 'crunch', rate: [0.3, 0.06], v: 0.35, d: 0.85, lp: [2500, 120] }, 0.12);
    x.noise({ v: 0.15, d: 0.2, hp: 1800 });
    x.tone({ w: 'sq', f: [400, 60], v: 0.08, d: 0.3, lp: 1200 }, 0.12);
  },
  hit: (x) => {
    x.noise({ c: 'crunch', rate: 1, v: 0.3, d: 0.06, hp: 900 });
    x.tone({ w: 'sq', f: [700, 180], v: 0.13, d: 0.07 });
  },
  hurt: (x) => {
    x.tone({ w: 'p25', f: [950, 260], v: 0.2, d: 0.2, vib: [30, 80] });
    x.noise({ c: 'crunch', rate: 0.8, v: 0.22, d: 0.1, lp: 3000 });
    x.tone({ w: 'sq', f: [480, 130], v: 0.1, d: 0.15 }, 0.03);
  },
  delete: (x) => {
    x.noise({ c: 'crunch', rate: [0.5, 0.2], v: 0.3, d: 0.5, lp: [3500, 400], trem: [22, 0.8] });
    [1319, 1047, 880, 698, 587].forEach((f, i) => x.tone({ w: 'p25', f, v: 0.1, d: 0.1 }, 0.04 + i * 0.055));
    x.tone({ w: 'sine', f: [120, 40], v: 0.35, d: 0.2 });
  },
  playerdelete: (x) => {
    x.tone({ w: 'sq', f: [1400, 50], ft: 1.1, v: 0.16, h: 0.3, d: 0.9, vib: [7, 50], lp: [6000, 500] });
    x.tone({ w: 'p12', f: [1050, 40], ft: 1.1, v: 0.1, h: 0.3, d: 0.9, det: -30 });
    x.noise({ c: 'crunch', rate: [0.4, 0.06], v: 0.4, d: 1.1, lp: [4500, 150] }, 0.05);
    x.tone({ w: 'sine', f: [100, 25], ft: 0.8, v: 0.5, h: 0.1, d: 1.0 });
  },
  thud: (x) => {
    x.tone({ w: 'tri', f: [130, 45], ft: 0.12, v: 0.5, d: 0.18 });
    x.noise({ c: 'crunch', rate: 0.3, v: 0.25, d: 0.1, lp: 600 });
  },
  objbreak: (x) => {
    x.noise({ c: 'crunch', rate: [0.6, 0.2], v: 0.36, d: 0.35, lp: [4000, 400] });
    x.noise({ c: 'metal', hz: 600, v: 0.1, d: 0.25, bp: 1300, q: 2 });
    for (let i = 0; i < 4; i++) x.tone({ w: 'tri', f: 600 + x.r() * 900, v: 0.08, d: 0.04 }, 0.1 + i * 0.06);
    x.tone({ w: 'sine', f: [140, 40], v: 0.4, d: 0.2 });
  },
  panelbreak: (x) => {
    x.noise({ c: 'crunch', rate: 1, v: 0.3, d: 0.1, hp: 700 });
    for (let i = 0; i < 4; i++) x.noise({ c: 'crunch', rate: 0.7, v: 0.15, d: 0.03, bp: 1200 + i * 500, q: 2 }, 0.05 + i * 0.04);
    x.tone({ w: 'tri', f: [200, 60], v: 0.3, d: 0.12 });
  },
  tick: (x) => {
    x.tone({ w: 'p12', f: 3000, v: 0.12, d: 0.02 });
    x.tone({ w: 'tri', f: 1500, v: 0.16, d: 0.035 });
  },

  // --- defence and status ----------------------------------------------------------------------
  guard: (x) => {
    x.tone({ w: 'sine', f: 2400, v: 0.25, d: 0.25 });
    x.tone({ w: 'sine', f: 3310, v: 0.12, d: 0.18 });
    x.noise({ c: 'metal', hz: 1800, v: 0.08, d: 0.16, bp: 3200, q: 3 });
    x.noise({ v: 0.1, d: 0.03, hp: 4000 });
  },
  guardup: (x) => {
    x.tone({ w: 'sine', f: [1200, 2600], ft: 0.08, v: 0.22, d: 0.3 });
    x.tone({ w: 'p12', f: [1800, 3900], ft: 0.08, v: 0.05, d: 0.2 });
    x.noise({ c: 'metal', hz: [900, 2000], v: 0.07, d: 0.25, hp: 2500 });
  },
  barrier: (x) => {
    [1047, 1319, 1568, 2093].forEach((f, i) =>
      x.tone({ w: 'sine', f: [f * 0.9, f], v: 0.1, a: 0.05, h: 0.15, d: 0.35, trem: [12 + i * 3, 0.6] }, i * 0.03),
    );
    x.noise({ v: 0.05, a: 0.12, d: 0.35, hp: 5000 });
    x.tone({ w: 'p12', f: [400, 800], v: 0.04, a: 0.08, d: 0.25 });
  },
  barrierbreak: (x) => {
    for (let i = 0; i < 9; i++) x.tone({ w: x.r() < 0.5 ? 'sine' : 'tri', f: 2000 + x.r() * 4500, v: 0.08, d: 0.06 + x.r() * 0.1 }, x.r() * 0.16);
    x.noise({ v: 0.22, d: 0.22, hp: 3000 });
    x.noise({ c: 'crunch', rate: 0.9, v: 0.18, d: 0.12, hp: 1200 });
    x.tone({ w: 'p25', f: [1600, 400], v: 0.06, d: 0.2 });
  },
  counter: (x) => {
    x.tone({ w: 'sq', f: 1760, fs: [[0.03, 2637]], v: 0.14, h: 0.04, d: 0.15 });
    x.tone({ w: 'tri', f: 880, fs: [[0.03, 1319]], v: 0.18, h: 0.04, d: 0.15 });
    x.noise({ v: 0.2, d: 0.03, hp: 3000 });
  },
  recover: (x) => {
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => {
      x.tone({ w: 'tri', f, v: 0.2, d: 0.3 }, i * 0.05);
      x.tone({ w: 'p12', f: f * 2, v: 0.03, d: 0.15 }, i * 0.05);
    });
    x.noise({ v: 0.04, a: 0.1, d: 0.4, hp: 7000, trem: [20, 0.9] });
  },
  invis: (x) => {
    x.tone({ w: 'sine', f: [1500, 300], v: 0.18, a: 0.02, d: 0.5, trem: [18, 0.8] });
    x.tone({ w: 'p12', f: [1000, 200], v: 0.04, a: 0.02, d: 0.4 });
    x.noise({ v: 0.06, a: 0.05, d: 0.4, bp: [4000, 800], q: 3 });
  },
  summon: (x) => {
    x.tone({ w: 'sine', f: [180, 2200], ft: 0.3, v: 0.2, a: 0.02, h: 0.25, d: 0.12, vib: [22, 70] });
    x.tone({ w: 'p12', f: [90, 1100], ft: 0.3, v: 0.06, a: 0.02, h: 0.25, d: 0.1 });
    x.tone({ w: 'tri', f: 2093, v: 0.18, d: 0.25 }, 0.3);
    x.noise({ v: 0.06, a: 0.2, d: 0.2, hp: 5000 }, 0.1);
  },
  spawn: (x) => {
    [523, 784, 1047, 1568].forEach((f, i) => x.tone({ w: 'p25', f, v: 0.09, d: 0.07 }, i * 0.04));
    x.noise({ v: 0.07, a: 0.08, d: 0.25, hp: [2000, 7000] });
    x.tone({ w: 'sine', f: [300, 1600], v: 0.12, d: 0.2 });
  },

  // --- field ---------------------------------------------------------------------------------
  step: (x) => {
    x.tone({ w: 'tri', f: [900, 500], v: 0.12, d: 0.03 });
    x.noise({ v: 0.04, d: 0.015, hp: 5000 });
  },
  stage: (x) => {
    [784, 880, 1047, 1175, 1319, 1568, 1760, 2093].forEach((f, i) => x.tone({ w: i % 2 ? 'tri' : 'sine', f, v: 0.12, d: 0.18 }, i * 0.035));
    x.noise({ v: 0.05, a: 0.1, d: 0.4, hp: 6000, trem: [14, 0.7] });
  },
  areagrab: (x) => {
    x.tone({ w: 'sq', f: [1500, 300], ft: 0.14, v: 0.06, d: 0.14 });
    x.noise({ v: 0.12, d: 0.12, bp: [3000, 600], q: 2 });
    x.tone({ w: 'sine', f: [160, 45], ft: 0.12, v: 0.6, d: 0.22 }, 0.14);
    x.noise({ c: 'crunch', rate: 0.5, v: 0.32, d: 0.2, lp: 2000 }, 0.14);
    x.noise({ c: 'metal', hz: 700, v: 0.08, d: 0.2, bp: 1500 }, 0.14);
  },

  // --- menus and battle flow -------------------------------------------------------------------
  customopen: (x) => {
    x.noise({ v: 0.16, a: 0.06, d: 0.16, bp: [300, 4500], q: 2 });
    x.tone({ w: 'p25', f: [200, 900], v: 0.06, a: 0.05, d: 0.12 });
    x.tone({ w: 'tri', f: 1568, v: 0.22, d: 0.35 }, 0.13);
    x.tone({ w: 'p12', f: 2093, v: 0.08, d: 0.3 }, 0.17);
    x.tone({ w: 'tri', f: 2637, v: 0.12, d: 0.3 }, 0.21);
  },
  cursor: (x) => x.tone({ w: 'p12', f: 1900, v: 0.12, d: 0.03 }),
  select: (x) => x.tone({ w: 'p25', f: 1319, fs: [[0.035, 1976]], v: 0.12, h: 0.05, d: 0.05 }),
  deselect: (x) => x.tone({ w: 'p25', f: 1319, fs: [[0.035, 880]], v: 0.11, h: 0.05, d: 0.05 }),
  cancel: (x) => {
    x.tone({ w: 'p25', f: 988, fs: [[0.04, 659]], v: 0.11, h: 0.05, d: 0.06 });
    x.tone({ w: 'tri', f: 494, fs: [[0.04, 330]], v: 0.12, h: 0.05, d: 0.06 });
  },
  buzz: (x) => {
    for (const dt of [0, 0.14]) {
      x.tone({ w: 'sq', f: 98, v: 0.16, h: 0.08 + dt / 7, d: 0.05, lp: 1600 }, dt);
      x.tone({ w: 'saw', f: 104, v: 0.18, h: 0.08 + dt / 7, d: 0.05, lp: 1800 }, dt);
    }
  },
  confirm: (x) => {
    x.tone({ w: 'p25', f: 1047, fs: [[0.05, 1568]], v: 0.12, h: 0.08, d: 0.1 });
    x.tone({ w: 'tri', f: 523, fs: [[0.05, 784]], v: 0.14, h: 0.08, d: 0.1 });
  },
  pause: (x) => {
    x.tone({ w: 'sq', f: 988, v: 0.1, d: 0.06 });
    x.tone({ w: 'sq', f: 1319, v: 0.1, d: 0.1 }, 0.07);
  },
  battlestart: (x) => {
    [392, 523, 659, 784].forEach((f, i) => x.tone({ w: 'p25', f, v: 0.12, h: 0.04, d: 0.05 }, i * 0.06));
    x.tone({ w: 'p25', f: 1047, v: 0.14, a: 0.01, h: 0.3, d: 0.3, vib: [6, 18, 0.1] }, 0.24);
    x.tone({ w: 'p12', f: 784, v: 0.1, a: 0.01, h: 0.3, d: 0.3, vib: [6, 18, 0.1] }, 0.24);
    x.tone({ w: 'tri', f: 131, v: 0.3, h: 0.35, d: 0.2 }, 0.24);
    x.noise({ v: 0.1, d: 0.6, hp: 4000 }, 0.24);
    x.tone({ w: 'sine', f: [160, 45], v: 0.4, d: 0.2 }, 0.24);
  },
  pa: (x) => {
    [880, 1109, 1319, 1760, 2217, 2637, 3520].forEach((f, i) => {
      x.tone({ w: 'sq', f, v: 0.08, d: 0.2 }, i * 0.04);
      x.tone({ w: 'sine', f: f / 2, v: 0.12, d: 0.25 }, i * 0.04);
      x.tone({ w: 'p12', f, v: 0.035, d: 0.15 }, i * 0.04 + 0.12);
    });
    x.noise({ v: 0.05, a: 0.1, d: 0.5, hp: 6000, trem: [16, 0.8] });
  },
  gaugefull: (x) => {
    x.tone({ w: 'sq', f: 1319, v: 0.1, h: 0.05, d: 0.12 });
    x.tone({ w: 'sq', f: 1760, v: 0.11, h: 0.06, d: 0.3 }, 0.09);
    x.tone({ w: 'tri', f: 1760, v: 0.15, d: 0.35 }, 0.09);
  },
  win: (x) => {
    [523, 659, 784, 1047].forEach((f, i) => x.tone({ w: 'p25', f, v: 0.12, h: 0.03, d: 0.06 }, i * 0.07));
    [1047, 1319, 1568].forEach((f) => x.tone({ w: 'p12', f, v: 0.07, h: 0.2, d: 0.3, vib: [6, 15, 0.08] }, 0.28));
    x.tone({ w: 'tri', f: 262, v: 0.2, h: 0.2, d: 0.2 }, 0.28);
  },
};

// Names other code might reasonably use for the same sounds.
export const ALIASES = { heal: 'recover', explosion: 'explode', blast: 'bigexplode', error: 'buzz', ok: 'confirm', back: 'cancel', move: 'cursor' };

// Frequent sounds get a slight random pitch spread live so repeats don't sound mechanical.
export const VARY = { buster: 0.05, hit: 0.06, gun: 0.04, punch: 0.04, explode: 0.05, step: 0.08, thud: 0.05 };

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Build the named sound at absolute time `t` into `dest`. Returns { end, node } where `node` is the
 * sound's own gain stage (callers may disconnect it after `end`), or null for an unknown name.
 */
export function renderSfx(ctx, dest, name, t, { volume = 1, pitch = 1 } = {}) {
  const def = SFX[name];
  if (!def) return null;
  const node = ctx.createGain();
  node.gain.value = Math.max(0, Math.min(2, Number.isFinite(volume) ? volume : 1));
  node.connect(dest);
  let end = t;
  const p = Number.isFinite(pitch) && pitch > 0 ? pitch : 1;
  const x = {
    t,
    r: rng(hash(name)),
    tone: (o, dt = 0) => {
      end = Math.max(end, tone(ctx, node, t + dt, p !== 1 ? { ...o, p } : o));
    },
    noise: (o, dt = 0) => {
      end = Math.max(end, noise(ctx, node, t + dt, p !== 1 ? { ...o, p } : o));
    },
  };
  def(x);
  return { end, node };
}
