// Enemy registry. Each family mirrors one BN3 virus or navi's behaviour pattern under this game's own name
// and design; HP and element per level come from BN3's enemy stat table (see MODLOG.md). Levels 1-3 are
// the normal variants and level 4 is the Ω variant.
//
// A family module exports a definition:
//   { type, kind: 'virus' | 'navi', names: [..4], hp: [..4], element: [..4] | 'null',
//     levels: [{ attack, ...tuning }, x4], ai: function* (battle, entity), flying?, superArmor?,
//     onSpawn?, onHit?, onFlinch?, onDelete?, mirrors: 'BN3 family it is calibrated from' }

import { RIVET } from './rivet.js';
import { PLINKER } from './plinker.js';
import { DARTFIN } from './dartfin.js';

export const ENEMIES = Object.create(null);

export function registerEnemy(def) {
  ENEMIES[def.type] = def;
}

for (const def of [RIVET, PLINKER, DARTFIN]) registerEnemy(def);

export function makeEnemyStats(fam, level) {
  const i = Math.max(0, Math.min(3, (level | 0) - 1));
  const el = Array.isArray(fam.element) ? fam.element[i] : fam.element ?? 'null';
  return {
    name: fam.names?.[i] ?? fam.type,
    hp: fam.hp[i],
    element: el,
    level: i + 1,
    ...(fam.levels?.[i] ?? {}),
  };
}
