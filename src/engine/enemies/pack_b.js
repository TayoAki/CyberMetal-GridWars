// Virus pack (pack_b). Export the family definitions this pack adds; see docs/CONTRACT.md "Enemies".
//   watcher    — mirrors KillerEye: stationary eye, charges and fires an elec beam down its row
//   cinderkite — mirrors Metrid: floating ember kite, calls telegraphed meteors on the player's area
//   frostbit   — mirrors Pengi: slides between rows, breathes a freezing gust that ices the row
//   sporeling  — mirrors Mushy: burrows, pops up at the front and puffs a spore cloud
//   scurrier   — mirrors Ratty: zig-zags, releases a crawling bomb that turns toward the player
import { WATCHER } from './b_watcher.js';
import { CINDERKITE } from './b_cinderkite.js';
import { FROSTBIT } from './b_frostbit.js';
import { SPORELING } from './b_sporeling.js';
import { SCURRIER } from './b_scurrier.js';

export const FAMILIES = [WATCHER, CINDERKITE, FROSTBIT, SPORELING, SCURRIER];
