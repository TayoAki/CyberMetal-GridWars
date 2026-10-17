// AXIOM's look: swappable parts and colours (the CUSTOMIZE screen). Purely cosmetic.
//
// Each slot offers a few parts drawn in the same body coordinates as core_player.js (X from the feet centre,
// Y from the floor), so every pose still fits: heads and torsos replace the default art, shoulders come in
// back/front pairs, a back piece sits behind the body, and leg and arm styles re-plate the existing limb art
// (swapping which pixels are armour, suit or lights) so all the action poses keep working.
//
// Colours come in three channels, each a ramp over the palette keys the art already uses: ARMOR (W A B C D E),
// SUIT (n m q) and LIGHTS (1-5, which also colour the visor). Style Change tints the lights by element in
// battle, on top of whatever the player picked.

import { hexToRgb, rgbToHex } from '../pixel.js';

const part = (rows, X, Y) => Object.freeze({ rows, X, Y });

// ---------------------------------------------------------------- the catalog

export const LOOK_SLOTS = [
  {
    key: 'head',
    name: 'HEAD',
    options: [
      { id: 'axiom', name: 'Axiom', desc: 'Visored helmet with a swept fin.' },
      { id: 'vanguard', name: 'Vanguard', desc: 'Knight helm: tall crest, slit visor.' },
      { id: 'oni', name: 'Oni', desc: 'Twin horns over a narrow visor.' },
      { id: 'nova', name: 'Nova', desc: 'Glass dome visor and an antenna.' },
      { id: 'ronin', name: 'Ronin', desc: 'Flared war helm with a crescent crest.' },
      { id: 'specter', name: 'Specter', desc: 'Smooth hood with a single eye.' },
    ],
  },
  {
    key: 'body',
    name: 'BODY',
    options: [
      { id: 'axiom', name: 'Axiom', desc: 'Light chest plate with a gem core.' },
      { id: 'bulwark', name: 'Bulwark', desc: 'Broad, heavy armour.' },
      { id: 'phantom', name: 'Phantom', desc: 'Slim frame with V-shaped lights.' },
      { id: 'reactor', name: 'Reactor', desc: 'A round core glowing in the chest.' },
      { id: 'aegis', name: 'Aegis', desc: 'Layered plates with a chevron.' },
    ],
  },
  {
    key: 'arms',
    name: 'ARMS',
    options: [
      { id: 'axiom', name: 'Axiom', desc: 'Rounded shoulder guards.' },
      { id: 'titan', name: 'Titan', desc: 'Big shoulders, armoured upper arms.' },
      { id: 'stinger', name: 'Stinger', desc: 'Spiked shoulder guards.' },
      { id: 'tiered', name: 'Tiered', desc: 'Stacked guards with a light band.' },
      { id: 'slim', name: 'Slim', desc: 'Small caps, nothing in the way.' },
    ],
  },
  {
    key: 'legs',
    name: 'LEGS',
    options: [
      { id: 'axiom', name: 'Axiom', desc: 'Suit legs with armoured knees and boots.' },
      { id: 'titan', name: 'Titan', desc: 'Armour from hip to boot.' },
      { id: 'jet', name: 'Jet', desc: 'Boots with glowing cuffs and soles.' },
      { id: 'stealth', name: 'Stealth', desc: 'Dark, plain suit legs.' },
    ],
  },
  {
    key: 'back',
    name: 'BACK',
    options: [
      { id: 'none', name: 'None', desc: 'Nothing on the back.' },
      { id: 'wings', name: 'Wings', desc: 'Twin blade wings.' },
      { id: 'thruster', name: 'Thruster', desc: 'A jet pack with two nozzles.' },
      { id: 'scarf', name: 'Scarf', desc: 'A glowing scarf trailing behind.' },
      { id: 'fins', name: 'Fins', desc: 'A row of dorsal fins.' },
    ],
  },
];

