'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const T=require('../vendor/three.min.js');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../organic-mesh.js'),'utf8'),context);
const O=context.window.NeonOrganic;

function topology(geometry){
  const edges=new Map(),neighbors=Array.from({length:geometry.attributes.position.count},()=>[]);
  const index=geometry.index.array;
  for(let i=0;i<index.length;i+=3)for(let j=0;j<3;j++){
    const a=index[i+j],b=index[i+(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
    edges.set(key,(edges.get(key)||0)+1);neighbors[a].push(b);neighbors[b].push(a);
  }
  const seen=new Set();let components=0;
  for(let i=0;i<neighbors.length;i++)if(neighbors[i].length&&!seen.has(i)){
    components++;const stack=[i];seen.add(i);
    while(stack.length)for(const next of neighbors[stack.pop()])if(!seen.has(next)){seen.add(next);stack.push(next);}
  }
  return {edges,components};
}

test('blended anatomy is one watertight surface with outward smooth normals and valid skin weights',()=>{
  const field=(x,y,z)=>O.smoothUnion(O.ellipsoid(x,y,z,-.28,0,0,.48,.62,.35),O.ellipsoid(x,y,z,.28,0,0,.48,.62,.35),.17);
  const geometry=O.build(T,{bounds:{min:[-1,-1,-.6],max:[1,1,.6]},resolution:[28,30,22],field,
    skin:(x)=>({indices:[0,1,0,0],weights:[1-x,x+1,0,0]})});
  const graph=topology(geometry);
  assert.equal(graph.components,1);
  assert([...graph.edges.values()].every(n=>n===2),'every surface edge joins exactly two triangles');
  const p=geometry.attributes.position,n=geometry.attributes.normal,w=geometry.attributes.skinWeight;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
    assert(field(x+n.getX(i)*.003,y+n.getY(i)*.003,z+n.getZ(i)*.003)>field(x-n.getX(i)*.003,y-n.getY(i)*.003,z-n.getZ(i)*.003));
    assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-6);
  }
});

test('separated limbs keep their negative space instead of acquiring joining membranes',()=>{
  const field=(x,y,z)=>Math.min(O.capsule(x,y,z,[-.32,-.5,0],[-.32,.5,0],.12),O.capsule(x,y,z,[.32,-.5,0],[.32,.5,0],.12));
  const geometry=O.build(T,{bounds:{min:[-.7,-.8,-.3],max:[.7,.8,.3]},resolution:[32,30,16],field});
  const graph=topology(geometry);
  assert.equal(graph.components,2);
  assert([...graph.edges.values()].every(n=>n===2));
  for(let i=0;i<geometry.attributes.position.count;i++)assert(Math.abs(geometry.attributes.position.getX(i))>.18);
});

test('invalid or clipped fields fail instead of delivering broken character geometry',()=>{
  const options={bounds:{min:[-1,-1,-1],max:[1,1,1]},resolution:[8,8,8]};
  assert.throws(()=>O.build(T,{...options,field:()=>NaN}),/Non-finite/);
  assert.throws(()=>O.build(T,{...options,field:()=>-1}),/crosses its bounds/);
});

test('surface intersections close to grid corners retain their tiny sealing triangles',()=>{
  for(const radius of [.500001,.5000001,.50000001,.500000001,.5000000001]){
    const geometry=O.build(T,{bounds:{min:[-1,-1,-1],max:[1,1,1]},resolution:[16,16,16],field:(x,y,z)=>Math.hypot(x,y,z)-radius});
    const graph=topology(geometry);
    assert.equal(graph.components,1);
    assert([...graph.edges.values()].every(n=>n===2), `closed at radius ${radius}`);
  }
});
