import * as THREE from 'three';
import { Arena } from './arena.js';
import { BossBody } from './body.js';
import { Vfx, PX } from './vfx.js';
import { cellX, cellZ, RIM, toon, glow } from './stage.js';
import { Field } from '../../engine/field.js';

// What the Daily's 3D scene shows of a battle: the arena following the field, the navi and the boss where
// the battle has them (mid-leap, mid-dash, hidden, flinching, deleted), the objects bosses and chips put
// down, and every spell and battle event as effects. It only reads the battle; nothing here feeds back.

const FACING = Math.PI / 2 - 0.42; // profile, turned a little toward the camera

export class BattleView {
  constructor(stage, recipe) {
    this.stage = stage;
    this.recipe = recipe;
    RIM.color.value.set(recipe.arena.accent);
    stage.bloom.strength = 0.85;
    this.arena = new Arena(stage, recipe.arena);
    this.vfx = new Vfx(stage);
    this.boss = new BossBody(recipe);
    stage.scene.add(this.boss.root);
    this.boss.root.position.set(cellX(4), 0, cellZ(1));
    this.boss.root.rotation.y = -FACING;
    this.objects = new Map(); // entity id -> mesh
    this.flash = new Map(); // entity id -> frames of white
    this.navi = null;
    this.b = null;
    this.t = 0;
    this.restField = new Field(recipe.field); // the floor before a fight: the day's layout
  }

  setNavi(actor) {
    this.navi?.root.removeFromParent();
    this.navi = actor;
    if (actor) {
      this.stage.scene.add(actor.root);
      actor.root.position.set(cellX(1), 0, cellZ(1));
    }
  }

  attach(b) {
    this.b = b;
    this.vfx.clear();
    for (const m of this.objects.values()) m.removeFromParent();
    this.objects.clear();
    this.flash.clear();
    this.bossEntity = b?.entities.find((e) => e.kind === 'navi') ?? null;
  }

  // Battle events since the last frame: effects, hit flashes, shakes.
  events(list) {
    for (const ev of list) {
      if (ev.type === 'fx') this.vfx.fx(ev);
      else if (ev.type === 'hurt') {
        this.flash.set(ev.id, this.t + 0.1);
        const big = ev.amount >= 60;
        this.vfx.hit(cellX(ev.col), 0.85, cellZ(ev.row), ev.doubled ? '#ffe14a' : '#ffffff', big);
        const isPlayer = ev.id === this.b?.player.id;
        this.stage.shake = Math.max(this.stage.shake, isPlayer ? (big ? 5 : 3) : big ? 2.5 : 1);
      } else if (ev.type === 'counter') {
        this.vfx.flash(cellX(ev.col), 0.9, cellZ(ev.row), '#ffffff', 1.2, 0.25);
        this.vfx.ring(cellX(ev.col), 0.9, cellZ(ev.row), '#ffe14a', 1.6, 0.4, false);
        this.stage.shake = Math.max(this.stage.shake, 4);
        this.stage.punch = 0.6;
      }
    }
  }

  // Draw the battle as it stands. t: seconds; dt: seconds since the last frame.
  frame(t, dt) {
    this.t = t;
    const b = this.b;
    this.arena.update(b?.field ?? this.restField, t);
    if (!b) {
      this.boss.pose('idle', 0, t, dt);
      if (this.navi) this.navi.pose({ anim: 'idle', animT: 0, facing: 1, data: {} }, t * 60, {});
      this.vfx.tick(dt);
      return;
    }
    for (const [id, until] of this.flash) if (until < t) this.flash.delete(id);
    this.placeNavi(b, t);
    this.placeBoss(b, t, dt);
    this.placeObjects(b, t);
    this.vfx.sync(b, t, dt);
  }

  placeNavi(b, t) {
    const a = this.navi;
    if (!a) return;
    const p = b.player;
    const r = a.root;
    r.visible = !p.removed && !p.hidden && !(p.invisTimer > 0 && Math.floor(t * 30) % 2);
    r.position.set(cellX(p.col + (p.offsetX ?? 0)), (p.z ?? 0) * PX, cellZ(p.row + (p.offsetY ?? 0)));
    const ghost = p.invisTimer > 0 ? 0.45 : !p.alive ? Math.max(0, p.deleteTimer / 40) : 1;
    const blink = p.iframes > 0 && Math.floor(t * 20) % 2 === 0;
    a.pose({ anim: p.alive ? p.anim : 'hurt', animT: p.animT, facing: 1, data: { charge: p.alive ? b.controller.chargeState : 0 } }, t * 60, { flash: this.flash.has(p.id), alpha: blink ? 0.5 : ghost });
  }

