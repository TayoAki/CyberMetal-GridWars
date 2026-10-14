// Core constants for the battle simulation. Everything runs at the guest's own step rate: 60 steps per
// second, timers in frames, positions in panel units. Values marked (ROM) were read from the BN3 data
// tables; values marked (tuned) are community-documented or play-tuned (see MODLOG.md "Not measured").

export const FPS = 60;

export const COLS = 6;
export const ROWS = 3;

export const TEAM = Object.freeze({ RED: 'red', BLUE: 'blue', NONE: 'none' });

export const ELEMENT = Object.freeze({ NULL: 'null', FIRE: 'fire', AQUA: 'aqua', ELEC: 'elec', WOOD: 'wood' });

// Panel types (BN3 has all of these).
export const PANEL = Object.freeze({
  NORMAL: 'normal',
  CRACKED: 'cracked',
  BROKEN: 'broken',
  GRASS: 'grass',
  ICE: 'ice',
  LAVA: 'lava',
  POISON: 'poison',
  HOLY: 'holy',
  SAND: 'sand',
  METAL: 'metal',
});

export const TIMING = Object.freeze({
  GAUGE_FULL: 512, // frames to fill the Custom Gauge at normal speed (tuned: ~8.5 s)
  INTRO: 50, // enemies materialise before the first Custom Screen
  BANNER: 54, // "BATTLE START!" banner
  PA_BANNER: 50, // program-advance name flash
  WIN_BANNER: 100,
  LOSE_TIME: 110,
  MOVE: 4, // frames a step takes (player)
  MOVE_REPEAT: 10, // frames a held direction waits before stepping again
  BUSTER_COOLDOWN: [0, 14, 12, 10, 8, 6], // by rapid level 1..5 (tuned)
  CHARGE_START: 10, // hold B this long before the charge aura appears
  CHARGE_TIME: [0, 100, 85, 70, 58, 46], // by charge level 1..5 (tuned)
  FLINCH: 22, // stagger after a flinching hit
  PLAYER_IFRAMES: 120, // invincibility after the player is flinched (tuned)
  ENEMY_FLINCH: 18,
  DELETE: 34, // deletion explosion before an enemy is removed
  BROKEN_RECOVER: 600, // broken panels return to normal (tuned)
  AREA_RETURN: 900, // stolen panels return to their owner (tuned)
  POISON_TICK: 7, // poison panels drain 1 HP every N frames
  GRASS_HEAL_TICK: 30, // wood-element bodies regain 1 HP every N frames on grass
  STUN_DEFAULT: 90,
  COUNTER_STUN: 40,
  DOUBLE_DELETE_WINDOW: 3,
});

export const LIMITS = Object.freeze({
  HAND_BASE: 5,
  HAND_MAX: 10,
  SELECT_MAX: 5,
  ADD_BONUS: 5,
  FOLDER_SIZE: 30,
});

export const PLAYER_BASE_HP = 100; // (ROM) enemy table entry 0
