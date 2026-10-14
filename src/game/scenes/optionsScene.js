import { rect } from '../../render/pixel.js';
import { drawText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawWindow, drawHints, moveCursor, UI } from '../ui.js';
import { KEY_HELP } from '../../input/input.js';

// Options: volumes, controls reference, and a guarded save reset.

export class OptionsScene {
  constructor(game) {
    this.game = game;
    this.cursor = 0;
    this.t = 0;
    this.confirmReset = 0;
  }

  enter() {
    this.game.audio.music('menu');
  }

  items() {
    const o = this.game.save.data.options;
    const bar = (v) => `${'|'.repeat(Math.round(v * 10))}${'.'.repeat(10 - Math.round(v * 10))}`;
    return [
      { key: 'sfx', label: 'SOUND FX', value: bar(o.sfx) },
      { key: 'music', label: 'MUSIC', value: bar(o.music) },
      { key: 'reset', label: this.confirmReset ? 'REALLY RESET? (A)' : 'RESET SAVE', value: '' },
      { key: 'back', label: 'BACK', value: '' },
    ];
  }

  apply() {
    const o = this.game.save.data.options;
    this.game.audio.setVolume?.({ master: 1, sfx: o.sfx, music: o.music });
    this.game.save.persist();
  }

  update(held, edges) {
    this.t++;
    const items = this.items();
    const c = moveCursor(edges, this.cursor, items.length);
    if (c !== this.cursor) {
      this.cursor = c;
      this.confirmReset = 0;
      this.game.audio.play('cursor');
    }
    const o = this.game.save.data.options;
    const it = items[this.cursor];
    if ((edges.repeat.left || edges.repeat.right) && (it.key === 'sfx' || it.key === 'music')) {
      const d = edges.repeat.right ? 0.1 : -0.1;
      o[it.key] = Math.max(0, Math.min(1, Math.round((o[it.key] + d) * 10) / 10));
      this.apply();
      this.game.audio.play('cursor');
    }
    const leave = () => import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
    if (edges.pressed.b) {
      this.game.audio.play('deselect');
      leave();
      return;
    }
    if (!edges.pressed.a) return;
    if (it.key === 'reset') {
      if (this.confirmReset) {
        this.game.save.reset();
        this.apply();
        this.confirmReset = 0;
        this.game.audio.play('barrierbreak');
      } else {
        this.confirmReset = 1;
        this.game.audio.play('buzz');
      }
    } else if (it.key === 'back') {
      this.game.audio.play('deselect');
      leave();
    }
  }

  draw(ctx) {
    drawBackground(ctx, 'title', this.t);
    ctx.globalAlpha = 0.45;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    drawWindow(ctx, 20, 6, 200, 62, { title: 'OPTIONS' });
    this.items().forEach((it, i) => {
      const y = 22 + i * 11;
      const sel = i === this.cursor;
      if (sel) drawText(ctx, '>', 28, y, UI.gold);
      drawText(ctx, it.label, 36, y, it.key === 'reset' && this.confirmReset ? UI.bad : sel ? UI.gold : UI.text);
      if (it.value) drawText(ctx, it.value, 210, y, UI.sub, { align: 'right' });
    });
    drawWindow(ctx, 20, 72, 200, 72, { title: 'CONTROLS' });
    KEY_HELP.forEach(([what, keys], i) => {
      drawText(ctx, what, 28, 86 + i * 10, UI.sub);
      drawText(ctx, keys, 212, 86 + i * 10, UI.text, { align: 'right' });
    });
    drawHints(ctx, '</>: adjust   A: select   B: back   Gamepads work too');
  }
}
