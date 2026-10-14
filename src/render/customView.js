import { rect, frame, shade } from './pixel.js';
import { drawText, wrapText } from './font.js';
import { SCREEN_W, SCREEN_H } from './layout.js';
import { drawChipIcon, drawChipArt, drawElementIcon } from './chipart.js';
import { chipDef } from '../engine/chips/library.js';
import { compatible, resolveQueue, SLOTS_PER_ROW } from '../engine/custom.js';
import { LIMITS } from '../engine/constants.js';

// The Custom Screen panel: slides in from the left over the dimmed field. Reads the engine's CustomScreen
// model (hand, selection, cursor) and never changes it — input goes through the engine.

const PANEL_W = 152;

export class CustomAnim {
  constructor() {
    this.k = 0;
    this.target = 0;
  }

  open() {
    this.target = 1;
  }

  close() {
    this.target = 0;
  }

  update() {
    this.k += (this.target - this.k) * 0.38;
    if (Math.abs(this.target - this.k) < 0.02) this.k = this.target;
  }

  get visible() {
    return this.k > 0.01;
  }
}

function slotXY(i) {
  const col = i % SLOTS_PER_ROW;
  const row = Math.floor(i / SLOTS_PER_ROW);
  return { x: 5 + col * 20, y: 68 + row * 26 };
}

