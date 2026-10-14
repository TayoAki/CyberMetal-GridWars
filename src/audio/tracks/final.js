// "Root Access" — the final boss theme (original composition). D minor with a Phrygian E-flat, 138 BPM.
// Intro 4 bars (once): choir swells on Dm/Eb over timpani toms. Then a 24-bar loop:
//   A  majestic long-note theme, half-time drums · B  agitated 8th-note answer, full beat ·
//   C  high climb over a chromatic bass (Gm A Bb Bdim ...), double-kick, resolves C# -> D into A.
import { N, bounce, drive, rep, bars } from './util.js';

// ---- lead (each bar starts and ends in octave 5) ----
const A = [
  'o5 d2. a4', // Dm
  'o5 g4. f8 e-2', // Eb
  'o5 d4. e8 f4 a4', // Dm
  'o5 b-2. g4', // Eb
  'o5 f4. d8 b-4 > d4 <', // Bb
  'o5 > c4. < b-8 a4 g4', // C
  'o5 a4. g8 e4 c+4', // A
  'o5 c+4. d8 e2', // A
];
const B = [
  'o5 f8 g8 a8 b-8 a8 g8 f8 d8', // Bb
  'o5 e8 f8 g8 > c8 < b-8 a8 g8 e8', // C
  'o5 f4. e8 d4 a4', // Dm
  'o5 > d2. c4 <', // Dm
  'o5 b-8 a8 g8 a8 b-8 > d8 c8 < b-8', // Gm
  'o5 a4. g8 e4 c+4', // A
  'o5 d8 f8 b-8 > d8 e8 c8 < g8 e8', // Bb C
  'o5 a2. r8 a8', // A
];
const C = [
  'o5 g4. a8 b-4 > d4 <', // Gm
  'o5 > c+2 < a2', // A
  'o5 > d4. e-8 f4 d4 <', // Bb
  'o5 > f2 d2 <', // B dim
  'o5 > e4. f8 e4 d4 <', // Dm/A
  'o5 > c+2. < r4', // A
  'o5 > e-4 d4 c4 < b-4', // Eb
  'o5 a4 g4 e4 c+4', // A7 (C# leads home to D)
];

// ---- two choir voices (whole notes) ----
const choirHi = bars(
  'o4 a1', 'b-1', 'a1', 'b-1', 'f1', 'g1', 'e1', 'e1',
  'o5 d1', 'e1', 'f1', 'f1', 'd1', 'c+1', 'd2 e2', 'c+1',
  'o5 d1', 'e1', 'f1', 'f1', 'f1', 'e1', 'e-1', 'c+1',
);
const choirLo = bars(
  'o4 f1', 'g1', 'f1', 'g1', 'd1', 'e1', 'c+1', 'c+1',
  'o4 f1', 'g1', 'a1', 'a1', 'b-1', 'e1', 'f2 g2', 'e1',
  'o4 b-1', '> c+1', 'd1', 'd1', '< a1', '> c+1', '< b-1', 'g1',
);

// ---- bass ----
const pulse8 = (n) => rep(N(n, 8), 8);
const bass = bars(
  ['d2', 'e-2', 'd2', 'e-2', 'b-1', 'c2', 'a1', 'a1'].map(pulse8),
  bounce('b-1'), bounce('c2'), bounce('d2'), bounce('d2'), bounce('g1'), bounce('a1'), bounce('b-1', 2) + bounce('c2', 2), bounce('a1'),
  drive('g1', 'd2'), drive('a1', 'e2'), drive('b-1', 'f2'), drive('b1', 'f2'),
  drive('a1', 'e2'), drive('a1', 'e2'), drive('e-2', 'b-2'), drive('a1', 'e2'),
);

// ---- drums ----
const FA = 'k4 r8 k8 n4 r8 t16 t16';
const FA2 = 'k4 r8 k8 n4 m16 m16 t16 t16';
const FB = 'k8 r8 s8 r8 k8 k8 s8 r8';
const FC = 'k16 k16 k16 k16 (kn)8 k16 k16 k16 k16 k16 k16 (kn)8 t16 t16';
const FILL = 'n16 n16 n16 n16 t16 t16 t16 t16 m16 m16 u16 u16 (kn)8 (kn)8';
const kit = bars(FA, FA, FA, FA2, FA, FA, FA, FILL, rep(FB, 7), FILL, rep(FC, 7), FILL);

const HA = rep('v9 h8', 8);
const HAC = 'v12 c8 ' + rep('v9 h8', 7);
const HB = rep('v11 h16 v6 h16', 8);
const HBC = 'v12 c16 v6 h16 ' + rep('v11 h16 v6 h16', 7);
const HC = rep('v11 o8 v7 h8', 4);
const HCC = 'v12 c8 v7 h8 ' + rep('v11 o8 v7 h8', 3);
const hat = bars(HAC, rep(HA, 7), HBC, rep(HB, 7), HCC, rep(HC, 3), HCC, rep(HC, 3));

export const FINAL = {
  name: 'final',
  title: 'Root Access',
  key: 'D minor (Phrygian colour)',
  bpm: 138,
  loop: true,
  echo: { beats: 0.75, fb: 0.35, mix: 0.25, lp: 2000 },
  channels: [
    { name: 'lead', inst: 'epic', vol: 1, echo: 0.5, intro: 'r1 | r1 | r1 | o4 r2 a8 > c+8 d8 e8', loop: bars(A, B, C) },
    { name: 'choirHi', inst: 'choir', q: 8, vol: 0.8, pan: -0.35, echo: 0.25, intro: 'o4 a1 | b-1 | a1 | b-1', loop: choirHi },
    { name: 'choirLo', inst: 'choir', q: 8, vol: 0.8, pan: 0.35, echo: 0.25, intro: 'o4 f1 | g1 | f1 | g1', loop: choirLo },
    { name: 'bass', inst: 'fat', vol: 1, intro: 'q8 o2 d1 | e-1 | d1 | e-1 | q7', loop: bass },
    {
      name: 'kit',
      kind: 'drum',
      vol: 0.95,
      intro: bars('k2 t4 t4', 'k2 t4 m4', 'k2 t8 t8 m8 m8', 'n16 n16 n16 n16 n16 n16 n16 n16 t16 t16 m16 m16 u16 u16 (kn)8'),
      loop: kit,
    },
    { name: 'hat', kind: 'drum', vol: 0.55, pan: 0.15, intro: 'v12 c1 | r1 | v12 c1 | r2 r4 z4', loop: hat },
  ],
};
