import { PARTS } from './parts.js';
import { ENEMY_TYPES } from './enemies.js';

// The forge: players design their own weapons. A design is a recipe over the game's building blocks rather
// than free-form code, so every design is valid, balanced by a budget, replays deterministically and fits in
// a short share code:
//   base     an arm or gun part you own: it sets the moveset (combo, or fire mode)
//   form     the look: shape, size (a small reach/speed tradeoff for arm weapons), body and glow colours
//   element  Battle Network's Fire, Aqua, Elec or Wood (double damage on the virus element it beats, plus a
//            status effect), or Null, which leaves more memory for mods
//   mods     up to three effects that must fit the weapon's memory (MB), like Battle Network chips and
//            NaviCust programs; some are unlocked with DATA
// Pure data and helpers; the World applies them in its fixed step and the view draws them.

export const MAX_DESIGNS = 6;
export const MAX_MODS = 3;
export const CAPACITY = 10; // MB of mods a weapon can hold
export const NULL_BONUS = 2; // extra MB when the weapon has no element
export const NAME_MAX = 16;

// Battle Network's weakness cycle: Fire > Wood > Elec > Aqua > Fire. `beats` takes double damage.
export const ELEMENTS = {
  none: { name: 'Null', color: 0xc8d4e8, beats: null, effect: `+${NULL_BONUS} MB of memory for mods` },
  fire: { name: 'Fire', color: 0xff6a2a, beats: 'wood', effect: 'burns (damage over time)' },
  aqua: { name: 'Aqua', color: 0x3ab8ff, beats: 'fire', effect: 'soaks (slows viruses and their attacks)' },
  elec: { name: 'Elec', color: 0xffe14a, beats: 'aqua', effect: 'shocks (every third hit stuns)' },
  wood: { name: 'Wood', color: 0x5ae06a, beats: 'elec', effect: 'leeches (hits heal you a little)' },
};
export const ELEMENT_KEYS = Object.keys(ELEMENTS);
export const STATUS = {
  burn: { ticks: 4, every: 0.5, dmg: 4 }, // a fire hit (re)starts four ticks, one each half second
  soak: { time: 2.5, speed: 0.55, clock: 0.65 }, // movement and attack timing while soaked
  shock: { hits: 3, stun: 1.0 },
  leech: 0.12, // fraction of damage healed (whole HP, the remainder carries over)
};

// Mods (programs). `slots`: where they fit; `not`: bases they don't apply to; `price`: DATA to unlock (0 =
// unlocked from the start).
export const MODS = {
  heavy: { name: 'Heavy', cost: 3, price: 0, slots: ['arm', 'gun'], desc: '+30% damage and knockback, 15% slower.' },
  swift: { name: 'Swift', cost: 3, price: 0, slots: ['arm', 'gun'], desc: 'Strikes 15% faster; fires 25% faster.' },
  reach: { name: 'Reach', cost: 2, price: 0, slots: ['arm'], desc: '+25% reach and lunges 3 m further.' },
  split: { name: 'Split', cost: 4, price: 0, slots: ['gun'], desc: 'Shots split into a fan (side shots 60%).' },
  burst: { name: 'Burst', cost: 4, price: 0, slots: ['arm', 'gun'], desc: 'Finishers explode; shots burst on impact.' },
  crit: { name: 'Critical', cost: 3, price: 50, slots: ['arm', 'gun'], desc: 'Every fourth hit deals double damage.' },
  chain: { name: 'Chain', cost: 5, price: 80, slots: ['arm', 'gun'], desc: 'Hits arc to another virus nearby for half damage.' },
  wave: { name: 'Wave', cost: 4, price: 60, slots: ['arm'], desc: 'Finishers send a shockwave racing along the ground.' },
  pierce: { name: 'Pierce', cost: 4, price: 50, slots: ['gun'], not: ['bomber', 'railgun'], desc: 'Shots pass through viruses.' },
  homing: { name: 'Homing', cost: 4, price: 60, slots: ['gun'], not: ['railgun'], desc: 'Shots curve toward your target.' },
  quick: { name: 'Quick Charge', cost: 3, price: 40, slots: ['gun'], desc: 'Charges 35% faster.' },
};
export const MOD_KEYS = Object.keys(MODS);
export const STARTER_MODS = MOD_KEYS.filter((k) => MODS[k].price === 0);

export const FORM = {
  shapes: {
    saber: ['Straight', 'Curved', 'Serrated', 'Twin'],
    breaker: ['Drum', 'Block', 'Spiked', 'Axe'],
    lance: ['Spear', 'Trident', 'Drill', 'Glaive'],
    claws: ['Three', 'Two', 'Hooks', 'Fan'],
    buster: ['Standard', 'Long', 'Twin', 'Heavy'],
    spreader: ['Standard', 'Long', 'Twin', 'Heavy'],
    railgun: ['Standard', 'Long', 'Twin', 'Heavy'],
    bomber: ['Standard', 'Long', 'Twin', 'Heavy'],
  },
  sizes: ['S', 'M', 'L'],
  // Arm weapons only: size trades reach against speed. [reach, timing]
  sizeEffect: [[0.92, 0.95], [1, 1], [1.08, 1.05]],
  scale: [0.85, 1, 1.2],
  palette: [0x4adfff, 0x3a7bff, 0x9a6bff, 0xff5ae0, 0xff4a4a, 0xff9a3a, 0xffd84a, 0xa8f05a, 0x4ae08a, 0x3ae0c8, 0xf4f8ff, 0x2c3448],
};

