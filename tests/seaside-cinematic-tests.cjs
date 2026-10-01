'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const T=require('../vendor/three.min.js');

function makeArena(){
  const scope={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../arena-seaside.js'),'utf8'),scope);
  function mesh(geometry,material,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1,shadows=false){
    const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=shadows;parent.add(m);return m;
  }
  const boxGeo=new T.BoxGeometry(1,1,1),rodGeo=new T.CylinderGeometry(1,1,1,8);
  const ctx={THREE:T,bounds:14,mesh,
    material:(color,metalness=0,roughness=.8)=>new T.MeshStandardMaterial({color,metalness,roughness}),
    box:(parent,material,...args)=>mesh(boxGeo,material,parent,...args),
    rod(parent,material,ax,ay,az,bx,by,bz,radius){const a=new T.Vector3(ax,ay,az),b=new T.Vector3(bx,by,bz),d=b.clone().sub(a);const m=mesh(rodGeo,material,parent,(ax+bx)/2,(ay+by)/2,(az+bz)/2,radius,d.length(),radius);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return m;},
    texture:()=>new T.Texture(),makeSign:()=>{},glow:()=>{}};
  return scope.window.OilArenaBuilders.seaside(ctx);
}
function state(characters=['orelha','titan']){return {arena:'seaside',phase:'intro',phaseTime:0,round:1,training:false,fighters:characters.map((character,i)=>({character,x:i?3.35:-3.35,y:0,z:0,yaw:i?-Math.PI/2:Math.PI/2,hp:100}))};}
function clone(value){return JSON.parse(JSON.stringify(value));}
const arena=makeArena();

test('Orla has five generic articulated background actors, each holding a shaped bat',()=>{
  const crowd=arena.group.getObjectByName('Orla Brava / five background runners');assert(crowd,'authored crowd present');
  assert.equal(crowd.children.length,5);assert.equal(crowd.userData.keepDynamic,true);
  for(const actor of crowd.children){
    assert.equal(actor.userData.nonCombatant,true);assert(actor.getObjectByName('Wooden baseball bat'));
    let blocks=0;actor.traverse(part=>{if(part.geometry&&part.geometry.type==='BoxGeometry')blocks++;});assert.equal(blocks,0,'curved anatomy and clothing instead of blocks');
  }
});
test('cutscene is gated to first-round seaside Orelha and never mutates simulation state',()=>{
  assert.equal(typeof arena.cutscene,'function');const s=state(),before=JSON.stringify(s);
  assert.equal(arena.cutscene(1,s,false).active,true);assert.equal(JSON.stringify(s),before);
  for(const changed of [{training:true},{round:2},{phase:'fight'},{arena:'island'}])assert.equal(arena.cutscene(1,{...s,...changed},false).active,false);
  assert.equal(arena.cutscene(1,state(['veterano','titan']),false).active,false);
  assert.equal(arena.cutscene(-1,s,false).active,false);assert.equal(arena.cutscene(6.21,s,false).active,false);
});
test('either Orelha slot and two dogs run continuously to their exact spawn by 4.8 seconds',()=>{
  for(const roster of [['orelha','titan'],['titan','orelha'],['orelha','orelha']]){
    const s=state(roster),first=clone(arena.cutscene(0,s,false));
    let previous=first;
    for(let frame=1;frame<=288;frame++){
      const next=clone(arena.cutscene(frame/60,s,false));
      for(let i=0;i<2;i++){
        const p=next.fighters[i];assert.equal(p.cinematic,'chase');assert([p.x,p.y,p.z,p.yaw,p.runSpeed].every(Number.isFinite));
        assert(Math.hypot(p.x-previous.fighters[i].x,p.z-previous.fighters[i].z)<.22,'no teleport between adjacent intro frames');
        if(roster[i]!=='orelha')assert.deepEqual([p.x,p.z,p.runSpeed],[s.fighters[i].x,s.fighters[i].z,0]);
      }
      previous=next;
    }
    for(let i=0;i<2;i++)assert.deepEqual([previous.fighters[i].x,previous.fighters[i].z,previous.fighters[i].runSpeed],[s.fighters[i].x,s.fighters[i].z,0]);
    assert.equal(arena.cutscene(5.05,s,false).cameraWeight,1);assert.equal(arena.cutscene(6.2,s,false).cameraWeight,0);
  }
});
test('pursuers stop outside bounds, replay from phaseTime, and never touch a running dog',()=>{
  const crowd=arena.group.getObjectByName('Orla Brava / five background runners'),s=state(['orelha','orelha']);
  assert(crowd);
  for(let frame=0;frame<=372;frame++){
    s.phaseTime=frame/60;arena.update(100+frame/60,1/60,false,s);const dogs=arena.cutscene(s.phaseTime,s,false).fighters;
    for(const actor of crowd.children){assert(Math.abs(actor.position.x)>14||Math.abs(actor.position.z)>14,'actors remain outside fight square');for(const dog of dogs)assert(Math.hypot(actor.position.x-dog.x,actor.position.z-dog.z)>2,'no pursuit contact');}
  }
  s.phase='fight';arena.update(999,1/60,false,s);const parked=crowd.children.map(a=>a.position.toArray());
  s.phase='intro';s.phaseTime=0;arena.update(1111,1/60,false,s);const replay=crowd.children.map(a=>a.position.toArray());
  arena.update(0,1/60,false,s);assert.deepEqual(crowd.children.map(a=>a.position.toArray()),replay);assert.notDeepEqual(replay,parked);
});
test('reduced motion uses a stable camera and deterministic pose sampling',()=>{
  const s=state(),start=clone(arena.cutscene(0,s,true)),end=clone(arena.cutscene(4.8,s,true));
  assert.deepEqual(start.cameraPosition,end.cameraPosition);assert.deepEqual(start.cameraTarget,end.cameraTarget);
  const a=clone(arena.cutscene(2.2,s,false));arena.cutscene(5.8,s,false);assert.deepEqual(clone(arena.cutscene(2.2,s,false)),a);
});
test('intro camera keeps the dog readable and establishes all five pursuers before they stop',()=>{
  const s=state(),camera=new T.PerspectiveCamera(55,16/9,.12,180),crowd=arena.group.getObjectByName('Orla Brava / five background runners');
  for(const reduced of [false,true])for(let sample=0;sample<=48;sample++){
    const time=sample/10;s.phaseTime=time;arena.update(600,1/60,reduced,s);const intro=arena.cutscene(time,s,reduced);
    camera.position.fromArray(intro.cameraPosition);camera.lookAt(new T.Vector3().fromArray(intro.cameraTarget));camera.updateMatrixWorld(true);
    const dog=intro.fighters[0],p=new T.Vector3(dog.x,.9,dog.z).project(camera);
    assert(Math.abs(p.x)<.86&&Math.abs(p.y)<.8&&p.z<1&&p.z>0,`dog framed at ${time}, reduced=${reduced}: ${p.toArray()}`);
    if(time<2.5)for(const actor of crowd.children){const person=new T.Vector3(actor.position.x,1.7,actor.position.z).project(camera);assert(Math.abs(person.x)<.94&&Math.abs(person.y)<.9&&person.z<1,`pursuers established at ${time}: ${person.toArray()}`);}
  }
});
test('runner geometry is finite, shared where articulated, and rigid parts stay batched',()=>{
  const crowd=arena.group.getObjectByName('Orla Brava / five background runners');let calls=0,triangles=0;
  const bats=[];
  crowd.traverse(part=>{
    if(!part.isMesh)return;calls++;
    const geo=part.geometry;triangles+=(geo.index?geo.index.count:geo.attributes.position.count)/3;
    const position=geo.attributes.position;for(let i=0;i<position.array.length;i++)assert(Number.isFinite(position.array[i]));
    if(part.parent.name==='Wooden baseball bat'&&geo.type==='LatheGeometry')bats.push(geo);
  });
  assert(calls<=130,`five detailed actors require ${calls} draw calls`);
  assert(triangles<70000,`crowd has ${triangles} triangles`);
  assert.equal(bats.length,5);assert(bats.every(g=>g===bats[0]),'bat geometry is shared across five actors');
  assert(bats[0].parameters.points.at(-1).y>1.5,'long rounded wooden barrel is present');
});
test('opening formation separates the five silhouettes and each bat barrel from its owner',()=>{
  const s=state(),camera=new T.PerspectiveCamera(55,16/9,.12,180),crowd=arena.group.getObjectByName('Orla Brava / five background runners');
  for(const time of [0,.5,1,1.5]){
    s.phaseTime=time;arena.update(90,1/60,false,s);arena.group.updateMatrixWorld(true);
    const intro=arena.cutscene(time,s,false);camera.position.fromArray(intro.cameraPosition);camera.lookAt(new T.Vector3().fromArray(intro.cameraTarget));camera.updateMatrixWorld(true);
    const centers=[];
    for(const actor of crowd.children){
      const center=new T.Vector3(0,1.4,0).applyMatrix4(actor.matrixWorld).project(camera);centers.push(center.x);
      const bat=actor.getObjectByName('Wooden baseball bat'),barrel=new T.Vector3(0,1.4,0).applyMatrix4(bat.matrixWorld).project(camera);
      assert(Math.abs(barrel.x-center.x)>.035,`bat silhouette is separate at ${time}`);
    }
    centers.sort((a,b)=>a-b);for(let i=1;i<centers.length;i++)assert(centers[i]-centers[i-1]>.06,`five runners do not form an occluding file at ${time}`);
  }
});
