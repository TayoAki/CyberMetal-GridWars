import { chipDef } from '../engine/chips/library.js';
import { drawChipArt, drawChipIcon } from '../render/chipart.js';

// Chip pictures for the Daily's HTML screens: the grid game's own pixel art (the 56x48 Custom Screen
// picture and the 14x14 icon), drawn once per chip and copied into canvases scaled up crisply.

const arts = new Map();
const icons = new Map();

function sheet(map, key, w, h, draw) {
  let c = map.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    try {
      draw(g, chipDef(key));
    } catch {
      g.fillStyle = '#24305a';
      g.fillRect(0, 0, w, h);
    }
    map.set(key, c);
  }
  return c;
}

// A canvas showing chip `key`'s picture (art: the big one; else the icon).
export function chipCanvas(key, art = true) {
  const src = art ? sheet(arts, key, 56, 48, (g, def) => drawChipArt(g, def, 0, 0, 0)) : sheet(icons, key, 14, 14, (g, def) => drawChipIcon(g, def, 0, 0));
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0);
  return c;
}

export function chipInfo(key) {
  try {
    return chipDef(key);
  } catch {
    return { key, name: key, damage: 0, element: 'null', desc: '' };
  }
}
