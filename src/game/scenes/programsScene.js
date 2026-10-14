import { rect } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawWindow, drawHints, moveCursor, UI } from '../ui.js';
import { PROGRAMS } from '../save.js';

// Programs: equip passive parts within the memory budget (a simple take on BN3's Navi Customizer), and
// review the stats bosses have raised.

const ORDER = Object.keys(PROGRAMS);

export class ProgramsScene {
  constructor(game, back = null) {
    this.game = game;
    this.back = back;
    this.cursor = 0;
    this.t = 0;
    this.msg = null;
  }

  enter() {
    this.game.audio.music('menu');
  }

  update(held, edges) {
    this.t++;
    if (this.msg && --this.msg.ttl <= 0) this.msg = null;
    const c = moveCursor(edges, this.cursor, ORDER.length);
    if (c !== this.cursor) {
      this.cursor = c;
      this.game.audio.play('cursor');
    }
    const save = this.game.save;
    const d = save.data;
    if (edges.pressed.b) {
      save.persist();
      this.game.audio.play('deselect');
      if (this.back) this.game.setScene(this.back());
      else import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
      return;
    }
    if (!edges.pressed.a) return;
    const key = ORDER[this.cursor];
    if (!d.programs.owned.includes(key)) {
      this.game.audio.play('buzz');
      this.msg = { text: 'Not yet found. Beat bosses!', ttl: 80 };
      return;
    }
    const eq = d.programs.equipped;
    if (eq.includes(key)) {
      d.programs.equipped = eq.filter((k) => k !== key);
      this.game.audio.play('deselect');
    } else if (save.programsUsed() + PROGRAMS[key].cost > save.programCapacity) {
      this.game.audio.play('buzz');
      this.msg = { text: 'Not enough memory', ttl: 80 };
    } else {
      // Custom+1 and Custom+2 don't stack.
      if (key === 'custom1') d.programs.equipped = eq.filter((k) => k !== 'custom2');
      if (key === 'custom2') d.programs.equipped = eq.filter((k) => k !== 'custom1');
      d.programs.equipped.push(key);
      this.game.audio.play('select');
    }
    save.persist();
  }

  draw(ctx) {
    const save = this.game.save;
    const d = save.data;
    drawBackground(ctx, 'title', this.t);
    ctx.globalAlpha = 0.45;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    drawWindow(ctx, 4, 4, 232, 40, { title: 'AXIOM STATUS' });
    const pips = (n) => '#'.repeat(n) + '.'.repeat(5 - n);
    drawText(ctx, `MAX HP  ${save.maxHp}`, 12, 18, UI.text);
    drawText(ctx, `ATTACK  ${pips(d.stats.attack)}`, 12, 29, UI.text);
    drawText(ctx, `RAPID   ${pips(d.stats.rapid)}`, 124, 18, UI.text);
    drawText(ctx, `CHARGE  ${pips(d.stats.charge)}`, 124, 29, UI.text);
    drawText(ctx, `${d.bits} BITS`, 228, 6, UI.gold, { align: 'right' });

    const used = save.programsUsed();
    const cap = save.programCapacity;
    drawWindow(ctx, 4, 48, 232, 96, { title: `PROGRAMS  MEMORY ${used}/${cap}` });
    for (let i = 0; i < cap; i++) rect(ctx, 150 + i * 12, 51, 10, 6, i < used ? '#7affe0' : '#1a2448');
    ORDER.forEach((key, i) => {
      const y = 64 + i * 11;
      const owned = d.programs.owned.includes(key);
      const on = d.programs.equipped.includes(key);
      const sel = i === this.cursor;
      if (sel) {
        rect(ctx, 10, y - 2, 220, 10, 'rgba(138,176,255,0.18)');
        drawText(ctx, '>', 12, y, UI.gold);
      }
      drawText(ctx, on ? '[ON]' : owned ? '[  ]' : '', 20, y, on ? UI.good : UI.dim);
      drawText(ctx, owned ? PROGRAMS[key].name : '??????', 46, y, owned ? (sel ? UI.gold : UI.text) : UI.dim);
      drawText(ctx, `${PROGRAMS[key].cost}MB`, 226, y, UI.sub, { align: 'right' });
    });
    const key = ORDER[this.cursor];
    const desc = d.programs.owned.includes(key) ? PROGRAMS[key].desc : 'Locked: earned from bosses.';
    if (this.msg) drawText(ctx, this.msg.text, 120, 134, UI.bad, { align: 'center' });
    else wrapText(desc, 220).slice(0, 1).forEach((l) => drawText(ctx, l, 120, 134, UI.sub, { align: 'center' }));
    drawHints(ctx, 'A: equip / remove   B: back   Memory grows as bosses fall');
  }
}
