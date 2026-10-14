import { rect } from '../../render/pixel.js';
import { drawText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawWindow, drawHints, moveCursor, UI } from '../ui.js';
import { AREAS, bossVersion } from '../data/areas.js';
import { BattleScene } from './battleScene.js';
import { applyReward, rollReward, bossReward } from '../rewards.js';
import { rankValue } from './gauntletScene.js';
import { ENEMIES } from '../../engine/enemies/index.js';

// Free Battle: replay any battle you have reached, rematch beaten bosses at higher versions
// (V2 → V3 → Ω unlock one after another), or roll a random mixed battle. Full HP every time.

const VERSION_NAMES = ['V1', 'V2', 'V3', 'Ω'];

export class FreeBattleScene {
  constructor(game, cursor = 0) {
    this.game = game;
    this.cursor = cursor;
    this.scroll = 0;
    this.t = 0;
    this.entries = this.buildEntries();
  }

  enter() {
    this.game.audio.music('menu');
  }

  buildEntries() {
    const d = this.game.save.data;
    const p = d.progress;
    const out = [{ kind: 'random', label: 'RANDOM BATTLE', sub: 'mixed viruses' }];
    AREAS.forEach((a, ai) => {
      const reached = p.finished || ai <= p.area;
      if (!reached) return;
      out.push({ kind: 'header', label: a.name });
      a.battles.forEach((b, bi) => {
        const done = p.finished || ai < p.area || (ai === p.area && bi < p.step) || p.encounters[b.id];
        if (done) out.push({ kind: 'virus', enc: { ...b, theme: a.theme }, label: b.name, sub: rankLabel(p.encounters[b.id]) });
      });
      const type = a.boss.enemies[0].type;
      const beaten = p.bosses[type] ?? 0;
      for (let v = 1; v <= Math.min(4, beaten + 1); v++) {
        if (v === 1 && !beaten) continue; // V1 is fought in the Gauntlet first
        out.push({ kind: 'boss', enc: { ...bossVersion(a.boss, v), theme: a.theme, final: a.boss.final }, version: v, label: `${a.boss.name} ${VERSION_NAMES[v - 1]}`, sub: v <= beaten ? 'beaten' : 'NEW' });
      }
    });
    return out;
  }

  selectable(i) {
    return this.entries[i] && this.entries[i].kind !== 'header';
  }

  update(held, edges) {
    this.t++;
    let c = moveCursor(edges, this.cursor, this.entries.length);
    let guard = 0;
    const dir = edges.repeat.up ? -1 : 1;
    while (!this.selectable(c) && guard++ < this.entries.length) c = (c + dir + this.entries.length) % this.entries.length;
    if (c !== this.cursor) {
      this.cursor = c;
      this.game.audio.play('cursor');
    }
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor > this.scroll + 9) this.scroll = this.cursor - 9;
    if (edges.pressed.b) {
      this.game.audio.play('deselect');
      import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
      return;
    }
    if (edges.pressed.a || edges.pressed.start) {
      this.game.audio.play('confirm');
      this.start(this.entries[this.cursor]);
    }
  }

  randomEncounter() {
    const g = this.game;
    const p = g.save.data.progress;
    const rng = { v: (Date.now() >>> 0) | 1, next() { this.v ^= this.v << 13; this.v ^= this.v >>> 17; this.v ^= this.v << 5; return (this.v >>> 0) / 4294967296; } };
    const known = new Set();
    AREAS.forEach((a, ai) => {
      if (p.finished || ai <= p.area) for (const b of a.battles) for (const e of b.enemies) known.add(e.type);
    });
    const types = [...known].filter((t) => ENEMIES[t] && ENEMIES[t].kind !== 'navi');
    const maxLevel = p.finished ? 4 : Math.min(3, 1 + Math.floor(p.area / 3));
    const n = 2 + Math.floor(rng.next() * 2);
    const spots = [[4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 2], [3, 1]].sort(() => rng.next() - 0.5);
    const enemies = [];
    for (let i = 0; i < n && types.length; i++) {
      const [col, row] = spots[i];
      enemies.push({ type: types[Math.floor(rng.next() * types.length)], level: 1 + Math.floor(rng.next() * maxLevel), col, row });
    }
    const themes = ['boot', 'yards', 'coolant', 'thermal', 'foundry', 'overgrowth', 'rival', 'void'];
    return { id: 'random', name: 'Random', enemies, theme: themes[Math.floor(rng.next() * themes.length)], drops: ['cannon:A', 'recov30:*', 'minibomb:B', 'sword:E', 'shotgun:B'], rare: ['recov80:D', 'hicannon:H'] };
  }

  start(entry) {
    const game = this.game;
    const save = game.save;
    const enc = entry.kind === 'random' ? this.randomEncounter() : entry.enc;
    let pending = null;
    const cursor = this.cursor;
    game.setScene(
      new BattleScene(game, {
        encounter: enc,
        theme: enc.theme,
        final: entry.kind === 'boss' && enc.final,
        player: save.battlePlayer(),
        rewardFor: (result, battle) => {
          pending = entry.kind === 'boss' ? bossReward(save, enc, entry.version, result) : rollReward(save, enc, result, battle.rng);
          return pending;
        },
        onEnd: (result) => {
          const d = save.data;
          d.records.battles++;
          if (result.won) {
            d.records.wins++;
            if (pending) applyReward(save, pending);
            if (entry.kind === 'boss') {
              const type = enc.enemies[0].type;
              d.progress.bosses[type] = Math.max(d.progress.bosses[type] ?? 0, entry.version);
            } else if (entry.kind === 'virus') {
              d.progress.encounters[enc.id] = Math.max(d.progress.encounters[enc.id] ?? 0, rankValue(result.bustingLevel));
            }
            save.persist();
          }
          game.setScene(new FreeBattleScene(game, cursor));
        },
      }),
    );
  }

  draw(ctx) {
    drawBackground(ctx, 'title', this.t);
    ctx.globalAlpha = 0.4;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;
    drawWindow(ctx, 20, 6, 200, 140, { title: 'FREE BATTLE' });
    const visible = this.entries.slice(this.scroll, this.scroll + 10);
    visible.forEach((e, k) => {
      const i = this.scroll + k;
      const y = 22 + k * 12;
      if (e.kind === 'header') {
        drawText(ctx, e.label, 30, y, UI.dim);
        rect(ctx, 30 + 4 + e.label.length * 6, y + 3, 150 - e.label.length * 6, 1, '#2a3c7a');
        return;
      }
      const sel = i === this.cursor;
      if (sel) {
        rect(ctx, 32, y - 2, 182, 11, 'rgba(138,176,255,0.18)');
        drawText(ctx, '>', 34, y, UI.gold);
      }
      const color = e.kind === 'boss' ? '#ff9a9a' : e.kind === 'random' ? '#7affe0' : sel ? UI.gold : UI.text;
      drawText(ctx, e.label, 42, y, color);
      if (e.sub) drawText(ctx, e.sub, 210, y, e.sub === 'NEW' ? UI.gold : UI.sub, { align: 'right' });
    });
    if (this.entries.length <= 1) drawText(ctx, 'Win Gauntlet battles to unlock more.', 120, 60, UI.sub, { align: 'center' });
    drawHints(ctx, 'A: fight   B: back   Rank shown per battle');
  }
}

function rankLabel(v) {
  if (!v) return '';
  return v >= 11 ? 'best S' : `best ${v}`;
}
