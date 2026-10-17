import { Battle } from '../engine/battle.js';
import { ENEMIES, registerEnemy } from '../engine/enemies/index.js';
import { compositeBoss } from '../engine/enemies/bosses/composite.js';
import { PRESET_BY_KEY, expandFolder } from '../game/data/folders.js';
import { playerFor } from './recipe.js';

// A Daily duel: today's boss (registered once as its own enemy type) against the player's navi, with a
// pre-built folder and the HP and buster for the boss's tier. The battle engine is the Gauntlet's own.

export const FOLDERS = ['elemental', 'starter', 'cannon', 'sword', 'blade', 'demolition', 'prism'];

// The folders whose chips can break a Dark Aura (one hit of 100 or more): PRISM's elemental swords and
// DEMOLITION's bombs and rats.
export const AURA_BREAKERS = ['prism', 'demolition'];

// The folder that suits a boss: against a Dark Aura one that can break it; else ELEMENTAL, which carries
// every element, so it has what any elemental boss fears; a Null boss has no weakness: one by the day.
export function suggestedFolder(recipe) {
  if (recipe.moves.includes('zeroday.aura')) return AURA_BREAKERS[recipe.day % 2];
  return recipe.weakness ? 'elemental' : ['cannon', 'blade', 'demolition', 'prism'][recipe.day % 4];
}

export function dailyBattle(recipe, { folder = suggestedFolder(recipe), seed = recipe.seed, look = null, name = 'NAVI' } = {}) {
  if (!ENEMIES[recipe.type]) registerEnemy(compositeBoss(recipe));
  const chips = expandFolder((PRESET_BY_KEY[folder] ?? PRESET_BY_KEY.elemental).chips);
  return new Battle({
    seed,
    shuffle: true,
    encounter: { enemies: [{ type: recipe.type, level: recipe.tier, col: 4, row: 1 }], field: recipe.field },
    player: { name, folder: chips, look, ...playerFor(recipe.tier) },
  });
}
