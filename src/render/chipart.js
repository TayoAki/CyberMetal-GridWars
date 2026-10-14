// Chip art: the 14x14 icon used in the hand / HUD, the 56x48 picture on the Custom Screen, and the 9x9
// element icons. Every family (def.behavior, sometimes def.key) has its own pictogram and scene, tinted by
// def.element; Mega, Giga and Program Advance chips get their own frames. All drawn in code.
import { rect, frame, px, line, ellipse, disc, ring, poly, shade, mix, sprite } from './pixel.js';
import { drawText } from './font.js';
import { OUTLINE, ramp, withAlpha, sparkle, bolt, flameTongue, ellipseRing, crescent, streak } from './sprites/core_util.js';
import { PLAYER_SPRITE } from './sprites/core_player.js';
import { ROCKCUBE_SPRITE, BLACKBOMB_SPRITE, TIMEBOMB_SPRITE, DOOMBOMB_SPRITE, MENDER_SPRITE, CRUSHER_SPRITE, drawHeart } from './sprites/core_objects.js';
import { SPELL_SPRITES } from './sprites/core_spells.js';

// ---------------------------------------------------------------- palettes

const EL_BG = {
  null: ['#24305a', '#121a38', '#3a4a80'],
  fire: ['#5a2018', '#2a0c0a', '#8a3a20'],
  aqua: ['#163c6a', '#0a1a38', '#245a9a'],
  elec: ['#4a4214', '#211d08', '#6e6420'],
  wood: ['#1e4a24', '#0c220e', '#2e6a34'],
};

