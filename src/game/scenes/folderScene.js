import { rect, frame } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawChipArt, drawElementIcon } from '../../render/chipart.js';
import { CHIPS } from '../../engine/chips/library.js';
import { expandFolder, folderCodes } from '../data/folders.js';
import { drawHints, drawWindow, UI } from '../ui.js';
import { folderFusions } from '../data/fusions.js';

// Folder editor. Two lists — the 30-chip FOLDER and the PACK (owned chips not in the folder). Pick a
// chip in one list with A, then a chip in the other list to swap them. The folder always stays at 30.
// Limits: 5 copies of a standard chip, 1 of each Mega (5 Megas max), 1 Giga.
// With `view` (a pre-built folder), it only shows that folder's chips: they're loaned, so nothing changes.

const ROWS_VISIBLE = 8;

function order(key) {
  const d = CHIPS[key];
  return (d?.klass === 'giga' ? 3000 : d?.klass === 'mega' ? 2000 : 0) + (d?.rom ?? 999);
}

function sortChips(list) {
  return list.sort((a, z) => order(a.key) - order(z.key) || a.code.localeCompare(z.code));
}

export class FolderScene {
  constructor(game, back = null, { view = null } = {}) {
    this.game = game;
    this.back = back;
    this.view = view;
    this.pane = 0; // 0 folder, 1 pack
    this.cur = [0, 0];
    this.scroll = [0, 0];
    this.pick = null; // { pane, index }
    this.msg = null;
    this.t = 0;
    this.refresh();
  }

  enter() {
    this.game.audio.music('menu');
  }

  refresh() {
    const save = this.game.save;
    if (this.view) {
      this.folder = sortChips(expandFolder(this.view.chips));
      this.pack = [];
      this.cur[0] = Math.max(0, Math.min(this.cur[0], this.folder.length - 1));
      return;
    }
    this.folder = sortChips(save.data.folder.map((c) => ({ ...c })));
    save.data.folder = this.folder.map((c) => ({ ...c }));
    const counts = new Map();
    for (const [id, n] of Object.entries(save.data.library)) counts.set(id, n);
    for (const c of this.folder) counts.set(`${c.key}:${c.code}`, (counts.get(`${c.key}:${c.code}`) ?? 0) - 1);
    const pack = [];
    for (const [id, n] of counts) {
      if (n <= 0) continue;
      const [key, code] = id.split(':');
      if (CHIPS[key]) pack.push({ key, code, n });
    }
    this.pack = sortChips(pack);
    for (const p of [0, 1]) {
      const len = this.list(p).length;
      this.cur[p] = Math.max(0, Math.min(this.cur[p], len - 1));
    }
  }

  list(p) {
    return p === 0 ? this.folder : this.pack;
  }

  current() {
    return this.list(this.pane)[this.cur[this.pane]] ?? null;
  }

  update(held, edges) {
    this.t++;
    if (this.msg && --this.msg.ttl <= 0) this.msg = null;
    const len = this.list(this.pane).length;
    let moved = false;
    if (edges.repeat.up && this.cur[this.pane] > 0) {
      this.cur[this.pane]--;
      moved = true;
    }
    if (edges.repeat.down && this.cur[this.pane] < len - 1) {
      this.cur[this.pane]++;
      moved = true;
    }
    if ((edges.pressed.left || edges.pressed.right) && !this.view) {
      this.pane = this.pane ? 0 : 1;
      moved = true;
    }
    if (edges.repeat.l) {
      this.cur[this.pane] = Math.max(0, this.cur[this.pane] - ROWS_VISIBLE);
      moved = true;
    }
    if (edges.repeat.r) {
      this.cur[this.pane] = Math.max(0, Math.min(this.list(this.pane).length - 1, this.cur[this.pane] + ROWS_VISIBLE));
      moved = true;
    }
    if (moved) this.game.audio.play('cursor');
    for (const p of [0, 1]) {
      if (this.cur[p] < this.scroll[p]) this.scroll[p] = this.cur[p];
      if (this.cur[p] >= this.scroll[p] + ROWS_VISIBLE) this.scroll[p] = this.cur[p] - ROWS_VISIBLE + 1;
    }

    if (this.view) {
      if (edges.pressed.b || edges.pressed.a) {
        this.game.audio.play('deselect');
        this.game.setScene(this.back());
      }
      return;
    }
    if (edges.pressed.b) {
      if (this.pick) {
        this.pick = null;
        this.game.audio.play('deselect');
        return;
      }
      this.game.save.persist();
      this.game.audio.play('deselect');
      if (this.back) this.game.setScene(this.back());
      else import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
      return;
    }
    if (!edges.pressed.a) return;
    const here = this.current();
    if (!here) return;
    if (!this.pick || this.pick.pane === this.pane) {
      this.pick = { pane: this.pane, index: this.cur[this.pane] };
      this.pane = this.pane ? 0 : 1;
      this.game.audio.play('select');
      return;
    }
    // Swap the picked chip with this one.
    const folderIdx = this.pick.pane === 0 ? this.pick.index : this.cur[0];
    const packIdx = this.pick.pane === 1 ? this.pick.index : this.cur[1];
    const out = this.folder[folderIdx];
    const inn = this.pack[packIdx];
    if (!out || !inn) return;
    const rest = this.folder.filter((_, i) => i !== folderIdx);
    if (!this.game.save.canAddToFolder(inn, rest)) {
      const def = CHIPS[inn.key];
      this.msg = { text: def.klass === 'mega' ? 'Mega: 1 each, 5 max' : def.klass === 'giga' ? 'Giga: 1 max' : 'Max 5 of one chip', ttl: 90 };
      this.game.audio.play('buzz');
      this.pick = null;
      return;
    }
    this.game.save.data.folder = [...rest, { key: inn.key, code: inn.code }];
    this.pick = null;
    this.game.audio.play('confirm');
    this.refresh();
    this.game.save.persist();
  }

