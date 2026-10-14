import { WORLD_SIZE, WATER_LEVEL } from './terrain.js';
import { CHARGE } from './sim.js';
import { CHIPS, CHIP_LEVELS } from './combat.js';
import { PARTS, SLOTS } from './parts.js';

// The open world's HUD, in plain DOM over the 3D canvas: HP and charge bars, data and rift counters, the
// crosshair, floating damage numbers, toasts and a rotating minimap centred on the player; and, for close
// combat, the lock-on target's panel and a KH2-style command panel (the reaction command and chip shortcuts).

const MAP_RADIUS = 80; // metres shown from the centre to the edge of the minimap
const NAMES = { rivet: 'RIVET', plinker: 'PLINKER', dartfin: 'DARTFIN' };
const FAMILY = { rivet: 'a Rivet', plinker: 'a Plinker', dartfin: 'a Dartfin' };
const CHIP_KEYS = Object.keys(CHIPS);
// Key labels: keyboard, or a gamepad (hold LB and press X, Y, B for chips 1-3).
const LABELS = {
  kb: { react: 'F', chip: ['1', '2', '3', '4'] },
  pad: { react: 'Y', chip: ['LB+X', 'LB+Y', 'LB+B', 'LB+A'] },
  touch: { react: 'REACT', chip: ['1', '2', '3', '4'] },
};
const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

export class Hud {
  constructor(world, view, { root = document, input = null } = {}) {
    this.world = world;
    this.view = view;
    this.input = input;
    const $ = (id) => root.getElementById(id);
    this.el = {
      hpFill: $('hpFill'), hpNum: $('hpNum'), chFill: $('chFill'), chRow: $('chRow'), data: $('data'), rifts: $('rifts'),
      cross: $('crosshair'), toast: $('toast'), nums: $('nums'), map: $('minimap'), hint: $('hint'),
      target: $('target'), tgName: $('tgName'), tgHp: $('tgHp'), tgFill: $('tgFill'), tgState: $('tgState'),
      react: $('react'), reactName: $('reactName'), deck: $('deck'), callout: $('callout'), kit: $('kit'),
    };
    this.kitShown = '';
    this.nums = [];
    this.toastT = 0;
    this.calloutT = 0;
    this.dataShown = -1;
    this.mode = 'kb';
    this.mapBg = this.renderMapBackground();
    // One row per virus family's chip, in the order they are learned.
    this.slots = CHIP_KEYS.map((_, i) => {
      const row = document.createElement('div');
      row.className = 'chip unknown';
      row.innerHTML = `<kbd>${i + 1}</kbd><span class="nm"></span><span class="lv"></span>`;
      this.el.deck?.appendChild(row);
      return { row, key: row.firstChild, nm: row.children[1], lv: row.children[2], shown: '' };
    });
    this.touchChips = [...(root.querySelectorAll?.('[data-chip]') ?? [])];
    this.touchReact = root.querySelector?.('#touch .react');
    this.touchSwitch = root.querySelector?.('#touch .sw');
    this.touchLock = root.querySelector?.('#touch .lock');
  }

  // Which key labels to show: the last thing the player used.
  pickMode() {
    if (document.body.classList.contains('touch') || this.input?.usedTouch) return 'touch';
    return this.input?.usedPad ? 'pad' : 'kb';
  }

  callout(text, color = '#ffffff', time = 0.9) {
    const c = this.el.callout;
    if (!c) return;
    c.textContent = text;
    c.style.color = color;
    c.classList.add('show');
    this.calloutT = time;
  }

  chipKey(key) {
    const i = this.world.deck.indexOf(key);
    return LABELS[this.mode].chip[i] ?? '';
  }

