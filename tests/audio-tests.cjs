const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.resolve(__dirname, '../audio.js'), 'utf8');

function harness(options) {
  class Param {
    constructor(value=0) { this.value=value; this.events=[]; }
    setValueAtTime(value,time) { assert.ok(Number.isFinite(value)); assert.ok(Number.isFinite(time)); this.value=value; this.events.push(['set',value,time]); }
    exponentialRampToValueAtTime(value,time) { assert.ok(value>0 && Number.isFinite(value)); assert.ok(Number.isFinite(time)); this.events.push(['ramp',value,time]); }
    setTargetAtTime(value,time,speed) { this.setValueAtTime(value,time); assert.ok(speed>0); }
    cancelAndHoldAtTime(time) { this.events.push(['hold',time]); }
    cancelScheduledValues(time) { this.events.push(['cancel',time]); }
  }
  class Node {
    constructor(kind,ctx) { this.kind=kind; this.connections=[]; this.disconnected=false; ctx.all.push(this); }
    connect(node) { this.connections.push(node); }
    disconnect() { this.connections=[]; this.disconnected=true; }
  }
  class Source extends Node {
    constructor(kind,ctx) { super(kind,ctx); this.ctx=ctx; this.frequency=new Param(); ctx.sources.push(this); }
    start(time) { assert.ok(Number.isFinite(time) && time>=this.ctx.currentTime); this.startAt=time; }
    stop(time) { assert.ok(Number.isFinite(time) && time>=0); this.stopAt=time; }
  }
  class Context {
    constructor() { this.state='running'; this.currentTime=0; this.sampleRate=44100; this.all=[]; this.sources=[]; this.gains=[]; this.destination={}; }
    createGain() { const n=new Node('gain',this); n.gain=new Param(1); this.gains.push(n); return n; }
    createDynamicsCompressor() { const n=new Node('compressor',this); for(const k of ['threshold','knee','ratio','attack','release'])n[k]=new Param(); return n; }
    createBuffer(_,size) { return {getChannelData:()=>new Float32Array(size)}; }
    createOscillator() { return new Source('tone',this); }
    createBufferSource() { return new Source('noise',this); }
    createBiquadFilter() { const n=new Node('filter',this); n.frequency=new Param(); n.Q=new Param(); return n; }
    createStereoPanner() { const n=new Node('panner',this); n.pan=new Param(); return n; }
    resume() { this.state='running'; return Promise.resolve(); }
    advance(time) { this.currentTime=time; for(const s of this.sources) if(!s.ended && s.stopAt<=time) { s.ended=true; if(s.onended)s.onended(); } }
  }
  const window={AudioContext:Context};
  vm.runInNewContext(code,{window});
  const audio=window.NeonAudio.create(options);
  return {audio, get ctx(){return audio.context;}};
}
const state={fighters:[{hp:20,maxHp:100},{hp:100,maxHp:100}]};
function target(source) { let n=source; for(let i=0;i<5;i++) { const next=n.connections[0]; if(!next)return n; if(next.kind==='compressor')return n; n=next; } return n; }

test('all four arenas produce finite, distinct arrangements and release every voice',()=>{
  const signatures=[];
  for(const arena of ['island','nightclub','seaside','helipad']) {
    const {audio,ctx:before}=harness(); assert.equal(before,undefined); audio.unlock(); const ctx=audio.context;
    audio.setArena(arena);
    let peak=0;
    for(let i=0;i<600;i++){ctx.advance(i/60);audio.tick(state,true);peak=Math.max(peak,audio.activeNodes);}
    assert.ok(peak<48,`${arena}: peak ${peak}`);
    signatures.push(ctx.sources.filter(s=>s.kind==='tone').map(s=>[s.type,s.frequency.events[0][1].toFixed(2),s.startAt.toFixed(2)]).join('|'));
    audio.tick(state,false);ctx.advance(12);assert.equal(audio.activeNodes,0);
    assert.ok(ctx.sources.every(s=>s.disconnected));
  }
  assert.equal(new Set(signatures).size,4);
});

test('arena switch fades old music while preserving a combat effect',()=>{
  const h=harness();h.audio.unlock();h.audio.setArena('seaside');h.audio.tick(state,true);
  const old=h.ctx.sources.slice();h.audio.play('roundEnd');const fx=h.ctx.sources.slice(old.length);
  const fxStops=fx.map(s=>s.stopAt);
  h.audio.setArena('nightclub');
  assert.ok(old.every(s=>s.stopAt===.035));assert.deepEqual(fx.map(s=>s.stopAt),fxStops);
  h.audio.tick(state,true);h.ctx.advance(.05);
  assert.ok(old.every(s=>s.ended&&s.disconnected));assert.ok(fx.every(s=>!s.ended));
  h.audio.tick(state,false);h.ctx.advance(3);assert.equal(h.audio.activeNodes,0);
});

