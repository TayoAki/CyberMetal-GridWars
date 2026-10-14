import { rect } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawWindow, drawHints, moveCursor, UI } from '../ui.js';
import { PROGRAMS, STYLE_TYPES, STYLE_ELEMENTS } from '../save.js';
import { CHIPS } from '../../engine/chips/library.js';

// Programs: pick a Style (BN3's Style Change: a type plus an element, unlocked by bosses), equip passive
// parts within the memory budget (a simple take on the Navi Customizer), and review raised stats.

const ORDER = ['@type', '@element', ...Object.keys(PROGRAMS)];

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
    const key = ORDER[this.cursor];
    if (key === '@type' || key === '@element') {
      if (edges.pressed.left || edges.pressed.right || edges.pressed.a) this.cycleStyle(key, edges.pressed.left ? -1 : 1);
      return;
    }
    if (!edges.pressed.a) return;
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

  cycleStyle(which, dir) {
    const save = this.game.save;
    const d = save.data;
    const un = save.unlockedStyles();
    const options = which === '@type' ? [null, ...un.types] : ['null', ...un.elements];
    if (options.length <= 1) {
      this.game.audio.play('buzz');
      this.msg = { text: 'Beat bosses to learn Styles', ttl: 80 };
      return;
    }
    const field = which === '@type' ? 'type' : 'element';
    const cur = options.indexOf(d.style[field]);
    const next = options[(cur + dir + options.length) % options.length];
    if (field === 'type' && d.style.type === 'team' && next !== 'team') {
      const megas = d.folder.filter((c) => CHIPS[c.key]?.klass === 'mega').length;
      if (megas > 5) {
        this.game.audio.play('buzz');
        this.msg = { text: 'Folder has over 5 Megas', ttl: 90 };
        return;
      }
    }
    d.style[field] = next;
    this.game.audio.play('select');
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
      const y = 62 + i * 9;
      if (key === '@type' || key === '@element') {
        const sel = i === this.cursor;
        if (sel) {
          rect(ctx, 10, y - 1, 220, 9, 'rgba(138,176,255,0.18)');
          drawText(ctx, '>', 12, y, UI.gold);
        }
        const isType = key === '@type';
        const val = isType ? d.style.type : d.style.element;
        const name = isType ? (val ? STYLE_TYPES[val].name : 'Normal') : val && val !== 'null' ? STYLE_ELEMENTS[val].name : 'None';
        drawText(ctx, isType ? 'STYLE' : 'ELEMENT', 20, y, UI.sub);
        drawText(ctx, `< ${name} >`, 90, y, sel ? UI.gold : '#7affe0');
        return;
      }
      const owned = d.programs.owned.includes(key);
      const on = d.programs.equipped.includes(key);
      const sel = i === this.cursor;
      if (sel) {
        rect(ctx, 10, y - 1, 220, 9, 'rgba(138,176,255,0.18)');
        drawText(ctx, '>', 12, y, UI.gold);
      }
      drawText(ctx, on ? '[ON]' : owned ? '[  ]' : '', 20, y, on ? UI.good : UI.dim);
      drawText(ctx, owned ? PROGRAMS[key].name : '??????', 46, y, owned ? (sel ? UI.gold : UI.text) : UI.dim);
      drawText(ctx, `${PROGRAMS[key].cost}MB`, 226, y, UI.sub, { align: 'right' });
    });
    const key = ORDER[this.cursor];
    let desc;
    if (key === '@type') desc = d.style.type ? STYLE_TYPES[d.style.type].desc : 'No style type. Beat bosses to learn more.';
    else if (key === '@element') desc = d.style.element !== 'null' ? STYLE_ELEMENTS[d.style.element].desc : 'Null body: no weakness. Bosses teach elements.';
    else desc = d.programs.owned.includes(key) ? PROGRAMS[key].desc : 'Locked: earned from bosses.';
    if (this.msg) drawText(ctx, this.msg.text, 120, 134, UI.bad, { align: 'center' });
    else wrapText(desc, 220).slice(0, 1).forEach((l) => drawText(ctx, l, 120, 134, UI.sub, { align: 'center' }));
    drawHints(ctx, '</>: change style   A: equip part   B: back');
  }
}
