// A demo pilot for the open world (?auto=1): heads for the nearest open rift and fights what comes out the way
// a player would: locks on, closes in and mashes combos, shoots from range, uses its chips, takes every
// reaction command it is offered, jumps shockwaves and dodges dives. Used for the attract demo, browser smoke
// tests and showcase clips. It steers the camera while roaming; locked on, the view frames the target itself.

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export function makeBot(world) {
  let t = 0;
  let chargeUntil = 0;
  return (view) => {
    t++;
    const p = world.player;
    const out = { move: { x: 0, y: 0 }, attack: false, shoot: false, jump: false, dash: false, lock: false, react: false, chip: 0 };
    if (!p.alive) return out;
    const foes = world.enemies.filter((e) => e.alive && e.spawnT <= 0);
    let foe = null;
    let best = 48;
    for (const e of foes) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < best) {
        best = d;
        foe = e;
      }
    }
    const target = world.lockTarget() ?? foe;
    const dist = target ? Math.hypot(target.x - p.x, target.z - p.z) : Infinity;
    let tx;
    let tz;
    if (target) {
      tx = target.x;
      tz = target.z;
    } else {
      const open = world.zones.filter((z) => z.state !== 'cleared');
      const goal = (open.length ? open : world.zones).reduce((a, z) => (Math.hypot(z.x - p.x, z.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? z : a));
      tx = goal.x;
      tz = goal.z;
    }
    if (p.lock == null) {
      const want = Math.atan2(tx - p.x, tz - p.z);
      view.cam.yaw += wrap(want - view.cam.yaw) * (target ? 0.12 : 0.05);
      view.cam.pitch += (-0.18 - view.cam.pitch) * 0.05;
      // Lock on once something is close (one press every few frames until it takes).
      if (foe && best < 30 && t % 12 === 0) out.lock = true;
    }
    if (target) {
      if (dist > 8) {
        // Run in, popping the buster; charge a shot now and then.
        out.move.y = 1;
        if (t % 300 === 0) chargeUntil = t + 80;
        out.shoot = t < chargeUntil || t % 10 < 2;
      } else {
        out.move.x = Math.sin(t / 70) * 0.4;
        out.attack = t % 8 < 4; // mash: every press past the first is buffered into the combo
      }
      // Chips when viruses are close and the chip is ready.
      if (dist < 12) {
        world.deck.forEach((k, i) => {
          if ((world.chipCd[k] ?? 0) <= 0 && t % 45 === i * 15) out.chip = i + 1;
        });
      }
    } else out.move.y = 1;
    // Reaction commands whenever offered; otherwise jump shockwaves and dodge dives.
    if (p.reaction) out.react = t % 2 === 0;
    for (const h of world.hazards) {
      if (h.team === 'player') continue;
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d - h.r > 0 && d - h.r < 2.2) out.jump = true;
    }
    if (!p.reaction) {
      for (const e of foes) {
        if (e.type === 'dartfin' && e.state === 'windup' && e.t < 0.15) {
          out.dash = true;
          out.move.x = 1;
        }
      }
    }
    // Hop over small rises and out of water now and then.
    if (p.wading && t % 40 === 0) out.jump = true;
    return out;
  };
}