export function drawCustomScreen(ctx, b, anim, t) {
  const cs = b.custom;
  const k = b.phase === 'custom' ? Math.max(anim.k, 0.02) : anim.k;
  const ox = Math.round(-(1 - k) * (PANEL_W + 4));
  // Dim the field.
  ctx.globalAlpha = 0.45 * k;
  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#04050c');
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(ox, 0);
  // Panel body.
  rect(ctx, 0, 0, PANEL_W, SCREEN_H, '#0c1638');
  for (let y = 0; y < SCREEN_H; y += 4) rect(ctx, 0, y, PANEL_W, 1, '#0f1a42');
  rect(ctx, PANEL_W, 0, 2, SCREEN_H, '#8ab0ff');
  rect(ctx, PANEL_W + 2, 0, 1, SCREEN_H, '#24346a');
  drawText(ctx, 'CUSTOM', 4, 3, '#8ab0ff');
  drawText(ctx, `FOLDER ${cs.deck.length}`, PANEL_W - 4, 3, '#5a70b0', { align: 'right' });

  const target = cs.cursorTarget;
  const selected = cs.selectedChips();

  // Info window: the chip under the cursor, or what OK / ADD will do.
  rect(ctx, 4, 13, 58, 50, '#05081a');
  frame(ctx, 4, 13, 58, 50, '#6a88d8');
  let infoDef = null;
  let infoCode = null;
  if (typeof target === 'number' && cs.hand[target]) {
    infoDef = chipDef(cs.hand[target].key);
    infoCode = cs.hand[target].code;
  }
  if (infoDef) {
    drawChipArt(ctx, infoDef, 5, 14, t);
    drawText(ctx, infoDef.name, 66, 15, '#ffffff');
    drawText(ctx, infoCode, 66, 27, infoCode === '*' ? '#ffe04a' : '#9ae8ff', { scale: 2 });
    drawElementIcon(ctx, infoDef.element, 80, 29);
    if (infoDef.damage > 0 && infoDef.kind !== 'support' && infoDef.kind !== 'boost') drawText(ctx, String(infoDef.damage), PANEL_W - 5, 29, '#ffffff', { align: 'right' });
    else if (infoDef.kind === 'boost') drawText(ctx, `+${infoDef.damage}`, PANEL_W - 5, 29, '#ffe04a', { align: 'right' });
    const lines = wrapText(infoDef.desc, PANEL_W - 70);
    lines.slice(0, 3).forEach((l, i) => drawText(ctx, l, 66, 42 + i * 8, '#a8b8e8'));
  } else if (target === 'ok') {
    const { queue, pa } = resolveQueue(selected);
    if (pa) {
      drawChipArt(ctx, pa, 5, 14, t);
      drawText(ctx, 'FUSION!', 66, 15, '#7affe0');
      drawText(ctx, pa.name, 66, 25, '#ffffff');
      if (pa.damage > 0) drawText(ctx, String(pa.damage), PANEL_W - 5, 25, '#ffffff', { align: 'right' });
      wrapText(pa.desc, PANEL_W - 70).slice(0, 3).forEach((l, i) => drawText(ctx, l, 66, 37 + i * 8, '#a8f0e0'));
    } else {
      drawText(ctx, 'OK', 33, 30, '#ffffff', { align: 'center', scale: 2 });
      drawText(ctx, queue.length ? `Send ${queue.length} chip${queue.length > 1 ? 's' : ''}` : 'No chips', 66, 18, '#ffffff');
      drawText(ctx, 'to battle.', 66, 27, '#a8b8e8');
    }
  } else if (target === 'add') {
    drawText(ctx, 'ADD', 33, 30, '#ffe04a', { align: 'center', scale: 2 });
    drawText(ctx, 'Skip this turn,', 66, 18, '#ffffff');
    drawText(ctx, `+${LIMITS.ADD_BONUS} chips next`, 66, 27, '#ffffff');
    drawText(ctx, 'turn (max 10).', 66, 36, '#a8b8e8');
  }

  // Hand slots.
  for (let i = 0; i < LIMITS.HAND_MAX; i++) {
    const { x, y } = slotXY(i);
    const chip = cs.hand[i];
    rect(ctx, x, y, 18, 24, '#05081a');
    frame(ctx, x, y, 18, 24, '#2a3c7a');
    if (!chip) continue;
    const isSel = cs.selected.includes(i);
    const def = chipDef(chip.key);
    if (isSel) {
      frame(ctx, x + 2, y + 2, 14, 14, '#2a3c7a');
      drawText(ctx, String(cs.selected.indexOf(i) + 1), x + 9, y + 6, '#5a70b0', { align: 'center' });
      continue;
    }
    drawChipIcon(ctx, def, x + 2, y + 2);
    const ok = cs.selected.length < LIMITS.SELECT_MAX && compatible([...selected, chip]);
    drawText(ctx, chip.code, x + 9, y + 16, chip.code === '*' ? '#ffe04a' : '#ffffff', { align: 'center' });
    if (!ok) {
      ctx.globalAlpha = 0.62;
      rect(ctx, x + 1, y + 1, 16, 22, '#04050c');
      ctx.globalAlpha = 1;
    }
  }

  // OK / ADD buttons.
  const btn = (label, y, active, color) => {
    rect(ctx, 106, y, 20, 24, active ? shade(color, -0.55) : '#05081a');
    frame(ctx, 106, y, 20, 24, color);
    drawText(ctx, label, 116, y + 8, color, { align: 'center' });
  };
  btn('OK', 68, selected.length > 0, '#7affb0');
  btn('ADD', 94, cs.canAdd(), '#ffe04a');

  // Selected column.
  for (let i = 0; i < LIMITS.SELECT_MAX; i++) {
    const y = 68 + i * 17;
    rect(ctx, 131, y, 16, 16, '#05081a');
    frame(ctx, 131, y, 16, 16, '#2a3c7a');
    const c = selected[i];
    if (c) drawChipIcon(ctx, chipDef(c.key), 132, y + 1);
  }

  // Cursor.
  const blink = t % 24 < 16;
  let cx;
  let cy;
  let cw;
  let ch;
  if (typeof target === 'number') {
    const p = slotXY(target);
    cx = p.x - 1;
    cy = p.y - 1;
    cw = 20;
    ch = 26;
  } else {
    cx = 105;
    cy = target === 'ok' ? 67 : 93;
    cw = 22;
    ch = 26;
  }
  frame(ctx, cx, cy, cw, ch, blink ? '#ffffff' : '#ffe04a');
  frame(ctx, cx - 1, cy - 1, cw + 2, ch + 2, blink ? '#ffe04a' : '#7a5a00');

  // Hints.
  drawText(ctx, 'A:pick  B:undo', 4, 122, '#6a80c0');
  drawText(ctx, 'START:to OK', 4, 131, '#6a80c0');
  drawText(ctx, 'Same chip, or same code', 4, 146, '#4a5a90');
  ctx.restore();
}
