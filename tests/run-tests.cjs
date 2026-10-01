'use strict';
const assert = require('node:assert/strict');
const run = require('../run.js');
const arenaIds = Object.keys(require('../combat.js').arenas);
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS',name); }
test('Ascent has five stages and ends at nightmare',() => {
  const r = run.create('nightclub','easy');
  for(let i=0;i<5;i++) {
    const s = run.stage(r); assert.equal(s.index,i); assert.ok(arenaIds.includes(s.arena));
    if(i===4) assert.equal(s.difficulty,'nightmare');
    assert.equal(run.finish(r,true,{damage:200,taken:80,parries:2,combo:3}),true);
    if(i<4) assert.equal(run.advance(r,'flow'),true);
  }
  assert.equal(r.ended,true); assert.equal(r.cleared,5); assert.equal(r.upgrades.flow,4);
  assert.equal(run.advance(r,'power'),false); assert.equal(run.finish(r,true,{}),false);
});
test('Upgrade is applied once and only after a victory',() => {
  const r = run.create('seaside','hard');
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
  const r = run.create('nightclub','nightmare');
  assert.equal(run.stage(r).difficulty,'nightmare'); assert.equal(run.stage(r).arena,'nightclub');
  run.finish(r,true,{}); run.advance(r,'power'); assert.equal(run.stage(r).arena,'seaside');
  assert.equal(run.stage(r).difficulty,'nightmare');
});
test('Rank rewards mastery and damage avoidance',() => {
  assert.equal(run.rank({parries:5,combo:5,taken:10},true),'S');
  assert.equal(run.rank({parries:0,combo:1,taken:190},true),'C');
});
test('Ascent visits all four venues and returns to the selected starting arena for its final', () => {
  const routes = new Map();
  for (const arena of arenaIds) {
    const r = run.create(arena, 'normal'), visited = [];
    for (let i = 0; i < 5; i++) {
      const stage = run.stage(r); visited.push(stage.arena);
      assert.ok(arenaIds.includes(stage.arena), 'progression must never produce an unavailable arena');
      assert.equal(run.finish(r, true, {}), true);
      if (i < 4) assert.equal(run.advance(r, 'flow'), true);
    }
    assert.equal(visited[0], arena); assert.equal(visited[4], arena); assert.equal(new Set(visited).size, 4); assert.equal(r.ended, true);
    routes.set(arena, visited);
  }
  assert.equal(run.stage(run.create()).arena, 'island');
  assert.deepEqual(routes.get('island').slice(0, 4), ['island', 'nightclub', 'seaside', 'helipad']);
});
console.log(`${count} progression tests passed.`);