// Colour presets per channel. `base` is the mid tone; `tone` shifts the whole ramp darker or lighter.
// The first preset of each channel is AXIOM's own colours, kept exactly as drawn.
export const LOOK_COLORS = {
  armor: [
    { id: 'chrome', name: 'Chrome', base: '#7180a3' },
    { id: 'crimson', name: 'Crimson', base: '#c23040' },
    { id: 'gold', name: 'Gold', base: '#c89a28' },
    { id: 'emerald', name: 'Emerald', base: '#2a9a5e' },
    { id: 'cobalt', name: 'Cobalt', base: '#3a5ad0' },
    { id: 'violet', name: 'Violet', base: '#8048c8' },
    { id: 'copper', name: 'Copper', base: '#b86a34' },
    { id: 'rose', name: 'Rose', base: '#d0608e' },
    { id: 'obsidian', name: 'Obsidian', base: '#4a4a5c', tone: -1 },
    { id: 'ivory', name: 'Ivory', base: '#c8bea4', tone: 1 },
  ],
  suit: [
    { id: 'navy', name: 'Navy', base: '#323d6c' },
    { id: 'black', name: 'Black', base: '#2a2a32' },
    { id: 'crimson', name: 'Crimson', base: '#6a1e2e' },
    { id: 'forest', name: 'Forest', base: '#1f4a2e' },
    { id: 'purple', name: 'Purple', base: '#42245e' },
    { id: 'steel', name: 'Steel', base: '#4a525e' },
    { id: 'brown', name: 'Brown', base: '#4e3422' },
    { id: 'white', name: 'White', base: '#9aa2b4', tone: 1 },
  ],
  lights: [
    { id: 'cyan', name: 'Cyan', base: '#27c3ee' },
    { id: 'red', name: 'Red', base: '#f03a3a' },
    { id: 'orange', name: 'Orange', base: '#f5862a' },
    { id: 'yellow', name: 'Yellow', base: '#f2c81a' },
    { id: 'lime', name: 'Lime', base: '#7ad62a' },
    { id: 'green', name: 'Green', base: '#20c070' },
    { id: 'magenta', name: 'Magenta', base: '#e83ac8' },
    { id: 'violet', name: 'Violet', base: '#8a52f0' },
    { id: 'white', name: 'White', base: '#b8c4dc', tone: 1 },
  ],
};

export const COLOR_CHANNELS = [
  { key: 'armor', name: 'ARMOR' },
  { key: 'suit', name: 'SUIT' },
  { key: 'lights', name: 'LIGHTS' },
];

export const DEFAULT_LOOK = Object.freeze({ head: 'axiom', body: 'axiom', arms: 'axiom', legs: 'axiom', back: 'none', armor: 'chrome', suit: 'navy', lights: 'cyan' });

// A look with every field valid (unknown or missing ones fall back to AXIOM's).
export function normalizeLook(look) {
  const out = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return out;
  for (const s of LOOK_SLOTS) if (s.options.some((o) => o.id === look[s.key])) out[s.key] = look[s.key];
  for (const c of COLOR_CHANNELS) if (LOOK_COLORS[c.key].some((o) => o.id === look[c.key])) out[c.key] = look[c.key];
  return out;
}

// Identifies the parts of a look (colours excluded): poses are composed once per parts key.
export function partsKey(look) {
  const l = normalizeLook(look);
  return LOOK_SLOTS.map((s) => l[s.key]).join('.');
}

// ---------------------------------------------------------------- colour ramps

function toHsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

// Lightness steps per channel (AXIOM's own ramps, measured) and how far a tone shifts them.
const STEPS = {
  armor: { keys: ['W', 'A', 'B', 'C', 'D', 'E'], l: [0.97, 0.88, 0.72, 0.54, 0.37, 0.24] },
  suit: { keys: ['n', 'm', 'q'], l: [0.45, 0.32, 0.2] },
  lights: { keys: ['1', '2', '3', '4', '5'], l: [0.95, 0.74, 0.54, 0.38, 0.24] },
};

