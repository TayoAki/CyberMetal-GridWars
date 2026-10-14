import { Battle } from '../../engine/battle.js';
import { BattleView } from '../../render/battleView.js';
import { rect, shade } from '../../render/pixel.js';
import { drawText } from '../../render/font.js';
import { drawWindow, drawMenu, drawHints, moveCursor, UI } from '../ui.js';
import { autopilot } from '../autopilot.js';
import { AREAS } from '../data/areas.js';
import { GauntletScene } from './gauntletScene.js';
import { FreeBattleScene } from './freeBattleScene.js';
import { FolderScene } from './folderScene.js';
import { ProgramsScene } from './programsScene.js';
import { OptionsScene } from './optionsScene.js';
import { CreditsScene } from './creditsScene.js';

// Title + main menu, with an attract-mode demo battle playing behind the logo.

const DEMOS = [
  { enemies: [{ type: 'rivet', level: 1, col: 4, row: 1 }, { type: 'plinker', level: 1, col: 5, row: 0 }, { type: 'dartfin', level: 1, col: 5, row: 2 }] },
  { enemies: [{ type: 'rivet', level: 2, col: 4, row: 0 }, { type: 'rivet', level: 2, col: 4, row: 2 }, { type: 'plinker', level: 2, col: 5, row: 1 }] },
];
const DEMO_FOLDER = ['cannon:A', 'cannon:B', 'cannon:C', 'sword:L', 'widesword:L', 'minibomb:B', 'shotgun:J', 'vgun:D', 'airshot1:*', 'recov10:A', 'shockwave:D', 'spreader:M']
  .flatMap((s) => [s, s, s])
  .slice(0, 30)
  .map((s) => ({ key: s.split(':')[0], code: s.split(':')[1] }));

export class TitleScene {
  constructor(game, opts = {}) {
    this.game = game;
    this.state = opts.menu ? 'menu' : 'press';
    this.cursor = 0;
    this.t = 0;
    this.demoIndex = 0;
    this.newDemo();
  }

  enter() {
    this.game.audio.music('title');
  }

  newDemo() {
    const enc = DEMOS[this.demoIndex++ % DEMOS.length];
    this.demo = new Battle({ seed: 1000 + this.demoIndex, encounter: enc, player: { folder: DEMO_FOLDER, maxHp: 300 }, shuffle: true });
    this.demoView = new BattleView(this.demo, { theme: 'title', hud: false });
    this.bot = autopilot();
  }

  items() {
    const d = this.game.save.data;
    const started = d.progress.area > 0 || d.progress.step > 0 || Object.keys(d.progress.cleared).length > 0;
    return [
      { label: started ? 'CONTINUE GAUNTLET' : 'START GAUNTLET', go: () => new GauntletScene(this.game) },
      { label: 'FREE BATTLE', go: () => new FreeBattleScene(this.game) },
      { label: 'FOLDER', go: () => new FolderScene(this.game) },
      { label: 'PROGRAMS', go: () => new ProgramsScene(this.game) },
      { label: 'OPTIONS', go: () => new OptionsScene(this.game) },
      { label: 'CREDITS', go: () => new CreditsScene(this.game) },
    ];
  }

  update(held, edges) {
    this.t++;
    // Demo battle (muted: its sounds are dropped).
    if (!this.demo.done && this.demo.frame < 60 * 40) {
      this.demo.step(this.bot(this.demo));
      this.demoView.consume(this.demo.drainEvents());
    } else this.newDemo();
    this.demoView.update();

    if (this.state === 'press') {
      if (edges.pressed.start || edges.pressed.a) {
        this.state = 'menu';
        this.game.audio.play('confirm');
      }
      return;
    }
    const items = this.items();
    const c = moveCursor(edges, this.cursor, items.length);
    if (c !== this.cursor) {
      this.cursor = c;
      this.game.audio.play('cursor');
    }
    if (edges.pressed.a || edges.pressed.start) {
      this.game.audio.play('confirm');
      this.game.setScene(items[this.cursor].go());
    } else if (edges.pressed.b) {
      this.state = 'press';
      this.game.audio.play('deselect');
    }
  }

  draw(ctx) {
    this.demoView.draw(ctx);
    ctx.globalAlpha = 0.62;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    this.drawLogo(ctx, 18);
    if (this.state === 'press') {
      if (this.t % 50 < 34) drawText(ctx, 'PRESS START', 120, 112, '#ffffff', { align: 'center', outline: '#0a1a4a' });
      drawText(ctx, 'Z buster  X chip  Q/E custom', 120, 128, UI.dim, { align: 'center' });
      drawText(ctx, 'A fan-made fights-only grid battler', 120, 148, '#4a5a90', { align: 'center' });
      return;
    }
    drawWindow(ctx, 60, 74, 120, 80);
    drawMenu(ctx, this.items(), this.cursor, 76, 82, { width: 100, t: this.t });
    const d = this.game.save.data;
    const area = AREAS[Math.min(d.progress.area, AREAS.length - 1)];
    drawHints(ctx, d.progress.finished ? 'All areas cleared!  Try Free Battle Ω' : `Next: ${area.name}`);
  }

  drawLogo(ctx, y) {
    const t = this.t;
    const sweep = (t * 2) % 320;
    drawText(ctx, 'CYBERMETAL', 120, y, '#9ae8ff', { align: 'center', scale: 2, outline: '#0a1a4a' });
    drawText(ctx, 'GRIDWARS', 120, y + 20, '#ffffff', { align: 'center', scale: 3, outline: '#1a2a7a' });
    // Light sweep across the logo.
    for (let i = 0; i < 3; i++) {
      const x = sweep - 40 + i * 3;
      if (x > 30 && x < 210) rect(ctx, x, y + 20, 1, 22, 'rgba(255,255,255,0.35)');
    }
    rect(ctx, 52, y + 46, 136, 1, shade('#8ab0ff', -0.3));
    drawText(ctx, 'NET BATTLE PROTOCOL', 120, y + 49, '#8ab0ff', { align: 'center' });
  }
}