// Icon keys: w white, a b c element light/mid/dark, s t u steel, y o r fire, g G green, p P pink, n navy.
function iconPal(el) {
  const r = ramp(el);
  const base = el === 'null' || !el ? ['#ffffff', '#cfe8ff', '#7ab8ff', '#3a6ad0'] : r;
  return {
    w: '#ffffff',
    a: base[1],
    b: base[2],
    c: base[3],
    s: '#e2e8f4',
    t: '#9aa6c0',
    u: '#5a6482',
    y: '#ffd23f',
    o: '#ff8a2a',
    r: '#e0441e',
    g: '#7ae05a',
    G: '#2e9a3a',
    p: '#ff9ac8',
    P: '#e04a8a',
    n: '#2a3460',
    k: OUTLINE,
  };
}
const palCache = new Map();
function pal(el) {
  const key = el ?? 'null';
  let p = palCache.get(key);
  if (!p) {
    p = Object.freeze(iconPal(key));
    palCache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- 12x12 pictograms

const IC = {
  cannon: ['............', '............', '..sssssssst.', '.sswwsssstu.', '.ssssssstuu.', '.tttttttuuu.', '..uuu.......', '..aab.......', '.aabbc......', '.bbbcc......', '............', '............'],
  air: ['............', '...wwww.....', '..w....w....', '.w..aa..w...', '.w.a..a.w.ww', '.w.a.wa.w.w.', '.w..aa..w.w.', '..w....w..w.', '...wwww...w.', '.........w..', '............', '............'],
  gun: ['............', '.....y......', '....yyy.....', '.sssssyyw...', 'sswwssyy....', 'ssssssyw....', 'utttu.y.....', '.tu.........', '.tu.........', '.uu.........', '............', '............'],
  bomb: ['.........y..', '........y.y.', '.......o....', '......tu....', '....nnnnn...', '...nwwnnnn..', '..nwnnnnnnn.', '..nnnnnnnnn.', '..nnnnnnnnn.', '...nnnnnnn..', '....nnnnn...', '............'],
  steelball: ['............', '............', '....uuuu....', '...uwsttu...', '..uwssttttu.', '..usstttttu.', '..usttttuuu.', '..utttttuuu.', '...uttuuuu..', '....uuuu....', '............', '............'],
  ball: ['............', '............', '....cccc....', '...cwabbc...', '..cwaabbbc..', '..caabbbbc..', '..cabbbbcc..', '..cbbbbccc..', '...cbbccc...', '....cccc....', '............', '............'],
  blackbomb: ['.........y..', '........yoy.', '.......o....', '......tu....', '....nnnnn...', '...nwwnnnn..', '..nwnnynnnn.', '..nnnyoynnn.', '..nnyoroynn.', '...nnyyynn..', '....nnnnn...', '............'],
  sword: ['..........w.', '.........wa.', '........wa..', '.......wa...', '......wa....', '.....wa.....', '....wa......', '.y.wa.......', '..yy........', '..sy........', '.s..y.......', 's...........'],
  widesword: ['.......wwww.', '......waaab.', '.....waaabb.', '....waaabb..', '...waaabb...', '..waaabb....', '.y.wabb.....', '..yyb.......', '..sy........', '.s..y.......', 's...........', '............'],
  shock: ['............', '............', '..w.........', '..ww...w....', '..awa..ww...', '.aaaw.awa..w', '.aaaaaaawa.w', 'abbaaaabaaaw', 'bbbbbbbbbbba', 'cccccccccccc', '............', '............'],
  fist: ['............', '.....ssss...', '....swwsst..', '...swssssst.', '.aassssssst.', 'abassstststu', 'abassssssstu', '.aastststttu', '....ttttttu.', '.....uuuu...', '............', '............'],
  dash: ['............', '......aaa...', '.ww..aaaaa..', '....aaaaaaa.', 'www.aaaaaaaa', '....aaaaaaa.', '.ww..aaaaa..', '......aaa...', '............', '............', '............', '............'],
  flame: ['.....y......', '....yo......', '....yoo.y...', '...yooo.yo..', '..yooooyoo..', '..yowyoooo..', '.yowwyyooo..', '.yowwwwyoo..', '.yooywwyoo..', '..yooyyoo...', '...rooor....', '............'],
  rat: ['............', '............', '.....nnn..y.', '....nnnnn...', '...stttttpp.', '..sttttttttr', 'tsttttttttsw', 't.ttttttttt.', '...u.u..u.u.', '............', '............', '............'],
  wave: ['............', '......wwww..', '....waaaaww.', '...waabbbaw.', '..waabbbbbw.', '.waabbbbb...', '.aabbbbbb...', 'aabbbbbbbb..', 'abbbbbbbbbb.', 'bccccccccccb', '............', '............'],
  hammer: ['..ssssss....', '..swbbbbt...', '..sssssst...', '..tttttttt..', '.....ut.....', '.....ut.....', '.....ut.....', '.....ut.....', '.....ut.....', '.....uu.....', '....aaaa....', '............'],
  tornado: ['..wwwwwwww..', '...ssssss...', '..wwwwwww...', '...ssssss...', '....wwww....', '....ssss....', '.....www....', '.....ss.....', '......w.....', '......s.....', '............', '............'],
  ring: ['............', '....aaaa....', '...a....a...', '..a......a..', '..a..w...a..', '..a......aw.', '..a......a..', '...a....a...', '....aaaa....', '.w..........', '............', '............'],
  yoyo: ['............', 'w...........', '.w..........', '..w.........', '...w.ssss...', '....swwsst..', '...ssPPPss..', '...sPswsPs..', '...ssPPPst..', '....sstst...', '.....tttt...', '............'],
  lance: ['.....aw.....', '....aawg....', '....aawg....', '.....bg.....', '.....tt.....', '.....tu.....', '.....tu.....', '.....tu.....', '.....tu.....', '.....tu.....', '.....tu.....', '.....uu.....'],
  boomer: ['.g..........', 'gg..........', '.tt.........', '..tt........', '...tu.......', '....tt......', '...tt.......', '..tt........', '.tt.........', 'gg..........', '.g..........', '............'],
  meteor: ['r...........', '.ro.........', '..roo.......', '...ooy......', '....oyy.....', '.....yuuu...', '.....uttuu..', '.....uttsu..', '.....uutuu..', '......uuu...', '............', '............'],
  ice: ['............', '.....w......', '....wa......', '....wab.....', '.w..wab..w..', '.wa.wab.wa..', 'wab.wabwab..', 'wabwwabwab..', 'wabwaabwab..', 'aabaaabaab..', 'bbbbbbbbbbb.', '............'],
  bolt: ['......yyy...', '.....yyy....', '....yyy.....', '...yyyyy....', '.....yy.....', '....yy......', '...yyyyy....', '.....yy.....', '....yy......', '...yy.......', '..y.........', '............'],
  clock: ['...y....y...', '..yy.tt.yy..', '....tuut....', '...nnnnnn...', '..nwwwwwwn..', '.nwwwrwwwwn.', '.nwwwrwwwwn.', '.nwwwrrrwwn.', '.nwwwwwwwwn.', '..nwwwwwwn..', '...nnnnnn...', '............'],
  mine: ['............', '............', '............', '.....rr.....', '.....rr.....', '...ttttt....', '..tsssssst..', '.tssssssstu.', '.uttttttttu.', '..uuuuuuuu..', '............', '............'],
  geyser: ['...w.ww.w...', '..wwwwwwww..', '...waaaaw...', '....aabb....', '....aabb....', '....aabb....', '....aabb....', '....aabb....', '...aaabbb...', '..aabbbbbb..', '.cccccccccc.', '............'],
  volcano: ['....y.y.....', '...yoyoy....', '....yoy.....', '....rorr....', '...uuoruu...', '...utorruu..', '..uttuuuuu..', '..uttuuuuuu.', '.uttuuuuuuu.', '.uuuuuuuuuuu', '............', '............'],
  shield: ['...ssssss...', '..swwwwwwt..', '.swwaaaawwt.', '.swaabbbawt.', '.swabbbbbwt.', '.swabbbbbwt.', '.swaabbbbwt.', '..swaabbwt..', '...swabwt...', '....swwt....', '.....tt.....', '............'],
  panelout: ['............', '............', '..aaaaaaaa..', '.aab.bbbba..', '.ab.bb.bbb..', 'aab.b.bbbb..', 'abbb.bb.bb..', 'cccc.cc.ccc.', 'cccc....cc..', '...u.u..u...', '..u...u..u..', '............'],
  heart: ['............', '..PPP..PPP..', '.PwppPPpppP.', '.PwpppppppP.', '.PppppppppP.', '.PppppppppP.', '..PppppppP..', '...PpppppP..', '....PpppP...', '.....PpP....', '......P.....', '............'],
  grab: ['....yy......', '....yy......', '....yy......', '..yyyyyy....', '...yyyy.....', '....yy......', '............', '.rrrrrrrrrr.', 'roooooooooor', 'rrrrrrrrrrrr', '.uuuuuuuuuu.', '............'],
  panel: ['............', '............', '.aaaaaaaaaa.', 'awwaaaaaaab.', 'awaaaaaaaab.', 'abbbbbbbbbb.', 'cccccccccc..', '............', '............', '............', '............', '............'],
  rock: ['............', '....ssssss..', '...swwssstt.', '..sssssstutt', '..ttttttttuu', '..taattattuu', '..tttatttuu.', '..ttaaattu..', '..tttttttu..', '..uuuuuuu...', '............', '............'],
  wind: ['............', 'wwwwww......', '......ww....', '..wwwwwwwww.', '.........ww.', 'aaaaaaaaa.w.', '........w...', '.wwwwwwww...', '............', '............', '............', '............'],
  gauge: ['............', '............', '............', 'tttttttttttt', 'taaaaaaa...t', 'tawwwwwa...t', 'taaaaaaa...t', 'tttttttttttt', '............', '............', '............', '............'],
  wrench: ['.........ss.', '........st..', '.......sts..', '......sttss.', '.....stt.ss.', '....stt.....', '...stt......', '..stt.......', '.stt........', 'stt.........', 'tt..........', '............'],
  ghost: ['....aaaa....', '...awwwwa...', '..awwwwwwa..', '..awkwwkwa..', '..awwwwwwa..', '..awwwwwwa..', '..awwwwwwa..', '..awwwwwwa..', '..awawawawa.', '..a.a..a.a..', '............', '............'],
  shoes: ['.w..........', 'ww.ww.......', '.wwwww......', '..www.......', '....ssss....', '....swws....', '....sssst...', '....sssssst.', '...tttttttt.', '...uuuuuuuu.', '............', '............'],
  bubble: ['....aaaa....', '..aa....aa..', '.a..ww....a.', '.a.w......a.', 'a..w.......a', 'a..........a', 'a..........a', 'a..........a', '.a........a.', '.a........a.', '..aa....aa..', '....aaaa....'],
  aura: ['....p..p....', '..p......p..', '.p..PPPP..p.', '...P....P...', 'p.P......P.p', '..P......P..', '..P......P..', 'p.P......P.p', '...P....P...', '.p..PPPP..p.', '..p......p..', '....p..p....'],
  holy: ['............', '.....yy.....', '.....yy.....', '...yyyyyy...', '.....yy.....', '..wwwyywww..', '.wyyyyyyyyw.', 'wyyyyyyyyyyw', 'tttttttttttt', '............', '............', '............'],
  plus: ['............', '....aaaa....', '....awwa....', '....awwa....', '.aaaawwaaaa.', '.awwwwwwwwa.', '.awwwwwwwwa.', '.aaaawwaaaa.', '....awwa....', '....awwa....', '....aaaa....', '............'],
  star: ['.....y......', '.....y......', '....yyy.....', 'yyyyywyyyyy.', '.yyywwwyyy..', '..yywwwyy...', '...yyyyy....', '...yy.yy....', '..yy...yy...', '..y.....y...', '............', '............'],
  rushfist: ['............', '..w...ssss..', '.....swwsst.', '.w..swssssst', '..aassssssst', 'abassstststu', 'w.abassssstu', '..aastststtu', '.....tttttu.', '.w....uuuu..', '............', '............'],
  cross: ['w.........w.', '.wa......wa.', '..wa....wa..', '...wa..wa...', '....wawa....', '.....wa.....', '....wawa....', '...wa..wa...', '..wa....wa..', '.y......y...', 'y........y..', '............'],
};

// Navi faces (12x12), coloured per navi.
const FACE = {
  voltframe: { rows: ['....yy......', '...yGGy.....', '..AAAAAAA...', '.ABBBBBBBC..', '.ABJJJJJBC..', '.ABJIIJJBC..', '.ABJJJJJBC..', '.ABBBBBBBC..', '..CCyyyCC...', '...LKKKL....', '..LKKKKKL...', '............'], pal: { A: '#c2c8da', B: '#8e94aa', C: '#41445a', G: '#ffe23a', y: '#ffe23a', I: '#ffffff', J: '#fff3a8', K: '#f6f7fb', L: '#c6cad8' } },
  feralis: { rows: ['.G.......G..', '.GG.....GG..', '.GAAAAAAAG..', 'GABBBBBBBAG.', '.ABJBBBJBA..', '.ABBBBBBBA..', '..ABBBBBA...', '..ACMCMCA...', '...AKKKA....', '....AAA.....', '............', '............'], pal: { A: '#c6ccd6', B: '#8e96a6', C: '#3c4150', G: '#3ae88a', J: '#6affb0', K: '#ffffff', M: '#7a8496' } },
  tidecaller: { rows: ['....AAAA....', '..AABBBBAA..', '.ABBIIIIBBA.', '.ABIJJJJIBA.', '.ABIJGGJIBA.', '.ABIJJJJIBA.', '.ABBIIIIBBA.', '..AABBBBAA..', '..KKLLLLKK..', '.KKLLLLLLKK.', '............', '............'], pal: { A: '#fff2b0', B: '#f0c050', I: '#9af0ff', J: '#0e3a5a', G: '#4ad8ff', K: '#4a6ad8', L: '#2c46a8' } },
  pyreclaw: { rows: ['..G..G..G...', '..GHGGHGG...', '..AAAAAAA...', '.ABBBBBBBA..', '.ABJJBJJBA..', '.ABBBBBBBA..', '.ABCIIICBA..', '..ACIJICA...', '..AAAAAAA...', '...NN.NN....', '............', '............'], pal: { A: '#a8a8b8', B: '#767688', C: '#323240', G: '#ffa020', H: '#e04010', I: '#ffe070', J: '#ff8a1a', N: '#ee4a2e' } },
  ironclad: { rows: ['...kkkkkk...', '..aaaaaaaa..', '.abbbbbbbbc.', '.abxxxxxxbc.', '.abxggxggbc.', '.abxxxxxxbc.', '.abbbrbbbbc.', '..cbbbbbbc..', '.kkkddddkkk.', 'kllldddddlll', '............', '............'], pal: { a: '#cfd6df', b: '#9ea9b7', c: '#4b5360', d: '#2f353f', k: '#f2c45c', l: '#c48f33', x: '#1a1e27', g: '#ffb53c', r: '#f0f3f8' } },
  sabre: { rows: ['.....kk.....', '...kbbbbk...', '..bbbbbbbb..', '.bbffffffbb.', '.bfoffffofb.', '.bffffffffb.', '..bbffffbb..', '...cbbbbc...', '..kkkcckkk..', '.bbbbccbbbb.', '............', '............'], pal: { b: '#f0465a', c: '#b8243e', f: '#12162a', o: '#ffe56a', k: '#ffe08a' } },
  mender: { rows: ['....aaab....', '..aWWaaabb..', '.aWaaaaaabb.', 'PaaaaaaaaabP', 'Paassssssab.', 'PaasessesabP', 'QaasssPssab.', '.aassssssab.', '..bbbbbbbb..', '...ccccc....', '............', '............'], pal: { W: '#ffffff', a: '#eef3fb', b: '#c6d2e8', c: '#93a2c2', P: '#ff74ae', Q: '#d23f80', s: '#1c2244', e: '#8affc8' } },
  crusher: { rows: ['....aaab....', '..aWaaaabc..', '.aWaaaaaabc.', '.ahhbbbhhcc.', 'cbbbbbbbbbcd', '.xxxxxxxxxz.', '.xxrRxxrRxz.', '.xxxxxxxxxz.', '..zxxxxxzz..', '.mmmmmmmmmn.', 'mnnnnnnnnnoo', '............'], pal: { W: '#fff8d8', a: '#ffe27a', b: '#ffc23a', c: '#e08a1a', d: '#a85a10', h: '#262a38', x: '#3a3e50', z: '#575d74', r: '#ff8a2a', R: '#ffd07a', m: '#c8d0e0', n: '#98a2b8', o: '#69728a' } },
  briarix: { rows: ['..m..q.m....', '.mnmqqqmnm..', '.nmmqqqmmn..', '..aaaaaaa...', '.abbbbbbbc..', '.abvvvvvbc..', '.abvyvyvbc..', '.abbbbbbbc..', '..cbbbbbc...', '.effffffff..', 'effffffffgg.', '............'], pal: { a: '#e0b07a', b: '#ae7640', c: '#7c4a24', e: '#4a7a8a', f: '#2c5466', g: '#1a3746', m: '#7cc845', n: '#3a8a34', q: '#ff6a9a', v: '#f6ffa8', y: '#1c140c' } },
  zeroday: { rows: ['...aaaaaa...', '..abbbbbba..', '.abccccccba.', '.abcxxxxcba.', '.abcxrxrxcba', '.abcxxxxcba.', '.abccogccba.', '..abccccba..', '.aabbbbbbaa.', 'aabbbbbbbbaa', '............', '............'], pal: { a: '#4a4a72', b: '#30304e', c: '#20203a', x: '#05050c', r: '#ff4060', o: '#f0ffff', g: '#6af0ff' } },
};
const NAVI_OF = {
  navi_volt: 'voltframe',
  navi_feral: 'feralis',
  navi_tide: 'tidecaller',
  navi_pyre: 'pyreclaw',
  navi_iron: 'ironclad',
  navi_sabre: 'sabre',
  navi_mender: 'mender',
  navi_crusher: 'crusher',
  navi_briar: 'briarix',
  navi_zeroday: 'zeroday',
};
const facePalCache = new Map();
function facePal(name) {
  let p = facePalCache.get(name);
  if (!p) {
    p = Object.freeze({ ...FACE[name].pal });
    facePalCache.set(name, p);
  }
  return p;
}

// Which pictogram a chip uses.
function iconKind(def) {
  const b = def.behavior;
  const k = def.key;
  switch (b) {
    case 'cannon':
    case 'lavacannon':
    case 'pa_cannonade':
      return 'cannon';
    case 'airshot':
      return 'air';
    case 'gun':
    case 'pa_bigspread':
    case 'pa_supernova':
      return 'gun';
    case 'bomb':
      return def.params?.fx === 'rock' ? 'steelball' : def.params?.fx ? 'ball' : 'bomb';
    case 'blackbomb':
      return 'blackbomb';
    case 'sword':
      return def.params?.shape === 'wide' || def.params?.shape === 'big' ? 'widesword' : 'sword';
    case 'pa_lifesaber':
    case 'pa_prismsaber':
      return 'widesword';
    case 'stepsword':
    case 'pa_stepcombo':
      return def.params?.shape === 'cross' ? 'cross' : 'widesword';
    case 'shockwave':
      return 'shock';
    case 'punch':
      return 'fist';
    case 'pa_rushpunch':
      return 'rushfist';
    case 'dash':
      return 'dash';
    case 'burner':
    case 'burning':
      return 'flame';
    case 'ratton':
    case 'pa_megarat':
      return 'rat';
    case 'wave':
      return 'wave';
    case 'hammer':
      return 'hammer';
    case 'tornado':
      return 'tornado';
    case 'zapring':
      return 'ring';
    case 'yoyo':
    case 'pa_yoyostorm':
      return 'yoyo';
    case 'lance':
      return 'lance';
    case 'boomer':
      return 'boomer';
    case 'meteors':
      return 'meteor';
    case 'icewave':
      return 'ice';
    case 'plasma':
      return 'bolt';
    case 'timebomb':
    case 'pa_doombomb':
      return 'clock';
    case 'mine':
      return 'mine';
    case 'geyser':
      return 'geyser';
    case 'volcano':
      return 'volcano';
    case 'guard':
      return 'shield';
    case 'panelout':
      return 'panelout';
    case 'recover':
      return 'heart';
    case 'panelgrab':
    case 'areagrab':
      return 'grab';
    case 'stage':
    case 'holypanel':
      return k === 'holypanl' || def.params?.panel === 'holy' ? 'holy' : 'panel';
    case 'rockcube':
      return 'rock';
    case 'wind':
      return 'wind';
    case 'gauge':
    case 'fullcust':
      return 'gauge';
    case 'repair':
      return 'wrench';
    case 'invis':
      return 'ghost';
    case 'airshoes':
      return 'shoes';
    case 'barrier':
      return 'bubble';
    case 'aura':
      return 'aura';
    case 'boost':
      return 'plus';
    default:
      if (NAVI_OF[b]) return 'face';
      return 'star';
  }
}

// Icon tint: stage chips take the panel's colour, boosts their boost element, the rest their element.
const PANEL_TINT = {
  lava: 'fire',
  ice: 'aqua',
  grass: 'wood',
  sand: 'elec',
  metal: 'null',
  holy: 'elec',
};
function iconElement(def) {
  if (def.behavior === 'stage') return def.params?.panel ? (PANEL_TINT[def.params.panel] ?? 'null') : def.params?.mode === 'poisonall' ? 'wood' : 'null';
  if (def.behavior === 'boost') {
    const b = def.params?.boost;
    return ['fire', 'aqua', 'elec', 'wood'].includes(b) ? b : 'null';
  }
  return def.element ?? 'null';
}

const ICON_BG = {
  null: ['#2a3866', '#141c3c'],
  fire: ['#6a2a1c', '#2e0e0a'],
  aqua: ['#1c4a80', '#0a1a3c'],
  elec: ['#5a5018', '#241e08'],
  wood: ['#245a2a', '#0c2610'],
};

export function drawChipIcon(ctx, def, x, y) {
  if (!def) {
    rect(ctx, x, y, 14, 14, '#1a2040');
    return;
  }
  const el = iconElement(def);
  const [hi, lo] = ICON_BG[el] ?? ICON_BG.null;
  rect(ctx, x, y, 14, 14, lo);
  rect(ctx, x, y, 14, 7, mix(lo, hi, 0.6));
  rect(ctx, x, y, 14, 1, hi);
  rect(ctx, x, y, 1, 14, hi);
  const kind = iconKind(def);
  if (kind === 'face') {
    const name = NAVI_OF[def.behavior];
    sprite(ctx, FACE[name].rows, facePal(name), x + 1, y + 1, { outline: OUTLINE });
  } else {
    sprite(ctx, IC[kind] ?? IC.star, pal(el), x + 1, y + 1, { outline: OUTLINE });
  }
  // Class marks: a gold corner for PAs, blue for Mega, red for Giga.
  const mark = def.klass === 'pa' ? '#ffd23f' : def.klass === 'mega' ? '#5ad8ff' : def.klass === 'giga' ? '#ff4a8a' : null;
  if (mark) {
    rect(ctx, x + 11, y, 3, 1, mark);
    rect(ctx, x + 13, y, 1, 3, mark);
    px(ctx, x + 12, y + 1, mark);
  }
}

// ---------------------------------------------------------------- 9x9 element icons

const ELEMENT_ICONS = {
  null: { rows: ['...aaa...', '..awwwa..', '.awwbbwa.', 'awwbbbbwa', 'awbbbbbca', 'awbbbbbca', '.abbbcca.', '..accca..', '...aaa...'], pal: { a: '#3a4466', w: '#ffffff', b: '#c8d0e4', c: '#8a94b0' } },
  fire: { rows: ['....r....', '...ror...', '..roor.r.', '..rooorr.', '.rooyoor.', '.royyyor.', '.royywor.', '..royyr..', '...rrr...'], pal: { r: '#c42e18', o: '#ff7a1f', y: '#ffd23f', w: '#fff6c8' } },
  aqua: { rows: ['....b....', '...bab...', '...bab...', '..baaab..', '.bawaaab.', '.bwaaaab.', '.baaaacb.', '..bacab..', '...bbb...'], pal: { b: '#1f4fc0', a: '#5ab4ff', w: '#e8fbff', c: '#3a7ae0' } },
  elec: { rows: ['....ooo..', '...oyyo..', '..oyyo...', '.oyyyooo.', '.ooyywyo.', '...oyyo..', '..oyyo...', '..oyo....', '..oo.....'], pal: { o: '#a86a08', y: '#ffe23a', w: '#ffffff' } },
  wood: { rows: ['......gg.', '....ggag.', '...gaaag.', '..gaawag.', '.gaawaag.', '.gawaag..', '.gwaag...', '.dgg.....', 'd........'], pal: { g: '#1c742a', a: '#5fd23a', w: '#c8ff9a', d: '#7a4a24' } },
};

export function drawElementIcon(ctx, element, x, y) {
  const ic = ELEMENT_ICONS[element] ?? ELEMENT_ICONS.null;
  sprite(ctx, ic.rows, ic.pal, x, y);
}

// ---------------------------------------------------------------- 56x48 art

const AW = 56;
const AH = 48;

function artBackground(ctx, x, y, el, t) {
  const [mid, dark, light] = EL_BG[el] ?? EL_BG.null;
  for (let i = 0; i < 8; i++) rect(ctx, x, y + i * 6, AW, 6, mix(light, dark, i / 7));
  // Faint data grid with a slow scrolling glint.
  for (let gx = 4; gx < AW; gx += 8) rect(ctx, x + gx, y, 1, AH, shade(mid, -0.15));
  for (let gy = 4; gy < AH; gy += 8) rect(ctx, x, y + gy, AW, 1, shade(mid, -0.15));
  const glint = Math.floor((t ?? 0) / 3) % (AW + 40);
  if (glint < AW) rect(ctx, x + glint, y, 1, AH, shade(light, 0.15));
}

// A strip of small field panels in the art (front view), owned by red or blue.
function miniPanels(ctx, x, y, n, team = 'blue', w = 18, types = []) {
  const top = team === 'red' ? ['#e05454', '#ee7070', '#9a2626', '#4a0c10'] : ['#5272e4', '#7090f0', '#26369a', '#0c1450'];
  for (let i = 0; i < n; i++) {
    const px0 = x + i * w;
    const ty = types[i];
    rect(ctx, px0, y, w, 10, top[3]);
    if (ty === 'broken') {
      rect(ctx, px0 + 1, y + 1, w - 2, 6, '#06070d');
      continue;
    }
    const col = ty === 'lava' ? ['#e2541a', '#ff8a2a'] : ty === 'ice' ? ['#9adcf8', '#c4f0ff'] : ty === 'grass' ? ['#3e9e3a', '#56b84a'] : ty === 'sand' ? ['#d2b06e', '#e4c88a'] : ty === 'metal' ? ['#8a94a6', '#a8b2c4'] : ty === 'holy' ? ['#f2e2a0', '#fff8d8'] : ty === 'poison' ? ['#7a3aa6', '#9a56c8'] : [top[0], top[1]];
    rect(ctx, px0 + 1, y + 1, w - 2, 6, col[0]);
    rect(ctx, px0 + 3, y + 2, w - 6, 4, col[1]);
    rect(ctx, px0 + 1, y + 7, w - 2, 2, top[2]);
    if (ty === 'cracked') {
      line(ctx, px0 + 4, y + 2, px0 + 8, y + 5, '#1a0a10');
      line(ctx, px0 + 8, y + 5, px0 + 13, y + 3, '#1a0a10');
    }
  }
}

// 3x3 target diagram: which cells a chip hits. cells: [[dc, dr]] relative to the centre, plus 'hit' colour.
function hitGrid(ctx, x, y, cells, color, s = 6) {
  for (let r = -1; r <= 1; r++) {
    for (let c = -1; c <= 1; c++) {
      const on = cells.some(([dc, dr]) => dc === c && dr === r);
      const px0 = x + (c + 1) * (s + 1);
      const py0 = y + (r + 1) * (s + 1);
      rect(ctx, px0, py0, s, s, on ? color : '#26306a');
      if (on) rect(ctx, px0, py0, s, 1, '#ffffff');
    }
  }
}

function klassFrame(ctx, x, y, def, t) {
  const k = def.klass;
  if (k === 'pa') {
    const cols = ['#ffd23f', '#ff7a1f', '#ff4a8a', '#a86aff', '#3ac8ff', '#5fe39a'];
    frame(ctx, x, y, AW, AH, '#ffd23f');
    frame(ctx, x + 1, y + 1, AW - 2, AH - 2, '#8a5a10');
    for (let i = 0; i < 4; i++) {
      const c = cols[(i + Math.floor((t ?? 0) / 6)) % cols.length];
      const cx = i % 2 ? x + AW - 3 : x + 2;
      const cy = i > 1 ? y + AH - 3 : y + 2;
      rect(ctx, cx - 1, cy - 1, 3, 3, OUTLINE);
      px(ctx, cx, cy, c);
    }
    drawText(ctx, 'PA', x + AW - 13, y + AH - 9, '#ffd23f', { mini: true, outline: OUTLINE });
  } else if (k === 'mega') {
    frame(ctx, x, y, AW, AH, '#5ad8ff');
    frame(ctx, x + 1, y + 1, AW - 2, AH - 2, '#1a5a8a');
    for (const [cx, cy] of [[x + 2, y + 2], [x + AW - 3, y + 2], [x + 2, y + AH - 3], [x + AW - 3, y + AH - 3]]) px(ctx, cx, cy, '#bff4ff');
  } else if (k === 'giga') {
    const p = Math.floor((t ?? 0) / 8) % 2;
    frame(ctx, x, y, AW, AH, p ? '#ff4a8a' : '#ff8ab8');
    frame(ctx, x + 1, y + 1, AW - 2, AH - 2, '#6a0a3a');
    frame(ctx, x + 2, y + 2, AW - 4, AH - 4, '#a01a5a');
  } else {
    frame(ctx, x, y, AW, AH, '#0c0f1c');
    rect(ctx, x + 1, y + 1, AW - 2, 1, 'rgba(255,255,255,0.18)');
  }
}

// Draws an entity sprite into the art at feet point (fx, fy).
function ent(ctx, sprite0, type, fx, fy, t, extra = {}) {
  sprite0.draw(ctx, { type, anim: 'idle', animT: 20, facing: 1, level: 1, team: 'red', element: 'null', data: {}, hp: 100, maxHp: 100, alive: true, ...extra }, fx, fy, t);
}

function spell(ctx, type, fx, fy, t, extra = {}) {
  SPELL_SPRITES[type]?.draw(ctx, { type, t, x: 0, y: 0, z: 0, dir: 1, team: 'red', data: {}, element: 'null', ...extra }, fx, fy, t);
}

function sword(ctx, x0, y0, len, w, cols, guard = '#ffd23f', ang = -0.75) {
  // Diagonal blade from the hilt at (x0, y0) toward the upper right.
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const tx = x0 + ca * len;
  const ty = y0 + sa * len;
  const nx = -sa;
  const ny = ca;
  poly(ctx, [[x0 + nx * (w + 1), y0 + ny * (w + 1)], [tx + nx, ty + ny], [tx + ca * 2, ty + sa * 2], [tx - nx, ty - ny], [x0 - nx * (w + 1), y0 - ny * (w + 1)]], OUTLINE);
  poly(ctx, [[x0 + nx * w, y0 + ny * w], [tx, ty], [x0 - nx * w, y0 - ny * w]], cols[2]);
  poly(ctx, [[x0 + nx * w * 0.5, y0 + ny * w * 0.5], [tx, ty], [x0, y0]], cols[1]);
  line(ctx, x0 + nx * 0.5, y0 + ny * 0.5, tx - ca * 2, ty - sa * 2, cols[0]);
  // Guard and grip.
  streak(ctx, x0 + nx * 6, y0 + ny * 6, x0 - nx * 6, y0 - ny * 6, 1.6, guard);
  streak(ctx, x0, y0, x0 - ca * 8, y0 - sa * 8, 1.6, '#5a3a2a');
  disc(ctx, x0 - ca * 9, y0 - sa * 9, 2, guard);
}

// Per-family scenes. Each draws inside the 56x48 box at (x, y).
function scene(ctx, def, x, y, t) {
  const el = def.element ?? 'null';
  const R = ramp(el);
  const b = def.behavior;
  const cx = x + AW / 2;
  const k = def.key;
  switch (b) {
    case 'cannon':
    case 'lavacannon':
    case 'pa_cannonade': {
      const tier = k === 'hicannon' || k === 'lavacan2' || k === 'cannonade2' ? 1 : k === 'mcannon' || k === 'lavacan3' || k === 'cannonade3' ? 2 : 0;
      const n = b === 'pa_cannonade' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const ox = x + 6 + (n > 1 ? (i - 1) * 4 : 0);
        const oy = y + 18 + (n > 1 ? (i - 1) * 9 : 0);
        drawCannonArt(ctx, ox, oy, tier, b === 'lavacannon', t + i * 5);
      }
      break;
    }
    case 'airshot': {
      drawCannonArt(ctx, x + 2, y + 18, 0, false, t, true);
      for (let i = 0; i < 3; i++) {
        const rx = x + 36 + i * 6 - ((t >> 2) % 6);
        ellipseRing(ctx, rx, y + 24, 2 + i, 6 + i * 2, '#ffffff');
      }
      break;
    }
    case 'gun':
    case 'pa_bigspread':
    case 'pa_supernova': {
      drawGun(ctx, x + 6, y + 20, el);
      const splash = { behind: [[0, 0], [1, 0]], diag: [[0, 0], [1, -1], [1, 1]], side: [[0, 0], [0, -1], [0, 1]], all: [[0, 0], [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] };
      const pat = b === 'gun' ? splash[def.params?.splash] ?? [[0, 0]] : splash.all;
      hitGrid(ctx, x + 34, y + 8, pat, el === 'null' ? '#ffd23f' : R[2]);
      break;
    }
    case 'bomb': {
      const fx = def.params?.fx;
      miniPanels(ctx, x + 1, y + 37, 3);
      if (fx === 'rock') drawBall(ctx, cx, y + 22, '#3a3f52', '#8a92ac');
      else if (fx === 'ice') spell(ctx, 'iceball', cx, y + 34, t, { z: 6 });
      else if (fx === 'flame') spell(ctx, 'lavaball', cx, y + 34, t, { z: 6 });
      else {
        const rowsN = def.params?.rows?.length ?? 1;
        for (let i = 0; i < rowsN; i++) spell(ctx, 'bomb', cx - (rowsN - 1) * 8 + i * 16, y + 34 - i * 2, t + i * 7, { z: 8 + (i % 2) * 6 });
        if (def.params?.blast === 'plus') hitGrid(ctx, x + 39, y + 3, [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]], '#ffd23f', 4);
      }
      break;
    }
    case 'blackbomb':
      miniPanels(ctx, x + 1, y + 37, 3);
      ent(ctx, BLACKBOMB_SPRITE, 'blackbomb', cx, y + 40, t);
      break;
    case 'sword':
    case 'stepsword':
    case 'pa_lifesaber':
    case 'pa_prismsaber':
    case 'pa_stepcombo':
      drawSwordArt(ctx, def, x, y, t);
      break;
    case 'shockwave': {
      miniPanels(ctx, x + 1, y + 37, 3, 'blue', 18, k === 'bigwave' ? ['cracked', 'cracked', 'cracked'] : []);
      const speed = k === 'dynawave' ? 3 : k === 'sonicwave' ? 2 : 1;
      SPELL_SPRITES.shockwave.draw(ctx, { t: t * speed, dir: 1 }, x + 20 + ((t >> 2) % 3) * 2, y + 41, t);
      if (k === 'bigwave' || k === 'dynawave') SPELL_SPRITES.shockwave.draw(ctx, { t: t + 3, dir: 1 }, x + 40, y + 41, t);
      for (let i = 0; i < speed; i++) rect(ctx, x + 3, y + 20 + i * 4, 8 + i * 3, 1, '#ffe08a');
      break;
    }
    case 'punch':
    case 'pa_rushpunch': {
      const n = b === 'pa_rushpunch' ? 3 : 1;
      for (let i = 0; i < n; i++) SPELL_SPRITES.fist.draw(ctx, { t: t + i, dir: 1 }, x + 30 - i * 6, y + 44 - i * 9 + (n > 1 ? 9 : 0), t);
      if (k === 'gutimpct' || b === 'pa_rushpunch') sparkle(ctx, x + 46, y + 21, 4, '#fff27a', '#ffffff', true);
      break;
    }
    case 'dash':
      miniPanels(ctx, x + 1, y + 39, 3, 'red');
      PLAYER_SPRITE.draw(ctx, { anim: 'dash', animT: 4, facing: 1, data: {} }, x + 30, y + 44, t);
      break;
    case 'burner':
      miniPanels(ctx, x + 1, y + 39, 3, 'red');
      PLAYER_SPRITE.draw(ctx, { anim: 'burner', animT: 8, facing: 1, data: {} }, cx, y + 45, t);
      break;
    case 'ratton':
    case 'pa_megarat': {
      miniPanels(ctx, x + 1, y + 37, 3);
      if (b === 'pa_megarat') SPELL_SPRITES.megarat.draw(ctx, { t, dir: 1 }, cx, y + 41, t);
      else {
        SPELL_SPRITES.ratton.draw(ctx, { t, dir: 1 }, x + 16, y + 41, t);
        for (let i = 0; i < 4; i++) rect(ctx, x + 26 + i * 5, y + 38, 2, 1, '#ffd23f');
        rect(ctx, x + 45, y + 22, 1, 14, '#ffd23f');
        poly(ctx, [[x + 42, y + 24], [x + 45, y + 19], [x + 48, y + 24]], '#ffd23f');
      }
      break;
    }
    case 'wave': {
      const fx = def.params?.fx ?? 'wave';
      miniPanels(ctx, x + 1, y + 37, 3);
      SPELL_SPRITES[fx].draw(ctx, { t, dir: 1 }, cx + 4, y + 41, t);
      break;
    }
    case 'hammer':
      miniPanels(ctx, x + 1, y + 39, 3, 'blue', 18, ['', 'broken', '']);
      PLAYER_SPRITE.draw(ctx, { anim: 'hammer', animT: 13, facing: 1, data: {} }, x + 12, y + 46, t);
      break;
    case 'tornado':
      miniPanels(ctx, x + 1, y + 39, 3);
      SPELL_SPRITES.tornado.draw(ctx, { t, data: {}, x: 0, y: 0 }, cx, y + 42, t);
      break;
    case 'zapring':
      for (let i = 0; i < 2; i++) SPELL_SPRITES.zapring.draw(ctx, { t: t + i * 3 }, x + 22 + i * 14, y + 38, t);
      break;
    case 'yoyo':
    case 'pa_yoyostorm': {
      const n = b === 'pa_yoyostorm' ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const yy = y + (n > 1 ? 14 + i * 13 : 32);
        line(ctx, x + 4, yy - 14, x + 36, yy - 14, '#e8eef8');
        SPELL_SPRITES.yoyo.draw(ctx, { t: t + i * 2 }, x + 38, yy, t);
      }
      break;
    }
    case 'lance':
      miniPanels(ctx, x + 1, y + 39, 3);
      drawLances(ctx, cx, y + 42, t);
      break;
    case 'boomer':
      ellipseRing(ctx, cx, y + 26, 22, 14, '#bdf08a', Math.PI * 0.2, Math.PI * 1.9);
      SPELL_SPRITES.boomer.draw(ctx, { t }, x + 44, y + 30, t);
      break;
    case 'meteors':
      miniPanels(ctx, x + 1, y + 39, 3, 'blue', 18, ['cracked', '', 'cracked']);
      for (let i = 0; i < 3; i++) SPELL_SPRITES.meteor.draw(ctx, { t: t + i * 5, data: { progress: 0.45 + i * 0.12 } }, x + 14 + i * 14 + 20, y + 74 - i * 4, t);
      break;
    case 'icewave':
      miniPanels(ctx, x + 1, y + 39, 3, 'blue', 18, ['ice', 'ice', '']);
      SPELL_SPRITES.icewave.draw(ctx, { t: 5, dir: 1 }, cx, y + 42, t);
      break;
    case 'plasma':
      SPELL_SPRITES.plasma.draw(ctx, { t, data: {}, x: 0, y: 0 }, cx, y + 40, t);
      break;
    case 'timebomb':
      miniPanels(ctx, x + 1, y + 39, 3);
      ent(ctx, TIMEBOMB_SPRITE, 'timebomb', cx, y + 42, t, { data: { fuse: 180 - ((t * 2) % 180), fuseMax: 180 } });
      break;
    case 'pa_doombomb':
      miniPanels(ctx, x + 1, y + 39, 3);
      ent(ctx, DOOMBOMB_SPRITE, 'doombomb', cx, y + 42, t, { data: { fuse: 150 - ((t * 2) % 150), fuseMax: 150 } });
      break;
    case 'mine':
      miniPanels(ctx, x + 1, y + 37, 3);
      SPELL_SPRITES.mine.draw(ctx, { data: {} }, cx, y + 42, t);
      ring(ctx, cx, y + 39, 6 + ((t >> 2) % 4), '#ff6a5a');
      break;
    case 'geyser':
      miniPanels(ctx, x + 1, y + 39, 3);
      drawGeyserArt(ctx, cx, y + 43, t);
      break;
    case 'volcano':
      miniPanels(ctx, x + 1, y + 39, 3, 'blue', 18, ['lava', 'lava', 'lava']);
      SPELL_SPRITES.eruption.draw(ctx, { t: 22, data: { landed: true, delay: 20 } }, cx, y + 42, t);
      break;
    case 'burning':
      miniPanels(ctx, x + 1, y + 39, 3);
      SPELL_SPRITES.flames.draw(ctx, { t: 10, data: { cells: [[0, 0]] }, x: 0, y: 0 }, x + 12, y + 44, t);
      SPELL_SPRITES.firetower.draw(ctx, { t: 10, data: { cells: [[0, 0]] }, x: 0, y: 0 }, cx, y + 44, t);
      SPELL_SPRITES.flames.draw(ctx, { t: 10, data: { cells: [[0, 0]] }, x: 0, y: 0 }, x + 44, y + 44, t);
      break;
    case 'guard':
      drawShieldArt(ctx, cx, y + 24, def.params?.bite, t);
      break;
    case 'panelout':
      miniPanels(ctx, x + 1, y + 30, 3, 'red', 18, def.params?.width === 3 ? ['broken', 'broken', 'broken'] : ['', 'broken', '']);
      for (let i = 0; i < 4; i++) rect(ctx, x + 22 + (i % 2) * 8, y + 16 + i * 3 - ((t >> 2) % 3), 3, 2, '#9a2626');
      break;
    case 'recover':
      drawRecoverArt(ctx, def, x, y, t);
      break;
    case 'panelgrab':
    case 'areagrab': {
      const n = b === 'areagrab' ? 3 : 1;
      for (let r = 0; r < 3; r++) miniPanels(ctx, x + 1, y + 16 + r * 10, 3, 'blue', 18, []);
      for (let r = 0; r < 3; r++) if (n === 3 || r === 1) miniPanels(ctx, x + 1, y + 16 + r * 10, 1, 'red');
      const fall = (t >> 1) % 12;
      if (n === 3) for (let r = 0; r < 3; r++) miniPanels(ctx, x + 19, y + 4 + r * 10 + fall, 1, 'red');
      else miniPanels(ctx, x + 19, y + 14 + fall, 1, 'red');
      break;
    }
    case 'stage':
      drawStageArt(ctx, def, x, y, t);
      break;
    case 'holypanel':
      miniPanels(ctx, x + 1, y + 34, 3, 'red', 18, ['', 'holy', '']);
      for (let i = 0; i < 3; i++) sparkle(ctx, cx - 8 + i * 8, y + 28 - ((t + i * 6) % 16), 1, '#fff2b0', '#ffffff');
      break;
    case 'rockcube':
      miniPanels(ctx, x + 1, y + 37, 3, 'red');
      ent(ctx, ROCKCUBE_SPRITE, 'rockcube', cx, y + 42, t);
      break;
    case 'wind': {
      const d = (def.params?.dir ?? 1) > 0 ? 1 : -1;
      for (let i = 0; i < 6; i++) {
        const yy = y + 8 + i * 6;
        const ph = (t * 2 + i * 9) % 40;
        const x0 = d > 0 ? x + ph : x + AW - ph - 16;
        rect(ctx, x0, yy, 16, 1, i % 2 ? '#e8f4ff' : '#9ad0ff');
      }
      poly(ctx, d > 0 ? [[x + 40, y + 16], [x + 50, y + 24], [x + 40, y + 32]] : [[x + 16, y + 16], [x + 6, y + 24], [x + 16, y + 32]], '#ffffff');
      break;
    }
    case 'gauge':
    case 'fullcust':
      drawGaugeArt(ctx, def, x, y, t);
      break;
    case 'repair':
      miniPanels(ctx, x + 1, y + 34, 3, 'red', 18, ['cracked', '', 'lava']);
      sprite(ctx, IC.wrench, pal('null'), x + 22, y + 10, { outline: OUTLINE });
      sparkle(ctx, x + 40, y + 12, (t >> 2) % 2 ? 2 : 1, '#ffffff', '#ffffff');
      break;
    case 'invis':
      withAlpha(ctx, 0.35 + 0.15 * ((t >> 3) % 2), () => PLAYER_SPRITE.draw(ctx, { anim: 'idle', animT: 0, facing: 1, data: {} }, cx, y + 45, t));
      break;
    case 'airshoes':
      miniPanels(ctx, x + 1, y + 37, 3, 'red', 18, ['', 'broken', '']);
      sprite(ctx, IC.shoes, pal('null'), x + 22, y + 12, { outline: OUTLINE });
      break;
    case 'barrier':
      drawBarrierArt(ctx, def, x, y, t);
      break;
    case 'aura':
      PLAYER_SPRITE.draw(ctx, { anim: 'idle', animT: 0, facing: 1, data: {} }, cx, y + 45, t);
      for (let i = 0; i < 10; i++) {
        const a = t / 8 + (i * Math.PI) / 5;
        rect(ctx, cx + Math.round(Math.cos(a) * 15), y + 26 + Math.round(Math.sin(a) * 18), 2, 2, i % 2 ? '#ff7ae0' : '#ffd0f8');
      }
      if (k === 'lifeaura') ring(ctx, cx, y + 26, 21, '#ffd0f8');
      break;
    case 'boost':
      drawBoostArt(ctx, def, x, y, t);
      break;
    default:
      if (NAVI_OF[b]) drawNaviArt(ctx, def, NAVI_OF[b], x, y, t);
      else sprite(ctx, IC.star, pal(el), cx - 6, y + 18, { outline: OUTLINE });
  }
}

