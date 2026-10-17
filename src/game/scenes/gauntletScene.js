import { rect, frame, shade, disc, ring, line } from '../../render/pixel.js';
import { drawText, wrapText } from '../../render/font.js';
import { drawBackground } from '../../render/background.js';
import { drawWindow, drawMenu, drawHints, moveCursor, UI } from '../ui.js';
import { AREAS } from '../data/areas.js';
import { BattleScene } from './battleScene.js';
import { applyReward, rollReward, bossReward } from '../rewards.js';
import { PROGRAMS } from '../save.js';
import { CHIPS } from '../../engine/chips/library.js';

// The campaign map: one area at a time — three virus battles, then the boss. HP carries between the
// three virus battles; the boss is fought at full HP. Losing a virus battle sends you back to the area's
// start, losing to the boss only back to the boss.

export class GauntletScene {
  constructor(game, note = null) {
    this.game = game;
    this.cursor = 0;
    this.t = 0;
    this.note = note; // { text, color } shown once
  }

  enter() {
    this.game.audio.music('menu');
  }

  get save() {
    return this.game.save;
  }

  get area() {
    const p = this.save.data.progress;
    return AREAS[Math.min(p.area, AREAS.length - 1)];
  }

  items() {
    const p = this.save.data.progress;
    const label = p.finished ? 'REMATCH AREA' : p.step >= 3 ? 'FACE THE BOSS' : 'NEXT BATTLE';
    return [
      { label, action: 'fight' },
      { label: 'FOLDER', action: 'folder' },
      { label: 'PROGRAMS', action: 'programs' },
      { label: 'BACK', action: 'back' },
    ];
  }

  update(held, edges) {
    this.t++;
    const items = this.items();
    const c = moveCursor(edges, this.cursor, items.length);
    if (c !== this.cursor) {
      this.cursor = c;
      this.game.audio.play('cursor');
    }
    if (edges.pressed.b) {
      this.game.audio.play('deselect');
      import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
      return;
    }
    if (!(edges.pressed.a || edges.pressed.start)) return;
    this.game.audio.play('confirm');
    const act = items[this.cursor].action;
    if (act === 'fight') this.startBattle();
    else if (act === 'folder') import('./folderSelectScene.js').then(({ FolderSelectScene }) => this.game.setScene(new FolderSelectScene(this.game, () => new GauntletScene(this.game))));
    else if (act === 'programs') import('./programsScene.js').then(({ ProgramsScene }) => this.game.setScene(new ProgramsScene(this.game, () => new GauntletScene(this.game))));
    else import('./titleScene.js').then(({ TitleScene }) => this.game.setScene(new TitleScene(this.game, { menu: true })));
  }

  startBattle() {
    const game = this.game;
    const save = this.save;
    const p = save.data.progress;
    if (p.finished && p.step === 0) p.area = Math.min(p.area, AREAS.length - 1);
    const area = this.area;
    const isBoss = p.step >= 3;
    const enc = isBoss ? { ...area.boss, theme: area.theme, boss: true } : { ...area.battles[p.step], theme: area.theme };
    const hp = isBoss ? save.maxHp : p.hp ?? save.maxHp;
    let pending = null;
    game.setScene(
      new BattleScene(game, {
        encounter: enc,
        theme: area.theme,
        final: !!area.boss.final && isBoss,
        player: save.battlePlayer(hp),
        rewardFor: (result, battle) => {
          pending = isBoss ? bossReward(save, enc, 1, result) : rollReward(save, enc, result, battle.rng);
          return pending;
        },
        onEnd: (result, _reward, scene) => {
          const d = save.data;
          d.records.battles++;
          if (result.won) {
            d.records.wins++;
            if (pending) applyReward(save, pending);
            d.progress.encounters[enc.id] = Math.max(d.progress.encounters[enc.id] ?? 0, rankValue(result.bustingLevel));
            if (isBoss) {
              d.progress.cleared[area.id] = true;
              const bossType = enc.enemies[0].type;
              d.progress.bosses[bossType] = Math.max(d.progress.bosses[bossType] ?? 0, 1);
              d.progress.hp = null;
              d.progress.step = 0;
              if (d.progress.area < AREAS.length - 1) d.progress.area++;
              else d.progress.finished = true;
              save.persist();
              if (area.boss.final && !d.progress.endingSeen) {
                d.progress.endingSeen = true;
                save.persist();
                import('./creditsScene.js').then(({ CreditsScene }) => game.setScene(new CreditsScene(game, { ending: true })));
                return;
              }
              game.setScene(new GauntletScene(game, { text: `${area.name} CLEARED!`, color: UI.gold }));
              return;
            }
            d.progress.step++;
            d.progress.hp = Math.max(1, scene.battle.player.hp);
            save.persist();
            game.setScene(new GauntletScene(game, d.progress.step >= 3 ? { text: 'HP restored for the boss', color: UI.good } : null));
          } else if (isBoss) {
            // The boss is a checkpoint: try it again (at full HP) without replaying the area.
            d.progress.hp = null;
            save.persist();
            game.setScene(new GauntletScene(game, { text: result.retreated ? 'Retreated. The boss waits.' : 'Deleted! Try the boss again.', color: UI.bad }));
          } else {
            d.progress.step = 0;
            d.progress.hp = null;
            save.persist();
            game.setScene(new GauntletScene(game, { text: result.retreated ? 'Retreated. Area reset.' : 'Deleted! Area reset.', color: UI.bad }));
          }
        },
      }),
    );
  }

