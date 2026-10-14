// Virus pack A: five families, each mirroring a BN3 virus's behaviour pattern and stat-table HP under this
// game's own name and design. See docs/CONTRACT.md "Enemies" and each family file.
//
//   emberhound  (Spikey)    fire hound: prowls, rears back, spits fireballs down its row
//   volthare    (Bunny)     electric hare: bursts of hops, then a slow paralyzing ring
//   mortarshell (HardHead)  armoured mortar turtle: invulnerable shut, opens to lob panel-wrecking mortars
//   gloop       (Jelly)     jelly blob: sinks, resurfaces in front of the player, rolls a wave down the row
//   bombeetle   (Beetle)    bomb beetle: lobs bombs at the player's panel (plus blasts, then 2 and 3 bombs)

import { EMBERHOUND } from './a_emberhound.js';
import { VOLTHARE } from './a_volthare.js';
import { MORTARSHELL } from './a_mortarshell.js';
import { GLOOP } from './a_gloop.js';
import { BOMBEETLE } from './a_bombeetle.js';

export const FAMILIES = [EMBERHOUND, VOLTHARE, MORTARSHELL, GLOOP, BOMBEETLE];
