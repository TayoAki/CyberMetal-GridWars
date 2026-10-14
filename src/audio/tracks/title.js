// "Grid Horizon" — the title anthem (original composition). D major, 132 BPM.
// Intro 2 bars (once), then a 20-bar loop:
//   A  the anthem: wide leaps on rolling broken chords · B  rising answer over off-beat stabs ·
//   C  heroic bVI-bVII-I turnaround (Bb C D) back to the top.
import { N, stabs, bounce, drive, rep, bars } from './util.js';

// ---- lead (each bar starts and ends in octave 5) ----
const A = [
  'o5 d4 a4. g8 f+4', // D
  'o5 e4. f+8 e4 c+4', // A/C#
  'o5 d4 f+4 b4. a8', // Bm
  'o5 g4. f+8 g4 a4', // G
  'o5 a4 > d4. c+8 < b4', // D
  'o5 a4. g8 f+4 e4', // A
  'o5 g4 b4 a4 > c+4 <', // G A
  'o5 > d1 <', // D
];
const B = [
  'o5 b8 a8 g8 a8 b4 > d4 <', // G
  'o5 > c+8 < b8 a8 b8 > c+4 e4 <', // A
  'o5 > f+4. e8 c+4 < a4', // F#m
  'o5 b2 f+2', // Bm
  'o5 g8 f+8 g8 a8 b4 > d4 <', // G
  'o5 > c+8 < b8 > c+8 d8 e4 c+4 <', // A
  'o5 b4. a8 g4 e4', // Em
  'o5 a2 a8 b8 > c+8 e8 <', // A
];
const C = [
  'o5 > d4. c8 < b-4 f4', // Bb
  'o5 > e4. d8 c4 < g4', // C
  'o5 > f+4. e8 d4 < a4', // D
  'o5 > d2. < r4', // D
];

// ---- harmony ----
const roll = (ns) => [0, 1, 2, 3, 2, 1, 2, 3].map((i) => N(ns[i], 8)).join('');
const half = (ns) => [0, 1, 2, 1].map((i) => N(ns[i], 8)).join('');
const D = ['d4', 'f+4', 'a4', 'd5'];
const Ac = ['c+4', 'e4', 'a4', 'c+5'];
const harm = bars(
  '@pluck ' + roll(D), roll(Ac), roll(['d4', 'f+4', 'b4', 'd5']), roll(['d4', 'g4', 'b4', 'd5']),
  roll(D), roll(Ac), half(['d4', 'g4', 'b4']) + half(['c+4', 'e4', 'a4']), roll(D),
  '@stab ' + stabs('d g b'), stabs('c+ e a'), stabs('c+ f+ a'), stabs('d f+ b'),
  stabs('d g b'), stabs('c+ e a'), stabs('e g b'), stabs('c+ e a'),
  '@arp o4 {< b- > d f}1', '{c e g}1', '{d f+ a}1', '{d f+ a}1',
);

// ---- bass ----
const pulse8 = (n) => rep(N(n, 8), 8);
const bass = bars(
  pulse8('d2'), pulse8('c+2'), pulse8('b1'), pulse8('g1'), pulse8('d2'), pulse8('a1'),
  rep(N('g1', 8), 4) + rep(N('a1', 8), 4), pulse8('d2'),
  bounce('g1'), bounce('a1'), bounce('f+1'), bounce('b1'), bounce('g1'), bounce('a1'), bounce('e2'), bounce('a1'),
  drive('b-1', 'f2'), drive('c2', 'g2'), drive('d2', 'a2'),
  ['d2', 'd3', 'c+3', 'b2', 'a2', 'g2', 'f+2', 'e2'].map((n) => N(n, 8)).join(''),
);

// ---- drums ----
const TA = 'b8 r8 s8 r8 b8 b8 s8 r8';
const TA2 = 'b8 r8 s8 r16 b16 b8 b8 s8 s16 s16';
const FILL = 's16 s16 s16 s16 t16 t16 m16 m16 u16 u16 m16 t16 (bs)8 (bs)8';
const TC = 'b4 (bs)4 b4 (bs)4';
const ROLL = 's16 s16 s16 s16 s16 s16 s16 s16 u16 u16 m16 m16 t16 t16 s8';
const kit = bars(TA, TA, TA, TA2, TA, TA, TA, FILL, rep(TA, 7), FILL, TC, TC, TC, ROLL);

const H8 = 'v12 h8 h8 h8 h8 h8 h8 h8 o8';
const H8C = 'v12 c8 h8 h8 h8 h8 h8 h8 o8';
const H16 = rep('v11 h16 v6 h16', 8);
const H16C = 'v12 c16 v6 h16 ' + rep('v11 h16 v6 h16', 7);
const HQ = 'v12 c4 v10 o4 o4 o4';
const hat = bars(H8C, rep(H8, 7), H16C, rep(H16, 7), HQ, HQ, HQ, 'v12 h16 h16 h16 h16 h16 h16 h16 h16 r2');

export const TITLE = {
  name: 'title',
  title: 'Grid Horizon',
  key: 'D major',
  bpm: 132,
  loop: true,
  echo: { beats: 0.75, fb: 0.3, mix: 0.24, lp: 2600 },
  channels: [
    { name: 'lead', inst: 'hero', vol: 1, echo: 0.5, intro: 'r1 | o4 r2 a8 b8 > c+8 < a8', loop: bars(A, B, C) },
    { name: 'harm', inst: 'pluck', vol: 0.75, pan: 0.3, intro: '@arp o4 {d f+ a}1 | {c+ e a}1', loop: harm },
    { name: 'bass', inst: 'bass', vol: 1, intro: bars(N('d2', 1), N('a1', 1)), loop: bass },
    { name: 'kit', kind: 'drum', vol: 0.85, intro: bars('b4 r4 b4 r4', ROLL), loop: kit },
    { name: 'hat', kind: 'drum', vol: 0.55, pan: 0.15, intro: 'v12 c1 | r2 r4 z4', loop: hat },
  ],
};
