import { rect, frame } from '../../render/pixel.js';
import { drawText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { PLAYER_SPRITE, PAL } from '../../render/sprites/core_player.js';
import { LOOK_SLOTS, LOOK_COLORS, COLOR_CHANNELS, DEFAULT_LOOK, colorRamp } from '../../render/sprites/core_player_looks.js';
import { load3d, renderer3d, graphicsMode } from '../../render/graphics.js';
import { pickGlb } from '../modelImport.js';
import { drawWindow, drawHints, moveCursor, UI } from '../ui.js';

// CUSTOMIZE: AXIOM's look. A part for each slot and a colour for the armour, the suit and the lights, or a
// 3D model in AXIOM's place (with 3D graphics): the built-in mech or the player's own .glb. A large preview
// runs through a few battle poses. Purely cosmetic; every change is saved at once.

const ACTIONS = [
  { key: 'random', name: 'RANDOM', desc: 'Roll random parts and colours.' },
  { key: 'reset', name: 'RESET', desc: "Back to AXIOM's own look." },
  { key: 'done', name: 'DONE', desc: 'Keep this look. Looks never change battles.' },
];

const ROWS = [
  ...LOOK_SLOTS.map((s) => ({ kind: 'part', key: s.key, name: s.name, options: s.options })),
  ...COLOR_CHANNELS.map((c) => ({ kind: 'color', key: c.key, name: c.name, options: LOOK_COLORS[c.key] })),
  { kind: 'model', key: 'model', name: '3D MODEL' },
  { kind: 'turn', key: 'turn', name: 'TURN' },
  { kind: 'load', key: 'load', name: 'LOAD .GLB' },
  { kind: 'actions', key: 'actions', name: '' },
];
const GROUP_STARTS = [5, 8, 11]; // a small gap before the colours, the 3D rows and the actions
const rowY = (i) => 22 + i * 9 + GROUP_STARTS.filter((g) => i >= g).length * 3;
const TURNS = ['0', '90', '180', '270'];

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
    this.act = 2; // the highlighted action on the last row (DONE)
    this.t = 0;
    this.showT = 0; // frames into the preview loop
    this.flash = 0; // the preview flashes briefly on a change
    this.gestured = false; // a key or tap opened the file picker
    this.waitPick = 0; // frames left for a press of A on LOAD .GLB to arrive as a key or tap
  }

  enter() {
    this.game.audio.music('menu');
    // The 3D renderer draws the model preview; start loading it and the models now.
    load3d().then((m) => {
      if (!m) return;
      m.modelStatus('custom');
      if (this.look.model !== 'none') m.modelStatus(this.look.model);
    });
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

  // A model's state: { state: 'loading' | 'ready' | 'error', name, error } (null until 3D has loaded).
  status(kind) {
    return renderer3d()?.modelStatus(kind) ?? null;
  }

  // The models the 3D MODEL row offers: the custom one once there is one.
  models() {
    const c = this.status('custom');
    const has = this.look.model === 'custom' || (c && c.state !== 'error');
    return has ? ['none', 'mech', 'custom'] : ['none', 'mech'];
  }

  modelName(kind) {
    if (kind === 'none') return 'OFF';
    if (kind === 'mech') return 'MECH';
    const st = this.status('custom');
    if (st?.state === 'loading' && !st.name) return 'LOADING';
    return (st?.name ?? 'CUSTOM').toUpperCase().slice(0, 9);
  }

  // The key or tap that pressed A on LOAD .GLB opens the file picker (browsers allow pickers only then: a
  // key press, a click, or a tap as it lifts).
  onGesture(btn) {
    if ((btn === 'a' || btn === 'start') && ROWS[this.cursor].kind === 'load') {
      this.gestured = true;
      this.waitPick = 0;
      pickGlb(this.game);
    }
  }

  update(held, edges) {
    this.t++;
    this.showT++;
    if (this.flash > 0) this.flash--;
    const gestured = this.gestured;
    this.gestured = false;
    const audio = this.game.audio;
    // A pad's A can't open a picker; say how to, if no key or tap did it.
    if (this.waitPick > 0 && --this.waitPick === 0) this.game.notify('Press X (or tap A) to pick a .glb, or drop one onto the game.');
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
    const dir = edges.repeat.left ? -1 : edges.repeat.right ? 1 : 0;
    const go = edges.pressed.a || edges.pressed.start;
    if (row.kind === 'part' || row.kind === 'color') {
      const step = dir || (edges.pressed.a ? 1 : 0);
      if (!step) return;
      const i = row.options.findIndex((o) => o.id === this.look[row.key]);
      const next = row.options[(i + step + row.options.length) % row.options.length];
      this.setLook({ ...this.look, [row.key]: next.id });
      audio.play('select');
    } else if (row.kind === 'model') {
      const step = dir || (edges.pressed.a ? 1 : 0);
      if (!step) return;
      const list = this.models();
      const i = Math.max(0, list.indexOf(this.look.model));
      const model = list[(i + step + list.length) % list.length];
      this.setLook({ ...this.look, model });
      if (model !== 'none') renderer3d()?.modelStatus(model);
      audio.play('select');
    } else if (row.kind === 'turn') {
      const step = dir || (edges.pressed.a ? 1 : 0);
      if (!step) return;
      if (this.look.model === 'none') {
        audio.play('buzz');
        return;
      }
      this.setLook({ ...this.look, turn: (this.look.turn + step + 4) % 4 });
      audio.play('select');
    } else if (row.kind === 'load') {
      if (!go) return;
      audio.play('confirm');
      if (!gestured) this.waitPick = 45;
    } else {
      if (dir) {
        this.act = (this.act + dir + ACTIONS.length) % ACTIONS.length;
        audio.play('cursor');
        return;
      }
      if (!go) return;
      const key = ACTIONS[this.act].key;
      audio.play('confirm');
      if (key === 'done') this.leave();
      else if (key === 'reset') this.setLook(DEFAULT_LOOK);
      else {
        const look = { ...this.look };
        for (const r of ROWS) if (r.kind === 'part' || r.kind === 'color') look[r.key] = r.options[Math.floor(Math.random() * r.options.length)].id;
        this.setLook(look);
      }
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

  // The look's 3D model in the preview box. Returns 'drawn', or a word for why not.
  drawModel(ctx, box) {
    const m = renderer3d();
    const layer = m?.glLayer();
    if (!layer) return m ? 'NO WEBGL' : 'LOADING';
    const st = m.modelStatus(this.look.model);
    if (st?.state === 'loading') return 'LOADING';
    if (st?.state !== 'ready') return 'NO MODEL';
    ctx.clearRect(box.x, box.y, box.w, box.h);
    return m.drawPreview(layer, this.look, this.previewPose(), box, this.t) ? 'drawn' : 'LOADING';
  }

  draw(ctx) {
    const t = this.t;
    const look = this.look;
    drawBackground(ctx, 'title', t);
    ctx.globalAlpha = 0.55;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    rect(ctx, 0, 0, 240, 14, '#0c1638');
    rect(ctx, 0, 14, 240, 1, '#8ab0ff');
    drawText(ctx, 'CUSTOMIZE', 5, 4, UI.gold);
    drawText(ctx, '</>: change   B: done', 235, 4, UI.dim, { align: 'right' });

    // The preview: the 3D model, or AXIOM at twice size on a battle panel.
    drawWindow(ctx, 2, 18, 98, 128, { title: look.model === 'none' ? 'AXIOM' : this.modelName(look.model) });
    const shown = look.model === 'none' ? 'sprite' : this.drawModel(ctx, { x: 4, y: 30, w: 94, h: 114 });
    if (shown !== 'drawn') {
      const px = 51;
      const py = 128;
      rect(ctx, px - 30, py - 2, 60, 12, '#3a1420');
      rect(ctx, px - 30, py - 2, 60, 2, '#ff8a96');
      rect(ctx, px - 28, py, 56, 7, '#e0485a');
      rect(ctx, px - 28, py + 7, 56, 1, '#7a1a2a');
      const pose = this.previewPose();
      if (shown !== 'sprite') ctx.globalAlpha = 0.35;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(2, 2);
      PLAYER_SPRITE.draw(ctx, { anim: pose.anim, animT: pose.animT, facing: 1, data: { look } }, 0, 0, t);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (shown !== 'sprite') drawText(ctx, shown === 'LOADING' ? `LOADING${'.'.repeat((t >> 4) % 4)}` : shown, px, 78, UI.text, { align: 'center', outline: '#05070f' });
    }
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash / 16;
      rect(ctx, 5, 21, 92, 122, '#ffffff');
      ctx.globalAlpha = 1;
    }

    // The rows.
    drawWindow(ctx, 104, 18, 134, 128);
    ROWS.forEach((r, i) => {
      const y = rowY(i);
      const sel = i === this.cursor;
      if (sel) rect(ctx, 106, y - 2, 130, 10, 'rgba(138,176,255,0.2)');
      if (r.kind === 'actions') {
        ACTIONS.forEach((a, k) => {
          const x = 116 + k * 40;
          const on = sel && k === this.act;
          if (on) drawText(ctx, '>', x - 7 + (t % 30 < 15 ? 0 : 1), y, UI.gold);
          drawText(ctx, a.name, x, y, on ? UI.gold : sel ? UI.text : UI.sub);
        });
        return;
      }
      if (sel) drawText(ctx, '>', 108 + (t % 30 < 15 ? 0 : 1), y, UI.gold);
      const off = (r.kind === 'turn' && look.model === 'none') || r.kind === 'load';
      drawText(ctx, r.name, 115, y, sel ? UI.gold : r.kind === 'load' ? UI.text : UI.sub);
      if (r.kind === 'load') return;
      let value;
      let x = 156;
      if (r.kind === 'model' || r.kind === 'turn') x = 172;
      if (r.kind === 'model') value = this.modelName(look.model);
      else if (r.kind === 'turn') {
        value = look.model === 'none' ? '-' : TURNS[look.turn];
      } else {
        const index = r.options.findIndex((o) => o.id === look[r.key]);
        const opt = r.options[index];
        if (r.kind === 'color') {
          swatch(r.key, opt, index).forEach((col, k) => rect(ctx, x + k * 4, y, 4, 7, col));
          frame(ctx, x - 1, y - 1, 14, 9, '#05070f');
          x += 16;
        }
        value = opt.name;
      }
      drawText(ctx, value, x, y, off ? UI.dim : sel ? UI.text : UI.sub);
      if (sel && !off) {
        drawText(ctx, '<', x - 6, y, UI.gold);
        drawText(ctx, '>', 232, y, UI.gold, { align: 'right' });
      }
    });

    drawHints(ctx, this.describe());
  }

  // What the highlighted choice is.
  describe() {
    const r = ROWS[this.cursor];
    const look = this.look;
    const in2d = graphicsMode() !== '3d' ? ' (3D graphics only)' : '';
    switch (r.kind) {
      case 'part':
        return r.options.find((o) => o.id === look[r.key]).desc;
      case 'color':
        return r.key === 'lights' ? 'Lights and visor. Style Change tints them.' : `The ${r.name.toLowerCase()} colour.`;
      case 'model': {
        if (look.model === 'none') return 'OFF: AXIOM as drawn, in parts.';
        const st = this.status(look.model);
        if (st?.state === 'error') return `Model problem: ${st.error}`.slice(0, 44);
        return look.model === 'mech' ? `A ready-made 3D mech${in2d}.` : `Your own model${in2d}.`;
      }
      case 'turn':
        return look.model === 'none' ? 'Pick a 3D model first.' : 'Spin a model made facing another way.';
      case 'load':
        return 'A: pick a .glb (Tripo: Export > GLB)';
      default:
        return ACTIONS[this.act].desc;
    }
  }
}
