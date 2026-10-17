import { Rng } from '../engine/rng.js';
import { KITS, kitMove, moveAtTier } from '../engine/enemies/bosses/composite.js';
import { weaknessOf } from '../engine/elements.js';

// GridWars Daily: one new boss a day, the same for everyone. A day's number picks everything, so any copy
// of the game draws the same boss: its theme (element, arena and colours), name, tier, HP, the family it
// moves like, the moves it fights with (src/engine/enemies/bosses/composite.js plays them) and the body
// the view builds for it (src/daily/body.js).
//
// The week builds up: V1 on Monday and Tuesday, V2 midweek, V3 on Friday and Saturday, Ω on Sunday.

export const LAUNCH = Date.UTC(2026, 9, 17); // Daily #1
const DAY = 86400000;

// The day number for a date, by the player's own calendar: each date has one boss wherever you are.
export function dayNumber(date = new Date()) {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - LAUNCH) / DAY) + 1;
}

// The calendar date of a day number, as YYYY-MM-DD.
export function dayDate(day) {
  return new Date(LAUNCH + (day - 1) * DAY).toISOString().slice(0, 10);
}

const TIER_BY_WEEKDAY = [4, 1, 1, 2, 2, 3, 3]; // Sunday first, as Date.getUTCDay counts
export const TIER_NAMES = ['V1', 'V2', 'V3', 'Ω'];

// ---------------------------------------------------------------- themes

const ELEMENTS = ['elec', 'fire', 'aqua', 'wood', 'null'];
const PRIMARY = { elec: ['voltframe'], fire: ['pyreclaw'], aqua: ['tidecaller'], wood: ['briarix'], null: ['feralis', 'ironclad', 'sabre', 'zeroday'] };

// Arenas: the view's colours and props, and the floor the fight starts on. `field(rng)` returns the
// encounter layout (Field codes: '.' normal, 'c' cracked, 'g' grass, 'i' ice, 'l' lava, 'h' holy, 'm' metal).
export const ARENAS = {
  elec: [
    { key: 'arcade', name: 'Neon Arcade', sky: ['#120a2e', '#3a0f5c'], glow: '#ffe14a', accent: '#5af0ff', props: 'pylons', field: () => ['......', '......', '......'] },
    { key: 'spire', name: 'Storm Spire', sky: ['#060d24', '#1c2f66'], glow: '#bfe8ff', accent: '#ffe95a', props: 'spires', field: (r) => (r.chance(0.5) ? ['....m.', '......', '....m.'] : ['......', '...m..', '......']) },
  ],
  fire: [
    { key: 'forge', name: 'Ember Forge', sky: ['#1a0604', '#5c1a08'], glow: '#ff8a2a', accent: '#ffd25a', props: 'anvils', field: (r) => (r.chance(0.5) ? ['l.....', '......', '......'] : ['......', '......', 'l.....']) },
    { key: 'caldera', name: 'Caldera Core', sky: ['#200404', '#6a1406'], glow: '#ff5a2a', accent: '#ffb03a', props: 'rocks', field: () => ['......', '.c....', '......'] },
  ],
  aqua: [
    { key: 'reef', name: 'Coral Reef', sky: ['#021a2e', '#0a5a7a'], glow: '#5ae8ff', accent: '#ff8ab4', props: 'coral', field: () => ['......', '......', '......'] },
    { key: 'glacier', name: 'Glacier Vault', sky: ['#081a30', '#3a7aa8'], glow: '#c8f4ff', accent: '#7ad8ff', props: 'ice', field: (r) => (r.chance(0.5) ? ['i.....', '......', '.....i'] : ['......', 'i....i', '......']) },
  ],
  wood: [
    { key: 'garden', name: 'Overgrown Garden', sky: ['#04140a', '#1a4a24'], glow: '#9aff6a', accent: '#ff7ab8', props: 'trees', field: () => ['...ggg', '...ggg', '...ggg'] },
    { key: 'grove', name: 'Bamboo Grove', sky: ['#0a1608', '#3a5a1a'], glow: '#d8ff7a', accent: '#ffd25a', props: 'bamboo', field: () => ['....gg', '....gg', '....gg'] },
  ],
  null: [
    { key: 'foundry', name: 'Chrome Foundry', sky: ['#0a0c14', '#2a3040'], glow: '#ff6a3a', accent: '#c8d4ff', props: 'gears', field: (r) => (r.chance(0.5) ? ['......', '...m..', '......'] : ['......', '......', '......']) },
    { key: 'rift', name: 'Void Rift', sky: ['#05020e', '#2a0a3e'], glow: '#c86aff', accent: '#5af0ff', props: 'shards', field: () => ['......', '......', '......'] },
    { key: 'dojo', name: 'Midnight Dojo', sky: ['#0c0610', '#3a1a2a'], glow: '#ff4a6a', accent: '#ffe0a8', props: 'lanterns', field: (r) => (r.chance(0.4) ? ['......', '..h...', '......'] : ['......', '......', '......']) },
  ],
};

