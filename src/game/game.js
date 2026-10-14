import { rect } from '../render/pixel.js';
import { SCREEN_W, SCREEN_H } from '../render/layout.js';
import { SaveData } from './save.js';
import { BattleScene } from './scenes/battleScene.js';
import { TitleScene } from './scenes/titleScene.js';
import { ENCOUNTERS, encounterById } from './data/areas.js';
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

    const quick = this.params.get('battle');
    if (quick) {
      const enc = encounterById(quick) ?? ENCOUNTERS[0];
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

  step(held, edges) {
    this.t++;
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
  }

  onHidden() {
    const b = this.scene?.battle;
    if (b && b.phase === 'fight' && !b.paused) b.paused = true;
  }
}
