import { LIMITS } from './constants.js';
import { chipDef } from './chips/library.js';
import { findProgramAdvance, PROGRAM_ADVANCES } from './chips/pa.js';

// The Custom Screen: draws a hand from the shuffled folder each turn and enforces BN's selection rule —
// every selected chip must be the same chip, or share one code, with `*` matching any code. Unchosen
// chips stay in the hand for next turn. ADD skips the turn for 5 more chips (max 10 shown).
//
// Cursor layout (the view mirrors it): chip slots in a 5x2 grid (x 0-4, y 0-1, slot = y*5+x), and a
// button column at x = 5 with OK (y 0) and ADD (y 1).

export const SLOTS_PER_ROW = 5;

export function compatible(chips) {
  if (chips.length <= 1) return true;
  if (chips.every((c) => c.key === chips[0].key)) return true;
  const codes = new Set(chips.map((c) => c.code).filter((c) => c !== '*'));
  return codes.size <= 1;
}

export class CustomScreen {
  constructor(b, folder, handSize, opts = {}) {
    this.b = b;
    this.handSize = handSize;
    this.bonus = 0;
    let uid = 1;
    const deck = folder.map((c) => ({ uid: uid++, key: c.key, code: c.code }));
    this.deck = opts.shuffle === false ? deck : b.rng.shuffle(deck);
    this.hand = [];
    this.selected = []; // hand indices, in selection order
    this.cursor = { x: 0, y: 0 };
    this.open = false;
    this.info = false;
    this.lastResult = null;
  }

  get handTarget() {
    return Math.min(LIMITS.HAND_MAX, this.handSize + this.bonus);
  }

  openTurn() {
    const target = this.handTarget;
    this.bonus = 0;
    while (this.hand.length < target && this.deck.length > 0) this.hand.push(this.deck.shift());
    this.selected = [];
    this.cursor = { x: 0, y: 0 };
    if (this.hand.length === 0) this.cursor = { x: SLOTS_PER_ROW, y: 0 };
    this.open = true;
  }

  selectedChips() {
    return this.selected.map((i) => this.hand[i]);
  }

  canSelect(i) {
    if (i < 0 || i >= this.hand.length) return false;
    if (this.selected.includes(i)) return false;
    if (this.selected.length >= LIMITS.SELECT_MAX) return false;
    return compatible([...this.selectedChips(), this.hand[i]]);
  }

  select(i) {
    if (!this.canSelect(i)) return false;
    this.selected.push(i);
    return true;
  }

  deselectLast() {
    return this.selected.pop() !== undefined;
  }

  canAdd() {
    return this.selected.length === 0 && this.hand.length < LIMITS.HAND_MAX;
  }

  // ---- cursor

  slotAt(x, y) {
    return x < SLOTS_PER_ROW ? y * SLOTS_PER_ROW + x : -1;
  }

  validCursor(x, y) {
    if (x === SLOTS_PER_ROW) return y === 0 || y === 1;
    if (x < 0 || x > SLOTS_PER_ROW || y < 0 || y > 1) return false;
    return this.slotAt(x, y) < this.hand.length;
  }

  moveCursor(dx, dy) {
    let { x, y } = this.cursor;
    if (dx) {
      let nx = x + dx;
      while (nx >= 0 && nx < SLOTS_PER_ROW && !this.validCursor(nx, y)) nx += dx;
      if (nx > SLOTS_PER_ROW) nx = SLOTS_PER_ROW;
      if (nx < 0) nx = x;
      if (nx === SLOTS_PER_ROW || this.validCursor(nx, y)) x = nx;
    }
    if (dy) {
      const ny = Math.max(0, Math.min(1, y + dy));
      if (this.validCursor(x, ny)) y = ny;
      else if (x < SLOTS_PER_ROW) {
        // Snap to the nearest filled slot in the other row.
        for (let nx = x; nx >= 0; nx--) {
          if (this.validCursor(nx, ny)) {
            x = nx;
            y = ny;
            break;
          }
        }
      }
    }
    const moved = x !== this.cursor.x || y !== this.cursor.y;
    this.cursor = { x, y };
    return moved;
  }

