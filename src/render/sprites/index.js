import * as core from './core.js';
import * as virusesA from './viruses_a.js';
import * as virusesB from './viruses_b.js';
import * as bossesA from './bosses_a.js';
import * as bossesB from './bosses_b.js';
import { rect, frame } from '../pixel.js';
import { drawText } from '../font.js';

// Merges the sprite packs. Each pack owns its own keys (see docs/CONTRACT.md); anything missing falls
// back to a labelled placeholder so the game always runs.

const PACKS = [core, virusesA, virusesB, bossesA, bossesB];
export const ENTITY_SPRITES = Object.assign({}, ...PACKS.map((p) => p.ENTITY_SPRITES));
export const SPELL_SPRITES = Object.assign({}, ...PACKS.map((p) => p.SPELL_SPRITES));
export const FX_SPRITES = Object.assign({}, ...PACKS.map((p) => p.FX_SPRITES));

const TEAM_COLORS = { red: '#e04848', blue: '#4878e0', none: '#a0a0a0' };

export function drawEntitySprite(ctx, e, x, y, t) {
  const s = ENTITY_SPRITES[e.type];
  if (s) return s.draw(ctx, e, x, y, t);
  const c = TEAM_COLORS[e.team] ?? '#a0a0a0';
  rect(ctx, x - 10, y - 26, 20, 26, c);
  frame(ctx, x - 10, y - 26, 20, 26, '#101018');
  drawText(ctx, (e.type ?? '?').slice(0, 3).toUpperCase(), x - 8, y - 18, '#ffffff');
}

export function drawSpellSprite(ctx, s, x, y, t) {
  const d = SPELL_SPRITES[s.type];
  if (d) return d.draw(ctx, s, x, y, t);
  if (s.data?.hidden) return;
  rect(ctx, x - 4, y - 8 - s.z, 8, 8, s.team === 'red' ? '#ffe060' : '#ff6060');
}

export function fxDuration(name) {
  return FX_SPRITES[name]?.duration ?? 16;
}

export function drawFxSprite(ctx, fx, x, y, age) {
  const d = FX_SPRITES[fx.fx];
  if (d) return d.draw(ctx, fx, x, y, age);
  const r = Math.max(0, 8 - age / 2);
  rect(ctx, x - r, y - 10 - r, r * 2, r * 2, age % 4 < 2 ? '#ffffff' : '#ffd040');
}
