// Boss pack A: four navis, each mirroring a BN3 boss's behaviour pattern and stat-table HP/element under
// this game's own name and design. See docs/CONTRACT.md "Enemies" and each family file.
//
//   voltframe  (FlashMan)  neon spotlight android: blinks around, Arc Bolts, paralyzing Flash, Neon Lamps
//   feralis    (BeastMan)  claw-gauntleted cyber-beast: erratic leaps, column Rakes, Pounce Dash, Howl
//   tidecaller (BubbleMan) diver-suited water mage: hides behind coral, bubbles, torpedo fish, Tide Rise
//   pyreclaw   (FlameMan)  furnace-chested brawler: marching Fire Towers, Flamethrower, healing braziers

import { VOLTFRAME } from './a_voltframe.js';
import { FERALIS } from './a_feralis.js';
import { TIDECALLER } from './a_tidecaller.js';
import { PYRECLAW } from './a_pyreclaw.js';

export const FAMILIES = [VOLTFRAME, FERALIS, TIDECALLER, PYRECLAW];
