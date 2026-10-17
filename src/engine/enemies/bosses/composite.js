import { wait } from '../../combat.js';
import { settle, markCounter } from './b_util.js';
import { clearPets } from './a_util.js';
import { KIT as voltframe } from './a_voltframe.js';
import { KIT as feralis } from './a_feralis.js';
import { KIT as tidecaller } from './a_tidecaller.js';
import { KIT as pyreclaw } from './a_pyreclaw.js';
import { KIT as briarix } from './b_briarix.js';
import { KIT as ironclad } from './b_ironclad.js';
import { KIT as sabre } from './b_sabre.js';
import { KIT as zeroday } from './b_zeroday.js';

// GridWars Daily's bosses: a new navi every day, put together from the eight bosses' moves. A recipe names
// the family whose way of moving between attacks it borrows (blinks, leaps, a guard...) and the moves it
// fights with ('family.move'); each move plays exactly as its own boss plays it, with that boss's numbers
// at the recipe's tier. src/daily/recipe.js draws a day's recipe.
//
//   recipe: { type, name, element, tier (1-4), hp, mover, moves: ['voltframe.arcbolt', ...],
//             flying?, superArmor?, immovable?, power?, tune?: { family: { stat: value } } }
//
// `power` scales every damage number (each kit lists its damage stats), so a boss can keep a tier's speed
// and tells but hit softer; `tune` then overrides single numbers (the Daily softens Dark Aura this way).

export const KITS = { voltframe, feralis, tidecaller, pyreclaw, briarix, ironclad, sabre, zeroday };

// The kit entry for 'family.move', or null.
export function kitMove(id) {
  const [fam, key] = String(id).split('.');
  return KITS[fam]?.moves[key] ?? null;
}

// Whether a move exists at a tier (Neon Field needs V3, Dark Aura V2...).
export function moveAtTier(id, tier) {
  const def = kitMove(id);
  if (!def) return false;
  const s = KITS[id.split('.')[0]].family.levels[tier - 1];
  return !def.has || !!def.has(s);
}

// Run a move or mover, calling each family's per-frame hook as it goes.
function* ticking(b, e, gen, ticks) {
  if (!ticks.length) return yield* gen;
  for (;;) {
    const r = gen.next();
    if (r.done) return r.value;
    for (const t of ticks) t(b, e);
    yield;
  }
}

