const test=require('node:test'),assert=require('node:assert/strict');
const feedback=require('../combat-feedback.js');
test('long combos widen the view with a strict cap and inactive combos release it',()=>{
  const active=n=>[{hp:300,combo:n,_comboTimer:1}];
  assert.equal(feedback.framing(active(1),false),0);
  assert(feedback.framing(active(5),false)>feedback.framing(active(3),false));
  assert(feedback.framing(active(500),false)<=6);
  assert.equal(feedback.framing([{hp:300,combo:8,_comboTimer:0}],false),0);
  assert.equal(feedback.framing([{hp:0,combo:8,_comboTimer:1}],false),0);
});
test('combo impact grows but frequent strikes avoid repeated long freezes',()=>{
  const first=feedback.impact({type:'hit',move:'punch',combo:1}),long=feedback.impact({type:'hit',move:'punch',combo:5}),final=feedback.impact({type:'hit',move:'kick',combo:8});
  assert(long.power>first.power);assert(long.pause<first.pause);assert(final.zoom>long.zoom);
  for(const combo of [1,2,5,8,200,NaN,Infinity]){
    const f=feedback.impact({type:'hit',move:'super',combo});
    Object.values(f).forEach(n=>assert(Number.isFinite(n)));
    assert(f.shake<=.105&&f.zoom<=3&&Math.abs(f.roll)<=.009&&f.pause<=.04);
  }
});
test('oil cannot shake or freeze the view twenty times during the stream',()=>{
  const f=feedback.impact({type:'hit',move:'special',combo:20,kind:'oil'});
  assert.equal(f.pause,0);assert.equal(f.shake,0);assert.equal(f.zoom,0);assert.equal(f.roll,0);
});
test('reduced motion removes dynamic framing and all camera impact motion',()=>{
  for(const type of ['hit','parry','block']){
    const f=feedback.impact({type,combo:8,move:'super'},true);
    assert.equal(f.pause,0);assert.equal(f.shake,0);assert.equal(f.zoom,0);assert.equal(f.roll,0);assert(f.power>0);
  }
  assert.equal(feedback.framing([{hp:300,combo:8,_comboTimer:1}],true),0);
});
