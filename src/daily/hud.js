import * as THREE from 'three';
import { TIMING } from '../engine/constants.js';
import { chipCanvas } from './chips.js';
import { cellX, cellZ } from './view/stage.js';

// The battle HUD over the 3D scene: the navi's HP (BN's top-left box), the boss's name and bar, the Custom
// Gauge with the fight clock, the queued chips, banners (BATTLE START, COUNTER, fusions, the boss's moves),
// floating damage numbers and, in a challenge, the rival's pace: the boss's HP in their run at this moment.

const $ = (id) => document.getElementById(id);

export const clock = (frames) => {
  const s = frames / 60;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};

export class Hud {
  constructor(stage) {
    this.stage = stage;
    this.root = $('hud');
    this.el = {
      hp: $('hudHp'), hpNum: $('hudHpNum'), name: $('hudName'), gauge: $('hudGauge'), gaugeFill: $('hudGaugeFill'), gaugeLbl: $('hudGaugeLbl'), timer: $('hudTimer'),
      bossName: $('hudBossName'), bossHp: $('hudBossHp'), bossFill: $('hudBossFill'), bossLag: $('hudBossLag'), rival: $('hudRival'), rivalFill: $('hudRivalFill'), rivalTag: $('hudRivalTag'),
      queue: $('hudQueue'), banners: $('hudBanners'), dmg: $('hudDmg'), flash: $('flashScreen'),
    };
    this.last = {};
    this.v = new THREE.Vector3();
    this.rival = null; // { name, hp: Float32Array by fight frame / 6, seconds }
  }

  show(on) {
    this.root.hidden = !on;
  }

  start(b, recipe, name, rival = null) {
    this.b = b;
    this.recipe = recipe;
    this.el.name.textContent = name;
    this.el.bossName.textContent = `${recipe.name.toUpperCase()} ${recipe.tierName}`;
    this.rival = rival;
    this.el.rival.hidden = !rival;
    if (rival) this.el.rivalTag.textContent = `${rival.name}'s pace · ${clock(rival.seconds * 60)}`;
    this.el.banners.textContent = '';
    this.el.dmg.textContent = '';
    this.last = {};
    this.boss = b.entities.find((e) => e.kind === 'navi');
  }

  set(key, value, fn) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    fn(value);
  }

  update() {
    const b = this.b;
    if (!b) return;
    const p = b.player;
    const e = this.boss;
    this.set('hp', p.hp, (v) => (this.el.hpNum.textContent = Math.max(0, v)));
    this.set('low', p.hp > 0 && p.hp <= p.maxHp * 0.25, (v) => this.el.hp.classList.toggle('low', v));
    const bossPct = e ? Math.max(0, e.hp) / e.maxHp : 0;
    this.set('boss', e?.hp ?? 0, (v) => {
      this.el.bossHp.textContent = Math.max(0, v);
      this.el.bossFill.style.width = `${(bossPct * 100).toFixed(1)}%`;
      this.el.bossLag.style.width = `${(bossPct * 100).toFixed(1)}%`;
    });
    const g = Math.min(1, b.gauge / TIMING.GAUGE_FULL);
    this.set('gauge', Math.round(g * 200), () => (this.el.gaugeFill.style.width = `${(g * 100).toFixed(1)}%`));
    this.set('full', b.gaugeFull, (v) => {
      this.el.gauge.classList.toggle('full', v);
      this.el.gaugeLbl.textContent = v ? 'CUSTOM READY · L / R' : 'CUSTOM';
    });
    this.set('time', Math.floor(b.fightFrames / 6), () => (this.el.timer.textContent = clock(b.fightFrames)));
    const q = b.controller.chips;
    this.set('queue', q.map((c) => c.key).join(','), () => this.drawQueue(q));
    if (this.rival) {
      const i = Math.min(this.rival.hp.length - 1, Math.floor(b.fightFrames / 6));
      const pct = this.rival.hp[i] ?? 0;
      this.set('rival', Math.round(pct * 500), () => (this.el.rivalFill.style.width = `${(pct * 100).toFixed(1)}%`));
    }
  }

  drawQueue(q) {
    const el = this.el.queue;
    el.textContent = '';
    if (!q.length) return;
    const next = document.createElement('div');
    next.className = 'next';
    next.append(chipCanvas(q[0].key, false));
    const txt = document.createElement('div');
    txt.innerHTML = `<div class="nm"></div><div class="dm"></div>`;
    txt.querySelector('.nm').textContent = q[0].name;
    txt.querySelector('.dm').textContent = q[0].damage ? q[0].damage : '';
    next.append(txt);
    el.append(next);
    for (const c of q.slice(1, 5)) {
      const s = document.createElement('div');
      s.className = 'small';
      s.append(chipCanvas(c.key, false));
      el.append(s);
    }
  }

  banner(text, kind = '', ms = 1100) {
    const d = document.createElement('div');
    d.className = `banner ${kind}`;
    d.textContent = text;
    if (kind === 'callout') for (const old of this.el.banners.querySelectorAll('.callout')) old.remove();
    this.el.banners.append(d);
    setTimeout(() => d.remove(), ms);
  }

  // A damage number over panel (col, row), `h` world units up.
  damage(amount, col, row, { me = false, big = false, h = 1.6 } = {}) {
    const v = this.v.set(cellX(col), h, cellZ(row)).project(this.stage.camera);
    const d = document.createElement('div');
    d.className = `dmg${big ? ' big' : ''}${me ? ' me' : ''}`;
    d.textContent = amount;
    d.style.left = `${((v.x + 1) / 2) * 100}%`;
    d.style.top = `${((1 - v.y) / 2) * 100}%`;
    this.el.dmg.append(d);
    setTimeout(() => d.remove(), 800);
  }

  flash(color = '#ffffff') {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = '0.75';
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 0.35s';
      f.style.opacity = '0';
    });
  }
}
