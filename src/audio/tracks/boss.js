// "Kernel Panic" — the boss (Navi duel) theme (original composition). C minor / harmonic minor, 152 BPM.
// Intro 2 bars (once), then a 24-bar loop:
//   A  snaking chromatic motif over pumping chords · B  climbing line, double-kick bursts ·
//   C  stuttering riff over Cm/Db, toms, trill and a run back to A.
import { N, up, arp16, drive, pulse16, rep, bars } from './util.js';

const pump = (ch, n = 8, oct = 4) => rep(`o${oct} {${ch}}8`, n);
const gallop = (n) => rep(N(n, 16) + N(n, 16) + N(up(n), 16) + N(n, 16), 4);
const chug = (n) => rep(N(n, 8) + N(n, 16) + N(n, 16), 4);

// ---- lead (each bar starts and ends in octave 5) ----
const motif = 'o5 c8 g8 f+16 g16 e-8 d8 e-16 d16 c8 < b8 >';
const A = [
  motif, // Cm
  'o5 c4. r8 < g8 a-8 b8 > c8', // Cm
  'o5 e-8. c8. > c8 < b-8 a-8 g8 a-8', // Ab
  'o5 g4. f8 e-8 d8 < b4 >', // G
  motif, // Cm
  'o5 c4. r8 g8 > c8 d8 e-8 <', // Cm
  'o5 a-8. g8. f8 e-8 d8 e-8 f8', // Fm
  'o5 g2 r8 g8 a-8 b8', // G
];
const B = [
  'o5 > c4. < b-8 a-4 e-4', // Ab
  'o5 f4. g8 b-2', // Bb
  'o5 b4. > c8 d4 < b4', // G
  'o5 > e-4. d8 c2 <', // Cm
  'o5 > c4. d8 e-4 c4 <', // Ab
  'o5 > f4. e-8 d4 c4 <', // Fm
  'o5 > d8 c8 < a-8 f8 d8 f8 a-8 > c8 <', // D half-dim
  'o5 b4. > c8 d4 f4 <', // G7
];
const stutC = 'c16 c16 r16 c16 g8 c16 c16 r16 c16 a-8 g8 e-8';
const stutDb = 'd-16 d-16 r16 d-16 a-8 d-16 d-16 r16 d-16 > d-8 < a-8 f8';
const stutDb2 = 'd-16 d-16 r16 d-16 a-8 d-16 d-16 r16 d-16 f8 g8 a-8';
const C = [
  'o5 ' + stutC, 'o5 ' + stutDb, 'o5 ' + stutC, 'o5 ' + stutDb2,
  'o5 > c2 < b-4 a-4', // Ab
  'o5 b-2 > d4 f4 <', // Bb
  'o5 ' + rep('g16 a-16', 8), // G (trill)
  'o5 < b16 > c16 d16 e-16 f16 g16 a-16 b16 g2', // G, run back
];

// ---- harmony ----
const harm = bars(
  '@stab ' + pump('c e- g'), pump('c e- g'), pump('c e- a-'), pump('< b > d g'),
  pump('c e- g'), pump('c e- g'), pump('c f a-'), pump('< b > d g'),
  '@pluck12 ' + arp16(['c4', 'e-4', 'a-4', 'c5']), arp16(['d4', 'f4', 'b-4', 'd5']), arp16(['d4', 'g4', 'b4', 'd5']),
  arp16(['c4', 'e-4', 'g4', 'c5']), arp16(['c4', 'e-4', 'a-4', 'c5']), arp16(['c4', 'f4', 'a-4', 'c5']),
  arp16(['d4', 'f4', 'a-4', 'c5']), arp16(['d4', 'f4', 'g4', 'b4']),
  '@pluck o4 ' + stutC, 'o4 ' + stutDb, 'o4 ' + stutC, 'o4 ' + stutDb2,
  '@stab ' + pump('c e- a-'), pump('d f b-'), pump('< b > d f g'), pump('< b > d f g'),
);

// ---- bass ----
const bass = bars(
  gallop('c2'), gallop('c2'), gallop('a-1'), gallop('g1'), gallop('c2'), gallop('c2'), gallop('f1'), gallop('g1'),
  drive('a-1', 'e-2'), drive('b-1', 'f2'), drive('g1', 'd2'), drive('c2', 'g2'),
  drive('a-1', 'e-2'), drive('f1', 'c2'), drive('d2', 'a-2'), drive('g1', 'd2'),
  chug('c2'), chug('d-2'), chug('c2'), chug('d-2'),
  drive('a-1', 'e-2'), drive('b-1', 'f2'), pulse16('g1'),
  ['g1', 'g1', 'g2', 'g1', 'b1', 'd2', 'f2', 'b2'].map((n) => N(n, 8)).join(''),
);

// ---- drums ----
const KA = 'k8 r16 k16 s8 k8 r8 k16 k16 s8 r8';
const KA2 = 'k8 r16 k16 s8 k8 k16 k16 k16 k16 s8 s16 s16';
const KB = 'k16 k16 k8 (ks)8 k16 k16 k16 k16 k8 (ks)8 k8';
const KC = 't8 t16 t16 m8 m8 u8 t8 (ks)8 r8';
const FILL = 's16 s16 t16 t16 s16 s16 m16 m16 s16 s16 u16 u16 (ks)8 (ks)8';
const ROLL = 'n16 n16 n16 n16 s16 s16 s16 s16 u16 u16 m16 m16 t16 t16 (ks)8';
const kit = bars(
  KA, KA, KA, KA2, KA, KA, KA, FILL,
  rep(KB, 7), FILL,
  rep(KC, 4), KA, KA, rep('s16', 16), ROLL,
);

const HA = rep('v11 h16 v5 h16 v8 h16 v5 h16', 4);
const HAC = 'v12 c16 v5 h16 v8 h16 v5 h16 ' + rep('v11 h16 v5 h16 v8 h16 v5 h16', 3);
const HB = rep('v6 h16 v6 h16 v12 o8', 4);
const HBC = 'v12 c16 v6 h16 v12 o8 ' + rep('v6 h16 v6 h16 v12 o8', 3);
const HC = rep('v10 i8 r8', 4);
const hat = bars(HAC, rep(HA, 7), HBC, rep(HB, 7), rep(HC, 4), HAC, HA, HA, 'v12 ' + rep('o8', 8));

export const BOSS = {
  name: 'boss',
  title: 'Kernel Panic',
  key: 'C minor',
  bpm: 152,
  loop: true,
  echo: { beats: 0.5, fb: 0.3, mix: 0.2, lp: 2200 },
  channels: [
    { name: 'lead', inst: 'leadsq', vol: 1.05, pan: -0.08, echo: 0.5, intro: 'r1 | o4 r2 g8 a-8 b8 > d8', loop: bars(A, B, C) },
    { name: 'harm', inst: 'stab', vol: 0.85, pan: 0.3, intro: '@arp o4 {c e- g}1 | {< b > d f g}1', loop: harm },
    { name: 'bass', inst: 'bass', vol: 1, intro: bars(N('c2', 1), N('c2', 4) + N('d-2', 4) + N('d2', 4) + N('g1', 4)), loop: bass },
    { name: 'kit', kind: 'drum', vol: 0.75, intro: bars('k8 r8 r4 k8 r8 r4', 't16 t16 t16 t16 m16 m16 m16 m16 u16 u16 u16 u16 n16 n16 n16 n16'), loop: kit },
    { name: 'hat', kind: 'drum', vol: 0.7, pan: 0.15, intro: 'v12 c2 r2 | r2 r4 z4', loop: hat },
  ],
};