  draw(ctx) {
    const area = this.area;
    const save = this.save;
    const p = save.data.progress;
    const t = this.t;
    drawBackground(ctx, area.theme, t);
    ctx.globalAlpha = 0.35;
    rect(ctx, 0, 0, 240, 160, '#03050c');
    ctx.globalAlpha = 1;

    // Header.
    drawText(ctx, `AREA ${AREAS.indexOf(area) + 1}/${AREAS.length}`, 6, 5, UI.dim);
    drawText(ctx, area.name, 120, 4, '#ffffff', { align: 'center', scale: 1, outline: '#0a1a4a' });
    const hp = p.step >= 3 ? save.maxHp : p.hp ?? save.maxHp;
    drawText(ctx, `HP ${hp}/${save.maxHp}`, 234, 5, hp < save.maxHp * 0.35 ? UI.bad : UI.good, { align: 'right' });
    wrapText(area.blurb, 220).slice(0, 2).forEach((l, i) => drawText(ctx, l, 120, 17 + i * 9, UI.sub, { align: 'center' }));

    // Node path.
    const nodes = [...area.battles.map((b) => ({ name: b.name, boss: false })), { name: area.boss.name, boss: true }];
    const y = 54;
    const x0 = 30;
    const dx = 60;
    line(ctx, x0, y, x0 + dx * 3, y, '#2a3c7a');
    nodes.forEach((n, i) => {
      const x = x0 + i * dx;
      const done = p.finished ? true : i < p.step;
      const cur = !p.finished && i === p.step;
      if (done) line(ctx, x, y, Math.min(x0 + dx * 3, x + dx), y, '#5ab8ff');
      const r = n.boss ? 7 : 5;
      disc(ctx, x, y, r + 1, '#05070f');
      disc(ctx, x, y, r, done ? '#5ab8ff' : cur ? (t % 30 < 15 ? UI.gold : '#c8a020') : '#1a2448');
      ring(ctx, x, y, r + 2, cur ? UI.gold : '#2a3c7a');
      if (n.boss) drawText(ctx, '!', x, y - 3, done ? '#0a1a3a' : '#ffffff', { align: 'center' });
      drawText(ctx, n.boss ? 'BOSS' : `#${i + 1}`, x, y + 12, cur ? UI.gold : UI.dim, { align: 'center' });
    });
    const nextName = p.finished ? 'All clear' : nodes[p.step]?.name ?? '';
    drawText(ctx, nextName, 120, 80, p.step >= 3 ? '#ff9a9a' : '#ffffff', { align: 'center' });

    drawWindow(ctx, 64, 92, 112, 54);
    drawMenu(ctx, this.items(), this.cursor, 80, 99, { width: 92, t });

    if (this.note && t < 150) drawText(ctx, this.note.text, 120, 37, this.note.color, { align: 'center', outline: '#05070f' });
    const parts = save.data.programs.equipped.filter((k) => PROGRAMS[k]).length;
    drawHints(ctx, `ATK ${save.data.stats.attack}  RAPID ${save.data.stats.rapid}  CHARGE ${save.data.stats.charge}${parts ? `  +${parts} part${parts > 1 ? 's' : ''}` : ''}`);
  }
}

export function rankValue(level) {
  return level === 'S' ? 11 : Number(level) || 0;
}

export { CHIPS };
