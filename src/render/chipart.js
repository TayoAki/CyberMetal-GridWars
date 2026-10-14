// PLACEHOLDER chip art (to be replaced wholesale by the core art pack). API per docs/CONTRACT.md:
// drawChipIcon(ctx, def, x, y) 14x14, drawChipArt(ctx, def, x, y, t) 56x48, drawElementIcon(ctx, el, x, y) 9x9.
import { rect, frame } from './pixel.js';

const EL = { null: '#c8c8d8', fire: '#ff6a3a', aqua: '#4ab4ff', elec: '#ffe04a', wood: '#5ad86a' };

export function drawChipIcon(ctx, def, x, y) {
  rect(ctx, x, y, 14, 14, '#1a2040');
  rect(ctx, x + 2, y + 2, 10, 10, EL[def?.element] ?? EL.null);
  frame(ctx, x, y, 14, 14, '#0c0f1c');
}

export function drawChipArt(ctx, def, x, y) {
  rect(ctx, x, y, 56, 48, '#10183a');
  rect(ctx, x + 14, y + 10, 28, 28, EL[def?.element] ?? EL.null);
  frame(ctx, x, y, 56, 48, '#0c0f1c');
}

export function drawElementIcon(ctx, element, x, y) {
  rect(ctx, x, y, 9, 9, EL[element] ?? EL.null);
  frame(ctx, x, y, 9, 9, '#0c0f1c');
}
