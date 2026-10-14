// Sprite pack: core. See docs/CONTRACT.md "Sprites". Each registry maps a key to { draw(ctx, obj, x, y, t) }.
// The player (AXIOM), placed objects, summon-only helper navis, every chip spell and the shared effects.
// The art lives in core_player.js, core_objects.js, core_spells.js and core_fx.js (helpers: core_util.js).
import { PLAYER_SPRITE } from './core_player.js';
import { ROCKCUBE_SPRITE, BLACKBOMB_SPRITE, TIMEBOMB_SPRITE, DOOMBOMB_SPRITE, MENDER_SPRITE, CRUSHER_SPRITE } from './core_objects.js';
import { SPELL_SPRITES as SPELLS } from './core_spells.js';
import { FX_SPRITES as FX } from './core_fx.js';

export const ENTITY_SPRITES = {
  player: PLAYER_SPRITE,
  rockcube: ROCKCUBE_SPRITE,
  blackbomb: BLACKBOMB_SPRITE,
  timebomb: TIMEBOMB_SPRITE,
  doombomb: DOOMBOMB_SPRITE,
  mender: MENDER_SPRITE,
  crusher: CRUSHER_SPRITE,
};
export const SPELL_SPRITES = { ...SPELLS };
export const FX_SPRITES = { ...FX };