export function drawChipArt(ctx, def, x, y, t = 0) {
  if (!def) {
    rect(ctx, x, y, AW, AH, '#10183a');
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, AW, AH);
  ctx.clip();
  artBackground(ctx, x, y, def.klass === 'giga' ? 'fire' : (iconElement(def) ?? 'null'), t);
  if (def.klass === 'pa') {
    // A radiant burst behind Program Advances.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t / 40;
      line(ctx, x + AW / 2, y + AH / 2, x + AW / 2 + Math.cos(a) * 40, y + AH / 2 + Math.sin(a) * 40, i % 2 ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.12)');
    }
  }
  scene(ctx, def, x, y, t);
  ctx.restore();
  klassFrame(ctx, x, y, def, t);
}

// ---------------------------------------------------------------- scene helpers

function drawCannonArt(ctx, x, y, tier, lava, t, nozzle = false) {
  const len = 30 + tier * 4;
  const h = 10 + tier * 2;
  const top = y + 8 - (h >> 1);
  // Carriage.
  poly(ctx, [[x + 4, y + 22], [x + 10, y + 12], [x + 22, y + 12], [x + 26, y + 22]], OUTLINE);
  poly(ctx, [[x + 5, y + 21], [x + 10, y + 13], [x + 21, y + 13], [x + 25, y + 21]], '#4a5272');
  disc(ctx, x + 15, y + 20, 5, OUTLINE);
  disc(ctx, x + 15, y + 20, 4, '#7a86a6');
  disc(ctx, x + 15, y + 20, 1, '#2b3250');
  // Barrel.
  rect(ctx, x + 2, top - 1, len + 2, h + 2, OUTLINE);
  rect(ctx, x + 3, top, len, h, lava ? '#a8381a' : '#7180a3');
  rect(ctx, x + 3, top, len, Math.max(2, h >> 2), lava ? '#ff8a2a' : '#dbe5f5');
  rect(ctx, x + 3, top + (h >> 2), len, 1, lava ? '#ffd23f' : '#ffffff');
  rect(ctx, x + 3, top + h - 2, len, 2, lava ? '#5a1a10' : '#475273');
  for (let i = 0; i < 2 + tier; i++) rect(ctx, x + 8 + i * 7, top, 2, h, lava ? '#ff6a1f' : '#27c3ee');
  // Muzzle ring.
  rect(ctx, x + len, top - 2, 5, h + 4, OUTLINE);
  rect(ctx, x + len + 1, top - 1, 3, h + 2, lava ? '#ff8a2a' : '#a6b5d0');
  rect(ctx, x + len + 2, top + 2, 2, h - 4, lava ? '#ffd23f' : '#2b3250');
  if (!nozzle && (t >> 3) % 3 === 0) {
    disc(ctx, x + len + 8, top + (h >> 1), 4, lava ? '#ff7a1f' : '#ffd23f');
    disc(ctx, x + len + 8, top + (h >> 1), 2, '#ffffff');
  }
  if (lava) for (let i = 0; i < 2; i++) px(ctx, x + len + 2 - i * 6, top + h + 2 + ((t + i * 5) % 6), '#ff8a2a');
}

