'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const THREE=require('../vendor/three.min.js');

// Keep the actual builders, materials, geometry and texture objects. Only the
// unavailable DOM drawing surface and image transport are replaced in Node.
function harness(external=true){
  const canvases=[],loads=[];
  const document={createElement(type){
    assert.equal(type,'canvas');
    const canvas={width:0,height:0,draws:[]};
    const context=new Proxy({
      createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
      drawImage(...args){canvas.draws.push(args);}
    },{get(object,key){return key in object?object[key]:()=>{};}});
    canvas.getContext=()=>context;canvases.push(canvas);return canvas;
  }};
  class TextureLoader {
    load(url,onLoad){const texture=new THREE.Texture();loads.push({url,texture,onLoad});return texture;}
  }
  const T={...THREE,TextureLoader};
  const window=external?{NeonFabricTextures:{cloth:'cloth',denim:'denim'},NeonTitanShirtArtwork:'titan'}:{};
  const context=vm.createContext({window,document});
  for(const file of ['organic-mesh.js','fighter-faces.js','fighters-human.js'])vm.runInContext(fs.readFileSync(require.resolve('../'+file),'utf8'),context,{filename:file});
  function build(id){const root=new THREE.Group(),stance=new THREE.Group();root.add(stance);return window.NeonHumans.build(T,{root,stance,color:0x74e6e1},id);}
  function complete(url){for(const load of loads.filter(l=>l.url===url)){load.texture.image={width:1254,height:1254};load.onLoad?.(load.texture);}}
  function maps(rig){const result=new Set();rig.root.traverse(part=>{for(const mat of [].concat(part.material||[]))if(mat.map)result.add(mat.map);});return result;}
  return {build,complete,maps,loads,canvases,window,T};
}

test('both player slots share the Titan artwork while their materials stay independent',()=>{
  const h=harness(),a=h.build('titan'),b=h.build('titan');
  const artwork=h.loads.filter(load=>load.url==='titan');
  assert.equal(artwork.length,1,'the two Titan rigs must use one image request and GPU texture');
  assert.equal(artwork[0].texture.anisotropy,1,'sharing must preserve the original decal sampling cost');
  assert(h.maps(a).has(artwork[0].texture));assert(h.maps(b).has(artwork[0].texture));
  const materials=rig=>{const result=[];rig.root.traverse(p=>{if(p.material?.map===artwork[0].texture)result.push(p.material);});return result;};
  assert.notEqual(materials(a)[0],materials(b)[0]);
  materials(a)[0].roughness=.4;assert.equal(materials(b)[0].roughness,1);
});

test('full human roster shares procedural surfaces and keeps the atlas stable during async image loading',()=>{
  const h=harness(),ids=['veterano','titan','mimico','pixel'];
  const first=ids.map(h.build),firstCanvases=h.canvases.length;
  const second=ids.map(h.build);
  assert.equal(h.canvases.length,firstCanvases,'second player slot must not generate duplicate procedural textures');
  assert.equal(h.canvases.filter(c=>c.width===512&&c.height===512).length,0,'external denim does not need a procedural denim allocation');
  const cloth=Array.from(h.maps(first[0])).find(t=>t.image?.width===256&&t.image?.height===256);
  assert(cloth);for(const rig of first.concat(second))assert(h.maps(rig).has(cloth));
  h.complete('cloth');assert.equal(cloth.image.width,1254);assert.equal(cloth.image.height,1254);
  for(const rig of first.concat(second))assert(h.maps(rig).has(cloth),'async atlas replacement must update every rig');
  assert.equal(h.loads.filter(l=>l.url==='cloth').length,1);assert.equal(h.loads.filter(l=>l.url==='denim').length,1);
});

test('offline procedural fallbacks remain shared with their original dimensions',()=>{
  const h=harness(false),a=h.build('mimico'),b=h.build('mimico');
  const surfaces=h.maps(a);
  for(const map of surfaces)assert(h.maps(b).has(map));
  assert.equal(h.canvases.filter(c=>c.width===256&&c.height===256).length,1);
  assert.equal(h.canvases.filter(c=>c.width===512&&c.height===512).length,1);
  assert.equal(h.loads.length,0);
});

test('cloth fallback survives an unavailable source and a later skin image does not erase loaded cloth',()=>{
  const h=harness();h.window.NeonFabricTextures.skin='skin';
  const a=h.build('mimico'),b=h.build('mimico');
  const cloth=Array.from(h.maps(a)).find(t=>t.image?.width===256);
  assert(cloth);assert(h.maps(b).has(cloth));
  h.complete('skin');assert.equal(cloth.image.width,256,'missing cloth retains the procedural fallback');
  h.complete('cloth');assert.equal(cloth.image.width,1254);
  assert.equal(cloth.image.draws.length,2,'atlas contains the cloth and skin patch');
  assert.equal(cloth.image.draws[0][0],h.loads.find(l=>l.url==='cloth').texture.image);
  assert.equal(cloth.image.draws[1][0],h.loads.find(l=>l.url==='skin').texture.image);
});
