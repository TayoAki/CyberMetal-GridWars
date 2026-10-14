// Helpers for writing track MML from JS (see ../mml.js for the notation).
// Notes with an explicit octave are written like 'e2', 'f+3', 'b-4'.

export const rep = (s, n) => Array(n).fill(s).join(' ');

const parse = (n) => {
  const m = /^([a-g][+#-]?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note '${n}'`);
  return [m[1], Number(m[2])];
};

/** 'e2' + length → 'o2 e8 ' */
export const N = (n, len = '') => {
  const [name, oct] = parse(n);
  return `o${oct} ${name}${len} `;
};

/** Shift a note by k octaves: up('e2') → 'e3'. */
export const up = (n, k = 1) => {
  const [name, oct] = parse(n);
  return name + (oct + k);
};

/** A 16th-note arpeggio: the notes in order, repeated `times` times. */
export const arp16 = (notes, times = 4) => rep(notes.map((n) => N(n, 16)).join(''), times);

/** Off-beat chord stabs: (rest, chord) pairs of 8ths for `beats` beats; chord like 'e g b'. */
export const stabs = (chord, oct = 4, beats = 4) => rep(`o${oct} r8 {${chord}}8`, beats);

/** Octave-bounce bass in 8ths for `beats` beats. */
export const bounce = (n, beats = 4) => rep(N(n, 8) + N(up(n), 8), beats);

/** Tresillo-driven bass bar (3+3+2 | 2+2+2+2) on root n with fifth f. */
export const drive = (n, f) => N(n, '8.') + N(n, '8.') + N(n, 8) + N(up(n), 8) + N(n, 8) + N(f, 8) + N(n, 8);

/** Repeated 16ths on one note. */
export const pulse16 = (n, count = 16) => rep(N(n, 16), count);

/** Join bars (or sections) into one MML string. */
export const bars = (...xs) => xs.flat().join(' | ');
