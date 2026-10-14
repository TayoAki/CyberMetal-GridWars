// The Gauntlet: eight areas, each three designed virus battles and a boss duel. Formations put enemies
// on the blue side (columns 3-5). `field` rows use the Field layout codes ('.' normal, 'c' cracked,
// 'x' hole, 'g' grass, 'i' ice, 'l' lava, 'p' poison, 'h' holy, 's' sand, 'm' metal).
// `drops`: chips this battle can award ('key:code'); `rare` goes to S ranks.

const E = (type, level, col, row) => ({ type, level, col, row });

export const AREAS = [
  {
    id: 'boot',
    name: 'BOOT SECTOR',
    theme: 'boot',
    blurb: 'Where every operator starts. Mind the hardhats.',
    battles: [
      { id: 'boot1', name: 'Hardhat Patrol', enemies: [E('rivet', 1, 4, 1), E('rivet', 1, 5, 0)], drops: ['cannon:A', 'cannon:B', 'sword:L'], rare: ['shockwave:D'] },
      { id: 'boot2', name: 'Turret Line', enemies: [E('plinker', 1, 5, 0), E('plinker', 1, 5, 2), E('rivet', 1, 3, 1)], drops: ['airshot1:*', 'minibomb:B', 'shotgun:J'], rare: ['hicannon:H'] },
      { id: 'boot3', name: 'Glider Run', enemies: [E('dartfin', 1, 4, 0), E('dartfin', 1, 5, 2), E('rivet', 1, 3, 1)], drops: ['vgun:D', 'recov10:A', 'widesword:L'], rare: ['recov30:*'] },
    ],
    boss: { id: 'boss_volt', name: 'VOLTFRAME', enemies: [E('voltframe', 1, 4, 1)], reward: { chip: 'voltframe1:V', stat: 'hp' } },
  },
  {
    id: 'yards',
    name: 'SIGNAL YARDS',
    theme: 'yards',
    blurb: 'Relay towers crackle. Something hunts between them.',
    battles: [
      { id: 'yards1', name: 'Hot Trail', enemies: [E('emberhound', 1, 4, 1), E('rivet', 1, 5, 2)], drops: ['heatshot:B', 'sword:E', 'recov10:L'], rare: ['firesword:F'] },
      { id: 'yards2', name: 'Static Burrow', enemies: [E('volthare', 1, 4, 0), E('volthare', 1, 5, 2), E('plinker', 1, 5, 1)], drops: ['zapring1:A', 'barrier:E', 'shotgun:B'], rare: ['elecsword:E'] },
      { id: 'yards3', name: 'Scurry Line', enemies: [E('scurrier', 1, 4, 1), E('emberhound', 1, 5, 0), E('dartfin', 1, 3, 2)], drops: ['ratton1:A', 'minibomb:S', 'airshot2:*'], rare: ['ratton2:A'] },
    ],
    boss: { id: 'boss_feral', name: 'FERALIS', enemies: [E('feralis', 1, 4, 1)], reward: { chip: 'feralis1:F', stat: 'attack' } },
  },
  {
    id: 'coolant',
    name: 'COOLANT BAY',
    theme: 'coolant',
    blurb: 'Frozen pipes and slick floors. Watch your footing.',
    battles: [
      { id: 'cool1', name: 'Jelly Tide', field: ['......', '...i..', '.i....'], enemies: [E('gloop', 1, 4, 1), E('frostbit', 1, 5, 0)], drops: ['bubbler:A', 'iceball:F', 'recov30:B'], rare: ['aquasword:A'] },
      { id: 'cool2', name: 'Cold Shells', field: ['..i...', '......', '...i.i'], enemies: [E('mortarshell', 2, 5, 1), E('frostbit', 1, 4, 2)], drops: ['icewave1:A', 'guard:*', 'bubv:D'], rare: ['icestage:C'] },
      { id: 'cool3', name: 'Slush Drift', field: ['.i.i..', 'i.....', '...i..'], enemies: [E('gloop', 1, 4, 2), E('mortarshell', 1, 5, 0), E('volthare', 2, 4, 0)], drops: ['wave:E', 'panlgrab:A', 'bublside:B'], rare: ['wave:L'] },
    ],
    boss: { id: 'boss_tide', name: 'TIDECALLER', field: ['......', '......', '......'], enemies: [E('tidecaller', 1, 5, 1)], reward: { chip: 'tidecaller1:T', program: 'floatShoes' } },
  },
  {
    id: 'thermal',
    name: 'THERMAL CORE',
    theme: 'thermal',
    blurb: 'The heat sinks failed long ago. Only fire lives here.',
    battles: [
      { id: 'therm1', name: 'Ember Kites', field: ['....l.', 'l.....', '......'], enemies: [E('emberhound', 2, 4, 1), E('cinderkite', 1, 5, 0)], drops: ['lavacan1:A', 'heatv:F', 'recov50:C'], rare: ['lavaball:B'] },
      { id: 'therm2', name: 'Bomb Bay', enemies: [E('bombeetle', 1, 5, 1), E('mortarshell', 3, 5, 2), E('emberhound', 1, 3, 0)], drops: ['snglbomb:D', 'cannball:A', 'heatside:C'], rare: ['blkbomb1:F'] },
      { id: 'therm3', name: 'Heat Wave', field: ['.l....', '....l.', '..l...'], enemies: [E('cinderkite', 1, 4, 0), E('bombeetle', 2, 5, 2), E('gloop', 2, 4, 1)], drops: ['burner:F', 'dublbomb:A', 'fire30:*'], rare: ['volcano:A'] },
    ],
    boss: { id: 'boss_pyre', name: 'PYRECLAW', enemies: [E('pyreclaw', 1, 4, 1)], reward: { chip: 'pyreclaw1:P', stat: 'rapid' } },
  },
  {
    id: 'foundry',
    name: 'FOUNDRY',
    theme: 'foundry',
    blurb: 'Presses that never stop. Iron that never sleeps.',
    battles: [
      { id: 'found1', name: 'Rivet Crew', field: ['m.....', '......', '.....m'], enemies: [E('rivet', 2, 4, 0), E('rivet', 2, 4, 2), E('plinker', 2, 5, 1)], drops: ['hammer:B', 'hicannon:I', 'rockcube:*'], rare: ['mcannon:O'] },
      { id: 'found2', name: 'Watchtower', enemies: [E('watcher', 1, 5, 1), E('bombeetle', 2, 4, 0)], drops: ['gutpunch:B', 'barr100:E', 'trplbomb:E'], rare: ['gutimpct:G'] },
      { id: 'found3', name: 'Assembly Line', field: ['......', '.c..c.', '......'], enemies: [E('scurrier', 2, 4, 1), E('mortarshell', 1, 5, 0), E('dartfin', 2, 5, 2)], drops: ['dashatk:C', 'ratton2:A', 'atk10:*'], rare: ['bigwave:E'] },
    ],
    boss: { id: 'boss_iron', name: 'IRONCLAD', enemies: [E('ironclad', 1, 4, 1)], reward: { chip: 'ironclad1:I', program: 'superArmor' } },
  },
  {
    id: 'overgrowth',
    name: 'OVERGROWTH',
    theme: 'overgrowth',
    blurb: 'Rogue garden code swallowed this sector whole.',
    battles: [
      { id: 'grow1', name: 'Spore Field', field: ['gg..gg', '.g.gg.', 'g...g.'], enemies: [E('sporeling', 1, 4, 1), E('sporeling', 2, 5, 0)], drops: ['boomer1:F', 'lance:D', 'grassstage:E'], rare: ['wood30:*'] },
      { id: 'grow2', name: 'Root Watch', field: ['...gg.', 'g..ggg', '....g.'], enemies: [E('gloop', 3, 4, 1), E('watcher', 1, 5, 2)], drops: ['bambsword:B', 'boomer2:E', 'recov80:D'], rare: ['mudwave:D'] },
      { id: 'grow3', name: 'Thorn Run', field: ['g.g.g.', '.g.g.g', 'g.g.g.'], enemies: [E('sporeling', 2, 5, 1), E('volthare', 2, 4, 0), E('emberhound', 2, 4, 2)], drops: ['heatshot:P', 'firesword:N', 'aura:F'], rare: ['burning:A'] },
    ],
    boss: { id: 'boss_briar', name: 'BRIARIX', enemies: [E('briarix', 1, 4, 1)], reward: { chip: 'briarix1:B', stat: 'charge' } },
  },
  {
    id: 'rival',
    name: 'RIVAL GATE',
    theme: 'rival',
    blurb: 'A duelist waits at the gate. Prove you belong.',
    battles: [
      { id: 'riv1', name: 'Old Guard', enemies: [E('rivet', 3, 4, 1), E('plinker', 3, 5, 0), E('dartfin', 3, 5, 2)], drops: ['stepsword:L', 'longsword:E', 'recov120:O'], rare: ['varsword:B'] },
      { id: 'riv2', name: 'Cold Front', field: ['..i...', '......', '...i..'], enemies: [E('watcher', 2, 5, 1), E('cinderkite', 2, 4, 0), E('frostbit', 2, 4, 2)], drops: ['invis:*', 'geddon1:D', 'sonicwave:G'], rare: ['airshoes:*'] },
      { id: 'riv3', name: 'Hunt Pack', enemies: [E('emberhound', 3, 4, 1), E('volthare', 3, 5, 0), E('scurrier', 3, 5, 2)], drops: ['dynawave:E', 'tornado:C', 'barr200:E'], rare: ['herosword:P'] },
    ],
    boss: { id: 'boss_sabre', name: 'SABRE', enemies: [E('sabre', 1, 4, 1)], reward: { chip: 'sabre1:S', program: 'custom1' } },
  },
  {
    id: 'void',
    name: 'NULL ZONE',
    theme: 'void',
    blurb: 'The source of the corruption. ZeroDay waits.',
    battles: [
      { id: 'void1', name: 'Event Horizon', field: ['...x..', '..x...', '...x..'], enemies: [E('bombeetle', 3, 4, 1), E('mortarshell', 3, 5, 2), E('gloop', 4, 4, 0)], drops: ['recov150:N', 'geddon2:F', 'aqua30:*'], rare: ['recov200:M'] },
      { id: 'void2', name: 'Dead Signal', field: ['p.....', '......', '.....p'], enemies: [E('watcher', 3, 5, 1), E('cinderkite', 3, 4, 0), E('sporeling', 3, 4, 2)], drops: ['muramasa:M', 'elec30:*', 'zapring3:C'], rare: ['lifeaura:D'] },
      { id: 'void3', name: 'Omega Patrol', enemies: [E('rivet', 4, 4, 1), E('plinker', 3, 5, 0), E('dartfin', 3, 5, 2)], drops: ['atk30:*', 'navi20:*', 'fullcust:*'], rare: ['recov300:O'] },
    ],
    boss: { id: 'boss_zero', name: 'ZERODAY', final: true, enemies: [E('zeroday', 1, 4, 1)], reward: { chip: 'zerostorm:Z', program: 'custom2' } },
  },
];

