'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const T=require('../vendor/three.min.js');
const source=fs.readFileSync(require.resolve('../scene.js'),'utf8');

function section(start,end){
  const first=source.indexOf(start),last=source.indexOf(end,first);
  assert(first>=0&&last>first,'scene section available for CPU execution');
  return source.slice(first,last);
}
function renderHarness(quality='high'){
  const scene={},postScene={};
  // This is the renderer boundary only. r160 adds shadow submissions before its
  // optional reset, then adds the visible scene; each post quad adds one draw.
  const info={autoReset:true,render:{calls:0,triangles:0},reset(){this.render.calls=0;this.render.triangles=0;}};
  const renderer={info,toneMapping:null,setRenderTarget(){},render(target){
    if(target===scene&&quality==='high'){info.render.calls+=7;info.render.triangles+=70;}
    if(info.autoReset)info.reset();
    info.render.calls+=target===scene?10:1;
    info.render.triangles+=target===scene?100:2;
  }};
  const scope={T,renderer,scene,postScene,camera:{},postCamera:{},quality,
    renderTarget:{texture:{}},bloomA:{texture:{},width:380},bloomB:{texture:{},height:214},
    blurShader:{uniforms:{source:{},threshold:{},step:{value:new T.Vector2()}}},finalShader:{},quad:{},
    lastFrameInfo:{calls:0,triangles:0},contextUnavailable:()=>false};
  vm.createContext(scope);
  vm.runInContext(section('    function render() {','    setArena(options.arena'),scope);
  return scope;
}

test('frame metrics include shadows and all post passes without accumulating earlier frames',()=>{
  const h=renderHarness();h.render();
  assert.equal(h.lastFrameInfo.calls,20,'7 shadow + 10 scene + 3 post calls');
  assert.equal(h.lastFrameInfo.triangles,176,'70 shadow + 100 scene + 6 post triangles');
  assert.equal(h.lastFrameInfo.sceneAndShadowCalls,17);
  assert.equal(h.lastFrameInfo.postProcessCalls,3);
  h.render();assert.equal(h.lastFrameInfo.calls,20,'fresh frame has its own counters');
  assert.equal(h.lastFrameInfo.triangles,176);
});

test('direct rendering reports only its current frame and no post passes',()=>{
  const h=renderHarness('low');h.render();h.render();
  assert.equal(h.lastFrameInfo.calls,10);assert.equal(h.lastFrameInfo.triangles,100);
  assert.equal(h.lastFrameInfo.sceneAndShadowCalls,10);assert.equal(h.lastFrameInfo.postProcessCalls,0);
});

test('flat combat effects request one double-sided pass while keeping their geometry and alpha',()=>{
  const scope={T,PI:Math.PI,scene:new T.Scene(),characterStyles:{veterano:true},
    sphereGeo:new T.SphereGeometry(1,12,8),boxGeo:new T.BoxGeometry(1,1,1),cylinderGeo:new T.CylinderGeometry(1,1,1,8),
    shadowTex:new T.Texture(),neon:color=>new T.MeshStandardMaterial({color}),glow(){},
    window:{NeonHumans:{build(){}},NeonDog:{build(){}}}};
  vm.createContext(scope);
  vm.runInContext(section('    function mesh(','    function texture('),scope);
  vm.runInContext(section('    function batchMeshes(','    // Every environment'),scope);
  vm.runInContext(section('    function ellipsoid(','    function showFighter('),scope);
  const rig=scope.fighter(0,'veterano');
  for(const effect of [rig.ring,rig.slash,rig.slash2,rig.shield,rig.chargeRing,...rig.windRings]){
    assert.equal(effect.geometry.type,'RingGeometry');
    assert.equal(effect.material.transparent,true);assert.equal(effect.material.side,T.DoubleSide);
    assert.equal(effect.material.forceSinglePass,true,'coplanar front/back do not need two submissions');
  }
  assert.equal(rig.shadow.material.side,T.FrontSide,'contact shadow keeps its original material');
});

function batchHarness(){
  const scope={T};vm.createContext(scope);
  vm.runInContext(section('    function batchMeshes(','    // Every environment'),scope);
  return scope.batchMeshes;
}
function renderedVertices(root){
  root.updateMatrixWorld(true);
  const values=[];
  root.traverse(part=>{
    if(!part.isMesh)return;
    const g=part.geometry,normalMatrix=new T.Matrix3().getNormalMatrix(part.matrixWorld);
    for(let i=0;i<(g.index?g.index.count:g.attributes.position.count);i++){
      const at=g.index?g.index.getX(i):i;
      const p=new T.Vector3().fromBufferAttribute(g.attributes.position,at).applyMatrix4(part.matrixWorld);
      const n=new T.Vector3().fromBufferAttribute(g.attributes.normal,at).applyNormalMatrix(normalMatrix);
      const uv=new T.Vector2().fromBufferAttribute(g.attributes.uv,at);
      values.push(...p.toArray(),...n.toArray(),...uv.toArray());
    }
  });
  return values;
}
test('batching keeps indexed vertices and identical world triangles, normals and UVs',()=>{
  const batch=batchHarness(),root=new T.Group(),pivot=new T.Group();root.add(pivot);
  root.position.set(3,1,-4);root.rotation.y=.7;pivot.position.set(-2,.4,3);pivot.rotation.z=.2;
  const mat=new T.MeshStandardMaterial(),box=new T.Mesh(new T.BoxGeometry(1,1,1),mat);
  const plane=new T.Mesh(new T.PlaneGeometry(1,1).toNonIndexed(),mat);
  box.scale.set(2,1,3);box.rotation.x=.3;plane.position.set(1,2,3);pivot.add(box,plane);
  const before=renderedVertices(root);batch(pivot,true);
  assert.equal(pivot.children.length,1);
  const merged=pivot.children[0];
  assert.equal(merged.geometry.attributes.position.count,30,'24 box vertices plus six unindexed plane vertices');
  assert.equal(merged.geometry.index.count,42,'12 box triangles plus two plane triangles');
  const after=renderedVertices(root);assert.equal(after.length,before.length);
  for(let i=0;i<before.length;i++)assert(Math.abs(after[i]-before[i])<1e-5,`rendered attribute ${i} preserved`);
});

test('large batches retain valid indices beyond the 16-bit vertex range',()=>{
  const batch=batchHarness(),root=new T.Group(),mat=new T.MeshBasicMaterial();
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(65536*3),3));g.setIndex([0,1,2]);
  root.add(new T.Mesh(g,mat),new T.Mesh(new T.PlaneGeometry(1,1),mat));batch(root,false);
  const result=root.children[0].geometry;
  assert.equal(result.attributes.position.count,65540);assert.equal(result.index.count,9);
  assert.equal(result.index.array.BYTES_PER_ELEMENT,4);
  assert.equal(Math.max(...result.index.array),65539,'second geometry references its offset vertices');
});
