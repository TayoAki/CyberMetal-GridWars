import { COLS, ROWS, PANEL, TEAM, TIMING } from './constants.js';

// The 6x3 battle grid. Columns 0-2 start red (the player's side), 3-5 blue. Occupancy lives on the entities;
// the field only knows panel type, ownership and the timers that restore them.

export class Field {
  constructor(layout = null) {
    this.panels = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const owner = c < COLS / 2 ? TEAM.RED : TEAM.BLUE;
        row.push({ type: PANEL.NORMAL, owner, home: owner, brokenTimer: 0, stolenTimer: 0, flash: 0 });
      }
      this.panels.push(row);
    }
    if (layout) this.applyLayout(layout);
  }

  // layout: array of 3 strings of 6 chars. '.' normal, 'c' cracked, 'x' broken, 'g' grass, 'i' ice,
  // 'l' lava, 'p' poison, 'h' holy, 's' sand, 'm' metal.
  applyLayout(layout) {
    const map = { '.': PANEL.NORMAL, c: PANEL.CRACKED, x: PANEL.BROKEN, g: PANEL.GRASS, i: PANEL.ICE, l: PANEL.LAVA, p: PANEL.POISON, h: PANEL.HOLY, s: PANEL.SAND, m: PANEL.METAL };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = layout[r]?.[c] ?? '.';
        const type = map[ch] ?? PANEL.NORMAL;
        this.panels[r][c].type = type;
        // Holes placed by an encounter layout are permanent.
        this.panels[r][c].brokenTimer = type === PANEL.BROKEN ? Infinity : 0;
      }
    }
  }

  inBounds(c, r) {
    return c >= 0 && c < COLS && r >= 0 && r < ROWS;
  }

  get(c, r) {
    return this.inBounds(c, r) ? this.panels[r][c] : null;
  }

  typeAt(c, r) {
    const p = this.get(c, r);
    return p ? p.type : null;
  }

  ownerAt(c, r) {
    const p = this.get(c, r);
    return p ? p.owner : null;
  }

  isHole(c, r) {
    return this.typeAt(c, r) === PANEL.BROKEN;
  }

  setType(c, r, type) {
    const p = this.get(c, r);
    if (!p) return false;
    if (p.type === PANEL.BROKEN && type !== PANEL.BROKEN && p.brokenTimer === Infinity) return false;
    p.type = type;
    p.brokenTimer = type === PANEL.BROKEN ? TIMING.BROKEN_RECOVER : 0;
    p.flash = 8;
    return true;
  }

  // A hit that cracks: normal (or any special floor) -> cracked; cracked + empty -> broken.
  crack(c, r, occupied) {
    const p = this.get(c, r);
    if (!p || p.type === PANEL.METAL || p.type === PANEL.BROKEN) return false;
    if (p.type === PANEL.CRACKED) {
      if (occupied) return false;
      return this.setType(c, r, PANEL.BROKEN);
    }
    return this.setType(c, r, PANEL.CRACKED);
  }

  // A hit that breaks: empty panels become holes, occupied ones only crack.
  breakPanel(c, r, occupied) {
    const p = this.get(c, r);
    if (!p || p.type === PANEL.METAL || p.type === PANEL.BROKEN) return false;
    if (occupied) return this.crack(c, r, true);
    return this.setType(c, r, PANEL.BROKEN);
  }

  // Called when a grounded body steps off a panel.
  onLeave(c, r) {
    const p = this.get(c, r);
    if (p && p.type === PANEL.CRACKED) this.setType(c, r, PANEL.BROKEN);
  }

  steal(c, r, team, permanent = false) {
    const p = this.get(c, r);
    if (!p || p.owner === team) return false;
    p.owner = team;
    p.stolenTimer = permanent ? Infinity : TIMING.AREA_RETURN;
    p.flash = 12;
    return true;
  }

  // Front column of a team's area: the column nearest the enemy that the team fully owns.
  frontColumn(team) {
    if (team === TEAM.RED) {
      let front = -1;
      for (let c = 0; c < COLS; c++) {
        if ([0, 1, 2].every((r) => this.panels[r][c].owner === TEAM.RED)) front = c;
        else break;
      }
      return front;
    }
    let front = COLS;
    for (let c = COLS - 1; c >= 0; c--) {
      if ([0, 1, 2].every((r) => this.panels[r][c].owner === TEAM.BLUE)) front = c;
      else break;
    }
    return front;
  }

  // The column an AreaGrab by `team` would take: the enemy's nearest column.
  grabColumn(team) {
    if (team === TEAM.RED) {
      for (let c = 0; c < COLS; c++) {
        if ([0, 1, 2].some((r) => this.panels[r][c].owner !== TEAM.RED)) return c;
      }
      return -1;
    }
    for (let c = COLS - 1; c >= 0; c--) {
      if ([0, 1, 2].some((r) => this.panels[r][c].owner !== TEAM.BLUE)) return c;
    }
    return -1;
  }

  // Advance timers one frame. `occupantTeamAt(c, r)` reports the team standing on a panel (or null).
  update(occupantTeamAt) {
    let due = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.panels[r][c];
        if (p.flash > 0) p.flash--;
        if (p.type === PANEL.BROKEN && p.brokenTimer !== Infinity && p.brokenTimer > 0) {
          p.brokenTimer--;
          if (p.brokenTimer === 0) {
            p.type = PANEL.NORMAL;
            p.flash = 8;
          }
        }
        if (p.owner !== p.home && p.stolenTimer !== Infinity && p.stolenTimer > 0) {
          p.stolenTimer--;
          if (p.stolenTimer <= 0) (due ??= []).push(p);
        }
      }
    }
    if (!due) return;
    // A panel only goes back once the thief has stepped off it and doesn't need it to get home: a body two
    // columns deep would otherwise be cut off, unable to step back or turn round.
    const keep = this.lifelines(occupantTeamAt);
    for (const p of due) {
      if (keep.has(p)) p.stolenTimer = 1;
      else {
        p.owner = p.home;
        p.flash = 12;
      }
    }
  }

  // The stolen panels bodies need: each panel a body stands on in the other side's area, and one shortest
  // way from it back to its own area through panels its side holds.
  lifelines(occupantTeamAt) {
    const keep = new Set();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const team = occupantTeamAt(c, r);
        const p = this.panels[r][c];
        if (team === null || p.owner !== team || p.home === team) continue;
        const from = new Map([[p, null]]);
        const queue = [[c, r]];
        let end = p;
        for (let i = 0; i < queue.length; i++) {
          const [qc, qr] = queue[i];
          const q = this.panels[qr][qc];
          if (q.home === team) {
            end = q;
            break;
          }
          for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const n = this.get(qc + dc, qr + dr);
            if (!n || n.owner !== team || from.has(n)) continue;
            from.set(n, q);
            queue.push([qc + dc, qr + dr]);
          }
        }
        for (let k = end; k; k = from.get(k)) keep.add(k);
      }
    }
    return keep;
  }

  snapshot() {
    return this.panels.map((row) => row.map((p) => ({ type: p.type, owner: p.owner })));
  }
}
