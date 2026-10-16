import { CHIPS } from '../../engine/chips/library.js';
import { PROGRAM_ADVANCES, findProgramAdvance } from '../../engine/chips/pa.js';
import { AREAS } from './areas.js';
import { STARTER_FOLDER } from './folders.js';

// Fusions (Program Advances) against the game's chips: where each can be built from (the help's fusion
// list) and which ones a folder can make (the folder menu).

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The best set of a fusion's chips that `have` ('key:code' -> rank, lower is better) can supply, in pick
// order: { pieces: [{ key, code }], rank } with the rank of its worst chip, or null.
function bestPieces(pa, have) {
  const r = pa.recipe;
  const options = [];
  if (r.type === 'consecutive') {
    for (let s = 0; s + r.count <= LETTERS.length; s++) options.push([...Array(r.count).keys()].map((i) => ({ key: r.chip, code: LETTERS[s + i] })));
  } else {
    for (const L of [...LETTERS, '*']) options.push(r.chips.map((key) => ({ key, code: have.has(`${key}:${L}`) ? L : '*' })));
  }
  let best = null;
  for (const pieces of options) {
    if (!pieces.every((c) => have.has(`${c.key}:${c.code}`)) || findProgramAdvance(pieces)?.pa !== pa) continue;
    const rank = Math.max(...pieces.map((c) => have.get(`${c.key}:${c.code}`)));
    if (!best || rank < best.rank) best = { pieces, rank };
  }
  return best;
}

// How the pieces read: "Cannon A B C", or "Sword WideSwrd LongSwrd L" for a set.
function recipeText(pa, pieces) {
  const r = pa.recipe;
  const name = (key) => CHIPS[key].name;
  if (r.type === 'consecutive') return `${name(r.chip)} ${pieces.map((c) => c.code).join(' ')}`.trim();
  return `${r.chips.map(name).join(' ')} ${pieces.find((c) => c.code !== '*')?.code ?? '*'}`;
}

// 'key:code' -> the first Gauntlet area it drops in (0 for the starter folder). Rares are left out, since
// they need an S rank; the shop sells the drops of every area reached.
function firstAreas() {
  const at = new Map();
  const put = (id, area) => {
    if (!at.has(id) || at.get(id) > area) at.set(id, area);
  };
  for (const [key, code] of STARTER_FOLDER) put(`${key}:${code}`, 0);
  AREAS.forEach((a, i) => {
    for (const b of a.battles) for (const id of b.drops ?? []) put(id, i);
  });
  return at;
}

// Every fusion, with the earliest area whose drops (and the starter folder) hold a set of its chips:
// [{ pa, pieces, area, text }]; `area` is -1 if the drops can't build it.
export function fusionSources() {
  const at = firstAreas();
  return PROGRAM_ADVANCES.map((pa) => {
    const best = bestPieces(pa, at);
    const pieces = best?.pieces ?? [];
    return { pa, pieces, area: best ? best.rank : -1, text: best ? recipeText(pa, pieces) : '' };
  });
}

// The fusions a folder's chips can make: [{ pa, text }].
export function folderFusions(chips) {
  const have = new Map(chips.map((c) => [`${c.key}:${c.code}`, 0]));
  return PROGRAM_ADVANCES.flatMap((pa) => {
    const best = bestPieces(pa, have);
    return best ? [{ pa, text: recipeText(pa, best.pieces) }] : [];
  });
}
