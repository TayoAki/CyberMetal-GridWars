import { rect } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawElementIcon } from '../../render/chipart.js';
import { drawWindow, drawHints, UI } from '../ui.js';

// How to play: a few short pages on the rules a newcomer needs.

const PAGES = [
  {
    title: 'THE GRID',
    lines: [
      'You fight on a 6x3 grid. The red half is yours, the blue half is the enemy\'s. Neither side can step into the other\'s panels.',
      'Move with the arrows. Tap B (Z) to fire your buster; hold B to charge a stronger shot and release it when you glow.',
      'Delete every enemy to win. Hits that knock you back leave you briefly invincible.',
    ],
  },
  {
    title: 'CHIPS & THE CUSTOM SCREEN',
    lines: [
      'Each turn you are dealt chips from your 30-chip folder. Pick up to 5, then OK. In battle, press A (X) to use them in order.',
      'Picks must be the same chip, OR all share one code letter. A * code matches anything.',
      'The CUSTOM gauge fills over time; when it is full press L or R (Q/E) for a new hand. ADD skips a turn for 5 more chips.',
    ],
  },
  {
    title: 'FUSIONS & BOOSTS',
    lines: [
      'Some combos fuse into a stronger attack when picked in a row: three of a chip with codes in order (Cannon A, B, C), or sets like Sword + WideSwrd + LongSwrd with one code.',
      'Boost chips (Atk+10, Fire+30, Navi+20...) add their power to the chip picked right before them.',
      'Hit an enemy with a chip while it winds up an attack for a COUNTER.',
    ],
  },
  {
    title: 'ELEMENTS',
    elements: true,
    lines: [
      'Fire beats Wood, Wood beats Elec, Elec beats Aqua, Aqua beats Fire: a hit on a weak element does double damage.',
      'Fire does double to anything on grass (and burns it). Elec does double to anything on ice.',
    ],
  },
  {
    title: 'PANELS',
    lines: [
      'Cracked panels break when you step off them. Broken panels are holes until they mend.',
      'Ice makes you slide. Lava burns non-Fire bodies. Poison drains HP. Holy panels halve damage. Grass heals Wood bodies.',
      'AreaGrab and PanlGrab steal enemy panels for a while, giving you room to move in.',
    ],
  },
  {
    title: 'RANK, STYLES & PROGRAMS',
    lines: [
      'Fast, clean wins earn a higher rank: fewer hits taken, fewer steps, and deleting several enemies at once all count. High ranks win chips.',
      'Bosses teach Styles: an element (changes your charge shot and weakness) and a type such as Guts or Shield. Pick them under PROGRAMS.',
    ],
  },
];

export class HelpScene {
  constructor(game) {
    this.game = game;
    this.page = 0;
    this.t = 0;
  }

  update(held, edges) {
    this.t++;
    if (edges.pressed.right || edges.pressed.a) {
      if (this.page < PAGES.length - 1) {
        this.page++;
        this.game.audio.play('cursor');
      } else if (edges.pressed.a) this.leave();
    }
    if (edges.pressed.left && this.page > 0) {
      this.page--;
      this.game.audio.play('cursor');
    }
    if (edges.pressed.b) this.leave();
  }

  leave() {
    this.game.audio.play('deselect');
    import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
  }

  draw(ctx) {
    drawBackground(ctx, 'title', this.t);
    ctx.globalAlpha = 0.5;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    const p = PAGES[this.page];
    drawWindow(ctx, 8, 6, 224, 136, { title: `${p.title}  ${this.page + 1}/${PAGES.length}` });
    let y = 22;
    if (p.elements) {
      const wheel = [['fire', 'Fire'], ['wood', 'Wood'], ['elec', 'Elec'], ['aqua', 'Aqua']];
      wheel.forEach(([el, name], i) => {
        const x = 28 + i * 50;
        drawElementIcon(ctx, el, x, y);
        drawText(ctx, name, x + 12, y + 1, UI.text);
        if (i < 3) drawText(ctx, '>', x + 40, y + 1, UI.gold);
      });
      drawText(ctx, '>', 222, y + 1, UI.gold);
      y += 16;
    }
    for (const para of p.lines) {
      for (const l of wrapText(para, 208)) {
        drawText(ctx, l, 16, y, UI.text);
        y += 9;
      }
      y += 5;
    }
    drawHints(ctx, '</>: page   A: next   B: back');
  }
}
