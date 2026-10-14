// A spell is anything that attacks but has no HP: shots, shockwaves, thrown bombs, slashes, meteors,
// reticles. It is driven by a generator `script` that runs once per fight frame. (x, y) are continuous
// panel coordinates for the view; (col, row) is the panel it currently occupies for hit tests.

export class Spell {
  constructor(battle, o) {
    this.b = battle;
    this.id = battle.nextId++;
    this.type = o.type; // render key
    this.team = o.team; // attacker's team: hits bodies of other teams
    this.owner = o.owner ?? null;
    this.col = o.col;
    this.row = o.row;
    this.x = o.x ?? o.col;
    this.y = o.y ?? o.row;
    this.z = 0; // pixels above the floor (arcs)
    this.dir = o.dir ?? 1;
    this.t = 0;
    this.alive = true;
    this.hit = o.hit ?? null; // hit parameters (see Battle.applyHit)
    this.hitIds = new Set(); // bodies already hit by this spell
    this.script = null;
    this.data = o.data ?? {};
    this.element = o.hit?.element ?? o.element ?? 'null';
  }

  kill() {
    this.alive = false;
  }
}
