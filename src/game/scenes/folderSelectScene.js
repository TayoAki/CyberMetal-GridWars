import { rect } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawElementIcon } from '../../render/chipart.js';
import { CHIPS } from '../../engine/chips/library.js';
import { AREAS } from '../data/areas.js';
import { PRESET_FOLDERS, folderCodes } from '../data/folders.js';
import { drawWindow, drawMenu, drawHints, moveCursor, UI } from '../ui.js';

// The FOLDER menu: your own folder and the pre-built ones (data/folders.js). Pick one to equip it for
// battles; your own folder can be edited, a pre-built one viewed. Pre-built folders unlock on reaching
// their Gauntlet area.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// How a Program Advance is made from this folder's chips, e.g. "Cannon A B C" or "Sword WideSwrd LongSwrd L".
export function paRecipeText(paKey, chips) {
  const pa = CHIPS[paKey];
  if (!pa?.recipe) return '';
  const r = pa.recipe;
  if (r.type === 'consecutive') {
    const codes = [...new Set(chips.filter((c) => c.key === r.chip && c.code !== '*').map((c) => c.code))].sort();
    const start = codes.find((c) => [...Array(r.count).keys()].every((i) => codes.includes(LETTERS[LETTERS.indexOf(c) + i])));
    const run = start ? [...Array(r.count).keys()].map((i) => LETTERS[LETTERS.indexOf(start) + i]) : [];
    return `${CHIPS[r.chip].name} ${run.join(' ')}`.trim();
  }
  // A set: the code every recipe chip has in this folder (a `*` chip goes with any code).
  const has = r.chips.map((k) => new Set(chips.filter((c) => c.key === k).map((c) => c.code)));
  const code = LETTERS.split('').find((L) => has.every((s) => s.has(L) || s.has('*'))) ?? (has.every((s) => s.has('*')) ? '*' : '');
  return `${r.chips.map((k) => CHIPS[k].name).join(' ')} ${code}`.trim();
}

export class FolderSelectScene {
  constructor(game, back = null) {
    this.game = game;
    this.back = back;
    this.rows = [{ key: 'mine', name: 'MY FOLDER' }, ...PRESET_FOLDERS];
    const active = game.save.data.activeFolder;
    this.cursor = Math.max(0, this.rows.findIndex((r) => r.key === active));
    this.menu = null; // { items, cursor } while the EQUIP / EDIT / VIEW menu is open
    this.msg = null;
    this.t = 0;
  }

  enter() {
    this.game.audio.music('menu');
  }

  row() {
    return this.rows[this.cursor];
  }

  unlocked(row) {
    return row.key === 'mine' || this.game.save.folderUnlocked(row.key);
  }

  leave() {
    this.game.save.persist();
    if (this.back) this.game.setScene(this.back());
    else import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
  }

  // Come back to this menu (on the same folder) from the editor or the viewer.
  reopen() {
    const s = new FolderSelectScene(this.game, this.back);
    s.cursor = this.cursor;
    return s;
  }

  update(held, edges) {
    this.t++;
    if (this.msg && --this.msg.ttl <= 0) this.msg = null;
    const audio = this.game.audio;
    if (this.menu) {
      const c = moveCursor(edges, this.menu.cursor, this.menu.items.length);
      if (c !== this.menu.cursor) {
        this.menu.cursor = c;
        audio.play('cursor');
      }
      if (edges.pressed.b) {
        this.menu = null;
        audio.play('deselect');
      } else if (edges.pressed.a || edges.pressed.start) this.choose(this.menu.items[this.menu.cursor].action);
      return;
    }
    const c = moveCursor(edges, this.cursor, this.rows.length);
    if (c !== this.cursor) {
      this.cursor = c;
      audio.play('cursor');
    }
    if (edges.pressed.b) {
      audio.play('deselect');
      this.leave();
      return;
    }
    if (!(edges.pressed.a || edges.pressed.start)) return;
    const row = this.row();
    if (!this.unlocked(row)) {
      audio.play('buzz');
      this.msg = { text: `Reach ${AREAS[row.area].name} to unlock`, color: UI.bad, ttl: 100 };
      return;
    }
    const equipped = this.game.save.data.activeFolder === row.key;
    this.menu = {
      cursor: 0,
      items: [
        { label: equipped ? 'EQUIPPED' : 'EQUIP', action: 'equip', disabled: equipped },
        row.key === 'mine' ? { label: 'EDIT', action: 'edit' } : { label: 'VIEW CHIPS', action: 'view' },
      ],
    };
    audio.play('select');
  }