// Body colours by element: main, trim, glow; jittered a little per boss.
const PALETTES = {
  elec: [['#2a2f6a', '#ffd84a', '#7af4ff'], ['#1a1a2a', '#5af0ff', '#ffe95a'], ['#3a1a5c', '#ff5ae0', '#ffe14a']],
  fire: [['#5a1a10', '#ffb03a', '#ff6a2a'], ['#2a1414', '#ff5a3a', '#ffd25a'], ['#6a2a0a', '#ffd84a', '#ff3a1a']],
  aqua: [['#0a3a5a', '#ffd25a', '#5ae8ff'], ['#1a2a5a', '#7af4ff', '#c8f4ff'], ['#0a4a4a', '#ff8ab4', '#5affd8']],
  wood: [['#1a3a14', '#ff7ab8', '#9aff6a'], ['#3a2a10', '#9aff6a', '#ffe14a'], ['#14301e', '#ffd25a', '#c8ff6a']],
  null: [['#22283a', '#ff4a6a', '#ff8a5a'], ['#14141c', '#c86aff', '#5af0ff'], ['#3a3a44', '#ffd84a', '#ff5a3a'], ['#1a1020', '#ff4a6a', '#ffffff']],
};

// The way a family moves gives the body its build.
export const BUILDS = {
  voltframe: { build: 'slender', role: 'Trickster', ends: ['frame', 'glint', 'wisp', 'flare', 'beam', 'flick'] },
  feralis: { build: 'beast', role: 'Beast', ends: ['fang', 'claw', 'maw', 'howl', 'tusk', 'mane'] },
  tidecaller: { build: 'diver', role: 'Diver', ends: ['caller', 'diver', 'shell', 'fin', 'wake', 'gill'] },
  pyreclaw: { build: 'brute', role: 'Brawler', ends: ['fist', 'maul', 'knuckle', 'brute', 'crush', 'hulk'] },
  briarix: { build: 'knight', role: 'Knight', ends: ['knight', 'crown', 'lance', 'warden', 'rook', 'thane'] },
  ironclad: { build: 'golem', role: 'Golem', ends: ['clad', 'golem', 'anvil', 'bulwark', 'rivet', 'piston'] },
  sabre: { build: 'duelist', role: 'Duelist', ends: ['blade', 'edge', 'saber', 'fencer', 'rapier', 'guard'] },
  zeroday: { build: 'phantom', role: 'Wraith', ends: ['wraith', 'shade', 'specter', 'veil', 'drift', 'hollow'] },
};

