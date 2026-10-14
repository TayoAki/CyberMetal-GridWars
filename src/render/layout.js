// Screen geometry. The game renders to a 240x160 buffer (the GBA's resolution) that is scaled up
// nearest-neighbour. Panels are 40x24 with a 5px front face, three rows starting at y = 72.

export const SCREEN_W = 240;
export const SCREEN_H = 160;
export const PANEL_W = 40;
export const PANEL_H = 24;
export const PANEL_FACE = 5;
export const FIELD_X = 0;
export const FIELD_Y = 74;

export function panelOrigin(col, row) {
  return { x: FIELD_X + col * PANEL_W, y: FIELD_Y + row * PANEL_H };
}

// Where a body's feet touch the floor of panel (col, row). Accepts fractional col/row for movers.
export function floorPoint(col, row) {
  return { x: Math.round(FIELD_X + col * PANEL_W + PANEL_W / 2), y: Math.round(FIELD_Y + row * PANEL_H + PANEL_H - 6) };
}
