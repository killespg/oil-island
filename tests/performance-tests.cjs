const test = require('node:test');
const assert = require('node:assert/strict');
const {createGovernor,pose,interpolate} = require('../performance.js');
function run(g, fps, seconds, options) { const changes=[]; for(let i=0;i<fps*seconds;i++){const c=g.sample(1/fps,options);if(c)changes.push(c);}return changes; }
test('Automatic quality warms up, adjusts HQ resolution, and avoids repeated failed promotions',()=>{
  const g=createGovernor(); assert.deepEqual(run(g,60,4),[]);
  assert.equal(run(g,60,4)[0].quality,'high');
  const down=run(g,25,12); assert.ok(down.some(c=>c.quality==='high'&&c.scale===.65));
  assert.deepEqual(down.at(-1),{quality:'low',scale:.65});
  assert.ok(run(g,60,100).every(c=>c.quality==='low'),'a failed HQ attempt cannot repeat without resetting');
  g.reset(); assert.equal(run(g,60,8)[0].quality,'high');
});
test('20 FPS in LQ reduces resolution in steps and keeps the floor while still slow',()=>{
  const g=createGovernor();
  assert.deepEqual(run(g,20,8),[
    {quality:'low',scale:.9},{quality:'low',scale:.8},{quality:'low',scale:.7},{quality:'low',scale:.65}
  ]);
  assert.deepEqual(run(g,20,20),[]);
  assert.deepEqual(run(g,56,10),[],'a barely improved framerate cannot restore resolution');
});
test('LQ reacts below 57 FPS but does not oscillate in the 57 FPS neutral band',()=>{
  const g=createGovernor();assert.deepEqual(run(g,57,10),[]);
  assert.deepEqual(run(g,56,2),[{quality:'low',scale:.9}]);
  assert.deepEqual(run(g,57,20),[]);
});
test('40 FPS in HQ falls back after two slow windows at minimum resolution',()=>{
  const g=createGovernor({quality:'high',scale:.75});
  assert.deepEqual(run(g,40,2),[{quality:'high',scale:.65}]);
  assert.deepEqual(run(g,40,2),[],'reaching the floor is not yet a failed floor sample');
  assert.deepEqual(run(g,40,2),[{quality:'low',scale:.65}]);
  assert.deepEqual(run(g,40,10),[]);
});
test('Resolution recovers gradually only after four consecutive windows at 58 FPS or better',()=>{
  const g=createGovernor({quality:'low',scale:.65,allowHigh:false});
  assert.deepEqual(run(g,58,6),[]);
  assert.deepEqual(run(g,58,2),[{quality:'low',scale:.7}]);
  assert.deepEqual(run(g,60,6),[]);
  assert.deepEqual(run(g,57,2),[],'a neutral window cancels recovery evidence');
  assert.deepEqual(run(g,60,6),[]);
  assert.deepEqual(run(g,60,2),[{quality:'low',scale:.75}]);
});
test('Menu and intro samples can lower resolution without restoring it or promoting HQ',()=>{
  const g=createGovernor();assert.deepEqual(run(g,60,30,{allowUpgrade:false}),[]);
  assert.deepEqual(run(g,20,2,{allowUpgrade:false}),[{quality:'low',scale:.9}]);
  assert.deepEqual(run(g,60,30,{allowUpgrade:false}),[]);
  assert.deepEqual(run(g,60,6),[],'menu frames cannot prime a resolution recovery');
  assert.deepEqual(run(g,60,2),[{quality:'low',scale:.95}]);
});
test('A menu sample interrupts previously good fight windows',()=>{
  const g=createGovernor();assert.deepEqual(run(g,60,4),[]);
  g.sample(1/60,{allowUpgrade:false});
  assert.deepEqual(run(g,60,4),[]);
  assert.equal(run(g,60,4).at(-1).quality,'high');
});
test('Manual LQ can adapt and restore its scale but never promotes HQ',()=>{
  const g=createGovernor({allowHigh:false});assert.equal(run(g,20,8).at(-1).scale,.65);
  const recovery=run(g,60,100);assert.equal(recovery.at(-1).scale,1);
  assert.ok(recovery.every(c=>c.quality==='low'));
  assert.deepEqual(run(g,60,30),[]);
});
test('Pause, hidden-tab and loading gaps clear evidence without changing graphics',()=>{
  for(const dt of [NaN,Infinity,-1,0,.26,5]) {
    const g=createGovernor();run(g,60,4);assert.equal(g.sample(dt,{allowUpgrade:false}),null);
    assert.deepEqual(run(g,60,4),[],'suspended frames cannot complete a previous stable streak');
    assert.equal(run(g,60,2).at(-1).quality,'high');
  }
});
test('Reset follows actual renderer quality and scale while respecting manual LQ',()=>{
  const g=createGovernor();run(g,60,8);
  g.reset({quality:'low',scale:.8,allowHigh:false});
  assert.deepEqual(run(g,20,2),[{quality:'low',scale:.7}]);
  assert.ok(run(g,60,100).every(c=>c.quality==='low'));
  g.reset({quality:'high',scale:.65,allowHigh:true});
  assert.deepEqual(run(g,40,4),[{quality:'low',scale:.65}]);
});
test('Reset clamps renderer scale and discards invalid scale values',()=>{
  const g=createGovernor({quality:'low',scale:-1,allowHigh:false});
  assert.deepEqual(run(g,20,4),[]);
  assert.deepEqual(run(g,60,8),[{quality:'low',scale:.7}]);
  g.reset({quality:'low',scale:Infinity,allowHigh:false});
  assert.deepEqual(run(g,20,2),[{quality:'low',scale:.9}]);
});
test('Small HQ framerate variations do not oscillate resolution',()=>{
  const g=createGovernor({quality:'high',scale:.85});
  assert.deepEqual(run(g,54,20),[]);
  const changes=run(g,60,40);assert.ok(changes.every(c=>c.scale>=.65&&c.scale<=1&&c.quality==='high'));
});
test('Interpolation wraps angles and never changes authoritative state or interpolates a new round',()=>{
  const s={round:1,phase:'fight',fighters:[{x:0,y:0,z:0,yaw:Math.PI-.1,action:'walk',actionTime:0,_attackSerial:0}]};
  const before=pose(s);s.fighters[0].x=2;s.fighters[0].yaw=-Math.PI+.1;s.fighters[0].actionTime=.02;
  const result=interpolate(before,s,.5);assert.equal(result.fighters[0].x,1);assert.ok(Math.abs(result.fighters[0].yaw-Math.PI)<.001);
  assert.equal(s.fighters[0].x,2);assert.equal(result.fighters[0].actionTime,.01);s.round=2;assert.equal(interpolate(before,s,.5),s);
});