export function compositeBoss(recipe) {
  const tier = Math.max(1, Math.min(4, recipe.tier | 0));
  const mover = KITS[recipe.mover];
  if (!mover) throw new Error(`unknown mover ${recipe.mover}`);
  const parts = recipe.moves.map((id) => {
    const def = kitMove(id);
    if (!def) throw new Error(`unknown move ${id}`);
    const [fam, key] = id.split('.');
    return { id, fam, key, def, usable: moveAtTier(id, tier) && def.weight > 0 };
  });
  const families = [...new Set([recipe.mover, ...parts.map((p) => p.fam)])];
  const power = recipe.power ?? 1;
  const stats = Object.fromEntries(
    families.map((f) => {
      const s = { ...KITS[f].family.levels[tier - 1] };
      if (power !== 1) for (const k of KITS[f].damage) if (s[k] > 0) s[k] = Math.max(5, Math.round((s[k] * power) / 5) * 5);
      return [f, { ...s, ...(recipe.tune?.[f] ?? {}) }];
    }),
  );
  const ticks = families.map((f) => KITS[f].tick).filter(Boolean);
  const openers = parts.filter((p) => p.def.opener && moveAtTier(p.id, tier));
  const dues = parts.filter((p) => p.def.due && moveAtTier(p.id, tier));
  // When nothing else can be picked: the first move that is always there.
  const fallback = parts.find((p) => p.usable && !p.def.ok) ?? parts.find((p) => p.usable) ?? parts[0];
  const attack = Math.max(...families.map((f) => stats[f].attack ?? 0), 1);

  function note(e, p) {
    const m = e.data.picks ?? (e.data.picks = {});
    m[p.id] = (m[p.id] ?? 0) + 1;
    const h = e.data.pickHistory ?? (e.data.pickHistory = []);
    h.push(p.id);
    if (h.length > 4) h.shift();
    e.data.lastPick = p.id;
  }

  // Weighted choice with b.rng: `again` is a move's weight right after it was used, and no move is picked
  // three times running while another can be. e.data.forceMove ('family.move', set by tests) wins once.
  function choose(b, e) {
    const forced = e.data.forceMove && parts.find((p) => p.id === e.data.forceMove);
    if (forced) {
      e.data.forceMove = null;
      return forced;
    }
    const last = e.data.lastPick;
    let opts = [];
    for (const p of parts) {
      if (!p.usable || (p.def.ok && !p.def.ok(b, e, stats[p.fam]))) continue;
      const w = last === p.id && p.def.again !== undefined ? p.def.again : p.def.weight;
      if (w > 0) opts.push([p, w]);
    }
    const h = e.data.pickHistory ?? [];
    if (h.length >= 2 && h[h.length - 1] === h[h.length - 2]) {
      const other = opts.filter(([p]) => p.id !== h[h.length - 1]);
      if (other.length) opts = other;
    }
    if (!opts.length) return fallback;
    let total = 0;
    for (const [, w] of opts) total += w;
    let roll = b.rng.next() * total;
    for (const [p, w] of opts) {
      roll -= w;
      if (roll < 0) return p;
    }
    return opts[opts.length - 1][0];
  }

  function* play(b, e, p, o) {
    note(e, p);
    b.emit('bossmove', { id: e.id, move: p.id, name: p.def.name });
    const s = stats[p.fam];
    yield* ticking(b, e, p.def.fn(b, e, s, o), ticks);
    e.setAnim('idle');
    const rest = KITS[p.fam].rest?.(s) ?? 0;
    if (rest > 0) yield* ticking(b, e, wait(rest), ticks);
  }

  return {
    type: recipe.type ?? 'daily',
    kind: 'navi',
    mirrors: 'GridWars Daily',
    names: [recipe.name, recipe.name, recipe.name, recipe.name],
    hp: [recipe.hp, recipe.hp, recipe.hp, recipe.hp],
    element: recipe.element ?? 'null',
    flying: !!recipe.flying,
    superArmor: !!recipe.superArmor,
    levels: [0, 1, 2, 3].map(() => ({ attack })),
    recipe,
    parts: parts.map(({ id, def, usable }) => ({ id, name: def.name, element: def.element, desc: def.desc, usable, support: !!def.support })),
    onSpawn(b, e) {
      e.data.moves = {};
      e.data.picks = {};
      e.data.pets = [];
      e.data.lampReady = 0;
      e.data.rockReady = 0;
      e.data.brazierReady = 180;
      if (recipe.immovable) e.immovable = true;
    },
    *ai(b, e) {
      settle(e);
      e.data.warn?.kill();
      e.data.warn = null;
      e.data.relock = false;
      e.setAnim('idle');
      if (!e.data.started) {
        e.data.started = true;
        yield* wait(b.rng.range(18, 32));
        for (const p of openers) yield* play(b, e, p);
      } else yield* wait(10);
      if (mover.start) yield* mover.start(b, e, stats[recipe.mover]);
      for (;;) {
        const answer = yield* ticking(b, e, mover.mover(b, e, stats[recipe.mover]), ticks);
        // A guard's riposte answers with the mover family's own move, when the recipe has it.
        const riposte = answer ? parts.find((p) => p.fam === recipe.mover && p.key === answer && p.usable) : null;
        if (riposte) {
          yield* play(b, e, riposte, { riposte: true });
          continue;
        }
        const due = dues.find((p) => p.def.due(b, e, stats[p.fam]));
        yield* play(b, e, due ?? choose(b, e));
      }
    },
    onHit(b, e, hit, res) {
      markCounter(b, e, hit);
      if (res.dealt > 0) e.data.stung = true;
    },
    onFlinch(b, e) {
      e.data.warn?.kill();
      e.data.warn = null;
      if (e.data.jet) {
        e.data.jet.kill();
        e.data.jet = null;
      }
      e.data.flinched = true;
      settle(e);
    },
    onDelete(b, e) {
      e.data.jet?.kill();
      e.data.warn?.kill();
      clearPets(b, e);
    },
  };
}
