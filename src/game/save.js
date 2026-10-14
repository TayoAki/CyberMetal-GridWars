import { CHIPS } from '../engine/chips/library.js';
import { PLAYER_BASE_HP } from '../engine/constants.js';

// Player progress, persisted to localStorage (wrapped: storage can be missing or throw, and the game
// still runs from memory). The folder is 30 chips drawn from the owned library.

const KEY = 'cybermetal-gridwars-save-v1';

// Mirrors the shape of BN3's own starter folder (decoded from the ROM's preset-folder table).
export const STARTER_FOLDER = [
  ['cannon', 'A', 2], ['cannon', 'B', 2], ['shotgun', 'J', 3], ['vgun', 'D', 3], ['sidegun', 'S', 1],
  ['airshot1', '*', 3], ['minibomb', 'B', 2], ['minibomb', 'S', 1], ['sword', 'L', 3], ['widesword', 'L', 1],
  ['panlout1', 'B', 2], ['areagrab', 'L', 1], ['recov10', 'A', 2], ['recov10', 'L', 2], ['atk10', '*', 2],
];
const STARTER_EXTRA = [['cannon', 'C', 1], ['recov30', '*', 1], ['guard', '*', 1], ['shockwave', 'D', 1]];

export const PROGRAMS = {
  underShirt: { name: 'UnderShirt', cost: 1, desc: 'Survive a lethal hit with 1 HP (if HP > 1).' },
  floatShoes: { name: 'FloatShoes', cost: 1, desc: 'Ignore floor effects: lava, ice, poison, cracks.' },
  airShoes: { name: 'AirShoes', cost: 1, desc: 'Stand on holes.' },
  superArmor: { name: 'SuperArmor', cost: 2, desc: 'Hits no longer make you flinch.' },
  custom1: { name: 'Custom+1', cost: 2, desc: 'See 1 more chip on the Custom Screen.' },
  custom2: { name: 'Custom+2', cost: 3, desc: 'See 2 more chips on the Custom Screen.' },
};

export const FOLDER_RULES = { size: 30, maxStandard: 5, maxMegaEach: 1, maxMega: 5, maxGiga: 1 };

// Style Change (BN3): beating a boss unlocks the style it teaches.
export const STYLE_TYPES = {
  guts: { name: 'Guts', boss: 'feralis', desc: 'Buster hits twice as hard; hits never make you flinch.' },
  custom: { name: 'Custom', boss: 'sabre', desc: 'See 1 more chip on the Custom Screen.' },
  shield: { name: 'Shield', boss: 'ironclad', desc: 'Hold Back + B: a shield that reflects attacks.' },
  team: { name: 'Team', boss: 'zeroday', desc: 'Carry up to 7 Mega chips in your folder.' },
};
export const STYLE_ELEMENTS = {
  fire: { name: 'Heat', boss: 'pyreclaw', desc: 'Fire body. Charge shot breathes flame 3 panels.' },
  aqua: { name: 'Aqua', boss: 'tidecaller', desc: 'Aqua body. Charge shot is a bursting bubble.' },
  elec: { name: 'Elec', boss: 'voltframe', desc: 'Elec body. Charge shot paralyses.' },
  wood: { name: 'Wood', boss: 'briarix', desc: 'Wood body. Charge shot is a tornado; heal on grass.' },
};

function expand(list) {
  const out = [];
  for (const [key, code, n] of list) for (let i = 0; i < n; i++) out.push({ key, code });
  return out;
}

export function chipId(c) {
  return `${c.key}:${c.code}`;
}

function freshData() {
  const folder = expand(STARTER_FOLDER);
  const library = {};
  for (const c of [...folder, ...expand(STARTER_EXTRA)]) library[chipId(c)] = (library[chipId(c)] ?? 0) + 1;
  return {
    v: 1,
    folder,
    library,
    stats: { hpMem: 0, attack: 1, rapid: 1, charge: 1 },
    programs: { owned: ['underShirt'], equipped: [] },
    style: { type: null, element: 'null' },
    progress: { area: 0, step: 0, hp: null, cleared: {}, bosses: {}, encounters: {}, finished: false },
    bits: 0,
    options: { sfx: 0.8, music: 0.55, numbers: true },
    records: { battles: 0, wins: 0, best: {} },
  };
}

