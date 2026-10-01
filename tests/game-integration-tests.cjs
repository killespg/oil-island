/* CPU-only integration checks: real game/combat/progression code, fake DOM/audio/renderer/socket. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const FightSim = require('../combat.js');
const NeonRun = require('../run.js');
const NeonPerformance = require('../performance.js');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const script = fs.readFileSync(path.join(root,'game.js'),'utf8');

function harness(options = {}) {
  let document, now = 0, serial = 0;
  const raf = new Map(), timers = new Map(), errors = [], clients = [], storage = new Map();
  class Element {
    constructor(tag='div',attrs='') {
      this.tagName = tag.toUpperCase(); this.listeners = new Map(); this.style = {};
      this.attributes = {}; this.dataset = {}; this.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attrs);
      this.disabled = false; this.value = ''; this.textContent = ''; this.checked = /\bchecked\b/.test(attrs);
      const classes = new Set();
      this.classList = {add:(...v)=>v.forEach(s=>classes.add(s)), remove:(...v)=>v.forEach(s=>classes.delete(s)), contains:s=>classes.has(s), toggle(s,force){const enable=force===undefined?!classes.has(s):!!force;if(enable)classes.add(s);else classes.delete(s);return enable;}};
      for (const match of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
        this.attributes[match[1]] = match[2];
        if (match[1] === 'class') match[2].split(/\s+/).forEach(c=>classes.add(c));
        if (match[1] === 'id') this.id = match[2];
        if (match[1] === 'value') this.value = match[2];
        if (match[1].startsWith('data-')) this.dataset[match[1].slice(5)] = match[2];
      }
      this.parentElement = {setAttribute:(k,v)=>{this.parentAttributes ||= {};this.parentAttributes[k]=String(v);}};
    }
    addEventListener(type,fn) { if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn); }
    dispatch(type,extra={}) { const event={target:this,preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of this.listeners.get(type)||[])fn(event);return event; }
    setAttribute(k,v){this.attributes[k]=String(v);}
    getAttribute(k){return this.attributes[k]??null;}
    focus(){document.activeElement=this;}
    blur(){if(document.activeElement===this)document.activeElement=document.body;}
    select(){}
    setPointerCapture(){}
    querySelectorAll(selector){if(selector==='b'){this.pips ||= [new Element('b'),new Element('b')];return this.pips;}return [];}
    requestPointerLock(){document.pointerLockElement=this;document.dispatch('pointerlockchange');return Promise.resolve();}
  }
  const elements = [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(m=>new Element(m[1],m[2]));
  const byId = new Map(elements.filter(e=>e.id).map(e=>[e.id,e]));
  for (const m of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const selected=[...m[2].matchAll(/<option\b([^>]*)>/g)].find(o=>/\bselected\b/.test(o[1]))||[...m[2].matchAll(/<option\b([^>]*)>/g)][0];
    byId.get(m[1]).value=selected[1].match(/value="([^"]*)"/)[1];
  }
  document = new Element('document'); document.body=elements.find(e=>e.tagName==='BODY');
  document.activeElement=document.body; document.hidden=false; document.pointerLockElement=null;
  document.documentElement={requestFullscreen:async()=>{}};
  document.getElementById=id=>byId.get(id)||null;
  document.querySelectorAll=selector=>{
    const data=selector.match(/^\[data-(\w+)\]$/);if(data)return elements.filter(e=>data[1] in e.dataset);
    if(selector==='.touch-controls .active')return elements.filter(e=>e.dataset.control&&e.classList.contains('active'));
    if(selector.startsWith('.'))return elements.filter(e=>e.classList.contains(selector.slice(1)));
    throw new Error('Unsupported fake DOM selector: '+selector);
  };
  document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
  document.exitPointerLock=()=>{document.pointerLockElement=null;document.dispatch('pointerlockchange');};
  const scene = {
    player:0, quality:'low', scale:1, updates:[], renders:0, recovered:0, lost:false,
    setArena(v){this.arena=v;}, resetCamera(s){this.player=s.localPlayer||0;}, setLockOn(){},setReducedMotion(){},rotateCamera(){},zoomCamera(){},
    cameraInput(x,z){return {x,z};},cameraInfo(){return {yaw:0,localPlayer:this.player};},
    update(dt,s){this.updates.push({dt,state:s});this.player=s.localPlayer||0;},render(){this.renders++;},impact(){},effect(){},
    setQuality(q){this.quality=q;return q;},setResolutionScale(s){this.scale=s;return s;},graphicsInfo(){return {quality:this.quality,resolutionScale:this.scale};},
    prepareContextRecovery(){this.quality='low';},restoreContext(){this.recovered++;this.lost=false;return true;},
    renderer:{getContext:()=>({isContextLost:()=>scene.lost})}
  };
  const audio={play(){},unlock(){},setArena(){},setEnabled(){},setMusic(){},setVolume(){},tick(){}};
  const NeonNet = {create(callbacks){
    const client={state:null,playerId:0,active:false,status:{phase:'closed',code:'ABC123',ping:null},inputs:[],actions:[],neutralized:0,left:0,rematches:0,views:0,
      emit(patch){Object.assign(this.status,patch);callbacks.onStatus({...this.status});},
      host(){this.emit({phase:'connecting'});this.emit({phase:'waiting'});},join(){this.host();},
      match(state,playerId){this.playerId=playerId;this.state=state;state.localPlayer=playerId;this.active=true;this.emit({phase:'playing',rematchReady:[false,false]});callbacks.onMatch(state);},
      receiveEvents(events){callbacks.onEvents(events);},
      action(name){this.actions.push(name);return true;},step(input){this.inputs.push({...input});},
      neutralize(){this.neutralized++;this.inputs.push({x:0,z:0,block:false,sprint:false});},
      view(){this.views++;return this.state;},rematch(){this.rematches++;},
      leave(){this.left++;this.active=false;this.emit({phase:'closed',message:''});}
    };clients.push(client);return client;
  }};
  const win = new Element('window');
  const location={protocol:options.protocol||'https:',href:'https://example.test/',search:'',reload(){}};
  const context={document,navigator:{maxTouchPoints:0,clipboard:{writeText:async()=>{}}},location,HTMLElement:Element,matchMedia:()=>({matches:false}),
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},performance:{now:()=>now},
    requestAnimationFrame:fn=>{const id=++serial;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,due:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    addEventListener:win.addEventListener.bind(win),console:{error:e=>errors.push(e),log(){}},URL,URLSearchParams,
    THREE:{},FightSim,NeonRun,NeonPerformance,NeonAudio:{create:()=>audio},NeonScene:{create:()=>scene},NeonNet};
  context.window=context;vm.createContext(context);vm.runInContext(script,context,{filename:'game.js'});
  assert.deepEqual(errors,[],'game startup must not throw');assert.ok(context.__NEON__);
  const frame=(ms=1000/60)=>{now+=ms;const scheduled=[...raf.values()];raf.clear();for(const fn of scheduled)fn(now);assert.equal(raf.size,1,'exactly one active RAF after a ready frame');};
  const runTimers=()=>{for(const [id,t] of [...timers])if(t.due<=now){timers.delete(id);t.fn();}};
  return {game:context.__NEON__,context,scene,document,clients,storage,raf,timers,errors,
    el:id=>byId.get(id),click:id=>byId.get(id).dispatch('click'),frame,runTimers,
    key:(code,type='keydown')=>win.dispatch(type,{code,repeat:false,target:document.body}),
    online(playerId=1){byId.get('host-button').dispatch('click');const client=clients.at(-1);const state=FightSim.createMatch({arena:'reactor',humanPlayers:true,seed:31});state.phase='fight';client.match(state,playerId);return client;}}
}

test('CPU integration: solo pauses simulation, resumes with cleared inputs, and menu releases pointer lock',()=>{
  const h=harness();assert.equal(h.game.mode,'menu');h.click('training-button');assert.equal(h.game.mode,'fight');h.game.state.phase='fight';
  h.key('KeyW');h.frame(50);const z=h.game.state.fighters[0].z;h.click('pause-button');assert.equal(h.game.mode,'paused');h.frame(100);assert.equal(h.game.state.fighters[0].z,z);
  h.click('resume-button');h.frame(50);assert.equal(h.game.mode,'fight');assert.equal(h.game.state.fighters[0]._inputZ,0);
  h.document.pointerLockElement=h.el('game-canvas');h.game.menu();assert.equal(h.document.pointerLockElement,null);assert.equal(h.game.mode,'menu');assert.equal(h.el('menu-screen').hidden,false);
});

test('CPU integration: player 2 owns HUD, score, combat feedback and camera identity',()=>{
  const h=harness(),client=h.online(1),s=client.state;s.fighters[0].hp=83;s.fighters[1].hp=37;s.fighters[1].energy=20;s.wins=[0,1];
  h.frame(60);assert.equal(h.scene.player,1);assert.equal(h.el('player-name').textContent,'CRIMSON');assert.equal(h.el('enemy-name').textContent,'AZURE');assert.equal(h.el('player-hp').textContent,37);assert.equal(h.el('enemy-hp').textContent,83);assert.equal(h.el('player-rounds').querySelectorAll('b')[0].classList.contains('won'),true);
  h.key('KeyL');assert.equal(client.actions.at(-1),'special');assert.match(h.el('combat-toast').textContent,/40 ENERGIA/);
  client.receiveEvents([{type:'hit',attacker:1,target:0,damage:12,combo:3,move:'punch'},{type:'parry',attacker:0,target:1,damage:0}]);h.frame(60);
  assert.equal(h.game.stats.damage,12);assert.equal(h.game.stats.combo,3);assert.equal(h.game.stats.parries,1);
  s.phase='matchOver';s.winner=1;s.wins=[1,2];client.emit({phase:'result'});client.receiveEvents([{type:'matchEnd'}]);h.frame();
  assert.equal(h.game.mode,'result');assert.equal(h.el('result-title').textContent,'VITÓRIA.');assert.equal(h.el('result-score').textContent,'2—1');assert.equal(h.storage.get('neon-clash-wins'),'1');h.frame();assert.equal(h.storage.get('neon-clash-wins'),'1');
});

test('CPU integration: online pause sends neutral input while match and presentation keep running',()=>{
  const h=harness(),client=h.online();h.key('KeyW');h.frame(50);assert.ok(client.inputs.at(-1).z<0);
  h.click('pause-button');assert.equal(h.game.mode,'paused');assert.equal(client.neutralized,1);const views=client.views;
  h.frame(50);assert.deepEqual(client.inputs.at(-1),{});assert.ok(client.views>views);assert.equal(h.el('restart-button').hidden,true);
  h.key('KeyR');assert.equal(h.clients.length,1);assert.equal(client.left,0);h.key('KeyJ');assert.equal(client.actions.length,0);
  h.click('resume-button');h.frame(50);assert.equal(client.inputs.at(-1).z,0);assert.equal(h.game.mode,'fight');
});

test('CPU integration: online rematch resets state and peer departure returns cleanly to solo menu',()=>{
  const h=harness(),client=h.online();client.state.phase='matchOver';client.state.winner=0;client.state.wins=[2,1];client.emit({phase:'result'});h.frame();
  h.click('rematch-button');assert.equal(client.rematches,1);client.emit({rematchReady:[false,true]});assert.equal(h.el('rematch-button').disabled,true);
  const next=FightSim.createMatch({arena:'void',humanPlayers:true,seed:4});client.match(next,1);assert.equal(h.game.mode,'fight');assert.equal(h.el('result-screen').hidden,true);assert.equal(h.el('rematch-button').disabled,false);assert.equal(h.scene.arena,'void');assert.equal(h.scene.player,1);
  client.active=false;client.emit({phase:'closed',message:'O outro jogador saiu da sala.'});assert.equal(h.game.mode,'menu');assert.equal(h.game.network,null);assert.equal(h.el('online-panel').open,true);assert.match(h.el('online-status').textContent,/outro jogador/);
  h.click('training-button');assert.equal(h.game.mode,'fight');assert.equal(h.el('player-name').textContent,'AZURE');assert.equal(h.scene.player,0);assert.equal(h.el('restart-button').hidden,false);
});

test('CPU integration: WebGL loss neutralizes online inputs and restores one RAF with the latest state',()=>{
  const h=harness(),client=h.online();h.key('KeyI');h.frame(50);h.scene.lost=true;
  const lost=h.el('game-canvas').dispatch('webglcontextlost');assert.equal(lost.defaultPrevented,true);assert.equal(h.game.graphics.status,'recovering');assert.equal(h.game.mode,'paused');assert.equal(client.neutralized,1);assert.equal(h.raf.size,0);
  const newer=FightSim.createMatch({humanPlayers:true,arena:'reactor'});newer.localPlayer=1;newer.fighters[1].hp=46;client.state=newer;
  h.el('game-canvas').dispatch('webglcontextrestored');h.runTimers();assert.equal(h.game.graphics.status,'ready');assert.equal(h.game.quality,'low');assert.equal(h.scene.updates.at(-1).state,newer);assert.equal(h.game.mode,'paused');assert.equal(h.raf.size,1);assert.equal(h.scene.recovered,1);
  h.frame(60);assert.equal(h.el('player-hp').textContent,46);assert.equal(client.inputs.at(-1).block,undefined);h.click('resume-button');h.frame(50);assert.equal(client.inputs.at(-1).block,false);
});

test('CPU integration: file mode refuses online without breaking the offline game',()=>{
  const h=harness({protocol:'file:'});h.click('host-button');assert.equal(h.clients.length,0);assert.match(h.el('online-status').textContent,/endereço do servidor/);h.click('training-button');assert.equal(h.game.mode,'fight');h.frame();
});

test('CPU integration: online result can finish while paused and a hidden-tab rematch remains neutral',()=>{
  const h=harness(),client=h.online();h.click('pause-button');client.state.phase='matchOver';client.state.winner=1;client.state.wins=[0,2];client.emit({phase:'result'});h.frame();
  assert.equal(h.game.mode,'result');assert.equal(h.el('pause-screen').hidden,true);assert.equal(h.el('result-screen').hidden,false);
  h.document.hidden=true;const next=FightSim.createMatch({humanPlayers:true,arena:'skyline'});client.match(next,1);
  assert.equal(h.game.mode,'paused');assert.equal(h.el('result-screen').hidden,true);assert.equal(h.el('pause-screen').hidden,false);assert.equal(client.neutralized,2);h.frame(50);assert.deepEqual(client.inputs.at(-1),{});
});

test('CPU integration: restored graphics stay LOW until the user opts back into automatic quality',()=>{
  const h=harness();h.click('training-button');h.scene.lost=true;h.el('game-canvas').dispatch('webglcontextlost');h.el('game-canvas').dispatch('webglcontextrestored');h.runTimers();h.click('resume-button');
  assert.equal(h.game.qualityMode,'low');assert.equal(h.scene.scale,1);
  for(let i=0;i<450;i++)h.frame();assert.equal(h.game.quality,'low');assert.equal(h.game.qualityMode,'low');
  h.click('quality-button');assert.equal(h.game.qualityMode,'auto');
  for(let i=0;i<450;i++)h.frame();assert.equal(h.game.quality,'high');assert.ok(h.scene.scale>=.65&&h.scene.scale<=1);
});
