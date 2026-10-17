import { PARTS, SLOTS, SLOT_NAMES, partsIn, partStats, buildKit } from './parts.js';
import {
  ELEMENTS, ELEMENT_KEYS, MODS, MOD_KEYS, FORM, MAX_DESIGNS, MAX_MODS, basesFor, capacityOf, memoryUsed, defaultDesign,
  normalizeDesign, encodeDesign, decodeDesign, designSummary, cleanName, weakViruses, applyDesign, weaponStats, modFits, NAME_MAX,
} from './forge.js';

// The garage: a menu over the world where you buy parts with DATA and equip them, the forge, where you
// design your own weapons, and BODY, where you pick the mech or your own 3D character (a .glb). It only opens out of combat (the World checks too). It sends commands to the game
// ({ op, part } for parts; forge, equip-design, delete-design, unlock and dummy for the forge), which passes
// them to the simulation through its input, so a garage visit replays like any other input.
//
// Keyboard: Q/E (or left/right on the part tabs) change tab, up/down (W/S) pick, Enter/Space/J choose, Esc or
// G close. In the forge, the arrows move between and along the rows. Gamepad: LB/RB change tab, the d-pad
// moves, A chooses, B or Back closes. Touch and mouse: tap.

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
const TABS = [...SLOTS, 'forge', 'body'];
const TAB_NAMES = { ...SLOT_NAMES, forge: 'FORGE', body: 'BODY' };
// The BODY tab's cards. The body itself is the view's business (main.js), not the simulation's.
const BODY_KEYS = ['mech', 'custom', 'load', 'turn'];
const COLOR_NAMES = ['Cyan', 'Blue', 'Violet', 'Pink', 'Red', 'Orange', 'Gold', 'Lime', 'Green', 'Teal', 'White', 'Steel'];
const VIRUS = { rivet: ['Rivet', 'Rivets'], plinker: ['Plinker', 'Plinkers'], dartfin: ['Dartfin', 'Dartfins'] };
// Words for random names: one for the element, one for the base.
const NAME_A = { none: ['Prime', 'Steel', 'Null', 'Zero'], fire: ['Ember', 'Blaze', 'Flare', 'Magma'], aqua: ['Tide', 'Frost', 'Wave', 'Mist'], elec: ['Volt', 'Spark', 'Storm', 'Arc'], wood: ['Thorn', 'Leaf', 'Root', 'Moss'] };
const NAME_B = { saber: ['Edge', 'Blade', 'Fang'], breaker: ['Maul', 'Crusher', 'Hammer'], lance: ['Pike', 'Spear', 'Lance'], claws: ['Talon', 'Claw', 'Ripper'], buster: ['Buster', 'Blaster', 'Cannon'], spreader: ['Fan', 'Spray', 'Scatter'], railgun: ['Rail', 'Needle', 'Lancer'], bomber: ['Mortar', 'Bomber', 'Lobber'] };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const editable = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
const copyDesign = (d) => ({ ...d, form: { ...d.form }, mods: [...d.mods] });
const same = (a, b) => !!a && !!b && JSON.stringify(normalizeDesign(a).design ?? a) === JSON.stringify(normalizeDesign(b).design ?? b);
// Replace an element's contents only when they change, so a refresh never swaps out a button mid-click (the
// name box's blur refreshes between a button's press and its release) and keeps focus and hover where they are.
const shown = new WeakMap();
function setHTML(el, html) {
  if (shown.get(el) === html) return;
  shown.set(el, html);
  el.innerHTML = html;
}

