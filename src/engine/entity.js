import { ELEMENT, TEAM } from './constants.js';

// Everything that stands on a panel: the player's navi, viruses, boss navis and placed objects (rocks,
// totems, bombs). Logic that needs the whole battle lives in Battle; this class only holds state.

export class Entity {
  constructor(battle, o) {
    this.b = battle;
    this.id = battle.nextId++;
    this.kind = o.kind ?? 'virus'; // 'player' | 'virus' | 'navi' | 'object'
    this.type = o.type; // AI + sprite key, e.g. 'rivet'
    this.name = o.name ?? o.type;
    this.team = o.team ?? TEAM.BLUE;
    this.col = o.col;
    this.row = o.row;
    this.hp = o.hp ?? 1;
    this.maxHp = o.maxHp ?? this.hp;
    this.element = o.element ?? ELEMENT.NULL;
    this.level = o.level ?? 1;
    this.facing = this.team === TEAM.RED ? 1 : -1;

    this.alive = true; // false once HP hits 0 (deletion animation may still be playing)
    this.removed = false; // gone from the field
    this.deleteTimer = 0;

    this.flinchTimer = 0;
    this.stunTimer = 0;
    this.iframes = 0;
    this.invisTimer = 0;
    this.barrierHp = 0;
    this.auraPower = 0;
    this.guardTimer = 0; // reflecting shield up (Guard / CrsShld)
    this.guard = null; // { reflect: damage, mode }
    this.superArmor = o.superArmor ?? false;
    this.floatShoes = o.floatShoes ?? false;
    this.airShoes = o.airShoes ?? false;
    this.underShirt = o.underShirt ?? false;
    this.flying = o.flying ?? false; // airborne bodies ignore holes and floor effects
    this.counterWindow = 0; // > 0 while winding up an attack: a chip hit now is a counter hit
    this.hidden = false; // burrowed/teleporting: untargetable and invisible

    this.hittable = o.hittable ?? true;
    this.blocks = o.blocks ?? true; // stops shots and most projectiles
    this.immovable = o.immovable ?? false; // can't be pushed

    // View hints. The renderer reads these; the sim never depends on them.
    this.anim = 'idle';
    this.animT = 0;
    this.offsetX = 0; // panel units, e.g. mid-dash
    this.offsetY = 0;
    this.z = 0; // pixels above the floor (jumps)

    this.script = null; // generator driving the AI or current action
    this.data = o.data ?? {}; // per-type scratch space
    this.lastMoveDir = 0;
  }

  setAnim(name) {
    if (this.anim !== name) {
      this.anim = name;
      this.animT = 0;
    }
  }

  get grounded() {
    return !this.flying && !this.floatShoes;
  }

  get canAct() {
    return this.alive && !this.removed && this.flinchTimer <= 0 && this.stunTimer <= 0;
  }

  get isEnemyOfPlayer() {
    return this.team === TEAM.BLUE;
  }

  get targetable() {
    return this.alive && !this.removed && this.hittable && !this.hidden;
  }
}
