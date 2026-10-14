import { COLS, ROWS, PANEL, TEAM, TIMING } from '../engine/constants.js';
import { rect, frame, px, ellipse, ring, shade, line, tinted } from './pixel.js';
import { drawText, measureText } from './font.js';
import { SCREEN_W, SCREEN_H, PANEL_W, PANEL_H, FIELD_Y, floorPoint } from './layout.js';
import { drawBackground } from './background.js';
import { drawEntitySprite, drawSpellSprite, drawFxSprite, fxDuration, ENTITY_SPRITES } from './sprites/index.js';
import { drawChipIcon } from './chipart.js';
import { drawCustomScreen, CustomAnim } from './customView.js';

// Draws a Battle onto the 240x160 buffer and keeps the purely visual state (effects, damage numbers,
// hit flashes, screen shake). Feed it the battle's events every frame with consume().

const TEAM_PAL = {
  [TEAM.RED]: { top: '#e05454', inner: '#ee7070', face: '#9a2626', edge: '#4a0c10', hi: '#ffaaa4' },
  [TEAM.BLUE]: { top: '#5272e4', inner: '#7090f0', face: '#26369a', edge: '#0c1450', hi: '#acc0ff' },
};

const SPECIAL = {
  [PANEL.GRASS]: { top: '#3e9e3a', inner: '#56b84a', dark: '#2a7428' },
  [PANEL.ICE]: { top: '#9adcf8', inner: '#c4f0ff', dark: '#6ab0d8' },
  [PANEL.LAVA]: { top: '#e2541a', inner: '#ff8a2a', dark: '#a02a10' },
  [PANEL.POISON]: { top: '#7a3aa6', inner: '#9a56c8', dark: '#4e2070' },
  [PANEL.HOLY]: { top: '#f2e2a0', inner: '#fff8d8', dark: '#c8b060' },
  [PANEL.SAND]: { top: '#d2b06e', inner: '#e4c88a', dark: '#a8864a' },
  [PANEL.METAL]: { top: '#8a94a6', inner: '#a8b2c4', dark: '#5a6274' },
};

const ELEMENT_COLORS = { null: '#ffffff', fire: '#ff8a4a', aqua: '#6ac8ff', elec: '#ffe85a', wood: '#7ae07a' };

export class BattleView {
  constructor(battle, opts = {}) {
    this.b = battle;
    this.theme = opts.theme ?? 'boot';
    this.onSfx = opts.onSfx ?? (() => {});
    this.hud = opts.hud ?? true;
    this.t = 0;
    this.fx = [];
    this.nums = [];
    this.flash = new Map(); // entity id -> frames of white flash left
    this.shake = 0;
    this.texts = []; // floating words (COUNTER!)
    this.chipBanner = null; // last chip used: { name, age }
    this.custom = new CustomAnim();
    this.screenFlash = 0;
  }

