import { wait, lob } from '../combat.js';
import { PANEL } from '../constants.js';
import { plusCells } from './a_common.js';

// Mortarshell: a stationary armoured mortar turtle. It sits shut in its shell, then opens up (vulnerable
// and counterable), lobs a mortar at the panel the player stands on and clamps shut again. The shell of
// each level leaves its mark where it lands: Lv1 breaks the panel, the Aqua Lv2 freezes it to ice, the
// Fire Lv3 melts it to lava, and the Ω shell breaks it and blasts a plus around it.
// Mirrors BN3's HardHead family (HardHead 80 Null / ColdHead 120 Aqua / HotHead 200 Fire / Ω 300 Null).
//
// The closed shell is a guard with no reflection (e.guard = { reflect: 0, shell: true } held up by a
// guardTimer that never runs out). The hit pipeline checks a guard before anything else, so while closed
// every hit still *connects* (shots and projectiles stop at the shell and the 'guard' deflect fx/sfx
// play) but deals no damage, no flinch and no stun. Only a future `breaksGuard` attack would get through,
// which matches how breaking attacks crack shells in BN. e.data.closed mirrors the state for the view.

const SHELL_HOLD = 1e9; // frames: the shell guard only drops when the AI opens it

export function setShell(e, closed) {
  e.data.closed = closed;
  if (closed) {
    e.guard = { reflect: 0, shell: true };
    e.guardTimer = SHELL_HOLD;
  } else {
    e.guard = null;
    e.guardTimer = 0;
  }
}

const EFFECTS = {
  // How the mortar marks the landing panel, per level.
  break: { breakPanel: true, landFx: 'explosion' },
  ice: { panel: PANEL.ICE, landFx: 'ice' },
  lava: { panel: PANEL.LAVA, landFx: 'flame' },
  blast: {
    cells: plusCells,
    landFx: 'explosion',
    // Break the centre (cracks if someone stands on it), crack the four arms.
    onLandField(b, tc, tr) {
      b.field.breakPanel(tc, tr, !!b.entityAt(tc, tr));
      for (const [c, r] of plusCells(tc, tr).slice(1)) if (b.field.inBounds(c, r)) b.field.crack(c, r, !!b.entityAt(c, r));
    },
  },
};

export const MORTARSHELL = {
  type: 'mortarshell',
  kind: 'virus',
  mirrors: 'HardHead',
  names: ['Mortshell', 'Mortshell2', 'Mortshell3', 'MortshellΩ'],
  hp: [80, 120, 200, 300],
  element: ['null', 'aqua', 'fire', 'null'],
  immovable: true,
  levels: [
    // closed: frames shut between volleys (+ up to `jitter`); windup: opening, counterable; flight: mortar
    // frames in the air; open: frames it stays open after firing.
    { attack: 20, closed: 110, jitter: 30, windup: 30, flight: 42, open: 36, effect: 'break' },
    { attack: 50, closed: 96, jitter: 26, windup: 26, flight: 40, open: 30, effect: 'ice' },
    { attack: 80, closed: 84, jitter: 22, windup: 22, flight: 38, open: 26, effect: 'lava' },
    { attack: 130, closed: 68, jitter: 18, windup: 18, flight: 34, open: 22, effect: 'blast' },
  ],
  onSpawn(b, e) {
    e.immovable = true;
    setShell(e, true);
  },
  *ai(b, e) {
    const s = e.stats;
    if (!e.data.closed) {
      // Restarting after a flinch while open: clamp shut first (still vulnerable while it closes).
      e.setAnim('close');
      yield* wait(10);
    }
    setShell(e, true);
    e.setAnim('idle');
    yield* wait(b.rng.range(20, 50));
    for (;;) {
      yield* wait(s.closed + b.rng.int(s.jitter + 1));

      // Open up: head out, mortar tube raised. Vulnerable and counterable from here.
      setShell(e, false);
      e.setAnim('windup');
      e.counterWindow = s.windup;
      yield* wait(s.windup);
      e.counterWindow = 0;

      e.setAnim('fire');
      b.emit('sfx', { name: 'cannon' });
      const fx = EFFECTS[s.effect] ?? EFFECTS.break;
      const p = b.player;
      const shot = lob(b, e, { damage: s.attack, element: e.element, flinch: true }, p.col, p.row, {
        frames: s.flight,
        height: 48,
        type: 'mortarball',
        cells: fx.cells,
        breakPanel: fx.breakPanel,
        panel: fx.panel,
        landFx: fx.landFx,
        onLand: fx.onLandField ? (sp, tc, tr) => fx.onLandField(b, tc, tr) : undefined,
      });
      shot.data.level = e.level;
      shot.data.effect = s.effect;
      yield* wait(16);

      e.setAnim('open');
      yield* wait(s.open);
      e.setAnim('close');
      yield* wait(10);
      setShell(e, true);
      e.setAnim('idle');
    }
  },
};
