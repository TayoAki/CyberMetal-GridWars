import { PARTS, SLOTS, SLOT_NAMES, partsIn, partStats } from './parts.js';

// The garage: a menu over the paused-looking world where you buy parts with DATA and equip them. It only
// opens out of combat (the World checks too). It sends commands ({ op, part }) to the game, which passes them
// to the simulation through its input, so a garage visit replays like any other input.
//
// Keyboard: left/right (or A/D, Q/E) change slot, up/down (W/S) pick a part, Enter/Space/J buy or equip,
// Esc or G close. Gamepad: d-pad, A to choose, B or Back to close. Touch and mouse: tap.

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

export class Garage {
  constructor(root, world, { onCommand, onClose, onDenied } = {}) {
    this.root = root;
    this.world = world;
    this.onCommand = onCommand ?? (() => {});
    this.onClose = onClose ?? (() => {});
    this.onDenied = onDenied ?? (() => {});
    this.open = false;
    this.slot = 'arm';
    this.index = 0;
    this.padPrev = [];
    root.innerHTML = `
      <div class="gcard">
        <header class="ghead"><h2 id="garageTitle">GARAGE</h2><span class="gdata" data-g="data"></span><button class="gclose" data-g="close" aria-label="Close the garage">✕</button></header>
        <div class="gtabs" role="tablist" aria-label="Part slots">${SLOTS.map((s) => `<button role="tab" data-slot="${s}">${SLOT_NAMES[s]}<small data-g="eq-${s}"></small></button>`).join('')}</div>
        <div class="gparts" data-g="parts"></div>
        <p class="ghint" data-g="hint"></p>
      </div>`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'garageTitle');
    this.$ = (k) => root.querySelector(`[data-g="${k}"]`);
    this.$('close').addEventListener('click', () => this.close());
    for (const tab of root.querySelectorAll('[data-slot]')) tab.addEventListener('click', () => this.setSlot(tab.dataset.slot));
    this.$('parts').addEventListener('click', (e) => {
      const card = e.target.closest('[data-part]');
      if (card) this.choose(card.dataset.part);
    });
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    // Start on the equipped part of the current slot.
    this.index = Math.max(0, partsIn(this.slot).indexOf(this.world.loadout[this.slot]));
    this.render();
    this.focusCard();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.onClose();
  }

  setSlot(slot) {
    this.slot = slot;
    this.index = Math.max(0, partsIn(slot).indexOf(this.world.loadout[slot]));
    this.render();
    this.focusCard();
  }

  // Buy (then equip) or equip a part.
  choose(part) {
    const w = this.world;
    const def = PARTS[part];
    if (!def) return;
    if (w.owned.has(part)) {
      if (w.loadout[def.slot] !== part) this.onCommand({ op: 'equip', part });
      return;
    }
    if (w.wallet < def.price) {
      this.onDenied(`NEED ${def.price - w.wallet} MORE DATA`);
      const card = this.root.querySelector(`[data-part="${part}"]`);
      card?.classList.remove('deny');
      void card?.offsetWidth; // restart the shake
      card?.classList.add('deny');
      return;
    }
    this.onCommand({ op: 'buy', part });
    this.onCommand({ op: 'equip', part });
  }

  focusCard() {
    this.root.querySelectorAll('[data-part]')[this.index]?.focus({ preventScroll: true });
  }

  onKey(e) {
    if (!this.open) return;
    const k = e.code;
    const keys = partsIn(this.slot);
    let used = true;
    if (k === 'Escape' || k === 'KeyG' || k === 'Backspace') this.close();
    else if (k === 'ArrowLeft' || k === 'KeyA' || k === 'KeyQ') this.setSlot(SLOTS[(SLOTS.indexOf(this.slot) + SLOTS.length - 1) % SLOTS.length]);
    else if (k === 'ArrowRight' || k === 'KeyD' || k === 'KeyE') this.setSlot(SLOTS[(SLOTS.indexOf(this.slot) + 1) % SLOTS.length]);
    else if (k === 'ArrowUp' || k === 'KeyW') {
      this.index = (this.index + keys.length - 1) % keys.length;
      this.focusCard();
    } else if (k === 'ArrowDown' || k === 'KeyS') {
      this.index = (this.index + 1) % keys.length;
      this.focusCard();
    } else if (k === 'Enter' || k === 'Space' || k === 'KeyJ') {
      const card = document.activeElement?.closest?.('[data-part]');
      this.choose(card?.dataset.part ?? keys[this.index]);
    } else if (k === 'Tab') {
      // Keep focus inside the garage.
      const items = [...this.root.querySelectorAll('button')];
      const at = items.indexOf(document.activeElement);
      items[(at + (e.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // Gamepad navigation, polled each frame while open.
  pollPad(pad) {
    if (!this.open || !pad) return;
    const now = pad.buttons.map((b) => !!b?.pressed);
    const hit = (i) => now[i] && !this.padPrev[i];
    const keys = partsIn(this.slot);
    if (hit(1) || hit(8)) this.close();
    else if (hit(14)) this.setSlot(SLOTS[(SLOTS.indexOf(this.slot) + SLOTS.length - 1) % SLOTS.length]);
    else if (hit(15)) this.setSlot(SLOTS[(SLOTS.indexOf(this.slot) + 1) % SLOTS.length]);
    else if (hit(12)) {
      this.index = (this.index + keys.length - 1) % keys.length;
      this.focusCard();
    } else if (hit(13)) {
      this.index = (this.index + 1) % keys.length;
      this.focusCard();
    } else if (hit(0)) this.choose(keys[this.index]);
    this.padPrev = now;
  }

  // Redraw the cards for the current slot (cheap enough to do on every change).
  render() {
    if (!this.open) return;
    const w = this.world;
    this.$('data').textContent = `DATA ${w.wallet}`;
    for (const tab of this.root.querySelectorAll('[data-slot]')) {
      const on = tab.dataset.slot === this.slot;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
      tab.querySelector('small').textContent = PARTS[w.loadout[tab.dataset.slot]].name;
    }
    const cards = partsIn(this.slot).map((k) => {
      const d = PARTS[k];
      const equipped = w.loadout[this.slot] === k;
      const owned = w.owned.has(k);
      const afford = w.wallet >= d.price;
      const state = equipped ? 'EQUIPPED' : owned ? 'OWNED · EQUIP' : afford ? `BUY · ${d.price} DATA` : `${d.price} DATA`;
      const cls = equipped ? 'equipped' : owned ? 'owned' : afford ? 'buy' : 'locked';
      const stats = partStats(k).map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
      return `<button class="gpart ${cls}" data-part="${k}" style="--part:${css(d.color)}" aria-label="${d.name}: ${state}. ${d.desc}">
        <span class="gname">${d.name}</span><span class="gstate">${state}</span>
        <span class="gdesc">${d.desc}</span><dl class="gstats">${stats}</dl></button>`;
    });
    const focused = document.activeElement?.closest?.('[data-part]')?.dataset.part;
    this.$('parts').innerHTML = cards.join('');
    if (focused && PARTS[focused]?.slot === this.slot) this.root.querySelector(`[data-part="${focused}"]`)?.focus({ preventScroll: true });
    this.$('hint').textContent = 'Parts decide your moves: ARM is the attack combo, GUN is what you shoot, LEGS how you move, CORE your health. Seal rifts to find parts; collect DATA to buy them.';
  }
}
