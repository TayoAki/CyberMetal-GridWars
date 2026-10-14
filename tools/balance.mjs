// Headless balance sweep: run the autopilot through every encounter N times and report win rate,
// average battle length and damage taken. node tools/balance.mjs [runs] [filter]
import { Battle } from '../src/engine/battle.js';
import { ENCOUNTERS } from '../src/game/data/areas.js';
import { SaveData } from '../src/game/save.js';
import { autopilot } from '../src/game/autopilot.js';

const runs = Number(process.argv[2] ?? 5);
const filter = process.argv[3] ?? '';
const save = new SaveData(null);
// A player roughly where the Gauntlet expects them: stats rise with each boss.
function playerFor(areaIndex) {
  const p = save.battlePlayer();
  p.maxHp = 100 + 80 * areaIndex;
  p.hp = p.maxHp;
  p.attack = 1 + Math.min(4, Math.floor(areaIndex / 2));
  p.rapid = 1 + Math.min(4, Math.floor(areaIndex / 3));
  p.charge = 1 + Math.min(4, Math.floor(areaIndex / 3));
  return p;
}
const areaIndex = { boot: 0, yards: 1, coolant: 2, thermal: 3, foundry: 4, overgrowth: 5, rival: 6, void: 7 };

console.log('encounter'.padEnd(12), 'win%', ' avg s', ' dmg', ' moves'.padStart(6));
for (const enc of ENCOUNTERS) {
  if (filter && !enc.id.includes(filter)) continue;
  let wins = 0;
  let frames = 0;
  let dmg = 0;
  let errors = 0;
  const bySource = {};
  for (let i = 0; i < runs; i++) {
    try {
      const b = new Battle({ seed: 100 + i * 7919, encounter: enc, player: playerFor(areaIndex[enc.area] ?? 0), shuffle: true });
      const bot = autopilot();
      let n = 0;
      while (!b.done && n++ < 60 * 240) {
        b.step(bot(b));
        for (const ev of b.drainEvents()) if (ev.type === 'hurt' && ev.id === b.player.id) bySource[ev.by ?? '?'] = (bySource[ev.by ?? '?'] ?? 0) + ev.amount;
      }
      if (b.result?.won) wins++;
      frames += b.fightFrames;
      dmg += b.stats.damageTaken;
    } catch (e) {
      errors++;
      if (errors === 1) console.error(enc.id, e.stack.split('\n').slice(0, 3).join('\n'));
    }
  }
  console.log(enc.id.padEnd(12), String(Math.round((wins / runs) * 100)).padStart(4), (frames / runs / 60).toFixed(1).padStart(6), String(Math.round(dmg / runs)).padStart(5), errors ? `ERRORS ${errors}` : '', Object.entries(bySource).sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k}:${Math.round(v / runs)}`).join(' '));
}