  get cursorTarget() {
    const { x, y } = this.cursor;
    if (x === SLOTS_PER_ROW) return y === 0 ? 'ok' : 'add';
    return this.slotAt(x, y);
  }

  // ---- input

  handleInput(pad) {
    const b = this.b;
    const p = pad.pressed;
    if (p.left && this.moveCursor(-1, 0)) b.emit('sfx', { name: 'cursor' });
    if (p.right && this.moveCursor(1, 0)) b.emit('sfx', { name: 'cursor' });
    if (p.up && this.moveCursor(0, -1)) b.emit('sfx', { name: 'cursor' });
    if (p.down && this.moveCursor(0, 1)) b.emit('sfx', { name: 'cursor' });
    if (p.start) {
      this.cursor = { x: SLOTS_PER_ROW, y: 0 };
      b.emit('sfx', { name: 'cursor' });
    }
    if (p.l || p.r) this.info = !this.info;
    if (p.b) {
      if (this.deselectLast()) b.emit('sfx', { name: 'deselect' });
      else b.emit('sfx', { name: 'buzz' });
    }
    if (p.a) {
      const t = this.cursorTarget;
      if (t === 'ok') this.confirm();
      else if (t === 'add') {
        if (this.canAdd()) this.add();
        else b.emit('sfx', { name: 'buzz' });
      } else if (this.select(t)) {
        b.emit('sfx', { name: 'select' });
        if (this.selected.length >= LIMITS.SELECT_MAX) this.cursor = { x: SLOTS_PER_ROW, y: 0 };
      } else b.emit('sfx', { name: 'buzz' });
    }
  }

  add() {
    this.bonus = LIMITS.ADD_BONUS;
    this.selected = [];
    this.open = false;
    this.b.emit('sfx', { name: 'confirm' });
    this.lastResult = { queue: [], pa: null, added: true };
    this.b.onCustomConfirm([], null);
  }

  confirm() {
    const chosen = this.selectedChips();
    const sel = new Set(this.selected);
    this.hand = this.hand.filter((_, i) => !sel.has(i));
    this.selected = [];
    this.open = false;
    const { queue, pa } = resolveQueue(chosen, this.b);
    this.lastResult = { queue, pa, added: false };
    this.b.emit('sfx', { name: 'confirm' });
    this.b.onCustomConfirm(queue, pa);
  }
}

// Turn the chosen chips into the battle queue: fuse a Program Advance, then fold boost chips into the chip
// before them (a boost with nothing valid before it is wasted, as in BN).
export function resolveQueue(chosen, b = null) {
  let list = chosen.map((c) => ({ key: c.key, code: c.code }));
  let pa = null;
  const found = findProgramAdvance(list);
  if (found) {
    pa = found.pa;
    list = [...list.slice(0, found.start), { key: pa.key, code: list[found.start].code }, ...list.slice(found.start + found.length)];
  }
  const queue = [];
  for (const c of list) {
    const def = chipDef(c.key);
    if (def.kind === 'boost') {
      const prev = queue[queue.length - 1];
      if (prev && boostApplies(def, prev)) {
        prev.damage += def.damage;
        prev.boost += def.damage;
      }
      continue;
    }
    queue.push({ key: def.key, name: def.name, code: c.code, damage: def.damage, element: def.element, kind: def.kind, klass: def.klass, boost: 0, def });
  }
  return { queue, pa };
}

function boostApplies(boost, chip) {
  const kind = boost.params.boost;
  if (kind === 'atk') return chip.kind === 'attack';
  if (kind === 'navi') return chip.kind === 'navi';
  return chip.kind === 'attack' && chip.element === kind;
}

// ---- fusion hints

