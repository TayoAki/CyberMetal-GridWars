import { wait, inside } from '../combat.js';

// Scurrier: a wind-up rodent bot. It skitters around its area in quick zig-zag hops, then crouches
// (counterable) and lets a crawling bomb go. The bomb runs along its row on the floor and, when it
// reaches the player's column, turns once toward the player's row. It stops at holes and explodes on the
// first body it touches. Mirrors BN3's Ratty family (HP 40/100/160/230, Null).

export const SCURRIER = {
  type: 'scurrier',
  kind: 'virus',
  mirrors: 'Ratty',
  names: ['Scurrier', 'Scurrier2', 'Scurrier3', 'ScurrierΩ'],
  hp: [40, 100, 160, 230],
  element: 'null',
  levels: [
    { attack: 20, hops: 3, hop: 16, glide: 6, windup: 24, speed: 10, rest: 56 },
    { attack: 50, hops: 4, hop: 13, glide: 5, windup: 20, speed: 8, rest: 46 },
    { attack: 80, hops: 5, hop: 10, glide: 4, windup: 16, speed: 7, rest: 38 },
    { attack: 120, hops: 6, hop: 8, glide: 3, windup: 12, speed: 5, rest: 30 },
  ],
  onSpawn(b, e) {
    e.data.vx = e.facing;
    e.data.vy = b.rng.chance(0.5) ? 1 : -1;
  },
  *ai(b, e) {
    const s = e.stats;
    e.setAnim('idle');
    yield* wait(b.rng.range(15, 40));
    let vertical = b.rng.chance(0.5);
    for (;;) {
      // Zig-zag: alternate vertical and horizontal hops, bouncing off the edges of its area.
      for (let i = 0; i < s.hops; i++) {
        yield* skitter(b, e, vertical, s);
        vertical = !vertical;
      }

      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;
      e.setAnim('attack');
      b.emit('sfx', { name: 'throw' });
      crawler(b, e, { damage: s.attack, flinch: true }, s.speed);
      yield* wait(18);
      e.setAnim('idle');
      yield* wait(s.rest);
    }
  },
};

function* skitter(b, e, vertical, s) {
  const d = vertical ? e.data.vy || 1 : e.data.vx || -1;
  const tries = vertical ? [[0, d], [0, -d]] : [[d, 0], [-d, 0]];
  const go = tries.find(([dc, dr]) => b.canEnter(e, e.col + dc, e.row + dr));
  if (!go) {
    yield* wait(s.hop >> 1);
    return;
  }
  const [dc, dr] = go;
  b.tryStep(e, dc, dr);
  if (vertical) e.data.vy = dr;
  else e.data.vx = dc;
  e.setAnim('move');
  for (let f = 1; f <= s.glide; f++) {
    const k = 1 - f / s.glide;
    e.offsetX = -dc * k;
    e.offsetY = -dr * k;
    yield;
  }
  e.offsetX = 0;
  e.offsetY = 0;
  yield* wait(Math.max(0, s.hop - s.glide));
  e.setAnim('idle');
}

// The crawling bomb (our own take on a homing ground mine): runs along the row a panel every `speed`
// frames, turns once toward the player's row in the player's column, stops at holes and bursts on the
// first body of another team it touches. View hints: data.dc/data.dr (heading), data.turned.
export function crawler(b, u, hit, speed) {
  const s = b.addSpell({ type: 'scurrybomb', team: u.team, owner: u, col: u.col + u.facing, row: u.row, dir: u.facing, hit });
  s.x = u.col;
  s.y = u.row;
  s.data.dc = u.facing;
  s.data.dr = 0;
  s.script = (function* () {
    let dc = u.facing;
    let dr = 0;
    let c = u.col + dc;
    let r = u.row;
    while (inside(c, r) && !b.field.isHole(c, r)) {
      s.col = c;
      s.row = r;
      for (let f = 0; f < speed; f++) {
        s.x += (c - s.x) / (speed - f);
        s.y += (r - s.y) / (speed - f);
        if (b.hitPanel(s, c, r)) {
          b.emit('fx', { fx: 'scurryblast', col: c, row: r, level: u.level });
          b.emit('sfx', { name: 'explode' });
          return;
        }
        yield;
      }
      if (!s.data.turned) {
        const foe = b.opponentsOf(s.team).find((e) => e.col === c && e.row !== r && e.targetable);
        if (foe) {
          dc = 0;
          dr = Math.sign(foe.row - r);
          s.data.turned = true;
          s.data.dc = 0;
          s.data.dr = dr;
        }
      }
      c += dc;
      r += dr;
    }
    // Ran into a hole: it fizzles at the edge.
    if (inside(c, r)) b.emit('fx', { fx: 'bombfizzle', col: c, row: r });
  })();
  return s;
}