  consume(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'fx':
          if (ev.fx === 'flash') this.screenFlash = 24;
          this.fx.push({ ev, age: 0, dur: fxDuration(ev.fx) });
          if (ev.fx === 'explosion' || ev.fx === 'quake') this.shake = Math.max(this.shake, 4);
          break;
        case 'sfx':
          this.onSfx(ev.name);
          break;
        case 'hurt':
          this.flash.set(ev.id, 4);
          this.nums.push({ text: String(ev.amount), col: ev.col, row: ev.row, age: 0, color: ev.id === this.b.player.id ? '#ff7a7a' : ev.doubled ? '#ffe04a' : '#ffffff' });
          break;
        case 'heal':
          this.nums.push({ text: `+${ev.amount}`, col: ev.col, row: ev.row, age: 0, color: '#7aff9a' });
          break;
        case 'delete': {
          const n = ev.kind === 'navi' ? 7 : ev.kind === 'object' ? 2 : 3;
          for (let i = 0; i < n; i++) {
            this.fx.push({ ev: { fx: 'explosion', col: ev.col + (i % 2 ? 0.2 : -0.2) * (i > 0), row: ev.row + (i > 1 ? -0.25 : 0), ox: (i * 7) % 11 - 5, oy: -((i * 5) % 9) }, age: -i * 5, dur: fxDuration('explosion') });
          }
          this.shake = Math.max(this.shake, ev.kind === 'navi' ? 10 : 5);
          break;
        }
        case 'counter':
          this.texts.push({ text: 'COUNTER!', col: ev.col, row: ev.row, age: 0, color: '#ffe04a' });
          break;
        case 'chipuse':
          this.chipBanner = { name: ev.name, age: 0 };
          break;
        case 'custom':
          if (ev.open) this.custom.open();
          else this.custom.close();
          break;
        default:
          break;
      }
    }
  }

  update() {
    this.t++;
    for (const f of this.fx) f.age++;
    this.fx = this.fx.filter((f) => f.age < f.dur);
    for (const n of this.nums) n.age++;
    this.nums = this.nums.filter((n) => n.age < 34);
    for (const n of this.texts) n.age++;
    this.texts = this.texts.filter((n) => n.age < 40);
    for (const [id, v] of this.flash) {
      if (v <= 1) this.flash.delete(id);
      else this.flash.set(id, v - 1);
    }
    if (this.shake > 0) this.shake--;
    if (this.screenFlash > 0) this.screenFlash--;
    if (this.chipBanner && ++this.chipBanner.age > 50) this.chipBanner = null;
    this.custom.update();
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx) {
    const b = this.b;
    const sx = this.shake > 0 ? ((this.t * 7) % 3) - 1 : 0;
    const sy = this.shake > 0 ? ((this.t * 5) % 3) - 1 : 0;
    drawBackground(ctx, this.theme, this.t);
    ctx.save();
    ctx.translate(sx, sy);
    this.drawField(ctx);
    this.drawBodiesAndSpells(ctx);
    for (const f of this.fx) {
      if (f.age < 0) continue;
      const p = floorPoint(f.ev.col ?? 2.5, f.ev.row ?? 1);
      drawFxSprite(ctx, f.ev, p.x + (f.ev.ox ?? 0), p.y + (f.ev.oy ?? 0), f.age);
    }
    this.drawNumbers(ctx);
    ctx.restore();
    if (this.screenFlash > 0) {
      ctx.globalAlpha = this.screenFlash / 24;
      rect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#ffffff');
      ctx.globalAlpha = 1;
    }
    if (!this.hud) return;
    this.drawHud(ctx);
    this.drawBanner(ctx);
    if (b.phase === 'custom' || this.custom.visible) drawCustomScreen(ctx, b, this.custom, this.t);
    if (b.paused) this.drawPause(ctx);
  }

  drawField(ctx) {
    const f = this.b.field;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) this.drawPanel(ctx, c, r, f.get(c, r));
    }
    // Front thickness of the whole field.
    for (let c = 0; c < COLS; c++) {
      const p = f.get(c, ROWS - 1);
      const pal = TEAM_PAL[p.owner];
      const x = c * PANEL_W;
      const y = FIELD_Y + ROWS * PANEL_H;
      rect(ctx, x, y, PANEL_W, 4, shade(pal.face, -0.35));
      rect(ctx, x, y + 4, PANEL_W, 1, '#05060c');
    }
  }

  drawPanel(ctx, c, r, p) {
    const t = this.t;
    const x = c * PANEL_W;
    const y = FIELD_Y + r * PANEL_H;
    const pal = TEAM_PAL[p.owner];
    const W = PANEL_W;
    const TOP = 18; // top surface height; the rest is the front face
    // Edge and face (team coloured even for special floors, so ownership stays readable).
    rect(ctx, x, y, W, PANEL_H, pal.edge);
    rect(ctx, x + 1, y + TOP, W - 2, PANEL_H - TOP - 1, pal.face);
    rect(ctx, x + 1, y + TOP, W - 2, 1, shade(pal.face, 0.25));

    if (p.type === PANEL.BROKEN) {
      const blink = p.brokenTimer !== Infinity && p.brokenTimer < 90 && t % 8 < 4;
      rect(ctx, x + 1, y + 1, W - 2, TOP - 1, blink ? shade(pal.top, -0.4) : '#06070d');
      rect(ctx, x + 3, y + 3, W - 6, TOP - 5, blink ? shade(pal.top, -0.3) : '#0c0e18');
      rect(ctx, x + 1, y + TOP, W - 2, PANEL_H - TOP - 1, '#06070d');
      rect(ctx, x + 4, y + TOP - 3, W - 8, 1, '#1a1d2c');
      return;
    }

    const sp = SPECIAL[p.type];
    const top = sp ? sp.top : pal.top;
    const inner = sp ? sp.inner : pal.inner;
    rect(ctx, x + 1, y + 1, W - 2, TOP - 1, top);
    rect(ctx, x + 4, y + 3, W - 8, TOP - 6, inner);
    rect(ctx, x + 4, y + 3, W - 8, 1, shade(inner, 0.35));
    rect(ctx, x + 1, y + 1, W - 2, 1, shade(top, 0.3));
    rect(ctx, x + 1, y + 1, 1, TOP - 1, shade(top, 0.15));

    switch (p.type) {
      case PANEL.CRACKED:
        line(ctx, x + 8, y + 3, x + 15, y + 9, '#1a0a10');
        line(ctx, x + 15, y + 9, x + 12, y + 15, '#1a0a10');
        line(ctx, x + 15, y + 9, x + 27, y + 7, '#1a0a10');
        line(ctx, x + 27, y + 7, x + 32, y + 13, '#1a0a10');
        line(ctx, x + 22, y + 8, x + 24, y + 3, '#1a0a10');
        break;
      case PANEL.GRASS:
        for (let i = 0; i < 9; i++) {
          const gx = x + 4 + ((i * 13) % 31);
          const gy = y + 4 + ((i * 7) % 11);
          px(ctx, gx, gy, sp.dark);
          px(ctx, gx + 1, gy - 1, sp.dark);
          px(ctx, gx + 2, gy, sp.dark);
        }
        break;
      case PANEL.ICE:
        line(ctx, x + 6, y + 13, x + 14, y + 4, '#ffffff');
        line(ctx, x + 11, y + 14, x + 19, y + 5, '#e8fbff');
        line(ctx, x + 26, y + 13, x + 31, y + 7, '#ffffff');
        break;
      case PANEL.LAVA:
        for (let i = 0; i < 4; i++) {
          const phase = (t + i * 23) % 60;
          const bx = x + 6 + ((i * 11) % 28);
          const by = y + 4 + ((i * 5) % 9);
          if (phase < 30) ellipse(ctx, bx, by, 1 + (phase >> 3), 1 + (phase >> 4), '#ffd04a');
        }
        break;
      case PANEL.POISON:
        for (let i = 0; i < 3; i++) {
          const phase = (t + i * 29) % 70;
          const bx = x + 8 + i * 11;
          const by = y + 12 - (phase >> 3);
          if (phase < 50) ring(ctx, bx, by, 1 + (phase >> 4), '#d090ff');
        }
        break;
      case PANEL.HOLY: {
        const glow = (Math.sin(t / 10) + 1) / 2;
        rect(ctx, x + 18, y + 4, 4, 11, glow > 0.5 ? '#ffffff' : '#fff2c0');
        rect(ctx, x + 14, y + 7, 12, 4, glow > 0.5 ? '#ffffff' : '#fff2c0');
        break;
      }
      case PANEL.SAND:
        for (let i = 0; i < 14; i++) px(ctx, x + 3 + ((i * 17) % 34), y + 3 + ((i * 7) % 13), sp.dark);
        break;
      case PANEL.METAL:
        for (const [rx, ry] of [[4, 3], [W - 6, 3], [4, TOP - 4], [W - 6, TOP - 4]]) rect(ctx, x + rx, y + ry, 2, 2, sp.dark);
        line(ctx, x + 10, y + 13, x + 18, y + 5, '#d8e0ee');
        break;
      default:
        break;
    }
    if (p.flash > 0) {
      ctx.globalAlpha = p.flash / 16;
      rect(ctx, x + 1, y + 1, W - 2, TOP - 1, '#ffffff');
      ctx.globalAlpha = 1;
    }
  }

  bodyPos(e) {
    const p = floorPoint(e.col + (e.offsetX ?? 0), e.row + (e.offsetY ?? 0));
    return { x: p.x, y: p.y, floor: p.y };
  }

  drawBodiesAndSpells(ctx) {
    const b = this.b;
    const t = this.t;
    if (b.player) b.player.data.charge = b.controller.chargeState;
    const bodies = b.entities.filter((e) => !e.removed);
    const spells = b.spells.filter((s) => s.alive);
    for (let r = 0; r < ROWS; r++) {
      // Ground spells under bodies.
      for (const s of spells) {
        if (Math.round(s.y) !== r || s.z > 0) continue;
        const p = floorPoint(s.x, s.y);
        drawSpellSprite(ctx, s, p.x, p.y, t);
      }
      const row = bodies.filter((e) => e.row === r).sort((a, z) => a.col + (a.offsetX ?? 0) - (z.col + (z.offsetX ?? 0)));
      for (const e of row) this.drawBody(ctx, e);
    }
    // Airborne spells on top.
    for (const s of spells) {
      if (s.z <= 0) continue;
      const p = floorPoint(s.x, s.y);
      drawSpellSprite(ctx, s, p.x, p.y, t);
    }
  }

  drawBody(ctx, e) {
    const t = this.t;
    const { x, floor } = this.bodyPos(e);
    const y = floor - (e.z ?? 0);
    // Summon: the player's slot shows the called navi.
    if (e === this.b.player && e.data.summon) {
      const fake = { ...e, type: e.data.summon, anim: 'summon', animT: e.animT, facing: 1, level: 1, data: {}, hidden: false };
      ellipse(ctx, x, floor, 10, 3, 'rgba(0,0,0,0.35)');
      if (ENTITY_SPRITES[e.data.summon]) drawEntitySprite(ctx, fake, x, y, t);
      else drawEntitySprite(ctx, fake, x, y, t);
      return;
    }
    if (e.hidden) return;
    if (!e.alive) {
      // Deleting: blink out over the first frames, the explosions do the rest.
      const elapsed = TIMING.DELETE - e.deleteTimer;
      if (elapsed > 16 || elapsed % 4 >= 2) return;
    }
    if (e.iframes > 0 && e.alive && t % 4 < 2) return;
    if (!e.flying) ellipse(ctx, x, floor, 10, 3, 'rgba(0,0,0,0.35)');
    else ellipse(ctx, x, floor, 7, 2, 'rgba(0,0,0,0.25)');
    const flash = this.flash.get(e.id);
    const invis = e.invisTimer > 0;
    if (invis) ctx.globalAlpha = 0.35;
    if (flash) tinted(ctx, '#ffffff', 0.85, (g) => drawEntitySprite(g, e, x, y, t));
    else drawEntitySprite(ctx, e, x, y, t);
    ctx.globalAlpha = 1;

    // Status overlays.
    if (e.stunTimer > 0 && e.alive) {
      for (let i = 0; i < 3; i++) {
        const a = t / 6 + (i * Math.PI * 2) / 3;
        const sxp = x + Math.round(Math.cos(a) * 9);
        const syp = y - 34 + Math.round(Math.sin(a) * 3);
        rect(ctx, sxp, syp, 2, 2, i % 2 ? '#ffe85a' : '#ffffff');
      }
    }
    if (e.barrierHp > 0) {
      const pulse = 15 + ((t >> 3) % 2);
      ring(ctx, x, y - 14, pulse, t % 6 < 3 ? '#9ae8ff' : '#5ab8ff');
      ring(ctx, x, y - 14, pulse - 1, 'rgba(154,232,255,0.35)');
    }
    if (e.auraPower > 0) {
      for (let i = 0; i < 8; i++) {
        const a = t / 8 + (i * Math.PI) / 4;
        rect(ctx, x + Math.round(Math.cos(a) * 15), y - 16 + Math.round(Math.sin(a) * 18), 2, 2, i % 2 ? '#ff7ae0' : '#ffd0f8');
      }
    }
    if (e.guardTimer > 0 && e.kind !== 'player' && !ENTITY_SPRITES[e.type]) {
      rect(ctx, x + e.facing * 12 - 2, y - 26, 4, 22, '#c8d8ff');
    }

    // Enemy HP under the feet.
    if (e.team === TEAM.BLUE && e.kind !== 'object' && e.alive) {
      drawText(ctx, String(e.hp), x, floor + 2, '#ffffff', { align: 'center', outline: '#0a0c18', mini: false });
    } else if (e.kind === 'object' && e.alive && e.hp > 1 && e.hp < 999) {
      drawText(ctx, String(e.hp), x, floor + 2, '#e0e0e0', { align: 'center', outline: '#0a0c18', mini: true });
    }
  }

  drawNumbers(ctx) {
    for (const n of this.nums) {
      const p = floorPoint(n.col, n.row);
      const rise = Math.min(14, n.age * 0.8);
      if (n.age > 26 && n.age % 4 < 2) continue;
      drawText(ctx, n.text, p.x + 10, p.y - 40 - rise, n.color, { outline: '#0a0c18', align: 'center', mini: true });
    }
    for (const n of this.texts) {
      const p = floorPoint(n.col, n.row);
      if (n.age % 6 < 3 || n.age < 20) drawText(ctx, n.text, p.x, p.y - 50 - Math.min(8, n.age / 2), n.color, { outline: '#3a1a00', align: 'center' });
    }
  }

  drawHud(ctx) {
    const b = this.b;
    const t = this.t;
    const p = b.player;
    // Player HP box.
    const hpColor = p.hp <= p.maxHp * 0.2 ? (t % 16 < 8 ? '#ff5a5a' : '#ffd0d0') : p.hp <= p.maxHp * 0.4 ? '#ffb04a' : '#ffffff';
    rect(ctx, 2, 2, 42, 15, '#0a1430');
    frame(ctx, 2, 2, 42, 15, '#8ab0ff');
    rect(ctx, 3, 3, 40, 1, '#2a4a9a');
    drawText(ctx, String(p.hp), 41, 6, hpColor, { align: 'right', shadow: '#000000' });

    // Custom gauge.
    const gx = 72;
    const gy = 3;
    const gw = 96;
    const full = b.gaugeFull;
    rect(ctx, gx - 1, gy - 1, gw + 2, 11, '#0a0c18');
    frame(ctx, gx - 1, gy - 1, gw + 2, 11, full && t % 20 < 10 ? '#ffe04a' : '#8ab0ff');
    rect(ctx, gx, gy, gw, 9, '#1a2448');
    const fill = Math.round((gw * b.gauge) / TIMING.GAUGE_FULL);
    rect(ctx, gx, gy, fill, 9, full ? (t % 12 < 6 ? '#ffd23a' : '#fff07a') : '#3ad0ff');
    rect(ctx, gx, gy, fill, 2, full ? '#fff8c8' : '#a8f0ff');
    drawText(ctx, 'CUSTOM', gx + gw / 2, gy + 1, full ? '#5a3a00' : '#0a1a3a', { align: 'center' });
    if (full && b.phase === 'fight' && t % 30 < 20) drawText(ctx, 'PRESS L / R', gx + gw / 2, gy + 12, '#ffe04a', { align: 'center', outline: '#2a1a00' });

    // Queued chips: icons stacked above the player, the next chip's name at the bottom left.
    const chips = b.controller.chips;
    if (b.phase === 'fight' || b.phase === 'banner') {
      const pp = this.bodyPos(p);
      const n = Math.min(5, chips.length);
      for (let i = n - 1; i >= 0; i--) {
        const ix = pp.x - 7 + i * 2;
        const iy = pp.floor - 56 - i * 2;
        frame(ctx, ix - 1, iy - 1, 16, 16, '#0c0f1c');
        drawChipIcon(ctx, chips[i].def, ix, iy);
      }
      if (chips.length > 0) {
        const c = chips[0];
        const label = c.damage > 0 && c.kind !== 'support' ? `${c.name} ${c.damage}` : c.name;
        const w = measureText(label);
        rect(ctx, 1, 148, w + 6, 11, '#0a0c18');
        frame(ctx, 1, 148, w + 6, 11, '#8ab0ff');
        drawText(ctx, label, 4, 150, c.boost ? '#ffe04a' : '#ffffff');
      }
    }
    if (this.chipBanner && this.chipBanner.age < 40) {
      const a = this.chipBanner.age;
      if (a > 30 && a % 4 < 2) return;
      const w = measureText(this.chipBanner.name) + 10;
      const x = SCREEN_W - w - 2;
      rect(ctx, x, 20, w, 11, '#0a0c18');
      frame(ctx, x, 20, w, 11, '#ffe04a');
      drawText(ctx, this.chipBanner.name, x + 5, 22, '#ffe04a');
    }
  }

  drawBanner(ctx) {
    const bn = this.b.banner;
    if (!bn) return;
    const k = Math.min(1, bn.t / 8);
    const out = bn.timer - bn.t < 8 ? (bn.timer - bn.t) / 8 : 1;
    const h = Math.round(28 * Math.min(k, out));
    const cy = 52;
    if (h <= 0) return;
    const color = bn.kind === 'win' ? '#ffe04a' : bn.kind === 'pa' ? '#7affe0' : '#ffffff';
    rect(ctx, 0, cy - h / 2, SCREEN_W, h, 'rgba(6,8,20,0.82)');
    rect(ctx, 0, cy - h / 2, SCREEN_W, 1, color);
    rect(ctx, 0, cy + h / 2 - 1, SCREEN_W, 1, color);
    if (h >= 24) {
      if (bn.kind === 'pa') {
        drawText(ctx, 'FUSION', SCREEN_W / 2, cy - 12, '#7affe0', { align: 'center' });
        drawText(ctx, bn.text.toUpperCase(), SCREEN_W / 2, cy - 2, '#ffffff', { align: 'center', scale: 1, outline: '#0a3a40' });
      } else {
        drawText(ctx, bn.text, SCREEN_W / 2, cy - 7, color, { align: 'center', scale: 2, outline: '#0a0c18' });
      }
    }
  }

  drawPause(ctx) {
    ctx.globalAlpha = 0.6;
    rect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#05060c');
    ctx.globalAlpha = 1;
    drawText(ctx, 'PAUSE', SCREEN_W / 2, 60, '#ffffff', { align: 'center', scale: 2, outline: '#1a2a6a' });
    drawText(ctx, 'START to resume', SCREEN_W / 2, 84, '#a8b8ff', { align: 'center' });
    drawText(ctx, 'SELECT to retreat', SCREEN_W / 2, 96, '#a8b8ff', { align: 'center' });
  }
}

export { ELEMENT_COLORS };
