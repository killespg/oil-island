'use strict';
// CPU-only inventory of the actual builders and scene batching contract.
// No WebGL or browser: counts are upper bounds before frustum/occlusion culling,
// not measured GPU draw calls or an FPS benchmark. Canvas callbacks still run
// so procedural random choices match the runtime, but no pixels are rasterized.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const T = require('../vendor/three.min.js');
const root = path.join(__dirname, '..');
const ids = ['island', 'nightclub', 'seaside', 'helipad'];
const bounds = {island:13.5, nightclub:12, seaside:14, helipad:13};

function sourceSection(source, first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert(start >= 0 && end > start, `scene section remains identifiable: ${first}`);
  return source.slice(start, end);
}
function canvasContext() {
  const gradient = {addColorStop(){}};
  return new Proxy({createLinearGradient:()=>gradient, createRadialGradient:()=>gradient}, {
    get(target, key) { return key in target ? target[key] : ()=>{}; },
    set(target, key, value) { target[key] = value; return true; }
  });
}
function makeArena(id, {finish = true} = {}) {
  assert(ids.includes(id), 'known arena');
  const sceneSource = fs.readFileSync(path.join(root, 'scene.js'), 'utf8');
  const scope = {
    window:{}, T, PI:Math.PI, clamp:T.MathUtils.clamp,
    renderer:{capabilities:{getMaxAnisotropy:()=>8}},
    document:{createElement:()=>({getContext:()=>canvasContext()})}
  };
  vm.createContext(scope);
  vm.runInContext(sourceSection(sceneSource, '    var seed = 385401;', '    // Every environment'), scope);
  vm.runInContext(sourceSection(sceneSource, '    var blackSteel=', '    function buildArena(id)'), scope);
  vm.runInContext(fs.readFileSync(path.join(root, `arena-${id}.js`), 'utf8'), scope);
  const ctx = {THREE:T,bounds:bounds[id]};
  for (const key of ['material','neon','mesh','box','rod','texture','glow','ring','makeSign','random']) ctx[key] = scope[key];
  const arena = scope.window.OilArenaBuilders[id](ctx);
  const authored = inventory(arena.group, {staticRoots:[arena.detail]});
  if (finish) scope.finishArena(arena, id);
  return {arena, authored, finish:()=>scope.finishArena(arena, id), batchMeshes:scope.batchMeshes};
}
function inventory(group, {visibleOnly = false, staticRoots = []} = {}) {
  const result = {objects:0, meshes:0, staticMeshes:0, dynamicMeshes:0, instancedMeshes:0,
    instances:0, sprites:0, lights:0, transparentMeshes:0, transparentDoubleSidedMeshes:0,
    drawCallsUpperBound:0, triangles:0, materials:0, geometries:0, geometryBytes:0, texturePixels:0};
  const materials = new Set(), geometries = new Set(), textures = new Set(), arrays = new Set();
  function visit(o, dynamic, visible) {
    dynamic = dynamic || (!!o.userData.keepDynamic && !staticRoots.includes(o));
    visible = visible && o.visible;
    if (visibleOnly && !visible) return;
    result.objects++;
    if (o.isLight) result.lights++;
    if (o.isMesh || o.isSprite) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value && value.isTexture) textures.add(value);
      }
      if (o.isSprite) { result.sprites++; result.drawCallsUpperBound++; }
      if (o.isMesh) {
        result.meshes++; result[dynamic?'dynamicMeshes':'staticMeshes']++;
        if (o.isInstancedMesh) {result.instancedMeshes++;result.instances += o.count;}
        const geo = o.geometry;
        geometries.add(geo);
        const count = geo.index ? geo.index.count : geo.attributes.position.count;
        const elements = Math.max(0, Math.min(count - geo.drawRange.start, geo.drawRange.count));
        result.triangles += elements / 3 * (o.isInstancedMesh ? o.count : 1);
        if (mats.some(m=>m.transparent)) result.transparentMeshes++;
        const passCount = mat=>mat.transparent && mat.side===T.DoubleSide && !mat.forceSinglePass ? 2 : 1;
        if (mats.some(m=>passCount(m)===2)) result.transparentDoubleSidedMeshes++;
        result.drawCallsUpperBound += Array.isArray(o.material)
          ? geo.groups.reduce((sum,part)=>sum+passCount(mats[part.materialIndex]),0) : passCount(mats[0]);
      }
    }
    for (const child of o.children) visit(child, dynamic, visible);
  }
  visit(group, false, true);
  for (const geo of geometries) {
    for (const attr of Object.values(geo.attributes)) arrays.add(attr.array);
    if (geo.index) arrays.add(geo.index.array);
  }
  for (const array of arrays) result.geometryBytes += array.byteLength;
  for (const texture of textures) result.texturePixels += (texture.image?.width || 0) * (texture.image?.height || 0);
  result.materials=materials.size;result.geometries=geometries.size;
  return result;
}
function audit() {
  const arenas = {};
  for (const id of ids) {
    const {arena, authored} = makeArena(id);
    const batched = inventory(arena.group, {staticRoots:[arena.detail]});
    arena.detail.visible=false;
    const withoutOptionalDetail = inventory(arena.group, {visibleOnly:true, staticRoots:[arena.detail]});
    arena.detail.visible=true;
    arenas[id]={bounds:arena.bounds,authored,batched,withoutOptionalDetail,
      dynamicRoots:[]};
    arena.group.traverse(o=>{
      if (!o.userData.keepDynamic || o===arena.detail) return;
      let ancestor=o.parent;
      while (ancestor && ancestor!==arena.group) {if(ancestor.userData.keepDynamic)return;ancestor=ancestor.parent;}
      const counts=inventory(o);
      arenas[id].dynamicRoots.push({name:o.name||o.type,meshes:counts.meshes,triangles:counts.triangles});
    });
  }
  return {scope:'CPU scene inventory; no culling, renderer, global lights, fighters, particles or GPU timing', arenas};
}
module.exports={T,ids,bounds,makeArena,inventory,audit};
if(require.main===module)process.stdout.write(`${JSON.stringify(audit(),null,2)}\n`);