  draw(ctx) {
    const t = this.t;
    drawBackground(ctx, 'title', t);
    ctx.globalAlpha = 0.5;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    // Info.
    rect(ctx, 0, 0, 240, 56, '#0c1638');
    rect(ctx, 0, 56, 240, 1, '#8ab0ff');
    const c = this.current();
    if (c) {
      const def = CHIPS[c.key];
      drawChipArt(ctx, def, 4, 4, t);
      frame(ctx, 3, 3, 58, 50, '#6a88d8');
      drawText(ctx, def.name, 66, 4, '#ffffff');
      drawText(ctx, c.code, 66, 15, c.code === '*' ? UI.gold : '#9ae8ff', { scale: 2 });
      drawElementIcon(ctx, def.element, 80, 17);
      const dmg = def.kind === 'boost' ? `+${def.damage}` : def.damage > 0 && def.kind !== 'support' ? String(def.damage) : '--';
      drawText(ctx, dmg, 120, 17, '#ffffff');
      drawText(ctx, `${def.mb}MB`, 236, 4, UI.sub, { align: 'right' });
      drawText(ctx, def.klass === 'standard' ? '' : def.klass.toUpperCase(), 236, 17, def.klass === 'giga' ? '#ff7ae0' : '#7affe0', { align: 'right' });
      wrapText(def.desc, 168).slice(0, 3).forEach((l, i) => drawText(ctx, l, 66, 30 + i * 8, UI.sub));
    }
    // Lists.
    if (this.view) {
      this.drawList(ctx, 0, 2, this.view.name, this.folder, () => '');
      this.drawViewInfo(ctx);
      drawHints(ctx, 'Up/down: look   L/R: page   B: back');
      return;
    }
    this.drawList(ctx, 0, 2, 'FOLDER', this.folder, (x) => '');
    this.drawList(ctx, 1, 122, 'PACK', this.pack, (x) => (x.n > 1 ? `x${x.n}` : ''));
    if (this.msg) drawText(ctx, this.msg.text, 120, 140, UI.bad, { align: 'center', outline: '#05070f' });
    drawHints(ctx, this.pick ? 'Pick the chip to swap with   B: cancel' : 'A: pick   </>: switch list   L/R: page   B: done');
  }

  // Beside a pre-built folder's chips: its codes and fusions.
  drawViewInfo(ctx) {
    const v = this.view;
    drawWindow(ctx, 122, 60, 116, 86, { title: 'PRE-BUILT' });
    let y = 76;
    const put = (text, color = UI.sub) => {
      for (const l of wrapText(text, 106)) {
        if (y > 138) return;
        drawText(ctx, l, 127, y, color);
        y += 8;
      }
    };
    put(`Codes ${folderCodes(this.folder).slice(0, 6).join(' ')}`, '#9ae8ff');
    for (const f of folderFusions(this.folder).filter((f) => v.pa?.includes(f.pa.key))) put(`FUSION ${f.pa.name}: ${f.text}`, UI.gold);
    y += 2;
    put('Loaned chips: equip it from the FOLDER menu. It can\'t be edited.');
  }

  drawList(ctx, p, x, title, list, extra) {
    const active = this.pane === p;
    rect(ctx, x, 60, 116, 86, '#0a1230');
    frame(ctx, x, 60, 116, 86, active ? '#8ab0ff' : '#2a3c7a');
    drawText(ctx, `${title} ${p === 0 ? list.length : list.reduce((n, c) => n + c.n, 0)}`, x + 4, 62, active ? UI.gold : UI.dim);
    for (let k = 0; k < ROWS_VISIBLE; k++) {
      const i = this.scroll[p] + k;
      const c = list[i];
      if (!c) break;
      const y = 72 + k * 9;
      const def = CHIPS[c.key];
      const picked = this.pick && this.pick.pane === p && this.pick.index === i;
      const sel = active && this.cur[p] === i;
      if (picked) rect(ctx, x + 1, y - 1, 114, 9, 'rgba(255,224,74,0.25)');
      if (sel) rect(ctx, x + 1, y - 1, 114, 9, 'rgba(138,176,255,0.25)');
      drawElementIcon(ctx, def.element, x + 3, y - 1);
      drawText(ctx, def.name, x + 15, y, def.klass === 'mega' ? '#7affe0' : def.klass === 'giga' ? '#ff9af0' : '#ffffff');
      drawText(ctx, c.code, x + 86, y, c.code === '*' ? UI.gold : '#9ae8ff');
      const ex = extra(c);
      if (ex) drawText(ctx, ex, x + 112, y, UI.sub, { align: 'right' });
    }
    if (list.length > ROWS_VISIBLE) {
      const h = Math.max(6, Math.round((ROWS_VISIBLE / list.length) * 72));
      const y = 72 + Math.round((this.scroll[p] / Math.max(1, list.length - ROWS_VISIBLE)) * (72 - h));
      rect(ctx, x + 113, y, 2, h, '#5a70b0');
    }
  }
}