function drawGun(ctx, x, y, el) {
  const R = ramp(el);
  poly(ctx, [[x, y + 1], [x + 20, y + 1], [x + 20, y + 8], [x + 9, y + 8], [x + 7, y + 17], [x + 1, y + 17], [x + 3, y + 8], [x, y + 8]], OUTLINE);
  rect(ctx, x + 1, y + 2, 19, 6, '#7a86a6');
  rect(ctx, x + 1, y + 2, 19, 2, '#c8d0e0');
  poly(ctx, [[x + 3, y + 8], [x + 8, y + 8], [x + 6, y + 16], [x + 2, y + 16]], '#4a5272');
  rect(ctx, x + 12, y + 4, 6, 2, el === 'null' ? '#27c3ee' : R[2]);
  disc(ctx, x + 24, y + 4, 3, el === 'null' ? '#ffd23f' : R[1]);
  px(ctx, x + 24, y + 4, '#ffffff');
}

function drawBall(ctx, cx, cy, c0, c1) {
  disc(ctx, cx, cy, 9, OUTLINE);
  disc(ctx, cx, cy, 8, c0);
  disc(ctx, cx - 2, cy - 2, 5, c1);
  disc(ctx, cx - 3, cy - 3, 2, '#e0e6f4');
}

function drawSwordArt(ctx, def, x, y, t) {
  const el = def.element ?? 'null';
  const shape = def.params?.shape ?? 'sword';
  const k = def.key;
  const R = el === 'null' ? ['#ffffff', '#c8f4ff', '#6ac8f0', '#2a6ab0'] : ramp(el);
  const bx = x + 12;
  const by = y + 38;
  if (def.behavior === 'pa_prismsaber') {
    const cols = [ramp('fire'), ramp('aqua'), ramp('elec'), ramp('wood')];
    cols.forEach((c, i) => sword(ctx, x + 8 + i * 9, y + 42, 30, 2, c, '#ffd23f', -1.05));
    return;
  }
  if (def.behavior === 'pa_lifesaber') {
    sword(ctx, x + 8, y + 42, 50, 6, ['#ffffff', '#e8fbff', '#9af0ff', '#3a9cff'], '#ffd23f');
    for (let i = 0; i < 4; i++) sparkle(ctx, x + 18 + i * 9, y + 30 - i * 7, (t + i) % 4 < 2 ? 2 : 1, '#ffffff', '#ffffff');
    return;
  }
  if (k === 'muramasa') {
    withAlpha(ctx, 0.5, () => sword(ctx, bx + 1, by + 1, 40, 4, ['#ff6a8a', '#ff6a8a', '#a01a3a', '#a01a3a'], '#a01a3a'));
    sword(ctx, bx, by, 40, 2, ['#ffd0e0', '#c8a0d8', '#5a2a7a', '#2a0a3a'], '#a01a3a');
    return;
  }
  if (k === 'herosword') {
    sword(ctx, bx, by, 44, 3, ['#ffffff', '#fff6c8', '#ffd23f', '#b07410'], '#ffffff');
    sparkle(ctx, x + 44, y + 8, (t >> 2) % 2 ? 3 : 2, '#fff6c8', '#ffffff', true);
    return;
  }
  if (k === 'varsword') {
    const cols = [ramp('null'), ramp('fire'), ramp('aqua'), ramp('elec')];
    sword(ctx, bx, by, 40, 4, cols[(t >> 4) % 4], '#c8d0e0');
    return;
  }
  if (k === 'custsword') {
    sword(ctx, bx, by, 38, 2, R, '#c8d0e0');
    rect(ctx, x + 30, y + 38, 22, 5, OUTLINE);
    rect(ctx, x + 31, y + 39, Math.round(20 * (((t >> 1) % 40) / 40)), 3, '#3ad0ff');
    return;
  }
  const len = shape === 'long' ? 44 : shape === 'wide' || shape === 'big' || shape === 'cross' ? 34 : 34;
  const w = shape === 'wide' || shape === 'big' ? 5 : shape === 'cross' ? 3 : 2;
  if (shape === 'cross') {
    sword(ctx, x + 10, y + 40, 40, 3, R, '#ffd23f', -0.7);
    sword(ctx, x + 10, y + 8, 40, 3, R, '#ffd23f', 0.7);
  } else sword(ctx, bx, by, len, w, R, k === 'airsword' ? '#bfe4ff' : '#ffd23f');
  if (k === 'airsword') for (let i = 0; i < 3; i++) rect(ctx, x + 30 + i * 3, y + 14 + i * 8, 14, 1, '#ffffff');
  if (def.behavior === 'stepsword' || def.behavior === 'pa_stepcombo') for (let i = 0; i < 4; i++) rect(ctx, x + 2, y + 24 + i * 5, 10 - i * 2, 1, '#ffffff');
  if (el !== 'null') {
    for (let i = 0; i < 3; i++) {
      const ph = (t + i * 7) % 18;
      sparkle(ctx, x + 22 + i * 9, y + 30 - i * 8 - (ph >> 2), ph < 9 ? 1 : 0, R[1], '#ffffff');
    }
  }
}