  renderMapBackground() {
    const T = this.world.terrain;
    const N = 192;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * WORLD_SIZE;
        const z = (j / N - 0.5) * WORLD_SIZE;
        const h = T.height(x, z);
        let rgb;
        if (h < WATER_LEVEL) rgb = [46, 120, 190];
        else if (h < WATER_LEVEL + 0.6) rgb = [200, 186, 130];
        else if (h > 24) rgb = [225, 232, 240];
        else if (T.slope(x, z) > 0.85 || h > 18) rgb = [112, 116, 124];
        else {
          const k = Math.max(0, Math.min(1, (h + 4) / 18));
          rgb = [70 + 30 * k, 140 + 25 * k, 62 + 10 * k];
        }
        const o = (j * N + i) * 4;
        img.data.set([rgb[0], rgb[1], rgb[2], 255], o);
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(20, 60, 30, 0.55)';
    for (const o of T.obstacles) {
      if (o.type !== 'tree') continue;
      g.fillRect(((o.x / WORLD_SIZE) + 0.5) * N - 0.5, ((o.z / WORLD_SIZE) + 0.5) * N - 0.5, 1, 1);
    }
    return c;
  }

  toast(text, color = '#ffffff', time = 2.2) {
    const t = this.el.toast;
    t.textContent = text;
    t.style.color = color;
    t.classList.add('show');
    this.toastT = time;
  }

  number(x, y, z, text, cls) {
    const el = document.createElement('div');
    el.className = `num ${cls}`;
    el.textContent = text;
    this.el.nums.appendChild(el);
    this.nums.push({ x, y, z, el, age: 0, drift: (Math.random() - 0.5) * 0.6 });
  }

  onEvent(ev) {
    switch (ev.type) {
      case 'enemy-hit':
        this.number(ev.x, ev.y, ev.z, ev.counter ? `${ev.amount} COUNTER!` : String(ev.amount), ev.counter ? 'counter' : ev.amount >= 40 ? 'big' : '');
        break;
      case 'armor':
        this.number(ev.x, ev.y + 0.4, ev.z, 'ARMOR', 'armor');
        break;
      case 'reaction':
        this.callout(`${ev.label}!`, '#ffd84a');
        break;
      case 'chip-use':
        this.callout(`${CHIPS[ev.chip].name.toUpperCase()}${ev.level > 1 ? ` LV${ev.level}` : ''}${ev.finish ? ' · FINISH ×2' : ''}`, css(CHIPS[ev.chip].color), ev.finish ? 1.1 : 0.8);
        break;
      case 'chip-denied': {
        const slot = this.slots[this.world.deck.indexOf(ev.chip)];
        if (slot) {
          slot.row.classList.remove('denied');
          void slot.row.offsetWidth; // restart the shake
          slot.row.classList.add('denied');
        }
        break;
      }
      case 'chip-learn': {
        const name = CHIPS[ev.chip].name.toUpperCase();
        const how = this.mode === 'touch' ? 'TAP' : 'PRESS';
        if (ev.level === 1) this.toast(`NEW CHIP · ${name} · ${how} ${this.chipKey(ev.chip)}`, css(CHIPS[ev.chip].color), 3.2);
        else this.toast(`${name} LV${ev.level}`, css(CHIPS[ev.chip].color), 2.4);
        break;
      }
      case 'lock-none':
        this.toast('NO TARGET IN RANGE', '#8a9cc8', 1.2);
        break;
      case 'part-found':
        if (ev.part) this.toast(`PART FOUND · ${PARTS[ev.part].name.toUpperCase()} · ${this.mode === 'touch' ? 'TAP GARAGE' : this.mode === 'pad' ? 'BACK: GARAGE' : 'G: GARAGE'}`, css(PARTS[ev.part].color), 3.4);
        else this.toast(`+${ev.data} DATA`, '#6affa0', 2);
        break;
      case 'part-bought':
        this.toast(`BOUGHT ${PARTS[ev.part].name.toUpperCase()} · −${ev.price} DATA`, css(PARTS[ev.part].color), 1.6);
        break;
      case 'part-equipped':
        this.toast(`${PARTS[ev.part].name.toUpperCase()} EQUIPPED`, css(PARTS[ev.part].color), 1.6);
        break;
      case 'garage-denied':
        if (ev.reason === 'combat') this.toast('VIRUSES NEARBY · FINISH THE FIGHT FIRST', '#ff6a6a', 2);
        else if (ev.reason === 'data') this.toast('NOT ENOUGH DATA', '#ff6a6a', 1.6);
        break;
      case 'hurt':
        this.number(ev.x, ev.y, ev.z, `-${ev.amount}`, 'hurt');
        break;
      case 'zone-wake':
        this.toast('RIFT OPEN · VIRUSES INCOMING', '#ff7ae0');
        break;
      case 'zone-clear':
        this.toast('RIFT SEALED', '#6affa0', 2.6);
        break;
      case 'down':
        this.toast('SYSTEM DOWN · REBOOTING…', '#ff6a6a', 3);
        break;
      case 'respawn':
        this.toast('BACK ONLINE', '#6ae8ff', 1.5);
        break;
      case 'wave':
        this.toast(`ALL RIFTS SEALED · WAVE ${ev.wave} INCOMING`, '#ffd84a', 3.2);
        break;
      default:
    }
  }

