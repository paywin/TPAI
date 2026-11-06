import test from 'node:test';
import assert from 'node:assert/strict';
import {remapPosition} from '../.test-build/liveScript.js';
const a={id:'a',text:'primeiro bloco aqui'};
const b={id:'b',text:'segundo bloco aqui agora'};
const old={blocks:[a,b]};
test('reordering follows the current block and word',()=>{
  assert.equal(remapPosition(old,{blocks:[b,a]},4),1);
});
test('editing a previous block preserves the current reading location',()=>{
  assert.equal(remapPosition(old,{blocks:[{...a,text:'um'},b]},4),2);
});
test('shortening or deleting blocks clamps the reading position',()=>{
  assert.equal(remapPosition(old,{blocks:[a,{...b,text:'fim'}]},6),3);
  assert.equal(remapPosition(old,{blocks:[a]},6),2);
  assert.equal(remapPosition(old,{blocks:[{...a,text:''}]},6),0);
});