// Palette overrides for one preset: the base hue at each step, a little less saturated in the highlights and
// leaning cooler in the shadows (the usual pixel-art hue shift).
export function colorRamp(channel, preset) {
  const [h, s] = toHsl(hexToRgb(preset.base));
  const { keys, l } = STEPS[channel];
  const tone = preset.tone ?? 0;
  const out = {};
  keys.forEach((k, i) => {
    const t = i / (keys.length - 1); // 0 = lightest, 1 = darkest
    const li = tone < 0 ? l[i] * 0.72 : tone > 0 ? l[i] + (1 - l[i]) * 0.35 : l[i];
    const sat = Math.min(1, s * (0.55 + 0.6 * t));
    out[k] = fromHsl(h + (t - 0.5) * 16 * (h > 60 && h < 200 ? 1 : -1), sat, Math.max(0.04, Math.min(0.985, li)));
  });
  return out;
}

const rampCache = new Map();

// The palette overrides for a look's colours ({} for AXIOM's own: the drawn palette stays untouched).
export function lookColors(look) {
  const l = normalizeLook(look);
  const key = `${l.armor}.${l.suit}.${l.lights}`;
  let out = rampCache.get(key);
  if (out) return out;
  out = {};
  for (const c of COLOR_CHANNELS) {
    const list = LOOK_COLORS[c.key];
    const preset = list.find((p) => p.id === l[c.key]);
    if (preset !== list[0]) Object.assign(out, colorRamp(c.key, preset));
  }
  out = Object.freeze(out);
  rampCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- heads (normal; the hurt face is derived)
// Each head lists the rows of its visor; when hurt, the visor's lights go dark with a pale glint.

export const HEADS = {
  vanguard: {
    part: part(
      [
        '......2.......', // -44 crest
        '.....A23......',
        '.....A23B.....',
        '....AW34BB....',
        '...AWA34BBB...', // -40
        '..AWAAA4BBBC..',
        '.AWAAAAABBBBC.',
        'AAAAAAABBBBBC.',
        'AABBBBBBBBCCC.', // -36
        'ABCCDDDDDDDDD.',
        'BBCDDE33333333', // -34 visor slit
        'BCCDDEDDD4DDD.',
        'BCCDDEDDD3DD..',
        '.CCDDECBC4C...', // -31 cheek guard
        '.CDDDEqmnnC...',
        '..DDCEqmnnC...',
        '...DDDCBAC....',
        '.....DDDD.....', // -27
      ],
      -7,
      -44,
    ),
    visor: [10, 12],
  },
  oni: {
    part: part(
      [
        '.4........4...', // -42 horns
        '.34......43...',
        '..34....43....',
        '..A3AAAA3B....', // -39
        '.AWWAAAAABB...',
        '.AWAAAAAABBC..',
        '.AAAAAAAABBCC.',
        'AAABBBBBBBBCC.', // -35
        'ABCDDE54444...', // -34 visor
        'BBD2DE411222..',
        'BCDDDE43333...',
        '.CCCDEqmmnnnC.', // -31
        '..DCCEqmmnnC..',
        '..DDDECBAAC...',
        '...DDCBBCC....',
        '.....DDDD.....', // -27
      ],
      -7,
      -42,
    ),
    visor: [8, 10],
  },
  nova: {
    part: part(
      [
        '.....1........', // -44 antenna
        '....121.......',
        '.....D........',
        '.....D........',
        '...AAAAAB.....', // -40 dome
        '..AWWAAAABB...',
        '.AWWAAA5444C..',
        '.AWAAA544443C.',
        'AAAAA5411114C.', // -36 visor
        'AAABB4122223C.',
        'ABBBB4222223C.',
        'BBCCC5433335C.',
        '.CCDDD54445C..', // -32
        '..DDDDDDDDC...',
        '..DCCEqmmnC...',
        '...DDCBAAC....',
        '....DDDDD.....',
        '.....DDDD.....', // -27
      ],
      -7,
      -44,
    ),
    visor: [6, 12],
  },
  ronin: {
    part: part(
      [
        '...........4..', // -43 crescent
        '.....AAAA.34..',
        '....AWWAA34...',
        '...AWAAA34B...', // -40
        '..AWAAAABBBC..',
        '.AAAAAAABBBC..',
        'AAABBBBBBBBCC.',
        'ABBBBBBBBBCCD.', // -36 brim
        'BCCDDDDDDDDDDD',
        'CD.DDE5444443.', // -34 visor
        'D..BDE4112222.',
        '...BDE433333..',
        '...CDEqmmnnnC.', // -31
        '...DCEqmmnnC..',
        '...DDDCBAAC...',
        '....DDDDDD....',
        '.....DDDD.....', // -27
      ],
      -7,
      -43,
    ),
    visor: [9, 11],
  },
  specter: {
    part: part(
      [
        '....AAAAB.....', // -41 hood
        '..AAWWAAABB...',
        '.AWWAAAAAABB..',
        'AWAAAAAAAABBC.',
        'AAAAAAABBBBBC.', // -37
        'AAABBBBBBCCCC.',
        'ABBBCDDDDDDDE.', // -35 face band
        'ABBCDEEE1EEEE.',
        'ABBCDEE121EEE.', // -33 the eye
        'BBCCDEEE3EEEE.',
        'BBCCDDDDDDDDD.',
        'BCCDDEqmmnnD..', // -30
        '.CDDDEqmmnD...',
        '..DDDDCBAC....',
        '.....DDDD.....', // -27
      ],
      -7,
      -41,
    ),
    visor: [7, 9],
  },
};

// ---------------------------------------------------------------- torsos

export const TORSOS = {
  bulwark: part(
    [
      '......mnnq......', // -27
      '..AAAAAnnAAAAB..',
      '.AWWWAB33BAAABC.',
      '.AWAAB3113BBBCC.',
      '.AAAAB4224BBCCD.',
      '.ABBBC4444CCCDD.', // -22
      '..BCCCCCCCCCDD..',
      '...BCDmnnmDDD...',
      '....DDmnmmDD....',
      '...ABBB23BBCD...', // -18 belt
      '...BCCC34CCDD...',
      '...mnnnmmnnmq...',
      '...mnnq..mnmq...',
    ],
    -8,
    -27,
  ),
  phantom: part(
    [
      '......mnnq......', // -27
      '....AAAnnAAB....',
      '...AW2AnnA2BC...',
      '...AA32nn23BC...',
      '....AB3223CC....',
      '....BBC33CCD....', // -22
      '.....BCCCCD.....',
      '.....mnnnmq.....',
      '.....mnnmmq.....',
      '....ABB23BCD....', // -18 belt
      '....BCC34CDD....',
      '...mnnnmmnnmq...',
      '...mnnq..mnmq...',
    ],
    -8,
    -27,
  ),
  reactor: part(
    [
      '......mnnq......', // -27
      '...AAAAnnAAAB...',
      '..AWWA4334AABC..',
      '..AWA421124BCC..',
      '..AAA311113CCD..',
      '..ABB421124CCD..', // -22
      '...BCC4334CCD...',
      '....DmnnnmqD....',
      '.....mnnmmq.....',
      '...ABBB23BBCD...', // -18 belt
      '...BCCC34CCDD...',
      '...mnnnmmnnmq...',
      '...mnnq..mnmq...',
    ],
    -8,
    -27,
  ),
  aegis: part(
    [
      '......mnnq......', // -27
      '...AAAAnnAAAB...',
      '..AWWAAAAAAABC..',
      '..AWA3AAAA3BCC..',
      '..ABBC3AA3BCCD..',
      '..AABBC33CBCCD..', // -22
      '...BBCCCCCCDD...',
      '....CDDDDDDD....',
      '.....mnnmmq.....',
      '...ABBB23BBCD...', // -18 belt
      '...BCCC34CCDD...',
      '...mnnnmmnnmq...',
      '...mnnq..mnmq...',
    ],
    -8,
    -27,
  ),
};

// ---------------------------------------------------------------- shoulders (back and front) and arm plating

export const SHOULDERS = {
  titan: {
    back: part(['..AAAA..', '.AWWAAB.', 'AWWAABBC', 'AWAABBCC', 'ABBBBCCD', '.BCCCDD.'], -12, -28),
    front: part(['..AAAB..', '.AWWABC.', 'AWWAABCD', 'AWAABBCD', 'ABBBCCDD', '.BCCCDD.'], 2, -28),
    plated: true,
  },
  stinger: {
    back: part(['....4..', '...34..', '..AAAA.', '.AWWAB.', 'AWAABBC', 'AABBBCC', '.BBCCD.'], -11, -29),
    front: part(['..4....', '..34...', '.AAAB..', 'AWWABC.', 'AWAABCD', 'ABBBCCD', '.BCCCD.'], 3, -29),
  },
  tiered: {
    back: part(['..AAAAA.', '.AWWAAB.', 'A3333334', 'AABBBBCC', '.BBCCCD.', '..CCDD..'], -12, -27),
    front: part(['.AAAAB..', 'AWWAABC.', '3333334C', 'ABBBBCCD', '.BCCCDD.', '..CDD...'], 2, -27),
  },
  slim: {
    back: part(['.AAB.', 'AWABC', '.BCD.'], -10, -26),
    front: part(['.AAB.', 'AWABC', '.BCD.'], 4, -26),
  },
};

// ---------------------------------------------------------------- back pieces (drawn behind the body)

export const BACKS = {
  // A swept wing rising from the shoulder blades, its feathers trimmed with lights.
  wings: part(
    [
      'AAB.............', // -35 tip
      'AWWAAB..........',
      '.AWWWAAAB.......',
      '.AAWWAAAAABB....',
      '..AAAAAABBBBBC..',
      '..ABBBBBBBCCCCD.', // -30
      '...B3BBB3BBC3CDD',
      '...BC.BCC.BCCDDD',
      '...C..BC..CDDDD.',
      '......C...CDD...', // -26
    ],
    -23,
    -35,
  ),
  thruster: part(
    [
      '...AAAB.', // -28
      '..AWWABC',
      '.AWAAABC',
      'AWA33BCD',
      'AAB44BCD',
      'ABBBBCCD', // -23
      'ABBCCCDD',
      '.BCDDDD.',
      'DE.DE...', // -20 nozzles
      'oy.oy...',
      'yo.y....',
      'o..o....', // -17
    ],
    -15,
    -28,
  ),
  scarf: part(
    [
      '..........2333..', // -29
      '.......223344455',
      '....2233445.....',
      '..23344.........', // -26
      '.2344..23.......',
      '234...2344......',
      '34...234........',
      '4...34..........', // -22
      '...4............',
    ],
    -20,
    -29,
  ),
  fins: part(
    [
      '2.........', // -35
      'A2...2....',
      'AB..A2....',
      'ABC.AB..2.',
      'ABC.AB.A2.', // -31
      'BCD.ABC.AB',
      '.CD.BCD.AB',
      '....BCD.BC',
      '........CD', // -27
    ],
    -16,
    -35,
  ),
};

// ---------------------------------------------------------------- leg and arm plating
// A plating swaps palette keys inside the limb art: the shape stays, so every pose still lines up.

const SUIT_TO_ARMOR = { n: 'B', m: 'C', q: 'D' };

export const LEG_STYLES = {
  // Suit turned to armour, hip to boot.
  titan: { map: SUIT_TO_ARMOR },
  // Cuffs light up and the soles glow.
  jet: { map: { 2: '1', 3: '2', 4: '3' }, soles: { E: '3', D: '4' } },
  // Boots in suit colours: dark and plain.
  stealth: { map: { W: 'n', A: 'n', B: 'n', C: 'm', D: 'q', E: 'q', 2: 'n', 3: 'm', 4: 'q' } },
};

const plated = new Map();

// The rows of a limb part re-plated. `soles` applies to the bottom two rows only (the boot soles).
export function platedRows(rows, style) {
  if (!style) return rows;
  let byStyle = plated.get(rows);
  if (!byStyle) plated.set(rows, (byStyle = new Map()));
  let out = byStyle.get(style);
  if (out) return out;
  out = rows.map((r, i) => {
    const sole = style.soles && i >= rows.length - 2;
    return [...r].map((ch) => (sole && style.soles[ch]) || style.map?.[ch] || ch).join('');
  });
  byStyle.set(style, out);
  return out;
}

export const ARM_PLATING = { map: SUIT_TO_ARMOR };
