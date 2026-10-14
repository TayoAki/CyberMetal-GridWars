import { WORLD_SIZE, WATER_LEVEL } from './terrain.js';
import { CHARGE } from './sim.js';

// The open world's HUD, in plain DOM over the 3D canvas: HP and charge bars, data and rift counters, the
// crosshair, floating damage numbers, toasts and a rotating minimap centred on the player.

const MAP_RADIUS = 80; // metres shown from the centre to the edge of the minimap

export class Hud {
  constructor(world, view, root = document) {
    this.world = world;
    this.view = view;
    const $ = (id) => root.getElementById(id);
    this.el = {
      hpFill: $('hpFill'), hpNum: $('hpNum'), chFill: $('chFill'), chRow: $('chRow'), data: $('data'), rifts: $('rifts'),
      cross: $('crosshair'), toast: $('toast'), nums: $('nums'), map: $('minimap'), hint: $('hint'),
    };
    this.nums = [];
    this.toastT = 0;
    this.dataShown = -1;
    this.mapBg = this.renderMapBackground();
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
    if (w.stats.data !== this.dataShown) {
      this.dataShown = w.stats.data;
      el.data.textContent = `DATA ${w.stats.data}`;
    }
    const sealed = w.zones.filter((z) => z.state === 'cleared').length;
    el.rifts.textContent = `RIFTS ${sealed}/${w.zones.length}${w.wave > 1 ? ` · WAVE ${w.wave}` : ''}`;
    el.cross.classList.toggle('lock', !!this.view.aimTarget);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) el.toast.classList.remove('show');
    }
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
    // Viruses.
    g.fillStyle = '#ff4a4a';
    for (const e of this.world.enemies) {
      if (!e.alive) continue;
      const [x, y] = toMap(e.x, e.z);
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
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
