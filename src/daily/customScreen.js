import { fusionHint, SLOTS_PER_ROW } from '../engine/custom.js';
import { chipCanvas, chipInfo } from './chips.js';

// The Daily's Custom Screen, in HTML over the arena: the hand as chip cards (the grid game's chip art),
// the picks so far, what the chip under the cursor does, and a fusion (Program Advance) the hand can make.
// It draws the engine's own Custom Screen state; taps become recorded actions (the page passes them to
// the Recorder), and keys move the engine's cursor through the pad as in the grid game.

const $ = (id) => document.getElementById(id);
const EL_ICON = { fire: '🔥', aqua: '💧', elec: '⚡', wood: '🌿', null: '' };

export class CustomScreenView {
  constructor(onOp) {
    this.onOp = onOp;
    this.root = $('custom');
    this.hand = $('csHand');
    this.chosen = $('csChosen');
    this.info = $('csInfo');
    this.ok = $('csOk');
    this.add = $('csAdd');
    this.turn = $('csTurn');
    this.key = '';
    this.ok.onclick = () => this.onOp('c');
    this.add.onclick = () => this.onOp('a');
    this.hand.addEventListener('click', (ev) => {
      const card = ev.target.closest('.chip');
      if (card) this.onOp('s', Number(card.dataset.i));
    });
    this.chosen.addEventListener('click', () => this.onOp('u'));
  }

  show(on) {
    if (this.root.hidden === !on) return;
    this.root.hidden = !on;
    this.key = '';
  }

  update(b) {
    const cs = b.custom;
    const key = `${b.turn}|${cs.hand.map((c) => c.uid).join(',')}|${cs.selected.join(',')}|${cs.cursor.x},${cs.cursor.y}`;
    if (key === this.key) return;
    this.key = key;
    this.turn.textContent = `TURN ${b.turn}`;
    const hint = fusionHint(cs.hand, cs.selected, cs.deck);
    const marked = new Set(hint?.picks ?? hint?.keep ?? []);
    const cursorSlot = cs.cursor.x < SLOTS_PER_ROW ? cs.cursor.y * SLOTS_PER_ROW + cs.cursor.x : -1;
    this.hand.textContent = '';
    cs.hand.forEach((c, i) => {
      const def = chipInfo(c.key);
      const card = document.createElement('button');
      card.className = 'chip';
      card.dataset.i = i;
      if (def.klass === 'mega') card.classList.add('mega');
      if (def.klass === 'giga') card.classList.add('giga');
      if (cs.selected.includes(i)) card.classList.add('sel');
      else if (!cs.canSelect(i)) card.classList.add('no');
      if (marked.has(i) && !cs.selected.includes(i)) card.classList.add('hint');
      if (i === cursorSlot) card.classList.add('cur');
      card.append(chipCanvas(c.key));
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = c.code;
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = def.name;
      card.append(code, nm);
      this.hand.append(card);
    });
    this.chosen.textContent = '';
    if (!cs.selected.length) {
      const e = document.createElement('span');
      e.className = 'empty';
      e.textContent = 'No chips picked: OK fights with the buster alone.';
      this.chosen.append(e);
    }
    for (const i of cs.selected) this.chosen.append(chipCanvas(cs.hand[i].key, false));
    // What the chip under the cursor (or the last pick) does.
    const shown = cursorSlot >= 0 && cs.hand[cursorSlot] ? cs.hand[cursorSlot] : cs.hand[cs.selected[cs.selected.length - 1]];
    const lines = [];
    if (shown) {
      const def = chipInfo(shown.key);
      lines.push(`<b>${esc(def.name)}</b> ${EL_ICON[def.element] ?? ''} <span class="muted">${def.damage ? `${def.damage} dmg · ` : ''}code ${esc(shown.code)}</span><br>${esc(def.desc ?? '')}`);
    }
    if (hint?.ready) lines.push(`<span class="pa">★ ${esc(hint.pa.name)} ready! Press OK.</span>`);
    else if (hint?.picks) lines.push(`<span class="pa">★ Fusion: ${esc(hint.pa.name)}. Pick the gold chips in order.</span>`);
    else if (hint?.keep) lines.push(`<span class="pa">★ Hold the gold chips: ${esc(hint.pa.name)} needs one more.</span>`);
    this.info.innerHTML = lines.join('<br>') || '<span class="muted">Pick up to five chips.</span>';
    this.ok.classList.toggle('cur', cs.cursor.x === SLOTS_PER_ROW && cs.cursor.y === 0);
    this.add.classList.toggle('cur', cs.cursor.x === SLOTS_PER_ROW && cs.cursor.y === 1);
    this.add.disabled = !cs.canAdd();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