export class Garage {
  constructor(root, world, { onCommand, onClose, onDenied, onPreview, onBody } = {}) {
    this.root = root;
    this.world = world;
    this.onCommand = onCommand ?? (() => {});
    this.onClose = onClose ?? (() => {});
    this.onDenied = onDenied ?? (() => {});
    this.onPreview = onPreview ?? (() => {});
    this.onBody = onBody ?? (() => {}); // (choice: 'mech' | 'custom' | 'load' | 'turn', { pad })
    // What BODY shows, kept up to date by main.js: the body in use, its turn, the player's model, busy loading.
    this.body = { current: 'mech', turn: 0, custom: null, busy: false };
    this.open = false;
    this.slot = 'arm'; // the current tab: a part slot, or 'forge'
    this.index = 0;
    this.padPrev = [];
    // The forge's state: the design being edited (a copy; `id` set once saved), and what to do once the
    // simulation confirms a save.
    this.draft = null;
    this.awaiting = null; // { equip, test } after a forge command
    this.panel = null; // 'share' | 'import' | null
    this.deleteArmed = 0;
    root.innerHTML = `
      <div class="gcard">
        <header class="ghead"><h2 id="garageTitle">GARAGE</h2><span class="gdata" data-g="data"></span><button class="gclose" data-g="close" aria-label="Close the garage">✕</button></header>
        <div class="gtabs" role="tablist" aria-label="Garage sections">${TABS.map((s) => `<button role="tab" data-slot="${s}"${s === 'forge' ? ' class="ftab"' : ''}>${TAB_NAMES[s]}<small data-g="eq-${s}"></small></button>`).join('')}</div>
        <div class="gparts" data-g="parts" role="tabpanel"></div>
        <div class="gforge" data-g="forge" role="tabpanel" hidden>
          <div class="frow flistrow" data-row><span class="flbl">WEAPONS <b data-f="count"></b></span><div class="fopts" data-f="list"></div></div>
          <div class="fedit" data-f="edit">
            <div class="frow" data-row><label class="flbl" for="forgeName">NAME</label><div class="fopts fname"><input id="forgeName" data-f="name" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" enterkeyhint="done"><button class="fopt" data-act="random" data-k="random" aria-label="Random weapon: a surprise design from what you have">RANDOM</button></div></div>
            <div class="frow" data-row><span class="flbl">BASE</span><div class="fopts" data-f="base"></div></div>
            <div class="frow" data-row><span class="flbl">SHAPE</span><div class="fopts" data-f="shape"></div></div>
            <div class="frow" data-row><span class="flbl">SIZE</span><div class="fopts" data-f="size"></div></div>
            <div class="frow" data-row><span class="flbl">BODY</span><div class="fopts swatches" data-f="color"></div></div>
            <div class="frow" data-row><span class="flbl">GLOW</span><div class="fopts swatches" data-f="glow"></div></div>
            <div class="frow" data-row><span class="flbl">ELEMENT</span><div class="fopts" data-f="element"></div></div>
            <div class="frow fmemrow"><span class="flbl">MEMORY</span><div class="fmem" data-f="mem"></div><span class="fmemtxt" data-f="memtxt"></span></div>
            <div class="fmods" data-f="mods"></div>
            <ul class="fsum" data-f="sum"></ul>
            <dl class="fstats" data-f="stats" aria-label="Numbers, against what you have equipped"></dl>
            <div class="ffoot">
              <div class="fpanel" data-row data-f="panel" hidden></div>
              <p class="fwarn" data-f="warn" role="status"></p>
              <div class="factions" data-row data-f="actions"></div>
            </div>
          </div>
        </div>
        <p class="ghint" data-g="hint"></p>
      </div>`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'garageTitle');
    this.$ = (k) => root.querySelector(`[data-g="${k}"]`);
    this.f = (k) => root.querySelector(`[data-f="${k}"]`);
    this.$('close').addEventListener('click', () => this.close());
    for (const tab of root.querySelectorAll('[data-slot]')) tab.addEventListener('click', () => this.setSlot(tab.dataset.slot));
    this.$('parts').addEventListener('click', (e) => {
      const card = e.target.closest('[data-part]');
      if (card) this.choose(card.dataset.part);
      const body = e.target.closest('[data-body]');
      if (body) this.chooseBody(body.dataset.body);
    });
    this.$('forge').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b && !b.disabled) this.act(b.dataset.act, b.dataset.v);
    });
    const name = this.f('name');
    name.addEventListener('input', () => {
      if (!this.draft) return;
      this.draft.name = name.value;
      this.refresh();
    });
    name.addEventListener('blur', () => {
      if (!this.draft) return;
      this.draft.name = cleanName(name.value, `My ${PARTS[this.draft.base].name}`);
      name.value = this.draft.name;
      this.refresh();
    });
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    this.index = this.startIndex(this.slot);
    this.render();
    this.focusFirst();
    this.preview();
  }

  // Where a tab's cursor starts: on the equipped part, or the body in use.
  startIndex(slot) {
    if (slot === 'forge') return this.index;
    if (slot === 'body') return Math.max(0, BODY_KEYS.indexOf(this.body.current));
    return Math.max(0, partsIn(slot).indexOf(this.world.loadout[slot]));
  }

  // The cards of the current tab (parts, or the BODY choices).
  cardKeys() {
    return this.slot === 'body' ? BODY_KEYS : partsIn(this.slot);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.panel = null;
    this.onPreview(null);
    this.onClose();
  }

  setSlot(slot) {
    this.slot = slot;
    if (slot !== 'forge') this.index = this.startIndex(slot);
    else if (!this.draft) this.startDraft();
    this.render();
    this.focusFirst();
    this.preview();
  }

  cycleTab(step) {
    this.setSlot(TABS[(TABS.indexOf(this.slot) + TABS.length + step) % TABS.length]);
  }

  focusFirst() {
    if (this.slot === 'forge') {
      const on = this.f('list').querySelector('.on') ?? this.f('list').querySelector('button');
      on?.focus({ preventScroll: true });
    } else this.focusCard();
  }

  // ---------------------------------------------------------------- parts

  // Buy (then equip) or equip a part.
  choose(part) {
    const w = this.world;
    const def = PARTS[part];
    if (!def) return;
    if (w.owned.has(part)) {
      if (w.loadout[def.slot] !== part || w.equipped[def.slot]) this.onCommand({ op: 'equip', part });
      return;
    }
    if (w.wallet < def.price) {
      this.onDenied(`NEED ${def.price - w.wallet} MORE DATA`);
      this.shake(this.root.querySelector(`[data-part="${part}"]`));
      return;
    }
    this.onCommand({ op: 'buy', part });
    this.onCommand({ op: 'equip', part });
  }

  shake(el) {
    el?.classList.remove('deny');
    void el?.offsetWidth; // restart the shake
    el?.classList.add('deny');
  }

  focusCard() {
    this.root.querySelectorAll('[data-part], [data-body]')[this.index]?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- the body

  // A BODY card was chosen. `pad`: from a gamepad, which can't open a file picker (only a click, tap or key can).
  chooseBody(key, { pad = false } = {}) {
    if (this.body.busy) return;
    if (key === 'custom' && !this.body.custom) {
      this.onDenied('LOAD A .GLB FIRST');
      this.shake(this.root.querySelector('[data-body="custom"]'));
      return;
    }
    if (key === 'turn' && this.body.current !== 'custom') {
      this.onDenied('TURN IS FOR YOUR OWN MODEL');
      this.shake(this.root.querySelector('[data-body="turn"]'));
      return;
    }
    this.onBody(key, { pad });
  }

  // ---------------------------------------------------------------- the forge

  // Start editing: the equipped design, else the first saved one, else a new arm weapon.
  startDraft() {
    const w = this.world;
    const d = w.designs.find((x) => x.id === w.equipped.arm) ?? w.designs.find((x) => x.id === w.equipped.gun) ?? w.designs[0];
    this.edit(d ? copyDesign(d) : this.fresh('arm'));
  }

  fresh(slot) {
    const w = this.world;
    const base = w.owned.has(w.loadout[slot]) ? w.loadout[slot] : basesFor(slot).find((b) => w.owned.has(b));
    return defaultDesign(slot, base);
  }

  edit(design) {
    this.draft = design;
    this.panel = null;
    this.deleteArmed = 0;
    this.f('name').value = design.name;
  }

  saved() {
    return this.draft?.id ? this.world.designs.find((d) => d.id === this.draft.id) ?? null : null;
  }

  // What stops the draft being forged, as text for the player (or null).
  problem() {
    const w = this.world;
    const d = this.draft;
    const { error } = normalizeDesign(d);
    if (error) return error === 'not enough memory' ? `Over memory by ${memoryUsed(d.mods) - capacityOf(d)} MB: take a mod off.` : `${error[0].toUpperCase()}${error.slice(1)}.`;
    if (!w.owned.has(d.base)) return `You don't own the ${PARTS[d.base].name} yet: buy it in the ${SLOT_NAMES[d.slot]} tab.`;
    const unlearned = d.mods.find((m) => !w.programs.has(m) && !w.modLearned(m));
    if (unlearned) {
      const { from, deletes } = MODS[unlearned].learn;
      const need = deletes - w.deletesOf(from);
      return `${MODS[unlearned].name} isn't learned yet: delete ${need} more ${VIRUS[from][need === 1 ? 0 : 1]}.`;
    }
    const locked = d.mods.filter((m) => !w.programs.has(m));
    if (locked.length) return `Unlock ${locked.map((m) => `${MODS[m].name} (${MODS[m].price} DATA)`).join(' and ')} to forge this.`;
    if (!this.saved() && w.designs.length >= MAX_DESIGNS) return `${MAX_DESIGNS} weapons at most: delete one to forge another.`;
    return null;
  }

  // Send the draft to be forged; `then` ({ equip, test }) runs when the simulation confirms.
  forge(then = {}) {
    const d = normalizeDesign(this.draft).design;
    if (!d) return;
    if (this.saved() && same(d, this.saved())) return this.after(this.draft.id, then);
    this.awaiting = then;
    this.onCommand({ op: 'forge', design: { ...d, id: this.saved() ? this.draft.id : undefined } });
  }

  after(id, { equip = false, test = false }) {
    const w = this.world;
    const d = w.designs.find((x) => x.id === id);
    if ((equip || test) && d && w.equipped[d.slot] !== id) this.onCommand({ op: 'equip-design', id });
    if (test) {
      this.onCommand({ op: 'dummy' });
      this.close();
    }
  }

  act(a, v) {
    const w = this.world;
    const d = this.draft;
    switch (a) {
      case 'pick': {
        const picked = w.designs.find((x) => x.id === Number(v));
        if (picked) this.edit(copyDesign(picked));
        break;
      }
      case 'new':
        this.edit(this.fresh(v));
        break;
      case 'base':
        if (!w.owned.has(v)) {
          this.onDenied(`BUY THE ${PARTS[v].name.toUpperCase()} IN THE ${SLOT_NAMES[d.slot]} TAB FIRST`);
          return;
        }
        if (d.name === `My ${PARTS[d.base].name}`) this.f('name').value = d.name = `My ${PARTS[v].name}`;
        d.base = v;
        d.mods = d.mods.filter((m) => !(MODS[m].not ?? []).includes(v)); // e.g. Pierce comes off a Bomber
        break;
      case 'shape':
      case 'size':
      case 'color':
      case 'glow':
        d.form[a] = Number(v);
        break;
      case 'element':
        d.element = v;
        break;
      case 'mod':
        if (d.mods.includes(v)) d.mods = d.mods.filter((m) => m !== v);
        else if (d.mods.length >= MAX_MODS) return this.onDenied(`${MAX_MODS} MODS AT MOST`);
        else if (memoryUsed([...d.mods, v]) > capacityOf(d)) return this.onDenied('NOT ENOUGH MEMORY · TAKE A MOD OFF');
        else d.mods = MOD_KEYS.filter((m) => m === v || d.mods.includes(m));
        break;
      case 'unlock': {
        const learn = MODS[v].learn;
        if (!w.modLearned(v)) {
          const need = learn.deletes - w.deletesOf(learn.from);
          return this.onDenied(`DELETE ${need} MORE ${VIRUS[learn.from][need === 1 ? 0 : 1].toUpperCase()} TO LEARN ${MODS[v].name.toUpperCase()}`);
        }
        if (w.wallet < MODS[v].price) return this.onDenied(`NEED ${MODS[v].price - w.wallet} MORE DATA`);
        this.onCommand({ op: 'unlock', mod: v });
        return;
      }
      case 'random':
        this.randomize();
        break;
      case 'save':
        this.forge();
        return;
      case 'equip':
        this.forge({ equip: true });
        return;
      case 'test':
        this.forge({ test: true });
        return;
      case 'share':
      case 'import':
        this.panel = this.panel === a ? null : a;
        break;
      case 'copy':
        this.copyCode();
        return;
      case 'load':
        this.importCode();
        return;
      case 'delete':
        if (!this.saved()) return;
        if (performance.now() - this.deleteArmed > 3000) {
          this.deleteArmed = performance.now();
          break;
        }
        this.onCommand({ op: 'delete-design', id: d.id });
        return;
      case 'revert':
        if (this.saved()) this.edit(copyDesign(this.saved()));
        break;
      default:
        return;
    }
    this.refresh();
    this.preview();
  }

  // A surprise design (the look, an element and mods that fit), from the bases you own and the mods you have
  // unlocked. Not part of the simulation, so ordinary randomness is fine; you still choose whether to forge it.
  randomize() {
    const w = this.world;
    const d = this.draft;
    const owned = basesFor(d.slot).filter((b) => w.owned.has(b));
    d.base = pick(owned.length ? owned : [d.base]);
    d.form = { shape: Math.floor(Math.random() * 4), size: Math.floor(Math.random() * 3), color: Math.floor(Math.random() * FORM.palette.length), glow: Math.floor(Math.random() * FORM.palette.length) };
    d.element = pick(ELEMENT_KEYS);
    d.mods = [];
    const pool = MOD_KEYS.filter((m) => w.programs.has(m) && modFits(m, d)).sort(() => Math.random() - 0.5);
    for (const m of pool) if (d.mods.length < MAX_MODS && memoryUsed([...d.mods, m]) <= capacityOf(d) && Math.random() < 0.7) d.mods.push(m);
    d.mods = MOD_KEYS.filter((m) => d.mods.includes(m));
    d.name = `${pick(NAME_A[d.element])} ${pick(NAME_B[d.base])}`;
    this.f('name').value = d.name;
  }

  copyCode() {
    const input = this.f('panel').querySelector('input');
    if (!input) return;
    input.select();
    const done = () => {
      const b = this.f('panel').querySelector('[data-act="copy"]');
      if (b) b.textContent = 'COPIED';
    };
    try {
      navigator.clipboard.writeText(input.value).then(done, () => document.execCommand?.('copy') && done());
    } catch {
      if (document.execCommand?.('copy')) done();
    }
  }

  importCode() {
    const input = this.f('panel').querySelector('input');
    const { design, error } = decodeDesign(input?.value);
    const msg = this.f('panel').querySelector('.fmsg');
    if (error) {
      if (msg) msg.textContent = error;
      this.shake(input);
      return;
    }
    this.edit(design);
    this.refresh();
    this.preview();
    this.f('name').focus({ preventScroll: true });
  }

  preview() {
    this.onPreview(this.open && this.slot === 'forge' && this.draft ? this.draft : null);
  }

  // Something changed in the simulation (from main.js's event loop).
  onEvent(ev) {
    if (ev.type === 'design-saved' && this.awaiting) {
      const then = this.awaiting;
      this.awaiting = null;
      if (this.draft && !this.saved()) this.draft.id = ev.id;
      this.after(ev.id, then);
    } else if (ev.type === 'garage-denied') this.awaiting = null;
    else if (ev.type === 'design-deleted' && this.draft?.id === ev.id) {
      const next = this.world.designs[0];
      this.edit(next ? copyDesign(next) : this.fresh(this.draft.slot));
      this.preview();
    }
    if (this.open && (ev.type.startsWith('part-') || ev.type.startsWith('design-') || ev.type === 'program-unlocked' || ev.type === 'garage-denied')) this.render();
  }

  // ---------------------------------------------------------------- input

  onKey(e) {
    if (!this.open) return;
    const k = e.code;
    if (editable(e.target)) {
      // Typing in the name or code box: only Escape (leave the box), Enter (done, or load a code) and up/down
      // (on to the next row) are the menu's.
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        this.moveFocus(0, k === 'ArrowUp' ? -1 : 1);
        e.preventDefault();
        e.stopPropagation();
      } else if (k === 'Escape' || k === 'Enter' || k === 'NumpadEnter') {
        if (k !== 'Escape' && e.target.dataset.code) this.importCode();
        else e.target.blur();
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    let used = true;
    if (k === 'Escape' || k === 'KeyG' || k === 'Backspace') this.close();
    else if (k === 'KeyQ') this.cycleTab(-1);
    else if (k === 'KeyE') this.cycleTab(1);
    else if (this.slot === 'forge') {
      if (k === 'ArrowLeft' || k === 'KeyA') this.moveFocus(-1, 0);
      else if (k === 'ArrowRight' || k === 'KeyD') this.moveFocus(1, 0);
      else if (k === 'ArrowUp' || k === 'KeyW') this.moveFocus(0, -1);
      else if (k === 'ArrowDown' || k === 'KeyS') this.moveFocus(0, 1);
      else if (k === 'KeyJ' || k === 'Space' || k === 'Enter' || k === 'NumpadEnter') {
        // Click the focused control here (the game's own key handling would swallow Space).
        const el = document.activeElement;
        if (el?.tagName === 'BUTTON' && this.root.contains(el)) el.click();
      } else if (k === 'Tab') this.trapTab(e);
      else used = false;
    } else {
      const keys = this.cardKeys();
      if (k === 'ArrowLeft' || k === 'KeyA') this.cycleTab(-1);
      else if (k === 'ArrowRight' || k === 'KeyD') this.cycleTab(1);
      else if (k === 'ArrowUp' || k === 'KeyW') {
        this.index = (this.index + keys.length - 1) % keys.length;
        this.focusCard();
      } else if (k === 'ArrowDown' || k === 'KeyS') {
        this.index = (this.index + 1) % keys.length;
        this.focusCard();
      } else if (k === 'Enter' || k === 'Space' || k === 'KeyJ') {
        const card = document.activeElement?.closest?.('[data-part], [data-body]');
        if (card || !this.root.contains(document.activeElement) || document.activeElement === document.body) {
          if (this.slot === 'body') this.chooseBody(card?.dataset.body ?? keys[this.index]);
          else this.choose(card?.dataset.part ?? keys[this.index]);
        } else used = false; // a focused tab or the close button: let the browser click it
      } else if (k === 'Tab') this.trapTab(e);
      else used = false;
    }
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Keep Tab focus inside the garage.
  trapTab(e) {
    const items = [...this.root.querySelectorAll('button:not([disabled]), input')].filter((x) => x.offsetParent !== null);
    const at = items.indexOf(document.activeElement);
    items[(at + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
  }

  // Forge navigation: along a row (dx), or to the nearest item in the row above or below (dy).
  moveFocus(dx, dy) {
    const rows = [...this.root.querySelectorAll('.gforge [data-row], .gforge .fmods [data-mod]')].filter((r) => r.offsetParent !== null);
    const items = (r) => [...r.querySelectorAll('button:not([disabled]), input')];
    const cur = document.activeElement;
    let ri = rows.findIndex((r) => r.contains(cur));
    if (ri < 0) {
      items(rows[0] ?? this.root)[0]?.focus();
      return;
    }
    if (dx) {
      const list = items(rows[ri]);
      list[(list.indexOf(cur) + dx + list.length) % list.length]?.focus();
      return;
    }
    const start = ri;
    do ri = (ri + dy + rows.length) % rows.length;
    while (!items(rows[ri]).length && ri !== start);
    const x = cur.getBoundingClientRect().left;
    const best = items(rows[ri]).sort((a, b) => Math.abs(a.getBoundingClientRect().left - x) - Math.abs(b.getBoundingClientRect().left - x))[0];
    best?.focus();
    best?.scrollIntoView?.({ block: 'nearest' });
  }

  // Gamepad navigation, polled each frame while open.
  pollPad(pad) {
    if (!this.open || !pad) return;
    const now = pad.buttons.map((b) => !!b?.pressed);
    const prev = this.padPrev;
    const hit = (i) => now[i] && !prev[i];
    this.padPrev = now;
    if (editable(document.activeElement)) {
      if (hit(1) || hit(0)) document.activeElement.blur();
      return;
    }
    if (hit(1) || hit(8)) this.close();
    else if (hit(4)) this.cycleTab(-1);
    else if (hit(5)) this.cycleTab(1);
    else if (this.slot === 'forge') {
      if (hit(14)) this.moveFocus(-1, 0);
      else if (hit(15)) this.moveFocus(1, 0);
      else if (hit(12)) this.moveFocus(0, -1);
      else if (hit(13)) this.moveFocus(0, 1);
      else if (hit(0)) {
        const el = document.activeElement;
        if (el?.tagName === 'INPUT') el.focus();
        else el?.closest?.('[data-act]')?.click();
      }
    } else {
      const keys = this.cardKeys();
      if (hit(14)) this.cycleTab(-1);
      else if (hit(15)) this.cycleTab(1);
      else if (hit(12)) {
        this.index = (this.index + keys.length - 1) % keys.length;
        this.focusCard();
      } else if (hit(13)) {
        this.index = (this.index + 1) % keys.length;
        this.focusCard();
      } else if (hit(0)) {
        if (this.slot === 'body') this.chooseBody(keys[this.index], { pad: true });
        else this.choose(keys[this.index]);
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  // Redraw the current tab (cheap enough to do on every change).
  render() {
    if (!this.open) return;
    const w = this.world;
    this.$('data').textContent = `DATA ${w.wallet}`;
    for (const tab of this.root.querySelectorAll('[data-slot]')) {
      const s = tab.dataset.slot;
      const on = s === this.slot;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
      const d = s === 'arm' || s === 'gun' ? w.designs.find((x) => x.id === w.equipped[s]) : null;
      tab.querySelector('small').textContent = s === 'forge' ? `${w.designs.length}/${MAX_DESIGNS}` : s === 'body' ? this.bodyName() : d ? d.name : PARTS[w.loadout[s]].name;
    }
    const forge = this.slot === 'forge';
    this.$('parts').hidden = forge;
    this.$('forge').hidden = !forge;
    this.root.classList.toggle('forging', forge);
    if (forge) {
      this.refresh();
      this.$('hint').textContent = 'Design your own weapon: a base you own sets the moves; pick its look, an element (double damage to the virus it beats, plus an effect) and mods that fit its memory. Forge it, equip it, and test it on training dummies.';
      return;
    }
    if (this.slot === 'body') {
      this.renderBody();
      return;
    }
    const cards = partsIn(this.slot).map((k) => {
      const d = PARTS[k];
      const equipped = w.loadout[this.slot] === k;
      const forged = equipped && w.equipped[this.slot] ? w.designs.find((x) => x.id === w.equipped[this.slot]) : null;
      const owned = w.owned.has(k);
      const afford = w.wallet >= d.price;
      const state = forged ? `FORGED: ${forged.name.toUpperCase()} · EQUIP PLAIN` : equipped ? 'EQUIPPED' : owned ? 'OWNED · EQUIP' : afford ? `BUY · ${d.price} DATA` : `${d.price} DATA`;
      const cls = forged ? 'owned' : equipped ? 'equipped' : owned ? 'owned' : afford ? 'buy' : 'locked';
      const stats = partStats(k).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
      return `<button class="gpart ${cls}" data-part="${k}" style="--part:${css(d.color)}" aria-label="${esc(`${d.name}: ${state}. ${d.desc}`)}">
        <span class="gname">${d.name}</span><span class="gstate">${esc(state)}</span>
        <span class="gdesc">${d.desc}</span><dl class="gstats">${stats}</dl></button>`;
    });
    const focused = document.activeElement?.closest?.('[data-part]')?.dataset.part;
    this.$('parts').innerHTML = cards.join('');
    if (focused && PARTS[focused]?.slot === this.slot) this.root.querySelector(`[data-part="${focused}"]`)?.focus({ preventScroll: true });
    this.$('hint').textContent = 'Parts decide your moves: ARM is the attack combo, GUN is what you shoot, LEGS how you move, CORE your health. Seal rifts to find parts; collect DATA to buy them. Make your own weapons in the FORGE.';
  }

  bodyName() {
    return this.body.current === 'custom' && this.body.custom ? this.body.custom : 'Mech';
  }

  // The BODY tab: the mech, your own model, loading one, and turning it.
  renderBody() {
    const b = this.body;
    const card = (key, name, state, desc, cls) =>
      `<button class="gpart ${cls}" data-body="${key}" style="--part:#7ae8ff" aria-label="${esc(`${name}: ${state}. ${desc}`)}">
        <span class="gname">${esc(name)}</span><span class="gstate">${esc(state)}</span><span class="gdesc">${esc(desc)}</span></button>`;
    const busy = b.busy ? 'LOADING…' : null;
    const inUse = (k) => b.current === k;
    const cards = [
      card('mech', 'Mech', busy && !inUse('mech') ? busy : inUse('mech') ? 'IN USE' : 'USE', 'The standard body: a rigged mech that runs, swings and aims.', inUse('mech') ? 'equipped' : 'owned'),
      b.custom
        ? card('custom', b.custom, busy && !inUse('custom') ? busy : inUse('custom') ? 'IN USE' : 'USE', 'Your own 3D character. Load another with LOAD .GLB.', inUse('custom') ? 'equipped' : 'owned')
        : card('custom', 'Your character', 'NONE YET', 'Load a .glb to see it here. It is also your navi in the grid battler (same browser).', 'locked'),
      card('load', 'Load .glb', busy ?? 'CHOOSE A FILE', 'Bring a character made in Tripo or any 3D app (Export > GLB), or drop the file on the game. Rig it first (Tripo: Animate > Rig) so it runs and swings; an unrigged model moves as one piece.', 'buy'),
      card('turn', `Turn: ${b.turn * 90}°`, b.current === 'custom' ? 'TURN ↻' : 'YOUR MODEL ONLY', 'If your model runs backwards or sideways, give it a quarter turn.', b.current === 'custom' ? 'owned' : 'locked'),
    ];
    const focused = document.activeElement?.closest?.('[data-body]')?.dataset.body;
    this.$('parts').innerHTML = cards.join('');
    if (focused) this.root.querySelector(`[data-body="${focused}"]`)?.focus({ preventScroll: true });
    this.$('hint').textContent = 'Your body is only a look: parts, weapons and stats stay the same. Your file stays in this browser and is never uploaded.';
  }

  // Redraw the forge from the draft, keeping focus on the same control.
  refresh() {
    if (!this.open || this.slot !== 'forge' || !this.draft) return;
    const w = this.world;
    const d = this.draft;
    const focusKey = document.activeElement?.dataset?.k;
    const opt = (act, v, label, on, { k = `${act}:${v}`, disabled = false, style = '', aria = '', cls = '' } = {}) =>
      `<button class="fopt ${cls}${on ? ' on' : ''}" data-act="${act}" data-v="${esc(v)}" data-k="${esc(k)}" aria-pressed="${on}"${disabled ? ' disabled' : ''}${style ? ` style="${style}"` : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}>${label}</button>`;

    // Saved weapons, and new ones.
    this.f('count').textContent = `${w.designs.length}/${MAX_DESIGNS}`;
    const full = w.designs.length >= MAX_DESIGNS;
    setHTML(this.f('list'), [
      ...w.designs.map((x) => {
        const eq = w.equipped[x.slot] === x.id;
        const label = `<i style="background:${css(FORM.palette[x.form.glow])}"></i>${esc(x.name)}<small>${PARTS[x.base].name}${x.element !== 'none' ? ` · ${ELEMENTS[x.element].glyph} ${ELEMENTS[x.element].name}` : ''}${eq ? ' · ON' : ''}</small>`;
        return opt('pick', x.id, label, x.id === d.id, { cls: 'fweapon', aria: `${x.name}, ${PARTS[x.base].name}${eq ? ', equipped' : ''}` });
      }),
      opt('new', 'arm', '+ ARM', !d.id && d.slot === 'arm', { disabled: full, aria: 'New arm weapon' }),
      opt('new', 'gun', '+ GUN', !d.id && d.slot === 'gun', { disabled: full, aria: 'New gun' }),
      opt('import', '', 'IMPORT', this.panel === 'import', { aria: 'Import a weapon code' }),
    ].join(''));

    // Base, shape, size and colours.
    setHTML(this.f('base'), basesFor(d.slot).map((b) => {
      const owned = w.owned.has(b);
      return opt('base', b, `${PARTS[b].name}${owned ? '' : ` <small>🔒 ${PARTS[b].price}</small>`}`, d.base === b, { cls: owned ? '' : 'locked', aria: `${PARTS[b].name}${owned ? '' : ', not owned yet'}` });
    }).join(''));
    setHTML(this.f('shape'), FORM.shapes[d.base].map((name, i) => opt('shape', i, name, d.form.shape === i)).join(''));
    setHTML(this.f('size'), FORM.sizes.map((name, i) => {
      const [r, t] = FORM.sizeEffect[i];
      const note = d.slot === 'arm' && r !== 1 ? ` <small>${r > 1 ? 'reach+ slower' : 'quicker reach−'}</small>` : '';
      return opt('size', i, `${name}${note}`, d.form.size === i, { aria: `Size ${name}${d.slot === 'arm' && r !== 1 ? `: reach ${Math.round((r - 1) * 100)}%, speed ${Math.round((1 - t) * 100)}%` : ''}` });
    }).join(''));
    for (const key of ['color', 'glow']) {
      setHTML(this.f(key), FORM.palette.map((c, i) => opt(key, i, '', d.form[key] === i, { cls: 'swatch', style: `--c:${css(c)}`, aria: `${key === 'color' ? 'Body' : 'Glow'} colour: ${COLOR_NAMES[i]}` })).join(''));
    }
    setHTML(this.f('element'), ELEMENT_KEYS.map((k) => {
      const el = ELEMENTS[k];
      const prey = weakViruses(k);
      const sub = k === 'none' ? '+2 MB' : prey.length ? `×2 ${prey.join(', ')}` : 'heals you';
      return opt('element', k, `<span class="fglyph" style="color:${css(el.color)}" aria-hidden="true">${el.glyph}</span>${el.name}<small>${sub}</small>`, d.element === k, { cls: 'felem', aria: `${el.name}: ${el.effect}` });
    }).join(''));

    // Memory: one cell per MB, like Battle Network's NaviCust.
    const cap = capacityOf(d);
    const used = memoryUsed(d.mods);
    const cells = Math.max(cap, used);
    setHTML(this.f('mem'), Array.from({ length: cells }, (_, i) => `<i class="${i < used ? (used > cap ? 'over' : 'used') : ''}${i >= cap ? ' extra' : ''}"></i>`).join(''));
    this.f('memtxt').textContent = `${used}/${cap} MB · ${d.mods.length}/${MAX_MODS} MODS`;

    // Mods for this slot: on/off, or unlock with DATA.
    setHTML(this.f('mods'), MOD_KEYS.filter((m) => MODS[m].slots.includes(d.slot)).map((m) => {
      const mod = MODS[m];
      const on = d.mods.includes(m);
      const unfit = (mod.not ?? []).includes(d.base);
      const locked = !w.programs.has(m);
      const room = on || (d.mods.length < MAX_MODS && used + mod.cost <= cap);
      const head = `<b>${mod.name}</b><span class="fcost">${mod.cost} MB</span>`;
      if (unfit) return `<div class="fmod unfit" data-mod="${m}"><button class="fopt" disabled data-k="mod:${m}">${head}<small>Not for the ${PARTS[d.base].name}</small></button></div>`;
      const main = opt('mod', m, `${head}<small>${mod.desc}</small>`, on, { cls: `${locked ? 'lockedmod' : ''}${!room ? ' noroom' : ''}`, aria: `${mod.name}, ${mod.cost} MB: ${mod.desc}${locked ? ' Locked.' : ''}` });
      // Locked: first learned by deleting its virus family, then unlocked with DATA.
      let unlock = '';
      if (locked && !w.modLearned(m)) {
        const { from, deletes } = mod.learn;
        const have = Math.min(deletes, w.deletesOf(from));
        unlock = opt('unlock', m, `DELETE ${VIRUS[from][1].toUpperCase()} · ${have}/${deletes}`, false, { cls: 'funlock poor', aria: `Learn ${mod.name} by deleting ${deletes} ${VIRUS[from][1]} (${have} so far), then unlock it for ${mod.price} DATA` });
      } else if (locked) unlock = opt('unlock', m, `UNLOCK · ${mod.price} DATA`, false, { cls: `funlock${w.wallet < mod.price ? ' poor' : ''}`, aria: `Unlock ${mod.name} for ${mod.price} DATA` });
      return `<div class="fmod${on ? ' on' : ''}${locked ? ' locked' : ''}" data-mod="${m}">${main}${unlock}</div>`;
    }).join(''));

    // What it does, what's wrong, and the actions.
    setHTML(this.f('sum'), designSummary(d).map((line) => `<li>${esc(line)}</li>`).join(''));
    // Exact numbers, and the difference from what's equipped in this slot now.
    const now = weaponStats(w.kit, d.slot);
    const next = weaponStats(applyDesign(buildKit({ ...w.loadout, [d.slot]: d.base }), d), d.slot);
    setHTML(this.f('stats'), next.map(([label, v, unit, digits, up], i) => {
      const delta = v - now[i][1];
      const shown = Math.abs(delta) >= 0.5 * 10 ** -digits;
      const better = shown && delta > 0 === up;
      const sign = delta > 0 ? '+' : '−';
      return `<div><dt>${label}</dt><dd>${v.toFixed(digits)}${unit}${shown ? ` <b class="${better ? 'up' : 'down'}">${sign}${Math.abs(delta).toFixed(digits)}</b>` : ''}</dd></div>`;
    }).join(''));
    const problem = this.problem();
    const saved = this.saved();
    const dirty = !saved || !same(d, saved);
    const equipped = saved && w.equipped[d.slot] === d.id;
    this.f('warn').textContent = problem ?? (dirty && saved ? 'Unsaved changes.' : '');
    this.f('warn').classList.toggle('bad', !!problem);
    const armed = performance.now() - this.deleteArmed < 3000;
    setHTML(this.f('actions'), [
      opt('save', '', saved ? 'SAVE' : 'FORGE', false, { cls: 'fmain', disabled: !!problem || !dirty }),
      opt('equip', '', equipped && !dirty ? 'EQUIPPED' : dirty ? (saved ? 'SAVE + EQUIP' : 'FORGE + EQUIP') : 'EQUIP', false, { disabled: !!problem || (equipped && !dirty) }),
      opt('test', '', 'TEST', false, { disabled: !!problem, aria: 'Equip it and try it on training dummies' }),
      opt('share', '', 'SHARE', this.panel === 'share', { aria: 'Show a code to share this weapon' }),
      saved && dirty ? opt('revert', '', 'UNDO', false, { aria: 'Undo unsaved changes' }) : '',
      saved ? opt('delete', '', armed ? 'SURE?' : 'DELETE', false, { cls: 'fdel' }) : '',
    ].join(''));

    // The share or import box.
    const panel = this.f('panel');
    panel.hidden = !this.panel;
    if (this.panel === 'share' && panel.dataset.mode !== `share:${encodeDesign(d)}`) {
      panel.dataset.mode = `share:${encodeDesign(d)}`;
      panel.innerHTML = `<label class="flbl" for="forgeCode">CODE</label><input id="forgeCode" readonly value="${esc(encodeDesign(d))}" data-k="code"><button class="fopt" data-act="copy" data-k="copy">COPY</button><p class="fmsg">Anyone can load this code in their forge (they need the ${PARTS[d.base].name} and the mods unlocked to forge it).</p>`;
    } else if (this.panel === 'import' && panel.dataset.mode !== 'import') {
      panel.dataset.mode = 'import';
      panel.innerHTML = `<label class="flbl" for="forgeImport">CODE</label><input id="forgeImport" data-code="1" data-k="import" placeholder="CMW-…" autocomplete="off" spellcheck="false" enterkeyhint="go"><button class="fopt" data-act="load" data-k="load">LOAD</button><p class="fmsg">Paste a weapon code (CMW-…) to load it into the editor.</p>`;
      setTimeout(() => panel.querySelector('input')?.focus(), 0);
    } else if (!this.panel) panel.dataset.mode = '';

    if (focusKey) this.root.querySelector(`.gforge [data-k="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }
}