// Flatten for lookups and free battle.
export const ENCOUNTERS = [];
for (const a of AREAS) {
  for (const b of a.battles) ENCOUNTERS.push({ ...b, area: a.id, theme: a.theme, boss: false });
  ENCOUNTERS.push({ ...a.boss, area: a.id, theme: a.theme, boss: true });
}

export function encounterById(id) {
  return ENCOUNTERS.find((e) => e.id === id) ?? null;
}

export function areaById(id) {
  return AREAS.find((a) => a.id === id) ?? null;
}

// Boss rematches in Free Battle: versions 1-4 (V1, V2, V3, Ω).
export function bossVersion(enc, version) {
  return { ...enc, id: `${enc.id}_v${version}`, enemies: enc.enemies.map((e) => ({ ...e, level: version })), version };
}

export const BOSS_CHIPS = {
  voltframe: ['voltframe1:V', 'voltframe2:V', 'voltframe3:V'],
  feralis: ['feralis1:F', 'feralis2:F', 'feralis3:F'],
  tidecaller: ['tidecaller1:T', 'tidecaller2:T', 'tidecaller3:T'],
  pyreclaw: ['pyreclaw1:P', 'pyreclaw2:P', 'pyreclaw3:P'],
  ironclad: ['ironclad1:I', 'ironclad2:I', 'ironclad3:I'],
  briarix: ['briarix1:B', 'briarix2:B', 'briarix3:B'],
  sabre: ['sabre1:S', 'sabre2:S', 'sabre3:S'],
  zeroday: ['zerostorm:Z', 'zerostorm:Z', 'zerostorm:Z'],
};