const TAKEN = new Set(Object.values(KITS).map((k) => k.family.names[0].toLowerCase())); // the Gauntlet's bosses
const STARTS = {
  elec: ['Volt', 'Spark', 'Arc', 'Ohm', 'Neon', 'Static', 'Joule', 'Flux', 'Zap', 'Glint', 'Surge', 'Watt'],
  fire: ['Cinder', 'Blaze', 'Ember', 'Pyro', 'Scorch', 'Magma', 'Ash', 'Flare', 'Kiln', 'Brand', 'Soot', 'Char'],
  aqua: ['Tide', 'Brine', 'Coral', 'Rip', 'Frost', 'Abyss', 'Hydro', 'Mist', 'Surf', 'Floe', 'Kelp', 'Drift'],
  wood: ['Briar', 'Thorn', 'Moss', 'Bramble', 'Root', 'Fern', 'Sap', 'Bloom', 'Bark', 'Vine', 'Spore', 'Hazel'],
  null: ['Iron', 'Null', 'Chrome', 'Rivet', 'Hex', 'Void', 'Gear', 'Onyx', 'Cobalt', 'Steel', 'Grit', 'Slate'],
};
const MOODS = {
  elec: ['Neon', 'Crackling', 'Static', 'Thunder'],
  fire: ['Blazing', 'Molten', 'Scorching', 'Ember'],
  aqua: ['Tidal', 'Frozen', 'Abyssal', 'Brine'],
  wood: ['Thorned', 'Verdant', 'Wild', 'Rooted'],
  null: ['Chrome', 'Hollow', 'Iron', 'Silent'],
};

// Heads and weapons a build draws from (the view's part kit).
const HEADS = {
  slender: ['lamp', 'visor', 'antenna'],
  beast: ['snout', 'horned', 'visor'],
  diver: ['dome', 'visor', 'lamp'],
  brute: ['horned', 'crest', 'visor'],
  knight: ['crown', 'helm', 'horned'],
  golem: ['helm', 'visor', 'dome'],
  duelist: ['crest', 'visor', 'helm'],
  phantom: ['hood', 'horned', 'crown'],
};
const WEAPON_BY_FAMILY = { voltframe: 'orb', feralis: 'claws', tidecaller: 'staff', pyreclaw: 'gauntlets', briarix: 'lance', ironclad: 'piston', sabre: 'blade', zeroday: 'claws' };

// ---------------------------------------------------------------- drawing a day

// A seeded generator for one day (and a salt, so separate draws don't share numbers).
function dayRng(day, salt = 0) {
  let h = (day * 0x9e3779b1) ^ (salt * 0x85ebca6b) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return new Rng((h ^ (h >>> 16)) >>> 0);
}

// The element: a walk round the five where each day steps 1-4 places on, so no element comes twice running.
function elementOf(day) {
  let at = 0;
  for (let d = 1; d <= day; d++) at = (at + 1 + dayRng(d, 1).int(4)) % ELEMENTS.length;
  return ELEMENTS[at];
}

const attacks = (fam, tier) => Object.entries(KITS[fam].moves).filter(([k, m]) => !m.support && moveAtTier(`${fam}.${k}`, tier));

