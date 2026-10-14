// "Gridlock Rush" — the virus-battle theme (original composition). E minor, 168 BPM.
// Intro 2 bars (once), then a 32-bar loop:
//   A  hook (off-beat stabs)  · A' hook again (16th arps, new ending) ·
//   B  lift toward the relative major (long lead notes, pad) · C riff breakdown, soaring line, run back to A.
import { N, arp16, stabs, bounce, drive, pulse16, rep, bars } from './util.js';

// ---- lead (every bar string starts and ends in octave 5) ----
const hook = [
  'o5 e8. g8. b8 a8 g8 f+8 g8', // Em
  'o5 e4. < b8 > c8 e8 g4', // C
  'o5 f+8. a8. > d8 c8 < a8 f+8 a8', // D
  'o5 b4. a8 f+8 d+8 < b4 >', // B7
  'o5 e8. g8. b8 a8 g8 f+8 g8', // Em
  'o5 e4. g8 > c8 < b8 g4', // C
];
const endA = ['o5 a8. > c8. e8 d+8. c8. < b8', 'o5 > e4. < b8 g8 e8 f+8 g8']; // Am B7 | Em
const endA2 = ['o5 a8. > c8. e8 f+4 d+4 <', 'o5 b2 r8 b8 > c8 d+8 <']; // Am B7 | B7
const lift = [
  'o5 > e4. d8 c4 < g4', // C
  'o5 f+4. g8 a2', // D
  'o5 > d4. < b8 f+4 b4', // Bm
  'o5 g4. a8 b2', // Em
  'o5 > c4. < b8 a4 e4', // Am
  'o5 f+4 a4 > d4 f+4 <', // D
  'o5 > g4. f+8 d4 < b4', // G
  'o5 a4. b8 > d+4 f+4 <', // B7
];
const riffE = 'e16 e16 b8 e16 e16 > d8 < e16 e16 b8 a8 g8';
const riffF = 'f16 f16 > c8 < f16 f16 a8 > c8 < a8 g8 f8';
const riffFB = 'f16 f16 > c8 < f16 f16 a8 b8 > c8 d+8 f+8 <';
const soar = [
  'o5 a4. b8 > c4 e4 <', // Am
  'o5 > d4. c8 < b4 g4', // G
  'o5 > c4 e4 d4 f+4 <', // C D
  'o5 b16 a16 g16 f+16 e16 d+16 e16 f+16 g16 f+16 g16 a16 b8 r8', // B7, run back to the top
];
const lead = bars(
  hook, endA, // A
  hook, endA2, // A'
  lift, // B
  'o5 ' + riffE, 'o5 ' + riffF, 'o5 ' + riffE, 'o5 ' + riffFB, soar, // C
);

// ---- harmony: stabs, arps, pad, riff double ----
const EM = ['e4', 'g4', 'b4', 'e5'];
const CM = ['e4', 'g4', 'c5', 'e5'];
const DM = ['f+4', 'a4', 'd5', 'f+5'];
const B7 = ['d+4', 'f+4', 'a4', 'b4'];
const AM = ['e4', 'a4', 'c5', 'e5'];
const harm = bars(
  '@stab ' + stabs('e g b'), stabs('e g > c'), stabs('f+ a > d'), stabs('d+ f+ a b'),
  stabs('e g b'), stabs('e g > c'), stabs('e a > c', 4, 2) + stabs('d+ f+ a b', 4, 2), stabs('e g b'),
  '@pluck12 ' + arp16(EM), arp16(CM), arp16(DM), arp16(B7),
  arp16(EM), arp16(CM), arp16(AM, 2) + arp16(B7, 2), arp16(B7),
  '@pad o4 e1', 'f+1', 'f+1', 'g1', 'a1', 'a1', 'b1', 'a2 d+2',
  '@pluck o4 ' + riffE, 'o4 ' + riffF, 'o4 ' + riffE, 'o4 ' + riffFB,
  '@pluck12 ' + arp16(['a4', 'c5', 'e5', 'a5']), arp16(['g4', 'b4', 'd5', 'g5']),
  arp16(CM, 2) + arp16(DM, 2), arp16(['b4', 'a4', 'f+4', 'd+4']),
);