function drawLances(ctx, cx, fy, t) {
  for (let i = 0; i < 3; i++) {
    const sx = cx - 12 + i * 12;
    const h = 26 + (i === 1 ? 8 : 0);
    const top = fy - h;
    rect(ctx, sx - 1, top + 8, 3, h - 8, '#8a5a2a');
    rect(ctx, sx - 1, top + 8, 1, h - 8, '#c89050');
    poly(ctx, [[sx - 4, top + 9], [sx, top - 2], [sx + 4, top + 9], [sx, top + 11]], '#1c742a');
    poly(ctx, [[sx - 2, top + 8], [sx, top], [sx + 2, top + 8], [sx, top + 10]], '#a8f07a');
  }
}

function drawGeyserArt(ctx, cx, fy, t) {
  const h = 34;
  const top = fy - h;
  rect(ctx, cx - 8, top + 4, 16, h - 4, '#1f56c8');
  rect(ctx, cx - 6, top + 2, 12, h - 2, '#3a9cff');
  rect(ctx, cx - 3, top + 2, 5, h - 2, '#8fe2ff');
  for (let i = 0; i < 5; i++) disc(ctx, cx - 8 + i * 4, top + 2 + ((i + (t >> 2)) % 2), 3, i % 2 ? '#ffffff' : '#bfe9ff');
}

