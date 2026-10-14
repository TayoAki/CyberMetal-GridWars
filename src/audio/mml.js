// A tiny MML (music macro language) compiler for the track data in tracks/*.js.
// Lengths: a whole note is 96 ticks, so `c8` is an 8th note (12 ticks), `c8.` dotted, `c12` a triplet 8th.
//
// Melodic channels
//   c d e f g a b   notes; + or # sharp, - flat; then an optional length and dots
//   r               rest
//   ^len            extend the previous note (or rest)
//   &               slur into the next note: no retrigger, the pitch glides in the same voice
//   {c e g}len      chiptune arpeggio chord over the length (octave changes inside are undone at })
//   o4 > <          octave (o4 c = middle C = MIDI 60), up, down
//   l16             default length          v0..15  volume (12 = nominal)
//   q1..8           gate in eighths of the length (q8 = legato)
//   k-2             transpose in semitones  @name   switch instrument
//   [ ... ]3        repeat a block (nesting allowed; default 2)
// Drum channels
//   a letter is a drum (see instruments.js DRUMS), (bh) hits several at once; r ^ l v [ ] work as above.
// Whitespace and | are ignored, so bar lines can be written for reading.

export const WHOLE = 96;
const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function expandRepeats(s) {
  const re = /\[([^[\]]*)\](\d*)/;
  let m;
  while ((m = re.exec(s))) {
    const n = m[2] ? Number(m[2]) : 2;
    s = s.slice(0, m.index) + ' ' + Array(n).fill(m[1]).join(' ') + ' ' + s.slice(m.index + m[0].length);
  }
  if (/[[\]]/.test(s)) throw new Error('unbalanced [ ] in MML');
  return s;
}

/** Parse one channel's MML. Returns { events, ticks }. Throws on malformed input (track data bug). */
export function parseMML(src, { drum = false, inst = null } = {}) {
  const s = expandRepeats(src || '');
  const events = [];
  let i = 0;
  let oct = 4;
  let len = 24;
  let vol = 12;
  let q = 7;
  let kt = 0;
  let cur = inst;
  let tick = 0;
  let last = null; // last note event, or 'rest'
  let slur = false;

  const uint = () => {
    const st = i;
    while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
    return st === i ? null : Number(s.slice(st, i));
  };
  const sint = () => {
    let sign = 1;
    if (s[i] === '-' || s[i] === '+') sign = s[i++] === '-' ? -1 : 1;
    const n = uint();
    if (n == null) throw new Error(`number expected at ${i}`);
    return sign * n;
  };
  const length = (dflt) => {
    const n = uint();
    let t = n == null ? dflt : WHOLE / n;
    let add = t / 2;
    while (s[i] === '.') {
      t += add;
      add /= 2;
      i++;
    }
    if (!(t > 0) || !Number.isInteger(t)) throw new Error(`bad length at ${i} (${t} ticks)`);
    return t;
  };
  const pitch = (letter) => {
    let m = (oct + 1) * 12 + NOTE[letter] + kt;
    while (s[i] === '+' || s[i] === '#' || s[i] === '-') m += s[i++] === '-' ? -1 : 1;
    return m;
  };
  const push = (ev) => {
    events.push(ev);
    last = ev;
    tick += ev.ticks;
  };
  const note = (midi, ticks, extra) => {
    if (slur && last && last !== 'rest' && last.midi != null) {
      last.pitches = last.pitches || [[0, last.midi]];
      last.pitches.push([tick - last.tick, midi]);
      last.ticks += ticks;
      last.q = q;
      tick += ticks;
    } else push({ tick, ticks, midi, vol, q, inst: cur, ...extra });
    slur = false;
  };

  while (i < s.length) {
    const c = s[i++];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '|' || c === ',') continue;
    if (c === 'l') len = length(len);
    else if (c === 'v') vol = uint() ?? vol;
    else if (c === 'q') q = Math.max(1, Math.min(8, uint() ?? q));
    else if (c === 'r') {
      tick += length(len);
      last = 'rest';
      slur = false;
    } else if (c === '^') {
      const t = length(len);
      if (last && last !== 'rest') last.ticks += t;
      tick += t;
    } else if (drum) {
      if (c === '(') {
        const drums = [];
        while (i < s.length && s[i] !== ')') if (s[i] !== ' ') drums.push(s[i++]);
        else i++;
        i++;
        push({ tick, ticks: length(len), drums, vol });
      } else if (/[a-z]/.test(c)) push({ tick, ticks: length(len), drums: [c], vol });
      else throw new Error(`unexpected '${c}' at ${i - 1} in drum MML`);
    } else if (c === 'o') oct = uint() ?? oct;
    else if (c === '>') oct++;
    else if (c === '<') oct--;
    else if (c === 'k') kt = sint();
    else if (c === '@') {
      const st = i;
      while (i < s.length && /[a-z0-9_]/i.test(s[i])) i++;
      cur = s.slice(st, i);
    } else if (c === '&') slur = true;
    else if (c in NOTE) note(pitch(c), length(len));
    else if (c === '{') {
      const save = oct;
      const ms = [];
      while (i < s.length && s[i] !== '}') {
        const d = s[i++];
        if (d in NOTE) ms.push(pitch(d));
        else if (d === '>') oct++;
        else if (d === '<') oct--;
        else if (d !== ' ') throw new Error(`unexpected '${d}' in chord at ${i - 1}`);
      }
      i++;
      oct = save;
      if (!ms.length) throw new Error('empty chord');
      note(ms[0], length(len), { arp: ms.map((m) => m - ms[0]) });
    } else throw new Error(`unexpected '${c}' at ${i - 1} in MML`);
  }
  return { events, ticks: tick };
}

/**
 * Compile a track definition:
 *   { bpm, loop, echo?, channels: [{ name, inst | kind: 'drum', vol, pan, echo, q, intro?, loop }] }
 * All channels share one timeline: the intro plays once, then the loop body repeats.
 * `introTicks`/`loopTicks` are the longest channel's; `mismatch` lists channels of another length
 * (a loop with mismatched channel lengths would drift out of sync, so tests check it is empty).
 */
export function compileTrack(def) {
  const chans = def.channels.map((ch) => {
    const drum = ch.kind === 'drum';
    const opts = { drum, inst: ch.inst ?? null };
    const pre = (ch.q ? `q${ch.q} ` : '') + (ch.l ? `l${ch.l} ` : '');
    const intro = ch.intro ? parseMML(pre + ch.intro, opts) : { events: [], ticks: 0 };
    const body = parseMML(pre + (ch.loop || ''), opts);
    return { ...ch, drum, intro, body };
  });
  const introTicks = Math.max(0, ...chans.map((c) => c.intro.ticks));
  const loopTicks = Math.max(0, ...chans.map((c) => c.body.ticks));
  const mismatch = [];
  for (const c of chans) {
    if (c.intro.ticks && c.intro.ticks !== introTicks) mismatch.push(`${c.name}: intro ${c.intro.ticks} != ${introTicks}`);
    if (c.body.ticks !== loopTicks) mismatch.push(`${c.name}: loop ${c.body.ticks} != ${loopTicks}`);
  }
  const spt = 60 / def.bpm / 24; // seconds per tick (24 ticks per quarter note)
  return { def, chans, introTicks, loopTicks, spt, introSec: introTicks * spt, loopSec: loopTicks * spt, mismatch };
}
