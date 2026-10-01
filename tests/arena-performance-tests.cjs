'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {T, ids, bounds, makeArena, inventory} = require('./arena-performance-audit.cjs');

// Group world-space extents and triangle counts by material appearance. Batching
// may change object/geometry identities, but must not change any material's
// silhouette, vertex count, shadows or authored position at animation samples.
function surfaceSnapshot(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), p = new T.Vector3(), instance = new T.Matrix4(), world = new T.Matrix4();
  group.traverse(o=>{
    if (!o.isMesh) return;
    for(let ancestor=o;ancestor;ancestor=ancestor.parent)if(!ancestor.visible)return;
    const m=o.material, key=[m.type,m.color?.getHex(),m.emissive?.getHex(),m.metalness,m.roughness,
      m.transparent,m.opacity,m.side,!!m.map,o.castShadow,o.receiveShadow].join('/');
    let bucket=buckets.get(key);
    if(!bucket){bucket={count:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};buckets.set(key,bucket);}
    const g=o.geometry, position=g.attributes.position;
    for(let n=0;n<(o.isInstancedMesh?o.count:1);n++) {
      if(o.isInstancedMesh){o.getMatrixAt(n,instance);world.multiplyMatrices(o.matrixWorld,instance);}else world.copy(o.matrixWorld);
      const count=g.index?g.index.count:position.count;bucket.count+=count;
      for(let i=0;i<count;i++) {
        p.fromBufferAttribute(position,g.index?g.index.getX(i):i).applyMatrix4(world);
        for(const [axis,v] of [p.x,p.y,p.z].entries()){bucket.min[axis]=Math.min(bucket.min[axis],v);bucket.max[axis]=Math.max(bucket.max[axis],v);}
      }
    }
  });
  return buckets;
}
for(const id of ids)test(`${id}: production batching preserves all geometry, materials and animated silhouettes`,()=>{
  const {arena,finish}=makeArena(id,{finish:false}), authored=inventory(arena.group);
  const samples=[0,1.6,4.1,8.5], snapshots=[];
  const state={arena:id,phase:'intro',phaseTime:0,round:1,training:false,
    fighters:[{character:'orelha',x:-3.35,z:0,yaw:Math.PI/2},{character:'titan',x:3.35,z:0,yaw:-Math.PI/2}]};
  for(const time of samples){state.phaseTime=time;arena.update(time,1/60,false,state);snapshots.push(surfaceSnapshot(arena.group));}
  finish();
  const batched=inventory(arena.group,{staticRoots:[arena.detail]});
  assert.equal(batched.triangles,authored.triangles,'no scenery triangles removed');
  assert.equal(batched.materials,authored.materials,'all material appearances retained');
  assert.equal(arena.bounds,bounds[id]);
  for(const [sample,time] of samples.entries()) {
    state.phaseTime=time;arena.update(time,1/60,false,state);
    const actual=surfaceSnapshot(arena.group),expected=snapshots[sample];
    assert.equal(actual.size,expected.size);
    for(const [key,a] of actual) {
      const e=expected.get(key);assert(e,`preserved appearance ${key}`);assert.equal(a.count,e.count);
      for(const edge of ['min','max'])for(let axis=0;axis<3;axis++)assert(Math.abs(a[edge][axis]-e[edge][axis])<.0001,`${id}/${time}: world ${edge} ${axis} preserved`);
    }
  }
});

test('rigid moving scenery keeps its pivots while reducing submission count',()=>{
  const targets={island:{calls:69,groups:4},nightclub:{calls:64,groups:2},helipad:{calls:59,groups:1}};
  for(const [id,target] of Object.entries(targets)) {
    const {arena}=makeArena(id),stats=inventory(arena.group);
    assert.equal(arena.rigidGroups?.length,target.groups,`${id}: explicitly declared rigid moving groups`);
    assert(stats.drawCallsUpperBound<=target.calls,`${id}: ${stats.drawCallsUpperBound} scene submissions`);
    for(const group of arena.rigidGroups)assert(group.userData.keepDynamic,'original animation pivot remains dynamic');
  }
});
test('thin ocean foam uses a single transparent pass while nightclub beams retain both sides',()=>{
  for(const id of ['island','seaside']) {
    const {arena}=makeArena(id);let sheets=0;
    arena.group.traverse(o=>{if(o.isMesh&&o.material.transparent&&o.material.side===T.DoubleSide){sheets++;assert.equal(o.material.forceSinglePass,true);}});
    assert(sheets>0,'authored wave sheets remain present');
  }
  const {arena}=makeArena('nightclub');let volumes=0;
  arena.group.traverse(o=>{if(o.geometry?.type==='ConeGeometry'&&o.material.transparent){volumes++;assert.equal(o.material.forceSinglePass,false);}});
  assert.equal(volumes,4,'all four volumetric light beams retained');
});

test('runner and helicopter rigid batches retain vertex reuse through indices',()=>{
  for(const [id,name] of [['seaside','Orla Brava / five background runners'],['helipad','Two helicopters / environmental collision']]) {
    const {arena}=makeArena(id),rig=arena.group.getObjectByName(name);let batches=0;
    assert(rig,'complete authored rig remains present');
    rig.traverse(o=>{
      if(!o.isMesh||o.isInstancedMesh||o.geometry.type!=='BufferGeometry')return;
      batches++;assert(o.geometry.index,`${name}: merged triangles reuse indexed vertices`);
      const positions=o.geometry.attributes.position;
      for(const index of o.geometry.index.array)assert(index<positions.count,'all indices reference an existing vertex');
    });
    assert(batches>0);
  }
});
