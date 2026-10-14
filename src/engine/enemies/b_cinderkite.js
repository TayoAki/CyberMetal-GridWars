import { wait, drop, marker } from '../combat.js';
import { COLS, ROWS, ELEMENT, PANEL } from '../constants.js';

// Cinderkite: an ember kite riding the heat over its area. It drifts from panel to panel, then flares
// (counterable) and calls a shower of meteors onto the player's area: the first one aimed at the
// player's panel, the rest at random panels, each telegraphed by a target mark before it lands and
// cracks the floor. Higher levels call more meteors, aim more of them and drop them faster. Only one
// kite calls meteors at a time. Mirrors BN3's Metrid family (HP 150/200/250/300, Fire).

export const CINDERKITE = {
  type: 'cinderkite',
  kind: 'virus',
  mirrors: 'Metrid',
  names: ['Cinderkite', 'Cinderkt2', 'Cinderkt3', 'CinderktΩ'],
  hp: [150, 200, 250, 300],
  element: 'fire',
  flying: true,
  levels: [
    { attack: 30, meteors: 3, aimed: 1, delay: 50, gap: 18, drifts: 3, step: 30, glide: 14, windup: 36, rest: 64 },
    { attack: 50, meteors: 4, aimed: 1, delay: 46, gap: 15, drifts: 3, step: 26, glide: 12, windup: 32, rest: 54 },
    { attack: 80, meteors: 5, aimed: 2, delay: 42, gap: 12, drifts: 3, step: 22, glide: 11, windup: 28, rest: 46 },
    { attack: 120, meteors: 7, aimed: 3, delay: 36, gap: 9, drifts: 2, step: 18, glide: 10, windup: 24, rest: 36 },
  ],
  *ai(b, e) {
    const s = e.stats;
    e.setAnim('idle');
    yield* wait(b.rng.range(20, 50));
    for (;;) {
      const n = b.rng.range(1, s.drifts);
      for (let i = 0; i < n; i++) yield* drift(b, e, s);
      if (!b.claimToken('cinderkite', e)) {
        yield* wait(12);
        continue;
      }

      e.setAnim('windup');
      e.counterWindow = s.windup;
      b.emit('sfx', { name: 'flame' });
      yield* wait(s.windup);
      e.counterWindow = 0;

      e.setAnim('attack');
      b.emit('sfx', { name: 'summon' });
      const hit = { damage: s.attack, element: ELEMENT.FIRE, flinch: true };
      const every = Math.ceil(s.meteors / Math.max(1, s.aimed));
      const used = new Set();
      for (let i = 0; i < s.meteors; i++) {
        const p = b.player;
        let cell = null;
        if (i % every === 0 && !b.field.isHole(p.col, p.row)) cell = [p.col, p.row];
        else cell = randomTarget(b, e, used);
        if (cell) {
          used.add(cell[0] + cell[1] * COLS);
          meteor(b, e, hit, cell[0], cell[1], s.delay);
        }
        yield* wait(s.gap);
      }
      yield* wait(16);
      e.setAnim('idle');
      b.releaseToken('cinderkite', e);
      yield* wait(s.rest);
    }
  },
  onFlinch(b, e) {
    b.releaseToken('cinderkite', e);
  },
};

// One meteor: a target mark on the floor (a no-hit marker, drawn under bodies) and the telegraphed drop
// itself. The drop keeps z at the meteor's height while it falls so the view draws it above bodies.
function meteor(b, e, hit, c, r, delay) {
  marker(b, e, 'kitemark', c, r, delay);
  const m = drop(b, e, hit, c, r, { delay, type: 'kitemeteor', crack: true, landFx: e.level >= 4 ? 'kiteburstv' : 'kiteburst' });
  const inner = m.script;
  m.z = FALL_HEIGHT;
  m.script = (function* () {
    for (;;) {
      if (inner.next().done) return;
      m.z = m.data.landed ? 0 : Math.max(1, Math.round(FALL_HEIGHT * (1 - (m.data.progress ?? 0))));
      yield;
    }
  })();
  return m;
}

const FALL_HEIGHT = 96;

// Glide one panel to a random free neighbour (or hover in place when boxed in). The body owns the new
// panel at once; offsetX/offsetY ease the view across.
function* drift(b, e, s) {
  const dirs = b.rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  const go = dirs.find(([dc, dr]) => b.canEnter(e, e.col + dc, e.row + dr));
  if (go) {
    const [dc, dr] = go;
    b.moveEntity(e, e.col + dc, e.row + dr);
    e.setAnim('move');
    for (let f = 1; f <= s.glide; f++) {
      const k = 1 - f / s.glide;
      const ease = k * k * (3 - 2 * k);
      e.offsetX = -dc * ease;
      e.offsetY = -dr * ease;
      yield;
    }
    e.offsetX = 0;
    e.offsetY = 0;
    e.setAnim('idle');
  }
  yield* wait(go ? Math.max(0, s.step - s.glide) : s.step);
}

// A random panel of the opponent's area that is not a hole and was not already targeted this volley.
function randomTarget(b, e, used) {
  const cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (b.field.ownerAt(c, r) === e.team) continue;
      if (b.field.typeAt(c, r) === PANEL.BROKEN) continue;
      if (used.has(c + r * COLS)) continue;
      cells.push([c, r]);
    }
  }
  return cells.length ? b.rng.pick(cells) : null;
}
