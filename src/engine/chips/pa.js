import { CHIPS } from './library.js';

// Program Advances: chip combos that fuse into one stronger attack when selected consecutively.
// Recipe shapes follow BN3's community-documented PAs (not ROM-verified: the recipe table was never
// located, see MODLOG.md dead end 2). PA damage values come from BN3's chip table rows 320-351.
//
// recipe.type:
//   'consecutive': `count` copies of one chip whose codes ascend by one letter (A,B,C or B,C,D ...)
//   'set':         the listed chips in this order, all sharing one code (`*` matches any)

const PA_ROWS = [
  // key, name, element, damage, behavior, params, recipe, desc, rom
  ['cannonade1', 'Cannonade', 'null', 40, 'pa_cannonade', { shots: 6 }, { type: 'consecutive', chip: 'cannon', count: 3 }, 'Six-shot cannon barrage.', 320],
  ['cannonade2', 'Cannonade2', 'null', 60, 'pa_cannonade', { shots: 6 }, { type: 'consecutive', chip: 'hicannon', count: 3 }, 'Six-shot HiCannon barrage.', 321],
  ['cannonade3', 'Cannonade3', 'null', 80, 'pa_cannonade', { shots: 6 }, { type: 'consecutive', chip: 'mcannon', count: 3 }, 'Six-shot M-Cannon barrage.', 322],
  ['rushpunch', 'RushPunch', 'null', 80, 'pa_rushpunch', { punches: 5 }, { type: 'consecutive', chip: 'gutpunch', count: 3 }, 'A flurry of five punches.', 323],
  ['rushstrght', 'RushStrgt', 'null', 100, 'pa_rushpunch', { punches: 5, range: 2 }, { type: 'consecutive', chip: 'gutstrgt', count: 3 }, 'Five rocket fists.', 324],
  ['stepcombo', 'StepCombo', 'null', 130, 'pa_stepcombo', { cuts: 3 }, { type: 'consecutive', chip: 'stepsword', count: 3 }, 'Dash in for three wide cuts.', 330],
  ['doombomb', 'DoomBomb', 'null', 500, 'pa_doombomb', { fuse: 150 }, { type: 'consecutive', chip: 'timebomb', count: 3 }, 'A bomb that levels the enemy area.', 332],
  ['supernova', 'Supernova', 'null', 100, 'pa_supernova', { bursts: 3 }, { type: 'consecutive', chip: 'spreader', count: 3 }, 'Three huge spreading bursts.', 333],
  ['tidalspread', 'TidlSprd', 'aqua', 300, 'pa_bigspread', { fx: 'bubble' }, { type: 'set', chips: ['bubbler', 'bubv', 'bublside'] }, 'Tidal shot that bursts all around.', 334],
  ['infernspread', 'InfrnSprd', 'fire', 300, 'pa_bigspread', { fx: 'flame' }, { type: 'set', chips: ['heatshot', 'heatv', 'heatside'] }, 'Inferno shot that bursts all around.', 335],
  ['lifesaber', 'LifeSaber', 'null', 400, 'pa_lifesaber', {}, { type: 'set', chips: ['sword', 'widesword', 'longsword'] }, 'A colossal 2x3 blade.', 336],
  ['prismsaber', 'PrismSabr', 'null', 150, 'pa_prismsaber', {}, { type: 'set', chips: ['firesword', 'aquasword', 'elecsword', 'bambsword'] }, 'Four elemental cuts at once.', 337],
  ['megarat', 'MegaRat', 'null', 500, 'pa_megarat', {}, { type: 'set', chips: ['ratton1', 'ratton2', 'ratton3'] }, 'A giant crawling bomb.', 340],
  ['aegis500', 'Aegis500', 'null', 500, 'barrier', {}, { type: 'set', chips: ['barrier', 'barr100', 'barr200'] }, 'Barrier that absorbs 500 damage.', 345],
  ['yoyostorm', 'YoYoStorm', 'null', 40, 'pa_yoyostorm', { discs: 3 }, { type: 'consecutive', chip: 'yoyo1', count: 3 }, 'Three discs down three rows.', 327],
];

export const PROGRAM_ADVANCES = [];

for (const [key, name, element, damage, behavior, params, recipe, desc, rom] of PA_ROWS) {
  const def = Object.freeze({
    key,
    name,
    element,
    damage,
    codes: '*',
    mb: 99,
    rarity: 5,
    kind: behavior === 'barrier' ? 'support' : 'attack',
    behavior,
    params: Object.freeze({ ...params }),
    desc,
    rom,
    klass: 'pa',
    recipe,
  });
  CHIPS[key] = def;
  PROGRAM_ADVANCES.push(def);
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function matches(recipe, run) {
  if (recipe.type === 'consecutive') {
    if (run.length !== recipe.count) return false;
    if (!run.every((c) => c.key === recipe.chip && c.code !== '*')) return false;
    for (let i = 1; i < run.length; i++) {
      if (LETTERS.indexOf(run[i].code) !== LETTERS.indexOf(run[i - 1].code) + 1) return false;
    }
    return true;
  }
  if (recipe.type === 'set') {
    if (run.length !== recipe.chips.length) return false;
    if (!run.every((c, i) => c.key === recipe.chips[i])) return false;
    const codes = new Set(run.map((c) => c.code).filter((c) => c !== '*'));
    return codes.size <= 1;
  }
  return false;
}

function recipeLength(r) {
  return r.type === 'consecutive' ? r.count : r.chips.length;
}

// Find the first (longest-recipe-first) contiguous run in `chips` that forms a PA.
// Returns { start, length, pa } or null. chips: [{ key, code }]
export function findProgramAdvance(chips) {
  const byLength = PROGRAM_ADVANCES.slice().sort((a, b) => recipeLength(b.recipe) - recipeLength(a.recipe));
  for (const pa of byLength) {
    const n = recipeLength(pa.recipe);
    for (let s = 0; s + n <= chips.length; s++) {
      if (matches(pa.recipe, chips.slice(s, s + n))) return { start: s, length: n, pa };
    }
  }
  return null;
}
