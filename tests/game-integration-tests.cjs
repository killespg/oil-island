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
  const raf = new Map(), timers = new Map(), errors = [], clients = [], storage = new Map(options.storage || []);
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
    setArena(v){this.arena=v;}, resetCamera(s){this.player=s.localPlayer||0;}, setLockOn(){},setReducedMotion(){},rotateCamera(x,y){this.rotation={x,y};},zoomCamera(){},
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
      host(arena,character){this.hostSelection={arena,character};this.emit({phase:'connecting'});this.emit({phase:'waiting'});},join(){this.host();},
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
  const context={document,navigator:{maxTouchPoints:options.maxTouchPoints||0,clipboard:{writeText:async()=>{}}},location,HTMLElement:Element,
    matchMedia:query=>({matches:query==='(pointer: coarse)'?!!options.coarsePointer:query==='(any-pointer: fine)'?!!options.finePointer:false}),
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},performance:{now:()=>now},
    requestAnimationFrame:fn=>{const id=++serial;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,due:now+delay});return id;},clearTimeout:id=>timers.delete(id),
    addEventListener:win.addEventListener.bind(win),console:{error:e=>errors.push(e),log(){}},URL,URLSearchParams,
    THREE:{},FightSim,NeonRun,NeonPerformance,NeonFeedback:require('../combat-feedback.js'),NeonAudio:{create:()=>audio},NeonScene:{create:()=>scene},NeonNet};
  context.window=context;vm.createContext(context);vm.runInContext(script,context,{filename:'game.js'});
  assert.deepEqual(errors,[],'game startup must not throw');assert.ok(context.__NEON__);
  const frame=(ms=1000/60)=>{now+=ms;const scheduled=[...raf.values()];raf.clear();for(const fn of scheduled)fn(now);assert.equal(raf.size,1,'exactly one active RAF after a ready frame');};
  const runTimers=()=>{for(const [id,t] of [...timers])if(t.due<=now){timers.delete(id);t.fn();}};
  return {game:context.__NEON__,context,scene,document,clients,storage,raf,timers,errors,
    el:id=>byId.get(id),click:id=>byId.get(id).dispatch('click'),frame,runTimers,
    key:(code,type='keydown')=>win.dispatch(type,{code,repeat:false,target:document.body}),
    pointer:(type,extra)=>win.dispatch(type,extra),
    online(playerId=1){byId.get('host-button').dispatch('click');const client=clients.at(-1);const state=FightSim.createMatch({arena:'nightclub',humanPlayers:true,seed:31});state.phase='fight';client.match(state,playerId);return client;}}
}

test('CPU integration: solo pauses simulation, resumes with cleared inputs, and menu releases pointer lock',()=>{
  const h=harness();assert.equal(h.game.mode,'menu');h.click('training-button');assert.equal(h.game.mode,'fight');h.game.state.phase='fight';
  h.key('KeyW');h.frame(50);const z=h.game.state.fighters[0].z;h.click('pause-button');assert.equal(h.game.mode,'paused');h.frame(100);assert.equal(h.game.state.fighters[0].z,z);
  h.click('resume-button');h.frame(50);assert.equal(h.game.mode,'fight');assert.equal(h.game.state.fighters[0]._inputZ,0);
  h.document.pointerLockElement=h.el('game-canvas');h.game.menu();assert.equal(h.document.pointerLockElement,null);assert.equal(h.game.mode,'menu');assert.equal(h.el('menu-screen').hidden,false);
});

