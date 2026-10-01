const test = require('node:test');
const assert = require('node:assert/strict');
const {createGovernor,pose,interpolate} = require('../performance.js');
function run(g, fps, seconds) { const changes=[]; for(let i=0;i<fps*seconds;i++){const c=g.sample(1/fps);if(c)changes.push(c);}return changes; }
test('Automatic quality warms up, adjusts HQ resolution, and avoids repeated failed promotions',()=>{
  const g=createGovernor(); assert.deepEqual(run(g,60,4),[]);
  assert.equal(run(g,60,4)[0].quality,'high');
  const down=run(g,25,12); assert.ok(down.some(c=>c.quality==='high'&&c.scale===.65));
  assert.equal(down.at(-1).quality,'low'); assert.deepEqual(run(g,60,20),[]);
  g.reset(); assert.equal(run(g,60,8)[0].quality,'high');
});
test('Suspension is ignored, small framerate variations do not oscillate quality',()=>{
  const g=createGovernor(); for(const dt of [NaN,Infinity,-1,0,5])assert.equal(g.sample(dt),null);
  assert.deepEqual(run(g,50,10),[]);run(g,60,8);
  const changes=run(g,60,40);assert.ok(changes.every(c=>c.scale>=.65&&c.scale<=1&&c.quality==='high'));
  assert.deepEqual(run(g,54,20),[]);
});
test('Interpolation wraps angles and never changes authoritative state or interpolates a new round',()=>{
  const s={round:1,phase:'fight',fighters:[{x:0,y:0,z:0,yaw:Math.PI-.1,action:'walk',actionTime:0,_attackSerial:0}]};
  const before=pose(s);s.fighters[0].x=2;s.fighters[0].yaw=-Math.PI+.1;s.fighters[0].actionTime=.02;
  const result=interpolate(before,s,.5);assert.equal(result.fighters[0].x,1);assert.ok(Math.abs(result.fighters[0].yaw-Math.PI)<.001);
  assert.equal(s.fighters[0].x,2);assert.equal(result.fighters[0].actionTime,.01);s.round=2;assert.equal(interpolate(before,s,.5),s);
});
