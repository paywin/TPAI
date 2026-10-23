import assert from 'node:assert/strict';
import test from 'node:test';
import { ScriptTracker } from '../.test-build/tracker.js';
const text = 'Boa noite está começando o panorama hoje vamos olhar para as ideias que aproximam a cidade das pessoas';
test('matches spoken Portuguese and ignores duplicate events', () => {
  const t = new ScriptTracker(text.split(' ')); t.automatic();
  t.transcript('Boa noite está começando o panorama', '1');
  assert.equal(t.reading.position, 5); assert.equal(t.reading.state, 'READING');
  t.transcript('Boa noite está começando o panorama', '1'); assert.equal(t.reading.position, 5);
});
test('silence and off-script speech hold position, then recover', () => {
  const t = new ScriptTracker(text.split(' ')); t.automatic();
  t.transcript('Boa noite está começando', '1'); const pos = t.reading.position;
  t.silence(); assert.equal(t.reading.state, 'SILENCE'); assert.equal(t.reading.position, pos);
  t.transcript('cachorro vermelho corre rapidamente', '2');
  t.transcript('bicicleta azul caiu ontem', '3');
  assert.equal(t.reading.state, 'IMPROVISING'); assert.equal(t.reading.position, pos);
  t.transcript('hoje vamos olhar para as ideias', '4'); assert.equal(t.reading.state, 'READING'); assert.equal(t.reading.position, 11);
});
test('manual override rejects late recognition and clamps position', () => {
  const t = new ScriptTracker(text.split(' ')); t.automatic(); t.manual(2);
  t.transcript('hoje vamos olhar para as ideias', 'late'); assert.equal(t.reading.position, 2); assert.equal(t.reading.state, 'MANUAL');
  t.manual(-20); assert.equal(t.reading.position, 0);
  t.manual(900); assert.equal(t.reading.position, t.tokens.length - 1);
});
test('distant jump requires a second distinct confirmation', () => {
  const t = new ScriptTracker(('inicio roteiro '.repeat(100) + 'a reportagem especial explica detalhes inéditos').split(' ')); t.automatic();
  t.transcript('a reportagem especial explica detalhes', '1'); assert.equal(t.reading.position, 0);
  t.transcript('a reportagem especial explica detalhes inéditos', '2'); assert.equal(t.reading.state, 'READING'); assert.equal(t.reading.position, 205);
});
test('long repeated scripts build an index and avoid ambiguous jumps', () => {
  const t = new ScriptTracker(('roteiro repetido '.repeat(10000) + 'encerramento exclusivo da edição').split(' '));
  t.manual(1000); t.automatic(); t.transcript('roteiro repetido roteiro repetido', '1');
  assert.ok(Math.abs(t.reading.position - 1000) < 8);
});