// ---- bass ----
const bassA = [bounce('e2'), bounce('c2'), bounce('d2'), bounce('b1'), bounce('e2'), bounce('c2'), bounce('a1', 2) + bounce('b1', 2)];
const bass = bars(
  bassA, bounce('e2'),
  bassA, bounce('b1'),
  drive('c2', 'g2'), drive('d2', 'a2'), drive('b1', 'f+2'), drive('e2', 'b2'),
  drive('a1', 'e2'), drive('d2', 'a2'), drive('g1', 'd2'), drive('b1', 'f+2'),
  pulse16('e2'), pulse16('f2'), pulse16('e2'), pulse16('f2', 8) + pulse16('b1', 8),
  bounce('a1'), bounce('g1'), bounce('c2', 2) + bounce('d2', 2),
  N('b1', 8) + N('b1', 8) + N('b2', 8) + N('b1', 8) + N('d+2', 8) + N('f+2', 8) + N('a2', 8) + N('d+3', 8),
);

// ---- drums ----
const G1 = 'b8 r8 s8 r16 b16 b8 b8 s8 r8';
const G2 = 'b8 r8 s8 r8 b8 r16 b16 s8 s16 s16';
const FILL = 's16 s16 s16 s16 t16 t16 m16 m16 u16 u16 m16 t16 s8 s8';
const HALF = 'b8 r8 s8 r8 b8 b8 s8 r8';
const FOUR = 'b4 (bs)4 b4 (bs)8 b8';
const ROLL = 's16 s16 s16 s16 s16 s16 s16 s16 u16 u16 m16 m16 t16 t16 s8';
const kit = bars(
  G1, G1, G1, G2, G1, G1, G1, FILL,
  G1, G1, G1, G2, G1, G1, G2, FILL,
  rep(HALF, 7), FILL,
  rep(FOUR, 7), ROLL,
);

const H8 = 'v12 h8 h8 h8 h8 h8 h8 h8 o8';
const H8C = 'v12 c8 h8 h8 h8 h8 h8 h8 o8';
const H16 = rep('v12 h16 v6 h16', 8);
const H16C = 'v12 c16 v6 h16 ' + rep('v12 h16 v6 h16', 7);
const HB = 'v11 h8 h8 o8 h8 h8 h8 o8 h8';
const HBC = 'v11 c8 h8 o8 h8 h8 h8 o8 h8';
const HC = rep('v12 o8 v8 h8', 4);
const HCC = 'v12 c8 v8 h8 ' + rep('v12 o8 v8 h8', 3);
const hat = bars(
  H8C, rep(H8, 7),
  H16C, rep(H16, 7),
  HBC, rep(HB, 7),
  HCC, rep(HC, 6), 'v12 h16 h16 h16 h16 h16 h16 h16 h16 r2',
);

export const BATTLE = {
  name: 'battle',
  title: 'Gridlock Rush',
  key: 'E minor',
  bpm: 168,
  loop: true,
  echo: { beats: 0.75, fb: 0.28, mix: 0.22, lp: 2400 },
  channels: [
    { name: 'lead', inst: 'lead', vol: 1, pan: -0.08, echo: 0.55, intro: 'r1 | o5 r2 r8 < b8 > d+8 f+8', loop: lead },
    {
      name: 'harm',
      inst: 'stab',
      vol: 0.85,
      pan: 0.3,
      intro: bars('@stab ' + stabs('e g b'), '@pluck12 ' + arp16(['b3', 'd+4', 'f+4', 'a4'])),
      loop: harm,
    },
    {
      name: 'bass',
      inst: 'bass',
      vol: 1,
      intro: bars(rep('o2 e16 e16 > e8 <', 4), ['e2', 'f+2', 'g2', 'a2', 'b2', 'c3', 'd3', 'd+3'].map((n) => N(n, 8)).join('')),
      loop: bass,
    },
    { name: 'kit', kind: 'drum', vol: 0.85, intro: bars('b8 r8 r8 b8 r8 b8 s8 r8', ROLL), loop: kit },
    { name: 'hat', kind: 'drum', vol: 0.7, pan: 0.15, intro: 'r1 | r2 r4 v12 z4', loop: hat },
  ],
};