export class SaveData {
  constructor(storage) {
    this.storage = storage;
    this.data = freshData();
    try {
      const raw = storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === 1) this.data = { ...freshData(), ...parsed, options: { ...freshData().options, ...parsed.options } };
      }
    } catch {
      this.data = freshData();
    }
    this.sanitize();
  }

  sanitize() {
    // Drop chips that no longer exist; refill a short folder from the starter list.
    const d = this.data;
    d.folder = d.folder.filter((c) => CHIPS[c.key]);
    for (const id of Object.keys(d.library)) if (!CHIPS[id.split(':')[0]]) delete d.library[id];
    if (d.folder.length !== FOLDER_RULES.size) d.folder = expand(STARTER_FOLDER);
  }

  persist() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full or blocked: keep playing from memory */
    }
  }

  reset() {
    this.data = freshData();
    this.persist();
  }

  get maxHp() {
    return PLAYER_BASE_HP + 20 * this.data.stats.hpMem;
  }

  unlockedStyles() {
    const beaten = this.data.progress.bosses;
    return {
      types: Object.keys(STYLE_TYPES).filter((k) => beaten[STYLE_TYPES[k].boss]),
      elements: Object.keys(STYLE_ELEMENTS).filter((k) => beaten[STYLE_ELEMENTS[k].boss]),
    };
  }

  get maxMega() {
    return FOLDER_RULES.maxMega + (this.data.style?.type === 'team' ? 2 : 0);
  }

  get programCapacity() {
    const bosses = Object.keys(this.data.progress.bosses).length;
    return Math.min(6, 3 + Math.floor(bosses / 2));
  }

  programsUsed() {
    return this.data.programs.equipped.reduce((n, k) => n + (PROGRAMS[k]?.cost ?? 0), 0);
  }

  // The player block a Battle expects.
  battlePlayer(hp = null) {
    const d = this.data;
    const programs = {};
    for (const k of d.programs.equipped) programs[k] = true;
    return {
      name: 'AXIOM',
      maxHp: this.maxHp,
      hp: hp ?? this.maxHp,
      attack: d.stats.attack,
      rapid: d.stats.rapid,
      charge: d.stats.charge,
      programs,
      style: { ...(d.style ?? { type: null, element: 'null' }) },
      folder: d.folder.map((c) => ({ ...c })),
    };
  }

  addChip(key, code, n = 1) {
    const id = `${key}:${code}`;
    this.data.library[id] = (this.data.library[id] ?? 0) + n;
  }

  ownedCount(key, code) {
    return this.data.library[`${key}:${code}`] ?? 0;
  }

  folderCount(key, code) {
    return this.data.folder.filter((c) => c.key === key && (code === undefined || c.code === code)).length;
  }

  // Can `chip` be added to the folder (given the folder minus `without` index)?
  canAddToFolder(chip, folder = this.data.folder) {
    const def = CHIPS[chip.key];
    if (!def || def.klass === 'pa') return false;
    const sameId = folder.filter((c) => c.key === chip.key && c.code === chip.code).length;
    if (sameId >= this.ownedCount(chip.key, chip.code)) return false;
    if (def.klass === 'mega') {
      if (folder.some((c) => c.key === chip.key)) return false;
      if (folder.filter((c) => CHIPS[c.key]?.klass === 'mega').length >= this.maxMega) return false;
    } else if (def.klass === 'giga') {
      if (folder.filter((c) => CHIPS[c.key]?.klass === 'giga').length >= FOLDER_RULES.maxGiga) return false;
    } else if (folder.filter((c) => c.key === chip.key).length >= FOLDER_RULES.maxStandard) return false;
    return true;
  }
}