function drawShieldArt(ctx, cx, cy, bite, t) {
  const hex = (w, h) => [[cx - w, cy - h + 5], [cx, cy - h], [cx + w, cy - h + 5], [cx + w, cy + h - 5], [cx, cy + h], [cx - w, cy + h - 5]];
  poly(ctx, hex(15, 19), OUTLINE);
  poly(ctx, hex(14, 18), '#a6b5d0');
  poly(ctx, hex(11, 15), '#27c3ee');
  poly(ctx, hex(8, 11), '#86f3ff');
  poly(ctx, [[cx - 8, cy - 6], [cx, cy - 11], [cx, cy + 11], [cx - 8, cy + 6]], '#bff4ff');
  if (bite) {
    for (let i = 0; i < 4; i++) {
      poly(ctx, [[cx - 8 + i * 5, cy + 2], [cx - 6 + i * 5, cy - 3], [cx - 4 + i * 5, cy + 2]], '#ffffff');
      poly(ctx, [[cx - 6 + i * 5, cy + 3], [cx - 4 + i * 5, cy + 8], [cx - 2 + i * 5, cy + 3]], '#ffffff');
    }
  }
  if ((t >> 3) % 2) sparkle(ctx, cx + 8, cy - 12, 2, '#ffffff', '#ffffff', true);
}