const BASES = { arm: ['saber', 'breaker', 'lance', 'claws'], gun: ['buster', 'spreader', 'railgun', 'bomber'] };
export const basesFor = (slot) => BASES[slot] ?? [];

export function capacityOf(design) {
  return CAPACITY + (design.element === 'none' ? NULL_BONUS : 0);
}
export function memoryUsed(mods) {
  return mods.reduce((n, k) => n + (MODS[k]?.cost ?? 0), 0);
}
export const modFits = (mod, design) => !!MODS[mod] && MODS[mod].slots.includes(design.slot) && !(MODS[mod].not ?? []).includes(design.base);

// Names: letters, digits, spaces and a little punctuation, at most NAME_MAX characters. They are only ever
// shown as plain text.
export function cleanName(name, fallback = 'Custom') {
  const s = String(name ?? '').replace(/[^A-Za-z0-9 .'!?&+-]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return s || fallback;
}

export function defaultDesign(slot, base) {
  const b = BASES[slot].includes(base) ? base : BASES[slot][0];
  return { name: `My ${PARTS[b].name}`, slot, base: b, form: { shape: 0, size: 1, color: 11, glow: 0 }, element: 'none', mods: [] };
}

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

// Check and tidy a design from anywhere (the editor, a save, a share code). Returns { design } or { error }.
// It does not check ownership or unlocks: the World does, when forging or equipping.
export function normalizeDesign(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'not a design' };
  const slot = raw.slot === 'arm' || raw.slot === 'gun' ? raw.slot : null;
  if (!slot) return { error: 'unknown slot' };
  if (!BASES[slot].includes(raw.base)) return { error: 'unknown base' };
  const f = raw.form ?? {};
  const form = { shape: int(f.shape, 0, 3), size: int(f.size, 0, 2), color: int(f.color, 0, FORM.palette.length - 1), glow: int(f.glow, 0, FORM.palette.length - 1) };
  if (Object.values(form).some((v) => v === null)) return { error: 'bad form' };
  if (!ELEMENTS[raw.element]) return { error: 'unknown element' };
  // Mods in catalog order, so equal designs compare equal (and survive the share code's bit set).
  const mods = (Array.isArray(raw.mods) ? [...new Set(raw.mods)] : []).sort((a, b) => MOD_KEYS.indexOf(a) - MOD_KEYS.indexOf(b));
  const design = { name: cleanName(raw.name, `My ${PARTS[raw.base].name}`), slot, base: raw.base, form, element: raw.element, mods };
  if (mods.length > MAX_MODS) return { error: `at most ${MAX_MODS} mods` };
  for (const m of mods) if (!modFits(m, design)) return { error: `${MODS[m]?.name ?? 'that mod'} doesn't fit this weapon` };
  if (memoryUsed(mods) > capacityOf(design)) return { error: 'not enough memory' };
  if (Number.isInteger(raw.id) && raw.id >= 1 && raw.id <= 99) design.id = raw.id;
  return { design };
}

// ---------------------------------------------------------------- applying a design to the kit

const scaleStrike = (s, { dmg = 1, time = 1, reach = 1, push = 1 }) => ({
  ...s,
  dur: s.dur * time, hit: s.hit * time, cancel: s.cancel * time,
  dmg: Math.round(s.dmg * dmg), reach: s.reach * reach, push: (s.push ?? 0) * push,
});

// The kit's arm or gun with the design's form and mods applied, plus the effects the World checks on hits.
export function applyDesign(kit, design) {
  const has = (m) => design.mods.includes(m);
  const fx = { element: design.element === 'none' ? null : design.element, crit: has('crit'), chain: has('chain'), burst: has('burst'), wave: has('wave') };
  if (design.slot === 'arm') {
    const [sizeReach, sizeTime] = FORM.sizeEffect[design.form.size];
    const k = {
      dmg: has('heavy') ? 1.3 : 1,
      time: sizeTime * (has('heavy') ? 1.15 : 1) * (has('swift') ? 0.85 : 1),
      reach: sizeReach * (has('reach') ? 1.25 : 1),
      push: has('heavy') ? 1.5 : 1,
    };
    const arm = kit.arm;
    kit.arm = {
      ...arm,
      ground: arm.ground.map((s) => scaleStrike(s, k)),
      air: arm.air.map((s) => scaleStrike(s, k)),
      launcher: arm.launcher ? scaleStrike(arm.launcher, k) : undefined,
      magnet: arm.magnet + (has('reach') ? 3 : 0),
    };
    kit.armFx = fx;
    kit.armDesign = design;
  } else {
    const g = kit.gun;
    const quick = has('quick') ? 0.65 : 1;
    kit.gun = {
      ...g,
      cooldown: g.cooldown * (has('swift') ? 0.75 : 1) * (has('heavy') ? 1.15 : 1),
      charge: { delay: g.charge.delay * quick, mid: g.charge.mid * quick, full: g.charge.full * quick },
    };
    kit.gunFx = { ...fx, heavy: has('heavy'), split: has('split'), pierce: has('pierce'), homing: has('homing') };
    kit.gunDesign = design;
  }
  return kit;
}

// ---------------------------------------------------------------- share codes
// A design packs into a few bytes, written in Crockford base32 (no I, L, O, U, so codes survive being read
// aloud or retyped) with a version and a checksum against typos: "CMW-XXXX-XXXX-...".

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_VERSION = 1;
const ALL_BASES = [...BASES.arm, ...BASES.gun];

function crc8(bytes) {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

export function encodeDesign(design) {
  const name = cleanName(design.name);
  const modBits = design.mods.reduce((n, m) => n | (1 << MOD_KEYS.indexOf(m)), 0);
  const bytes = [
    CODE_VERSION,
    ALL_BASES.indexOf(design.base),
    ELEMENT_KEYS.indexOf(design.element),
    design.form.shape | (design.form.size << 2),
    design.form.color | (design.form.glow << 4),
    modBits & 0xff,
    (modBits >> 8) & 0xff,
    name.length,
    ...[...name].map((ch) => ch.charCodeAt(0)),
  ];
  bytes.push(crc8(bytes));
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff; // only the low bits are ever read
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return `CMW-${out.match(/.{1,4}/g).join('-')}`;
}

// Read a share code back. Returns { design } or { error } with a message fit to show the player.
export function decodeDesign(code) {
  const raw = String(code ?? '').toUpperCase().replace(/\s+/g, '').replace(/^CMW-?/, '').replace(/-/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!raw || raw.length > 64 || /[^0-9A-HJKMNP-TV-Z]/.test(raw)) return { error: "That isn't a weapon code" };
  const bytes = [];
  let bits = 0;
  let acc = 0;
  for (const ch of raw) {
    acc = ((acc << 5) | B32.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acc >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (bytes.length < 9) return { error: 'That code is too short' };
  if (bytes[0] !== CODE_VERSION) return { error: 'That code is from another version' };
  const n = bytes[7];
  if (bytes.length < 9 + n) return { error: 'That code is cut off' };
  // Exactly the right length, and the padding bits after the last byte are zero: a code with any one
  // character changed, added or left off is always caught (here or by the checksum).
  if (raw.length !== Math.ceil(((9 + n) * 8) / 5) || acc & ((1 << bits) - 1)) return { error: 'That code has a typo' };
  const body = bytes.slice(0, 8 + n);
  if (crc8(body) !== bytes[8 + n]) return { error: 'That code has a typo' };
  const base = ALL_BASES[bytes[1]];
  const element = ELEMENT_KEYS[bytes[2]];
  if (!base || !element) return { error: 'That code has a typo' };
  const modBits = bytes[5] | (bytes[6] << 8);
  const mods = MOD_KEYS.filter((_, i) => modBits & (1 << i));
  return normalizeDesign({
    name: String.fromCharCode(...body.slice(8)),
    slot: BASES.arm.includes(base) ? 'arm' : 'gun',
    base,
    element,
    form: { shape: bytes[3] & 3, size: (bytes[3] >> 2) & 3, color: bytes[4] & 15, glow: (bytes[4] >> 4) & 15 },
    mods,
  });
}

// The viruses an element deals double damage to, as plural names ("Rivets").
export function weakViruses(element) {
  const beats = ELEMENTS[element]?.beats;
  return Object.keys(ENEMY_TYPES).filter((k) => beats && ENEMY_TYPES[k].element === beats).map((k) => `${k[0].toUpperCase()}${k.slice(1)}s`);
}

// What the editor shows about a design: a line per effect.
export function designSummary(design) {
  const out = [];
  const el = ELEMENTS[design.element];
  if (design.element === 'none') out.push(`Null: ${el.effect}`);
  else {
    const weak = weakViruses(design.element);
    const prey = weak.length ? `double damage to ${weak.join(' and ')} (${ELEMENTS[el.beats].name})` : `double damage to ${ELEMENTS[el.beats].name} viruses (none out here yet)`;
    out.push(`${el.name}: ${el.effect}; ${prey}`);
  }
  if (design.slot === 'arm') {
    const [r, t] = FORM.sizeEffect[design.form.size];
    if (r !== 1) out.push(`Size ${FORM.sizes[design.form.size]}: reach ${r > 1 ? '+' : ''}${Math.round((r - 1) * 100)}%, speed ${t < 1 ? '+' : '−'}${Math.round(Math.abs(1 - t) * 100)}%`);
  }
  for (const m of design.mods) out.push(`${MODS[m].name}: ${MODS[m].desc}`);
  return out;
}