  update(dt) {
    const w = this.world;
    const p = w.player;
    const el = this.el;
    const hpK = p.hp / p.maxHp;
    el.hpFill.style.width = `${hpK * 100}%`;
    el.hpFill.classList.toggle('low', hpK < 0.3);
    el.hpNum.textContent = String(Math.ceil(p.hp));
    const ch = p.charging ? Math.min(1, p.charge / CHARGE.full) : 0;
    el.chFill.style.width = `${ch * 100}%`;
    el.chFill.classList.toggle('full', p.chargeFull);
    el.chRow.classList.toggle('on', p.charging);
    if (w.wallet !== this.dataShown) {
      this.dataShown = w.wallet;
      el.data.textContent = `DATA ${w.wallet}`;
    }
    const kit = Object.values(w.loadout).join();
    if (el.kit && kit !== this.kitShown) {
      this.kitShown = kit;
      el.kit.innerHTML = SLOTS.map((slot) => `<span style="color:${css(PARTS[w.loadout[slot]].color)}">${PARTS[w.loadout[slot]].name.toUpperCase()}</span>`).join('');
    }
    const sealed = w.zones.filter((z) => z.state === 'cleared').length;
    el.rifts.textContent = `RIFTS ${sealed}/${w.zones.length}${w.wave > 1 ? ` · WAVE ${w.wave}` : ''}`;
    const target = w.lockTarget();
    el.cross.classList.toggle('lock', !!this.view.aimTarget);
    el.cross.classList.toggle('off', !!target); // locked on, the reticle on the target takes over
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) el.toast.classList.remove('show');
    }
    if (this.calloutT > 0) {
      this.calloutT -= dt;
      if (this.calloutT <= 0) el.callout.classList.remove('show');
    }
    this.mode = this.pickMode();
    this.updateTarget(target);
    this.updateCommands();
    // Damage numbers float up from where they happened.
    for (const n of this.nums) {
      n.age += dt;
      const s = this.view.project(n.x + n.drift * n.age, n.y + n.age * 1.4, n.z);
      if (!s || n.age > 0.9) {
        n.el.style.opacity = '0';
      } else {
        n.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
        n.el.style.opacity = String(Math.min(1, (0.9 - n.age) * 4));
      }
    }
    this.nums = this.nums.filter((n) => {
      if (n.age > 0.9) {
        n.el.remove();
        return false;
      }
      return true;
    });
    this.drawMap();
  }

  // The lock-on target: name, HP, and a warning while it winds up an attack (hit it then for a counter).
  updateTarget(t) {
    const el = this.el;
    if (!el.target) return;
    el.target.classList.toggle('on', !!t);
    if (!t) return;
    el.tgName.textContent = NAMES[t.type] ?? t.type.toUpperCase();
    el.tgHp.textContent = `${Math.max(0, Math.ceil(t.hp))} / ${t.maxHp}`;
    el.tgFill.style.width = `${Math.max(0, t.hp / t.maxHp) * 100}%`;
    el.tgState.textContent = t.state === 'windup' ? 'ATTACKING · HIT IT NOW TO COUNTER' : t.armor > 0 ? 'ARMORED · DODGE AND WAIT' : '';
  }

  // The reaction command and chip shortcuts (desktop panel and touch buttons).
  updateCommands() {
    const w = this.world;
    const el = this.el;
    const L = LABELS[this.mode];
    const r = w.player.alive ? w.player.reaction : null;
    if (el.react) {
      el.react.classList.toggle('ready', !!r);
      el.reactName.textContent = r ? `${r.label}!` : '—';
      el.react.firstChild.textContent = L.react;
    }
    if (this.touchReact) {
      this.touchReact.classList.toggle('ready', !!r);
      this.touchReact.textContent = r ? r.label : 'REACT';
    }
    const locked = !!w.lockTarget();
    this.touchSwitch?.classList.toggle('ready', locked);
    this.touchLock?.classList.toggle('ready', locked);
    // Learned chips first, then the families still to delete.
    const unknown = CHIP_KEYS.filter((k) => !w.deck.includes(k));
    this.slots.forEach((slot, i) => {
      const key = w.deck[i];
      const c = key && w.chips[key];
      const cd = c ? Math.min(1, (w.chipCd[key] ?? 0) / (CHIPS[key].cooldown * w.kit.chipCd)) : 0;
      const label = c ? `${key}:${c.level}:${L.chip[i]}` : `?${unknown[i - w.deck.length]}:${L.chip[i]}`;
      if (label !== slot.shown) {
        slot.shown = label;
        slot.row.classList.toggle('unknown', !c);
        slot.key.textContent = L.chip[i];
        const btn = this.touchChips[i];
        btn?.classList.toggle('unknown', !c);
        if (btn) btn.textContent = c ? CHIPS[key].short : '???';
        if (c) {
          slot.nm.textContent = CHIPS[key].name;
          slot.lv.textContent = '●'.repeat(c.level) + '○'.repeat(CHIP_LEVELS.length - 1 - c.level);
          slot.row.style.setProperty('--chip', css(CHIPS[key].color));
          btn?.style.setProperty('--chip', css(CHIPS[key].color));
        } else {
          const from = CHIPS[unknown[i - w.deck.length]]?.from;
          slot.nm.textContent = from ? `??? · delete ${FAMILY[from]}` : '???';
          slot.lv.textContent = '';
        }
      }
      slot.row.style.setProperty('--cd', cd.toFixed(3));
      this.touchChips[i]?.style.setProperty('--cd', cd.toFixed(3));
    });
  }

  drawMap() {
    const cv = this.el.map;
    const W = cv.width;
    const g = cv.getContext('2d');
    const p = this.world.player;
    const yaw = this.view.cam.yaw;
    const s = W / 2 / MAP_RADIUS;
    const cx = W / 2;
    const cy = W / 2;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // World point -> minimap, heading-up (the camera's forward points up).
    const toMap = (x, z) => {
      const dx = x - p.x;
      const dz = z - p.z;
      return [cx + (-cos * dx + sin * dz) * s, cy - (sin * dx + cos * dz) * s];
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(cx, cy, W / 2 - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#10203a';
    g.fillRect(0, 0, W, W);
    const N = this.mapBg.width;
    const a = WORLD_SIZE / N;
    const b = -WORLD_SIZE / 2;
    g.imageSmoothingEnabled = true;
    g.setTransform(-s * a * cos, -s * a * sin, s * a * sin, -s * a * cos,
      s * (-cos * (b - p.x) + sin * (b - p.z)) + cx, -s * (sin * (b - p.x) + cos * (b - p.z)) + cy);
    g.drawImage(this.mapBg, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Rifts.
    for (const z of this.world.zones) {
      const [x, y] = toMap(z.x, z.z);
      g.fillStyle = z.state === 'cleared' ? '#5aff9a' : '#ff4ad8';
      g.strokeStyle = '#0a0c18';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y - 12);
      g.lineTo(x + 10, y);
      g.lineTo(x, y + 12);
      g.lineTo(x - 10, y);
      g.closePath();
      g.stroke();
      g.fill();
    }
    // Viruses; the lock-on target is ringed in gold.
    g.fillStyle = '#ff4a4a';
    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      const [x, y] = toMap(e.x, e.z);
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
    const t = this.world.lockTarget();
    if (t) {
      const [x, y] = toMap(t.x, t.z);
      g.strokeStyle = '#ffd84a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, 11, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    // The player: an arrow for its facing (relative to the camera).
    const rel = p.yaw - yaw;
    g.save();
    g.translate(cx, cy);
    g.rotate(-rel);
    g.fillStyle = '#6ae8ff';
    g.strokeStyle = '#0a0c18';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -16);
    g.lineTo(12, 12);
    g.lineTo(0, 6);
    g.lineTo(-12, 12);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(138, 176, 255, 0.8)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
