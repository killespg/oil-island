'use strict';
const assert = require('node:assert/strict');
const run = require('../run.js');
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS',name); }
test('Ascent has five stages and ends at nightmare',() => {
  const r = run.create('reactor','easy');
  for(let i=0;i<5;i++) {
    const s = run.stage(r); assert.equal(s.index,i); assert.ok(['skyline','reactor','void'].includes(s.arena));
    if(i===4) assert.equal(s.difficulty,'nightmare');
    assert.equal(run.finish(r,true,{damage:200,taken:80,parries:2,combo:3}),true);
    if(i<4) assert.equal(run.advance(r,'flow'),true);
  }
  assert.equal(r.ended,true); assert.equal(r.cleared,5); assert.equal(r.upgrades.flow,4);
  assert.equal(run.advance(r,'power'),false); assert.equal(run.finish(r,true,{}),false);
});
test('Upgrade is applied once and only after a victory',() => {
  const r = run.create('void','hard');
  assert.equal(run.advance(r,'power'),false); run.finish(r,true,{});
  assert.equal(run.advance(r,'invalid'),false); assert.equal(run.finish(r,true,{}),false);
  assert.equal(run.advance(r,'guard'),true); assert.equal(run.advance(r,'guard'),false);
  assert.equal(r.upgrades.guard,1); assert.equal(r.stage,1);
});
test('A loss ends the run without offering an upgrade',() => {
  const r = run.create(); run.finish(r,false,{damage:25,taken:200});
  assert.equal(r.cleared,0); assert.equal(r.ended,true); assert.equal(r.pendingUpgrade,false);
  assert.ok(r.score >= 0); assert.equal(run.rank({},false),'D');
});
test('Higher starting difficulty is respected; stage rotation is deterministic',() => {
  const r = run.create('reactor','nightmare');
  assert.equal(run.stage(r).difficulty,'nightmare'); assert.equal(run.stage(r).arena,'reactor');
  run.finish(r,true,{}); run.advance(r,'power'); assert.equal(run.stage(r).arena,'void');
  assert.equal(run.stage(r).difficulty,'nightmare');
});
test('Rank rewards mastery and damage avoidance',() => {
  assert.equal(run.rank({parries:5,combo:5,taken:10},true),'S');
  assert.equal(run.rank({parries:0,combo:1,taken:190},true),'C');
});
console.log(`${count} progression tests passed.`);
