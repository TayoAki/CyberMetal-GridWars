// "Standby Loop" — menus, shop and setup screens (original composition). D Dorian, 100 BPM, swung 16ths.
// A 16-bar loop: A (Dm7 G9 vamp, music-box lead) · B (Bbmaj7 C7 Am7 Dm7 ... A7 turnaround).
import { N, up, rep, bars } from './util.js';

const lead = bars(
  'o4 r8 a8 > c8 d16 r16 r8 c8 < a8 g8', // Dm7
  'o4 a8. b16 a8 f8 r4 r8 d8', // G9
  'o4 r8 a8 > c8 e16 r16 d8 c8 < a8 > c8 <', // Dm7
  'o4 > d4 r8 < b8 > d8. e16 f8 e8 <', // G9
  'o4 > d4. c8 < a4 r8 f8', // Bbmaj7
  'o4 g8. a16 g8 e8 r4 r8 c8', // Am7
  'o4 d8 f8 b-8 a8 r8 g8 f8 d8', // Gm7
  'o4 e4. d8 c+4 r4', // A7sus4 A7
  'o4 r8 f8 a8 > c8 d4 c8 < a8', // Bbmaj7
  'o4 > c4. < b-8 g4 e4', // C7
  'o4 r8 e8 a8 > c8 e4 d8 c8 <', // Am7
  'o4 > d2 < a4 f4', // Dm7
  'o4 r8 g8 b-8 > d8 f4 e8 d8 <', // Gm7
  'o4 > e4. d8 c4 < g4', // C7
  'o4 a8. g16 f8 a8 > c4 < a8 > c8 <', // Fmaj7
  'o4 > c+4 < a4 e4 g4', // A7
);

// broken-chord keys: 8ths over four chord tones; half() for two chords in one bar
const roll = (ns) => [0, 1, 2, 3, 1, 2, 3, 2].map((i) => N(ns[i], 8)).join('');
const half = (ns) => [0, 1, 2, 3].map((i) => N(ns[i], 8)).join('');
const Dm7 = ['d3', 'a3', 'c4', 'f4'];
const G9 = ['g3', 'b3', 'f4', 'a4'];
const Bb7 = ['b-2', 'f3', 'a3', 'd4'];
const Am7 = ['a2', 'e3', 'g3', 'c4'];
const Gm7 = ['g2', 'd3', 'f3', 'b-3'];
const C7 = ['c3', 'g3', 'b-3', 'e4'];
const harm = bars(
  roll(Dm7), roll(G9), roll(Dm7), roll(G9), roll(Bb7), roll(Am7), roll(Gm7),
  half(['a2', 'e3', 'g3', 'd4']) + half(['a2', 'e3', 'g3', 'c+4']),
  roll(Bb7), roll(C7), roll(Am7), roll(Dm7), roll(Gm7), roll(C7), roll(['f2', 'c3', 'a3', 'e4']),
  roll(['a2', 'e3', 'g3', 'c+4']),
);

// syncopated bass: root (dotted 8th + 16th), fifth, octave, root, fifth
const groove = (r, f) => `${N(r, '8.')}${N(r, 16)} r8 ${N(f, 8)}${N(up(r), 8)} r8 ${N(r, 8)}${N(f, 8)}`;
const bass = bars(
  groove('d2', 'a2'), groove('g1', 'd2'), groove('d2', 'a2'), groove('g1', 'd2'),
  groove('b-1', 'f2'), groove('a1', 'e2'), groove('g1', 'd2'), groove('a1', 'e2'),
  groove('b-1', 'f2'), groove('c2', 'g2'), groove('a1', 'e2'), groove('d2', 'a2'),
  groove('g1', 'd2'), groove('c2', 'g2'), groove('f1', 'c2'), groove('a1', 'e2'),
);

const K = 'b8. b16 i8 r8 r16 b16 r8 i8 r8';
const K2 = 'b8. b16 i8 r8 b8 i16 i16 i8 i8';
const H = rep('v8 h16 v4 h16', 8);
const H2 = rep('v8 h16 v4 h16', 6) + ' v9 o4';

export const MENU = {
  name: 'menu',
  title: 'Standby Loop',
  key: 'D Dorian',
  bpm: 100,
  swing: 0.3,
  loop: true,
  echo: { beats: 0.75, fb: 0.35, mix: 0.3, lp: 2000 },
  channels: [
    { name: 'lead', inst: 'bell', vol: 1, pan: -0.1, echo: 0.6, loop: lead },
    { name: 'keys', inst: 'keys', vol: 0.6, pan: 0.35, echo: 0.2, loop: harm },
    { name: 'bass', inst: 'sub', vol: 0.9, loop: bass },
    { name: 'kit', kind: 'drum', vol: 0.7, loop: bars(rep(K, 7), K2, rep(K, 7), K2) },
    { name: 'hat', kind: 'drum', vol: 0.75, pan: 0.2, loop: bars(rep(H, 7), H2, rep(H, 7), H2) },
  ],
};
