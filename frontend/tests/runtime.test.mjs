import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
for(const rate of [16000,44100,48000]) test(`PCM resampling ${rate} Hz produces 50 frames per second`,()=>{
  let Processor;const frames=[];
  const context={sampleRate:rate,AudioWorkletProcessor:class {port={postMessage:frame=>frames.push(frame)};},registerProcessor:(_,klass)=>Processor=klass};
  vm.runInNewContext(readFileSync(new URL('../src/pcm-worklet.js',import.meta.url),'utf8'),context);
  const processor=new Processor();
  const samples=new Float32Array(rate).fill(.25);
  for(let i=0;i<samples.length;i+=128)processor.process([[samples.slice(i,i+128)]]);
  assert.equal(frames.length,50);
  for(const frame of frames) {assert.equal(frame.byteLength,640);assert.ok(Math.abs(new Int16Array(frame)[0]-8192)<=1);}
});
test('ID generation works when randomUUID is unavailable on HTTP',()=>{
  const code=readFileSync(new URL('../.test-build/id.js',import.meta.url),'utf8').replace('export function uid','function uid');
  const context={crypto:{getRandomValues:array=>{for(let i=0;i<array.length;i++)array[i]=i;return array;}}};
  vm.runInNewContext(code+'; this.generated=uid();',context);
  assert.match(context.generated,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
