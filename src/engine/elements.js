import { ELEMENT } from './constants.js';

// BN's element wheel: Fire beats Wood, Wood beats Elec, Elec beats Aqua, Aqua beats Fire.
const BEATS = Object.freeze({
  [ELEMENT.FIRE]: ELEMENT.WOOD,
  [ELEMENT.WOOD]: ELEMENT.ELEC,
  [ELEMENT.ELEC]: ELEMENT.AQUA,
  [ELEMENT.AQUA]: ELEMENT.FIRE,
});

export function beats(attackElement, defendElement) {
  return BEATS[attackElement] === defendElement;
}

// The element an attack should be to deal double damage to `element`.
export function weaknessOf(element) {
  for (const [atk, def] of Object.entries(BEATS)) if (def === element) return atk;
  return null;
}

// ROM element numbering (chip table byte 0x06, enemy table high nibble).
export const ROM_ELEMENT_ORDER = [ELEMENT.NULL, ELEMENT.ELEC, ELEMENT.FIRE, ELEMENT.AQUA, ELEMENT.WOOD];
