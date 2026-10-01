'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const T=require('../vendor/three.min.js');
const source=fs.readFileSync(require.resolve('../scene.js'),'utf8');
const start=source.indexOf('    // Camera-relative movement');
const end=source.indexOf('    function update(dt,state)',start);
assert(start>=0&&end>start,'camera section remains identifiable without starting WebGL');

function harness({width=1280,height=720,colliders=[],arena='island',localPlayer=0}={}){
  const camera=new T.PerspectiveCamera(55,width/height,.12,180);
  const context={T,Math,Number,PI:Math.PI,clamp:T.MathUtils.clamp,lerp:T.MathUtils.lerp,
    camera,width,height,clock:0,shake:0,reducedMotion:true,previewYaw:0,beachBlend:0,
    arenaId:arena,currentArena:{colliders,bounds:{island:13.5,nightclub:12,seaside:14,helipad:13}[arena]},
    focus:new T.Vector3(),camTarget:new T.Vector3(),random:()=>.5,
    updateWeatherVisibility(){},targetMarker:{position:new T.Vector3(),material:{}},key:{target:{position:new T.Vector3()}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  const state={phase:'fight',localPlayer,fighters:[{x:-2,y:0,z:0,hp:100,character:'veterano'},{x:2,y:0,z:0,hp:100,character:'titan'}]};
  context.resetCamera(state);
  function step(dt=1/60){context.clock+=dt;context.updateCamera(dt,state,state.fighters);camera.updateMatrixWorld(true);}
  step();
  return {context,state,camera,step,advance(seconds,hz=60){for(let i=0;i<Math.round(seconds*hz);i++)step(1/hz);},
    project(body,height=1.7){return new T.Vector3(body.x,(body.y||0)+height,body.z).project(camera);}};
}
function assertFramed(h,label){
  for(const body of h.state.fighters)for(const y of [.06,body.character==='orelha'?2.1:3.45]){
    const p=h.project(body,y);assert(Math.abs(p.x)<.94&&p.y<.94&&p.y>-.94&&p.z<1&&p.z>-1,`${label}: projected body ${p.toArray()}`);
  }
}
test('free orbit responds on the next rendered frame and movement follows the rendered yaw',()=>{
  const h=harness();h.context.setLockOn(false);h.context.rotateCamera(1.1,.12);h.step();
  const direction=h.context.focus.clone().sub(h.camera.position);
  const actualYaw=Math.atan2(direction.x,direction.z),info=h.context.cameraInfo();
  assert(Math.abs(h.context.angleDelta(actualYaw,info.yaw))<1e-8,'camera must not lag behind camera-relative movement');
  const forward=h.context.cameraInput(0,-1);assert(Math.abs(forward.x-Math.sin(actualYaw))<1e-8);
});
test('manual orbit while locked keeps the opponent framed at wide separation',()=>{
  const h=harness();h.state.fighters[0].x=-13;h.state.fighters[1].x=13;
  h.context.rotateCamera(1.2,0);h.advance(.2);assertFramed(h,'manual lock');
});
test('near-plane safety cannot interpolate through a newly encountered obstacle',()=>{
  const h=harness();h.context.setLockOn(false);
  const p=h.camera.position.clone(),f=h.context.focus.clone(),middle=p.clone().lerp(f,.3);
  const obstacle={x:middle.x,z:middle.z,radius:.9,bottom:0,top:40};
  h.context.currentArena.colliders.push(obstacle);h.step();
  const toCamera=h.camera.position.clone().sub(h.context.focus);
  for(let i=1;i<=30;i++){
    const probe=h.context.focus.clone().addScaledVector(toCamera,i/30);
    assert(Math.hypot(probe.x-obstacle.x,probe.z-obstacle.z)>obstacle.radius+.12,'final view ray remains in front of obstacle');
  }
});
test('locked duel frames human and dog bodies in portrait and short landscape, for either local player',()=>{
  for(const size of [[1280,720],[390,844],[844,390]])for(const localPlayer of [0,1]){
    const h=harness({width:size[0],height:size[1],localPlayer});
    h.state.fighters[0].character='orelha';h.state.fighters[0].x=-12.4;h.state.fighters[0].z=11;
    h.state.fighters[1].x=12.4;h.state.fighters[1].z=-11;h.state.fighters[1].y=2;
    h.advance(2);assertFramed(h,`${size}/${localPlayer}`);
  }
});
test('free camera damping has equivalent results at 30, 60 and 120 Hz',()=>{
  const positions=[];
  for(const hz of [30,60,120]){
    const h=harness();h.context.setLockOn(false);h.context.zoomCamera(3);h.state.fighters[0].z=3;h.advance(.8,hz);positions.push(h.camera.position.clone());
  }
  assert(positions[0].distanceTo(positions[2])<.015,'fixed target smoothing is independent of frame count');
});
test('invalid input never poisons the camera and all four arenas remain finite',()=>{
  for(const arena of ['island','nightclub','seaside','helipad']){
    const h=harness({arena});h.context.rotateCamera(Infinity,NaN);h.context.zoomCamera(Infinity);h.step();
    assert(h.camera.position.toArray().every(Number.isFinite),arena);assert(Number.isFinite(h.context.cameraInfo().yaw));
  }
});
test('locked camera keeps both bodies visible at arena corners across manual orbit limits',()=>{
  const bounds={island:13.5,nightclub:12,seaside:14,helipad:13};
  for(const [arena,b] of Object.entries(bounds))for(const sign of [-1,1])for(const zSign of [-1,1])for(const offset of [-2,0,2]){
    const h=harness({arena});
    h.state.fighters[0].x=(b-.8)*sign;h.state.fighters[0].z=(b-.8)*zSign;
    h.state.fighters[1].x=h.state.fighters[0].x-sign*3;h.state.fighters[1].z=(b-3.8)*zSign;
    h.context.resetCamera(h.state);h.context.rotateCamera(offset,0);h.step();
    assertFramed(h,`${arena}/${sign}/${zSign}/${offset}`);
    const focus=h.context.focus,delta=h.camera.position.clone().sub(focus),distance=delta.length();
    const safe=h.context.cameraClearDistance(focus,Math.atan2(-delta.x,-delta.z),Math.atan2(delta.y,Math.hypot(delta.x,delta.z)),distance,h.context.cameraVolumes());
    assert(safe>=distance-.001,`${arena}: final camera clear of its authored scenery`);
  }
});
test('free orbit has full rotation while a locked rival continues being tracked during input grace',()=>{
  const h=harness();h.context.setLockOn(false);const yaw=h.context.cameraInfo().yaw;
  h.context.rotateCamera(Math.PI*2+.3,0);h.step();assert(Math.abs(h.context.angleDelta(h.context.cameraInfo().yaw,yaw)+.3)<1e-8);
  h.context.setLockOn(true);h.context.rotateCamera(.2,0);h.advance(.1);
  h.state.fighters[1].x=-3;h.state.fighters[1].z=6;h.advance(.3);assertFramed(h,'rival crossed during grace period');
});
test('collision exits smoothly and reduced motion suppresses shake without disabling tracking',()=>{
  const h=harness();h.context.setLockOn(false);
  const initial=h.camera.position.distanceTo(h.context.focus),mid=h.camera.position.clone().lerp(h.context.focus,.4);
  h.context.currentArena.colliders.push({x:mid.x,z:mid.z,radius:.9,bottom:0,top:40});h.step();
  const compressed=h.camera.position.distanceTo(h.context.focus);assert(compressed<initial-1);
  h.context.currentArena.colliders.length=0;h.step();const released=h.camera.position.distanceTo(h.context.focus);
  assert(released>compressed&&released<initial-.1,'do not pop out to the full distance');
  h.context.shake=2;h.step();assert(Math.abs(h.context.angleDelta(Math.atan2(h.context.focus.x-h.camera.position.x,h.context.focus.z-h.camera.position.z),h.context.cameraInfo().yaw))<1e-8);
});

test('camera volumes reuse authored proxies across frames and independent arena switches',()=>{
  const h=harness({arena:'nightclub'}),club=h.context.currentArena,clubVolumes=h.context.cameraVolumes();
  club.colliders.slice=()=>{throw new Error('unchanged arena must not rebuild collision volumes');};
  for(let i=0;i<120;i++){h.step();assert.equal(h.context.cameraVolumes(),clubVolumes);}
  h.context.arenaId='island';h.context.currentArena={colliders:[],bounds:13.5};
  const islandVolumes=h.context.cameraVolumes();assert.notEqual(islandVolumes,clubVolumes);
  h.context.arenaId='nightclub';h.context.currentArena=club;
  assert.equal(h.context.cameraVolumes(),clubVolumes,'switching back preserves the arena cache');
});

test('camera volume cache follows collider replacement, in-place edits and arena bounds',()=>{
  const first={x:1,z:2,radius:1,bottom:0,top:3};
  const h=harness({arena:'nightclub',colliders:[first]}),initial=h.context.cameraVolumes();
  first.top=8;assert.equal(h.context.cameraVolumes(),initial);assert.equal(initial[0].top,8);
  const replacement={x:3,z:2,radius:1,bottom:0,top:4};
  h.context.currentArena.colliders[0]=replacement;
  const changed=h.context.cameraVolumes();assert.equal(changed[0],replacement);
  h.context.currentArena.bounds=15;
  const resized=h.context.cameraVolumes();assert.notEqual(resized,changed);
  assert.equal(resized[1].minZ,-20.2,'authored stage proxy follows the changed bound');
  assert.equal(initial[0],first,'rebuilding does not mutate a previously returned volume list');
});

test('beach and absent arena reuse empty camera volumes without discarding arena proxies',()=>{
  const h=harness(),original=h.context.cameraVolumes();h.context.beachBlend=.4;
  const empty=h.context.cameraVolumes();assert.equal(empty.length,0);
  assert.equal(h.context.cameraVolumes(),empty);
  h.context.beachBlend=0;assert.equal(h.context.cameraVolumes(),original);
  h.context.currentArena=null;assert.equal(h.context.cameraVolumes(),empty);
});

test('camera volume intersection matches the original slab solver over varied heights and directions',()=>{
  // Independent reference retained from the allocation-heavy two-axis version.
  function reference(camera,origin,yaw,pitch,distance,volumes){
    const nx=-Math.sin(yaw)*Math.cos(pitch),ny=Math.sin(pitch),nz=-Math.cos(yaw)*Math.cos(pitch);
    let closest=distance;
    const radius=Math.max(.30,camera.near*Math.tan(camera.fov*Math.PI/360)*Math.max(1,camera.aspect)+.12);
    for(const c of volumes){
      let enter=0,leave=closest;
      const low=(c.bottom===undefined?0:c.bottom)-radius,high=(c.top===undefined?5:c.top)+radius;
      if(Math.abs(ny)<.00001){if(origin.y<low||origin.y>high)continue;}
      else{const yl=(low-origin.y)/ny,yh=(high-origin.y)/ny;enter=Math.max(enter,Math.min(yl,yh));leave=Math.min(leave,Math.max(yl,yh));}
      if(c.radius!==undefined){
        const ox=origin.x-c.x,oz=origin.z-c.z,a=nx*nx+nz*nz,r=c.radius+radius,half=ox*nx+oz*nz,disc=half*half-a*(ox*ox+oz*oz-r*r);
        if(a<.00001){if(ox*ox+oz*oz>r*r)continue;}
        else{if(disc<0)continue;const root=Math.sqrt(disc);enter=Math.max(enter,(-half-root)/a);leave=Math.min(leave,(-half+root)/a);}
      }else{
        const origins=[origin.x,origin.z],directions=[nx,nz],mins=[c.minX-radius,c.minZ-radius],maxs=[c.maxX+radius,c.maxZ+radius];
        for(let axis=0;axis<2;axis++){
          if(Math.abs(directions[axis])<.00001){if(origins[axis]<mins[axis]||origins[axis]>maxs[axis])leave=-1;}
          else{const first=(mins[axis]-origins[axis])/directions[axis],last=(maxs[axis]-origins[axis])/directions[axis];enter=Math.max(enter,Math.min(first,last));leave=Math.min(leave,Math.max(first,last));}
        }
      }
      if(leave>=enter&&leave>0)closest=Math.min(closest,Math.max(.05,enter-.04));
    }
    return closest;
  }
  for(const arena of ['island','nightclub','seaside','helipad']){
    const h=harness({arena}),volumes=h.context.cameraVolumes().concat([
      {minX:-3,maxX:2,minZ:-4,maxZ:1,bottom:9,top:-2},
      {minX:1,maxX:4,minZ:-3,maxZ:8},
      {x:5,z:2,radius:1.2,bottom:-2,top:9}
    ]);
    for(const y of [-3,0,1.5,4,12])for(const pitch of [-Math.PI/2,-.7,0,.4,1.18,Math.PI/2])for(let turn=0;turn<24;turn++){
      const yaw=turn*Math.PI/12,origin={x:Math.sin(turn)*14,y,z:Math.cos(turn)*14};
      const actual=h.context.cameraClearDistance(origin,yaw,pitch,35,volumes);
      assert(Number.isFinite(actual));assert.equal(actual,reference(h.camera,origin,yaw,pitch,35,volumes));
    }
  }
});

test('menu animates its visible fighter and defers rival selection until a visible phase',()=>{
  const rigs=[{root:{visible:true},shadow:{visible:true},ring:{visible:true}},{root:{visible:true},shadow:{visible:true},ring:{visible:true}}];
  const selected=[],posed=[];
  const context={Math,clock:0,arenaId:'island',currentArena:{},fighters:rigs,
    window:{FightSim:{introKind:()=>null}},
    showFighter(rig,visible){rig.root.visible=rig.shadow.visible=rig.ring.visible=visible;},
    selectedFighter(index,id){selected.push([index,id]);return rigs[index];},
    pose(rig,f,dt,index,menu,opponent){posed.push({f,dt,index,menu,opponent});}};
  vm.createContext(context);
  const updateStart=source.indexOf('    function update(dt,state)'),updateEnd=source.indexOf('      var framingGoal=',updateStart);
  assert(updateStart>=0&&updateEnd>updateStart);
  vm.runInContext(source.slice(updateStart,updateEnd)+'\n}',context);
  const fighters=[{character:'veterano'},{character:'orelha'}],state={phase:'menu',fighters};
  for(let i=0;i<4;i++)context.update(1/60,state);
  assert.equal(selected.length,4,'hidden opponent is not selected or built during preview');
  assert.equal(posed.length,4);assert(posed.every(p=>p.index===0&&p.menu&&p.opponent===fighters[1]));
  assert.equal(rigs[0].root.visible,true);assert.equal(rigs[1].root.visible,false);
  state.phase='fight';context.update(1/60,state);
  assert.deepEqual(selected.slice(-2),[[0,'veterano'],[1,'orelha']]);
  assert.deepEqual(posed.slice(-2).map(p=>[p.index,p.menu]),[[0,false],[1,false]]);
  assert.equal(rigs[1].root.visible,true,'rival is posed and visible on the first fight frame');
});
