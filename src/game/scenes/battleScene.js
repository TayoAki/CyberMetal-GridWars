import { Battle } from '../../engine/battle.js';
import { BattleView } from '../../render/battleView.js';
import { rect } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawChipArt } from '../../render/chipart.js';
import { chipDef } from '../../engine/chips/library.js';
import { drawWindow, UI } from '../ui.js';

// Runs one Battle with its view; after the win/lose wind-down shows the results panel, then hands the
// outcome back through onEnd(result, reward).

export class BattleScene {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.battle = new Battle({
      seed: opts.seed ?? (Date.now() >>> 0),
      encounter: opts.encounter,
      player: opts.player,
      shuffle: true,
    });
    this.view = new BattleView(this.battle, { theme: opts.theme, onSfx: (n) => game.audio.play(n), reduceFlash: !!game.save.data.options.reduceFlash });
    this.resultT = 0;
    this.reward = null;
    this.autopilot = opts.autopilot ?? null;
  }

  enter() {
    const boss = this.battle.isBossBattle;
    this.game.audio.music(this.opts.music ?? (boss ? (this.opts.final ? 'final' : 'boss') : 'battle'));
  }

  update(held, edges) {
    const b = this.battle;
    if (b.paused && edges.pressed.select) {
      this.game.audio.play('cancel');
      this.opts.onEnd?.({ won: false, retreated: true }, null, this);
      return;
    }
    const pad = this.autopilot ? this.autopilot(b) : held;
    if (!b.done) {
      b.step(pad);
      this.view.consume(b.drainEvents());
    }
    this.view.update();
    if (b.done) {
      if (this.resultT === 0) {
        this.reward = b.result.won ? (this.opts.rewardFor?.(b.result, b) ?? null) : null;
        this.game.audio.music(b.result.won ? 'victory' : 'gameover');
      }
      this.resultT++;
      // The autopilot continues on its own once the victory jingle (about 4.7 s) has played. onEnd runs
      // once: some handlers change scene asynchronously (a dynamic import), and this scene keeps
      // updating until they do.
      if (!this.ended && this.resultT > 40 && (edges.pressed.a || edges.pressed.start || (this.autopilot && this.resultT > 290))) {
        this.ended = true;
        this.opts.onEnd?.(b.result, this.reward, this);
      }
    }
  }

  draw(ctx) {
    this.view.draw(ctx);
    if (this.battle.done) this.drawResults(ctx);
  }

  drawResults(ctx) {
    const r = this.battle.result;
    const k = Math.min(1, this.resultT / 12);
    if (!r.won) {
      ctx.globalAlpha = 0.7 * k;
      rect(ctx, 0, 0, 240, 160, '#05060c');
      ctx.globalAlpha = 1;
      drawText(ctx, 'DELETED...', 120, 56, '#ff7a7a', { align: 'center', scale: 2, outline: '#2a0a0a' });
      if (this.resultT > 40) drawText(ctx, 'Press A', 120, 92, UI.sub, { align: 'center' });
      return;
    }
    const y = Math.round(160 - 128 * k);
    drawWindow(ctx, 24, y, 192, 120, { title: 'BATTLE RESULTS' });
    const secs = r.seconds;
    const mm = Math.floor(secs / 60);
    const ss = (secs % 60).toFixed(2).padStart(5, '0');
    drawText(ctx, 'TIME', 34, y + 18, UI.sub);
    drawText(ctx, `${mm}:${ss}`, 206, y + 18, UI.text, { align: 'right' });
    drawText(ctx, 'RANK', 34, y + 30, UI.sub);
    const lvl = String(r.bustingLevel);
    drawText(ctx, lvl === 'S' ? 'S' : `LV ${lvl}`, 206, y + 28, lvl === 'S' ? UI.gold : UI.text, { align: 'right', scale: lvl === 'S' ? 2 : 1 });
    let ly = y + 42;
    for (const [name, pts] of r.lines) {
      drawText(ctx, name, 40, ly, UI.dim);
      drawText(ctx, `${pts >= 0 ? '+' : ''}${pts}`, 206, ly, pts >= 0 ? UI.good : UI.bad, { align: 'right' });
      ly += 8;
    }
    if (this.reward) {
      const rw = this.reward;
      drawText(ctx, 'GOT:', 34, y + 86, UI.sub);
      if (rw.type === 'chip') {
        const def = chipDef(rw.key);
        drawChipArt(ctx, def, 154, y + 60, this.resultT);
        const lines = wrapText(rw.label ?? `${def.name} ${rw.code}`, 88);
        lines.slice(0, 2).forEach((l, i) => drawText(ctx, l, 62, y + 86 + i * 9, UI.gold));
      } else if (rw.type === 'bits') {
        drawText(ctx, `${rw.amount} BITS`, 62, y + 86, UI.gold);
      }
    }
    if (this.resultT > 40 && this.resultT % 40 < 28) drawText(ctx, 'A: continue', 120, y + 108, UI.sub, { align: 'center' });
  }
}