function drawRecoverArt(ctx, def, x, y, t) {
  const cx = x + 22;
  const cy = y + 22;
  const s = 1 + ((t >> 3) % 2);
  // Big heart.
  disc(ctx, cx - 7, cy - 4, 9 + (s > 1 ? 1 : 0), OUTLINE);
  disc(ctx, cx + 7, cy - 4, 9 + (s > 1 ? 1 : 0), OUTLINE);
  poly(ctx, [[cx - 17, cy - 1], [cx, cy + 18], [cx + 17, cy - 1]], OUTLINE);
  disc(ctx, cx - 7, cy - 4, 8, '#e04a8a');
  disc(ctx, cx + 7, cy - 4, 8, '#e04a8a');
  poly(ctx, [[cx - 15, cy - 1], [cx, cy + 16], [cx + 15, cy - 1]], '#e04a8a');
  disc(ctx, cx - 8, cy - 5, 5, '#ff74ae');
  disc(ctx, cx - 10, cy - 7, 2, '#ffd0e4');
  rect(ctx, cx - 2, cy - 4, 4, 12, '#ffffff');
  rect(ctx, cx - 6, cy, 12, 4, '#ffffff');
  drawText(ctx, String(def.damage), x + AW - 3, y + AH - 11, '#b8ffc8', { align: 'right', outline: OUTLINE });
  for (let i = 0; i < 3; i++) {
    const ph = (t + i * 9) % 26;
    sparkle(ctx, x + 40 + (i % 2) * 6, y + 30 - ph, ph < 14 ? 1 : 0, '#b8ffc8', '#ffffff');
  }
}

function drawStageArt(ctx, def, x, y, t) {
  const p = def.params ?? {};
  const type = p.panel ?? (p.mode === 'crackall' ? 'cracked' : p.mode === 'breakall' ? 'broken' : p.mode === 'poisonall' ? 'poison' : '');
  for (let r = 0; r < 3; r++) {
    miniPanels(ctx, x + 1, y + 12 + r * 11, 3, r === 1 && p.ownOnly ? 'red' : 'blue', 18, [type, p.ownOnly && r !== 1 ? '' : type, type]);
  }
  if (p.mode === 'poisonall') for (let i = 0; i < 3; i++) ring(ctx, x + 10 + i * 18, y + 20 - ((t + i * 7) % 10), 2, '#d090ff');
  if (p.mode === 'breakall' || p.mode === 'crackall') for (let i = 0; i < 3; i++) rect(ctx, x + 10 + i * 18, y + 6 + ((t + i * 5) % 6), 2, 2, '#c8bca8');
  if (type === 'lava' && (t >> 3) % 2) sparkle(ctx, x + 28, y + 22, 1, '#ffd23f', '#ffffff');
  if (type === 'holy') sparkle(ctx, x + 28, y + 6 + ((t >> 2) % 4), 2, '#fff2b0', '#ffffff', true);
}

