import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureGate, VoiceBarrier, validBindings, defaultBindings, gesturePosition } from '../.test-build/gestures.js';
import { ScriptTracker } from '../.test-build/tracker.js';

test('voice and gestures coexist: old speech cannot undo a jump and new speech resumes', () => {
  const barrier = new VoiceBarrier();
  const tracker = new ScriptTracker('um dois tres quatro cinco seis sete oito nove dez onze doze'.split(' '));
  tracker.automatic();
  assert.equal(barrier.accept('0:False', 100), true);
  tracker.manual(6); tracker.automatic(); barrier.hold(200);
  assert.equal(barrier.accept('0:True', 2000), false);
  assert.equal(tracker.reading.position, 6);
  assert.equal(barrier.accept('1:False', 2200), true);
  tracker.transcript('sete oito nove', '1:False');
  assert.equal(tracker.reading.position, 8);
  tracker.manual();
  tracker.transcript('nove dez onze doze', '2');
  assert.equal(tracker.reading.position, 8);
});

test('all ten bindings are unique and invalid saved settings are rejected', () => {
  assert.equal(validBindings(defaultBindings), true);
  assert.equal(validBindings({...defaultBindings, next: defaultBindings.previous}), false);
  assert.equal(validBindings({...defaultBindings, next: 'invented'}), false);
  assert.equal(validBindings({}), false);
  assert.equal(validBindings({...defaultBindings, next: '', previous: ''}), true);
});
test('requires neutral, sustained signal and release; holding or changing signs cannot repeat', () => {
  const gate = new GestureGate();
  assert.equal(gate.update('Victory', false, 100), null);
  gate.update(null, true, 200); gate.update(null, true, 900);
  gate.update('Victory', false, 1000); gate.update('Victory', false, 1500);
  assert.equal(gate.update('Victory', false, 2000), 'Victory');
  assert.equal(gate.update('Victory', false, 4000), null);
  assert.equal(gate.update('Open_Palm', false, 4500), null);
  gate.update(null, true, 5000); gate.update(null, true, 5700);
  gate.update('Open_Palm', false, 6000); gate.update('Open_Palm', false, 6500);
  assert.equal(gate.update('Open_Palm', false, 7000), 'Open_Palm');
});
test('uncertain observations and stale responses do not confirm commands', () => {
  const gate = new GestureGate();
  gate.update(null, true, 100); gate.update(null, true, 800);
  gate.update('Victory', false, 900); gate.update(null, false, 1400);
  assert.equal(gate.update('Victory', false, 1900), null);
  assert.equal(gate.update('Victory', false, 8000), null);
  assert.equal(gate.armed, false);
});
test('navigation skips empty blocks and clamps at script boundaries', () => {
  const session = {script: {blocks: [{text:'a b c'}, {text:''}, {text:'d e f g'}, {text:'h i'}]}, reading:{position:4}};
  assert.equal(gesturePosition(session, 'next'), 7);
  assert.equal(gesturePosition(session, 'previous'), 0);
  assert.equal(gesturePosition(session, 'down'), 8);
  assert.equal(gesturePosition(session, 'up'), 0);
  assert.equal(gesturePosition(session, 'end'), 7);
  assert.equal(gesturePosition({...session, script:null}, 'next'), 0);
});
