import { rect, frame } from '../../render/pixel.js';
import { drawText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { PLAYER_SPRITE, PAL } from '../../render/sprites/core_player.js';
import { LOOK_SLOTS, LOOK_COLORS, COLOR_CHANNELS, DEFAULT_LOOK, colorRamp } from '../../render/sprites/core_player_looks.js';
import { drawWindow, drawHints, moveCursor, UI } from '../ui.js';

// CUSTOMIZE: AXIOM's look. A part for each slot and a colour for the armour, the suit and the lights, with a
// large preview that runs through a few battle poses. Purely cosmetic; every change is saved at once.

const ROWS = [
  ...LOOK_SLOTS.map((s) => ({ kind: 'part', key: s.key, name: s.name, options: s.options })),
  ...COLOR_CHANNELS.map((c) => ({ kind: 'color', key: c.key, name: c.name, options: LOOK_COLORS[c.key] })),
  { kind: 'action', key: 'random', name: 'RANDOM', desc: 'Roll a random look.' },
  { kind: 'action', key: 'reset', name: 'RESET', desc: "Back to AXIOM's own look." },
  { kind: 'action', key: 'done', name: 'DONE', desc: 'Keep this look. Looks never change battles.' },
];

// The preview's loop: [anim, frames shown]. Action poses play their animation from the start.
const SHOWCASE = [['idle', 80], ['shoot', 22], ['idle', 50], ['sword', 26], ['idle', 50], ['cannon', 28], ['idle', 50], ['guard', 46], ['idle', 50], ['punch', 22]];

// Three tones of a colour preset for its swatch (AXIOM's own colours for the first preset of a channel).
const SWATCH_KEYS = { armor: ['A', 'C', 'E'], suit: ['n', 'm', 'q'], lights: ['2', '3', '4'] };
function swatch(channel, preset, index) {
  const ramp = index === 0 ? PAL : colorRamp(channel, preset);
  return SWATCH_KEYS[channel].map((k) => ramp[k]);
}

export class CustomizeScene {
  constructor(game, back = null) {
    this.game = game;
    this.back = back;
    this.cursor = 0;
    this.t = 0;
    this.showT = 0; // frames into the preview loop
    this.flash = 0; // the preview flashes briefly on a change
  }

  enter() {
    this.game.audio.music('menu');
  }

  get look() {
    return this.game.save.data.look;
  }

  // Looks are replaced, never edited in place: the renderer keeps its composed poses per look object.
  setLook(look) {
    this.game.save.data.look = Object.freeze({ ...look });
    this.game.save.persist();
    this.flash = 8;
  }

  leave() {
    this.game.save.persist();
    if (this.back) this.game.setScene(this.back());
    else import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
  }

  update(held, edges) {
    this.t++;
    this.showT++;
    if (this.flash > 0) this.flash--;
    const audio = this.game.audio;
    const c = moveCursor(edges, this.cursor, ROWS.length);
    if (c !== this.cursor) {
      this.cursor = c;
      audio.play('cursor');
    }
    if (edges.pressed.b) {
      audio.play('deselect');
      this.leave();
      return;
    }
    const row = ROWS[this.cursor];
    if (row.kind !== 'action') {
      const dir = edges.repeat.left ? -1 : edges.repeat.right || edges.pressed.a ? 1 : 0;
      if (!dir) return;
      const i = row.options.findIndex((o) => o.id === this.look[row.key]);
      const next = row.options[(i + dir + row.options.length) % row.options.length];
      this.setLook({ ...this.look, [row.key]: next.id });
      audio.play('select');
      return;
    }
    if (!(edges.pressed.a || edges.pressed.start)) return;
    if (row.key === 'done') {
      audio.play('confirm');
      this.leave();
    } else if (row.key === 'reset') {
      this.setLook(DEFAULT_LOOK);
      audio.play('confirm');
    } else {
      const look = {};
      for (const r of ROWS) if (r.kind !== 'action') look[r.key] = r.options[Math.floor(Math.random() * r.options.length)].id;
      this.setLook(look);
      audio.play('confirm');
    }
  }

  // The pose the preview shows now.
  previewPose() {
    const total = SHOWCASE.reduce((n, [, f]) => n + f, 0);
    let k = this.showT % total;
    for (const [anim, frames] of SHOWCASE) {
      if (k < frames) return { anim, animT: k };
      k -= frames;
    }
    return { anim: 'idle', animT: 0 };
  }

  draw(ctx) {
    const t = this.t;
    drawBackground(ctx, 'title', t);
    ctx.globalAlpha = 0.55;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    rect(ctx, 0, 0, 240, 14, '#0c1638');
    rect(ctx, 0, 14, 240, 1, '#8ab0ff');
    drawText(ctx, 'CUSTOMIZE', 5, 4, UI.gold);
    drawText(ctx, '</>: change   B: done', 235, 4, UI.dim, { align: 'right' });

    // The preview, at twice size on a battle panel.
    drawWindow(ctx, 2, 18, 98, 128, { title: 'AXIOM' });
    const px = 51;
    const py = 128;
    rect(ctx, px - 30, py - 2, 60, 12, '#3a1420');
    rect(ctx, px - 30, py - 2, 60, 2, '#ff8a96');
    rect(ctx, px - 28, py, 56, 7, '#e0485a');
    rect(ctx, px - 28, py + 7, 56, 1, '#7a1a2a');
    const pose = this.previewPose();
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(2, 2);
    PLAYER_SPRITE.draw(ctx, { anim: pose.anim, animT: pose.animT, facing: 1, data: { look: this.look } }, 0, 0, t);
    ctx.restore();
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash / 16;
      rect(ctx, 5, 21, 92, 122, '#ffffff');
      ctx.globalAlpha = 1;
    }

    // The rows.
    drawWindow(ctx, 104, 18, 134, 128);
    ROWS.forEach((r, i) => {
      const y = 24 + i * 10 + (r.kind === 'action' ? 4 : 0) + (r.kind !== 'part' ? 3 : 0);
      const sel = i === this.cursor;
      if (sel) rect(ctx, 106, y - 2, 130, 10, 'rgba(138,176,255,0.2)');
      if (sel) drawText(ctx, '>', 108 + (t % 30 < 15 ? 0 : 1), y, UI.gold);
      drawText(ctx, r.name, 115, y, r.kind === 'action' ? (sel ? UI.gold : UI.text) : sel ? UI.gold : UI.sub);
      if (r.kind === 'action') return;
      const index = r.options.findIndex((o) => o.id === this.look[r.key]);
      const opt = r.options[index];
      let x = 156;
      if (r.kind === 'color') {
        swatch(r.key, opt, index).forEach((col, k) => rect(ctx, x + k * 4, y, 4, 7, col));
        frame(ctx, x - 1, y - 1, 14, 9, '#05070f');
        x += 16;
      }
      drawText(ctx, opt.name, x, y, sel ? UI.text : UI.sub);
      if (sel) {
        drawText(ctx, '<', 150, y, UI.gold);
        drawText(ctx, '>', 232, y, UI.gold, { align: 'right' });
      }
    });

    // What the highlighted choice is.
    const r = ROWS[this.cursor];
    const desc = r.kind === 'part' ? r.options.find((o) => o.id === this.look[r.key]).desc : r.kind === 'color' ? (r.key === 'lights' ? 'Lights and visor. Style Change tints them.' : `The ${r.name.toLowerCase()} colour.`) : r.desc;
    drawHints(ctx, desc);
  }
}
