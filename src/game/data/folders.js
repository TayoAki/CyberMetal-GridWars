// Folders: the starter folder every save begins with, and the pre-built folders (BN3's XtraFolder idea).
//
// A pre-built folder is a ready-made 30-chip folder the player can equip instead of their own. It is
// loaned: the chips don't have to be owned, they never enter the pack, and the folder can't be edited.
// Each is built around one or two codes plus `*` chips, so the Custom Screen lets you take several chips at
// once, and most carry a Program Advance. They unlock as the Gauntlet goes on (`area`: the area you must
// reach), so a folder is never far ahead of the chips you could have earned by then.
//
// Lists are [chip key, code, copies]; every list obeys the folder rules (tests/folders.test.js).

// BN3's own starter folder (decoded from the ROM's preset-folder table) with one change: a Cannon C in
// place of its SideGun S, so Cannon A, B, C can fuse from the first battle. BN3's own can make no fusion.
export const STARTER_FOLDER = [
  ['cannon', 'A', 2], ['cannon', 'B', 2], ['cannon', 'C', 1], ['shotgun', 'J', 3], ['vgun', 'D', 3],
  ['airshot1', '*', 3], ['minibomb', 'B', 2], ['minibomb', 'S', 1], ['sword', 'L', 3], ['widesword', 'L', 1],
  ['panlout1', 'B', 2], ['areagrab', 'L', 1], ['recov10', 'A', 2], ['recov10', 'L', 2], ['atk10', '*', 2],
];

export const PRESET_FOLDERS = [
  {
    key: 'starter',
    name: 'STARTER',
    area: 0,
    pa: ['cannonade1'],
    desc: 'The folder you began with: a little of everything.',
    chips: STARTER_FOLDER,
  },
  {
    key: 'cannon',
    name: 'CANNON CREW',
    area: 0,
    pa: ['cannonade1'],
    desc: 'Shoot from the back row with A, B and C chips.',
    chips: [
      ['cannon', 'A', 2], ['cannon', 'B', 2], ['cannon', 'C', 1], ['shotgun', 'B', 2], ['sidegun', 'C', 2], ['vgun', '*', 1],
      ['airshot1', '*', 3], ['minibomb', 'B', 2], ['heatshot', 'B', 2], ['ratton1', 'A', 2], ['zapring1', 'A', 1],
      ['panlout1', 'A', 1], ['recov10', 'A', 2], ['recov10', 'C', 1], ['barrier', 'C', 1], ['guard', '*', 2], ['atk10', '*', 3],
    ],
  },
  {
    key: 'sword',
    name: 'SWORDPLAY',
    area: 0,
    pa: [],
    desc: 'Get close and cut. AreaGrab and DashAtk bring the blade to them.',
    chips: [
      ['sword', 'E', 2], ['sword', 'L', 3], ['widesword', 'E', 2], ['widesword', 'L', 2], ['areagrab', 'E', 1], ['areagrab', 'L', 1],
      ['panlgrab', 'L', 1], ['shockwave', 'L', 2], ['dashatk', '*', 2], ['minibomb', 'L', 2], ['airshot1', '*', 2],
      ['recov10', 'E', 2], ['recov10', 'L', 1], ['recov30', '*', 1], ['barrier', 'E', 1], ['guard', '*', 2], ['atk10', '*', 3],
    ],
  },
  {
    key: 'elemental',
    name: 'ELEMENTAL',
    area: 3,
    pa: ['infernspread', 'tidalspread'],
    desc: 'Fire and Elec on J, Aqua and Wood on E: hit each virus with the element it fears.',
    chips: [
      ['heatshot', 'J', 1], ['heatv', 'J', 1], ['heatside', 'J', 1], ['bubbler', 'E', 1], ['bubv', 'E', 1], ['bublside', 'E', 1],
      ['plasma1', 'J', 2], ['zapring3', 'E', 1], ['boomer2', 'E', 2], ['boomer1', 'J', 1], ['snglbomb', 'J', 1], ['shockwave', 'J', 2],
      ['dashatk', 'J', 1], ['recov10', 'E', 1], ['recov30', '*', 2], ['recov80', 'J', 1], ['areagrab', 'E', 1], ['panlgrab', '*', 1],
      ['rockcube', 'E', 1], ['barrier', 'E', 1], ['guard', '*', 2], ['fire30', '*', 1], ['aqua30', '*', 1], ['wind', 'E', 1],
      ['atk10', '*', 1],
    ],
  },
  {
    key: 'blade',
    name: 'BLADE MASTER',
    area: 4,
    pa: ['lifesaber'],
    desc: 'L-code blades, and grabs to get them in reach.',
    chips: [
      ['sword', 'L', 4], ['widesword', 'L', 4], ['longsword', 'L', 3], ['shockwave', 'L', 2], ['areagrab', 'L', 2], ['panlgrab', 'L', 1],
      ['hammer', 'L', 2], ['minibomb', 'L', 2], ['barrier', 'L', 1], ['recov10', 'L', 1], ['recov30', '*', 2], ['recov50', '*', 1],
      ['invis', '*', 1], ['guard', '*', 1], ['atk10', '*', 3],
    ],
  },
  {
    key: 'demolition',
    name: 'DEMOLITION',
    area: 5,
    pa: ['megarat'],
    desc: 'F-code bombs and rats that wreck the enemy area.',
    chips: [
      ['ratton1', 'F', 2], ['ratton2', 'F', 2], ['ratton3', 'F', 2], ['cannball', 'F', 2], ['iceball', 'F', 2], ['blkbomb1', 'F', 2],
      ['snglbomb', 'F', 2], ['recov80', 'F', 1], ['mine', '*', 1], ['geddon1', '*', 1], ['dublbomb', '*', 1], ['minibomb', '*', 2],
      ['panlout1', '*', 2], ['rockcube', '*', 1], ['areagrab', '*', 1], ['recov30', '*', 2], ['recov50', '*', 1], ['guard', '*', 1],
      ['atk10', '*', 2],
    ],
  },
  {
    key: 'prism',
    name: 'PRISM EDGE',
    area: 6,
    pa: ['prismsaber'],
    desc: 'P-code elemental swords, with HeroSwrd and Pyreclaw as its Megas.',
    chips: [
      ['firesword', 'P', 2], ['aquasword', 'P', 2], ['elecsword', 'P', 2], ['bambsword', 'P', 2], ['herosword', 'P', 1], ['pyreclaw1', 'P', 1],
      ['stepsword', 'P', 2], ['stepcross', 'P', 1], ['spreader', 'P', 2], ['heatshot', 'P', 1], ['bubbler', 'P', 1], ['cannball', 'P', 1],
      ['hammer', 'P', 1], ['areagrab', '*', 2], ['invis', '*', 1], ['recov120', '*', 2], ['recov80', '*', 1], ['navi20', '*', 1],
      ['atk30', '*', 1], ['atk10', '*', 2], ['barrier', '*', 1],
    ],
  },
];

export const PRESET_BY_KEY = Object.fromEntries(PRESET_FOLDERS.map((f) => [f.key, f]));

// A [key, code, copies] list as 30 chip entries.
export function expandFolder(list) {
  const out = [];
  for (const [key, code, n] of list) for (let i = 0; i < n; i++) out.push({ key, code });
  return out;
}

// The codes a folder is built on, most common first (`*` last): what the folder menu shows.
export function folderCodes(chips) {
  const count = {};
  for (const c of chips) count[c.code] = (count[c.code] ?? 0) + 1;
  return Object.keys(count).sort((a, b) => (a === '*') - (b === '*') || count[b] - count[a] || a.localeCompare(b));
}