  choose(action) {
    const row = this.row();
    const audio = this.game.audio;
    if (action === 'equip') {
      if (this.game.save.data.activeFolder === row.key) {
        audio.play('buzz');
        return;
      }
      this.game.save.equipFolder(row.key);
      this.menu = null;
      this.msg = { text: `${row.name} equipped`, color: UI.good, ttl: 90 };
      audio.play('confirm');
      return;
    }
    audio.play('confirm');
    const view = action === 'view' ? row : null;
    import('./folderScene.js').then(({ FolderScene }) => this.game.setScene(new FolderScene(this.game, () => this.reopen(), { view })));
  }

  draw(ctx) {
    const t = this.t;
    const save = this.game.save;
    drawBackground(ctx, 'title', t);
    ctx.globalAlpha = 0.55;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    rect(ctx, 0, 0, 240, 14, '#0c1638');
    rect(ctx, 0, 14, 240, 1, '#8ab0ff');
    drawText(ctx, 'FOLDERS', 5, 4, UI.gold);
    const active = this.rows.find((r) => r.key === save.data.activeFolder) ?? this.rows[0];
    drawText(ctx, `IN USE: ${active.name}`, 235, 4, UI.sub, { align: 'right' });

    // The list.
    drawWindow(ctx, 2, 18, 104, 128);
    this.rows.forEach((r, i) => {
      const y = 24 + i * 15;
      const open = this.unlocked(r);
      const sel = i === this.cursor;
      if (sel) rect(ctx, 4, y - 3, 100, 13, 'rgba(138,176,255,0.2)');
      if (sel && !this.menu) drawText(ctx, '>', 6 + (t % 30 < 15 ? 0 : 1), y, UI.gold);
      drawText(ctx, r.name, 14, y, open ? (sel ? UI.gold : UI.text) : UI.dim);
      if (r.key === save.data.activeFolder) drawText(ctx, 'E', 100, y, UI.good, { align: 'right' });
    });

    // Details of the highlighted folder.
    const r = this.row();
    drawWindow(ctx, 108, 18, 130, 128, { title: this.unlocked(r) ? r.name : `LOCKED: AREA ${r.area + 1}`, titleColor: this.unlocked(r) ? UI.gold : UI.dim });
    let y = 34;
    const line = (text, color = UI.sub) => {
      for (const l of wrapText(text, 120)) {
        if (y > 136) return;
        drawText(ctx, l, 113, y, color);
        y += 8;
      }
    };
    if (!this.unlocked(r)) {
      line(r.desc, UI.dim);
      y += 4;
      line(`Reach ${AREAS[r.area].name} (area ${r.area + 1}) in the Gauntlet to unlock it.`);
    } else {
      const chips = save.folderChips(r.key);
      line(r.key === 'mine' ? 'Your own folder, built from the chips you have won.' : r.desc, UI.text);
      y += 3;
      drawText(ctx, 'CODES', 113, y, UI.dim);
      drawText(ctx, folderCodes(chips).slice(0, 7).join(' '), 148, y, '#9ae8ff');
      y += 10;
      // The elements it carries.
      const elements = ['fire', 'aqua', 'elec', 'wood'].filter((el) => chips.some((c) => CHIPS[c.key]?.element === el));
      drawText(ctx, 'ELEM', 113, y, UI.dim);
      if (elements.length) elements.forEach((el, i) => drawElementIcon(ctx, el, 148 + i * 12, y - 1));
      else drawText(ctx, 'none', 148, y, UI.sub);
      y += 11;
      const megas = chips.filter((c) => CHIPS[c.key]?.klass === 'mega').map((c) => CHIPS[c.key].name);
      if (megas.length) {
        drawText(ctx, 'MEGA', 113, y, UI.dim);
        drawText(ctx, megas.join(' '), 148, y, '#7affe0');
        y += 10;
      }
      for (const pa of r.pa ?? []) {
        drawText(ctx, `PA ${CHIPS[pa].name}`, 113, y, UI.gold);
        y += 8;
        line(paRecipeText(pa, chips));
        y += 1;
      }
      if (r.key !== 'mine') {
        y = Math.max(y, 130);
        drawText(ctx, 'Loaned: can\'t be edited', 113, y, UI.dim);
      }
    }

    if (this.menu) {
      const my = Math.min(116, 20 + this.cursor * 15);
      drawWindow(ctx, 40, my, 80, 32);
      drawMenu(ctx, this.menu.items, this.menu.cursor, 54, my + 7, { width: 62, t, lineHeight: 12 });
    }
    drawHints(ctx, this.menu ? 'A: choose   B: cancel' : 'A: equip / edit / view   B: done');
    if (this.msg) {
      // Messages take over the hint bar for a moment.
      rect(ctx, 0, 148, 240, 12, '#05070f');
      drawText(ctx, this.msg.text, 120, 150, this.msg.color, { align: 'center' });
    }
  }
}
