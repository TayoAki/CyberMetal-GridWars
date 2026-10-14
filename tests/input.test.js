import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input, PadEdges } from '../src/input/input.js';

// A fake window: just enough EventTarget for the Input class.
function fakeTarget() {
  const handlers = {};
  return {
    addEventListener: (t, f) => ((handlers[t] ??= []).push(f)),
    removeEventListener: () => {},
    fire: (t, code, extra = {}) => {
      for (const f of handlers[t] ?? []) f({ code, repeat: false, preventDefault() {}, ...extra });
    },
  };
}

test('every tap makes its own press edge, even when several land between two frames', () => {
  const w = fakeTarget();
  const input = new Input(w);
  const edges = new PadEdges();
  // Three quick taps of the same key, all before the next sample (a stalled frame).
  for (let i = 0; i < 3; i++) {
    w.fire('keydown', 'ArrowDown');
    w.fire('keyup', 'ArrowDown');
  }
  let presses = 0;
  for (let f = 0; f < 10; f++) if (edges.update(input.sample()).pressed.down) presses++;
  assert.equal(presses, 3);
});

test('holding a key stays held across frames; auto-repeat keydowns are ignored', () => {
  const w = fakeTarget();
  const input = new Input(w);
  w.fire('keydown', 'KeyZ');
  for (let f = 0; f < 5; f++) {
    w.fire('keydown', 'KeyZ', { repeat: true });
    assert.equal(input.sample().b, true);
  }
  w.fire('keyup', 'KeyZ');
  assert.equal(input.sample().b, false);
});

test('two keys mapped to one button release only when both are up', () => {
  const w = fakeTarget();
  const input = new Input(w);
  w.fire('keydown', 'ArrowLeft');
  w.fire('keydown', 'KeyA');
  assert.equal(input.sample().left, true);
  w.fire('keyup', 'ArrowLeft');
  assert.equal(input.sample().left, true);
  w.fire('keyup', 'KeyA');
  assert.equal(input.sample().left, false);
});

test('touch buttons and blur', () => {
  const w = fakeTarget();
  const input = new Input(w);
  input.touchDown('a');
  assert.equal(input.sample().a, true);
  w.fire('blur');
  assert.equal(input.sample().a, false);
});