test('sound/music switches and pause clear sustained music without muting effects',()=>{
  for(const stop of [a=>a.setMusic(false),a=>a.setEnabled(false),a=>a.tick(state,false)]) {
    const h=harness();h.audio.unlock();h.audio.setArena('seaside');h.audio.tick(state,true);
    assert.ok(h.audio.activeNodes>0);stop(h.audio);h.ctx.advance(.05);assert.equal(h.audio.activeNodes,0);
    const before=h.ctx.sources.length;h.audio.tick(state,false);assert.equal(h.ctx.sources.length,before);
  }
  const h=harness();h.audio.unlock();h.audio.setMusic(false);h.audio.tick(state,true);assert.equal(h.audio.activeNodes,0);
  h.audio.play('parry');assert.equal(h.audio.activeNodes,4);
});

test('music reserves effects capacity; hard voice limit is exactly eighty',()=>{
  const h=harness();h.audio.unlock();
  for(let i=0;i<30;i++){h.audio.setArena('seaside');h.audio.tick(state,true);}
  assert.equal(h.audio.activeNodes,48);
  assert.ok(h.ctx.sources.every(s=>target(s)===h.ctx.gains[1]));
  for(let i=0;i<40;i++)h.audio.play('parry');
  assert.equal(h.audio.activeNodes,80);assert.equal(h.ctx.sources.length,80);
  assert.equal(h.ctx.sources.filter(s=>target(s)===h.ctx.gains[2]).length,32);
  h.ctx.advance(3);assert.equal(h.audio.activeNodes,0);assert.ok(h.ctx.sources.every(s=>s.disconnected));
});

test('return after two hidden minutes schedules one fresh beat without catch-up',()=>{
  const h=harness();h.audio.unlock();h.audio.setArena('seaside');h.audio.tick(state,true);h.ctx.advance(120);
  const before=h.ctx.sources.length;h.audio.tick(state,true);const after=h.ctx.sources.length;
  assert.ok(after-before<=10);assert.ok(h.ctx.sources.slice(before).every(s=>s.startAt>=120&&s.startAt<=120.3));
  h.audio.tick(state,true);assert.equal(h.ctx.sources.length,after);
  h.audio.tick(state,false);h.ctx.advance(121);assert.equal(h.audio.activeNodes,0);
});

test('arena IDs are validated, muted boot is silent and unavailable audio is optional',()=>{
  const h=harness({enabled:false});h.audio.unlock();h.audio.setArena('toString');h.audio.tick(state,true);h.audio.play('hit');assert.equal(h.audio.activeNodes,0);
  h.audio.setEnabled(true);h.audio.tick(state,true);assert.ok(h.audio.activeNodes>0);
  const window={};vm.runInNewContext(code,{window});const noAudio=window.NeonAudio.create();
  noAudio.unlock();noAudio.setArena('island');noAudio.tick(state,true);noAudio.play('hit');assert.equal(noAudio.activeNodes,0);
});

test('Orelha chase footsteps follow phase time, pause and never catch up missed steps',()=>{
  const h=harness();h.audio.unlock();h.audio.setArena('seaside');
  const s={arena:'seaside',phase:'intro',round:1,training:false,phaseTime:0,fighters:[{character:'pixel'},{character:'orelha'}]};
  h.audio.tick(s,true);assert.equal(h.ctx.sources.length,2);
  h.audio.tick(s,true);assert.equal(h.ctx.sources.length,2,'same phase produces no duplicate');
  s.phaseTime=2;h.audio.tick(s,false);assert.equal(h.ctx.sources.length,2,'paused intro is silent');
  h.ctx.advance(120);h.audio.tick(s,true);assert.equal(h.ctx.sources.length,4,'resume emits only current step');
  s.phaseTime=5;h.audio.tick(s,true);assert.equal(h.ctx.sources.length,4,'settled dog has no footsteps');
  s.phaseTime=0;h.audio.tick(s,true);assert.equal(h.ctx.sources.length,6,'rematch restarts cadence');
});

test('chase intro is silent when muted or not eligible',()=>{
  const h=harness({enabled:false});h.audio.unlock();
  const s={arena:'seaside',phase:'intro',round:1,phaseTime:.2,fighters:[{character:'orelha'},{character:'veterano'}]};
  h.audio.tick(s,true);assert.equal(h.ctx.sources.length,0);
  h.audio.setEnabled(true);s.training=true;h.audio.tick(s,true);assert.equal(h.ctx.sources.length,0);
  s.training=false;s.round=2;h.audio.tick(s,true);assert.equal(h.ctx.sources.length,0);
  s.round=1;s.fighters[0].character='pixel';h.audio.tick(s,true);assert.equal(h.ctx.sources.length,0);
});
