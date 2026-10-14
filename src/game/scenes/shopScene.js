import { rect, frame } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawChipArt, drawElementIcon } from '../../render/chipart.js';
import { CHIPS } from '../../engine/chips/library.js';
import { AREAS } from '../data/areas.js';
import { drawHints, UI } from '../ui.js';

// The Chip Shop: spend Bits on chips from the areas you've reached, and on HP Memory (its price rises
// with each one, like the shops in BN).

const PRICE = { 1: 300, 2: 800, 3: 1800, 4: 3500, 5: 6000 };
const ROWS_VISIBLE = 9;

function stockFor(save) {
  const p = save.data.progress;
  const seen = new Set();
  const out = [{ kind: 'hp', label: 'HP Memory', price: 1000 + 500 * save.data.stats.hpMem }];
  const add = (id) => {
    if (seen.has(id)) return;
    const [key, code] = id.split(':');
    const def = CHIPS[key];
    if (!def || def.klass !== 'standard') return;
    seen.add(id);
    out.push({ kind: 'chip', key, code, def, price: PRICE[def.rarity] ?? 1000 });
  };
  AREAS.forEach((a, i) => {
    if (!(p.finished || i <= p.area)) return;
    for (const b of a.battles) for (const id of b.drops ?? []) add(id);
  });
  // Staples always on the shelf.
  for (const id of ['recov30:*', 'recov50:C', 'barrier:E', 'atk10:*', 'invis:*']) {
    if (p.area >= 1 || id === 'recov30:*') add(id);
  }
  return out;
}

export class ShopScene {
  constructor(game) {
    this.game = game;
    this.cursor = 0;
    this.scroll = 0;
    this.t = 0;
    this.msg = null;
    this.stock = stockFor(game.save);
  }

  enter() {
    this.game.audio.music('menu');
  }

  update(held, edges) {
    this.t++;
    if (this.msg && --this.msg.ttl <= 0) this.msg = null;
    const n = this.stock.length;
    let moved = false;
    if (edges.repeat.up && this.cursor > 0) {
      this.cursor--;
      moved = true;
    }
    if (edges.repeat.down && this.cursor < n - 1) {
      this.cursor++;
      moved = true;
    }
    if (moved) this.game.audio.play('cursor');
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + ROWS_VISIBLE) this.scroll = this.cursor - ROWS_VISIBLE + 1;
    if (edges.pressed.b) {
      this.game.audio.play('deselect');
      import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
      return;
    }
    if (!edges.pressed.a) return;
    const save = this.game.save;
    const item = this.stock[this.cursor];
    if (save.data.bits < item.price) {
      this.game.audio.play('buzz');
      this.msg = { text: 'Not enough Bits', color: UI.bad, ttl: 70 };
      return;
    }
    save.data.bits -= item.price;
    if (item.kind === 'hp') {
      save.data.stats.hpMem++;
      this.msg = { text: `Max HP is now ${save.maxHp}`, color: UI.good, ttl: 80 };
    } else {
      save.addChip(item.key, item.code);
      this.msg = { text: `Got ${item.def.name} ${item.code}`, color: UI.good, ttl: 80 };
    }
    this.game.audio.play('confirm');
    save.persist();
    this.stock = stockFor(save);
  }

  draw(ctx) {
    const t = this.t;
    const save = this.game.save;
    drawBackground(ctx, 'foundry', t);
    ctx.globalAlpha = 0.5;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    rect(ctx, 0, 0, 240, 56, '#0c1638');
    rect(ctx, 0, 56, 240, 1, '#8ab0ff');
    const item = this.stock[this.cursor];
    if (item?.kind === 'chip') {
      const def = item.def;
      drawChipArt(ctx, def, 4, 4, t);
      frame(ctx, 3, 3, 58, 50, '#6a88d8');
      drawText(ctx, def.name, 66, 4, '#ffffff');
      drawText(ctx, item.code, 66, 15, item.code === '*' ? UI.gold : '#9ae8ff', { scale: 2 });
      drawElementIcon(ctx, def.element, 80, 17);
      const dmg = def.kind === 'boost' ? `+${def.damage}` : def.damage > 0 && def.kind !== 'support' ? String(def.damage) : '--';
      drawText(ctx, dmg, 120, 17, '#ffffff');
      drawText(ctx, `own ${save.ownedCount(item.key, item.code)}`, 236, 17, UI.sub, { align: 'right' });
      wrapText(def.desc, 168).slice(0, 3).forEach((l, i) => drawText(ctx, l, 66, 30 + i * 8, UI.sub));
    } else if (item) {
      drawText(ctx, 'HP MEMORY', 66, 6, '#ffffff');
      drawText(ctx, `Raises max HP by 20 (now ${save.maxHp}).`, 66, 18, UI.sub);
      drawText(ctx, 'Each one costs more than the last.', 66, 28, UI.dim);
      rect(ctx, 14, 12, 34, 30, '#3a1020');
      drawText(ctx, '+20', 31, 22, '#ff9ab0', { align: 'center', scale: 1 });
      frame(ctx, 3, 3, 58, 50, '#6a88d8');
    }
    drawText(ctx, `${save.data.bits} BITS`, 236, 4, UI.gold, { align: 'right' });
    // List.
    rect(ctx, 20, 60, 200, 86, '#0a1230');
    frame(ctx, 20, 60, 200, 86, '#8ab0ff');
    for (let k = 0; k < ROWS_VISIBLE; k++) {
      const i = this.scroll + k;
      const it = this.stock[i];
      if (!it) break;
      const y = 63 + k * 9;
      if (i === this.cursor) rect(ctx, 21, y - 1, 198, 9, 'rgba(138,176,255,0.25)');
      const afford = save.data.bits >= it.price;
      if (it.kind === 'hp') drawText(ctx, 'HP Memory', 36, y, '#ff9ab0');
      else {
        drawElementIcon(ctx, it.def.element, 24, y - 1);
        drawText(ctx, it.def.name, 36, y, '#ffffff');
        drawText(ctx, it.code, 110, y, it.code === '*' ? UI.gold : '#9ae8ff');
      }
      drawText(ctx, `${it.price}`, 214, y, afford ? UI.text : UI.dim, { align: 'right' });
    }
    if (this.msg) {
      rect(ctx, 64, 44, 172, 10, '#0c1638');
      drawText(ctx, this.msg.text, 150, 45, this.msg.color, { align: 'center' });
    }
    drawHints(ctx, 'A: buy   B: back   Win battles to earn Bits');
  }
}
