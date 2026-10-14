import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldInput } from '../src/world/input.js';

// The open world's controls, driven through stand-in window, document and canvas objects.
function target() {
  const handlers = {};
  return {
    handlers,
    addEventListener: (t, f) => ((handlers[t] ??= []).push(f)),
    fire(t, extra = {}) {
      let prevented = false;
      for (const f of handlers[t] ?? []) f({ repeat: false, preventDefault: () => (prevented = true), ...extra });
      return prevented;
    },
  };
}
function setup() {
  const win = target();
  win.document = target();
  const canvas = target();
  const input = new WorldInput(canvas, null, win);
  const key = (code, down = true, extra = {}) => win.fire(down ? 'keydown' : 'keyup', { code, ...extra });
  return { win, canvas, input, key };
}

test('a key tapped and released between two steps still presses once', () => {
  const { input, key } = setup();
  key('KeyJ');
  key('KeyJ', false);
  assert.equal(input.sample().attack, true);
  assert.equal(input.sample().attack, false);
  // Held keys stay held; auto-repeat changes nothing.
  key('KeyJ');
  for (let i = 0; i < 3; i++) {
    key('KeyJ', true, { repeat: true });
    assert.equal(input.sample().attack, true);
  }
});

test('the left mouse button attacks; a click between two steps counts', () => {
  const { win, canvas, input } = setup();
  canvas.fire('mousedown', { button: 0 });
  win.fire('mouseup', { button: 0 });
  assert.equal(input.sample().attack, true);
  assert.equal(input.sample().attack, false);
  // Middle click locks on.
  canvas.fire('mousedown', { button: 1 });
  assert.equal(input.sample().lock, true);
});

test('number keys pick chips; F is the reaction command; Shift dodges', () => {
  const { input, key } = setup();
  key('Digit2');
  key('KeyF');
  key('ShiftLeft');
  const s = input.sample();
  assert.equal(s.chip, 2);
  assert.equal(s.react, true);
  assert.equal(s.dash, true);
});

test('Q and E switch targets while locked on, and turn the camera otherwise', () => {
  const { input, key } = setup();
  let locked = false;
  input.isLocked = () => locked;
  key('KeyE');
  assert.equal(input.sample().next, false);
  assert.ok(input.consumeLook(1 / 60).dx > 0, 'turns while free');
  locked = true;
  assert.equal(input.sample().next, true);
  assert.equal(input.consumeLook(1 / 60).dx, 0, 'no turning while locked on');
});

test('wheel ticks while locked on switch targets one step at a time', () => {
  const { canvas, input } = setup();
  input.isLocked = () => true;
  canvas.fire('wheel', { deltaY: 100 });
  canvas.fire('wheel', { deltaY: 100 });
  const presses = [];
  for (let i = 0; i < 5; i++) presses.push(input.sample().next);
  // Two ticks: pressed, released, pressed, so the game sees two separate presses.
  assert.deepEqual(presses, [true, false, true, false, false]);
  // Not locked on, the wheel zooms instead.
  input.isLocked = () => false;
  canvas.fire('wheel', { deltaY: -100 });
  assert.equal(input.sample().prev, false);
  assert.equal(input.consumeLook(0).zoom, -1);
});

test('browser shortcuts like Ctrl+R are left alone', () => {
  const { key, input } = setup();
  assert.equal(key('KeyR', true, { ctrlKey: true }), false, 'not prevented');
  assert.equal(input.sample().lock, false);
  assert.equal(key('KeyR'), true, 'a plain R is the game\'s');
});
