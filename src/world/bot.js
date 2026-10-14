// A demo pilot for the open world (?auto=1): heads for the nearest open rift, fights what comes out, jumps
// shockwaves and dashes away from dives. Used for the attract demo, browser smoke tests and showcase clips.
// It steers the camera like a player would, so the view's aim logic is exercised too.

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
    const out = { move: { x: 0, y: 0 }, fire: false, jump: false, dash: false };
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
    let tx;
    let tz;
    if (foe) {
      tx = foe.x;
      tz = foe.z;
    } else {
      const open = world.zones.filter((z) => z.state !== 'cleared');
      const goal = (open.length ? open : world.zones).reduce((a, z) => (Math.hypot(z.x - p.x, z.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? z : a));
      tx = goal.x;
      tz = goal.z;
    }
    const want = Math.atan2(tx - p.x, tz - p.z);
    view.cam.yaw += wrap(want - view.cam.yaw) * (foe ? 0.12 : 0.05);
    if (foe) {
      const dy = foe.y + foe.def.height * 0.5 - (p.y + 1.55);
      view.cam.pitch += (Math.atan2(dy, best) - 0.1 - view.cam.pitch) * 0.1;
      if (best > 15) out.move.y = 1;
      else if (best < 8) out.move.y = -0.7;
      out.move.x = Math.sin(t / 70);
      // Charge now and then, otherwise tap the buster.
      if (t % 300 === 0) chargeUntil = t + 80;
      out.fire = t < chargeUntil || (t % 10 < 2 && best < 40);
    } else {
      view.cam.pitch += (-0.18 - view.cam.pitch) * 0.05;
      out.move.y = 1;
    }
    // Jump shockwaves that are about to reach us; dash out of a dive's path.
    for (const h of world.hazards) {
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (d - h.r > 0 && d - h.r < 2.2) out.jump = true;
    }
    for (const e of foes) {
      if (e.type === 'dartfin' && e.state === 'windup' && e.t < 0.2) {
        out.dash = true;
        out.move.x = 1;
      }
    }
    // Hop over small rises and out of water now and then.
    if (p.wading && t % 40 === 0) out.jump = true;
    return out;
  };
}
