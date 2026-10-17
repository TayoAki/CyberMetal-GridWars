import { dailyRecipe } from '../src/daily/recipe.js';
import { dailyBattle } from '../src/daily/fight.js';
import { Recorder, outcome } from '../src/daily/replay.js';
import { autopilot } from '../src/game/autopilot.js';
import { compatible } from '../src/engine/custom.js';

// GridWars Daily test helpers.

// Play day d's fight as a player would: chips picked by tapping (recorded ops), the fight by the autopilot.
export function recordFight(d, { folder, frames = 20000, late = 0 } = {}) {
  const r = dailyRecipe(d);
  const b = dailyBattle(r, { folder });
  const boss = b.entities.find((e) => e.kind === 'navi');
  const rec = new Recorder();
  const bot = autopilot();
  const queue = [];
  for (let f = 0; f < frames && !b.done; f++) {
    let pad = {};
    if (b.phase === 'custom') {
      const cs = b.custom;
      if (f % 7 === 0) {
        const i = cs.hand.findIndex((c, k) => !cs.selected.includes(k) && compatible([...cs.selectedChips(), c]));
        if (i >= 0 && cs.selected.length < 3) rec.op(b, 's', i);
        else rec.op(b, 'c');
      }
    } else {
      queue.push(bot(b));
      pad = queue.length > late ? queue.shift() : {};
    }
    rec.pad(pad);
    b.step(pad);
  }
  return { r, b, run: rec.finish({ day: d, folder: folder ?? null }), live: outcome(b, boss) };
}