test('keyboard-only fight starts locked with 300 health and renders a real mixed combo route',()=>{
  const h=harness();h.click('training-button');const s=h.game.state;s.phase='fight';
  assert.equal(s.fighters[0].maxHp,300);assert.equal(s.timeLeft,120);
  assert.equal(h.el('lock-status').getAttribute('aria-pressed'),'true');
  const [p,e]=s.fighters;p.x=0;p.z=0;e.x=1.1;e.z=0;p.yaw=Math.PI/2;e.yaw=-Math.PI/2;
  h.key('KeyJ');h.key('KeyJ','keyup');for(let f=0;f<12;f++)h.frame();
  h.key('KeyK');h.key('KeyK','keyup');for(let f=0;f<18;f++)h.frame();
  assert(e.hp<e.maxHp,'real keyboard actions cause authoritative damage');
  assert(p.combo>=2,'a mixed input route connects in training');
  assert.equal(h.el('combo-display').hidden,false);
  assert.equal(h.el('combo-route').textContent,'J › K');
  assert(Number(h.el('combo-count').textContent)>=2);
  assert.match(h.el('combo-window-fill').style.transform,/^scaleX\(0\./);
});

test('a new keyboard match restores automatic target lock after a free-camera session',()=>{
  const h=harness();h.click('training-button');h.key('Tab');h.key('Tab','keyup');
  assert.equal(h.el('lock-status').getAttribute('aria-pressed'),'false');
  h.game.menu();h.click('start-button');
  assert.equal(h.el('lock-status').getAttribute('aria-pressed'),'true');
  assert.match(h.el('camera-hint').textContent,/CÂMERA AUTOMÁTICA/);
});

test('Orla chase hides fight HUD until handoff, freezes on pause and rejects early attacks',()=>{
  const h=harness();h.click('arena-seaside');h.click('character-orelha');h.click('start-button');h.frame(50);
  const s=h.game.state;assert.equal(s.phase,'intro');assert.equal(h.document.body.classList.contains('in-cutscene'),true);
  const start=FightSim.snapshot(s);h.key('KeyJ');h.key('KeyJ','keyup');
  assert.equal(s.fighters[0].energy,start.fighters[0].energy);assert.equal(s.fighters[0].action,'idle');
  h.click('pause-button');const time=s.phaseTime;h.frame(50);assert.equal(s.phaseTime,time);
  h.click('resume-button');h.frame(50);assert(s.phaseTime>time);
  s.phaseTime=5.04;h.frame(50);assert.equal(h.document.body.classList.contains('in-cutscene'),false);
  assert.equal(h.el('announcement-title').textContent,'LUTE!');
  s.phaseTime=6.18;h.frame(50);assert.equal(s.phase,'fight');assert(s.timeLeft>119.95 && s.timeLeft<=120);
});

test('online chase presentation also recognizes Orelha in the opponent slot',()=>{
  const h=harness(),client=h.online(0),s=client.state;
  s.arena='seaside';s.phase='intro';s.phaseTime=1;s.round=1;s.fighters[0].character='pixel';s.fighters[1].character='orelha';
  h.frame(50);assert.equal(h.document.body.classList.contains('in-cutscene'),true);
  s.fighters[1].character='titan';h.frame(50);assert.equal(h.document.body.classList.contains('in-cutscene'),false);
  s.fighters[1].character='orelha';s.training=true;h.frame(50);assert.equal(h.document.body.classList.contains('in-cutscene'),false);
});

for (const [index, arena] of ['island', 'nightclub', 'seaside', 'helipad'].entries()) test(`CPU integration: ${arena} selection survives reload, training and online hosting`, () => {
  const h = harness(); h.click(`arena-${arena}`);
  assert.equal(h.game.state.arena, arena); assert.equal(h.scene.arena, arena);
  assert.equal(h.el('arena-select').value, arena);
  assert.equal(h.el(`arena-${arena}`).getAttribute('aria-pressed'), 'true');
  assert.equal(h.el('arena-number').textContent, `0${index + 1} / 04`);
  assert.equal(h.document.querySelectorAll('[data-arena]').filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
  assert.equal(JSON.parse(h.storage.get('neon-clash-settings-v2')).arena, arena);
  const reloaded = harness({ storage: h.storage });
  assert.equal(reloaded.game.state.arena, arena); assert.equal(reloaded.scene.arena, arena);
  reloaded.click('training-button'); assert.equal(reloaded.game.mode, 'fight'); assert.equal(reloaded.game.state.arena, arena);
  reloaded.game.menu(); assert.equal(reloaded.game.state.arena, arena);
  reloaded.click('host-button'); assert.equal(reloaded.clients.at(-1).hostSelection.arena, arena);
});

test('CPU integration: retired arena saves migrate to the island without losing player preferences or records', () => {
  for (const arena of ['skyline', 'reactor', 'void']) {
    const settings = { arena, difficulty: 'hard', character: 'orelha', opponent: 'pixel', sensitivity: 1.6, volume: 30, music: false, sound: false, shake: false, showFps: true };
    const h = harness({ storage: new Map([
      ['neon-clash-settings-v2', JSON.stringify(settings)],
      ['neon-clash-wins', '7'], ['neon-clash-ascent-best', JSON.stringify({ cleared: 5, score: 7123 })]
    ]) });
    assert.equal(h.game.state.arena, 'island'); assert.equal(h.scene.arena, 'island');
    assert.deepEqual(JSON.parse(h.storage.get('neon-clash-settings-v2')), { ...settings, arena: 'island', quality: 'auto' });
    assert.equal(h.storage.get('neon-clash-wins'), '7');
    assert.deepEqual(JSON.parse(h.storage.get('neon-clash-ascent-best')), { cleared: 5, score: 7123 });
    assert.equal(h.game.state.fighters[0].character, 'orelha');
    assert.equal(h.game.state.fighters[1].character, 'pixel');
  }
});

test('CPU integration: player 2 owns HUD, score, combat feedback and camera identity',()=>{
  const h=harness(),client=h.online(1),s=client.state;s.fighters[0].hp=83;s.fighters[1].hp=37;s.fighters[1].energy=20;s.wins=[0,1];
  h.frame(60);assert.equal(h.scene.player,1);assert.equal(h.el('player-name').textContent,'DIDDY');assert.equal(h.el('enemy-name').textContent,'EPSTEIN');assert.equal(h.el('player-hp').textContent,37);assert.equal(h.el('enemy-hp').textContent,83);assert.equal(h.el('player-rounds').querySelectorAll('b')[0].classList.contains('won'),true);
  h.key('KeyL');assert.equal(client.actions.at(-1),'special');assert.match(h.el('combat-toast').textContent,/44 ENERGIA/);
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

test('CPU integration: online rematch resets state and either departure returns cleanly to solo menu',()=>{
  const h=harness(),client=h.online();client.state.phase='matchOver';client.state.winner=0;client.state.wins=[2,1];client.emit({phase:'result'});h.frame();
  h.click('rematch-button');assert.equal(client.rematches,1);client.emit({rematchReady:[false,true]});assert.equal(h.el('rematch-button').disabled,true);
  const next=FightSim.createMatch({arena:'seaside',humanPlayers:true,seed:4});client.match(next,1);assert.equal(h.game.mode,'fight');assert.equal(h.el('result-screen').hidden,true);assert.equal(h.el('rematch-button').disabled,false);assert.equal(h.scene.arena,'seaside');assert.equal(h.scene.player,1);
  client.active=false;client.emit({phase:'closed',message:'O outro jogador saiu da sala.'});assert.equal(h.game.mode,'menu');assert.equal(h.game.network,null);assert.equal(h.el('online-panel').open,true);assert.match(h.el('online-status').textContent,/outro jogador/);
  h.click('training-button');assert.equal(h.game.mode,'fight');assert.equal(h.el('player-name').textContent,'EPSTEIN');assert.equal(h.scene.player,0);assert.equal(h.el('restart-button').hidden,false);
  const nextClient=h.online();assert.match(h.el('online-status').textContent,/Sala conectada/);
  h.game.menu();assert.equal(nextClient.left,1);assert.equal(h.game.mode,'menu');assert.equal(h.game.network,null);
  assert.match(h.el('online-status').textContent,/Você saiu da sala/,'intentional leave cannot retain the connected-room status');
});

test('CPU integration: WebGL loss neutralizes online inputs and restores one RAF with the latest state',()=>{
  const h=harness(),client=h.online();h.key('KeyI');h.frame(50);h.scene.lost=true;
  const lost=h.el('game-canvas').dispatch('webglcontextlost');assert.equal(lost.defaultPrevented,true);assert.equal(h.game.graphics.status,'recovering');assert.equal(h.game.mode,'paused');assert.equal(client.neutralized,1);assert.equal(h.raf.size,0);
  const newer=FightSim.createMatch({humanPlayers:true,arena:'nightclub'});newer.localPlayer=1;newer.fighters[1].hp=46;client.state=newer;
  h.el('game-canvas').dispatch('webglcontextrestored');h.runTimers();assert.equal(h.game.graphics.status,'ready');assert.equal(h.game.quality,'low');assert.equal(h.scene.updates.at(-1).state,newer);assert.equal(h.game.mode,'paused');assert.equal(h.raf.size,1);assert.equal(h.scene.recovered,1);
  h.frame(60);assert.equal(h.el('player-hp').textContent,46);assert.equal(client.inputs.at(-1).block,undefined);h.click('resume-button');h.frame(50);assert.equal(client.inputs.at(-1).block,false);
});

test('CPU integration: file mode refuses online without breaking the offline game',()=>{
  const h=harness({protocol:'file:'});h.click('host-button');assert.equal(h.clients.length,0);assert.match(h.el('online-status').textContent,/endereço do servidor/);h.click('training-button');assert.equal(h.game.mode,'fight');h.frame();
});

test('CPU integration: online result can finish while paused and a hidden-tab rematch remains neutral',()=>{
  const h=harness(),client=h.online();h.click('pause-button');client.state.phase='matchOver';client.state.winner=1;client.state.wins=[0,2];client.emit({phase:'result'});h.frame();
  assert.equal(h.game.mode,'result');assert.equal(h.el('pause-screen').hidden,true);assert.equal(h.el('result-screen').hidden,false);
  h.document.hidden=true;const next=FightSim.createMatch({humanPlayers:true,arena:'island'});client.match(next,1);
  assert.equal(h.game.mode,'paused');assert.equal(h.el('result-screen').hidden,true);assert.equal(h.el('pause-screen').hidden,false);assert.equal(client.neutralized,2);h.frame(50);assert.deepEqual(client.inputs.at(-1),{});
});

test('CPU integration: restored graphics stay LOW until the user opts back into automatic quality',()=>{
  const h=harness();h.click('training-button');h.scene.lost=true;h.el('game-canvas').dispatch('webglcontextlost');h.el('game-canvas').dispatch('webglcontextrestored');h.runTimers();h.click('resume-button');
  assert.equal(h.game.qualityMode,'low');assert.equal(h.scene.scale,1);
  for(let i=0;i<450;i++)h.frame();assert.equal(h.game.quality,'low');assert.equal(h.game.qualityMode,'low');
  h.click('quality-button');assert.equal(h.game.qualityMode,'auto');
  for(let i=0;i<450;i++)h.frame();assert.equal(h.game.quality,'high');assert.ok(h.scene.scale>=.65&&h.scene.scale<=1);
});

test('CPU integration: AUTO promotes only after visible combat, never from menu, intro or paused frames',()=>{
  const h=harness();
  for(let i=0;i<600;i++)h.frame();
  assert.equal(h.game.quality,'low','menu frames cannot promote HQ');
  const client=h.online();client.state.phase='intro';
  for(let i=0;i<600;i++)h.frame();
  assert.equal(h.game.quality,'low','intro frames cannot promote HQ');
  client.state.phase='fight';h.click('pause-button');
  for(let i=0;i<600;i++)h.frame();
  assert.equal(h.game.quality,'low','paused frames cannot promote HQ');
  h.click('resume-button');h.document.hidden=true;
  for(let i=0;i<600;i++)h.frame();
  assert.equal(h.game.quality,'low','hidden frames cannot promote HQ');
  h.document.hidden=false;
  for(let i=0;i<240;i++)h.frame();
  assert.equal(h.game.quality,'low','ignored frames cannot prime the visible combat benchmark');
  for(let i=0;i<180;i++)h.frame();
  assert.equal(h.game.quality,'high');assert.equal(h.scene.scale,.85);
});

test('CPU integration: manual LQ adapts resolution and AUTO inherits its safe scale',()=>{
  const h=harness();h.click('quality-button');h.click('quality-button');
  assert.equal(h.game.qualityMode,'low');
  for(let i=0;i<200;i++)h.frame(50);
  assert.equal(h.scene.scale,.65,'even a slow menu reduces LQ resolution');
  h.click('training-button');h.game.state.phase='fight';
  for(let i=0;i<450;i++)h.frame();
  assert.equal(h.game.quality,'low','manual LQ cannot promote after good combat samples');
  assert.equal(h.scene.scale,.65,'resolution needs four full stable windows to recover');
  h.click('quality-button');
  assert.equal(h.game.qualityMode,'auto');assert.equal(h.scene.scale,.65);
  assert.equal(JSON.parse(h.storage.get('neon-clash-settings-v2')).quality,'auto');
  for(let i=0;i<540;i++)h.frame();
  assert.equal(h.game.quality,'low');assert.equal(h.scene.scale,.7,'AUTO resumes gradual recovery from the inherited scale');
});

test('CPU integration: explicit HQ survives reload and does not degrade under low FPS',()=>{
  const h=harness();h.click('quality-button');
  assert.equal(h.game.qualityMode,'high');assert.equal(h.game.quality,'high');
  assert.equal(JSON.parse(h.storage.get('neon-clash-settings-v2')).quality,'high');
  const reloaded=harness({storage:h.storage});
  assert.equal(reloaded.game.qualityMode,'high');assert.equal(reloaded.game.quality,'high');
  reloaded.click('training-button');reloaded.game.state.phase='fight';
  for(let i=0;i<400;i++)reloaded.frame(50);
  assert.equal(reloaded.game.quality,'high');assert.equal(reloaded.scene.scale,1);
});

test('CPU integration: context recovery preserves reduced resolution and saves the safe LQ preference',()=>{
  const h=harness();
  for(let i=0;i<200;i++)h.frame(50);
  assert.equal(h.scene.scale,.65);
  h.scene.lost=true;h.el('game-canvas').dispatch('webglcontextlost');
  h.el('game-canvas').dispatch('webglcontextrestored');h.runTimers();
  assert.equal(h.game.graphics.status,'ready');assert.equal(h.game.qualityMode,'low');
  assert.equal(h.game.quality,'low');assert.equal(h.scene.scale,.65);
  assert.equal(JSON.parse(h.storage.get('neon-clash-settings-v2')).quality,'low');
  const reloaded=harness({storage:h.storage});
  assert.equal(reloaded.game.qualityMode,'low');assert.equal(reloaded.game.quality,'low');
  reloaded.click('training-button');reloaded.game.state.phase='fight';
  for(let i=0;i<600;i++)reloaded.frame();
  assert.equal(reloaded.game.qualityMode,'low');assert.equal(reloaded.game.quality,'low');
});

test('roster: choosing Orelha is preserved into training, HUD and the return to menu',()=>{
  const h=harness();
  assert.ok(h.el('character-orelha'),'all five character choices must exist');
  h.click('character-orelha');
  assert.equal(h.game.state.fighters[0].character,'orelha');
  h.click('training-button');
  assert.equal(h.game.state.fighters[0].character,'orelha');
  assert.equal(h.el('player-name').textContent,'ORELHA');
  h.game.menu();assert.equal(h.game.state.fighters[0].character,'orelha');
});

test('agile controls: Q/E/R issue kick, special and super without restarting the match',()=>{
  const h=harness(),client=h.online();
  h.key('KeyQ');h.key('KeyE');h.key('KeyR');
  assert.deepEqual(client.actions,['kick','special','super']);
  assert.equal(client.left,0);assert.equal(h.game.mode,'fight');
});

test('mouse guard: right button defends while held and pause clears the held state',()=>{
  const h=harness(),client=h.online();
  h.el('game-canvas').dispatch('mousedown',{button:2,buttons:2});
  h.frame(50);assert.equal(client.inputs.at(-1).block,true);
  h.el('game-canvas').dispatch('mouseup',{button:2,buttons:0});
  h.frame(50);assert.equal(client.inputs.at(-1).block,false);
  h.el('game-canvas').dispatch('mousedown',{button:2,buttons:2});
  h.click('pause-button');h.click('resume-button');h.frame(50);
  assert.equal(client.inputs.at(-1).block,false);
});

test('mouse buttons can be chorded without dropped attacks or a stuck guard',()=>{
  const h=harness(),client=h.online(),canvas=h.el('game-canvas');
  canvas.dispatch('pointerdown',{pointerType:'mouse',button:2,buttons:2,pointerId:1});
  canvas.dispatch('mousedown',{button:2,buttons:2});
  canvas.dispatch('pointermove',{pointerType:'mouse',button:0,buttons:3,pointerId:1});
  canvas.dispatch('mousedown',{button:0,buttons:3});
  assert.deepEqual(client.actions,['punch'],'left click is not lost while right is down');
  canvas.dispatch('pointermove',{pointerType:'mouse',button:2,buttons:1,pointerId:1});
  canvas.dispatch('mouseup',{button:2,buttons:1});h.frame(50);
  assert.equal(client.inputs.at(-1).block,false,'release right clears guard even when left stays down');
});

test('solo dodge uses the direction held now, including changes between simulation frames',()=>{
  const h=harness();h.click('training-button');h.game.state.phase='fight';
  h.key('KeyA');h.frame(50);h.key('KeyA','keyup');h.key('KeyD');h.key('ShiftLeft');
  assert.equal(h.game.state.fighters[0]._dodgeX,1,'a last-moment direction change rolls right');
  assert.equal(h.game.state.fighters[0]._dodgeZ,0);
  const neutral=harness();neutral.click('training-button');neutral.game.state.phase='fight';
  neutral.key('KeyD');neutral.frame(50);neutral.key('KeyD','keyup');neutral.key('ShiftLeft');
  assert.ok(neutral.game.state.fighters[0]._dodgeX<0,'releasing movement restores the neutral backward dodge');
});

test('touch camera gestures suppress compatibility mouse attacks while retaining drag control',()=>{
  const h=harness(),client=h.online(),canvas=h.el('game-canvas');
  const press=canvas.dispatch('pointerdown',{pointerType:'touch',pointerId:7,clientX:100,clientY:100,button:0});
  h.pointer('pointermove',{pointerType:'touch',pointerId:7,clientX:130,clientY:115,button:-1});
  canvas.dispatch('pointerup',{pointerType:'touch',pointerId:7,clientX:130,clientY:115,button:0});
  // Browsers synthesize mouse edges for an uncancelled primary touch.
  if (!press.defaultPrevented) canvas.dispatch('mousedown',{button:0,sourceCapabilities:{firesTouchEvents:true}});
  assert.deepEqual(client.actions,[],'looking around must not spend energy on a punch');
  assert.ok(h.scene.rotation.x>0 && h.scene.rotation.y>0,'touch movement still rotates the camera');
});

test('energy HUD updates immediately after a solo action and never rounds up super readiness',()=>{
  const h=harness();h.click('training-button');h.game.state.phase='fight';
  assert.equal(h.el('super-indicator').classList.contains('ready'),true);
  h.el('game-canvas').dispatch('mousedown',{button:0,buttons:1});
  assert.equal(h.game.state.fighters[0].energy,95);
  assert.equal(h.el('super-indicator').classList.contains('ready'),false,'spending energy removes readiness before the next frame');
  assert.equal(h.el('super-indicator').textContent,'R · SUPER 95 / 100');
  const fractional=harness(),client=fractional.online();client.state.fighters[1].energy=99.9;fractional.frame(50);
  assert.equal(fractional.el('super-indicator').classList.contains('ready'),false);
  assert.equal(fractional.el('super-indicator').textContent,'R · SUPER 99 / 100');
  assert.equal(fractional.el('player-energy-label').textContent,'ESPECIAL PRONTO · E');
});

test('middle mouse can look while guarding and its release stops looking before guard is released',()=>{
  const h=harness(),client=h.online(),canvas=h.el('game-canvas');
  canvas.dispatch('mousedown',{button:2,buttons:2,clientX:100,clientY:100});
  // A second button produces no pointerdown; only its mouse edge is guaranteed.
  canvas.dispatch('mousedown',{button:1,buttons:6,clientX:100,clientY:100});
  h.pointer('mousemove',{buttons:6,clientX:150,clientY:120});
  assert.ok(h.scene.rotation?.x>0,'middle drag must begin even with right already held');
  h.frame(50);assert.equal(client.inputs.at(-1).block,true);
  const rotation=h.scene.rotation;
  h.pointer('mouseup',{button:1,buttons:2,clientX:150,clientY:120});
  h.pointer('mousemove',{buttons:2,clientX:190,clientY:140});
  assert.equal(h.scene.rotation,rotation,'middle release ends camera input independently');
  h.frame(50);assert.equal(client.inputs.at(-1).block,true,'looking does not release guard');
  assert.equal(h.el('lock-status').getAttribute('aria-pressed'),'true','a drag does not toggle target');
});

test('a middle click toggles target once while small hand jitter and mouse capture remain usable',()=>{
  const h=harness();h.online();const canvas=h.el('game-canvas');
  canvas.dispatch('mousedown',{button:1,buttons:4,clientX:100,clientY:100});
  h.pointer('mousemove',{buttons:4,clientX:102,clientY:101});
  canvas.dispatch('mouseup',{button:1,buttons:0,clientX:102,clientY:101});
  h.pointer('mouseup',{button:1,buttons:0,clientX:102,clientY:101});
  assert.equal(h.el('lock-status').getAttribute('aria-pressed'),'false');
  h.document.pointerLockElement=canvas;
  canvas.dispatch('mousedown',{button:1,buttons:4,clientX:100,clientY:100});
  assert.equal(h.el('lock-status').getAttribute('aria-pressed'),'true','captured middle input toggles immediately');
  h.pointer('mousemove',{buttons:4,movementX:20,movementY:-10});
  assert.ok(h.scene.rotation.x>0 && h.scene.rotation.y<0,'captured mouse uses relative motion');
});

test('touch guard tracks each contact and survives releasing only one finger',()=>{
  const h=harness(),client=h.online();
  const button=h.document.querySelectorAll('[data-control]').find(el=>el.dataset.control==='block');
  button.dispatch('pointerdown',{pointerType:'touch',pointerId:7,button:0});
  button.dispatch('pointerdown',{pointerType:'touch',pointerId:8,button:0});
  button.dispatch('pointerup',{pointerType:'touch',pointerId:7,button:0});
  h.frame(50);assert.equal(client.inputs.at(-1).block,true);assert.equal(button.classList.contains('active'),true);
  button.dispatch('pointercancel',{pointerType:'touch',pointerId:8,button:0});
  h.frame(50);assert.equal(client.inputs.at(-1).block,false);assert.equal(button.classList.contains('active'),false);
});

test('resetting touch input ignores old contacts after resume and preserves a fresh guard',()=>{
  const h=harness(),client=h.online();
  const button=h.document.querySelectorAll('[data-control]').find(el=>el.dataset.control==='block');
  button.dispatch('pointerdown',{pointerType:'touch',pointerId:7,button:0});
  h.click('pause-button');h.click('resume-button');
  button.dispatch('pointerdown',{pointerType:'touch',pointerId:8,button:0});
  button.dispatch('lostpointercapture',{pointerType:'touch',pointerId:7,button:0});
  h.frame(50);assert.equal(client.inputs.at(-1).block,true,'an old finger release cannot cancel the new guard');
});

test('touch compatibility mouse movement cannot release a physical mouse guard',()=>{
  const h=harness(),client=h.online();
  h.el('game-canvas').dispatch('mousedown',{button:2,buttons:2});
  h.pointer('mousemove',{buttons:1,clientX:100,clientY:100,sourceCapabilities:{firesTouchEvents:true}});
  h.frame(50);assert.equal(client.inputs.at(-1).block,true);
});

test('hybrid touch and mouse hardware keeps pointer capture available with accurate hints',()=>{
  const h=harness({maxTouchPoints:10,finePointer:true});h.online();
  assert.equal(h.el('camera-button').hidden,false,'a touchscreen laptop still has a mouse');
  assert.equal(h.el('touch-controls').hidden,false,'touch controls remain available too');
  h.click('camera-button');
  assert.equal(h.document.pointerLockElement,h.el('game-canvas'));
  assert.match(h.el('camera-hint').textContent,/MOUSE OLHA/);
  const touch=harness({maxTouchPoints:5,coarsePointer:true});touch.online();
  assert.equal(touch.el('camera-button').hidden,true,'touch-only devices need no mouse capture prompt');
});
