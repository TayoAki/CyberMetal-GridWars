// The chip library. Damage, codes, MB, element and rarity are calibrated from BN3's chip table (rom = the
// BN3 chip ID each entry mirrors; see MODLOG.md). Standard chips keep generic names (Cannon, Sword...);
// the Navi chips summon this game's own characters. Every description is our own wording.
//
// kind: 'attack' (boostable by Atk+), 'support', 'boost' (merges into the chip before it), 'navi'
// klass: 'standard' | 'mega' | 'giga' | 'pa'

const F = 'fire';
const A = 'aqua';
const E = 'elec';
const W = 'wood';
const N = 'null';

const rows = [
  // key, name, element, damage, codes, mb, rarity, kind, behavior, params, desc, rom
  ['cannon', 'Cannon', N, 40, 'ABCDE*', 12, 1, 'attack', 'cannon', {}, 'Blasts the first enemy ahead.', 1],
  ['hicannon', 'HiCannon', N, 60, 'HIJKL*', 24, 2, 'attack', 'cannon', {}, 'A heavier cannon round.', 2],
  ['mcannon', 'M-Cannon', N, 80, 'OPQRS', 36, 3, 'attack', 'cannon', {}, 'Maximum-bore cannon round.', 3],
  ['airshot1', 'AirShot1', N, 20, '*', 4, 1, 'attack', 'airshot', {}, 'Air blast that knocks the target back.', 4],
  ['airshot2', 'AirShot2', N, 30, '*', 12, 2, 'attack', 'airshot', {}, 'Stronger air blast, knocks back.', 5],
  ['airshot3', 'AirShot3', N, 40, '*', 18, 2, 'attack', 'airshot', {}, 'Strongest air blast, knocks back.', 6],
  ['lavacan1', 'LavaCan1', F, 90, 'AGSTV', 34, 1, 'attack', 'lavacannon', {}, 'Molten round; leaves lava where it hits.', 7],
  ['lavacan2', 'LavaCan2', F, 120, 'BDFMO', 42, 2, 'attack', 'lavacannon', {}, 'Hotter molten round.', 8],
  ['lavacan3', 'LavaCan3', F, 150, 'EHJRW', 60, 3, 'attack', 'lavacannon', {}, 'Hottest molten round.', 9],

  ['shotgun', 'ShotGun', N, 30, 'BFJNT*', 8, 1, 'attack', 'gun', { splash: 'behind' }, 'Hit bursts into the panel behind.', 10],
  ['vgun', 'V-Gun', N, 30, 'DGLPV*', 8, 1, 'attack', 'gun', { splash: 'diag' }, 'Hit bursts diagonally behind.', 11],
  ['sidegun', 'SideGun', N, 30, 'CHMSY*', 8, 1, 'attack', 'gun', { splash: 'side' }, 'Hit bursts above and below.', 12],
  ['spreader', 'Spreader', N, 30, 'MNOPQ*', 16, 2, 'attack', 'gun', { splash: 'all' }, 'Hit bursts in every direction.', 13],
  ['bubbler', 'Bubbler', A, 60, 'ACDEP*', 14, 1, 'attack', 'gun', { splash: 'behind', fx: 'bubble' }, 'Bubble shot, pops behind.', 14],
  ['bubv', 'Bub-V', A, 60, 'DEFSV*', 22, 2, 'attack', 'gun', { splash: 'diag', fx: 'bubble' }, 'Bubble shot, pops diagonally.', 15],
  ['bublside', 'BublSide', A, 60, 'BEFGR*', 30, 3, 'attack', 'gun', { splash: 'side', fx: 'bubble' }, 'Bubble shot, pops above/below.', 16],
  ['heatshot', 'HeatShot', F, 40, 'BHIJP*', 16, 1, 'attack', 'gun', { splash: 'behind', fx: 'flame' }, 'Fire shot, flares behind.', 17],
  ['heatv', 'Heat-V', F, 40, 'FIJKV*', 24, 2, 'attack', 'gun', { splash: 'diag', fx: 'flame' }, 'Fire shot, flares diagonally.', 18],
  ['heatside', 'HeatSide', F, 40, 'CJKLT*', 32, 3, 'attack', 'gun', { splash: 'side', fx: 'flame' }, 'Fire shot, flares above/below.', 19],

  ['minibomb', 'MiniBomb', N, 50, 'BGLOS*', 6, 1, 'attack', 'bomb', { blast: 'single' }, 'Lob a bomb 3 panels ahead.', 20],
  ['snglbomb', 'SnglBomb', N, 50, 'DFHJT*', 12, 1, 'attack', 'bomb', { blast: 'plus' }, 'Big bomb, plus-shaped blast.', 21],
  ['dublbomb', 'DublBomb', N, 50, 'ACHKQ*', 24, 2, 'attack', 'bomb', { blast: 'plus', rows: [-1, 1] }, 'Two big bombs, above and below.', 22],
  ['trplbomb', 'TrplBomb', N, 50, 'EINPW', 36, 3, 'attack', 'bomb', { blast: 'plus', rows: [-1, 0, 1] }, 'Three big bombs down a column.', 23],
  ['cannball', 'CannBall', N, 160, 'ADFLP*', 33, 3, 'attack', 'bomb', { blast: 'single', breakPanel: true, fx: 'rock' }, 'Iron ball smashes the 3rd panel.', 24],
  ['iceball', 'IceBall', A, 120, 'FIMQS*', 18, 3, 'attack', 'bomb', { blast: 'single', panel: 'ice', fx: 'ice' }, 'Freezes the 3rd panel ahead.', 25],
  ['lavaball', 'LavaBall', F, 140, 'BCHNW*', 20, 3, 'attack', 'bomb', { blast: 'single', panel: 'lava', fx: 'flame' }, 'Melts the 3rd panel to lava.', 26],
  ['blkbomb1', 'BlkBomb1', F, 120, 'FLNPZ', 60, 2, 'attack', 'blackbomb', {}, 'Set a firebomb; any hit detonates it.', 27],
  ['blkbomb2', 'BlkBomb2', F, 170, 'DIKQS', 70, 3, 'attack', 'blackbomb', {}, 'Stronger firebomb.', 28],
  ['blkbomb3', 'BlkBomb3', F, 220, 'CGLUY', 80, 4, 'attack', 'blackbomb', {}, 'Strongest firebomb.', 29],

  ['sword', 'Sword', N, 80, 'EHLSY', 10, 1, 'attack', 'sword', { shape: 'sword' }, 'Cuts the panel in front.', 30],
  ['widesword', 'WideSwrd', N, 80, 'CELQY', 16, 2, 'attack', 'sword', { shape: 'wide' }, 'Cuts the column in front.', 31],
  ['longsword', 'LongSwrd', N, 80, 'EILRY', 24, 3, 'attack', 'sword', { shape: 'long' }, 'Cuts two panels ahead.', 32],
  ['firesword', 'FireSwrd', F, 130, 'FNPRU', 20, 3, 'attack', 'sword', { shape: 'wide' }, 'Blazing wide cut.', 33],
  ['aquasword', 'AquaSwrd', A, 150, 'AHNPT', 25, 3, 'attack', 'sword', { shape: 'wide' }, 'Tidal wide cut.', 34],
  ['elecsword', 'ElecSwrd', E, 130, 'EKNPV', 23, 3, 'attack', 'sword', { shape: 'wide' }, 'Charged wide cut.', 35],
  ['bambsword', 'BambSwrd', W, 140, 'BLNPW', 18, 3, 'attack', 'sword', { shape: 'wide' }, 'Bamboo wide cut.', 36],
  ['custsword', 'CustSwrd', N, 0, 'BFRVZ', 21, 3, 'attack', 'sword', { shape: 'long', gaugeDamage: 200 }, 'Power = how full the Custom Gauge is.', 37],
  ['varsword', 'VarSwrd', N, 160, 'BCDEF', 68, 4, 'attack', 'sword', { shape: 'big' }, 'A shifting blade: cuts a 2x3 block.', 38],
  ['stepsword', 'StepSwrd', N, 130, 'LMNOP', 43, 4, 'attack', 'stepsword', { shape: 'wide' }, 'Dash 2 panels, then a wide cut.', 39],
  ['stepcross', 'StepCros', N, 130, 'PQRST', 74, 4, 'attack', 'stepsword', { shape: 'cross' }, 'Dash 2 panels, then an X cut.', 40],
  ['airsword', 'AirSwrd', N, 100, 'CEHJR*', 30, 3, 'attack', 'sword', { shape: 'wide', push: 1 }, 'Wide cut whose wind knocks back.', 42],

  ['shockwave', 'ShockWav', N, 60, 'DHJLR', 10, 1, 'attack', 'shockwave', { speed: 7 }, 'Ground wave through every enemy in the row.', 44],
  ['sonicwave', 'SonicWav', N, 80, 'GIMSW', 26, 2, 'attack', 'shockwave', { speed: 5 }, 'Faster ground wave.', 45],
  ['dynawave', 'DynaWave', N, 100, 'ENQTV', 42, 3, 'attack', 'shockwave', { speed: 4 }, 'Fastest ground wave.', 46],
  ['bigwave', 'BigWave', N, 190, 'EJMPY', 82, 4, 'attack', 'shockwave', { speed: 5, crack: true }, 'Wave that cracks every panel it crosses.', 113],

  ['gutpunch', 'GutPunch', N, 80, 'BCDEF', 14, 1, 'attack', 'punch', { range: 1, push: 1 }, 'Point-blank punch that shoves.', 47],
  ['gutstrgt', 'GutStrgt', N, 100, 'OPQRS', 30, 2, 'attack', 'punch', { range: 2, push: 1 }, 'Rocket fist with 2-panel reach.', 48],
  ['gutimpct', 'GutImpct', N, 160, 'GHIJK', 50, 3, 'attack', 'punch', { range: 1, push: 1 }, 'Crushing point-blank punch.', 49],
  ['dashatk', 'DashAtk', N, 90, 'CDGJZ*', 11, 1, 'attack', 'dash', {}, 'Charge through the whole row and back.', 53],
  ['burner', 'Burner', F, 130, 'BFQSW', 15, 3, 'attack', 'burner', {}, 'Flames on all 8 panels around you.', 54],
  ['ratton1', 'Ratton1', N, 80, 'ACFHJ', 14, 1, 'attack', 'ratton', { speed: 6 }, 'Crawling bomb that turns once.', 58],
  ['ratton2', 'Ratton2', N, 100, 'ACFNO', 24, 2, 'attack', 'ratton', { speed: 5 }, 'Faster crawling bomb.', 59],
  ['ratton3', 'Ratton3', N, 120, 'ACFRS', 34, 3, 'attack', 'ratton', { speed: 4 }, 'Fastest crawling bomb.', 60],
  ['wave', 'Wave', A, 80, 'EILST', 60, 3, 'attack', 'wave', { panels: 3 }, 'A 3-panel tidal wave.', 61],
  ['redwave', 'RedWave', F, 90, 'BFJRU', 72, 3, 'attack', 'wave', { panels: 3, fx: 'lavawave' }, 'A 3-panel wave of lava.', 62],
  ['mudwave', 'MudWave', W, 100, 'DGMVZ', 84, 3, 'attack', 'wave', { panels: 3, fx: 'mudwave' }, 'A 3-panel wave of mud.', 63],
  ['hammer', 'Hammer', N, 100, 'BGLPT*', 16, 2, 'attack', 'hammer', {}, 'Smash the panel in front.', 64],
  ['tornado', 'Tornado', N, 20, 'CLRTU', 18, 2, 'attack', 'tornado', { hits: 8 }, '8-hit twister 2 panels ahead.', 65],
  ['zapring1', 'ZapRing1', E, 20, 'AMPQS*', 8, 1, 'attack', 'zapring', { stun: 90 }, 'Ring that paralyzes on contact.', 66],
  ['zapring2', 'ZapRing2', E, 40, 'BGNRW', 18, 2, 'attack', 'zapring', { stun: 90 }, 'Stronger paralyzing ring.', 67],
  ['zapring3', 'ZapRing3', E, 60, 'CEOTZ', 28, 3, 'attack', 'zapring', { stun: 90 }, 'Strongest paralyzing ring.', 68],
  ['yoyo1', 'Yo-Yo1', N, 40, 'CDEFG*', 72, 1, 'attack', 'yoyo', {}, 'Spinning disc out 3 panels and back.', 69],
  ['yoyo2', 'Yo-Yo2', N, 50, 'HIJKL', 80, 2, 'attack', 'yoyo', {}, 'Stronger spinning disc.', 70],
  ['yoyo3', 'Yo-Yo3', N, 60, 'MNOPQ', 88, 3, 'attack', 'yoyo', {}, 'Strongest spinning disc.', 71],
  ['lance', 'Lance', W, 130, 'DEHRZ', 46, 3, 'attack', 'lance', {}, 'Spears burst from the back line.', 75],
  ['boomer1', 'Boomer1', W, 60, 'FHJMT*', 15, 1, 'attack', 'boomer', {}, 'Boomerang loops the enemy area.', 84],
  ['boomer2', 'Boomer2', W, 80, 'EIKNV*', 22, 2, 'attack', 'boomer', {}, 'Stronger looping boomerang.', 85],
  ['boomer3', 'Boomer3', W, 100, 'LOPUZ', 30, 3, 'attack', 'boomer', {}, 'Strongest looping boomerang.', 86],
  ['rndmetr', 'RndmMetr', F, 100, 'EISVZ', 28, 3, 'attack', 'meteors', { count: 8 }, 'Meteors rain on the enemy area.', 87],
  ['icewave1', 'IceWave1', A, 80, 'AKMQW*', 14, 1, 'attack', 'icewave', {}, 'Two-row wave that freezes panels.', 90],
  ['icewave2', 'IceWave2', A, 100, 'DHLPR*', 22, 2, 'attack', 'icewave', {}, 'Stronger freezing wave.', 91],
  ['icewave3', 'IceWave3', A, 140, 'CDJRV', 30, 3, 'attack', 'icewave', {}, 'Strongest freezing wave.', 92],
  ['plasma1', 'Plasma1', E, 30, 'BDJRT', 14, 1, 'attack', 'plasma', { hits: 3 }, 'Arcs into the panel ahead, 3 hits.', 93],
  ['plasma2', 'Plasma2', E, 60, 'AGKMQ', 26, 2, 'attack', 'plasma', { hits: 3 }, 'Stronger arcing plasma.', 94],
  ['plasma3', 'Plasma3', E, 90, 'FINPS', 34, 3, 'attack', 'plasma', { hits: 3 }, 'Strongest arcing plasma.', 95],
  ['timebomb', 'TimeBomb', N, 150, 'JKLMN', 32, 3, 'attack', 'timebomb', { fuse: 180 }, 'Plant a timed bomb in the enemy area.', 99],
  ['mine', 'Mine', N, 300, 'ADLRS*', 16, 3, 'attack', 'mine', {}, 'Hide a mine on an enemy panel.', 100],
  ['geyser', 'Geyser', A, 200, 'BCLSW', 22, 4, 'attack', 'geyser', {}, 'Erupts 3 panels ahead.', 107],
  ['volcano', 'Volcano', F, 150, 'AGJYZ', 75, 4, 'attack', 'volcano', {}, 'Lava erupts under the enemy front line.', 114],
  ['burning', 'Burning', F, 150, 'AFLRS', 42, 4, 'attack', 'burning', {}, 'Cross of fire around the panel ahead.', 116],

  // Support
  ['guard', 'Guard', N, 40, '*', 5, 1, 'support', 'guard', { frames: 60 }, 'Shield that repels an attack.', 118],
  ['crsshld1', 'CrsShld1', N, 160, 'ACHLP*', 25, 1, 'support', 'guard', { frames: 60, bite: true }, 'Shield that bites back when struck.', 104],
  ['crsshld2', 'CrsShld2', N, 210, 'BCLST', 33, 2, 'support', 'guard', { frames: 60, bite: true }, 'Stronger biting shield.', 105],
  ['crsshld3', 'CrsShld3', N, 260, 'CELNR', 41, 3, 'support', 'guard', { frames: 60, bite: true }, 'Strongest biting shield.', 106],
  ['panlout1', 'PanlOut1', N, 10, 'ABDLS*', 4, 1, 'support', 'panelout', { width: 1 }, 'Knock out the panel in front.', 119],
  ['panlout3', 'PanlOut3', N, 10, 'CENRY*', 7, 1, 'support', 'panelout', { width: 3 }, 'Knock out the column in front.', 120],
  ['recov10', 'Recov10', N, 10, 'ACEGL*', 5, 1, 'support', 'recover', {}, 'Restore 10 HP.', 121],
  ['recov30', 'Recov30', N, 30, 'BDFHM*', 8, 1, 'support', 'recover', {}, 'Restore 30 HP.', 122],
  ['recov50', 'Recov50', N, 50, 'CEGIN*', 14, 2, 'support', 'recover', {}, 'Restore 50 HP.', 123],
  ['recov80', 'Recov80', N, 80, 'DFHJO*', 20, 2, 'support', 'recover', {}, 'Restore 80 HP.', 124],
  ['recov120', 'Recov120', N, 120, 'OQSUW*', 35, 3, 'support', 'recover', {}, 'Restore 120 HP.', 125],
  ['recov150', 'Recov150', N, 150, 'NPRTV*', 50, 3, 'support', 'recover', {}, 'Restore 150 HP.', 126],
  ['recov200', 'Recov200', N, 200, 'MNUVW', 65, 4, 'support', 'recover', {}, 'Restore 200 HP.', 127],
  ['recov300', 'Recov300', N, 300, 'ORVWZ', 80, 4, 'support', 'recover', {}, 'Restore 300 HP.', 128],
  ['panlgrab', 'PanlGrab', N, 10, 'AHLSY*', 10, 1, 'support', 'panelgrab', {}, 'Steal the nearest enemy panel in your row.', 129],
  ['areagrab', 'AreaGrab', N, 10, 'ELRSY*', 15, 2, 'support', 'areagrab', {}, "Steal the enemy's front column.", 130],
  ['geddon1', 'Geddon1', N, 0, 'DJMOS*', 10, 3, 'support', 'stage', { mode: 'crackall' }, 'Crack every panel.', 138],
  ['geddon2', 'Geddon2', N, 0, 'FHNOW', 50, 4, 'support', 'stage', { mode: 'breakall' }, 'Break every empty panel.', 139],
  ['geddon3', 'Geddon3', N, 0, 'CMUWY', 90, 4, 'support', 'stage', { mode: 'poisonall' }, 'Turn every panel to poison.', 140],
  ['rockcube', 'RockCube', N, 100, 'ACEHR*', 9, 1, 'support', 'rockcube', {}, 'Drop a rock in front of you.', 141],
  ['wind', 'Wind', N, 0, 'AEHOS*', 14, 1, 'support', 'wind', { dir: 1 }, 'Gust pushes every enemy back.', 143],
  ['fan', 'Fan', N, 0, 'AGLRT*', 14, 1, 'support', 'wind', { dir: -1 }, 'Vacuum pulls every enemy forward.', 144],
  ['slogauge', 'SloGauge', N, 0, 'ACRSZ*', 20, 3, 'support', 'gauge', { rate: 0.5 }, 'Custom Gauge fills at half speed.', 157],
  ['fstgauge', 'FstGauge', N, 0, 'BEJRY*', 40, 3, 'support', 'gauge', { rate: 2 }, 'Custom Gauge fills at double speed.', 158],
  ['repair', 'Repair', N, 0, 'ACDFS*', 8, 1, 'support', 'repair', {}, 'Restore your area to plain panels.', 159],
  ['invis', 'Invis', N, 0, 'BEFRS*', 11, 3, 'support', 'invis', { frames: 240 }, 'Turn invisible for a few seconds.', 160],
  ['airshoes', 'AirShoes', N, 0, 'HINUY*', 26, 3, 'support', 'airshoes', {}, 'Walk over holes for the rest of the battle.', 168],
  ['barrier', 'Barrier', N, 10, 'CELRS*', 7, 1, 'support', 'barrier', {}, 'Absorbs 10 damage.', 173],
  ['barr100', 'Barr100', N, 100, 'EJMRT*', 25, 2, 'support', 'barrier', {}, 'Absorbs 100 damage.', 174],
  ['barr200', 'Barr200', N, 200, 'EFHRU', 50, 3, 'support', 'barrier', {}, 'Absorbs 200 damage.', 175],
  ['aura', 'Aura', N, 100, 'FISUY', 55, 3, 'support', 'aura', {}, 'Repels any hit under 100.', 176],
  ['holypanl', 'HolyPanl', N, 0, 'EJLRU*', 14, 2, 'support', 'holypanel', {}, 'Bless your panel: damage halved.', 178],
  ['lavastage', 'LavaStge', N, 0, 'AERTY*', 22, 3, 'support', 'stage', { panel: 'lava' }, 'Every panel turns to lava.', 179],
  ['icestage', 'IceStage', N, 0, 'CGMQT*', 20, 3, 'support', 'stage', { panel: 'ice' }, 'Every panel freezes over.', 180],
  ['grassstage', 'GrassStg', N, 0, 'EJRWZ*', 10, 3, 'support', 'stage', { panel: 'grass' }, 'Every panel grows grass.', 181],
  ['sandstage', 'SandStge', N, 0, 'BCQUW*', 18, 3, 'support', 'stage', { panel: 'sand' }, 'Every panel turns to sand.', 182],
  ['metalstage', 'MetlStge', N, 0, 'DGMOS*', 26, 3, 'support', 'stage', { panel: 'metal' }, 'Every panel turns to metal.', 183],
  ['sanctuary', 'Snctuary', N, 0, 'ACELS', 54, 4, 'support', 'stage', { panel: 'holy', ownOnly: true }, 'Your whole area turns holy.', 184],

  // Boosts (merge into the chip selected just before)
  ['atk10', 'Atk+10', N, 10, '*', 4, 1, 'boost', 'boost', { boost: 'atk' }, '+10 to the attack chip before it.', 195],
  ['fire30', 'Fire+30', N, 30, '*', 20, 2, 'boost', 'boost', { boost: F }, '+30 to the Fire chip before it.', 196],
  ['aqua30', 'Aqua+30', N, 30, '*', 21, 2, 'boost', 'boost', { boost: A }, '+30 to the Aqua chip before it.', 197],
  ['elec30', 'Elec+30', N, 30, '*', 23, 2, 'boost', 'boost', { boost: E }, '+30 to the Elec chip before it.', 198],
  ['wood30', 'Wood+30', N, 30, '*', 26, 2, 'boost', 'boost', { boost: W }, '+30 to the Wood chip before it.', 199],
  ['navi20', 'Navi+20', N, 20, '*', 34, 2, 'boost', 'boost', { boost: 'navi' }, '+20 to the Navi chip before it.', 200],
  ['atk30', 'Atk+30', N, 30, '*', 50, 4, 'boost', 'boost', { boost: 'atk' }, '+30 to the attack chip before it.', 205],

  // Mega chips (one copy each in a folder)
  ['lifeaura', 'LifeAura', N, 200, 'D', 77, 4, 'support', 'aura', {}, 'Repels any hit under 200.', 201, 'mega'],
  ['muramasa', 'Muramasa', N, 0, 'M', 74, 5, 'attack', 'sword', { shape: 'wide', lostHpDamage: true }, 'Power = HP you have lost.', 202, 'mega'],
  ['herosword', 'HeroSwrd', N, 180, 'P', 65, 4, 'attack', 'sword', { shape: 'hero' }, 'Legendary blade, cuts 3 panels deep.', 207, 'mega'],
  ['fullcust', 'FullCust', N, 0, '*', 10, 3, 'support', 'fullcust', {}, 'Custom Gauge refills at once.', 211, 'mega'],

  // Navi chips: call in a GridWars character for one signature move (damage from BN3's Navi chip rows).
  ['voltframe1', 'Voltframe', E, 50, 'V', 39, 3, 'navi', 'navi_volt', {}, 'Voltframe flashes: all enemies stunned.', 232, 'mega'],
  ['voltframe2', 'VoltfrmV2', E, 70, 'V', 59, 4, 'navi', 'navi_volt', {}, 'Voltframe V2 flash.', 233, 'mega'],
  ['voltframe3', 'VoltfrmV3', E, 90, 'V', 69, 5, 'navi', 'navi_volt', {}, 'Voltframe V3 flash.', 234, 'mega'],
  ['feralis1', 'Feralis', N, 40, 'F', 38, 3, 'navi', 'navi_feral', {}, 'Feralis rakes 3 panels ahead.', 237, 'mega'],
  ['feralis2', 'FeralisV2', N, 50, 'F', 60, 4, 'navi', 'navi_feral', {}, 'Feralis V2 rake.', 238, 'mega'],
  ['feralis3', 'FeralisV3', N, 60, 'F', 68, 5, 'navi', 'navi_feral', {}, 'Feralis V3 rake.', 239, 'mega'],
  ['tidecaller1', 'Tidecalr', A, 20, 'T', 50, 3, 'navi', 'navi_tide', {}, 'Tidecaller fires a bubble barrage.', 242, 'mega'],
  ['tidecaller2', 'TidecalrV2', A, 20, 'T', 62, 4, 'navi', 'navi_tide', { shots: 10 }, 'Tidecaller V2 barrage.', 243, 'mega'],
  ['tidecaller3', 'TidecalrV3', A, 20, 'T', 74, 5, 'navi', 'navi_tide', { shots: 14 }, 'Tidecaller V3 barrage.', 244, 'mega'],
  ['pyreclaw1', 'Pyreclaw', F, 120, 'P', 32, 3, 'navi', 'navi_pyre', {}, 'Pyreclaw sets the front line ablaze.', 257, 'mega'],
  ['pyreclaw2', 'PyreclwV2', F, 150, 'P', 52, 4, 'navi', 'navi_pyre', {}, 'Pyreclaw V2 blaze.', 258, 'mega'],
  ['pyreclaw3', 'PyreclwV3', F, 180, 'P', 62, 5, 'navi', 'navi_pyre', {}, 'Pyreclaw V3 blaze.', 259, 'mega'],
  ['ironclad1', 'Ironclad', N, 100, 'I', 40, 3, 'navi', 'navi_iron', {}, 'Ironclad slams a fist on the nearest foe.', 267, 'mega'],
  ['ironclad2', 'IroncldV2', N, 130, 'I', 60, 4, 'navi', 'navi_iron', {}, 'Ironclad V2 slam.', 268, 'mega'],
  ['ironclad3', 'IroncldV3', N, 160, 'I', 70, 5, 'navi', 'navi_iron', {}, 'Ironclad V3 slam.', 269, 'mega'],
  ['sabre1', 'Sabre', N, 160, 'S', 68, 3, 'navi', 'navi_sabre', {}, 'Sabre dashes in and cuts the first foe.', 227, 'mega'],
  ['sabre2', 'SabreV2', N, 180, 'S', 76, 4, 'navi', 'navi_sabre', {}, 'Sabre V2 cut.', 228, 'mega'],
  ['sabre3', 'SabreV3', N, 200, 'S', 82, 5, 'navi', 'navi_sabre', {}, 'Sabre V3 cut.', 229, 'mega'],
  ['mender1', 'Mender', N, 20, 'M', 10, 3, 'navi', 'navi_mender', { heal: 40 }, 'Mender strikes a foe, then heals you.', 219, 'mega'],
  ['mender2', 'MenderV2', N, 30, 'M', 22, 4, 'navi', 'navi_mender', { heal: 60 }, 'Mender V2.', 220, 'mega'],
  ['mender3', 'MenderV3', N, 40, 'M', 34, 5, 'navi', 'navi_mender', { heal: 80 }, 'Mender V3.', 221, 'mega'],
  ['crusher1', 'Crusher', N, 50, 'C', 15, 3, 'navi', 'navi_crusher', {}, 'Crusher smashes the enemy front line.', 222, 'mega'],
  ['crusher2', 'CrusherV2', N, 70, 'C', 41, 4, 'navi', 'navi_crusher', {}, 'Crusher V2.', 223, 'mega'],
  ['crusher3', 'CrusherV3', N, 90, 'C', 57, 5, 'navi', 'navi_crusher', {}, 'Crusher V3.', 224, 'mega'],

  // Giga chip
  ['nullstorm', 'NullStorm', N, 90, 'X', 98, 5, 'navi', 'navi_null', {}, 'Null unleashes a storm on every enemy panel.', 306, 'giga'],
];

export const CHIPS = Object.create(null);
for (const [key, name, element, damage, codes, mb, rarity, kind, behavior, params, desc, rom, klass] of rows) {
  CHIPS[key] = Object.freeze({
    key,
    name,
    element,
    damage,
    codes,
    mb,
    rarity,
    kind,
    behavior,
    params: Object.freeze({ ...params }),
    desc,
    rom,
    klass: klass ?? 'standard',
  });
}

export function chipDef(key) {
  const d = CHIPS[key];
  if (!d) throw new Error(`unknown chip ${key}`);
  return d;
}

export function chipLabel(inst) {
  return `${chipDef(inst.key).name} ${inst.code}`;
}

export const CHIP_KEYS = Object.keys(CHIPS);