// Today's boss. Pure: the same day always gives the same recipe.
export function dailyRecipe(day) {
  day = Math.max(1, day | 0);
  const rng = dayRng(day);
  const element = elementOf(day);
  const weekday = new Date(LAUNCH + (day - 1) * DAY).getUTCDay();
  const tier = TIER_BY_WEEKDAY[weekday];

  // The primary family sets the theme; the mover is usually its own.
  const primary = rng.pick(PRIMARY[element]);
  const others = Object.keys(KITS).filter((f) => f !== primary);
  const mover = rng.chance(0.65) ? primary : rng.pick(others);

  // Moves: two of the primary's attacks (its tier-gated one if this tier has it), then one or two borrowed
  // from other families, then a support move of the primary's at V2 and above, sometimes.
  const moves = [];
  const take = (fam, list, n) => {
    for (const [k] of rng.shuffle(list.slice()).slice(0, n)) moves.push(`${fam}.${k}`);
  };
  const own = attacks(primary, tier);
  const base = own.filter(([, m]) => !m.has && !m.ok);
  const gated = own.filter(([, m]) => m.has || m.ok);
  take(primary, base, gated.length && rng.chance(0.6) ? 1 : 2);
  if (moves.length < 2) take(primary, gated, 1);
  const lenders = rng.shuffle(others.slice());
  const borrow = tier >= 3 ? 2 : 1;
  for (const fam of lenders) {
    if (moves.filter((id) => !id.startsWith(`${primary}.`)).length >= borrow) break;
    // Borrowed moves are ones that need no setup: they always have a target.
    const list = attacks(fam, tier).filter(([k, m]) => !m.ok && !moves.includes(`${fam}.${k}`));
    if (list.length) take(fam, list, 1);
  }
  const supports = Object.entries(KITS[primary].moves).filter(([k, m]) => m.support && moveAtTier(`${primary}.${k}`, tier));
  // (Dark Aura only from V3: it makes a fight much longer.)
  const support = supports.filter(([k]) => k !== 'aura' || tier >= 3);
  if (tier >= 2 && support.length && rng.chance(0.55)) take(primary, support, 1);
  // Two attacks that are always there, so the boss always has something to do.
  for (const [k] of base) {
    if (moves.filter((id) => !kitMove(id).ok && !kitMove(id).support).length >= 2) break;
    if (!moves.includes(`${primary}.${k}`)) moves.push(`${primary}.${k}`);
  }

  const build = BUILDS[mover];
  let name;
  do name = rng.pick(STARTS[element]) + rng.pick(build.ends);
  while (TAKEN.has(name.toLowerCase()));
  const arena = rng.pick(ARENAS[element]);
  const [main, trim, glow] = rng.pick(PALETTES[element]);
  // HP grows slowly: a higher tier is harder because the boss hits harder and faster, not because the
  // fight drags on.
  const hp = roundTo(50, [600, 800, 1000, 1200][tier - 1] * (1 + rng.next() * 0.2));
  const weapons = [...new Set(moves.map((id) => WEAPON_BY_FAMILY[id.split('.')[0]]))];

  return {
    day,
    date: dayDate(day),
    type: `daily${day}`,
    name,
    title: `the ${rng.pick(MOODS[element])} ${build.role}`,
    element,
    weakness: weaknessOf(element),
    tier,
    tierName: TIER_NAMES[tier - 1],
    hp,
    mover,
    moves,
    // V3 and Ω keep their speed and tells but hit softer than the Gauntlet's versions.
    power: [1, 0.8, 0.7, 0.6][tier - 1],
    tune: tuning(moves),
    flying: mover === 'zeroday',
    superArmor: mover === 'ironclad' && primary === 'ironclad',
    immovable: mover === 'ironclad',
    arena: { key: arena.key, name: arena.name, sky: arena.sky, glow: arena.glow, accent: arena.accent, props: arena.props },
    field: arena.field(rng),
    body: {
      build: build.build,
      head: rng.pick(HEADS[build.build]),
      weapon: WEAPON_BY_FAMILY[mover] ?? weapons[0],
      extras: weapons.filter((w) => w !== WEAPON_BY_FAMILY[mover]).slice(0, 1),
      colors: { main: jitter(rng, main), trim: jitter(rng, trim), glow },
      size: build.build === 'golem' || build.build === 'brute' ? 1.15 : build.build === 'slender' ? 1.05 : 1,
      seed: rng.int(1 << 30),
    },
    seed: (day * 7919) >>> 0,
  };
}

// Softer numbers for the moves that make a fight drag: Dark Aura at 60 (any real chip breaks it, the
// buster can't) coming back after 25 s, and one brazier that heals slowly.
function tuning(moves) {
  const t = {};
  if (moves.includes('zeroday.aura')) t.zeroday = { aura: 60, auraCd: 1500 };
  if (moves.includes('pyreclaw.brazier')) t.pyreclaw = { braziers: 1, heal: 10, healEvery: 150, brazierCd: 900 };
  return Object.keys(t).length ? t : undefined;
}

// The move list as the lobby tells it: [{ id, name, desc, element, support }].
export function movesOf(recipe) {
  return recipe.moves.map((id) => {
    const m = kitMove(id);
    return { id, name: m.name, desc: m.desc, element: m.element, support: !!m.support };
  });
}

// The player's navi for a tier: HP and buster to match the boss.
export function playerFor(tier) {
  return { maxHp: [400, 650, 950, 1400][tier - 1], attack: 2 + Math.min(2, tier - 1), rapid: 3, charge: 3 };
}

function roundTo(step, v) {
  return Math.round(v / step) * step;
}

// A colour nudged a little in lightness, so two bosses with one palette still differ.
function jitter(rng, hex) {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.88 + rng.next() * 0.24;
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