// What the Custom Screen tells the player about fusions (Program Advances) in a hand, best first:
//   { pa, ready: true }                 the chips picked so far make one
//   { pa, picks, done }                 the hand can make one: hand indices in pick order, of which the
//                                       first `done` are already picked (as the latest picks)
//   { pa, picks, done: 0, undo: true }  the hand could make one, but not after the chips picked so far
//   { pa, keep, missing }               all but one piece is in the hand and the last ({ key, code }) is
//                                       still in the folder: the hand indices worth holding for it
// or null. `deck` is what is left of the folder.
export function fusionHint(hand, selected, deck = []) {
  const made = findProgramAdvance(selected.map((i) => hand[i]));
  if (made) return { pa: made.pa, ready: true };
  const run = nextFusion(hand, selected);
  if (run) return run;
  const fresh = selected.length ? nextFusion(hand, []) : null;
  if (fresh) return { ...fresh, undo: true };
  return keepForFusion(hand, deck);
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The ways a hand might make a fusion, as pieces in pick order: for an "in a row" fusion each run of codes
// that touches a code in the hand, for a set each code in the hand (and all `*`).
function fusionShapes(pa, hand) {
  const r = pa.recipe;
  const shapes = [];
  if (r.type === 'consecutive') {
    const starts = new Set();
    for (const c of hand) {
      const at = LETTERS.indexOf(c.code);
      if (c.key !== r.chip || at < 0) continue;
      for (let s = Math.max(0, at - r.count + 1); s <= Math.min(at, LETTERS.length - r.count); s++) starts.add(s);
    }
    for (const s of starts) shapes.push([...Array(r.count).keys()].map((i) => ({ key: r.chip, code: LETTERS[s + i] })));
  } else {
    const codes = new Set(['*']);
    for (const c of hand) if (r.chips.includes(c.key)) codes.add(c.code);
    for (const code of codes) shapes.push(r.chips.map((key) => ({ key, code, star: true })));
  }
  return shapes;
}

// A set piece also takes a `*` copy of its chip.
const fits = (chip, piece) => chip.key === piece.key && (chip.code === piece.code || (piece.star && chip.code === '*'));

// The fusion the hand can still finish after the chips picked so far, preferring one already started.
function nextFusion(hand, selected) {
  const chosen = selected.map((i) => hand[i]);
  let best = null;
  for (const pa of PROGRAM_ADVANCES) {
    for (const shape of fusionShapes(pa, hand)) {
      for (let done = Math.min(shape.length - 1, selected.length); done >= 0; done--) {
        const tail = selected.slice(selected.length - done);
        if (!tail.every((i, j) => fits(hand[i], shape[j]))) continue;
        const used = new Set(selected);
        const rest = [];
        for (const piece of shape.slice(done)) {
          const i = hand.findIndex((c, k) => !used.has(k) && fits(c, piece));
          if (i < 0) break;
          used.add(i);
          rest.push(i);
        }
        if (rest.length < shape.length - done) continue;
        const all = [...chosen, ...rest.map((i) => hand[i])];
        if (all.length > LIMITS.SELECT_MAX || !compatible(all) || findProgramAdvance(all)?.pa !== pa) continue;
        const score = done * 100 + shape.length * 10 + pa.damage / 1000;
        if (!best || score > best.score) best = { pa, picks: [...tail, ...rest], done, score };
        break;
      }
    }
  }
  return best && { pa: best.pa, picks: best.picks, done: best.done };
}

// All but one piece of a fusion in the hand, with the last still to be dealt.
function keepForFusion(hand, deck) {
  let best = null;
  for (const pa of PROGRAM_ADVANCES) {
    for (const shape of fusionShapes(pa, hand)) {
      const used = new Set();
      const missing = [];
      for (const piece of shape) {
        const i = hand.findIndex((c, k) => !used.has(k) && fits(c, piece));
        if (i < 0) missing.push(piece);
        else used.add(i);
      }
      const last = missing.length === 1 ? deck.find((c) => fits(c, missing[0])) : null;
      if (!last) continue;
      const score = shape.length * 10 + pa.damage / 1000;
      if (!best || score > best.score) best = { pa, keep: [...used], missing: { key: last.key, code: last.code }, score };
    }
  }
  return best && { pa: best.pa, keep: best.keep, missing: best.missing };
}