  placeBoss(b, t, dt) {
    const e = this.bossEntity;
    const body = this.boss;
    const r = body.root;
    if (!e) {
      r.visible = false;
      return;
    }
    const gone = e.removed;
    r.visible = !gone && !e.hidden;
    r.position.set(cellX(e.col + (e.offsetX ?? 0)), (e.z ?? 0) * PX, cellZ(e.row + (e.offsetY ?? 0)));
    if (!e.alive && !gone) {
      // Deleted: it shudders, flashes white and breaks up.
      const k = 1 - Math.max(0, e.deleteTimer) / 40;
      r.position.x += Math.sin(t * 70) * 0.04;
      body.pose('hurt', 20, t, dt, { flash: Math.floor(t * 20) % 2 === 0 });
      if (Math.random() < 0.5) this.vfx.particles.emit(r.position.x, 0.5 + Math.random() * body.height, r.position.z, { n: 3, speed: 3, color: Math.random() < 0.5 ? '#ffffff' : this.recipe.body.colors.glow, size: 0.2, life: 0.5 });
      r.scale.setScalar(Math.max(0.01, 1 - k * 0.3));
      return;
    }
    r.scale.setScalar(1);
    body.pose(e.anim, e.animT, t, dt, { flash: this.flash.has(e.id) || (e.stunTimer > 0 && Math.floor(t * 8) % 2 === 0) });
    if (e.auraPower > 0 && Math.random() < 0.4) this.vfx.particles.emit(r.position.x + (Math.random() - 0.5), 0.2, r.position.z + (Math.random() - 0.5) * 0.6, { n: 1, speed: 0.4, up: 2, color: '#c86aff', size: 0.25, life: 0.7, gravity: -1 });
    if (e.guardTimer > 0) body.shield.visible = true;
  }

  // Objects: the boss's lamps, coral, braziers and buds; chips' rocks and bombs.
  placeObjects(b, t) {
    const seen = new Set();
    for (const e of b.entities) {
      if (e.kind !== 'object' || e.removed) continue;
      seen.add(e.id);
      let m = this.objects.get(e.id);
      if (!m) {
        m = objectMesh(e, this.recipe);
        this.objects.set(e.id, m);
        this.stage.scene.add(m);
      }
      m.position.set(cellX(e.col), 0, cellZ(e.row));
      m.visible = e.alive || Math.floor(t * 20) % 2 === 0;
      m.userData.update?.(t, e);
      if (m.userData.fire && Math.random() < 0.6) this.vfx.particles.emit(m.position.x, 0.75, m.position.z, { n: 1, speed: 0.4, up: 2, color: '#ff8a2a', size: 0.2, life: 0.4, gravity: -2 });
    }
    for (const [id, m] of this.objects) {
      if (seen.has(id)) continue;
      m.removeFromParent();
      this.objects.delete(id);
    }
  }

  // Where to aim the lobby camera at the boss.
  bossFocus() {
    const r = this.boss.root;
    return new THREE.Vector3(r.position.x, this.boss.height * 0.55, r.position.z);
  }
}

function objectMesh(e, recipe) {
  const g = new THREE.Group();
  const team = e.team === 'blue';
  const tint = team ? recipe.body.colors.main : '#5a6a8a';
  switch (e.type) {
    case 'neonlamp': {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 8), toon({ color: '#2a2f4a' }));
      pole.position.y = 0.45;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glow('#ffe95a'));
      bulb.position.y = 1.0;
      g.add(pole, bulb);
      g.userData.update = (t, o) => bulb.scale.setScalar(o.anim === 'charge' ? 1.2 + 0.2 * Math.sin(t * 30) : 1);
      break;
    }
    case 'coralrock': {
      const mat = toon({ color: '#ff8ab4' });
      for (let i = 0; i < 5; i++) {
        const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4 + (i % 3) * 0.15, 4, 8), mat);
        c.position.set((i - 2) * 0.12, 0.3, (i % 2) * 0.1);
        c.rotation.z = (i - 2) * 0.25;
        g.add(c);
      }
      break;
    }
    case 'brazier': {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.3, 12), toon({ color: '#4a2a1a' }));
      bowl.position.y = 0.45;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.3, 8), toon({ color: '#2a1a10' }));
      leg.position.y = 0.15;
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), glow('#ff8a2a'));
      fire.position.y = 0.66;
      g.add(bowl, leg, fire);
      g.userData.fire = true;
      g.userData.update = (t) => fire.scale.set(1, 1.2 + 0.25 * Math.sin(t * 12), 1);
      break;
    }
    case 'thornbud': {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.5, 6), toon({ color: '#2e7a2a' }));
      stem.position.y = 0.25;
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), toon({ color: '#5ab83a' }));
      bud.position.y = 0.6;
      bud.scale.y = 1.3;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), glow('#ff8ac8'));
      tip.position.set(0.18, 0.62, 0);
      g.add(stem, bud, tip);
      g.userData.update = (t, o) => bud.scale.setScalar(o.anim === 'aim' ? 1.25 : 1 + 0.05 * Math.sin(t * 3));
      break;
    }
    case 'rockcube': {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.6), toon({ color: '#8a7a6a' }));
      cube.position.y = 0.38;
      g.add(cube);
      break;
    }
    default: {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), toon({ color: tint }));
      box.position.y = 0.3;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(team ? recipe.body.colors.glow : '#ff5a5a'));
      top.position.y = 0.62;
      g.add(box, top);
      break;
    }
  }
  g.traverse((o) => {
    if (o.isMesh && !o.material.userData.outlineParameters) o.castShadow = true;
  });
  return g;
}
