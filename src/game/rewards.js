import { CHIPS } from '../engine/chips/library.js';
import { PROGRAMS } from './save.js';
import { BOSS_CHIPS } from './data/areas.js';

// Battle rewards, BN-style: the better the rank, the better the drop. Ranks 7+ earn a chip from the
// battle's drop table, S earns its rare chip; lower ranks earn Bits (the game's currency).

function rankNum(level) {
  return level === 'S' ? 11 : Number(level) || 1;
}

function parse(id) {
  const [key, code] = id.split(':');
  return { key, code };
}

export function rollReward(save, enc, result, rng) {
  const r = rankNum(result.bustingLevel);
  if (r >= 11 && enc.rare?.length) return { type: 'chip', ...parse(rng.pick(enc.rare)) };
  if (r >= 7 && enc.drops?.length) return { type: 'chip', ...parse(rng.pick(enc.drops)) };
  return { type: 'bits', amount: 20 + r * 15 };
}

const STAT_LABEL = { hp: 'HP +20', attack: 'ATTACK +1', rapid: 'RAPID +1', charge: 'CHARGE +1' };

// First clear: the boss's Navi chip plus the area's upgrade. Rematches at higher versions award that
// version's Navi chip on rank 8+ (S guarantees it), otherwise Bits.
export function bossReward(save, enc, version, result) {
  const type = enc.enemies[0].type;
  const first = !save.data.progress.bosses[type];
  const chips = BOSS_CHIPS[type] ?? [];
  const r = rankNum(result.bustingLevel);
  if (first && enc.reward) {
    const chip = parse(enc.reward.chip);
    const extra = enc.reward.stat ? { stat: enc.reward.stat } : enc.reward.program ? { program: enc.reward.program } : {};
    const label = `${CHIPS[chip.key]?.name ?? chip.key} ${chip.code}` + (extra.stat ? ` + ${STAT_LABEL[extra.stat]}` : extra.program ? ` + ${PROGRAMS[extra.program]?.name}` : '');
    return { type: 'chip', ...chip, ...extra, label };
  }
  const id = chips[Math.min(chips.length - 1, Math.max(0, version - 1))];
  if (id && r >= 8) return { type: 'chip', ...parse(id) };
  return { type: 'bits', amount: 200 * version };
}

export function applyReward(save, rw) {
  const d = save.data;
  if (rw.type === 'chip' && CHIPS[rw.key]) save.addChip(rw.key, rw.code);
  if (rw.type === 'bits') d.bits += rw.amount;
  if (rw.stat === 'hp') d.stats.hpMem++;
  else if (rw.stat && d.stats[rw.stat] !== undefined) d.stats[rw.stat] = Math.min(5, d.stats[rw.stat] + 1);
  if (rw.program && !d.programs.owned.includes(rw.program)) d.programs.owned.push(rw.program);
  save.persist();
}
