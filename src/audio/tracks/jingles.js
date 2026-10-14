// Short one-shot jingles (original compositions); they play once and stop.
import { rep, bars } from './util.js';

// "Clean Sweep" — battle won. C major, 150 BPM, 3 bars (~4.8 s): triplet fanfare, bVI-bVII lift, home.
export const VICTORY = {
  name: 'victory',
  title: 'Clean Sweep',
  key: 'C major',
  bpm: 150,
  loop: false,
  echo: { beats: 0.5, fb: 0.25, mix: 0.2 },
  channels: [
    { name: 'lead', inst: 'hero', vol: 1, echo: 0.5, loop: 'o4 c12 e12 g12 > c4 < g12 > c12 e12 g4 | o4 a-4. > c8 < b-4. > d8 | o5 e2. r4' },
    { name: 'harm', inst: 'lead12', vol: 0.6, pan: 0.3, loop: 'o4 r2 e12 g12 > c12 e4 | o4 e-4. a-8 f4. b-8 | @arp o4 {c e g > c}2. r4' },
    { name: 'bass', inst: 'bass', vol: 1, loop: 'o2 c4 g4 > c4 < g4 | o2 a-4. a-8 b-4. b-8 | o2 c2. r4' },
    { name: 'kit', kind: 'drum', vol: 0.85, loop: bars('b8 r8 s8 r8 b8 b8 s8 s8', 's16 s16 s16 s16 s16 s16 s16 s16 t16 t16 m16 m16 u16 u16 s8', '(bc)2. r4') },
    { name: 'hat', kind: 'drum', vol: 0.5, pan: 0.15, loop: bars('v10 ' + rep('h8', 8), 'v10 ' + rep('h16', 16), 'r1') },
  ],
};

// "Connection Lost" — game over. A minor, 80 BPM, 2 bars (~6 s): a falling line that settles on A.
export const GAMEOVER = {
  name: 'gameover',
  title: 'Connection Lost',
  key: 'A minor',
  bpm: 80,
  loop: false,
  echo: { beats: 0.75, fb: 0.35, mix: 0.3, lp: 1600 },
  channels: [
    { name: 'lead', inst: 'leadsq', vol: 0.9, echo: 0.6, loop: 'o5 e4. d8 c4 < a4 | o5 d4 < b8 g+8 a2' },
    { name: 'pad', inst: 'pad', q: 8, vol: 1.2, pan: 0.25, loop: 'o4 c1 | o4 f4 g+4 e2' },
    { name: 'bass', inst: 'sub', vol: 0.9, loop: 'o2 a2 f2 | o2 d4 e4 a2' },
    { name: 'kit', kind: 'drum', vol: 0.8, loop: 't2 r2 | r2 k2' },
  ],
};
