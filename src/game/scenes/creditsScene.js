import { rect } from '../../render/pixel.js';
import { drawText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { UI } from '../ui.js';

// Credits (and the ending after the final boss).

const LINES = [
  ['CYBERMETAL GRIDWARS', '#ffffff'],
  ['', ''],
  ['A fan-made, fights-only grid battler.', UI.sub],
  ['Its battle rules recreate Mega Man', UI.sub],
  ['Battle Network 3 (Capcom, 2002).', UI.sub],
  ['', ''],
  ['Not affiliated with or endorsed by', UI.dim],
  ['Capcom. No Capcom art, music, text', UI.dim],
  ['or code is included: every character,', UI.dim],
  ['sprite and tune here is original.', UI.dim],
  ['', ''],
  ['RULES & NUMBERS', UI.gold],
  ['Chip damage, codes and virus HP were', UI.sub],
  ["calibrated from the owner's own ROM", UI.sub],
  ['as reference data; none of it ships.', UI.sub],
  ['', ''],
  ['MADE WITH', UI.gold],
  ['universal-modder (agent modding skill)', UI.sub],
  ['and Claude Code', UI.sub],
  ['', ''],
  ['THANKS FOR PLAYING', '#7affe0'],
];

export class CreditsScene {
  constructor(game, opts = {}) {
    this.game = game;
    this.ending = !!opts.ending;
    this.t = 0;
  }

  enter() {
    this.game.audio.music(this.ending ? 'victory' : 'menu');
  }

  update(held, edges) {
    this.t++;
    if (this.t > 30 && (edges.pressed.a || edges.pressed.b || edges.pressed.start)) {
      this.game.audio.play('confirm');
      import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
    }
  }

  draw(ctx) {
    drawBackground(ctx, this.ending ? 'void' : 'title', this.t);
    ctx.globalAlpha = 0.5;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    let y0 = 160 - this.t * 0.4;
    if (this.ending) {
      const lines = [
        ['ZERODAY DELETED', UI.gold],
        ['The grid hums again.', '#ffffff'],
        ['Free Battle now offers Ω rematches.', UI.sub],
        ['', ''],
      ];
      lines.forEach(([l, c], i) => drawText(ctx, l, 120, Math.max(10, y0) + i * 11, c, { align: 'center' }));
      y0 += lines.length * 11;
    }
    const scrollEnd = 8 - LINES.length * 11;
    const y = Math.max(scrollEnd + (this.ending ? 44 : 0), y0);
    LINES.forEach(([l, c], i) => {
      const yy = y + i * 11;
      if (yy > -10 && yy < 160 && l) drawText(ctx, l, 120, yy, c, { align: 'center' });
    });
    if (this.t > 60 && this.t % 50 < 34) drawText(ctx, 'A: back', 232, 150, UI.dim, { align: 'right' });
  }
}
