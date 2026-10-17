import { rect } from '../render/pixel.js';
import { drawText, wrapText } from '../render/font.js';
import { SCREEN_W, SCREEN_H } from '../render/layout.js';
import { SaveData } from './save.js';
import { BattleScene } from './scenes/battleScene.js';
import { TitleScene } from './scenes/titleScene.js';
import { ENCOUNTERS, encounterById, bossVersion } from './data/areas.js';
import { autopilot } from './autopilot.js';

// Owns the current scene, the save data and screen fades. Scenes implement update(held, edges) and
// draw(ctx); optional enter()/exit().

export class Game {
  constructor({ input, audio, params, storage }) {
    this.input = input;
    this.audio = audio;
    this.params = params ?? new URLSearchParams();
    this.save = new SaveData(storage);
    this.audio.setVolume?.({ master: 1, sfx: this.save.data.options.sfx, music: this.save.data.options.music });
    this.scene = null;
    this.next = null;
    this.fade = 0; // 0 = clear, 1 = black
    this.fadeDir = 0;
    this.t = 0;
    this.notice = null; // a message over every scene for a few seconds: { text, t }

    const quick = this.params.get('battle');
    if (quick) {
      let enc = encounterById(quick) ?? ENCOUNTERS[0];
      const v = Number(this.params.get('v') ?? 0);
      if (v) enc = bossVersion(enc, v);
      const auto = this.params.get('auto') === '1';
      this.setScene(
        new BattleScene(this, {
          encounter: enc,
          theme: enc.theme,
          seed: Number(this.params.get('seed') ?? 1),
          player: this.save.battlePlayer(),
          autopilot: auto ? autopilot() : null,
          rewardFor: () => null,
          onEnd: () => this.setScene(new TitleScene(this)),
        }),
        false,
      );
    } else this.setScene(new TitleScene(this), false);
  }

  // Swap scenes with a quick fade through black.
  setScene(scene, fade = true) {
    if (!fade || !this.scene) {
      this.scene?.exit?.();
      this.scene = scene;
      scene.enter?.();
      this.fade = fade ? 1 : 0;
      this.fadeDir = fade ? -1 : 0;
      return;
    }
    this.next = scene;
    this.fadeDir = 1;
  }

  // Show a message at the top of the screen for a few seconds (whatever the scene).
  notify(text, frames = 240) {
    this.notice = { text: String(text), t: frames };
  }

  step(held, edges) {
    this.t++;
    if (this.notice && --this.notice.t <= 0) this.notice = null;
    if (this.fadeDir > 0) {
      this.fade = Math.min(1, this.fade + 0.12);
      if (this.fade >= 1) {
        this.scene?.exit?.();
        this.scene = this.next;
        this.next = null;
        this.scene.enter?.();
        this.fadeDir = -1;
      }
      return;
    }
    if (this.fadeDir < 0) {
      this.fade = Math.max(0, this.fade - 0.12);
      if (this.fade <= 0) this.fadeDir = 0;
    }
    this.scene?.update(held, edges);
  }

  draw(ctx) {
    this.scene?.draw(ctx);
    if (this.fade > 0) {
      ctx.globalAlpha = this.fade;
      rect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000');
      ctx.globalAlpha = 1;
    }
    if (this.notice) {
      const lines = wrapText(this.notice.text, SCREEN_W - 12).slice(0, 3);
      const h = lines.length * 9 + 5;
      rect(ctx, 0, 0, SCREEN_W, h, 'rgba(6,10,28,0.92)');
      rect(ctx, 0, h, SCREEN_W, 1, '#8ab0ff');
      lines.forEach((l, i) => drawText(ctx, l, SCREEN_W / 2, 3 + i * 9, '#ffffff', { align: 'center' }));
    }
  }

  onHidden() {
    const b = this.scene?.battle;
    if (b && b.phase === 'fight' && !b.paused) b.paused = true;
  }
}
