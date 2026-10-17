import { FIELD_Y, PANEL_W, PANEL_H } from '../render/layout.js';

// The 3D battle space, laid out so an orthographic camera reproduces the 2D screen exactly.
//
// World x is screen x. The floor is y = 0 with y up, and rows run toward the camera along +z. A camera tilted
// TILT below the horizon projects (x, y, z) to the screen point (x, CENTER_Y - y cos + z sin). Panels and feet
// therefore land on the very pixels the 2D view uses, so everything it still draws on top (effects, damage
// numbers, the HUD, the Custom Screen) lines up with the 3D scene.

export const TILT = Math.PI / 6;
export const SIN = Math.sin(TILT);
export const COS = Math.cos(TILT);
export const CENTER_Y = 80;

// Floor depth under a screen y, and the world height of a screen-pixel rise.
export const screenToZ = (sy) => (sy - CENTER_Y) / SIN;
export const heightOf = (px) => px / COS;

// Screen point of a world point.
export function project(x, y, z) {
  return { x, y: CENTER_Y - y * COS + z * SIN };
}

// A panel's block: its top surface covers the 18 px top of the 2D panel art, its front face the 5 px below.
export const PANEL_TOP_PX = 18;
export const PANEL_FACE_PX = 5;
export const PANEL_THICK = heightOf(PANEL_FACE_PX);
export function panelBox(col, row) {
  const y = FIELD_Y + row * PANEL_H;
  return { x0: col * PANEL_W, x1: (col + 1) * PANEL_W, zBack: screenToZ(y), zFront: screenToZ(y + PANEL_TOP_PX) };
}

// The orthographic camera that frames the 240x160 screen; `shake` shifts it by screen pixels.
export function makeCamera(THREE) {
  const cam = new THREE.OrthographicCamera(-120, 120, 80, -80, 1, 3000);
  aimCamera(cam, 0, 0);
  return cam;
}

export function aimCamera(cam, shakeX, shakeY) {
  const lookX = 120 - shakeX;
  // Moving the camera along its up axis by s moves the picture down by s screen pixels.
  const upY = COS * shakeY;
  const upZ = -SIN * shakeY;
  cam.up.set(0, COS, -SIN);
  cam.position.set(lookX, 900 * SIN + upY, 900 * COS + upZ);
  cam.lookAt(lookX, upY, upZ);
  cam.updateMatrixWorld();
}