function drawGaugeArt(ctx, def, x, y, t) {
  const rate = def.params?.rate ?? 1;
  const full = def.behavior === 'fullcust';
  const gx = x + 6;
  const gy = y + 18;
  rect(ctx, gx - 1, gy - 1, 46, 12, OUTLINE);
  rect(ctx, gx, gy, 44, 10, '#1a2448');
  const speed = full ? 0 : rate > 1 ? 3 : 0.5;
  const fill = full ? 44 : Math.round((((t * speed) % 120) / 120) * 44);
  rect(ctx, gx, gy, fill, 10, full ? ((t >> 2) % 2 ? '#ffd23a' : '#fff07a') : '#3ad0ff');
  rect(ctx, gx, gy, fill, 2, full ? '#fff8c8' : '#a8f0ff');
  drawText(ctx, 'CUSTOM', gx + 22, gy + 2, '#0a1a3a', { align: 'center', mini: true });
  if (!full) {
    const n = rate > 1 ? 2 : 1;
    for (let i = 0; i < n; i++) poly(ctx, [[x + 20 + i * 8, y + 34], [x + 26 + i * 8, y + 38], [x + 20 + i * 8, y + 42]], rate > 1 ? '#ffd23f' : '#7a86a6');
    if (rate < 1) rect(ctx, x + 30, y + 34, 2, 9, '#7a86a6');
  } else sparkle(ctx, x + 46, y + 14, (t >> 2) % 2 ? 3 : 2, '#fff8c8', '#ffffff', true);
}

function drawBarrierArt(ctx, def, x, y, t) {
  const cx = x + AW / 2;
  PLAYER_SPRITE.draw(ctx, { anim: 'idle', animT: 0, facing: 1, data: {} }, cx, y + 45, t);
  const pulse = (t >> 3) % 2;
  ring(ctx, cx, y + 26, 20 + pulse, def.damage >= 200 ? '#ffd23f' : '#9ae8ff');
  ring(ctx, cx, y + 26, 19 + pulse, '#5ab8ff');
  drawText(ctx, String(def.damage), x + AW - 3, y + 3, '#e8fbff', { align: 'right', outline: OUTLINE, mini: true });
}

function drawBoostArt(ctx, def, x, y, t) {
  const b = def.params?.boost;
  const el = ['fire', 'aqua', 'elec', 'wood'].includes(b) ? b : 'null';
  const R = el === 'null' ? ['#ffffff', '#ffe08a', '#ffb43f', '#c8641a'] : ramp(el);
  const cx = x + 20;
  const cy = y + 22;
  rect(ctx, cx - 4, cy - 13, 9, 27, OUTLINE);
  rect(ctx, cx - 13, cy - 4, 27, 9, OUTLINE);
  rect(ctx, cx - 3, cy - 12, 7, 25, R[2]);
  rect(ctx, cx - 12, cy - 3, 25, 7, R[2]);
  rect(ctx, cx - 2, cy - 11, 3, 23, R[1]);
  rect(ctx, cx - 11, cy - 2, 23, 3, R[1]);
  drawText(ctx, String(def.damage), x + 36, y + 18, '#ffffff', { outline: OUTLINE });
  if (b === 'navi') sprite(ctx, IC.star, pal('elec'), x + 38, y + 30, { outline: OUTLINE });
  else if (el !== 'null') drawElementIcon(ctx, el, x + 40, y + 32);
  else poly(ctx, [[x + 40, y + 40], [x + 44, y + 33], [x + 48, y + 40]], '#ffd23f');
  if ((t >> 3) % 2) sparkle(ctx, cx + 12, cy - 12, 1, '#ffffff', '#ffffff');
}

// Navi portraits: head and shoulders in each navi's colours (original sketches), or the real summon
// sprite for the helpers drawn by this pack.
function drawNaviArt(ctx, def, name, x, y, t) {
  const cx = x + AW / 2;
  if (name === 'mender') {
    ent(ctx, MENDER_SPRITE, 'mender', cx, y + 44, t, { anim: 'summon', animT: 12 });
    return;
  }
  if (name === 'crusher') {
    ent(ctx, CRUSHER_SPRITE, 'crusher', cx, y + 46, t, { anim: 'summon', animT: 40 });
    return;
  }
  const f = FACE[name];
  if (!f) return;
  // Shoulders.
  const P = f.pal;
  const c0 = P.A ?? P.a ?? P.b;
  const c1 = P.B ?? P.b ?? P.c;
  const c2 = P.C ?? P.c ?? P.d;
  poly(ctx, [[cx - 24, y + 48], [cx - 18, y + 34], [cx + 18, y + 34], [cx + 24, y + 48]], OUTLINE);
  poly(ctx, [[cx - 22, y + 48], [cx - 17, y + 35], [cx + 17, y + 35], [cx + 22, y + 48]], c1);
  poly(ctx, [[cx - 22, y + 48], [cx - 17, y + 35], [cx - 4, y + 35], [cx - 8, y + 48]], c0);
  rect(ctx, cx - 17, y + 35, 34, 1, shade(c0, 0.3));
  rect(ctx, cx - 3, y + 38, 6, 10, c2);
  // Head: the 12x12 face drawn at 2x via a cached scaled bitmap.
  drawScaledFace(ctx, name, cx - 12, y + 6);
  const accents = { voltframe: '#ffe23a', feralis: '#3ae88a', tidecaller: '#4ad8ff', pyreclaw: '#ffa020', ironclad: '#ffb53c', sabre: '#ffe56a', briarix: '#ff6a9a', zeroday: '#ff4060' };
  const ac = accents[name] ?? '#ffffff';
  if (name === 'voltframe') bolt(ctx, x + 6, y + 6, x + 12, y + 22, 3, 2, ac, t >> 2);
  if (name === 'zeroday') for (let i = 0; i < 4; i++) px(ctx, x + 6 + ((t + i * 13) % 44), y + 4 + ((i * 11) % 30), '#b03aff');
  if (name === 'pyreclaw') flameTongue(ctx, x + 8, y + 46, 3, 10 + ((t >> 2) % 3), t, 2, ['#fff6c0', '#ffd040', '#ffa020', '#e04010']);
  if (name === 'tidecaller') for (let i = 0; i < 3; i++) ring(ctx, x + 8 + i * 4, y + 40 - ((t + i * 6) % 30), 1 + (i % 2), '#4ad8ff');
  if (name === 'briarix') for (let i = 0; i < 3; i++) drawHeart(ctx, x + 46 - i * 5, y + 10 + ((t + i * 9) % 30), '#ff6a9a');
  if (name === 'sabre') line(ctx, x + 44, y + 4, x + 52, y + 30, '#ff8ab8');
  if (name === 'feralis') for (let i = 0; i < 3; i++) line(ctx, x + 40 + i * 4, y + 30, x + 46 + i * 4, y + 42, '#ffffff');
  if (name === 'ironclad') rect(ctx, x + 44, y + 36, 8, 8, '#cfd6df');
  sparkle(ctx, x + 50, y + 6, (t >> 3) % 2 ? 2 : 1, ac, '#ffffff');
}

const scaledFaceCache = new Map();
function drawScaledFace(ctx, name, x, y) {
  let c = scaledFaceCache.get(name);
  if (!c) {
    const f = FACE[name];
    const rows = f.rows;
    const w = rows[0].length;
    const h = rows.length;
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w * 2 + 2, h * 2 + 2) : Object.assign(document.createElement('canvas'), { width: w * 2 + 2, height: h * 2 + 2 });
    const g = cv.getContext('2d');
    const solid = (cx, cy) => rows[cy]?.[cx] && rows[cy][cx] !== '.' && f.pal[rows[cy][cx]];
    g.fillStyle = OUTLINE;
    for (let cy = -1; cy <= h; cy++) for (let cx = -1; cx <= w; cx++) if (!solid(cx, cy) && (solid(cx - 1, cy) || solid(cx + 1, cy) || solid(cx, cy - 1) || solid(cx, cy + 1))) g.fillRect(cx * 2 + 1, cy * 2 + 1, 2, 2);
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const ch = rows[cy][cx];
        if (!solid(cx, cy)) continue;
        g.fillStyle = f.pal[ch];
        g.fillRect(cx * 2 + 1, cy * 2 + 1, 2, 2);
      }
    }
    c = cv;
    scaledFaceCache.set(name, c);
  }
  ctx.drawImage(c, Math.round(x) - 1, Math.round(y) - 1);
}
